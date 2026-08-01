// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { AssetRegistry } from "../src/AssetRegistry.sol";
import { DexTwapValuationAdapter } from "../src/DexTwapValuationAdapter.sol";
import { UniswapExecutionAdapter } from "../src/UniswapExecutionAdapter.sol";
import { RewardDistributor } from "../src/RewardDistributor.sol";
import { CreatorVault } from "../src/CreatorVault.sol";
import { BrainMarketplace } from "../src/BrainMarketplace.sol";
import { BasketVault } from "../src/BasketVault.sol";
import { CreatorRiskController } from "../src/CreatorRiskController.sol";

interface IRobinhoodIdentity {
    function uid() external view returns (bytes32);
}

interface IUniswapPoolFee {
    function fee() external view returns (uint24);
}

/// @notice Broadcast-disabled production deployment package for Robinhood mainnet.
/// @dev The shell release gate supplies only canonical addresses and refuses mock manifests.
contract DeployMainnet is Script {
    uint256 internal constant CHAIN_ID = 4663;
    uint256 internal constant INITIAL_TVL_CAP = 60_000e18;
    address internal constant CANONICAL_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address internal constant CANONICAL_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    function run() external {
        require(block.chainid == CHAIN_ID, "mainnet chain only");
        address deployer = vm.envAddress("MDB_DEPLOYER_ADDRESS");
        string memory releaseSha = vm.envString("MDB_RELEASE_SHA");
        require(bytes(releaseSha).length == 40, "release SHA");
        address[] memory riskAssets = vm.envAddress("MDB_MAINNET_RISK_ASSETS", ",");
        uint256[] memory assetIds = vm.envUint("MDB_MAINNET_ASSET_IDS", ",");
        uint256[] memory assetKinds = vm.envUint("MDB_MAINNET_ASSET_KINDS", ",");
        uint256[] memory riskClasses = vm.envUint("MDB_MAINNET_RISK_CLASSES", ",");
        uint256[] memory maximumWeights = vm.envUint("MDB_MAINNET_MAX_WEIGHTS_BPS", ",");
        uint256[] memory safeCapacities = vm.envUint("MDB_MAINNET_SAFE_CAPACITY_USD_WAD", ",");
        uint256[] memory qualificationHours = vm.envUint("MDB_MAINNET_QUALIFICATION_HOURS", ",");
        uint256[] memory marketSessions = vm.envUint("MDB_MAINNET_MARKET_SESSIONS", ",");
        bytes32[] memory qualificationHashes =
            vm.envBytes32("MDB_MAINNET_QUALIFICATION_HASHES", ",");
        address uniswapFactory = vm.envAddress("MDB_UNISWAP_FACTORY");
        address uniswapRouter = vm.envAddress("MDB_UNISWAP_ROUTER");
        address[] memory directPools = vm.envAddress("MDB_MAINNET_DIRECT_POOLS", ",");
        address[] memory bridgePools = vm.envAddress("MDB_MAINNET_BRIDGE_POOLS", ",");
        uint256[] memory minimumDirectLiquidity =
            vm.envUint("MDB_MAINNET_MIN_DIRECT_LIQUIDITY", ",");
        uint256[] memory minimumBridgeLiquidity =
            vm.envUint("MDB_MAINNET_MIN_BRIDGE_LIQUIDITY", ",");
        require(
            deployer != address(0) && uniswapFactory != address(0) && uniswapRouter != address(0),
            "zero role"
        );
        require(
            riskAssets.length > 0 && riskAssets.length == assetKinds.length
                && riskAssets.length == assetIds.length && riskAssets.length == riskClasses.length
                && riskAssets.length == maximumWeights.length
                && riskAssets.length == safeCapacities.length
                && riskAssets.length == qualificationHours.length
                && riskAssets.length == marketSessions.length
                && riskAssets.length == qualificationHashes.length
                && riskAssets.length == directPools.length
                && riskAssets.length == bridgePools.length
                && riskAssets.length == minimumDirectLiquidity.length
                && riskAssets.length == minimumBridgeLiquidity.length,
            "DEX manifest"
        );
        vm.startBroadcast();

        AssetRegistry registry = AssetRegistry(
            address(
                new ERC1967Proxy(
                    address(new AssetRegistry()),
                    abi.encodeCall(AssetRegistry.initialize, (deployer, CHAIN_ID))
                )
            )
        );
        DexTwapValuationAdapter valuation = DexTwapValuationAdapter(
            address(
                new ERC1967Proxy(
                    address(new DexTwapValuationAdapter()),
                    abi.encodeCall(
                        DexTwapValuationAdapter.initialize,
                        (deployer, CANONICAL_USDG, CANONICAL_WETH, 1_800)
                    )
                )
            )
        );
        valuation.reinitializeV2(4 hours);

        for (uint256 i; i < riskAssets.length; ++i) {
            address token = riskAssets[i];
            require(token.code.length > 0, "canonical code");
            require(IERC20Metadata(token).decimals() <= 36, "token decimals");
            require(
                assetKinds[i] > 0 && assetKinds[i] <= uint8(AssetRegistry.AssetKind.TOKEN), "kind"
            );
            require(
                riskClasses[i] > 0
                    && riskClasses[i] <= uint8(AssetRegistry.RiskClass.HIGH_VOLATILITY),
                "risk"
            );
            require(maximumWeights[i] > 0 && maximumWeights[i] <= 2_000, "weight");
            valuation.configureRoute(
                token,
                DexTwapValuationAdapter.TwapRoute({
                    directPool: directPools[i],
                    bridgePool: bridgePools[i],
                    minimumDirectLiquidity: uint128(minimumDirectLiquidity[i]),
                    minimumBridgeLiquidity: uint128(minimumBridgeLiquidity[i]),
                    minimumObservationCardinality: 2,
                    maximumObservationAge: 3_600,
                    enabled: true
                })
            );
            valuation.configureSafety(
                token,
                DexTwapValuationAdapter.DexSafetyConfig({
                    minimumDirectHarmonicLiquidity: uint128(minimumDirectLiquidity[i]),
                    minimumBridgeHarmonicLiquidity: uint128(minimumBridgeLiquidity[i]),
                    maximumSpotToShortDeviationBps: 300,
                    maximumShortToLongDeviationBps: 500,
                    enabled: true
                })
            );
        }

        uint256[] memory rewardWeights = new uint256[](42);
        uint16[] memory brainWeights = new uint16[](42);
        for (uint256 i; i < 42; ++i) {
            rewardWeights[i] = 238;
            brainWeights[i] = 238;
        }
        rewardWeights[0] += 4;
        brainWeights[0] += 4;
        CreatorVault creatorVault = CreatorVault(
            address(
                new ERC1967Proxy(
                    address(new CreatorVault()),
                    abi.encodeCall(CreatorVault.initialize, (deployer, CANONICAL_USDG))
                )
            )
        );
        RewardDistributor rewards = RewardDistributor(
            address(
                new ERC1967Proxy(
                    address(new RewardDistributor()),
                    abi.encodeCall(
                        RewardDistributor.initialize,
                        (deployer, CANONICAL_USDG, rewardWeights, address(creatorVault))
                    )
                )
            )
        );
        BrainMarketplace brain = BrainMarketplace(
            address(
                new ERC1967Proxy(
                    address(new BrainMarketplace()),
                    abi.encodeCall(
                        BrainMarketplace.initialize,
                        (
                            deployer,
                            CANONICAL_USDG,
                            address(rewards),
                            address(creatorVault),
                            brainWeights,
                            42_000e6,
                            3,
                            keccak256("MDB_BRAIN_CATALOG_V3")
                        )
                    )
                )
            )
        );
        rewards.grantRole(rewards.BRAIN_ROLE(), address(brain));
        brain.reinitializeV2(false);

        BasketVault basket = BasketVault(
            address(
                new ERC1967Proxy(
                    address(new BasketVault()),
                    abi.encodeCall(
                        BasketVault.initialize,
                        (
                            deployer,
                            CANONICAL_USDG,
                            deployer,
                            address(rewards),
                            address(creatorVault),
                            deployer,
                            riskAssets
                        )
                    )
                )
            )
        );
        address[] memory bootstrapAssets = new address[](1);
        uint16[] memory bootstrapWeights = new uint16[](1);
        bootstrapAssets[0] = CANONICAL_USDG;
        bootstrapWeights[0] = 10_000;
        basket.reinitializeV2(address(valuation), 900, 100, bootstrapAssets, bootstrapWeights);
        UniswapExecutionAdapter execution = UniswapExecutionAdapter(
            address(
                new ERC1967Proxy(
                    address(new UniswapExecutionAdapter()),
                    abi.encodeCall(
                        UniswapExecutionAdapter.initializeDexOnly,
                        (
                            deployer,
                            address(basket),
                            CANONICAL_USDG,
                            CANONICAL_WETH,
                            uniswapFactory,
                            uniswapRouter,
                            address(valuation)
                        )
                    )
                )
            )
        );
        registry.registerAsset(
            AssetRegistry.AssetRecord({
                token: CANONICAL_USDG,
                robinhoodUid: bytes32(0),
                kind: AssetRegistry.AssetKind.RESERVE,
                riskClass: AssetRegistry.RiskClass.RESERVE,
                valuationAdapter: address(valuation),
                executionAdapter: address(execution),
                circulatingSupplyAdapter: address(0),
                maximumWeightBps: 0,
                registered: false,
                active: false
            })
        );
        bytes32[] memory reserveTags = new bytes32[](2);
        reserveTags[0] = bytes32("reserve");
        reserveTags[1] = bytes32("stablecoin");
        registry.configureAssetIdentity(CANONICAL_USDG, 1, reserveTags);
        for (uint256 i; i < riskAssets.length; ++i) {
            address token = riskAssets[i];
            bool isWeth = token == CANONICAL_WETH;
            bytes32 uid = isWeth ? bytes32(0) : IRobinhoodIdentity(token).uid();
            registry.registerAsset(
                AssetRegistry.AssetRecord({
                    token: token,
                    robinhoodUid: uid,
                    kind: AssetRegistry.AssetKind(assetKinds[i]),
                    riskClass: AssetRegistry.RiskClass(riskClasses[i]),
                    valuationAdapter: address(valuation),
                    executionAdapter: address(execution),
                    circulatingSupplyAdapter: address(0),
                    maximumWeightBps: uint16(maximumWeights[i]),
                    registered: false,
                    active: false
                })
            );
            require(assetIds[i] > 1 && assetIds[i] <= type(uint32).max, "asset id");
            bytes32[] memory tags = new bytes32[](2);
            tags[0] = assetKinds[i] == uint8(AssetRegistry.AssetKind.STOCK)
                ? bytes32("stock")
                : assetKinds[i] == uint8(AssetRegistry.AssetKind.ETF)
                    ? bytes32("etf")
                    : bytes32("crypto");
            tags[1] = riskClasses[i] == uint8(AssetRegistry.RiskClass.HIGH_VOLATILITY)
                ? bytes32("high_volatility")
                : bytes32("standard_risk");
            registry.configureAssetIdentity(token, uint32(assetIds[i]), tags);
            execution.setPool(directPools[i], true);
            execution.setFeeTier(IUniswapPoolFee(directPools[i]).fee(), true);
            if (bridgePools[i] != address(0)) {
                execution.setPool(bridgePools[i], true);
                execution.setFeeTier(IUniswapPoolFee(bridgePools[i]).fee(), true);
            }
        }
        registry.reinitializeV3();
        registry.recordQualificationV3(
            CANONICAL_USDG,
            AssetRegistry.AssetQualificationV3({
                evidenceHash: keccak256(
                    abi.encode("canonical-mainnet-usdg", block.chainid, CANONICAL_USDG)
                ),
                observedAt: uint64(block.timestamp),
                validUntil: uint64(block.timestamp + 2 hours),
                consecutiveHours: 0,
                regularMarketSessions: 0,
                safeTwoSidedCapacityUsdWad: 0,
                identityValid: true,
                routeMature: false,
                shortTwapValid: false,
                longTwapValid: false,
                timeWeightedLiquidityValid: false,
                liquidityValid: false,
                transferBehaviorValid: true,
                tokenStateClear: true
            })
        );
        for (uint256 i; i < riskAssets.length; ++i) {
            require(qualificationHours[i] <= type(uint32).max, "qualification hours");
            require(marketSessions[i] <= type(uint8).max, "market sessions");
            registry.recordQualificationV3(
                riskAssets[i],
                AssetRegistry.AssetQualificationV3({
                    evidenceHash: qualificationHashes[i],
                    observedAt: uint64(block.timestamp),
                    validUntil: uint64(block.timestamp + 2 hours),
                    consecutiveHours: uint32(qualificationHours[i]),
                    regularMarketSessions: uint8(marketSessions[i]),
                    safeTwoSidedCapacityUsdWad: uint128(safeCapacities[i]),
                    identityValid: true,
                    routeMature: true,
                    shortTwapValid: true,
                    longTwapValid: true,
                    timeWeightedLiquidityValid: true,
                    liquidityValid: true,
                    transferBehaviorValid: true,
                    tokenStateClear: true
                })
            );
        }
        registry.setQualificationV3Enabled(true);
        registry.setActive(CANONICAL_USDG, true);
        basket.reinitializeV3(address(registry), address(execution));
        basket.reinitializeV4(false, false, false);
        basket.reinitializeV5(address(valuation), address(execution));
        basket.reinitializeV6(INITIAL_TVL_CAP);
        basket.setDexPriceAge(1 hours);
        CreatorRiskController riskController = CreatorRiskController(
            address(
                new ERC1967Proxy(
                    address(new CreatorRiskController()),
                    abi.encodeCall(
                        CreatorRiskController.initialize,
                        (deployer, address(basket), address(registry), uint64(48 hours))
                    )
                )
            )
        );
        address[] memory initiallyApproved = new address[](1);
        initiallyApproved[0] = CANONICAL_USDG;
        registry.reinitializeV4(address(riskController), initiallyApproved);
        basket.grantRole(keccak256("RISK_ADMIN_ROLE"), address(riskController));

        string memory root = "mainnet";
        vm.serializeUint(root, "schemaVersion", 5);
        vm.serializeString(root, "environment", "robinhood-mainnet");
        vm.serializeUint(root, "chainId", CHAIN_ID);
        vm.serializeString(root, "gitSha", releaseSha);
        vm.serializeBool(root, "canonicalAssets", true);
        vm.serializeBool(root, "productionParityReplicas", false);
        vm.serializeString(root, "activationState", "paused-canary");
        vm.serializeUint(root, "preliminaryRiskAssetCount", riskAssets.length);
        vm.serializeUint(root, "activatedRiskAssetCount", 0);
        vm.serializeBool(root, "buysEnabled", false);
        vm.serializeBool(root, "sellsEnabled", false);
        vm.serializeBool(root, "rebalancesEnabled", false);
        vm.serializeBool(root, "brainPurchasesEnabled", false);
        vm.serializeAddress(root, "preliminaryAssets", riskAssets);
        vm.serializeUint(root, "preliminaryQualificationHours", qualificationHours);
        vm.serializeUint(root, "preliminaryMarketSessions", marketSessions);
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeAddress(root, "usdg", CANONICAL_USDG);
        vm.serializeAddress(root, "assetRegistry", address(registry));
        vm.serializeAddress(root, "dexValuationAdapter", address(valuation));
        vm.serializeAddress(root, "dexFactory", uniswapFactory);
        vm.serializeAddress(root, "dexRouter", uniswapRouter);
        vm.serializeAddress(root, "executionAdapter", address(execution));
        vm.serializeAddress(root, "riskController", address(riskController));
        vm.serializeAddress(root, "rewards", address(rewards));
        vm.serializeAddress(root, "creatorVault", address(creatorVault));
        vm.serializeAddress(root, "brain", address(brain));
        string memory json = vm.serializeAddress(root, "basket", address(basket));
        vm.writeJson(json, vm.envString("MDB_DEPLOYMENT_OUTPUT"));
        vm.stopBroadcast();
    }
}
