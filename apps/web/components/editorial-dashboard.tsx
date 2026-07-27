"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import {
  allocationSummary,
  positiveAllocationEntries,
  positiveBalanceSymbols,
} from "../lib/portfolio-display";
import { BrainMap } from "./brain-map";

type BrainOption = {
  label: string;
  instruction: string;
  value: -2 | -1 | 0 | 1 | 2;
};
export type EditorialPiece = {
  id: number;
  owner: string;
  unowned: boolean;
  price: string;
  preset: number;
  weight: number;
  affinity: string;
  name: string;
  glyph: string;
  tagline: string;
  lore: string;
  crew: string;
  kind: string;
  visual: string;
  category: string;
  options: [BrainOption, BrainOption, BrainOption, BrainOption, BrainOption];
  data: string[];
  tags: string[];
};

type CycleInstruction = {
  pieceId: number;
  character?: string;
  affinity: string;
  mood?: string;
  intensity?: number;
  instruction: string;
  influenceBps: number;
};

type MemeCastItem = {
  pieceId: number;
  role: "spokesperson" | "rival" | "scapegoat" | "support";
  mood: string;
  influenceBps: number;
  line: string;
};

type MemeRecap = {
  version: 1;
  headline: string;
  spokespersonPieceId: number;
  rivalPieceId?: number;
  scapegoatPieceId?: number;
  cast: MemeCastItem[];
  shortText: string;
  longText: string;
  disclaimer: string;
};

type CycleRecord = {
  schemaVersion?: number;
  at: string;
  source: string;
  rationale?: string;
  allocation: Record<string, number>;
  txHash: string | null;
  redemptionTxHash?: string | null;
  block?: string;
  marketAsOf?: string;
  inputHash?: string;
  promptHash?: string;
  executionStatus?: "executed" | "held";
  contextFreshness?: {
    requiredStateFresh: boolean;
    requiredQuotesFresh: boolean;
    holdRequired: boolean;
    reasons: string[];
  };
  portfolioBefore?: {
    navUsdWad: string;
    navPerShareWad: string;
    weightsBps: Record<string, number>;
    return24hBps?: number | null;
  };
  portfolioAfter?: {
    navUsdWad: string;
    navPerShareWad: string;
    weightsBps: Record<string, number>;
  };
  decisionContext?: {
    schemaVersion?: number;
    tokenBudget: { estimatedTokens: number; detailedCycleLimit: number };
    recentCycles: unknown[];
    dataAvailability: Record<string, boolean>;
    sourceManifest: { source: string; valid: boolean }[];
    accounting?: {
      totalPnlUsdWad: string;
      turnover24hBps: number | null;
    };
    benchmarks?: {
      symbol: string;
      features: {
        return24hBps: number | null;
        coverage: {
          sampleCount: number;
          spanMinutes: number;
          reasons: string[];
        };
      } | null;
    }[];
    decisionOutcomes?: unknown;
  };
  characterRosterVersion?: number;
  memeRecap?: MemeRecap;
  brain?: {
    catalogVersion?: number;
    activePieces: number;
    inactivePieces: number;
    activeNonNeutralInstructions: CycleInstruction[];
  };
};

export type EditorialData = {
  nav: string;
  navPerShare: string;
  navChange24hBps: number | null;
  supply: string;
  shares: string;
  holdings: Record<string, string>;
  holdingValues: Record<string, string>;
  currentWeightsBps: Record<string, number>;
  oracle: {
    chainTimestamp: number;
    oldestTimestamp: number;
    fresh: boolean;
    assets: Record<
      string,
      { priceUsdWad: string; updatedAt: number; valid: boolean }
    >;
  };
  previews: {
    deposit: {
      gross: string;
      fee: string;
      netInvestment: string;
      expectedShares: string;
    };
    redeem: {
      shares: string;
      gross: string;
      fee: string;
      net: string;
      immediate: boolean;
    };
  };
  pieces: EditorialPiece[];
  rewards: { pending: string };
  redemption: { pendingRequestId: string };
  catalog: { version: number; hash: string };
  dataAvailability: Record<string, boolean>;
  latestCycle: CycleRecord | null;
  cycleHistory: CycleRecord[];
  marketData: {
    configured: boolean;
    worker: {
      last_succeeded_at?: string | null;
      last_error?: string | null;
      duration_ms?: number | null;
    } | null;
    coverage: {
      symbol: string;
      count: number;
      oldest: string | null;
      newest: string | null;
    }[];
  };
  marketFeatures: Record<
    string,
    {
      return1hBps: number | null;
      return24hBps: number | null;
      coverage: { sampleCount: number; spanMinutes: number; reasons: string[] };
    }
  >;
  portfolioAccounting: {
    realizedPnlUsdWad: string;
    unrealizedPnlUsdWad: string;
    totalPnlUsdWad: string;
    timeWeightedReturn1hBps: number | null;
    timeWeightedReturn24hBps: number | null;
    timeWeightedReturn7dBps: number | null;
    timeWeightedReturn30dBps: number | null;
    turnover24hBps: number | null;
    deposits24hUsdWad: string;
    redemptions24hUsdWad: string;
    fees24hUsdWad: string;
    positions: Record<
      string,
      { contributionUsdWad: string; basisOrigin: string }
    >;
  };
  benchmarks: {
    symbol: string;
    executable: false;
    features: {
      return24hBps?: number | null;
      coverage?: { reasons: string[] };
    } | null;
  }[];
};

