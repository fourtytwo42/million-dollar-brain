import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { createPublicClient, http, isAddress, parseAbi } from "viem";
import {
  continuousPassingWindow,
  qualificationWindowPassed,
} from "./lib/qualification-window.mjs";
import {
  CHAINLINK_ROBINHOOD_CATALOG,
  MAINNET_CORE_SYMBOLS,
  MAINNET_NOMINATED_SYMBOLS,
  chainlinkMappingsFromCatalog,
  officialHistoryCoverage,
  parseAllowlist,
  sessionAwareMaximumAgeSeconds,
  summarizeMainnetReadiness,
} from "./lib/mainnet-readiness.mjs";

const CHAIN_ID = 4663;
const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";
const ROBINHOOD_ASSETS = "https://api.robinhood.com/rhj/assets";
const ROBINHOOD_PRICE = "https://api.robinhood.com/rhj/prices";
const ZERO_EX_QUOTE = "https://api.0x.org/swap/allowance-holder/quote";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const repoRoot = resolve(import.meta.dirname, "..");
const statePath =
  process.env.MDB_MAINNET_SHADOW_STATE ??
  resolve(repoRoot, "var/mainnet-shadow/state.json");
const evidencePath =
  process.env.MDB_MAINNET_SHADOW_EVIDENCE ??
  resolve(repoRoot, "var/mainnet-shadow/qualification-evidence.jsonl");
const rpcUrl = process.env.MDB_MAINNET_SHADOW_RPC_URL ?? PUBLIC_RPC;
const apiKey = process.env.ZEROX_API_KEY ?? "";
const taker = process.env.MDB_MAINNET_SHADOW_TAKER ?? "";
const configuredChainlinkFeeds = JSON.parse(
  process.env.MDB_MAINNET_CHAINLINK_FEEDS_JSON ?? "{}",
);
let resolvedChainlinkFeeds = configuredChainlinkFeeds;
const chainlinkCatalogUrl =
  process.env.MDB_MAINNET_CHAINLINK_CATALOG_URL ?? CHAINLINK_ROBINHOOD_CATALOG;
const capitalizationEvidence = JSON.parse(
  process.env.MDB_MAINNET_CAPITALIZATION_EVIDENCE_JSON ?? "{}",
);
const secUserAgent =
  process.env.MDB_SEC_USER_AGENT ??
  "42-Braincells/1.0 operations@42braincells.com";
const allowedZeroExTargets = parseAllowlist(
  process.env.MDB_ZEROEX_ALLOWED_TARGETS,
);
const allowedZeroExAllowanceTargets = parseAllowlist(
  process.env.MDB_ZEROEX_ALLOWED_ALLOWANCE_TARGETS,
);
const allowedZeroExSelectors = parseAllowlist(
  process.env.MDB_ZEROEX_ALLOWED_SELECTORS,
);
const CAPITALIZATION_MINIMUM_USD = 100_000_000;
const IMPACT_NOTIONAL_USD = 25_000;
const DEPTH_NOTIONAL_USD = 250_000;
const MAXIMUM_IMPACT_BPS = 100;
const MAXIMUM_CAPITALIZATION_EVIDENCE_AGE_SECONDS = 172_800;
const QUALIFICATION_HOURS = 48;
const FUND_SYMBOLS = new Set(["SPY", "QQQ", "SOXX"]);

if (process.env.MDB_MAINNET_BROADCAST === "true") {
  throw new Error("mainnet shadow refuses broadcast mode");
}
if (process.env.MDB_OPERATOR_PRIVATE_KEY || process.env.PRIVATE_KEY) {
  throw new Error("mainnet shadow refuses transaction signing keys");
}

const client = createPublicClient({ transport: http(rpcUrl) });
const tokenAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function uid() view returns (bytes32)",
  "function oraclePaused() view returns (bool)",
]);
const feedAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)",
]);

