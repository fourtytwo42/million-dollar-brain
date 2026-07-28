// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {ChainlinkValuationAdapter} from "../src/ChainlinkValuationAdapter.sol";
import {ZeroExExecutionAdapter} from "../src/ZeroExExecutionAdapter.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {CreatorVault} from "../src/CreatorVault.sol";
import {BrainMarketplace} from "../src/BrainMarketplace.sol";
import {BasketVault} from "../src/BasketVault.sol";

interface IRobinhoodIdentity {
    function uid() external view returns (bytes32);
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
        address quoteAuthorizer = vm.envAddress("MDB_QUOTE_AUTHORIZER");
        address sequencerFeed = vm.envAddress("MDB_CHAINLINK_SEQUENCER_FEED");
        address usdgFeed = vm.envAddress("MDB_USDG_CHAINLINK_FEED");
        uint256 usdgHeartbeat = vm.envUint("MDB_USDG_FEED_HEARTBEAT");
        address[] memory riskAssets = vm.envAddress("MDB_MAINNET_RISK_ASSETS", ",");
        address[] memory feeds = vm.envAddress("MDB_MAINNET_CHAINLINK_FEEDS", ",");
        uint256[] memory heartbeats = vm.envUint("MDB_MAINNET_FEED_HEARTBEATS", ",");
        address zeroExTarget = vm.envAddress("MDB_ZEROEX_TARGET");
        address zeroExAllowanceTarget = vm.envAddress("MDB_ZEROEX_ALLOWANCE_TARGET");
        bytes4 zeroExSelector = bytes4(vm.envBytes32("MDB_ZEROEX_SELECTOR"));
        address wethSupplyAdapter = vm.envAddress("MDB_WETH_SUPPLY_ADAPTER");
        require(deployer != address(0) && quoteAuthorizer != address(0) && sequencerFeed != address(0), "zero role");
        require(
            riskAssets.length > 0 && riskAssets.length == feeds.length && feeds.length == heartbeats.length,
            "feed manifest"
        );
        vm.startBroadcast();

        AssetRegistry registry = AssetRegistry(
            address(
                new ERC1967Proxy(
                    address(new AssetRegistry()), abi.encodeCall(AssetRegistry.initialize, (deployer, CHAIN_ID))
                )
            )
        );
        ChainlinkValuationAdapter valuation = ChainlinkValuationAdapter(
            address(
                new ERC1967Proxy(
                    address(new ChainlinkValuationAdapter()),
                    abi.encodeCall(ChainlinkValuationAdapter.initialize, (deployer, sequencerFeed, uint32(3_600)))
                )
            )
        );
        ZeroExExecutionAdapter execution = ZeroExExecutionAdapter(
            address(
                new ERC1967Proxy(
                    address(new ZeroExExecutionAdapter()),
                    abi.encodeCall(
                        ZeroExExecutionAdapter.initialize, (deployer, address(valuation), quoteAuthorizer, 100, 50)
                    )
                )
            )
        );
        execution.configureVenue(zeroExTarget, zeroExAllowanceTarget, true);
        execution.configureSelector(zeroExSelector, true);
        execution.configureToken(CANONICAL_USDG, true);
        valuation.configureFeed(CANONICAL_USDG, usdgFeed, uint32(usdgHeartbeat), address(0));

        for (uint256 i; i < riskAssets.length; ++i) {
            address token = riskAssets[i];
            require(token.code.length > 0 && feeds[i].code.length > 0, "canonical code");
            require(IERC20Metadata(token).decimals() <= 36, "token decimals");
            bool isWeth = token == CANONICAL_WETH;
            bytes32 uid = isWeth ? bytes32(0) : IRobinhoodIdentity(token).uid();
            registry.registerAsset(
                AssetRegistry.AssetRecord({
                    token: token,
                    robinhoodUid: uid,
                    kind: isWeth ? AssetRegistry.AssetKind.CRYPTO : AssetRegistry.AssetKind.STOCK,
                    riskClass: isWeth ? AssetRegistry.RiskClass.HIGH_VOLATILITY : AssetRegistry.RiskClass.STANDARD,
                    valuationAdapter: address(valuation),
                    executionAdapter: address(execution),
                    circulatingSupplyAdapter: isWeth ? wethSupplyAdapter : address(0),
                    maximumWeightBps: 2_000,
                    registered: false,
                    active: false
                })
            );
            valuation.configureFeed(token, feeds[i], uint32(heartbeats[i]), isWeth ? address(0) : token);
            execution.configureToken(token, true);
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
                    address(new CreatorVault()), abi.encodeCall(CreatorVault.initialize, (deployer, CANONICAL_USDG))
                )
            )
        );
        RewardDistributor rewards = RewardDistributor(
            address(
                new ERC1967Proxy(
                    address(new RewardDistributor()),
                    abi.encodeCall(
                        RewardDistributor.initialize, (deployer, CANONICAL_USDG, rewardWeights, address(creatorVault))
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

        BasketVault basket = BasketVault(
            address(
                new ERC1967Proxy(
                    address(new BasketVault()),
                    abi.encodeCall(
                        BasketVault.initialize,
                        (
                            deployer,
                            CANONICAL_USDG,
                            address(execution),
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
        basket.reinitializeV3(address(registry), address(execution));
        execution.grantRole(execution.VAULT_ROLE(), address(basket));

        string memory root = "mainnet";
        vm.serializeUint(root, "schemaVersion", 3);
        vm.serializeString(root, "environment", "robinhood-mainnet");
        vm.serializeUint(root, "chainId", CHAIN_ID);
        vm.serializeBool(root, "canonicalAssets", true);
        vm.serializeBool(root, "productionParityReplicas", false);
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeAddress(root, "quoteAuthorizer", quoteAuthorizer);
        vm.serializeAddress(root, "usdg", CANONICAL_USDG);
        vm.serializeAddress(root, "assetRegistry", address(registry));
        vm.serializeAddress(root, "valuation", address(valuation));
        vm.serializeAddress(root, "executionAdapter", address(execution));
        vm.serializeAddress(root, "rewards", address(rewards));
        vm.serializeAddress(root, "creatorVault", address(creatorVault));
        vm.serializeAddress(root, "brain", address(brain));
        string memory json = vm.serializeAddress(root, "basket", address(basket));
        vm.writeJson(json, vm.envString("MDB_DEPLOYMENT_OUTPUT"));
        vm.stopBroadcast();
    }
}
