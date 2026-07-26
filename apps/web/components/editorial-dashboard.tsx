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

export type EditorialData = {
  nav: string;
  supply: string;
  shares: string;
  holdings: Record<string, string>;
  pieces: EditorialPiece[];
  rewards: { pending: string };
  redemption: { pendingRequestId: string };
  catalog: { version: number; hash: string };
  dataAvailability: Record<string, boolean>;
  latestCycle: {
    at: string;
    source: string;
    allocation: Record<string, number>;
    txHash: string;
    brain?: {
      activePieces: number;
      inactivePieces: number;
      activeNonNeutralInstructions: CycleInstruction[];
    };
  } | null;
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
  useEffect(() => {
    const update = () => setCountdownText(calculateCountdown());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
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
          <section className="brain-first-viewport">
            <BrainMap
              pieces={data?.pieces ?? []}
              selectedId={selectedId}
              account={account}
              onSelect={setSelectedId}
            />
            <aside className="brain-pulse">
              <p className="section-kicker">⌁ BRAIN PULSE</p>
              <h1>
                {latestPreferences.length
                  ? pulseHeadline(latestPreferences)
                  : "Balanced, watchful, waiting for a signal"}
              </h1>
              <dl>
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
                  label="Current data focus"
                  value={`${data?.latestCycle?.brain?.activePieces ?? 0} active · ${data?.latestCycle?.brain?.inactivePieces ?? 0} inactive`}
                />
                <PulseRow
                  label="Brain version"
                  value={`Catalog v${data?.catalog.version ?? "—"}`}
                />
                <PulseRow
                  label="Latest result"
                  value={data?.latestCycle ? "REBALANCE" : "AWAITING CYCLE"}
                  strong
                />
                <PulseRow
                  label="Next-cycle countdown"
                  value={countdownText}
                  strong
                />
              </dl>
            </aside>
          </section>

          <section className="brain-lower-grid">
            {selected && (
              <article className="piece-ledger">
                <div className="piece-ledger-head">
                  <span className="detail-glyph">{selected.glyph}</span>
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
                  <span>
                    {selected.unowned
                      ? "Unowned · initial sale to Creator DAO"
                      : `Owner ${short(selected.owner)}`}
                  </span>
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
              </article>
            )}

            <article className="basket-snapshot">
              <p className="section-kicker">BASKET SNAPSHOT</p>
              <div className="snapshot-metrics">
                <Metric
                  label="NAV"
                  value={`$${data ? money(data.nav) : "—"}`}
                />
                <Metric
                  label="Shares"
                  value={data ? money(data.supply) : "—"}
                />
                <Metric
                  label="Stable reserve"
                  value={`$${data ? money(data.holdings.USDG) : "—"}`}
                />
              </div>
              <div className="snapshot-holdings">
                {data &&
                  Object.entries(data.holdings).map(([symbol, value]) => (
                    <div key={symbol}>
                      <b>{symbol}</b>
                      <span>
                        <i
                          style={{
                            width: `${Math.max(3, (Number(value) / Math.max(1, Number(data.nav))) * 100)}%`,
                          }}
                        />
                      </span>
                      <em>${money(value)}</em>
                    </div>
                  ))}
              </div>
              <div className="snapshot-actions">
                <button
                  className="primary-action"
                  onClick={() => setScreen("Basket")}
                >
                  Deposit
                </button>
                <button onClick={() => setScreen("Basket")}>Redeem</button>
                <button onClick={() => setScreen("Decisions")}>
                  View latest decision →
                </button>
              </div>
            </article>
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
                  Object.entries(data.holdings).map(([symbol, value]) => {
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
              <p className="section-kicker">LATEST DECISION</p>
              <h1>From collective brain to bounded trade.</h1>
            </div>
            <span className="decision-source">
              {data?.latestCycle?.source?.toUpperCase() ?? "NO CYCLE"}
            </span>
          </section>
          <section className="decision-flow">
            <DecisionStage number="01" title="Brain requested" tone="brain">
              {latestPreferences.length ? (
                latestPreferences.slice(0, 4).map((item) => (
                  <p key={item.pieceId}>
                    <b>{item.character ?? item.affinity}</b>
                    <span>{item.mood ?? item.instruction}</span>
                  </p>
                ))
              ) : (
                <p>
                  <b>Neutral brain</b>
                  <span>No non-neutral moods in the last snapshot.</span>
                </p>
              )}
            </DecisionStage>
            <DecisionStage number="02" title="Ornith proposed" tone="ornith">
              {Object.entries(latestAllocation).map(([symbol, weight]) => (
                <p key={symbol}>
                  <b>{symbol}</b>
                  <span>{weight / 100}% target</span>
                </p>
              ))}
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
                <b>Transaction</b>
                <span className="mono">
                  {data?.latestCycle
                    ? short(data.latestCycle.txHash)
                    : "Awaiting cycle"}
                </span>
              </p>
            </DecisionStage>
          </section>
        </div>
      )}

      <footer className="editorial-footer">
        <span>Local Anvil simulation · no real funds</span>
        <span>
          Decision cadence: 60 minutes · Catalog v{data?.catalog.version ?? "—"}
        </span>
      </footer>
    </main>
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
    <div>
      <dt>{label}</dt>
      <dd className={strong ? "pulse-strong" : ""}>{value}</dd>
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
