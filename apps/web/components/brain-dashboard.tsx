"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  http,
  parseUnits,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { basketAbi, brainAbi, erc20Abi, rewardAbi } from "@/lib/abi";
import { EditorialDashboard } from "./editorial-dashboard";

type BrainOption = {
  label: string;
  instruction: string;
  value: -2 | -1 | 0 | 1 | 2;
};
type Piece = {
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
type Cycle = {
  schemaVersion?: number;
  at: string;
  source: string;
  rationale?: string;
  allocation: Record<string, number>;
  txHash: string | null;
  redemptionTxHash?: string | null;
  block?: string;
  marketAsOf?: string;
  brain?: {
    catalogVersion?: number;
    activePieces: number;
    inactivePieces: number;
    activeNonNeutralInstructions: {
      pieceId: number;
      character?: string;
      affinity: string;
      mood?: string;
      intensity?: number;
      instruction: string;
      influenceBps: number;
    }[];
  };
};
type Data = {
  deployment: Record<string, `0x${string}`>;
  nav: string;
  navPerShare: string;
  navChange24hBps: number | null;
  supply: string;
  shares: string;
  redemption: { pendingRequestId: string };
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
  pieces: Piece[];
  rewards: { pending: string };
  catalog: { version: number; hash: string };
  browserRpcUrl: string;
  dataAvailability: Record<string, boolean>;
  latestCycle: Cycle | null;
  cycleHistory: Cycle[];
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
const localChain = defineChain({
  id: 31337,
  name: "MillionDollar Brain Devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});
const short = (value: string) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "";
const money = (value: string | bigint) =>
  Number(formatUnits(BigInt(value), 18)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });

export function BrainDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [key, setKey] = useState<`0x${string}` | null>(null);
  const [message, setMessage] = useState("Connecting to local devnet…");
  const [dark, setDark] = useState(false);
  const [amount, setAmount] = useState("1000");
  const [crewFilter, setCrewFilter] = useState("All minds");
  const [screen, setScreen] = useState<"Brain" | "Basket" | "Decisions">(
    "Brain",
  );
  const [selectedId, setSelectedId] = useState(1);
  const account = useMemo(() => (key ? privateKeyToAccount(key) : null), [key]);

  async function refresh() {
    const query = new URLSearchParams();
    if (account) query.set("address", account.address);
    query.set("deposit", amount || "0");
    const suffix = `?${query.toString()}`;
    const response = await fetch(`/api/status${suffix}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Devnet unavailable");
    setData(body);
    setMessage("Local devnet connected.");
  }
  useEffect(() => {
    const saved = localStorage.getItem("mdb-dev-private-key") as
      `0x${string}` | null;
    const generated = saved ?? generatePrivateKey();
    if (!saved) localStorage.setItem("mdb-dev-private-key", generated);
    setKey(generated);
    refresh().catch((error) => setMessage(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (account) refresh().catch((error) => setMessage(error.message));
  }, [account]);
  useEffect(() => {
    const timer = window.setInterval(
      () => refresh().catch((error) => setMessage(error.message)),
      10_000,
    );
    return () => window.clearInterval(timer);
    // refresh intentionally captures the current wallet and preview amount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, amount]);

  function clients() {
    if (!data || !account) throw new Error("Wallet is still starting.");
    return {
      wallet: createWalletClient({
        account,
        chain: localChain,
        transport: http(data.browserRpcUrl),
      }),
      publicClient: createPublicClient({
        chain: localChain,
        transport: http(data.browserRpcUrl),
      }),
    };
  }
  async function faucet() {
    if (!account) return;
    setMessage("Funding your local development wallet…");
    const response = await fetch("/api/faucet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: account.address }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    await refresh();
    setMessage("Wallet funded with 100,000 test USDG and 2 test ETH.");
  }
  async function deposit() {
    if (!data) return;
    const value = parseUnits(amount, 18);
    const { wallet, publicClient } = clients();
    const preview = await publicClient.readContract({
      address: data.deployment.basket,
      abi: basketAbi,
      functionName: "previewDeposit",
      args: [value],
    });
    setMessage("Approving USDG…");
    const approve = await wallet.writeContract({
      address: data.deployment.usdg,
      abi: erc20Abi,
      functionName: "approve",
      args: [data.deployment.basket, value],
    });
    await publicClient.waitForTransactionReceipt({ hash: approve });
    setMessage("Minting basket shares…");
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const tx = await wallet.writeContract({
      address: data.deployment.basket,
      abi: basketAbi,
      functionName: "deposit",
      args: [value, (preview[2] * 99n) / 100n, deadline],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await refresh();
    setMessage(
      `Deposit complete. Minted approximately ${money(preview[2])} MDBS and purchased the basket proportionally.`,
    );
  }
  async function buy(piece: Piece) {
    if (!data) return;
    const cost = BigInt(piece.price);
    const { wallet, publicClient } = clients();
    setMessage(`Approving purchase of brain piece ${piece.id}…`);
    const approve = await wallet.writeContract({
      address: data.deployment.usdg,
      abi: erc20Abi,
      functionName: "approve",
      args: [data.deployment.brain, cost],
    });
    await publicClient.waitForTransactionReceipt({ hash: approve });
    const tx = await wallet.writeContract({
      address: data.deployment.brain,
      abi: brainAbi,
      functionName: "buy",
      args: [
        BigInt(piece.id),
        cost,
        BigInt(Math.floor(Date.now() / 1000) + 3600),
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await refresh();
    setMessage(`Brain piece ${piece.id} is now yours.`);
  }
  async function preset(piece: Piece, value: number) {
    if (!data) return;
    const { wallet, publicClient } = clients();
    const tx = await wallet.writeContract({
      address: data.deployment.brain,
      abi: brainAbi,
      functionName: "setPreset",
      args: [BigInt(piece.id), value],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await refresh();
    setMessage(
      `Piece ${piece.id} now sets ${piece.affinity} to ${piece.options[value].label}.`,
    );
  }
  async function redeem() {
    if (!data || BigInt(data.shares) === 0n) return;
    const { wallet, publicClient } = clients();
    const shares = BigInt(data.shares) / 2n;
    if (!shares) return;
    setMessage("Requesting a liquid redemption…");
    const immediate = await publicClient.readContract({
      address: data.deployment.basket,
      abi: basketAbi,
      functionName: "canRedeemImmediately",
      args: [account!.address, shares],
    });
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const preview = await publicClient.readContract({
      address: data.deployment.basket,
      abi: basketAbi,
      functionName: "previewRedeem",
      args: [shares],
    });
    const minimumNet = (preview[2] * 99n) / 100n;
    const tx = immediate
      ? await wallet.writeContract({
          address: data.deployment.basket,
          abi: basketAbi,
          functionName: "redeem",
          args: [shares, minimumNet, deadline],
        })
      : await wallet.writeContract({
          address: data.deployment.basket,
          abi: basketAbi,
          functionName: "requestRedemption",
          args: [shares, minimumNet, deadline],
        });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await refresh();
    setMessage(
      immediate
        ? `Redemption complete. Sold your proportional basket fraction for approximately ${money(preview[2])} USDG.`
        : "Redemption queued on-chain for the next bounded hourly settlement.",
    );
  }
  async function cancelRedemption() {
    if (!data || BigInt(data.redemption.pendingRequestId) === 0n) return;
    const { wallet, publicClient } = clients();
    setMessage("Cancelling queued redemption…");
    const tx = await wallet.writeContract({
      address: data.deployment.basket,
      abi: basketAbi,
      functionName: "cancelRedemption",
      args: [BigInt(data.redemption.pendingRequestId)],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await refresh();
    setMessage("Queued redemption cancelled; escrowed shares returned.");
  }
  async function claimRewards() {
    if (!data || !account) return;
    const pieceIds = data.pieces
      .filter(
        (piece) => piece.owner.toLowerCase() === account.address.toLowerCase(),
      )
      .map((piece) => BigInt(piece.id));
    if (pieceIds.length === 0 || BigInt(data.rewards.pending) === 0n) return;
    const { wallet, publicClient } = clients();
    setMessage("Claiming accrued brain-owner rewards…");
    const tx = await wallet.writeContract({
      address: data.deployment.rewards,
      abi: rewardAbi,
      functionName: "claim",
      args: [pieceIds],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await refresh();
    setMessage("Brain-owner rewards claimed to your development wallet.");
  }
  const owned =
    data?.pieces.filter(
      (piece) =>
        account && piece.owner.toLowerCase() === account.address.toLowerCase(),
    ).length ?? 0;
  const editorial = true;
  if (editorial) {
    return (
      <EditorialDashboard
        data={data}
        account={account?.address ?? null}
        message={message}
        dark={dark}
        screen={screen}
        selectedId={selectedId}
        amount={amount}
        setAmount={setAmount}
        setScreen={setScreen}
        setSelectedId={setSelectedId}
        onToggleTheme={() => setDark(!dark)}
        onFaucet={() => faucet().catch((error) => setMessage(error.message))}
        onDeposit={() =>
          deposit().catch((error) =>
            setMessage(error.shortMessage ?? error.message),
          )
        }
        onRedeem={() =>
          redeem().catch((error) =>
            setMessage(error.shortMessage ?? error.message),
          )
        }
        onBuy={(piece) =>
          buy(piece).catch((error) =>
            setMessage(error.shortMessage ?? error.message),
          )
        }
        onPreset={(piece, value) =>
          preset(piece, value).catch((error) =>
            setMessage(error.shortMessage ?? error.message),
          )
        }
        onClaim={() =>
          claimRewards().catch((error) =>
            setMessage(error.shortMessage ?? error.message),
          )
        }
        onCancelRedemption={() =>
          cancelRedemption().catch((error) =>
            setMessage(error.shortMessage ?? error.message),
          )
        }
      />
    );
  }
  return (
    <main className={dark ? "dark" : ""}>
      <section className="shell">
        <header>
          <div className="brand">
            <span className="mark">42</span>
            <span>
              MILLIONDOLLAR
              <br />
              <b>BRAIN</b>
            </span>
          </div>
          <div className="header-actions">
            <span className="pill">LOCAL DEVNET</span>
            <button className="quiet" onClick={() => setDark(!dark)}>
              {dark ? "Light" : "Dark"}
            </button>
            <button
              onClick={() => faucet().catch((e) => setMessage(e.message))}
            >
              Fund dev wallet
            </button>
          </div>
        </header>
        <div className="notice">
          <span className="dot" /> {message}
        </div>
        <section className="hero">
          <div>
            <p className="eyebrow">CONSTRAINED AUTONOMOUS BASKET</p>
            <h1>
              Own a thought.
              <br />
              Steer the allocation.
            </h1>
            <p className="lede">
              Forty-two on-chain brain pieces become bounded AI context. The
              agent can only rebalance this local test basket once per hourly
              cycle.
            </p>
          </div>
          <div className="wallet">
            <span>YOUR BUILT-IN DEV WALLET</span>
            <strong>{account ? short(account.address) : "Creating…"}</strong>
            <small>
              No extension required. Key remains in this browser’s local
              storage.
            </small>
            <div>
              <b>{owned}</b> brain pieces ·{" "}
              <b>{data ? money(data.shares) : "0"}</b> MDBS
              <br />
              <b>{data ? money(data.rewards.pending) : "0"}</b> USDG brain
              rewards
            </div>
            <button
              className="wallet-claim"
              disabled={!data || BigInt(data.rewards.pending) === 0n}
              onClick={() =>
                claimRewards().catch((e) =>
                  setMessage(e.shortMessage ?? e.message),
                )
              }
            >
              Claim brain rewards
            </button>
          </div>
        </section>
        <section className="metrics">
          <Metric
            label="Basket NAV"
            value={data ? `$${money(data.nav)}` : "—"}
          />
          <Metric
            label="Shares outstanding"
            value={data ? money(data.supply) : "—"}
          />
          <Metric
            label="USDG reserve"
            value={data ? `$${money(data.holdings.USDG)}` : "—"}
          />
          <Metric label="Assets allowed" value="NVDA · AAPL · ETHX" />
        </section>
        <section className="grid">
          <article className="card allocation">
            <div className="card-title">
              <div>
                <p className="eyebrow">BASKET</p>
                <h2>Join the basket</h2>
              </div>
              <span className="live">1% entry / exit</span>
            </div>
            <div className="bars">
              {data &&
                Object.entries(data.holdings).map(([symbol, value]) => (
                  <div key={symbol}>
                    <span>{symbol}</span>
                    <i
                      style={{
                        width: `${Math.max(5, (Number(value) / Math.max(1, Number(data.nav))) * 100)}%`,
                      }}
                    />
                    <b>${money(value)}</b>
                  </div>
                ))}
            </div>
            <div className="buy-row">
              <input
                aria-label="Deposit USDG"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
              <button
                onClick={() =>
                  deposit().catch((e) =>
                    setMessage(e.shortMessage ?? e.message),
                  )
                }
              >
                Deposit USDG
              </button>
            </div>
            {data && BigInt(data.redemption.pendingRequestId) > 0n ? (
              <>
                <p className="queue-note">
                  Redemption #{data.redemption.pendingRequestId} is escrowed in
                  the FIFO queue.
                </p>
                <button
                  className="quiet full"
                  onClick={() =>
                    cancelRedemption().catch((e) =>
                      setMessage(e.shortMessage ?? e.message),
                    )
                  }
                >
                  Cancel queued redemption
                </button>
              </>
            ) : (
              <button
                className="quiet full"
                onClick={() =>
                  redeem().catch((e) => setMessage(e.shortMessage ?? e.message))
                }
              >
                Redeem half of my liquid shares
              </button>
            )}
          </article>
          <article className="card agent">
            <p className="eyebrow">AI ALLOCATION ENGINE</p>
            <h2>Hourly, bounded, auditable.</h2>
            <p>
              The LAN model receives all 42 characters, their selected moods,
              active data dependencies, approved asset facts, current holdings,
              and hard limits. The contract rejects any invalid output.
            </p>
            {data?.latestCycle ? (
              <div className="decision">
                <span>
                  LATEST CYCLE · {data.latestCycle.source.toUpperCase()}
                </span>
                <strong>
                  {Object.entries(data.latestCycle.allocation)
                    .map(([symbol, weight]) => `${symbol} ${weight / 100}%`)
                    .join(" · ")}
                </strong>
                <small>
                  {data.latestCycle.brain
                    ? `${data.latestCycle.brain.activePieces} active pieces · ${data.latestCycle.brain.inactivePieces} inactive`
                    : "Legacy cycle record"}
                </small>
                {data.latestCycle.brain?.activeNonNeutralInstructions
                  .slice(0, 3)
                  .map((item) => (
                    <p key={item.pieceId}>
                      #{item.pieceId} {item.character ?? item.affinity}
                      {item.mood ? ` · ${item.mood}` : ""}: {item.instruction}
                    </p>
                  ))}
              </div>
            ) : null}
            <ul>
              <li>Allowed: USDG, NVDA, AAPL, ETHX</li>
              <li>Minimum USDG reserve: 20%</li>
              <li>Long-only, 100% allocated, no arbitrary contracts</li>
            </ul>
            <button
              className="quiet full"
              onClick={() => refresh().catch((e) => setMessage(e.message))}
            >
              Refresh on-chain state
            </button>
          </article>
        </section>
        <section className="brain-head">
          <div>
            <p className="eyebrow">
              THE 42-PIECE BRAIN · CATALOG V{data?.catalog.version ?? "—"}
            </p>
            <h2>Forty-two weird little minds.</h2>
            <p>
              Every ERC-721 is a collectible character with lore, a real
              portfolio affinity, and five closed moods. Pick the personality;
              the protocol translates it into bounded model context.
            </p>
          </div>
          <span>
            {data?.pieces.filter((p) => !p.unowned).length ?? 0}/42 owned
          </span>
        </section>
        <nav className="brain-filters" aria-label="Brain crew filter">
          {[
            "All minds",
            "Executive Dysfunction",
            "Market Mystics",
            "Sector Weirdos",
            "Decision Goblins",
          ].map((crew) => (
            <button
              key={crew}
              className={crewFilter === crew ? "active" : "quiet"}
              onClick={() => setCrewFilter(crew)}
            >
              {crew}
            </button>
          ))}
        </nav>
        <section className="brain-grid">
          {data?.pieces
            .filter(
              (piece) =>
                crewFilter === "All minds" || piece.crew === crewFilter,
            )
            .map((piece) => {
              const selected = piece.options[piece.preset];
              const active = piece.data.every(
                (dependency) => data.dataAvailability[dependency] === true,
              );
              const mine = Boolean(
                account &&
                piece.owner.toLowerCase() === account.address.toLowerCase(),
              );
              return (
                <article
                  className={`piece ${piece.unowned ? "available" : "owned"} ${active ? "" : "inactive"}`}
                  key={piece.id}
                >
                  <div>
                    <span className="piece-id">
                      {String(piece.id).padStart(2, "0")} · {piece.crew}
                    </span>
                    <span className="weight">
                      {piece.weight / 100}% influence
                    </span>
                  </div>
                  <div className="piece-character">
                    <span className="glyph">{piece.glyph}</span>
                    <div>
                      <h3>{piece.name}</h3>
                      <span className="affinity-label">{piece.affinity}</span>
                    </div>
                  </div>
                  <p className="tagline">{piece.tagline}</p>
                  <p className="lore">“{piece.lore}”</p>
                  <span className="mood-label">
                    CURRENT MOOD ·{" "}
                    {selected.value > 0 ? `+${selected.value}` : selected.value}
                  </span>
                  <strong className="selection">{selected.label}</strong>
                  <p className="effect">
                    {active
                      ? selected.instruction
                      : `Inactive: ${piece.data.filter((dependency) => !data.dataAvailability[dependency]).join(", ")} data unavailable.`}
                  </p>
                  <p className="owner">
                    {piece.unowned
                      ? "Unowned · Initial sale to Creator DAO"
                      : `Owned by ${short(piece.owner)}`}
                  </p>
                  {mine ? (
                    <select
                      aria-label={`Mood for ${piece.name}`}
                      value={piece.preset}
                      onChange={(e) =>
                        preset(piece, Number(e.target.value)).catch((err) =>
                          setMessage(err.shortMessage ?? err.message),
                        )
                      }
                    >
                      {piece.options.map((choice, index) => (
                        <option key={choice.label} value={index}>
                          {choice.value > 0 ? `+${choice.value}` : choice.value}{" "}
                          · {choice.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() =>
                        buy(piece).catch((e) =>
                          setMessage(e.shortMessage ?? e.message),
                        )
                      }
                    >
                      {piece.unowned ? "Buy" : "Buy next"} · $
                      {money(piece.price)}
                    </button>
                  )}
                </article>
              );
            })}
        </section>
        <footer>
          Local Anvil simulation only. No real funds, securities, custody, or
          public-chain deployment are enabled.
        </footer>
      </section>
    </main>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
