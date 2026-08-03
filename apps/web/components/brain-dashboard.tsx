"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  formatUnits,
  http,
  keccak256,
  parseAbi,
  parseUnits,
} from "viem";
import {
  generatePrivateKey,
  nonceManager,
  privateKeyToAccount,
} from "viem/accounts";
import {
  useAccount,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import {
  basketAbi,
  brainAbi,
  brainControlAbi,
  creatorRiskControllerAbi,
  erc20Abi,
  rewardAbi,
} from "@/lib/abi";
import {
  packAssetIds,
  packScalars,
  type BrainControlBundle,
} from "@/lib/brain-controls";
import { retryApprovalDependentWrite } from "@/lib/approval-retry";
import {
  normalizeProfileUrl,
  pieceDisplayName,
  validateCustomPieceName,
} from "@/lib/piece-name";
import { preparePortrait } from "@/lib/portrait";
import {
  packBrainPersona,
  validateBrainPersona,
  type BrainPersonaV1,
} from "@/lib/brain-profile";
import { buildRiskCapacityWitness } from "@/lib/capacity-policy";
import {
  EditorialDashboard,
  type CreatorRiskAction,
} from "./editorial-dashboard";

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
  portraitHash: string;
  ownershipSerial: number;
  profileChangeAvailable: boolean;
  customName: string;
  profileUrl: string;
  customTagline: string;
  personaPack: string;
  ownerCustomized: boolean;
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
  controlBundle: BrainControlBundle;
  controlBundleHash: string | null;
  controlSelectionVersion: number;
  controlUpdatedAt: number;
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
  dexSnapshot: {
    schemaVersion: 1;
    observedAt: string;
    blockNumber: string;
    chainTimestamp: number;
    lastSuccessfulAt: string;
    state: "live" | "stale" | "degraded" | "unavailable";
    reasonCodes: string[];
    releaseSha: string;
    snapshotHash: string;
  };
  activation: {
    basketControlsConfigured: boolean;
    brainControlsConfigured: boolean;
    buysEnabled: boolean;
    sellsEnabled: boolean;
    rebalancesEnabled: boolean;
    brainPurchasesEnabled: boolean;
    controlBundlesEnabled: boolean;
  };
  controlCatalog: {
    schemaVersion: number;
    catalogVersion: number;
    catalogHash: string | null;
    registry: `0x${string}` | null;
  };
  network: {
    mode: "local" | "testnet" | "mainnet";
    chainId: number;
    chainName: string;
    networkLabel: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    browserRpcUrl: string;
    explorerUrl: string;
    confirmations: number;
    decisionCadenceMinutes: number;
    builtInWalletEnabled: boolean;
    faucetEnabled: boolean;
    faucetLanOnly: boolean;
    mockAssets: boolean;
  };
  deployment: {
    schemaVersion?: number;
    basket: `0x${string}`;
    usdg: `0x${string}`;
    brain: `0x${string}`;
    rewards: `0x${string}`;
    [key: string]: unknown;
  };
  assets: {
    id: string;
    symbol: string;
    name: string;
    address: `0x${string}`;
    kind: string;
    riskClass: string;
    decimals: number;
    maximumWeightBps: number;
    safeTwoSidedCapacityUsdWad?: string;
    robinhoodUid: string | null;
    controlId?: number;
    tags?: string[];
    active?: boolean;
    qualified?: boolean;
    creatorApproved?: boolean;
    creatorCapUsdWad?: string;
    maximumExposureUsdWad?: string;
    policyVersion?: number;
    pendingPolicy?: {
      creatorCapUsdWad: string;
      activationTime: number;
      approved: boolean;
    };
  }[];
  nav: string;
  capacity: {
    tvlCapUsdWad: string;
    remainingUsdWad: string;
    maximumDepositUsdWad: string;
    limitingConstraint: string;
    utilizationBps: number;
    atOrAboveCap: boolean;
  };
  creatorRiskPolicy: {
    controller: `0x${string}`;
    authority: `0x${string}`;
    pendingAuthority: `0x${string}`;
    increaseDelaySeconds: number;
    pendingTvlCap: { capUsdWad: string; activationTime: number } | null;
  } | null;
  navPerShare: string;
  navChange24hBps: number | null;
  supply: string;
  shares: string;
  walletUsdg: string;
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

type QuotePlanResponse = {
  quoteBlock: string;
  expiresAt: number;
  preview: Data["previews"]["deposit"] | Data["previews"]["redeem"];
  plans: {
    plan: {
      route: {
        tokenIn: `0x${string}`;
        tokenOut: `0x${string}`;
        intermediate: `0x${string}`;
        firstFee: number;
        secondFee: number;
      };
      amountIn: string;
      quotedAmountOut: string;
      minimumAmountOut: string;
      recipient: `0x${string}`;
      issuedAt: string;
      deadline: string;
      referenceBlock: string;
    };
    evidence: {
      firstPool: `0x${string}`;
      secondPool: `0x${string}` | null;
      quoteBlock: string;
      expiresAt: number;
      gasEstimate: string;
      estimatedGasCostUsdG: string;
      twapAmountOut: string;
      priceImpactBps: number;
      capacity: {
        maximumExposureUsdWad: string | null;
        projectedExposureUsdWad: string | null;
        utilizationBps: number | null;
      };
      path: `0x${string}`;
    };
  }[];
};

type DexReceiptSummary = {
  action: "buy" | "sell";
  txHash: `0x${string}`;
  blockNumber: string;
  legs: {
    input: string;
    output: string;
    route: string;
    effectivePrice: string;
  }[];
};

const dexSwapReceiptAbi = parseAbi([
  "event SwapExecuted(address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut,address firstPool,address secondPool,uint64 referenceBlock)",
]);

function reviveClientSwapPlans(response: QuotePlanResponse) {
  return response.plans.map((entry) => ({
    plan: {
      ...entry.plan,
      amountIn: BigInt(entry.plan.amountIn),
      quotedAmountOut: BigInt(entry.plan.quotedAmountOut),
      minimumAmountOut: BigInt(entry.plan.minimumAmountOut),
      issuedAt: BigInt(entry.plan.issuedAt),
      deadline: BigInt(entry.plan.deadline),
      referenceBlock: BigInt(entry.plan.referenceBlock),
    },
  }));
}

async function requestQuotePlan(action: "deposit" | "redeem", amount: bigint) {
  const response = await fetch("/api/quote-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, amount: amount.toString() }),
  });
  const body = (await response.json()) as QuotePlanResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? "Unable to build an atomic basket quote.");
  }
  return body;
}