const money = (value: string | bigint) =>
  Number(formatUnits(BigInt(value), 18)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
const money4 = (value: string | bigint) =>
  Number(formatUnits(BigInt(value), 18)).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
const oracleAge = (timestamp: number, referenceTimestamp: number) => {
  const seconds = Math.max(0, referenceTimestamp - timestamp);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
};
const short = (value: string) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "";
const percentBps = (value: number | null | undefined) =>
  value == null
    ? "Warming up"
    : `${value >= 0 ? "+" : ""}${(value / 100).toFixed(2)}%`;

function calculateCountdown() {
  const next = new Date();
  next.setMinutes(60, 0, 0);
  const minutes = Math.max(
    0,
    Math.floor((next.getTime() - Date.now()) / 60000),
  );
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor((next.getTime() - Date.now()) / 1000) % 60).padStart(2, "0")}`;
}

export function EditorialDashboard({
  data,
  account,
  message,
  dark,
  screen,
  selectedId,
  amount,
  setAmount,
  setScreen,
  setSelectedId,
  onToggleTheme,
  onFaucet,
  onDeposit,
  onRedeem,
  onBuy,
  onPreset,
  onClaim,
  onCancelRedemption,
}: {
  data: EditorialData | null;
  account: string | null;
  message: string;
  dark: boolean;
  screen: "Brain" | "Basket" | "Decisions";
  selectedId: number;
  amount: string;
  setAmount: (value: string) => void;
  setScreen: (screen: "Brain" | "Basket" | "Decisions") => void;
  setSelectedId: (pieceId: number) => void;
  onToggleTheme: () => void;
  onFaucet: () => void;
  onDeposit: () => void;
  onRedeem: () => void;
  onBuy: (piece: EditorialPiece) => void;
  onPreset: (piece: EditorialPiece, preset: number) => void;
  onClaim: () => void;
  onCancelRedemption: () => void;
}) {
  const [countdownText, setCountdownText] = useState("--:--");
  const [selectedCycleHash, setSelectedCycleHash] = useState<string | null>(
    null,
  );
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => {
    const update = () => setCountdownText(calculateCountdown());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const cycle = query.get("cycle");
    if (query.get("view") === "decisions") setScreen("Decisions");
    if (cycle) setSelectedCycleHash(cycle);
  }, [setScreen]);
  useEffect(() => {
    if (!window.localStorage.getItem("mdb-onboarding-seen-v1")) {
      setShowGuide(true);
    }
  }, []);
  const selected =
    data?.pieces.find((piece) => piece.id === selectedId) ?? data?.pieces[0];
  const mine = Boolean(
    selected &&
    account &&
    selected.owner.toLowerCase() === account.toLowerCase(),
  );
  const owned =
    data?.pieces.filter(
      (piece) => account && piece.owner.toLowerCase() === account.toLowerCase(),
    ).length ?? 0;
  const latestPreferences =
    data?.latestCycle?.brain?.activeNonNeutralInstructions ?? [];
  const selectedActive =
    selected?.data.every(
      (dependency) => data?.dataAvailability[dependency] === true,
    ) ?? false;
  const latestAllocation = data?.latestCycle?.allocation ?? { USDG: 10000 };
  const decisionHistory =
    data?.cycleHistory ?? (data?.latestCycle ? [data.latestCycle] : []);
  const selectedCycle =
    decisionHistory.find((cycle) => cycle.txHash === selectedCycleHash) ??
    data?.latestCycle ??
    null;
  const selectedPreferences =
    selectedCycle?.brain?.activeNonNeutralInstructions ?? [];
  const selectedAllocation = selectedCycle?.allocation ?? { USDG: 10000 };
  const selectedMeme = selectedCycle?.memeRecap;
  const characterStats = decisionHistory.reduce<
    Record<
      number,
      { appearances: number; spokespersons: number; blame: number }
    >
  >((stats, cycle) => {
    for (const cast of cycle.memeRecap?.cast ?? []) {
      const current = stats[cast.pieceId] ?? {
        appearances: 0,
        spokespersons: 0,
        blame: 0,
      };
      current.appearances += 1;
      if (cast.role === "spokesperson") current.spokespersons += 1;
      if (cast.role === "scapegoat") current.blame += 1;
      stats[cast.pieceId] = current;
    }
    return stats;
  }, {});
  const navSeries = [...decisionHistory]
    .reverse()
    .flatMap((cycle) =>
      cycle.portfolioAfter?.navPerShareWad
        ? [Number(formatUnits(BigInt(cycle.portfolioAfter.navPerShareWad), 18))]
        : [],
    );
  const navMinimum = navSeries.length ? Math.min(...navSeries) : 0;
  const navMaximum = navSeries.length ? Math.max(...navSeries) : 0;
  const navPoints = navSeries
    .map((value, index) => {
      const x =
        navSeries.length > 1 ? (index / (navSeries.length - 1)) * 100 : 50;
      const y =
        navMaximum > navMinimum
          ? 46 - ((value - navMinimum) / (navMaximum - navMinimum)) * 40
          : 26;
      return `${x},${y}`;
    })
    .join(" ");

  function decisionUrl(cycle: CycleRecord) {
    const url = new URL(
      process.env.NEXT_PUBLIC_APP_URL || window.location.origin,
    );
    url.searchParams.set("view", "decisions");
    if (cycle.txHash) url.searchParams.set("cycle", cycle.txHash);
    return url.toString();
  }

  async function copyRecap(cycle: CycleRecord) {
    if (!cycle.memeRecap) return;
    await navigator.clipboard.writeText(
      `${cycle.memeRecap.longText}\n\n${decisionUrl(cycle)}\n\n${cycle.memeRecap.disclaimer}`,
    );
  }

  function openShare(
    cycle: CycleRecord,
    network: "x" | "farcaster" | "telegram",
  ) {
    if (!cycle.memeRecap) return;
    const url = decisionUrl(cycle);
    const text = cycle.memeRecap.shortText.slice(
      0,
      network === "x" ? 230 : 300,
    );
    const target =
      network === "x"
        ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
        : network === "farcaster"
          ? `https://warpcast.com/~/compose?text=${encodeURIComponent(`${text}\n${url}`)}`
          : `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    const popup = window.open(target, "_blank", "noopener,noreferrer");
    if (!popup) void copyRecap(cycle);
  }

  async function downloadCard(cycle: CycleRecord) {
    if (!cycle.memeRecap) return;
    const spokesperson =
      data?.pieces.find(
        (piece) => piece.id === cycle.memeRecap?.spokespersonPieceId,
      ) ?? data?.pieces[0];
    await renderDecisionCard(cycle, spokesperson);
  }

  function closeGuide() {
    window.localStorage.setItem("mdb-onboarding-seen-v1", "true");
    setShowGuide(false);
  }

  return (
    <main className={`editorial-app ${dark ? "editorial-dark" : ""}`}>
      <header className="editorial-header">
        <button
          className="editorial-brand"
          onClick={() => setScreen("Brain")}
          aria-label="MillionDollar Brain home"
        >
          <span className="brain-mark">42</span>
          <span>MILLIONDOLLAR BRAIN</span>
        </button>
        <nav aria-label="Primary navigation">
          {(["Brain", "Basket", "Decisions"] as const).map((item) => (
            <button
              key={item}
              className={screen === item ? "active" : ""}
              onClick={() => setScreen(item)}
            >
              {item}
            </button>
          ))}
          <button
            className="nav-help"
            aria-expanded={showGuide}
            aria-controls="how-it-works"
            onClick={() => setShowGuide((current) => !current)}
          >
            How it works
          </button>
        </nav>
        <div className="market-strip">
          <span className="share-price">
            MDBS NAV price ${data ? money4(data.navPerShare) : "1.0000"}
          </span>
          <span className="healthy">● System healthy</span>
          <span>
            Next decision <b>{countdownText}</b>
          </span>
          <button className="theme-control" onClick={onToggleTheme}>
            {dark ? "Light" : "Dark"}
          </button>
          <button className="primary-action" onClick={onFaucet}>
            {account ? "Fund dev wallet" : "Connect wallet"}
          </button>
        </div>
      </header>

      {message !== "Local devnet connected." && (
        <div className="editorial-banner">{message}</div>
      )}

      {showGuide && (
        <HowItWorks
          onClose={closeGuide}
          onNavigate={(destination) => {
            setScreen(destination);
            closeGuide();
          }}
        />
      )}

      {screen === "Brain" && (
        <div className="editorial-page">
          <section className="screen-purpose" aria-label="About the Brain">
            <span>YOU ARE HERE: THE STEERING LAYER</span>
            <p>
              Brain-piece owners choose preset moods. Every hour, all 42 choices
              become one constrained brief for the AI.
            </p>
          </section>
          <section className="brain-pulse-strip" aria-label="Brain pulse">
            <div className="pulse-headline">
              <p className="section-kicker">⌁ BRAIN PULSE</p>
              <h1>
                {data?.latestCycle?.memeRecap?.headline ??
                  (latestPreferences.length
                    ? pulseHeadline(latestPreferences)
                    : "Balanced, watchful, waiting for a signal")}
              </h1>
            </div>
            <PulseRow
              label="Strongest preferences"
              value={
                latestPreferences
                  .slice(0, 3)
                  .map((item) => item.character ?? item.affinity)
                  .join(", ") || "Neutral starting brain"
              }
            />
            <PulseRow
              label="Data"
              value={`${data?.latestCycle?.brain?.activePieces ?? 0} active · ${data?.latestCycle?.brain?.inactivePieces ?? 0} inactive`}
            />
            <PulseRow
              label="Latest result"
              value={data?.latestCycle ? "REBALANCE" : "AWAITING CYCLE"}
              strong
            />
            <PulseRow label="Next cycle" value={countdownText} strong />
          </section>

          <section className="brain-primary-grid">
            <BrainMap
              pieces={data?.pieces ?? []}
              selectedId={selectedId}
              account={account}
              onSelect={setSelectedId}
            />
            {selected && (
              <aside
                className="piece-ledger piece-inspector"
                id="piece-inspector"
                aria-live="polite"
                aria-label={`Selected brain piece: ${selected.name}`}
              >
                <div className="piece-ledger-head">
                  <span className="detail-portrait">
                    <img
                      src={`/brain-art/v4/piece-${String(selected.id).padStart(2, "0")}.webp`}
                      alt=""
                      aria-hidden="true"
                    />
                  </span>
                  <div>
                    <p className="section-kicker">
                      PIECE {String(selected.id).padStart(2, "0")} ·{" "}
                      {selected.crew}
                    </p>
                    <h2>{selected.name}</h2>
                    <p>
                      Steers {selected.affinity} · {selected.weight / 100}% of
                      the brain&apos;s influence
                    </p>
                    <p className="character-form">
                      {selected.kind} · {selected.visual}
                    </p>
                  </div>
                  <span
                    className={
                      selectedActive ? "status-active" : "status-inactive"
                    }
                  >
                    {selectedActive ? "ACTIVE DATA" : "PARTLY INACTIVE"}
                  </span>
                </div>
                <p className="piece-tagline">{selected.tagline}</p>
                <p className="piece-lore">“{selected.lore}”</p>
                <div className="current-mood">
                  <span>Current setting (mood)</span>
                  <strong>{selected.options[selected.preset].label}</strong>
                </div>
                <div className="mood-ledger">
                  {selected.options.map((choice, index) => (
                    <button
                      key={choice.label}
                      className={index === selected.preset ? "selected" : ""}
                      disabled={!mine}
                      onClick={() => onPreset(selected, index)}
                      title={
                        mine
                          ? choice.instruction
                          : "Buy this piece to change its mood"
                      }
                    >
                      <span>
                        {choice.value > 0 ? `+${choice.value}` : choice.value}
                      </span>
                      <b>{choice.label}</b>
                    </button>
                  ))}
                </div>
                <div className="bounded-effect">
                  <span>WHAT THIS TELLS THE AI NEXT CYCLE</span>
                  <p>{selected.options[selected.preset].instruction}</p>
                </div>
                <div className="piece-actions">
                  <div>
                    <span>
                      {selected.unowned
                        ? "Unowned · initial sale to Creator DAO"
                        : `Owner ${short(selected.owner)}`}
                    </span>
                    <span>
                      Next price ${money(selected.price)} · Rewards $
                      {data ? money(data.rewards.pending) : "0"}
                    </span>
                    <small>
                      This piece is always for sale. Each completed purchase
                      raises its next price by 20%.
                    </small>
                  </div>
                  {mine ? (
                    <button
                      className="primary-action"
                      disabled={!data || BigInt(data.rewards.pending) === 0n}
                      onClick={onClaim}
                    >
                      Claim ${data ? money(data.rewards.pending) : "0"} rewards
                    </button>
                  ) : (
                    <button
                      className="primary-action"
                      onClick={() => onBuy(selected)}
                    >
                      {selected.unowned ? "Buy piece" : "Buy next"} · $
                      {money(selected.price)}
                    </button>
                  )}
                </div>
              </aside>
            )}
          </section>
        </div>
      )}

      {screen === "Basket" && (
        <div className="editorial-page">
          <section className="page-title-row">
            <div>
              <p className="section-kicker">BASKET LEDGER</p>
              <h1>The portfolio, without the mystery.</h1>
              <p className="page-explainer">
                Buy MDBS with USDG to own a proportional share of the basket.
                Sell MDBS to receive USDG based on the basket&apos;s live value.
              </p>
            </div>
            <div className="title-actions">
              <button
                className="primary-action"
                onClick={() =>
                  document
                    .getElementById("buy-mdbs")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              >
                Buy MDBS
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("sell-mdbs")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              >
                Sell MDBS
              </button>
            </div>
          </section>
          <section className="basket-overview-grid">
            <article className="large-ledger-card">
              <div className="snapshot-metrics nav-metrics">
                <Metric
                  label="MDBS NAV price"
                  value={`$${data ? money4(data.navPerShare) : "—"}`}
                />
                <Metric
                  label="24-hour change"
                  value={
                    data?.navChange24hBps == null
                      ? "Collecting history"
                      : `${data.navChange24hBps >= 0 ? "+" : ""}${(data.navChange24hBps / 100).toFixed(2)}%`
                  }
                />
                <Metric
                  label="Basket NAV"
                  value={`$${data ? money(data.nav) : "—"}`}
                />
                <Metric
                  label="Circulating MDBS"
                  value={data ? money(data.supply) : "—"}
                />
                <Metric
                  label="Oracle"
                  value={
                    data?.oracle.fresh
                      ? `Fresh · ${oracleAge(data.oracle.oldestTimestamp, data.oracle.chainTimestamp)} old`
                      : "Stale · actions paused"
                  }
                />
              </div>
              <h2>Current holdings and Ornith targets</h2>
              <div className="holding-table">
                {data &&
                  positiveBalanceSymbols(data.holdings).map((symbol) => {
                    const value = data.holdingValues[symbol] ?? "0";
                    const current =
                      (Number(value) / Math.max(1, Number(data.nav))) * 100;
                    const target = (latestAllocation[symbol] ?? 0) / 100;
                    return (
                      <div
                        key={symbol}
                        data-testid="basket-holding-row"
                        data-symbol={symbol}
                      >
                        <b>{symbol}</b>
                        <span>{current.toFixed(2)}%</span>
                        <i>
                          <u style={{ width: `${current}%` }} />
                        </i>
                        <em>{target.toFixed(2)}% target</em>
                      </div>
                    );
                  })}
              </div>
            </article>
            <aside className="transaction-card">
              <p className="section-kicker">YOUR POSITION</p>
              <h2>{data ? money(data.shares) : "0"} MDBS</h2>
              <p>
                {owned} brain pieces · $
                {data ? money(data.rewards.pending) : "0"} claimable
              </p>
              <p className="action-explainer">
                MDBS is the token that represents your share of this portfolio.
                Buying MDBS adds USDG to the basket and buys its current assets.
                Selling MDBS sells your share and pays you in USDG.
              </p>
              <section className="position-action" id="buy-mdbs">
                <div className="position-action-heading">
                  <span>1</span>
                  <div>
                    <h3>Buy MDBS</h3>
                    <p>Pay with USDG and receive basket-share tokens.</p>
                  </div>
                </div>
                <label>
                  You pay
                  <div className="token-input">
                    <input
                      aria-label="USDG to spend"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                    <b>USDG</b>
                  </div>
                </label>
                <button
                  className="primary-action full-button"
                  onClick={onDeposit}
                >
                  Buy MDBS
                </button>
                {data && (
                  <div className="trade-preview" aria-label="Buy MDBS preview">
                    <b>You receive approximately</b>
                    <strong>
                      {money(data.previews.deposit.expectedShares)} MDBS
                    </strong>
                    <span>
                      You pay ${money(data.previews.deposit.gross)} USDG · buy
                      fee ${money(data.previews.deposit.fee)}
                    </span>
                    <span>
                      ${money(data.previews.deposit.netInvestment)} enters the
                      basket at ${money4(data.navPerShare)} per MDBS
                    </span>
                    <span>Minimum received: 99% of this preview</span>
                    <small>Your USDG buys:</small>
                    {Object.entries(data.currentWeightsBps)
                      .filter(([, weight]) => weight > 0)
                      .map(([symbol, weight]) => (
                        <small key={symbol}>
                          {symbol}: approximately $
                          {money(
                            (BigInt(data.previews.deposit.netInvestment) *
                              BigInt(weight)) /
                              10_000n,
                          )}{" "}
                          ({(weight / 100).toFixed(2)}%)
                        </small>
                      ))}
                  </div>
                )}
              </section>
              <section className="position-action" id="sell-mdbs">
                <div className="position-action-heading">
                  <span>2</span>
                  <div>
                    <h3>Sell MDBS</h3>
                    <p>Sell basket-share tokens and receive USDG.</p>
                  </div>
                </div>
                {data && BigInt(data.redemption.pendingRequestId) > 0n ? (
                  <button className="full-button" onClick={onCancelRedemption}>
                    Cancel queued sale #{data.redemption.pendingRequestId}
                  </button>
                ) : (
                  <button className="full-button" onClick={onRedeem}>
                    Sell 50% of my MDBS
                  </button>
                )}
                {data && BigInt(data.previews.redeem.shares) > 0n && (
                  <div className="trade-preview" aria-label="Sell MDBS preview">
                    <b>You receive approximately</b>
                    <strong>{money(data.previews.redeem.net)} USDG</strong>
                    <span>
                      You sell {money(data.previews.redeem.shares)} MDBS ·
                      current value ${money(data.previews.redeem.gross)}
                    </span>
                    <span>
                      Sell fee ${money(data.previews.redeem.fee)} · net $
                      {money(data.previews.redeem.net)} USDG
                    </span>
                    <span>
                      Timing:{" "}
                      {data.previews.redeem.immediate
                        ? "immediate"
                        : "queued until the basket can sell safely"}
                    </span>
                  </div>
                )}
              </section>
              <section className="position-action claim-action">
                <div className="position-action-heading">
                  <span>3</span>
                  <div>
                    <h3>Claim rewards</h3>
                    <p>Collect fees earned by brain pieces you own.</p>
                  </div>
                </div>
                <button
                  className="full-button"
                  disabled={!data || BigInt(data.rewards.pending) === 0n}
                  onClick={onClaim}
                >
                  Claim ${data ? money(data.rewards.pending) : "0"} USDG
                </button>
              </section>
            </aside>
          </section>
          {data && (
            <section
              className="portfolio-performance"
              aria-label="Portfolio performance and official market history"
            >
              <div className="performance-heading">
                <div>
                  <p className="section-kicker">PERFORMANCE &amp; DATA</p>
                  <h2>Returns separated from cash flows.</h2>
                </div>
                <span>
                  {data.marketData.worker?.last_error
                    ? "Collector degraded"
                    : "Official collector healthy"}
                </span>
              </div>
              <div className="performance-grid">
                <article className="nav-history-chart">
                  <div>
                    <b>MDBS NAV history</b>
                    <small>{navSeries.length} recorded decision points</small>
                  </div>
                  <svg
                    viewBox="0 0 100 52"
                    role="img"
                    aria-label="MDBS NAV price history"
                    preserveAspectRatio="none"
                  >
                    <polyline points={navPoints} />
                  </svg>
                  <div className="performance-metrics">
                    <Metric
                      label="1-hour TWR"
                      value={percentBps(
                        data.portfolioAccounting.timeWeightedReturn1hBps,
                      )}
                    />
                    <Metric
                      label="24-hour TWR"
                      value={percentBps(
                        data.portfolioAccounting.timeWeightedReturn24hBps,
                      )}
                    />
                    <Metric
                      label="Turnover 24h"
                      value={percentBps(
                        data.portfolioAccounting.turnover24hBps,
                      )}
                    />
                  </div>
                </article>
                <article className="pnl-ledger">
                  <b>Tracked accounting</b>
                  <span>
                    Realized P&amp;L $
                    {money(data.portfolioAccounting.realizedPnlUsdWad)}
                  </span>
                  <span>
                    Unrealized P&amp;L $
                    {money(data.portfolioAccounting.unrealizedPnlUsdWad)}
                  </span>
                  <span>
                    MDBS buys 24h $
                    {money(data.portfolioAccounting.deposits24hUsdWad)}
                  </span>
                  <span>
                    MDBS sells 24h $
                    {money(data.portfolioAccounting.redemptions24hUsdWad)}
                  </span>
                  <small>
                    Existing positions begin from a labelled activation mark;
                    pre-activation P&amp;L is never invented.
                  </small>
                </article>
                <article className="benchmark-ledger">
                  <b>Reference only</b>
                  {data.benchmarks.map((benchmark) => (
                    <span key={benchmark.symbol}>
                      {benchmark.symbol}
                      <em>{percentBps(benchmark.features?.return24hBps)}</em>
                    </span>
                  ))}
                  <small>
                    Benchmarks can inform Ornith but cannot be held.
                  </small>
                </article>
                <article className="coverage-ledger">
                  <b>Official history warm-up</b>
                  {data.marketData.coverage.map((coverage) => (
                    <span key={coverage.symbol}>
                      {coverage.symbol}
                      <em>{coverage.count} observations</em>
                    </span>
                  ))}
                  <small>
                    Metrics activate only after their official-history threshold
                    is satisfied.
                  </small>
                </article>
              </div>
            </section>
          )}
        </div>
      )}

      {screen === "Decisions" && (
        <div className="editorial-page">
          <section className="page-title-row">
            <div>
              <p className="section-kicker">DECISION ARCHIVE</p>
              <h1>Explore every decision and execution.</h1>
              <p className="page-explainer">
                Follow the full chain of evidence: what brain owners requested,
                what the AI proposed, and what the protocol actually executed.
              </p>
            </div>
            <span className="decision-source">
              {selectedCycle?.source?.toUpperCase() ?? "NO CYCLE"}
            </span>
          </section>
          <section className="decision-history-layout">
            <aside className="decision-history" aria-label="Decision history">
              <div className="decision-history-heading">
                <div>
                  <p className="section-kicker">CYCLE HISTORY</p>
                  <h2>{decisionHistory.length} recorded</h2>
                </div>
                <span>Newest first</span>
              </div>
              <div className="decision-history-list" role="list">
                {decisionHistory.map((cycle, index) => (
                  <button
                    key={`${cycle.txHash}-${cycle.at}`}
                    type="button"
                    role="listitem"
                    data-testid="decision-history-item"
                    className={
                      selectedCycle?.txHash === cycle.txHash
                        ? "decision-history-item selected"
                        : "decision-history-item"
                    }
                    aria-current={
                      selectedCycle?.txHash === cycle.txHash
                        ? "true"
                        : undefined
                    }
                    onClick={() => setSelectedCycleHash(cycle.txHash)}
                  >
                    <span>
                      <b>
                        {index === 0
                          ? "Latest cycle"
                          : cycleTimestamp(cycle.at)}
                      </b>
                      <em>{cycle.source.toUpperCase()}</em>
                    </span>
                    <strong>{allocationSummary(cycle.allocation)}</strong>
                    <small>
                      Block {cycle.block ?? "—"} ·{" "}
                      {cycle.txHash ? short(cycle.txHash) : "HOLD"}
                    </small>
                  </button>
                ))}
                {!decisionHistory.length && (
                  <p className="decision-history-empty">
                    The first scheduled cycle will appear here.
                  </p>
                )}
              </div>
            </aside>

            <div
              className="decision-history-detail"
              data-testid="decision-history-detail"
            >
              <div className="decision-detail-heading">
                <div>
                  <p className="section-kicker">
                    {selectedCycle
                      ? cycleTimestamp(selectedCycle.at)
                      : "AWAITING FIRST CYCLE"}
                  </p>
                  <h2>
                    {selectedCycle?.source === "ai"
                      ? "AI-directed rebalance"
                      : selectedCycle
                        ? "Safe fallback rebalance"
                        : "No decision recorded"}
                  </h2>
                </div>
                {selectedCycle?.block && (
                  <span>EXECUTED · BLOCK {selectedCycle.block}</span>
                )}
              </div>
              {selectedCycle?.rationale && (
                <p className="decision-rationale">{selectedCycle.rationale}</p>
              )}
              {selectedCycle?.decisionContext && (
                <>
                  <section
                    className="decision-context-summary"
                    aria-label="AI decision package"
                  >
                    <div>
                      <span>Decision package</span>
                      <b>
                        V{selectedCycle.schemaVersion ?? 2} ·{" "}
                        {selectedCycle.inputHash?.slice(0, 12)}…
                      </b>
                    </div>
                    <div>
                      <span>Context size</span>
                      <b>
                        ~
                        {selectedCycle.decisionContext.tokenBudget.estimatedTokens.toLocaleString()}{" "}
                        tokens ·{" "}
                        {selectedCycle.decisionContext.recentCycles.length}/12
                        cycles
                      </b>
                    </div>
                    <div>
                      <span>Freshness</span>
                      <b>
                        {selectedCycle.contextFreshness?.holdRequired
                          ? "HOLD REQUIRED"
                          : "FRESH"}
                      </b>
                    </div>
                    <div>
                      <span>MDBS NAV price</span>
                      <b>
                        $
                        {selectedCycle.portfolioAfter
                          ? money4(selectedCycle.portfolioAfter.navPerShareWad)
                          : "—"}
                      </b>
                    </div>
                    <div>
                      <span>Validated sources</span>
                      <b>
                        {
                          selectedCycle.decisionContext.sourceManifest.filter(
                            (source) => source.valid,
                          ).length
                        }
                        /{selectedCycle.decisionContext.sourceManifest.length}
                      </b>
                    </div>
                  </section>
                  {selectedCycle.schemaVersion === 3 && (
                    <details className="decision-data-details">
                      <summary>Data behind this decision</summary>
                      <div>
                        <article>
                          <b>Portfolio accounting</b>
                          <span>
                            Tracked P&amp;L $
                            {selectedCycle.decisionContext.accounting
                              ? money(
                                  selectedCycle.decisionContext.accounting
                                    .totalPnlUsdWad,
                                )
                              : "—"}
                          </span>
                          <span>
                            Turnover{" "}
                            {percentBps(
                              selectedCycle.decisionContext.accounting
                                ?.turnover24hBps,
                            )}
                          </span>
                        </article>
                        {(selectedCycle.decisionContext.benchmarks ?? []).map(
                          (benchmark) => (
                            <article key={benchmark.symbol}>
                              <b>{benchmark.symbol} · reference only</b>
                              <span>
                                24h{" "}
                                {percentBps(benchmark.features?.return24hBps)}
                              </span>
                              <span>
                                {benchmark.features
                                  ? `${benchmark.features.coverage.sampleCount} samples · ${benchmark.features.coverage.spanMinutes}m span`
                                  : "Feed unavailable"}
                              </span>
                              {benchmark.features?.coverage.reasons.map(
                                (reason) => (
                                  <small key={reason}>{reason}</small>
                                ),
                              )}
                            </article>
                          ),
                        )}
                      </div>
                      <small>
                        Raw candles and old prompts are never inserted into the
                        model context. Unavailable metrics remain inactive.
                      </small>
                    </details>
                  )}
                </>
              )}
              {selectedCycle && selectedMeme && (
                <section className="brain-drama" aria-label="Brain Drama">
                  <div className="brain-drama-heading">
                    <div>
                      <p className="section-kicker">BRAIN DRAMA</p>
                      <h2>{selectedMeme.headline}</h2>
                    </div>
                    <span>
                      ROSTER v{selectedCycle.characterRosterVersion ?? 4}
                    </span>
                  </div>
                  <div className="brain-drama-cast">
                    {selectedMeme.cast.map((cast) => {
                      const piece = data?.pieces.find(
                        (candidate) => candidate.id === cast.pieceId,
                      );
                      const stats = characterStats[cast.pieceId];
                      return (
                        <article key={`${cast.role}-${cast.pieceId}`}>
                          <img
                            src={`/brain-art/v4/piece-${String(cast.pieceId).padStart(2, "0")}.webp`}
                            alt=""
                            aria-hidden="true"
                          />
                          <div>
                            <span>{cast.role.toUpperCase()}</span>
                            <h3>{piece?.name ?? `Piece ${cast.pieceId}`}</h3>
                            <blockquote>“{cast.line}”</blockquote>
                            <small>
                              {cast.mood} · {cast.influenceBps / 100}% influence
                              {stats
                                ? ` · ${stats.appearances} appearances · ${stats.spokespersons} spokesperson · ${stats.blame} blamed`
                                : ""}
                            </small>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className="brain-drama-share">
                    <p>{selectedMeme.disclaimer}</p>
                    <div>
                      <button onClick={() => void downloadCard(selectedCycle)}>
                        Download card
                      </button>
                      <button onClick={() => void copyRecap(selectedCycle)}>
                        Copy recap
                      </button>
                      <button onClick={() => openShare(selectedCycle, "x")}>
                        Share to X
                      </button>
                      <button
                        onClick={() => openShare(selectedCycle, "farcaster")}
                      >
                        Farcaster
                      </button>
                      <button
                        onClick={() => openShare(selectedCycle, "telegram")}
                      >
                        Telegram
                      </button>
                    </div>
                  </div>
                </section>
              )}
              <section className="decision-flow">
                <DecisionStage number="01" title="Brain requested" tone="brain">
                  {selectedPreferences.length ? (
                    selectedPreferences.slice(0, 6).map((item) => (
                      <p key={item.pieceId}>
                        <b>{item.character ?? item.affinity}</b>
                        <span>{item.mood ?? item.instruction}</span>
                      </p>
                    ))
                  ) : (
                    <p>
                      <b>Neutral brain</b>
                      <span>No non-neutral moods in this snapshot.</span>
                    </p>
                  )}
                  {selectedCycle?.brain && (
                    <p>
                      <b>Data status</b>
                      <span>
                        {selectedCycle.brain.activePieces} active ·{" "}
                        {selectedCycle.brain.inactivePieces} inactive
                      </span>
                    </p>
                  )}
                </DecisionStage>
                <DecisionStage number="02" title="AI proposed" tone="ornith">
                  {positiveAllocationEntries(selectedAllocation).map(
                    ([symbol, weight]) => (
                      <p
                        key={symbol}
                        data-testid="decision-target-row"
                        data-symbol={symbol}
                      >
                        <b>{symbol}</b>
                        <span>{weight / 100}% target</span>
                      </p>
                    ),
                  )}
                  <p>
                    <b>Decision source</b>
                    <span>{selectedCycle?.source.toUpperCase() ?? "—"}</span>
                  </p>
                </DecisionStage>
                <DecisionStage
                  number="03"
                  title="Contracts checked and executed"
                  tone="protocol"
                >
                  <p>
                    <b>Allowlist checked</b>
                    <span>USDG, NVDA, AAPL, ETHX only</span>
                  </p>
                  <p>
                    <b>Reserve enforced</b>
                    <span>USDG target at or above 20%</span>
                  </p>
                  <p>
                    <b>Execution block</b>
                    <span>{selectedCycle?.block ?? "Awaiting cycle"}</span>
                  </p>
                  <div className="execution-record">
                    <b>Rebalance transaction</b>
                    <code>{selectedCycle?.txHash ?? "Awaiting cycle"}</code>
                  </div>
                  {selectedCycle?.redemptionTxHash && (
                    <div className="execution-record">
                      <b>Queued MDBS sale settlement</b>
                      <code>{selectedCycle.redemptionTxHash}</code>
                    </div>
                  )}
                </DecisionStage>
              </section>
            </div>
          </section>
        </div>
      )}

      <footer className="editorial-footer">
        <span>Local Anvil simulation · no real funds</span>
        <span>
          Decision cadence: 60 minutes · Catalog v{data?.catalog.version ?? "—"}{" "}
          · Character roster v4
        </span>
      </footer>
    </main>
  );
}

function cycleTimestamp(value: string) {
  return `${value.replace("T", " ").slice(0, 19)} UTC`;
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maximumWidth: number,
  lineHeight: number,
  maximumLines: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let lineNumber = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maximumWidth && line) {
      context.fillText(line, x, y + lineNumber * lineHeight);
      line = word;
      lineNumber += 1;
      if (lineNumber >= maximumLines) return;
    } else {
      line = candidate;
    }
  }
  if (lineNumber < maximumLines) {
    context.fillText(line, x, y + lineNumber * lineHeight);
  }
}

async function renderDecisionCard(
  cycle: CycleRecord,
  spokesperson: EditorialPiece | undefined,
) {
  if (!cycle.memeRecap) return;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#f0eadc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#211d19";
  context.fillRect(0, 0, canvas.width, 76);
  context.fillStyle = "#f0eadc";
  context.font = "700 26px Georgia";
  context.fillText("MILLIONDOLLAR BRAIN", 42, 48);
  context.fillStyle = "#b54455";
  context.font = "700 18px monospace";
  context.fillText("LOCAL DEVNET · BRAIN DRAMA", 820, 46);

  if (spokesperson) {
    const image = await loadImage(
      `/brain-art/v4/piece-${String(spokesperson.id).padStart(2, "0")}.webp`,
    );
    context.fillStyle = "#ddd2bd";
    context.fillRect(42, 110, 330, 330);
    context.drawImage(image, 42, 110, 330, 330);
    context.fillStyle = "#6f1f2e";
    context.font = "700 19px monospace";
    context.fillText("SPOKESPERSON", 42, 478);
    context.fillStyle = "#211d19";
    context.font = "700 28px Georgia";
    wrapCanvasText(context, spokesperson.name, 42, 515, 340, 34, 2);
  }

  context.fillStyle = "#211d19";
  context.font = "700 46px Georgia";
  wrapCanvasText(context, cycle.memeRecap.headline, 420, 145, 730, 52, 3);
  context.font = "italic 23px Georgia";
  let quoteY = 320;
  for (const cast of cycle.memeRecap.cast.slice(0, 3)) {
    wrapCanvasText(context, `“${cast.line}”`, 420, quoteY, 710, 28, 2);
    quoteY += 72;
  }
  context.fillStyle = "#6f1f2e";
  context.font = "700 20px monospace";
  context.fillText(allocationSummary(cycle.allocation), 420, 548);
  context.fillStyle = "#675f55";
  context.font = "15px monospace";
  context.fillText(
    `${cycleTimestamp(cycle.at)} · ${cycle.txHash ? short(cycle.txHash) : "HOLD"}`,
    420,
    580,
  );
  context.font = "13px sans-serif";
  context.fillText(
    "SATIRICAL STEERING RECAP · NOT CAUSAL ATTRIBUTION OR FINANCIAL ADVICE",
    42,
    611,
  );
  const url = canvas.toDataURL("image/png");
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `milliondollar-brain-${cycle.txHash?.slice(2, 10) ?? "hold"}.png`;
  anchor.click();
}

function HowItWorks({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: (destination: "Brain" | "Basket" | "Decisions") => void;
}) {
  const [activeStep, setActiveStep] = useState(0);
  const steps: Array<{
    eyebrow: string;
    actor: string;
    title: string;
    copy: string;
    action?: string;
    destination?: "Brain" | "Basket" | "Decisions";
  }> = [
    {
      eyebrow: "01 · OWN",
      actor: "You",
      title: "Own a share of the basket",
      copy: "Buy MDBS with USDG. Each MDBS token represents your share of the entire portfolio. Sell MDBS whenever you want to exit.",
      action: "See the basket",
      destination: "Basket" as const,
    },
    {
      eyebrow: "02 · STEER",
      actor: "Brain owners",
      title: "Choose the brain's preferences",
      copy: "Each of the 42 NFT pieces controls one topic. Its owner picks one of five preset moods that becomes part of the AI's next brief.",
      action: "Explore the brain",
      destination: "Brain" as const,
    },
    {
      eyebrow: "03 · PROPOSE",
      actor: "The AI",
      title: "Propose the next allocation",
      copy: "Every hour, the model reviews all 42 moods, approved assets, free market data, and the current basket, then proposes target weights.",
    },
    {
      eyebrow: "04 · VERIFY",
      actor: "Smart contracts",
      title: "Check and execute the proposal",
      copy: "The AI never holds a wallet. Deterministic contracts enforce the asset allowlist, reserve, and risk limits before any rebalance executes.",
      action: "Audit a decision",
      destination: "Decisions" as const,
    },
  ];
  const step = steps[activeStep];

  return (
    <aside
      className="how-it-works"
      id="how-it-works"
      role="dialog"
      aria-modal="false"
      aria-labelledby="how-it-works-title"
    >
      <div className="how-intro">
        <div>
          <p className="section-kicker">QUICK TOUR · ABOUT 30 SECONDS</p>
          <h2 id="how-it-works-title">How the brain moves the basket</h2>
          <p>The community steers. The AI proposes. The contracts decide.</p>
        </div>
        <button className="guide-close" onClick={onClose}>
          Got it
        </button>
      </div>

      <div className="tour-step-tabs" aria-label="Tour steps">
        {steps.map((item, index) => (
          <button
            key={item.actor}
            className={activeStep === index ? "active" : ""}
            aria-current={activeStep === index ? "step" : undefined}
            onClick={() => setActiveStep(index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {item.actor}
          </button>
        ))}
      </div>

      <article className="tour-step-panel" aria-live="polite">
        <div className="tour-actor">{step.actor}</div>
        <span>{step.eyebrow}</span>
        <h3>{step.title}</h3>
        <p>{step.copy}</p>
        {step.action && step.destination && (
          <button
            className="tour-destination"
            onClick={() => onNavigate(step.destination!)}
          >
            {step.action} →
          </button>
        )}
      </article>

      <div className="tour-controls">
        <button
          disabled={activeStep === 0}
          onClick={() => setActiveStep((current) => Math.max(0, current - 1))}
        >
          Back
        </button>
        <span>
          {activeStep + 1} of {steps.length}
        </span>
        {activeStep < steps.length - 1 ? (
          <button
            className="tour-next"
            onClick={() =>
              setActiveStep((current) =>
                Math.min(steps.length - 1, current + 1),
              )
            }
          >
            Next
          </button>
        ) : (
          <button className="tour-next" onClick={onClose}>
            Done
          </button>
        )}
      </div>

      <details className="plain-glossary">
        <summary>Plain-language glossary</summary>
        <div>
          <span>
            <b>MDBS</b> your basket shares
          </span>
          <span>
            <b>Brain piece</b> a steering NFT
          </span>
          <span>
            <b>Mood</b> its selected preset
          </span>
          <span>
            <b>Influence</b> its fixed share of the AI brief
          </span>
          <span>
            <b>NAV</b> total basket value
          </span>
        </div>
      </details>
    </aside>
  );
}

function pulseHeadline(items: CycleInstruction[]) {
  const positive = items.filter((item) => (item.intensity ?? 0) > 0);
  if (!positive.length) return "Cautious, selective, and patiently diversified";
  return `${positive[0].mood ?? positive[0].character}, steered by ${positive[0].character ?? positive[0].affinity}`;
}

function PulseRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="pulse-row">
      <span>{label}</span>
      <strong className={strong ? "pulse-strong" : ""}>{value}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DecisionStage({
  number,
  title,
  tone,
  children,
}: {
  number: string;
  title: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`decision-stage ${tone}`}>
      <span>{number}</span>
      <h2>{title}</h2>
      <div>{children}</div>
    </article>
  );
}
