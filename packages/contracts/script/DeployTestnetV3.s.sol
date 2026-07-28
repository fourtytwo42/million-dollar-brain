// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockToken} from "../src/MockToken.sol";
import {MockRouter} from "../src/MockRouter.sol";
import {MockValuationOracle} from "../src/MockValuationOracle.sol";
import {ParityAssetToken} from "../src/ParityAssetToken.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {ZeroExExecutionAdapter} from "../src/ZeroExExecutionAdapter.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {CreatorVault} from "../src/CreatorVault.sol";
import {BrainMarketplace} from "../src/BrainMarketplace.sol";
import {BasketVault} from "../src/BasketVault.sol";

/// @notice Fresh production-interface replica deployment for Robinhood Testnet.
/// @dev These are explicitly non-canonical replicas. Real token/feed/0x validation occurs in
///      mainnet shadow and fork environments.
contract DeployTestnetV3 is Script {
    function run() external {
        require(block.chainid == 46630, "testnet chain only");
        address deployer = vm.envAddress("MDB_DEPLOYER_ADDRESS");
        address quoteAuthorizer = vm.envOr("MDB_QUOTE_AUTHORIZER", deployer);
        require(deployer != address(0) && quoteAuthorizer != address(0), "zero signer");
        vm.startBroadcast();

        MockToken usdg = new MockToken("Test Replica USDG", "trUSDG", 18, deployer);
        ParityAssetToken[] memory riskAssets = new ParityAssetToken[](11);
        riskAssets[0] = _asset("Test Replica Apple", "trAAPL", "TEST-REPLICA-AAPL", deployer);
        riskAssets[1] = _asset("Test Replica NVIDIA", "trNVDA", "TEST-REPLICA-NVDA", deployer);
        riskAssets[2] = _asset("Test Replica Microsoft", "trMSFT", "TEST-REPLICA-MSFT", deployer);
        riskAssets[3] = _asset("Test Replica Amazon", "trAMZN", "TEST-REPLICA-AMZN", deployer);
        riskAssets[4] = _asset("Test Replica Alphabet", "trGOOGL", "TEST-REPLICA-GOOGL", deployer);
        riskAssets[5] = _asset("Test Replica Meta", "trMETA", "TEST-REPLICA-META", deployer);
        riskAssets[6] = _asset("Test Replica Tesla", "trTSLA", "TEST-REPLICA-TSLA", deployer);
        riskAssets[7] = _asset("Test Replica SPY ETF", "trSPY", "TEST-REPLICA-SPY", deployer);
        riskAssets[8] = _asset("Test Replica QQQ ETF", "trQQQ", "TEST-REPLICA-QQQ", deployer);
        riskAssets[9] = _asset("Test Replica SOXX ETF", "trSOXX", "TEST-REPLICA-SOXX", deployer);
        riskAssets[10] = _asset("Test Replica Wrapped Ether", "trWETH", "TEST-REPLICA-WETH", deployer);

        uint256[] memory prices = new uint256[](11);
        prices[0] = 225e18;
        prices[1] = 180e18;
        prices[2] = 500e18;
        prices[3] = 230e18;
        prices[4] = 200e18;
        prices[5] = 700e18;
        prices[6] = 300e18;
        prices[7] = 650e18;
        prices[8] = 580e18;
        prices[9] = 300e18;
        prices[10] = 3_800e18;

        MockRouter venue = new MockRouter(address(usdg), deployer);
        MockValuationOracle valuation = new MockValuationOracle(deployer);
        valuation.setPrice(address(usdg), 1e18);
        for (uint256 i; i < riskAssets.length; ++i) {
            venue.setPrice(address(riskAssets[i]), prices[i]);
            valuation.setPrice(address(riskAssets[i]), prices[i]);
            riskAssets[i].mint(address(venue), 1_000_000e18);
        }
        valuation.setAutomaticFreshness(false);
        usdg.mint(address(venue), 100_000_000e18);

        AssetRegistry registry = AssetRegistry(
            address(
                new ERC1967Proxy(
                    address(new AssetRegistry()), abi.encodeCall(AssetRegistry.initialize, (deployer, block.chainid))
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
        execution.configureVenue(address(venue), address(venue), true);
        execution.configureSelector(MockRouter.buy.selector, true);
        execution.configureSelector(MockRouter.sell.selector, true);
        execution.configureToken(address(usdg), true);
        _registerReserve(registry, usdg);
        for (uint256 i; i < riskAssets.length; ++i) {
            execution.configureToken(address(riskAssets[i]), true);
            AssetRegistry.AssetKind kind = i >= 7 && i <= 9
                ? AssetRegistry.AssetKind.ETF
                : i == 10 ? AssetRegistry.AssetKind.CRYPTO : AssetRegistry.AssetKind.STOCK;
            AssetRegistry.RiskClass riskClass =
                i == 6 || i == 10 ? AssetRegistry.RiskClass.HIGH_VOLATILITY : AssetRegistry.RiskClass.STANDARD;
            _registerRisk(
                registry,
                riskAssets[i],
                kind,
                riskClass,
                address(valuation),
                address(execution),
                i == 10 ? deployer : address(0)
            );
        }

        uint256[] memory rewardWeights = new uint256[](42);
        uint16[] memory brainWeights = new uint16[](42);
        _brainWeights(rewardWeights, brainWeights);
        CreatorVault creatorVault = CreatorVault(
            address(
                new ERC1967Proxy(
                    address(new CreatorVault()), abi.encodeCall(CreatorVault.initialize, (deployer, address(usdg)))
                )
            )
        );
        RewardDistributor rewards = RewardDistributor(
            address(
                new ERC1967Proxy(
                    address(new RewardDistributor()),
                    abi.encodeCall(
                        RewardDistributor.initialize, (deployer, address(usdg), rewardWeights, address(creatorVault))
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
                            address(usdg),
                            address(rewards),
                            address(creatorVault),
                            brainWeights,
                            42_000e18,
                            3,
                            keccak256("MDB_BRAIN_CATALOG_V3")
                        )
                    )
                )
            )
        );
        rewards.grantRole(rewards.BRAIN_ROLE(), address(brain));

        address[] memory basketAssets = new address[](riskAssets.length);
        for (uint256 i; i < riskAssets.length; ++i) {
            basketAssets[i] = address(riskAssets[i]);
        }
        BasketVault basket = BasketVault(
            address(
                new ERC1967Proxy(
                    address(new BasketVault()),
                    abi.encodeCall(
                        BasketVault.initialize,
                        (
                            deployer,
                            address(usdg),
                            address(venue),
                            address(rewards),
                            address(creatorVault),
                            deployer,
                            basketAssets
                        )
                    )
                )
            )
        );
        address[] memory bootstrapAssets = new address[](5);
        uint16[] memory bootstrapWeights = new uint16[](5);
        bootstrapAssets[0] = address(usdg);
        bootstrapAssets[1] = address(riskAssets[0]);
        bootstrapAssets[2] = address(riskAssets[1]);
        bootstrapAssets[3] = address(riskAssets[7]);
        bootstrapAssets[4] = address(riskAssets[10]);
        for (uint256 i; i < 5; ++i) {
            bootstrapWeights[i] = 2_000;
        }
        basket.reinitializeV2(address(valuation), 120, 100, bootstrapAssets, bootstrapWeights);
        basket.reinitializeV3(address(registry), address(execution));
        execution.grantRole(execution.VAULT_ROLE(), address(basket));
        usdg.mint(deployer, 1_000_000e18);

        _writeFlatManifest(
            deployer,
            quoteAuthorizer,
            usdg,
            riskAssets,
            venue,
            valuation,
            registry,
            execution,
            rewards,
            creatorVault,
            brain,
            basket
        );
        vm.stopBroadcast();
    }

    function _asset(string memory name, string memory symbol, string memory uid, address owner)
        private
        returns (ParityAssetToken)
    {
        return new ParityAssetToken(name, symbol, keccak256(bytes(uid)), owner);
    }

    function _qualification(bytes32 evidenceHash) private view returns (AssetRegistry.AssetQualification memory) {
        return AssetRegistry.AssetQualification({
            evidenceHash: evidenceHash,
            observedAt: uint64(block.timestamp),
            // Daily publisher refreshes this in normal operation; seven days keeps the
            // 72-hour acceptance run fail-closed without expiring mid-rehearsal.
            validUntil: uint64(block.timestamp + 7 days),
            consecutiveDays: 30,
            marketCapOrAumUsdWad: uint128(100_000_000e18),
            executableDepthUsdWad: uint128(250_000e18),
            identityValid: true,
            oracleValid: true,
            liquidityValid: true,
            transferBehaviorValid: true,
            corporateActionClear: true
        });
    }

    function _registerReserve(AssetRegistry registry, MockToken usdg) private {
        registry.registerAsset(
            AssetRegistry.AssetRecord({
                token: address(usdg),
                robinhoodUid: bytes32(0),
                kind: AssetRegistry.AssetKind.RESERVE,
                riskClass: AssetRegistry.RiskClass.RESERVE,
                valuationAdapter: address(0),
                executionAdapter: address(0),
                circulatingSupplyAdapter: address(0),
                maximumWeightBps: 2_000,
                registered: false,
                active: false
            })
        );
        registry.recordQualification(address(usdg), _qualification(keccak256("TEST-REPLICA-USDG")));
        registry.setActive(address(usdg), true);
    }

    function _registerRisk(
        AssetRegistry registry,
        ParityAssetToken token,
        AssetRegistry.AssetKind kind,
        AssetRegistry.RiskClass riskClass,
        address valuation,
        address execution,
        address supplyAdapter
    ) private {
        registry.registerAsset(
            AssetRegistry.AssetRecord({
                token: address(token),
                robinhoodUid: token.uid(),
                kind: kind,
                riskClass: riskClass,
                valuationAdapter: valuation,
                executionAdapter: execution,
                circulatingSupplyAdapter: supplyAdapter,
                maximumWeightBps: 2_000,
                registered: false,
                active: false
            })
        );
        registry.recordQualification(address(token), _qualification(keccak256(abi.encode(token.uid()))));
        registry.setActive(address(token), true);
    }

    function _brainWeights(uint256[] memory rewards, uint16[] memory weights) private pure {
        for (uint256 i; i < 6; ++i) {
            weights[i] = 500;
        }
        for (uint256 i = 6; i < 18; ++i) {
            weights[i] = 300;
        }
        for (uint256 i = 18; i < 34; ++i) {
            weights[i] = 150;
        }
        for (uint256 i = 34; i < 42; ++i) {
            weights[i] = 125;
        }
        for (uint256 i; i < 42; ++i) {
            rewards[i] = weights[i];
        }
    }

    function _writeFlatManifest(
        address deployer,
        address quoteAuthorizer,
        MockToken usdg,
        ParityAssetToken[] memory riskAssets,
        MockRouter venue,
        MockValuationOracle valuation,
        AssetRegistry registry,
        ZeroExExecutionAdapter execution,
        RewardDistributor rewards,
        CreatorVault creatorVault,
        BrainMarketplace brain,
        BasketVault basket
    ) private {
        string memory root = "testnetV3";
        vm.serializeUint(root, "schemaVersion", 3);
        vm.serializeString(root, "environment", "robinhood-testnet-replica");
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeBool(root, "productionParityReplicas", true);
        vm.serializeBool(root, "canonicalAssets", false);
        vm.serializeBool(root, "automaticFreshness", false);
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeAddress(root, "quoteAuthorizer", quoteAuthorizer);
        vm.serializeAddress(root, "usdg", address(usdg));
        vm.serializeAddress(root, "aapl", address(riskAssets[0]));
        vm.serializeAddress(root, "nvda", address(riskAssets[1]));
        vm.serializeAddress(root, "msft", address(riskAssets[2]));
        vm.serializeAddress(root, "amzn", address(riskAssets[3]));
        vm.serializeAddress(root, "googl", address(riskAssets[4]));
        vm.serializeAddress(root, "meta", address(riskAssets[5]));
        vm.serializeAddress(root, "tsla", address(riskAssets[6]));
        vm.serializeAddress(root, "spy", address(riskAssets[7]));
        vm.serializeAddress(root, "qqq", address(riskAssets[8]));
        vm.serializeAddress(root, "soxx", address(riskAssets[9]));
        vm.serializeAddress(root, "weth", address(riskAssets[10]));
        vm.serializeAddress(root, "ethx", address(riskAssets[10]));
        vm.serializeAddress(root, "router", address(venue));
        vm.serializeAddress(root, "oracle", address(valuation));
        vm.serializeAddress(root, "assetRegistry", address(registry));
        vm.serializeAddress(root, "executionAdapter", address(execution));
        vm.serializeAddress(root, "rewards", address(rewards));
        vm.serializeAddress(root, "creatorVault", address(creatorVault));
        vm.serializeAddress(root, "brain", address(brain));
        string memory output = vm.serializeAddress(root, "basket", address(basket));
        vm.writeJson(output, vm.envOr("MDB_DEPLOYMENT_OUTPUT", string("./deployments/testnet-v3-flat.json")));
    }
}