const short = (value: string) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "";
const money = (value: string | bigint) =>
  Number(formatUnits(BigInt(value), 18)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
const moneyAtDecimals = (value: string | bigint, decimals: number) =>
  Number(formatUnits(BigInt(value), decimals)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });

function summarizeDexReceipt(
  action: "buy" | "sell",
  txHash: `0x${string}`,
  blockNumber: bigint,
  logs: readonly {
    data: `0x${string}`;
    topics: readonly `0x${string}`[];
  }[],
  assets: Data["assets"],
): DexReceiptSummary {
  const byAddress = new Map(
    assets.map((asset) => [asset.address.toLowerCase(), asset]),
  );
  const legs = logs.flatMap((log) => {
    try {
      if (log.topics.length === 0) return [];
      const topics = [...log.topics] as [`0x${string}`, ...`0x${string}`[]];
      const decoded = decodeEventLog({
        abi: dexSwapReceiptAbi,
        eventName: "SwapExecuted",
        data: log.data,
        topics,
        strict: false,
      });
      const args = decoded.args as {
        tokenIn: `0x${string}`;
        tokenOut: `0x${string}`;
        amountIn: bigint;
        amountOut: bigint;
        firstPool: `0x${string}`;
        secondPool: `0x${string}`;
      };
      const inputAsset = byAddress.get(args.tokenIn.toLowerCase());
      const outputAsset = byAddress.get(args.tokenOut.toLowerCase());
      if (!inputAsset || !outputAsset) return [];
      const inputAmount = Number(
        formatUnits(args.amountIn, inputAsset.decimals),
      );
      const outputAmount = Number(
        formatUnits(args.amountOut, outputAsset.decimals),
      );
      const effectivePrice =
        inputAsset.kind === "reserve"
          ? inputAmount / outputAmount
          : outputAmount / inputAmount;
      return [
        {
          input: `${inputAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${inputAsset.symbol}`,
          output: `${outputAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${outputAsset.symbol}`,
          route: `${short(args.firstPool)}${args.secondPool === "0x0000000000000000000000000000000000000000" ? "" : ` → ${short(args.secondPool)}`}`,
          effectivePrice: `$${effectivePrice.toLocaleString(undefined, { maximumFractionDigits: 6 })} per ${inputAsset.kind === "reserve" ? outputAsset.symbol : inputAsset.symbol}`,
        },
      ];
    } catch {
      return [];
    }
  });
  return {
    action,
    txHash,
    blockNumber: blockNumber.toString(),
    legs,
  };
}
const inputAmount = (value: bigint) =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 6,
  });
const receiptWaitPolicy = {
  checkReplacement: false,
  retryCount: 20,
  retryDelay: 1_000,
  timeout: 180_000,
} as const;

function statusRefreshErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("0x00bfc921") ||
    message.includes("totalAssetsUsd") ||
    message.includes("InvalidPrice")
  ) {
    return "DEX pricing is refreshing. Portfolio actions are temporarily unavailable.";
  }
  if (
    message.includes("RPC Request failed") ||
    message.includes("fetch failed") ||
    message.includes("Network unavailable")
  ) {
    return "Testnet connection is temporarily degraded. Retrying…";
  }
  return message;
}

function isStatusRefreshMessage(message: string) {
  return (
    message === "Connecting to network…" ||
    message ===
      "DEX pricing is refreshing. Portfolio actions are temporarily unavailable." ||
    message === "Testnet connection is temporarily degraded. Retrying…"
  );
}

function pricingStatusMessage(data: Data) {
  const ageSeconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(data.dexSnapshot.observedAt)) / 1_000),
  );
  if (data.dexSnapshot.state === "live") {
    return `DEX pricing live · block ${data.dexSnapshot.blockNumber}`;
  }
  if (data.dexSnapshot.state === "stale") {
    return `Last updated ${ageSeconds}s ago — trading paused.`;
  }
  if (data.dexSnapshot.state === "degraded") {
    return `LAN connection degraded · last update ${ageSeconds}s ago — trading paused.`;
  }
  return "DEX pricing unavailable — trading paused.";
}

