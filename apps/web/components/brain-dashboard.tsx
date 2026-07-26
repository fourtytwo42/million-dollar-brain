"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, defineChain, formatUnits, http, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { basketAbi, brainAbi, erc20Abi } from "@/lib/abi";

type Piece = { id: number; owner: string; price: string; preset: number; weight: number };
type Data = { deployment: Record<string, `0x${string}`>; nav: string; supply: string; shares: string; holdings: Record<string, string>; pieces: Piece[]; browserRpcUrl: string };
const zero = "0x0000000000000000000000000000000000000000";
const options = ["Guardrails", "Risk-on", "Defensive"];
const localChain = defineChain({ id: 31337, name: "MillionDollar Brain Devnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } });
const short = (value: string) => value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "";
const money = (value: string | bigint) => Number(formatUnits(BigInt(value), 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function BrainDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [key, setKey] = useState<`0x${string}` | null>(null);
  const [message, setMessage] = useState("Connecting to local devnet…");
  const [dark, setDark] = useState(false);
  const [amount, setAmount] = useState("1000");
  const account = useMemo(() => key ? privateKeyToAccount(key) : null, [key]);

  async function refresh() {
    const suffix = account ? `?address=${account.address}` : "";
    const response = await fetch(`/api/status${suffix}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Devnet unavailable");
    setData(body); setMessage("Local devnet connected.");
  }
  useEffect(() => {
    const saved = localStorage.getItem("mdb-dev-private-key") as `0x${string}` | null;
    const generated = saved ?? generatePrivateKey();
    if (!saved) localStorage.setItem("mdb-dev-private-key", generated);
    setKey(generated); refresh().catch((error) => setMessage(error.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (account) refresh().catch((error) => setMessage(error.message)); }, [account]);

  function clients() {
    if (!data || !account) throw new Error("Wallet is still starting.");
    return { wallet: createWalletClient({ account, chain: localChain, transport: http(data.browserRpcUrl) }), publicClient: createPublicClient({ chain: localChain, transport: http(data.browserRpcUrl) }) };
  }
  async function faucet() {
    if (!account) return; setMessage("Funding your local development wallet…");
    const response = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: account.address }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error); await refresh(); setMessage("Wallet funded with 100,000 test USDG and 2 test ETH.");
  }
  async function deposit() {
    if (!data) return; const value = parseUnits(amount, 18); const { wallet, publicClient } = clients(); setMessage("Approving USDG…");
    const approve = await wallet.writeContract({ address: data.deployment.usdg, abi: erc20Abi, functionName: "approve", args: [data.deployment.basket, value] }); await publicClient.waitForTransactionReceipt({ hash: approve });
    setMessage("Minting basket shares…"); const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const tx = await wallet.writeContract({ address: data.deployment.basket, abi: basketAbi, functionName: "deposit", args: [value, value * 99n / 100n, deadline] }); await publicClient.waitForTransactionReceipt({ hash: tx }); await refresh(); setMessage("Deposit complete. The 1% entry fee was routed on-chain.");
  }
  async function buy(piece: Piece) {
    if (!data) return; const cost = BigInt(piece.price); const { wallet, publicClient } = clients(); setMessage(`Approving purchase of brain piece ${piece.id}…`);
    const approve = await wallet.writeContract({ address: data.deployment.usdg, abi: erc20Abi, functionName: "approve", args: [data.deployment.brain, cost] }); await publicClient.waitForTransactionReceipt({ hash: approve });
    const tx = await wallet.writeContract({ address: data.deployment.brain, abi: brainAbi, functionName: "buy", args: [BigInt(piece.id), cost, BigInt(Math.floor(Date.now() / 1000) + 3600)] }); await publicClient.waitForTransactionReceipt({ hash: tx }); await refresh(); setMessage(`Brain piece ${piece.id} is now yours.`);
  }
  async function preset(piece: Piece, value: number) {
    if (!data) return; const { wallet, publicClient } = clients(); const tx = await wallet.writeContract({ address: data.deployment.brain, abi: brainAbi, functionName: "setPreset", args: [BigInt(piece.id), value] }); await publicClient.waitForTransactionReceipt({ hash: tx }); await refresh(); setMessage(`Piece ${piece.id} now steers the agent toward ${options[value]}.`);
  }
  async function redeem() {
    if (!data || BigInt(data.shares) === 0n) return; const { wallet, publicClient } = clients(); const shares = BigInt(data.shares) / 2n; if (!shares) return; setMessage("Requesting a liquid redemption…");
    const tx = await wallet.writeContract({ address: data.deployment.basket, abi: basketAbi, functionName: "redeem", args: [shares, 1n, BigInt(Math.floor(Date.now() / 1000) + 3600)] }); await publicClient.waitForTransactionReceipt({ hash: tx }); await refresh(); setMessage("Redemption complete.");
  }
  const owned = data?.pieces.filter((piece) => account && piece.owner.toLowerCase() === account.address.toLowerCase()).length ?? 0;
  return <main className={dark ? "dark" : ""}>
    <section className="shell">
      <header><div className="brand"><span className="mark">42</span><span>MILLIONDOLLAR<br/><b>BRAIN</b></span></div><div className="header-actions"><span className="pill">LOCAL DEVNET</span><button className="quiet" onClick={() => setDark(!dark)}>{dark ? "Light" : "Dark"}</button><button onClick={() => faucet().catch(e => setMessage(e.message))}>Fund dev wallet</button></div></header>
      <div className="notice"><span className="dot"/> {message}</div>
      <section className="hero"><div><p className="eyebrow">CONSTRAINED AUTONOMOUS BASKET</p><h1>Own a thought.<br/>Steer the allocation.</h1><p className="lede">Forty-two on-chain brain pieces become bounded AI context. The agent can only rebalance this local test basket once per hourly cycle.</p></div><div className="wallet"><span>YOUR BUILT-IN DEV WALLET</span><strong>{account ? short(account.address) : "Creating…"}</strong><small>No extension required. Key remains in this browser’s local storage.</small><div><b>{owned}</b> brain pieces · <b>{data ? money(data.shares) : "0"}</b> MDBS</div></div></section>
      <section className="metrics"><Metric label="Basket NAV" value={data ? `$${money(data.nav)}` : "—"}/><Metric label="Shares outstanding" value={data ? money(data.supply) : "—"}/><Metric label="USDG reserve" value={data ? `$${money(data.holdings.USDG)}` : "—"}/><Metric label="Assets allowed" value="NVDA · AAPL · ETHX"/></section>
      <section className="grid"><article className="card allocation"><div className="card-title"><div><p className="eyebrow">BASKET</p><h2>Join the basket</h2></div><span className="live">1% entry / exit</span></div><div className="bars">{data && Object.entries(data.holdings).map(([symbol, value]) => <div key={symbol}><span>{symbol}</span><i style={{ width: `${Math.max(5, Number(value) / Math.max(1, Number(data.nav)) * 100)}%` }}/><b>${money(value)}</b></div>)}</div><div className="buy-row"><input aria-label="Deposit USDG" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"/><button onClick={() => deposit().catch(e => setMessage(e.shortMessage ?? e.message))}>Deposit USDG</button></div><button className="quiet full" onClick={() => redeem().catch(e => setMessage(e.shortMessage ?? e.message))}>Redeem half of my liquid shares</button></article>
        <article className="card agent"><p className="eyebrow">AI ALLOCATION ENGINE</p><h2>Hourly, bounded, auditable.</h2><p>The live LAN model receives the full preset state, basket holdings, approved asset list, and hard risk limits. Smart contracts reject anything outside those limits.</p><ul><li>Allowed: USDG, NVDA, AAPL, ETHX</li><li>Minimum USDG reserve: 20%</li><li>Long-only, 100% allocated, no arbitrary contracts</li></ul><button className="quiet full" onClick={() => refresh().catch(e => setMessage(e.message))}>Refresh on-chain state</button></article></section>
      <section className="brain-head"><div><p className="eyebrow">THE 42-PIECE BRAIN</p><h2>Preset governance, not free-form prompts.</h2><p>Each owner chooses one bounded posture. Higher-weight pieces have more influence in the AI context and cost more.</p></div><span>{data?.pieces.filter(p => p.owner !== zero).length ?? 0}/42 owned</span></section>
      <section className="brain-grid">{data?.pieces.map(piece => <article className={`piece ${piece.owner === zero ? "available" : "owned"}`} key={piece.id}><div><span className="piece-id">{String(piece.id).padStart(2, "0")}</span><span className="weight">{piece.weight / 100}% influence</span></div><h3>{options[piece.preset]}</h3><p>{piece.owner === zero ? "Unowned • Initial sale to Creator DAO" : `Owned by ${short(piece.owner)}`}</p>{account && piece.owner.toLowerCase() === account.address.toLowerCase() ? <select aria-label={`Preset for piece ${piece.id}`} value={piece.preset} onChange={(e) => preset(piece, Number(e.target.value)).catch(err => setMessage(err.shortMessage ?? err.message))}>{options.map((name, index) => <option key={name} value={index}>{name}</option>)}</select> : <button onClick={() => buy(piece).catch(e => setMessage(e.shortMessage ?? e.message))}>{piece.owner === zero ? "Buy" : "Buy next"} · ${money(piece.price)}</button>}</article>)}</section>
      <footer>Local Anvil simulation only. No real funds, securities, custody, or public-chain deployment are enabled.</footer>
    </section>
  </main>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
