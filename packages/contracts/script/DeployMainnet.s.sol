// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { AssetRegistry } from "../src/AssetRegistry.sol";
import { ChainlinkValuationAdapter } from "../src/ChainlinkValuationAdapter.sol";
import { DexTwapValuationAdapter } from "../src/DexTwapValuationAdapter.sol";
import { UniswapExecutionAdapter } from "../src/UniswapExecutionAdapter.sol";
import { RewardDistributor } from "../src/RewardDistributor.sol";
import { CreatorVault } from "../src/CreatorVault.sol";
import { BrainMarketplace } from "../src/BrainMarketplace.sol";
import { BasketVault } from "../src/BasketVault.sol";

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
    address internal constant CANONICAL_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address internal constant CANONICAL_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    function run() external {
        require(block.chainid == CHAIN_ID, "mainnet chain only");
        address deployer = vm.envAddress("MDB_DEPLOYER_ADDRESS");
        address sequencerFeed = vm.envAddress("MDB_CHAINLINK_SEQUENCER_FEED");
        address usdgFeed = vm.envAddress("MDB_USDG_CHAINLINK_FEED");
        uint256 usdgHeartbeat = vm.envUint("MDB_USDG_FEED_HEARTBEAT");
        address[] memory riskAssets = vm.envAddress("MDB_MAINNET_RISK_ASSETS", ",");
        address[] memory feeds = vm.envAddress("MDB_MAINNET_CHAINLINK_FEEDS", ",");
        uint256[] memory heartbeats = vm.envUint("MDB_MAINNET_FEED_HEARTBEATS", ",");
        uint256[] memory assetKinds = vm.envUint("MDB_MAINNET_ASSET_KINDS", ",");
        uint256[] memory riskClasses = vm.envUint("MDB_MAINNET_RISK_CLASSES", ",");
        uint256[] memory maximumWeights = vm.envUint("MDB_MAINNET_MAX_WEIGHTS_BPS", ",");
        address uniswapFactory = vm.envAddress("MDB_UNISWAP_FACTORY");
        address uniswapRouter = vm.envAddress("MDB_UNISWAP_ROUTER");
        address[] memory directPools = vm.envAddress("MDB_MAINNET_DIRECT_POOLS", ",");
        address[] memory bridgePools = vm.envAddress("MDB_MAINNET_BRIDGE_POOLS", ",");
        uint256[] memory minimumDirectLiquidity =
            vm.envUint("MDB_MAINNET_MIN_DIRECT_LIQUIDITY", ",");
        uint256[] memory minimumBridgeLiquidity =
            vm.envUint("MDB_MAINNET_MIN_BRIDGE_LIQUIDITY", ",");
        address wethSupplyAdapter = vm.envAddress("MDB_WETH_SUPPLY_ADAPTER");
        require(
            deployer != address(0) && sequencerFeed != address(0) && uniswapFactory != address(0)
                && uniswapRouter != address(0),
            "zero role"
        );
        require(
            riskAssets.length > 0 && riskAssets.length == feeds.length
                && feeds.length == heartbeats.length && feeds.length == assetKinds.length
                && feeds.length == riskClasses.length && feeds.length == maximumWeights.length
                && feeds.length == directPools.length && feeds.length == bridgePools.length
                && feeds.length == minimumDirectLiquidity.length
                && feeds.length == minimumBridgeLiquidity.length,
            "feed manifest"
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
        ChainlinkValuationAdapter circuitBreaker = ChainlinkValuationAdapter(
            address(
                new ERC1967Proxy(
                    address(new ChainlinkValuationAdapter()),
                    abi.encodeCall(
                        ChainlinkValuationAdapter.initialize,
                        (deployer, sequencerFeed, uint32(3_600))
                    )
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
        circuitBreaker.configureFeed(CANONICAL_USDG, usdgFeed, uint32(usdgHeartbeat), false, true);

        for (uint256 i; i < riskAssets.length; ++i) {
            address token = riskAssets[i];
            require(token.code.length > 0 && feeds[i].code.length > 0, "canonical code");
            require(IERC20Metadata(token).decimals() <= 36, "token decimals");
            bool isWeth = token == CANONICAL_WETH;
            require(
                assetKinds[i] > 0 && assetKinds[i] <= uint8(AssetRegistry.AssetKind.TOKEN), "kind"
            );
            require(
                riskClasses[i] > 0
                    && riskClasses[i] <= uint8(AssetRegistry.RiskClass.HIGH_VOLATILITY),
                "risk"
            );
            require(maximumWeights[i] > 0 && maximumWeights[i] <= 2_000, "weight");
            circuitBreaker.configureFeed(token, feeds[i], uint32(heartbeats[i]), !isWeth, true);
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
                        UniswapExecutionAdapter.initialize,
                        (
                            deployer,
                            address(basket),
                            CANONICAL_USDG,
                            CANONICAL_WETH,
                            uniswapFactory,
                            uniswapRouter,
                            address(valuation),
                            address(circuitBreaker),
                            uint32(3_600)
                        )
                    )
                )
            )
        );
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
                    circulatingSupplyAdapter: isWeth ? wethSupplyAdapter : address(0),
                    maximumWeightBps: uint16(maximumWeights[i]),
                    registered: false,
                    active: false
                })
            );
            execution.setPool(directPools[i], true);
            execution.setFeeTier(IUniswapPoolFee(directPools[i]).fee(), true);
            if (bridgePools[i] != address(0)) {
                execution.setPool(bridgePools[i], true);
                execution.setFeeTier(IUniswapPoolFee(bridgePools[i]).fee(), true);
            }
        }
        basket.reinitializeV3(address(registry), address(execution));
        basket.reinitializeV4(false, false, false);
        basket.reinitializeV5(address(valuation), address(execution));
        basket.setDexPriceAge(1 hours);

        string memory root = "mainnet";
        vm.serializeUint(root, "schemaVersion", 4);
        vm.serializeString(root, "environment", "robinhood-mainnet");
        vm.serializeUint(root, "chainId", CHAIN_ID);
        vm.serializeBool(root, "canonicalAssets", true);
        vm.serializeBool(root, "productionParityReplicas", false);
        vm.serializeString(root, "activationState", "paused-canary");
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeAddress(root, "usdg", CANONICAL_USDG);
        vm.serializeAddress(root, "assetRegistry", address(registry));
        vm.serializeAddress(root, "circuitBreaker", address(circuitBreaker));
        vm.serializeAddress(root, "dexValuationAdapter", address(valuation));
        vm.serializeAddress(root, "dexFactory", uniswapFactory);
        vm.serializeAddress(root, "dexRouter", uniswapRouter);
        vm.serializeAddress(root, "executionAdapter", address(execution));
        vm.serializeAddress(root, "rewards", address(rewards));
        vm.serializeAddress(root, "creatorVault", address(creatorVault));
        vm.serializeAddress(root, "brain", address(brain));
        string memory json = vm.serializeAddress(root, "basket", address(basket));
        vm.writeJson(json, vm.envString("MDB_DEPLOYMENT_OUTPUT"));
        vm.stopBroadcast();
    }
}
