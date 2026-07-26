"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
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
  at: string;
  source: string;
  rationale?: string;
  allocation: Record<string, number>;
  txHash: string;
  redemptionTxHash?: string | null;
  block?: string;
  marketAsOf?: string;
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
  supply: string;
  shares: string;
  holdings: Record<string, string>;
  holdingValues: Record<string, string>;
  pieces: EditorialPiece[];
  rewards: { pending: string };
  redemption: { pendingRequestId: string };
  catalog: { version: number; hash: string };
  dataAvailability: Record<string, boolean>;
  latestCycle: CycleRecord | null;
  cycleHistory: CycleRecord[];
};

const money = (value: string | bigint) =>
  Number(formatUnits(BigInt(value), 18)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
const short = (value: string) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "";

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

  function decisionUrl(cycle: CycleRecord) {
    const url = new URL(
      process.env.NEXT_PUBLIC_APP_URL || window.location.origin,
    );
    url.searchParams.set("view", "decisions");
    url.searchParams.set("cycle", cycle.txHash);
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
        </nav>
        <div className="market-strip">
          <span className="share-price">
            $
            {data && BigInt(data.supply) > 0n
              ? (Number(data.nav) / Number(data.supply)).toFixed(4)
              : "1.0000"}
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
                      {selected.affinity} · {selected.weight / 100}% immutable
                      influence
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
                  <span>Current mood</span>
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
                <p className="bounded-effect">
                  {selected.options[selected.preset].instruction}
                </p>
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
            </div>
            <div className="title-actions">
              <button className="primary-action" onClick={onDeposit}>
                Deposit
              </button>
              <button onClick={onRedeem}>Redeem</button>
            </div>
          </section>
          <section className="basket-overview-grid">
            <article className="large-ledger-card">
              <div className="snapshot-metrics four">
                <Metric
                  label="Basket NAV"
                  value={`$${data ? money(data.nav) : "—"}`}
                />
                <Metric
                  label="Your MDBS"
                  value={data ? money(data.shares) : "—"}
                />
                <Metric
                  label="USDG reserve"
                  value={`$${data ? money(data.holdings.USDG) : "—"}`}
                />
                <Metric label="Required reserve" value="20%" />
              </div>
              <h2>Current holdings and Ornith targets</h2>
              <div className="holding-table">
                {data &&
                  Object.keys(data.holdings).map((symbol) => {
                    const value = data.holdingValues[symbol] ?? "0";
                    const current =
                      (Number(value) / Math.max(1, Number(data.nav))) * 100;
                    const target = (latestAllocation[symbol] ?? 0) / 100;
                    return (
                      <div key={symbol}>
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
              <label>
                Deposit USDG
                <input
                  aria-label="Deposit USDG"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <button
                className="primary-action full-button"
                onClick={onDeposit}
              >
                Deposit USDG
              </button>
              {data && BigInt(data.redemption.pendingRequestId) > 0n ? (
                <button className="full-button" onClick={onCancelRedemption}>
                  Cancel queued redemption #{data.redemption.pendingRequestId}
                </button>
              ) : (
                <button className="full-button" onClick={onRedeem}>
                  Redeem half my liquid shares
                </button>
              )}
              <button
                className="full-button"
                disabled={!data || BigInt(data.rewards.pending) === 0n}
                onClick={onClaim}
              >
                Claim brain rewards
              </button>
            </aside>
          </section>
        </div>
      )}

      {screen === "Decisions" && (
        <div className="editorial-page">
          <section className="page-title-row">
            <div>
              <p className="section-kicker">DECISION ARCHIVE</p>
              <h1>Explore every decision and execution.</h1>
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
                      Block {cycle.block ?? "—"} · {short(cycle.txHash)}
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
                <DecisionStage
                  number="02"
                  title="Ornith proposed"
                  tone="ornith"
                >
                  {Object.entries(selectedAllocation).map(
                    ([symbol, weight]) => (
                      <p key={symbol}>
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
                  title="Protocol executed"
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
                      <b>Redemption settlement</b>
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

function allocationSummary(allocation: Record<string, number>) {
  return Object.entries(allocation)
    .map(([symbol, weight]) => `${symbol} ${weight / 100}%`)
    .join(" · ");
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
    `${cycleTimestamp(cycle.at)} · ${short(cycle.txHash)}`,
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
  anchor.download = `milliondollar-brain-${cycle.txHash.slice(2, 10)}.png`;
  anchor.click();
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