export function BrainDashboard({
  initialData = null,
}: {
  initialData?: Data | null;
}) {
  const [data, setData] = useState<Data | null>(initialData);
  const [key, setKey] = useState<`0x${string}` | null>(null);
  const [message, setMessage] = useState(
    initialData ? pricingStatusMessage(initialData) : "Connecting to network…",
  );
  const [dark, setDark] = useState(false);
  const [amount, setAmount] = useState("1000");
  const [sellAmount, setSellAmount] = useState("");
  const [buyDexQuote, setBuyDexQuote] = useState<QuotePlanResponse | null>(
    null,
  );
  const [sellDexQuote, setSellDexQuote] = useState<QuotePlanResponse | null>(
    null,
  );
  const [dexQuoteError, setDexQuoteError] = useState<string | null>(null);
  const [lastDexReceipt, setLastDexReceipt] =
    useState<DexReceiptSummary | null>(null);
  const [crewFilter, setCrewFilter] = useState("All minds");
  const [screen, setScreen] = useState<"Brain" | "Basket" | "Decisions">(
    "Brain",
  );
  const [selectedId, setSelectedId] = useState(1);
  const external = useAccount();
  const { data: externalWallet } = useWalletClient({
    chainId: data?.network.chainId,
  });
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const builtInAccount = useMemo(
    () => (key ? privateKeyToAccount(key, { nonceManager }) : null),
    [key],
  );
  useEffect(() => {
    if (
      !data ||
      (data.deployment.schemaVersion ?? 0) < 4 ||
      data.dexSnapshot.state !== "live" ||
      screen !== "Basket"
    ) {
      setBuyDexQuote(null);
      setSellDexQuote(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const reserveDecimals =
          data.assets.find((asset) => asset.kind === "reserve")?.decimals ?? 18;
        const buyValue = parseUnits(amount || "0", reserveDecimals);
        const sellValue = parseUnits(sellAmount || "0", 18);
        const [buy, sell] = await Promise.all([
          buyValue > 0n ? requestQuotePlan("deposit", buyValue) : null,
          sellValue > 0n && sellValue <= BigInt(data.shares)
            ? requestQuotePlan("redeem", sellValue)
            : null,
        ]);
        if (!cancelled) {
          setBuyDexQuote(buy);
          setSellDexQuote(sell);
          setData((current) => {
            if (!current) return current;
            const deposit = buy
              ? (buy.preview as Data["previews"]["deposit"])
              : current.previews.deposit;
            const redeem = sell
              ? (sell.preview as Data["previews"]["redeem"])
              : current.previews.redeem;
            if (
              JSON.stringify(deposit) ===
                JSON.stringify(current.previews.deposit) &&
              JSON.stringify(redeem) === JSON.stringify(current.previews.redeem)
            ) {
              return current;
            }
            return { ...current, previews: { deposit, redeem } };
          });
          setDexQuoteError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setBuyDexQuote(null);
          setSellDexQuote(null);
          setDexQuoteError(
            error instanceof Error ? error.message : "DEX quote unavailable",
          );
        }
      }
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [amount, data, screen, sellAmount]);
  const account = useMemo(
    () =>
      external.address
        ? { address: external.address }
        : builtInAccount
          ? { address: builtInAccount.address }
          : null,
    [builtInAccount, external.address],
  );
  const walletSource = external.address ? "external" : "built-in";

  async function refresh() {
    const [response, accountResponse] = await Promise.all([
      fetch("/api/status"),
      account
        ? fetch(`/api/account-status?address=${account.address}`, {
            cache: "no-store",
          })
        : null,
    ]);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Network unavailable");
    const accountBody =
      accountResponse && accountResponse.ok
        ? await accountResponse.json()
        : null;
    setData((current) => ({
      ...body,
      ...(accountBody ?? {}),
      cycleHistory: current?.cycleHistory?.length
        ? current.cycleHistory
        : body.cycleHistory,
      performanceHistory: current?.performanceHistory?.length
        ? current.performanceHistory
        : body.performanceHistory,
    }));
    setMessage(pricingStatusMessage(body));
  }
  async function refreshHistory() {
    const response = await fetch("/api/history?limit=50");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "History unavailable");
    setData((current) => (current ? { ...current, ...body } : current));
  }
  async function refreshAfterConfirmedAction() {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      try {
        await refresh();
        return true;
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
    }
    return false;
  }
  function confirmedActionMessage(message: string, refreshed: boolean) {
    return refreshed
      ? message
      : `${message} Live portfolio data is still refreshing.`;
  }
  useEffect(() => {
    refresh().catch((error) => setMessage(statusRefreshErrorMessage(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!data || data.cycleHistory.length > 0) return;
    refreshHistory().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)]);
  useEffect(() => {
    if (!data?.network.builtInWalletEnabled) {
      setKey(null);
      return;
    }
    const storageKey = `mdb-test-wallet-${data.network.chainId}`;
    let saved = sessionStorage.getItem(storageKey) as `0x${string}` | null;
    if (!saved && data.network.mode === "local") {
      saved = localStorage.getItem("mdb-dev-private-key") as
        `0x${string}` | null;
      if (saved) {
        sessionStorage.setItem(storageKey, saved);
        localStorage.removeItem("mdb-dev-private-key");
      }
    }
    const testWalletRequested =
      data.network.mode === "local" ||
      new URLSearchParams(window.location.search).get("testWallet") === "1";
    if (!testWalletRequested) {
      setKey(null);
      return;
    }
    const generated = saved ?? generatePrivateKey();
    if (!saved) sessionStorage.setItem(storageKey, generated);
    setKey(generated);
  }, [
    data?.network.builtInWalletEnabled,
    data?.network.chainId,
    data?.network.mode,
  ]);
  useEffect(() => {
    if (account)
      refresh().catch((error) => setMessage(statusRefreshErrorMessage(error)));
  }, [account]);
  useEffect(() => {
    if (!account) return;
    const timer = window.setTimeout(
      () =>
        refresh().catch((error) =>
          setMessage(statusRefreshErrorMessage(error)),
        ),
      250,
    );
    return () => window.clearTimeout(timer);
    // refresh intentionally captures the current wallet and preview amounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);
  useEffect(() => {
    const pollInterval = data?.network.mode === "testnet" ? 30_000 : 10_000;
    const timer = window.setInterval(
      () => refresh().catch(() => undefined),
      pollInterval,
    );
    return () => window.clearInterval(timer);
    // refresh intentionally captures the current wallet and preview amount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, data?.network.mode]);
  useEffect(() => {
    if (!sellAmount && data && BigInt(data.shares) > 0n) {
      setSellAmount(inputAmount(BigInt(data.shares) / 4n));
    }
  }, [data, sellAmount]);

  function clients() {
    if (!data || !account) throw new Error("Wallet is still starting.");
    const activeChain = defineChain({
      id: data.network.chainId,
      name: data.network.chainName,
      nativeCurrency: data.network.nativeCurrency,
      rpcUrls: { default: { http: [data.browserRpcUrl] } },
      blockExplorers: data.network.explorerUrl
        ? {
            default: {
              name: `${data.network.networkLabel} Explorer`,
              url: data.network.explorerUrl,
            },
          }
        : undefined,
      testnet: data.network.mode !== "mainnet",
    });
    const publicClient = createPublicClient({
      chain: activeChain,
      transport: http(data.browserRpcUrl),
    });
    if (external.address) {
      if (external.chainId !== data.network.chainId) {
        throw new Error(`Switch your wallet to ${data.network.networkLabel}.`);
      }
      if (!externalWallet)
        throw new Error("The connected wallet is not ready.");
      return { wallet: externalWallet, publicClient };
    }
    if (!builtInAccount) {
      throw new Error("The disposable test wallet is not ready.");
    }
    return {
      wallet: createWalletClient({
        account: builtInAccount,
        chain: activeChain,
        transport: http(data.browserRpcUrl),
      }),
      publicClient,
    };
  }
  async function faucet() {
    if (!account) return;
    setMessage(`Funding your ${data?.network.networkLabel ?? "test"} wallet…`);
    const response = await fetch("/api/faucet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: account.address }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    const refreshed = await refreshAfterConfirmedAction();
    setMessage(
      confirmedActionMessage(
        data?.network.mode === "local"
          ? "Wallet funded with 100,000 test USDG and 2 test ETH."
          : "Test wallet funding completed.",
        refreshed,
      ),
    );
  }
  async function connectExternalWallet() {
    if (!openConnectModal) throw new Error("Wallet selection is not ready.");
    openConnectModal();
  }
  async function disconnectExternalWallet() {
    if (!external.connector)
      throw new Error("The connected wallet is not ready to disconnect.");
    await disconnectAsync({ connector: external.connector });
    setMessage(
      data?.network.mode === "local"
        ? "External wallet disconnected. Disposable test wallet is active."
        : "External wallet disconnected. Choose Connect wallet to reconnect.",
    );
  }
  async function switchExternalWallet() {
    if (!data) return;
    await switchChainAsync({ chainId: data.network.chainId });
  }
  function resetBuiltInWallet() {
    if (!data?.network.builtInWalletEnabled) return;
    const generated = generatePrivateKey();
    sessionStorage.setItem(
      `mdb-test-wallet-${data.network.chainId}`,
      generated,
    );
    setKey(generated);
    setMessage("Disposable test wallet reset. Fund it before transacting.");
  }
  async function copyWalletAddress() {
    if (!account) return;
    await navigator.clipboard.writeText(account.address);
    setMessage("Wallet address copied.");
  }
  async function deposit() {
    if (!data) return;
    if (data.dexSnapshot.state !== "live") {
      throw new Error(
        "DEX pricing is not live. Refresh after the LAN connection recovers.",
      );
    }
    const reserveDecimals =
      data.assets.find((asset) => asset.kind === "reserve")?.decimals ?? 18;
    const value = parseUnits(amount, reserveDecimals);
    if (!value) throw new Error("Enter a USDG amount to spend.");
    if (value > BigInt(data.walletUsdg)) {
      throw new Error("You do not have enough USDG for this purchase.");
    }
    const { wallet, publicClient } = clients();
    const preview = await publicClient.readContract({
      address: data.deployment.basket,
      abi: basketAbi,
      functionName: "previewDeposit",
      args: [value],
    });
    setMessage("Approving USDG for your BRAINS purchase…");
    const approve = await wallet.writeContract({
      address: data.deployment.usdg,
      abi: erc20Abi,
      functionName: "approve",
      args: [data.deployment.basket, value],
    });
    await publicClient.waitForTransactionReceipt({
      hash: approve,
      ...receiptWaitPolicy,
    });
    const quote =
      (data.deployment.schemaVersion ?? 0) >= 4
        ? await requestQuotePlan("deposit", value)
        : null;
    setMessage(
      quote
        ? "Buying BRAINS and atomically purchasing your share of the basket…"
        : "Buying BRAINS and adding your funds to the basket…",
    );
    const deadline =
      quote !== null
        ? BigInt(quote.expiresAt)
        : (await publicClient.getBlock()).timestamp + 3600n;
    const tx = await retryApprovalDependentWrite(() =>
      wallet.writeContract({
        address: data.deployment.basket,
        abi: basketAbi,
        functionName: quote ? "depositWithDexPlan" : "deposit",
        gas: quote && data.network.mode === "testnet" ? 6_000_000n : undefined,
        args: quote
          ? [
              value,
              (preview[2] * 99n) / 100n,
              deadline,
              reviveClientSwapPlans(quote),
            ]
          : [value, (preview[2] * 99n) / 100n, deadline],
      }),
    );
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: tx,
      ...receiptWaitPolicy,
    });
    if (quote) {
      setLastDexReceipt(
        summarizeDexReceipt(
          "buy",
          tx,
          receipt.blockNumber,
          receipt.logs,
          data.assets,
        ),
      );
    }
    const refreshed = await refreshAfterConfirmedAction();
    setMessage(
      confirmedActionMessage(
        `Purchase complete. You bought approximately ${money(preview[2])} BRAINS, backed by your proportional share of the basket.`,
        refreshed,
      ),
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
    await publicClient.waitForTransactionReceipt({
      hash: approve,
      ...receiptWaitPolicy,
    });
    const deadline = (await publicClient.getBlock()).timestamp + 3600n;
    const tx = await retryApprovalDependentWrite(() =>
      wallet.writeContract({
        address: data.deployment.brain,
        abi: brainAbi,
        functionName: "buy",
        args: [BigInt(piece.id), cost, deadline],
      }),
    );
    await publicClient.waitForTransactionReceipt({
      hash: tx,
      ...receiptWaitPolicy,
    });
    const refreshed = await refreshAfterConfirmedAction();
    setMessage(
      confirmedActionMessage(
        `Brain piece ${piece.id} is now yours.`,
        refreshed,
      ),
    );
  }
  async function setControls(piece: Piece, bundle: BrainControlBundle) {
    if (!data?.controlCatalog.registry)
      throw new Error("Control Catalog v1 is not active on this network.");
    const { wallet, publicClient } = clients();
    setMessage("Confirm all control changes in your wallet…");
    const tx = await wallet.writeContract({
      address: data.controlCatalog.registry,
      abi: brainControlAbi,
      functionName: "setControlBundle",
      args: [
        BigInt(piece.id),
        packScalars(bundle.values),
        packAssetIds(bundle.assetIds),
      ],
    });
    await publicClient.waitForTransactionReceipt({
      hash: tx,
      ...receiptWaitPolicy,
    });
    const refreshed = await refreshAfterConfirmedAction();
    setMessage(
      confirmedActionMessage(
        `All controls for Piece ${piece.id} were updated in one transaction.`,
        refreshed,
      ),
    );
  }
  async function legacyPreset(piece: Piece, value: number) {
    if (!data || data.activation.controlBundlesEnabled)
      throw new Error("Use the Control Catalog editor for this braincell.");
    const { wallet, publicClient } = clients();
    const tx = await wallet.writeContract({
      address: data.deployment.brain,
      abi: brainAbi,
      functionName: "setPreset",
      args: [BigInt(piece.id), value],
    });
    await publicClient.waitForTransactionReceipt({
      hash: tx,
      ...receiptWaitPolicy,
    });
    await refreshAfterConfirmedAction();
  }
  async function changeProfile(
    piece: Piece,
    profile: {
      file: File | null;
      name: string;
      profileUrl: string;
      tagline: string;
      persona: BrainPersonaV1;
    },
  ) {
    if (!data) return;
    const {
      file: sourceFile,
      name: newName,
      profileUrl: newProfileUrl,
      tagline: newTagline,
      persona,
    } = profile;
    const nameError = validateCustomPieceName(newName);
    if (nameError) throw new Error(nameError);
    const normalizedProfileUrl = normalizeProfileUrl(newProfileUrl);
    const normalizedTagline = newTagline.trim();
    if (new TextEncoder().encode(normalizedTagline).length > 96) {
      throw new Error("Tagline must be 96 UTF-8 bytes or fewer.");
    }
    validateBrainPersona(piece.id, persona);
    const packedPersona = packBrainPersona(persona);
    setMessage("Preparing your braincell media…");
    const portrait = sourceFile ? await preparePortrait(sourceFile) : null;
    const hash = portrait
      ? keccak256(new Uint8Array(await portrait.arrayBuffer()))
      : (piece.portraitHash as `0x${string}`);
    const alreadyCommitted =
      hash.toLowerCase() === piece.portraitHash.toLowerCase() &&
      newName === piece.customName &&
      normalizedProfileUrl === piece.profileUrl &&
      normalizedTagline === piece.customTagline &&
      packedPersona === BigInt(piece.personaPack || "0");

    if (!piece.profileChangeAvailable && !alreadyCommitted) {
      throw new Error(
        "This ownership has already used its one profile change. The next purchaser receives a new change.",
      );
    }

    const { wallet, publicClient } = clients();
    if (!alreadyCommitted) {
      setMessage(
        "Confirm the one-time name, media, and link change in your wallet…",
      );
      const tx = await wallet.writeContract({
        address: data.deployment.brain,
        abi: brainAbi,
        functionName: "setProfileV2",
        args: [
          BigInt(piece.id),
          hash,
          newName,
          normalizedProfileUrl,
          normalizedTagline,
          packedPersona,
        ],
      });
      await publicClient.waitForTransactionReceipt({
        hash: tx,
        ...receiptWaitPolicy,
      });
    }

    setMessage("Saving the committed portrait to 42 Braincells…");
    if (!portrait) {
      const refreshed = await refreshAfterConfirmedAction();
      setMessage(
        confirmedActionMessage(
          `Piece ${piece.id} is now ${newName}. This ownership's makeover has been used.`,
          refreshed,
        ),
      );
      return;
    }
    const form = new FormData();
    form.set("portrait", portrait);
    let uploadError = "portrait upload failed";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`/api/brain-image/${piece.id}`, {
        method: "POST",
        body: form,
      });
      if (response.ok) {
        const refreshed = await refreshAfterConfirmedAction();
        setMessage(
          confirmedActionMessage(
            `Piece ${piece.id} is now ${newName} and uses your custom profile. This ownership's one profile change has been used.`,
            refreshed,
          ),
        );
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      uploadError = payload?.error ?? uploadError;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    await refreshAfterConfirmedAction();
    throw new Error(
      `The profile is committed on chain, but the media upload failed: ${uploadError}. Open Customize and choose the same file, name, and link to retry.`,
    );
  }
  async function redeem() {
    if (!data || BigInt(data.shares) === 0n) return;
    if (data.dexSnapshot.state !== "live") {
      throw new Error(
        "DEX pricing is not live. Refresh after the LAN connection recovers.",
      );
    }
    const { wallet, publicClient } = clients();
    const shares = parseUnits(sellAmount || "0", 18);
    if (!shares) throw new Error("Enter a BRAINS amount to sell.");
    if (shares > BigInt(data.shares)) {
      throw new Error("You cannot sell more BRAINS than you own.");
    }
    setMessage("Selling BRAINS for USDG…");
    const deadline = (await publicClient.getBlock()).timestamp + 3600n;
    const preview = await publicClient.readContract({
      address: data.deployment.basket,
      abi: basketAbi,
      functionName: "previewRedeem",
      args: [shares],
    });
    const minimumNet = (preview[2] * 99n) / 100n;
    const quote =
      (data.deployment.schemaVersion ?? 0) >= 4
        ? await requestQuotePlan("redeem", shares)
        : null;
    const tx = await wallet.writeContract({
      address: data.deployment.basket,
      abi: basketAbi,
      functionName: quote ? "redeemWithDexPlan" : "redeem",
      gas: quote && data.network.mode === "testnet" ? 6_000_000n : undefined,
      args: quote
        ? [
            shares,
            minimumNet,
            BigInt(quote.expiresAt),
            reviveClientSwapPlans(quote),
          ]
        : [shares, minimumNet, deadline],
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: tx,
      ...receiptWaitPolicy,
    });
    if (quote) {
      setLastDexReceipt(
        summarizeDexReceipt(
          "sell",
          tx,
          receipt.blockNumber,
          receipt.logs,
          data.assets,
        ),
      );
    }
    const refreshed = await refreshAfterConfirmedAction();
    const reserveDecimals =
      data.assets.find((asset) => asset.kind === "reserve")?.decimals ?? 18;
    setMessage(
      confirmedActionMessage(
        `Sale complete. You received approximately ${moneyAtDecimals(preview[2], reserveDecimals)} USDG for your BRAINS.`,
        refreshed,
      ),
    );
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
    await publicClient.waitForTransactionReceipt({
      hash: tx,
      ...receiptWaitPolicy,
    });
    const refreshed = await refreshAfterConfirmedAction();
    setMessage(
      confirmedActionMessage(
        "Brain-owner rewards claimed to your development wallet.",
        refreshed,
      ),
    );
  }
  function walletErrorMessage(error: {
    shortMessage?: string;
    message?: string;
  }) {
    const detail = error.shortMessage ?? error.message ?? "Transaction failed.";
    return /TvlCapExceeded|AssetCapacityExceeded/i.test(detail)
      ? "Basket capacity changed while your quote was open. Refresh the quote and try a smaller amount."
      : detail;
  }
  async function applyCreatorRiskAction(action: CreatorRiskAction) {
    if (!data?.creatorRiskPolicy)
      throw new Error("Creator risk controls are not deployed.");
    const { wallet, publicClient } = clients();
    const controller = data.creatorRiskPolicy.controller;
    const witnessFor = (cap: bigint) => {
      const result = buildRiskCapacityWitness(
        data.assets
          .filter((asset) => asset.kind !== "reserve")
          .map((asset) => ({
            address: asset.address,
            id: asset.id,
            active: asset.active === true,
            qualified: asset.qualified === true,
            creatorApproved: asset.creatorApproved === true,
            riskClass: asset.riskClass,
            maximumWeightBps: asset.maximumWeightBps,
            maximumExposureUsdWad: BigInt(asset.maximumExposureUsdWad ?? "0"),
          })),
        cap,
      );
      if (!result.valid) {
        throw new Error(
          "The active qualified assets cannot support 80% of that basket limit.",
        );
      }
      return result.witness;
    };
    let functionName: string;
    let args: readonly unknown[] = [];
    if (action.type === "set-global") {
      const cap = parseUnits(action.capUsd, 18);
      if (cap === BigInt(data.capacity.tvlCapUsdWad)) {
        throw new Error(
          "Enter a basket limit different from the active limit.",
        );
      }
      if (cap < BigInt(data.capacity.tvlCapUsdWad)) {
        functionName = "reduceTvlCap";
        args = [cap];
      } else {
        functionName = "scheduleTvlCapIncrease";
        args = [cap, witnessFor(cap)];
      }
    } else if (action.type === "execute-global") {
      functionName = "executeTvlCapIncrease";
      const pendingCap = data.creatorRiskPolicy.pendingTvlCap;
      if (!pendingCap) {
        throw new Error("There is no pending basket-limit increase.");
      }
      args = [witnessFor(BigInt(pendingCap.capUsdWad))];
    } else if (action.type === "cancel-global") {
      functionName = "cancelTvlCapIncrease";
    } else if (action.type === "set-asset") {
      const cap = parseUnits(action.capUsd || "0", 18);
      const current = data.assets.find(
        (asset) => asset.address.toLowerCase() === action.asset.toLowerCase(),
      );
      if (
        current?.creatorApproved === action.approved &&
        cap === BigInt(current.creatorCapUsdWad ?? "0")
      ) {
        throw new Error("Change the approval or cap before submitting.");
      }
      const isReduction =
        !action.approved ||
        Boolean(
          current?.creatorApproved &&
          cap <= BigInt(current.creatorCapUsdWad ?? "0"),
        );
      functionName = isReduction ? "reduceAssetPolicy" : "scheduleAssetPolicy";
      args = [action.asset, action.approved, cap];
    } else if (action.type === "execute-asset") {
      functionName = "executeAssetPolicy";
      args = [action.asset];
    } else if (action.type === "cancel-asset") {
      functionName = "cancelAssetPolicy";
      args = [action.asset];
    } else if (action.type === "propose-authority") {
      functionName = "proposeRiskAuthority";
      args = [action.authority];
    } else {
      functionName = "acceptRiskAuthority";
    }
    setMessage("Confirm the risk-policy transaction in your wallet…");
    const tx = await wallet.writeContract({
      address: controller,
      abi: creatorRiskControllerAbi,
      functionName: functionName as never,
      args: args as never,
    });
    await publicClient.waitForTransactionReceipt({
      hash: tx,
      ...receiptWaitPolicy,
    });
    const refreshed = await refreshAfterConfirmedAction();
    setMessage(
      confirmedActionMessage("Risk policy updated on chain.", refreshed),
    );
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
        network={data?.network ?? null}
        walletSource={walletSource}
        externalConnected={Boolean(external.address)}
        wrongChain={Boolean(
          external.address && data && external.chainId !== data.network.chainId,
        )}
        message={message}
        dark={dark}
        screen={screen}
        selectedId={selectedId}
        amount={amount}
        setAmount={setAmount}
        sellAmount={sellAmount}
        setSellAmount={setSellAmount}
        buyDexQuote={buyDexQuote}
        sellDexQuote={sellDexQuote}
        dexQuoteError={dexQuoteError}
        lastDexReceipt={lastDexReceipt}
        setScreen={setScreen}
        setSelectedId={setSelectedId}
        onToggleTheme={() => setDark(!dark)}
        onFaucet={() => faucet().catch((error) => setMessage(error.message))}
        onConnectWallet={() =>
          connectExternalWallet().catch((error) => setMessage(error.message))
        }
        onDisconnectWallet={() =>
          disconnectExternalWallet().catch((error) => setMessage(error.message))
        }
        onSwitchWallet={() =>
          switchExternalWallet().catch((error) => setMessage(error.message))
        }
        onResetWallet={resetBuiltInWallet}
        onCopyWallet={() =>
          copyWalletAddress().catch((error) => setMessage(error.message))
        }
        onDeposit={() =>
          deposit().catch((error) => setMessage(walletErrorMessage(error)))
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
        onControls={(piece, bundle) =>
          setControls(piece, bundle).catch((error) => {
            setMessage(error.shortMessage ?? error.message);
            throw error;
          })
        }
        onProfile={(piece, profile) =>
          changeProfile(piece, profile).catch((error) => {
            setMessage(error.shortMessage ?? error.message);
            throw error;
          })
        }
        onClaim={() =>
          claimRewards().catch((error) =>
            setMessage(error.shortMessage ?? error.message),
          )
        }
        onRiskAction={applyCreatorRiskAction}
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
              <b>BRAINCELLS</b>
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
              agent can only rebalance this local test basket once per scheduled
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
              <b>{data ? money(data.shares) : "0"}</b> BRAINS
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
              Claim rewards
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
                aria-label="USDG to spend"
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
                Buy BRAINS
              </button>
            </div>
            <button
              className="quiet full"
              onClick={() =>
                redeem().catch((e) => setMessage(e.shortMessage ?? e.message))
              }
            >
              Sell BRAINS
            </button>
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
                      <h3>{pieceDisplayName(piece)}</h3>
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
                      ? "Unowned · Initial sale to Creator"
                      : `Owned by ${short(piece.owner)}`}
                  </p>
                  {mine ? (
                    <select
                      aria-label={`Mood for ${pieceDisplayName(piece)}`}
                      value={piece.preset}
                      disabled={data.activation.controlBundlesEnabled}
                      onChange={(e) =>
                        legacyPreset(piece, Number(e.target.value)).catch(
                          (err) => setMessage(err.shortMessage ?? err.message),
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
