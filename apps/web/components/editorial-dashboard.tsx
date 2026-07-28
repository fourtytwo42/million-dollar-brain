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
  walletUsdg: string;
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
      currentPrice: number | null;
      return1hBps: number | null;
      return24hBps: number | null;
      coverage: { sampleCount: number; spanMinutes: number; reasons: string[] };
    }
  >;
  portfolioAccounting: {
    navUsdWad: string;
    navPerShareWad: string;
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
      return1hBps?: number | null;
      return24hBps?: number | null;
      return7dBps?: number | null;
      coverage?: {
        sampleCount: number;
        spanMinutes: number;
        reasons: string[];
      };
    } | null;
  }[];
  performanceHistory: {
    observedAt: string;
    navPerShareWad: string;
    navUsdWad: string;
    totalPnlUsdWad: string;
  }[];
  priceSync: {
    worker: {
      last_succeeded_at: string | null;
      last_error: string | null;
      details?: unknown;
    } | null;
    prices: {
      symbol: string;
      source: string;
      source_observed_at: string;
      price_wad: string;
      status: string;
    }[];
  };
};

const money = (value: string | bigint) =>
  Number(formatUnits(BigInt(value), 18)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
const usd = (value: string | bigint) =>
  Number(formatUnits(BigInt(value), 18)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const signedMoney = (value: string | bigint) => {
  const amount = BigInt(value);
  return `${amount >= 0n ? "+" : "−"}$${money(amount >= 0n ? amount : -amount)}`;
};
const inputAmount = (value: bigint) =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 6,
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
  network,
  walletSource,
  externalConnected,
  wrongChain,
  message,
  dark,
  screen,
  selectedId,
  amount,
  setAmount,
  sellAmount,
  setSellAmount,
  setScreen,
  setSelectedId,
  onToggleTheme,
  onFaucet,
  onConnectWallet,
  onDisconnectWallet,
  onSwitchWallet,
  onResetWallet,
  onCopyWallet,
  onDeposit,
  onRedeem,
  onBuy,
  onPreset,
  onClaim,
}: {
  data: EditorialData | null;
  account: string | null;
  network: {
    mode: "local" | "testnet" | "mainnet";
    chainId: number;
    networkLabel: string;
    builtInWalletEnabled: boolean;
    faucetEnabled: boolean;
  } | null;
  walletSource: "external" | "built-in";
  externalConnected: boolean;
  wrongChain: boolean;
  message: string;
  dark: boolean;
  screen: "Brain" | "Basket" | "Decisions";
  selectedId: number;
  amount: string;
  setAmount: (value: string) => void;
  sellAmount: string;
  setSellAmount: (value: string) => void;
  setScreen: (screen: "Brain" | "Basket" | "Decisions") => void;
  setSelectedId: (pieceId: number) => void;
  onToggleTheme: () => void;
  onFaucet: () => void;
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
  onSwitchWallet: () => void;
  onResetWallet: () => void;
  onCopyWallet: () => void;
  onDeposit: () => void;
  onRedeem: () => void;
  onBuy: (piece: EditorialPiece) => void;
  onPreset: (piece: EditorialPiece, preset: number) => void;
  onClaim: () => void;
}) {
  const [countdownText, setCountdownText] = useState("--:--");
  const [selectedCycleHash, setSelectedCycleHash] = useState<string | null>(
    null,
  );
  const [showGuide, setShowGuide] = useState(false);
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
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
  const chooseSellPercent = (percent: number) => {
    if (!data) return;
    setSellAmount(inputAmount((BigInt(data.shares) * BigInt(percent)) / 100n));
  };
  const latestPreferences =
    data?.latestCycle?.brain?.activeNonNeutralInstructions ?? [];
  const selectedActive =
    selected?.data.every(
      (dependency) => data?.dataAvailability[dependency] === true,
    ) ?? false;
  const latestAllocation = data?.latestCycle?.allocation ?? { USDG: 10000 };
  const holdingSlices = data
    ? positiveBalanceSymbols(data.holdings).map((symbol) => {
        const value = BigInt(data.holdingValues[symbol] ?? "0");
        const nav = BigInt(data.nav);
        return {
          symbol,
          value,
          currentPercent:
            nav > 0n ? Number((value * 1_000_000n) / nav) / 10_000 : 0,
          targetPercent: (latestAllocation[symbol] ?? 0) / 100,
        };
      })
    : [];
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
  const navSeries = (
    data?.performanceHistory.length
      ? data.performanceHistory.map((point) => point.navPerShareWad)
      : [...decisionHistory]
          .reverse()
          .flatMap((cycle) =>
            cycle.portfolioAfter?.navPerShareWad
              ? [cycle.portfolioAfter.navPerShareWad]
              : [],
          )
  ).map((value) => Number(formatUnits(BigInt(value), 18)));
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
  const allTimeReturnBps =
    navSeries.length > 1 && navSeries[0] > 0
      ? Math.round(
          ((navSeries[navSeries.length - 1] - navSeries[0]) / navSeries[0]) *
            10_000,
        )
      : null;
  const liveBenchmarks =
    data?.benchmarks.filter(
      (benchmark) =>
        benchmark.features?.return1hBps != null ||
        benchmark.features?.return24hBps != null,
    ) ?? [];

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
            MDBS NAV price ${data ? usd(data.navPerShare) : "1.00"}
          </span>
          <span className="healthy">● System healthy</span>
          <span>
            Next decision <b>{countdownText}</b>
          </span>
          <button className="theme-control" onClick={onToggleTheme}>
            {dark ? "Light" : "Dark"}
          </button>
          {wrongChain ? (
            <button className="primary-action" onClick={onSwitchWallet}>
              Switch to {network?.networkLabel}
            </button>
          ) : (
            <button
              className="theme-control"
              onClick={externalConnected ? onDisconnectWallet : onConnectWallet}
            >
              {externalConnected
                ? `External ${account ? short(account) : "wallet"}`
                : "Connect wallet"}
            </button>
          )}
          {network?.mode === "local" && network.faucetEnabled && (
            <button className="primary-action" onClick={onFaucet}>
              Fund {walletSource === "built-in" ? "test wallet" : "wallet"}
            </button>
          )}
        </div>
      </header>

      {!message.endsWith(" connected.") && (
        <div className="editorial-banner">{message}</div>
      )}

      {walletSource === "built-in" &&
        network?.mode === "local" &&
        network?.builtInWalletEnabled &&
        account && (
          <div className="test-wallet-strip" role="status">
            <span>
              <b>Disposable test wallet</b> {short(account)} · session only
            </span>
            <button onClick={onCopyWallet}>Copy address</button>
            <button onClick={onResetWallet}>Reset test wallet</button>
            <button onClick={onConnectWallet}>Use your wallet</button>
          </div>
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
                    <span>Next price ${money(selected.price)}</span>
                    <small>
                      This piece is always for sale. Each completed purchase
                      raises its next price by 20%.
                    </small>
                  </div>
                  {mine ? (
                    <span className="owned-piece-status">
                      ✓ You own this piece
                    </span>
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
                <section
                  className="brain-finances"
                  aria-label="Your brain finances"
                >
                  <div>
                    <p className="section-kicker">YOUR BRAIN FINANCES</p>
                    <h3>Ownership and rewards</h3>
                  </div>
                  <div className="brain-finance-metrics">
                    <span>
                      <small>Pieces owned</small>
                      <strong>{owned}</strong>
                    </span>
                    <span>
                      <small>Claimable</small>
                      <strong>
                        ${data ? money(data.rewards.pending) : "0"} USDG
                      </strong>
                    </span>
                  </div>
                  <p>
                    Brain-piece owners share the brain side of MDBS buy and sell
                    fees. Rewards accrue until you claim them.
                  </p>
                  <button
                    className="primary-action full-button"
                    disabled={
                      !data ||
                      owned === 0 ||
                      BigInt(data.rewards.pending) === 0n
                    }
                    onClick={onClaim}
                  >
                    Claim ${data ? money(data.rewards.pending) : "0"} USDG
                  </button>
                </section>
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
                onClick={() => {
                  setTradeSide("buy");
                  document
                    .getElementById("basket-trade")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                Buy MDBS
              </button>
              <button
                onClick={() => {
                  setTradeSide("sell");
                  document
                    .getElementById("basket-trade")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
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
                  value={`$${data ? usd(data.navPerShare) : "—"}`}
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
              <div className="holding-chart-heading">
                <h2>Current portfolio distribution</h2>
                <p>Live holdings compared with Ornith&apos;s latest targets.</p>
              </div>
              <div className="holding-distribution">
                <figure className="holding-pie">
                  <svg
                    viewBox="0 0 200 200"
                    role="img"
                    aria-label={`Current portfolio distribution: ${holdingSlices
                      .map(
                        ({ symbol, currentPercent }) =>
                          `${symbol} ${currentPercent.toFixed(2)}%`,
                      )
                      .join(", ")}`}
                  >
                    <circle
                      className="holding-pie-track"
                      cx="100"
                      cy="100"
                      r="70"
                      pathLength="100"
                    />
                    {holdingSlices.map((slice, index) => {
                      const offset = -holdingSlices
                        .slice(0, index)
                        .reduce((sum, item) => sum + item.currentPercent, 0);
                      return (
                        <circle
                          key={slice.symbol}
                          className="holding-pie-slice"
                          cx="100"
                          cy="100"
                          r="70"
                          pathLength="100"
                          stroke={`var(--asset-${slice.symbol.toLowerCase()})`}
                          strokeDasharray={`${slice.currentPercent} ${100 - slice.currentPercent}`}
                          strokeDashoffset={offset}
                        >
                          <title>
                            {slice.symbol}: {slice.currentPercent.toFixed(2)}%
                          </title>
                        </circle>
                      );
                    })}
                  </svg>
                  <figcaption>
                    <span>LIVE BASKET</span>
                    <strong>{holdingSlices.length}</strong>
                    <small>assets held</small>
                  </figcaption>
                </figure>
                <div className="holding-legend">
                  {holdingSlices.map((slice) => (
                    <div
                      key={slice.symbol}
                      data-testid="basket-holding-row"
                      data-symbol={slice.symbol}
                    >
                      <i
                        aria-hidden="true"
                        style={{
                          background: `var(--asset-${slice.symbol.toLowerCase()})`,
                        }}
                      />
                      <b>{slice.symbol}</b>
                      <span>
                        <strong>{slice.currentPercent.toFixed(2)}%</strong>
                        <small>${money(slice.value.toString())}</small>
                      </span>
                      <em>{slice.targetPercent.toFixed(2)}% target</em>
                    </div>
                  ))}
                </div>
              </div>
            </article>
            <aside
              className="transaction-card launchpad-trade"
              id="basket-trade"
              aria-label="Buy or sell MDBS"
            >
              <div
                className="trade-side-tabs"
                role="tablist"
                aria-label="Trade"
              >
                <button
                  role="tab"
                  aria-selected={tradeSide === "buy"}
                  className={tradeSide === "buy" ? "active" : ""}
                  onClick={() => setTradeSide("buy")}
                >
                  Buy
                </button>
                <button
                  role="tab"
                  aria-selected={tradeSide === "sell"}
                  className={tradeSide === "sell" ? "active" : ""}
                  onClick={() => setTradeSide("sell")}
                >
                  Sell
                </button>
              </div>

              <div className="trade-balance-row">
                <span>{tradeSide === "buy" ? "YOU PAY" : "YOU SELL"}</span>
                <strong>
                  Balance{" "}
                  {data
                    ? money(tradeSide === "buy" ? data.walletUsdg : data.shares)
                    : "0"}{" "}
                  {tradeSide === "buy" ? "USDG" : "MDBS"}
                </strong>
              </div>

              {tradeSide === "buy" ? (
                <>
                  <label className="trade-amount-box">
                    <input
                      aria-label="USDG to spend"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                    <b>USDG</b>
                  </label>
                  <div className="quick-trade-presets" aria-label="Buy presets">
                    {["100", "500", "1000"].map((value) => (
                      <button key={value} onClick={() => setAmount(value)}>
                        {Number(value).toLocaleString()}
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        data && setAmount(inputAmount(BigInt(data.walletUsdg)))
                      }
                    >
                      Max
                    </button>
                  </div>
                  {data && (
                    <div className="compact-quote">
                      <span>YOU RECEIVE APPROXIMATELY</span>
                      <strong>
                        {money(data.previews.deposit.expectedShares)} MDBS
                      </strong>
                      <details key="buy-quote-details">
                        <summary>View quote details</summary>
                        <p>
                          Buy fee ${money(data.previews.deposit.fee)} · $
                          {money(data.previews.deposit.netInvestment)} enters
                          the basket
                        </p>
                        <p>
                          MDBS NAV price ${usd(data.navPerShare)} · minimum
                          received is 99% of this quote
                        </p>
                        <b>Your USDG buys</b>
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
                      </details>
                    </div>
                  )}
                  <button
                    className="primary-action trade-submit"
                    disabled={
                      !data ||
                      Number(amount) <= 0 ||
                      Number(amount) >
                        Number(formatUnits(BigInt(data.walletUsdg), 18))
                    }
                    onClick={onDeposit}
                  >
                    Buy MDBS
                  </button>
                </>
              ) : (
                <>
                  <label className="trade-amount-box">
                    <input
                      aria-label="MDBS to sell"
                      inputMode="decimal"
                      value={sellAmount}
                      onChange={(event) => setSellAmount(event.target.value)}
                    />
                    <b>MDBS</b>
                  </label>
                  <div
                    className="quick-trade-presets"
                    aria-label="Sell presets"
                  >
                    {[25, 50, 75].map((percent) => (
                      <button
                        key={percent}
                        onClick={() => chooseSellPercent(percent)}
                      >
                        {percent}%
                      </button>
                    ))}
                    <button onClick={() => chooseSellPercent(100)}>Max</button>
                  </div>
                  {data && BigInt(data.previews.redeem.shares) > 0n && (
                    <div className="compact-quote">
                      <span>YOU RECEIVE APPROXIMATELY</span>
                      <strong>{money(data.previews.redeem.net)} USDG</strong>
                      <details key="sell-quote-details">
                        <summary>View quote details</summary>
                        <p>
                          You sell {money(data.previews.redeem.shares)} MDBS ·
                          current value ${money(data.previews.redeem.gross)}
                        </p>
                        <p>
                          Sell fee ${money(data.previews.redeem.fee)} · minimum
                          proceeds are 99% of this quote
                        </p>
                        <p>
                          Settlement is atomic: the complete sale succeeds in
                          this transaction or nothing changes.
                        </p>
                      </details>
                    </div>
                  )}
                  <button
                    className="primary-action trade-submit"
                    disabled={
                      !data ||
                      Number(sellAmount) <= 0 ||
                      Number(sellAmount) >
                        Number(formatUnits(BigInt(data.shares), 18))
                    }
                    onClick={onRedeem}
                  >
                    Sell MDBS
                  </button>
                </>
              )}

              <p className="trade-status">{message}</p>
            </aside>
          </section>
          {data && (
            <section
              className="portfolio-performance"
              aria-label="MDBS portfolio performance"
            >
              <div className="performance-heading">
                <div>
                  <p className="section-kicker">PERFORMANCE</p>
                  <h2>Returns separated from cash flows.</h2>
                </div>
                <span>
                  {data.priceSync.worker?.last_error
                    ? "Live pricing issue"
                    : "Live pricing healthy"}
                </span>
              </div>
              <div className="performance-grid">
                <article className="nav-history-chart">
                  <div>
                    <div>
                      <b>MDBS performance</b>
                      <strong>${data ? usd(data.navPerShare) : "—"}</strong>
                    </div>
                    <small>{navSeries.length} live price observations</small>
                  </div>
                  <svg
                    viewBox="0 0 100 52"
                    role="img"
                    aria-label={`MDBS performance history. Current price $${usd(data.navPerShare)}. All-time return ${percentBps(allTimeReturnBps)}.`}
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
                      label="7-day return"
                      value={percentBps(
                        data.portfolioAccounting.timeWeightedReturn7dBps,
                      )}
                    />
                    <Metric
                      label="All time"
                      value={percentBps(allTimeReturnBps)}
                    />
                  </div>
                  {liveBenchmarks.length > 0 && (
                    <div className="benchmark-comparison">
                      <span>MARKET COMPARISON</span>
                      {liveBenchmarks.map((benchmark) => (
                        <small key={benchmark.symbol}>
                          <b>{benchmark.symbol}</b>{" "}
                          {benchmark.features?.return24hBps != null
                            ? `24h ${percentBps(benchmark.features.return24hBps)}`
                            : `1h ${percentBps(benchmark.features?.return1hBps)}`}
                        </small>
                      ))}
                    </div>
                  )}
                </article>
                <article className="pnl-ledger">
                  <b>Portfolio gain / loss</b>
                  <strong
                    className={
                      BigInt(data.portfolioAccounting.totalPnlUsdWad) >= 0n
                        ? "positive-value"
                        : "negative-value"
                    }
                  >
                    {signedMoney(data.portfolioAccounting.totalPnlUsdWad)}
                  </strong>
                  <span>
                    Unrealized{" "}
                    <b>
                      {signedMoney(
                        data.portfolioAccounting.unrealizedPnlUsdWad,
                      )}
                    </b>
                  </span>
                  <span>
                    Realized{" "}
                    <b>
                      {signedMoney(data.portfolioAccounting.realizedPnlUsdWad)}
                    </b>
                  </span>
                  <hr />
                  <span>
                    User buys, 24h{" "}
                    <b>${money(data.portfolioAccounting.deposits24hUsdWad)}</b>
                  </span>
                  <span>
                    User sells, 24h{" "}
                    <b>
                      ${money(data.portfolioAccounting.redemptions24hUsdWad)}
                    </b>
                  </span>
                  <small>
                    User cash flows are excluded from investment returns.
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
          {data && (
            <details className="decision-data-details current-market-details">
              <summary>Market data and pricing</summary>
              <div>
                {data.priceSync.prices.map((price) => (
                  <article key={price.symbol}>
                    <b>{price.symbol} · on-chain price</b>
                    <strong>${usd(price.price_wad)}</strong>
                    <span>{price.source}</span>
                    <small>
                      Updated{" "}
                      {new Date(price.source_observed_at).toLocaleTimeString()}
                    </small>
                  </article>
                ))}
                {Object.entries(data.marketFeatures).map(
                  ([symbol, features]) => (
                    <article key={`coverage-${symbol}`}>
                      <b>{symbol} · market history</b>
                      <span>1h {percentBps(features.return1hBps)}</span>
                      <span>
                        24h{" "}
                        {features.return24hBps != null
                          ? percentBps(features.return24hBps)
                          : `${(features.coverage.spanMinutes / 60).toFixed(1)}h / 20h collected`}
                      </span>
                      {features.coverage.reasons.slice(1).map((reason) => (
                        <small key={reason}>{reason}</small>
                      ))}
                    </article>
                  ),
                )}
              </div>
              <small>
                These official feeds inform Ornith and local-devnet valuation.
                Reference benchmarks remain non-executable. Raw candles and old
                prompts are never inserted into later model contexts.
              </small>
            </details>
          )}
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
                          ? usd(selectedCycle.portfolioAfter.navPerShareWad)
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
                      <b>Legacy queued MDBS sale settlement</b>
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
        <span>
          {network?.mode === "testnet"
            ? `${network.networkLabel} mock deployment · no real funds`
            : network?.mode === "mainnet"
              ? `${network.networkLabel} · live network`
              : "Local Anvil simulation · no real funds"}
        </span>
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