const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function json(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${new URL(url).hostname} returned ${response.status}: ${text.slice(0, 240)}`,
    );
  }
  return JSON.parse(text);
}

let secTickersPromise;
function secHeaders() {
  return {
    accept: "application/json",
    "user-agent": secUserAgent,
  };
}

async function secTickers() {
  secTickersPromise ??= json("https://www.sec.gov/files/company_tickers.json", {
    headers: secHeaders(),
  });
  return secTickersPromise;
}

function latestFact(units, acceptedForms) {
  return Object.values(units ?? {})
    .flat()
    .filter(
      (row) =>
        Number.isFinite(Number(row?.val)) &&
        acceptedForms.has(row?.form) &&
        Number.isFinite(Date.parse(row?.filed ?? "")),
    )
    .sort((left, right) => Date.parse(right.filed) - Date.parse(left.filed))[0];
}

async function collectSecFundNetAssets(cik, source) {
  const submissions = await json(
    `https://data.sec.gov/submissions/CIK${cik}.json`,
    { headers: secHeaders() },
  );
  const recent = submissions?.filings?.recent ?? {};
  const index = (recent.form ?? []).findIndex((form) => form === "NPORT-P");
  if (index < 0) throw new Error("SEC N-PORT filing unavailable");
  const accession = String(recent.accessionNumber[index]).replaceAll("-", "");
  const primaryDocument = String(recent.primaryDocument[index])
    .split("/")
    .at(-1);
  const archiveSource = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/${primaryDocument}`;
  const response = await fetch(archiveSource, {
    headers: secHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  const xml = await response.text();
  if (!response.ok) throw new Error(`SEC N-PORT returned ${response.status}`);
  const valueUsd = Number(xml.match(/<netAssets>([^<]+)<\/netAssets>/)?.[1]);
  if (!Number.isFinite(valueUsd))
    throw new Error("SEC N-PORT net assets unavailable");
  return {
    kind: "fund",
    valueUsd,
    observedAt: new Date().toISOString(),
    reportDate: recent.reportDate?.[index] ?? null,
    filedAt: recent.filingDate?.[index] ?? null,
    source: archiveSource,
    sourceHash: hash({ source, archiveSource, xml }),
    supplyAdapterApproved: true,
    collection: "sec-nport",
  };
}

async function collectSecCapitalization(asset, priceUsd) {
  if (asset.symbol === "WETH") {
    try {
      const totalSupply = await client.readContract({
        address: asset.address,
        abi: tokenAbi,
        functionName: "totalSupply",
      });
      const valueUsd =
        (Number(totalSupply) / 10 ** Number(asset.decimals)) * priceUsd;
      return {
        kind: "crypto",
        valueUsd,
        observedAt: new Date().toISOString(),
        source:
          "https://docs.robinhood.com/chain/contracts/#wrapped-ether-weth",
        sourceHash: hash({
          chainId: CHAIN_ID,
          token: asset.address,
          totalSupply: totalSupply.toString(),
          priceUsd,
        }),
        supplyAdapterApproved: true,
        collection: "canonical-weth-deposit-supply",
      };
    } catch (error) {
      return {
        kind: "crypto",
        valueUsd: null,
        observedAt: null,
        source: "https://docs.robinhood.com/chain/contracts/",
        sourceHash: null,
        supplyAdapterApproved: false,
        collection: "canonical-weth-deposit-supply",
        error:
          error instanceof Error
            ? error.message
            : "WETH supply collection failed",
      };
    }
  }
  try {
    const tickers = await secTickers();
    const ticker = Object.values(tickers).find(
      (row) => row?.ticker?.toUpperCase() === asset.symbol,
    );
    if (!ticker) throw new Error("SEC ticker mapping unavailable");
    const cik = String(ticker.cik_str).padStart(10, "0");
    const source = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    if (FUND_SYMBOLS.has(asset.symbol))
      return await collectSecFundNetAssets(cik, source);
    const companyFacts = await json(source, { headers: secHeaders() });
    const facts = companyFacts?.facts?.["us-gaap"] ?? {};
    const deiFacts = companyFacts?.facts?.dei ?? {};
    const isFund = false;
    const fact = latestFact(
      deiFacts.EntityCommonStockSharesOutstanding?.units,
      new Set(["10-K", "10-Q", "10-K/A", "10-Q/A", "8-K"]),
    );
    if (!fact) throw new Error("SEC capitalization fact unavailable");
    const valueUsd = isFund ? Number(fact.val) : Number(fact.val) * priceUsd;
    return {
      kind: isFund ? "fund" : "stock",
      valueUsd,
      observedAt: new Date().toISOString(),
      reportDate: fact.end ?? null,
      filedAt: fact.filed,
      source,
      sourceHash: hash({ cik, fact }),
      supplyAdapterApproved: true,
      collection: "sec-company-facts",
    };
  } catch (error) {
    return {
      kind: FUND_SYMBOLS.has(asset.symbol) ? "fund" : "stock",
      valueUsd: null,
      observedAt: null,
      source: "https://data.sec.gov/",
      sourceHash: null,
      supplyAdapterApproved: false,
      collection: "sec-company-facts",
      error: error instanceof Error ? error.message : "SEC collection failed",
    };
  }
}

async function inspectTokens(assets) {
  const rows = assets.map((asset) => ({
    ...asset,
    codePresent: false,
    decimals: null,
    onchainUid: null,
    oraclePaused: null,
    errors: [],
  }));
  const calls = [];
  for (const [index, asset] of assets.entries()) {
    calls.push({
      index,
      field: "decimals",
      contract: {
        address: asset.address,
        abi: tokenAbi,
        functionName: "decimals",
      },
    });
    if (asset.uid) {
      calls.push({
        index,
        field: "uid",
        contract: {
          address: asset.address,
          abi: tokenAbi,
          functionName: "uid",
        },
      });
      calls.push({
        index,
        field: "oraclePaused",
        contract: {
          address: asset.address,
          abi: tokenAbi,
          functionName: "oraclePaused",
        },
      });
    }
  }
  const results = await client.multicall({
    allowFailure: true,
    batchSize: 100_000,
    contracts: calls.map((call) => call.contract),
    multicallAddress: MULTICALL3,
  });
  for (const [callIndex, call] of calls.entries()) {
    const result = results[callIndex];
    const row = rows[call.index];
    if (result.status === "failure") {
      row.errors.push(`${call.field} unavailable`);
      continue;
    }
    row.codePresent = true;
    if (call.field === "decimals") {
      row.decimals = Number(result.result);
    } else if (call.field === "uid") {
      row.onchainUid = result.result;
      if (row.onchainUid.toLowerCase() !== row.uid.toLowerCase()) {
        row.errors.push("uid mismatch");
      }
    } else {
      row.oraclePaused = result.result;
      if (row.oraclePaused) row.errors.push("oracle paused");
    }
  }
  for (const row of rows) {
    if (!row.codePresent) row.errors.unshift("no callable runtime code");
  }
  return rows;
}

async function quotePair(asset, direction, priceUsd, notionalUsd) {
  if (!apiKey) return { valid: false, reason: "ZEROX_API_KEY not configured" };
  if (!isAddress(taker)) {
    return { valid: false, reason: "MDB_MAINNET_SHADOW_TAKER not configured" };
  }
  const sellToken = direction === "buy" ? USDG : asset.address;
  const buyToken = direction === "buy" ? asset.address : USDG;
  const sellAmount =
    direction === "buy"
      ? BigInt(notionalUsd) * 10n ** 6n
      : ((BigInt(notionalUsd) * 10n ** BigInt(asset.decimals ?? 18)) /
          BigInt(Math.max(1, Math.round(priceUsd * 1e6)))) *
        1_000_000n;
  const parameters = new URLSearchParams({
    chainId: String(CHAIN_ID),
    sellToken,
    buyToken,
    sellAmount: sellAmount.toString(),
    taker,
    slippageBps: "100",
  });
  try {
    const quote = await json(`${ZERO_EX_QUOTE}?${parameters}`, {
      headers: { "0x-api-key": apiKey, "0x-version": "v2" },
    });
    const target = quote.transaction?.to;
    const allowanceTarget =
      quote.issues?.allowance?.spender ?? quote.allowanceTarget ?? null;
    const selector = quote.transaction?.data?.slice(0, 10)?.toLowerCase();
    const policyConfigured =
      allowedZeroExTargets.size > 0 &&
      allowedZeroExAllowanceTargets.size > 0 &&
      allowedZeroExSelectors.size > 0;
    const policyValid =
      policyConfigured &&
      allowedZeroExTargets.has(target?.toLowerCase()) &&
      allowedZeroExAllowanceTargets.has(allowanceTarget?.toLowerCase()) &&
      allowedZeroExSelectors.has(selector);
    const structurallyValid =
      isAddress(target) &&
      isAddress(allowanceTarget) &&
      BigInt(quote.sellAmount ?? 0) === sellAmount &&
      BigInt(quote.buyAmount ?? 0) > 0n &&
      typeof quote.transaction?.data === "string" &&
      quote.transaction.data.startsWith("0x");
    const valid = structurallyValid && policyValid;
    const realizedUsd =
      direction === "buy"
        ? (Number(quote.buyAmount ?? 0) / 10 ** Number(asset.decimals ?? 18)) *
          priceUsd
        : Number(quote.buyAmount ?? 0) / 1e6;
    const impactBps = Math.max(
      0,
      Math.round(((notionalUsd - realizedUsd) / notionalUsd) * 10_000),
    );
    return {
      valid,
      direction,
      notionalUsd,
      sellAmount: quote.sellAmount ?? null,
      buyAmount: quote.buyAmount ?? null,
      realizedUsd,
      impactBps,
      blockNumber: quote.blockNumber ?? null,
      target: target ?? null,
      allowanceTarget,
      selector: selector ?? null,
      policyConfigured,
      policyValid,
      simulationIncomplete: quote.issues?.simulationIncomplete ?? false,
      sourceHash: hash(quote),
      reason: valid
        ? null
        : !structurallyValid
          ? "0x response failed structural validation"
          : "0x target, allowance target, or selector is not frozen in policy",
    };
  } catch (error) {
    return {
      valid: false,
      direction,
      reason: error instanceof Error ? error.message : "0x quote failed",
    };
  }
}

async function inspectFeed(asset) {
  const configuredFeed = resolvedChainlinkFeeds[asset.symbol];
  const feed =
    typeof configuredFeed === "string"
      ? configuredFeed
      : configuredFeed?.address;
  const maximumAgeSeconds =
    typeof configuredFeed === "object" &&
    Number.isFinite(Number(configuredFeed?.maximumAgeSeconds))
      ? Number(configuredFeed.maximumAgeSeconds)
      : sessionAwareMaximumAgeSeconds(configuredFeed);
  if (!isAddress(feed)) {
    return {
      symbol: asset.symbol,
      valid: false,
      reason: "Chainlink feed mapping not configured",
    };
  }
  try {
    const [decimals, round] = await Promise.all([
      client.readContract({
        address: feed,
        abi: feedAbi,
        functionName: "decimals",
      }),
      client.readContract({
        address: feed,
        abi: feedAbi,
        functionName: "latestRoundData",
      }),
    ]);
    const ageSeconds = Math.max(
      0,
      Math.floor(Date.now() / 1_000) - Number(round[3]),
    );
    const valid =
      round[1] > 0n &&
      round[3] > 0n &&
      round[4] >= round[0] &&
      ageSeconds <= maximumAgeSeconds;
    return {
      symbol: asset.symbol,
      feed,
      decimals: Number(decimals),
      roundId: round[0].toString(),
      answer: round[1].toString(),
      priceUsd: Number(round[1]) / 10 ** Number(decimals),
      updatedAt: Number(round[3]),
      ageSeconds,
      maximumAgeSeconds,
      marketHours: configuredFeed?.marketHours ?? null,
      catalogPath: configuredFeed?.path ?? null,
      catalogSourceHash: configuredFeed?.sourceHash ?? null,
      valid,
      reason: valid ? null : "invalid, incomplete, or stale Chainlink round",
    };
  } catch (error) {
    return {
      symbol: asset.symbol,
      feed,
      valid: false,
      reason: error instanceof Error ? error.message : "feed read failed",
    };
  }
}

function classifyAsset(asset) {
  if (asset.symbol === "WETH") return "crypto";
  if (FUND_SYMBOLS.has(asset.symbol)) return "fund";
  if (/\b(ETF|FUND|TRUST)\b/i.test(asset.name)) return "fund";
  return "stock";
}

function inspectCapitalization(asset, collectedEvidence) {
  const evidence = capitalizationEvidence[asset.symbol] ?? collectedEvidence;
  const expectedKind = classifyAsset(asset);
  const observedAt = Date.parse(evidence?.observedAt ?? "");
  const ageSeconds = Number.isFinite(observedAt)
    ? Math.max(0, Math.floor((Date.now() - observedAt) / 1_000))
    : null;
  const valueUsd = Number(evidence?.valueUsd);
  const sourceHashValid = /^[a-f0-9]{64}$/i.test(evidence?.sourceHash ?? "");
  const sourceValid =
    typeof evidence?.source === "string" &&
    /^https:\/\/(www\.sec\.gov|data\.sec\.gov|[^/]*robinhood\.com|[^/]*chainlink\.com|[^/]*coinbase\.com)\//i.test(
      evidence.source,
    );
  const kindValid =
    evidence?.kind === expectedKind ||
    (expectedKind === "fund" && evidence?.kind === "etf");
  const supplyAdapterValid =
    expectedKind !== "crypto" || evidence?.supplyAdapterApproved === true;
  const valid =
    Number.isFinite(valueUsd) &&
    valueUsd >= CAPITALIZATION_MINIMUM_USD &&
    ageSeconds !== null &&
    ageSeconds <= MAXIMUM_CAPITALIZATION_EVIDENCE_AGE_SECONDS &&
    sourceHashValid &&
    sourceValid &&
    kindValid &&
    supplyAdapterValid;
  return {
    kind: expectedKind,
    metric: expectedKind === "fund" ? "aum" : "circulatingMarketCap",
    valueUsd: Number.isFinite(valueUsd) ? valueUsd : null,
    observedAt: evidence?.observedAt ?? null,
    ageSeconds,
    source: evidence?.source ?? null,
    sourceHash: evidence?.sourceHash ?? null,
    supplyAdapterApproved: evidence?.supplyAdapterApproved === true,
    valid,
    reason: valid
      ? null
      : "missing, stale, unapproved, or sub-$100M capitalization evidence",
    collectionError: evidence?.error ?? null,
  };
}

function priorQualificationEvidence() {
  if (!existsSync(evidencePath)) return [];
  return readFileSync(evidencePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

async function parallelMap(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

const startedAt = new Date().toISOString();
const chainId = await client.getChainId();
if (chainId !== CHAIN_ID)
  throw new Error(`shadow RPC chain is ${chainId}, expected 4663`);
const registry = await json(ROBINHOOD_ASSETS);
const stockAssets = (registry.assets ?? [])
  .filter((asset) => asset.status === "ASSET_STATUS_ACTIVE")
  .map((asset) => {
    const deployment = asset.deployments?.find(
      (row) => row.chainId === CHAIN_ID,
    );
    if (!deployment || !isAddress(deployment.contractAddress)) return null;
    return {
      symbol: asset.tokenSymbol,
      name: asset.tokenName,
      address: deployment.contractAddress,
      uid: asset.id,
      currentMultiplier: asset.currentMultiplier,
      pendingMultiplier: asset.pendingMultiplier || null,
      pendingMultiplierEffectiveTime:
        asset.pendingMultiplierEffectiveTime ?? null,
      tradingCapabilities: asset.tradingCapabilities ?? null,
      source: ROBINHOOD_ASSETS,
    };
  })
  .filter(Boolean);

const canonicalAssets = [
  {
    symbol: "USDG",
    name: "Global Dollar",
    address: USDG,
    uid: null,
    currentMultiplier: "1",
    source: "https://docs.robinhood.com/chain/contracts/",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: WETH,
    uid: null,
    currentMultiplier: "1",
    source: "https://docs.robinhood.com/chain/contracts/",
  },
  ...stockAssets,
];
const inspected = await inspectTokens(canonicalAssets);
const nominated = new Set(
  (
    process.env.MDB_MAINNET_SHADOW_SYMBOLS ??
    MAINNET_NOMINATED_SYMBOLS.join(",")
  )
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean),
);
const nominatedAssets = inspected.filter(
  (asset) => nominated.has(asset.symbol) && asset.symbol !== "USDG",
);
let chainlinkCatalogHash = null;
if (Object.keys(resolvedChainlinkFeeds).length === 0) {
  try {
    const catalog = await json(chainlinkCatalogUrl);
    chainlinkCatalogHash = hash(catalog);
    resolvedChainlinkFeeds = chainlinkMappingsFromCatalog(catalog, [
      ...nominated,
    ]);
  } catch {
    resolvedChainlinkFeeds = {};
  }
}
const feedEvidence = await parallelMap(nominatedAssets, 6, inspectFeed);
const priorEvidence = priorQualificationEvidence();
const quoteEvidence = [];
const marketEvidence = [];
for (const asset of nominatedAssets) {
  let priceUsd = null;
  if (asset.symbol === "WETH") {
    priceUsd =
      feedEvidence.find((row) => row.symbol === asset.symbol)?.priceUsd ?? null;
  } else {
    try {
      const price = await json(`${ROBINHOOD_PRICE}/${asset.symbol}`);
      const row = price.quotes?.[0];
      const midpoint = (Number(row?.bid) + Number(row?.ask)) / 2;
      priceUsd = midpoint * Number(asset.currentMultiplier);
    } catch {
      priceUsd = null;
    }
  }
  const assetId = `${CHAIN_ID}:${asset.address.toLowerCase()}`;
  const historyRows = [
    ...priorEvidence,
    {
      at: new Date().toISOString(),
      assets: [{ assetId, symbol: asset.symbol, officialPriceUsd: priceUsd }],
    },
  ];
  const history = officialHistoryCoverage(
    historyRows,
    assetId,
    asset.symbol,
    new Date().toISOString(),
  );
  const collectedCapitalization =
    capitalizationEvidence[asset.symbol] ??
    (priceUsd && priceUsd > 0
      ? await collectSecCapitalization(asset, priceUsd)
      : null);
  const capitalization = inspectCapitalization(asset, collectedCapitalization);
  if (!priceUsd || priceUsd <= 0) {
    quoteEvidence.push({
      symbol: asset.symbol,
      impactBuy: { valid: false, reason: "official token price unavailable" },
      impactSell: { valid: false, reason: "official token price unavailable" },
      depthBuy: { valid: false, reason: "official token price unavailable" },
      depthSell: { valid: false, reason: "official token price unavailable" },
    });
    marketEvidence.push({
      symbol: asset.symbol,
      capitalization,
      history,
      officialPriceUsd: null,
    });
    continue;
  }
  quoteEvidence.push({
    symbol: asset.symbol,
    impactBuy: await quotePair(asset, "buy", priceUsd, IMPACT_NOTIONAL_USD),
    impactSell: await quotePair(asset, "sell", priceUsd, IMPACT_NOTIONAL_USD),
    depthBuy: await quotePair(asset, "buy", priceUsd, DEPTH_NOTIONAL_USD),
    depthSell: await quotePair(asset, "sell", priceUsd, DEPTH_NOTIONAL_USD),
  });
  marketEvidence.push({
    symbol: asset.symbol,
    capitalization,
    history,
    officialPriceUsd: priceUsd,
  });
}
const qualification = inspected
  .filter((asset) => nominated.has(asset.symbol) && asset.symbol !== "USDG")
  .map((asset) => {
    const quote = quoteEvidence.find((row) => row.symbol === asset.symbol);
    const feed = feedEvidence.find((row) => row.symbol === asset.symbol);
    const market = marketEvidence.find((row) => row.symbol === asset.symbol);
    const tradingAvailable =
      asset.symbol === "WETH" ||
      Object.values(asset.tradingCapabilities ?? {}).some(
        (session) =>
          session?.whole === "TRADING_STATUS_TRADABLE" ||
          session?.fractional === "TRADING_STATUS_TRADABLE",
      );
    const identityValid =
      asset.codePresent &&
      (!asset.uid ||
        asset.onchainUid?.toLowerCase() === asset.uid.toLowerCase());
    const noCorporateActionTransition =
      !asset.pendingMultiplier ||
      Number(asset.pendingMultiplier) === Number(asset.currentMultiplier);
    const impactValid =
      quote?.impactBuy?.valid === true &&
      quote?.impactSell?.valid === true &&
      quote.impactBuy.impactBps <= MAXIMUM_IMPACT_BPS &&
      quote.impactSell.impactBps <= MAXIMUM_IMPACT_BPS;
    const depthValid =
      quote?.depthBuy?.valid === true && quote?.depthSell?.valid === true;
    const passed =
      identityValid &&
      asset.oraclePaused !== true &&
      tradingAvailable &&
      noCorporateActionTransition &&
      feed?.valid === true &&
      impactValid &&
      depthValid &&
      market?.capitalization?.valid === true &&
      market?.history?.valid === true;
    const assetId = `${CHAIN_ID}:${asset.address.toLowerCase()}`;
    const priorAssetRows = priorEvidence
      .flatMap((row) =>
        (row.assets ?? []).map((candidate) => ({
          ...candidate,
          at: candidate.at ?? row.at,
        })),
      )
      .filter((row) => row.assetId === assetId);
    const windowRows = [
      ...priorAssetRows,
      { at: new Date().toISOString(), passed },
    ];
    const window = continuousPassingWindow(windowRows);
    const windowPassed = qualificationWindowPassed({
      ...window,
      requiredHours: QUALIFICATION_HOURS,
      requiresMarketSessions: asset.symbol !== "WETH",
    });
    return {
      assetId,
      symbol: asset.symbol,
      passed,
      required: MAINNET_CORE_SYMBOLS.includes(asset.symbol),
      qualificationHours: window.qualificationHours,
      regularMarketSessions: window.regularMarketSessions,
      qualificationWindowPassed: windowPassed,
      qualificationStartedAt: window.qualificationStartedAt,
      latestSuccessfulCheckAt: window.latestSuccessfulCheckAt,
      resetReason: passed
        ? null
        : Object.entries({
            identity: identityValid,
            oracle: asset.oraclePaused !== true,
            trading: tradingAvailable,
            corporateAction: noCorporateActionTransition,
            feed: feed?.valid === true,
            impact: impactValid,
            depth: depthValid,
            capitalization: market?.capitalization?.valid === true,
            history: market?.history?.valid === true,
          })
            .filter(([, valid]) => !valid)
            .map(([name]) => name)
            .join(", "),
      checks: {
        identityValid,
        oracleActive: asset.oraclePaused !== true,
        tradingAvailable,
        noCorporateActionTransition,
        feedValid: feed?.valid === true,
        impactValid,
        depthValid,
        capitalizationValid: market?.capitalization?.valid === true,
        historyValid: market?.history?.valid === true,
      },
    };
  });
const readiness = summarizeMainnetReadiness(qualification);
const requiredQualification = qualification.filter((row) => row.required);
const currentQualificationPass =
  requiredQualification.length === MAINNET_CORE_SYMBOLS.length &&
  requiredQualification.every((row) => row.passed);
const qualificationHours =
  requiredQualification.length > 0
    ? Math.min(...requiredQualification.map((row) => row.qualificationHours))
    : 0;
const allQualificationWindowsPassed = readiness.coreQualificationPassed;

const result = {
  schemaVersion: 3,
  mode: "robinhood-mainnet-shadow",
  startedAt,
  completedAt: new Date().toISOString(),
  chainId,
  rpc: rpcUrl === PUBLIC_RPC ? "public-rate-limited" : "configured-provider",
  broadcastPermitted: false,
  officialRegistry: ROBINHOOD_ASSETS,
  chainlinkCatalog: chainlinkCatalogUrl,
  chainlinkCatalogHash,
  canonicalAssetCount: inspected.length,
  assets: inspected.filter(
    (asset) => asset.symbol === "USDG" || nominated.has(asset.symbol),
  ),
  quoteEvidence,
  feedEvidence,
  marketEvidence,
  qualification,
  qualificationHours,
  qualificationRequiredHours: QUALIFICATION_HOURS,
  qualificationWindowPassed: allQualificationWindowsPassed,
  readiness,
  gates: {
    noSigningKey: true,
    canonicalIdentityChecked: MAINNET_CORE_SYMBOLS.every((symbol) => {
      const asset = inspected.find((candidate) => candidate.symbol === symbol);
      return (
        asset?.codePresent === true &&
        (!asset.uid ||
          asset.onchainUid?.toLowerCase() === asset.uid.toLowerCase())
      );
    }),
    zeroExConfigured: Boolean(apiKey),
    zeroExPolicyFrozen:
      allowedZeroExTargets.size > 0 &&
      allowedZeroExAllowanceTargets.size > 0 &&
      allowedZeroExSelectors.size > 0,
    twoSidedQuotesValid: MAINNET_CORE_SYMBOLS.every((symbol) => {
      const row = quoteEvidence.find(
        (candidate) => candidate.symbol === symbol,
      );
      return (
        row &&
        row.impactBuy.valid &&
        row.impactSell.valid &&
        row.impactBuy.impactBps <= MAXIMUM_IMPACT_BPS &&
        row.impactSell.impactBps <= MAXIMUM_IMPACT_BPS &&
        row.depthBuy.valid &&
        row.depthSell.valid
      );
    }),
    chainlinkMappingsConfigured: MAINNET_CORE_SYMBOLS.every(
      (symbol) =>
        feedEvidence.find((row) => row.symbol === symbol)?.valid === true,
    ),
    qualificationWindowPassed: allQualificationWindowsPassed,
  },
};
result.readyToBuildCandidate =
  result.gates.noSigningKey &&
  result.gates.canonicalIdentityChecked &&
  result.gates.zeroExConfigured &&
  result.gates.zeroExPolicyFrozen &&
  result.gates.twoSidedQuotesValid &&
  result.gates.chainlinkMappingsConfigured &&
  result.gates.qualificationWindowPassed;
result.sourceHash = hash(result);
mkdirSync(dirname(statePath), { recursive: true });
writeFileSync(statePath, `${JSON.stringify(result, null, 2)}\n`, {
  mode: 0o640,
});
appendFileSync(
  evidencePath,
  `${JSON.stringify({
    at: result.completedAt,
    sourceHash: result.sourceHash,
    gates: result.gates,
    passed: currentQualificationPass,
    qualificationHours,
    qualificationRequiredHours: QUALIFICATION_HOURS,
    qualificationWindowPassed: allQualificationWindowsPassed,
    readiness,
    canonicalAssetCount: result.canonicalAssetCount,
    assets: qualification.map((row) => ({
      assetId: row.assetId,
      symbol: row.symbol,
      passed: row.passed,
      required: row.required,
      officialPriceUsd:
        marketEvidence.find((market) => market.symbol === row.symbol)
          ?.officialPriceUsd ?? null,
      qualificationHours: row.qualificationHours,
      regularMarketSessions: row.regularMarketSessions,
      qualificationWindowPassed: row.qualificationWindowPassed,
      qualificationStartedAt: row.qualificationStartedAt,
      latestSuccessfulCheckAt: row.latestSuccessfulCheckAt,
      resetReason: row.resetReason,
    })),
  })}\n`,
  { mode: 0o640 },
);
console.log(
  JSON.stringify({
    statePath,
    sourceHash: result.sourceHash,
    gates: result.gates,
  }),
);
