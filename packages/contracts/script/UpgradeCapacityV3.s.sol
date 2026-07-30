// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {BasketVault} from "../src/BasketVault.sol";
import {DexTwapValuationAdapter} from "../src/DexTwapValuationAdapter.sol";
import {UniswapExecutionAdapter} from "../src/UniswapExecutionAdapter.sol";

/// @notice Guarded devnet/testnet migration to the DEX-native capacity policy.
/// @dev Mainnet is deliberately excluded. Migration evidence is a rehearsal
/// fixture; production qualification must be recorded by the 48-hour worker.
contract UpgradeCapacityV3 is Script {
    uint256 private constant INITIAL_TVL_CAP_USD_WAD = 60_000e18;
    uint32 private constant LONG_TWAP_WINDOW = 4 hours;
    uint16 private constant MAXIMUM_SPOT_TO_SHORT_DEVIATION_BPS = 300;
    uint16 private constant MAXIMUM_SHORT_TO_LONG_DEVIATION_BPS = 500;

    function run() external {
        require(block.chainid == 31_337 || block.chainid == 46_630, "devnet/testnet only");
        require(vm.envBool("MDB_CAPACITY_V3_MIGRATION"), "migration flag required");

        address registryProxy = vm.envAddress("MDB_REGISTRY");
        address valuationProxy = vm.envAddress("MDB_DEX_VALUATION_ADAPTER");
        address executionProxy = vm.envAddress("MDB_DEX_EXECUTION_ADAPTER");
        address basketProxy = vm.envAddress("MDB_BASKET");
        address[] memory assets = vm.envAddress("MDB_CAPACITY_V3_ASSETS", ",");
        uint256[] memory capacities = vm.envUint("MDB_CAPACITY_V3_CAPACITIES_USD_WAD", ",");
        require(
            registryProxy != address(0) && valuationProxy != address(0)
                && executionProxy != address(0) && basketProxy != address(0),
            "zero proxy"
        );
        require(assets.length != 0 && assets.length == capacities.length, "invalid fixtures");

        vm.startBroadcast();

        AssetRegistry registryImplementation = new AssetRegistry();
        AssetRegistry registry = AssetRegistry(registryProxy);
        registry.upgradeToAndCall(
            address(registryImplementation), abi.encodeCall(AssetRegistry.reinitializeV3, ())
        );

        DexTwapValuationAdapter valuationImplementation = new DexTwapValuationAdapter();
        DexTwapValuationAdapter valuation = DexTwapValuationAdapter(valuationProxy);
        valuation.upgradeToAndCall(
            address(valuationImplementation),
            abi.encodeCall(DexTwapValuationAdapter.reinitializeV2, (LONG_TWAP_WINDOW))
        );

        UniswapExecutionAdapter executionImplementation = new UniswapExecutionAdapter();
        UniswapExecutionAdapter execution = UniswapExecutionAdapter(executionProxy);
        execution.upgradeToAndCall(
            address(executionImplementation),
            abi.encodeCall(UniswapExecutionAdapter.reinitializeDexOnly, ())
        );

        BasketVault basketImplementation = new BasketVault();
        BasketVault(basketProxy).upgradeToAndCall(
            address(basketImplementation),
            abi.encodeCall(BasketVault.reinitializeV6, (INITIAL_TVL_CAP_USD_WAD))
        );

        address reserve = valuation.reserve();
        for (uint256 i; i < assets.length; ++i) {
            address token = assets[i];
            (AssetRegistry.AssetRecord memory record,) = registry.asset(token);
            require(record.registered, "fixture asset not registered");

            if (token != reserve) {
                require(capacities[i] != 0 && capacities[i] <= type(uint128).max, "bad capacity");
                registry.updateAssetConfiguration(
                    token,
                    valuationProxy,
                    executionProxy,
                    address(0),
                    record.riskClass,
                    record.maximumWeightBps
                );
                (
                    ,
                    ,
                    uint128 minimumDirectLiquidity,
                    uint128 minimumBridgeLiquidity,
                    ,
                    ,
                    bool routeEnabled
                ) = valuation.routes(token);
                require(routeEnabled, "missing DEX route");
                valuation.configureSafety(
                    token,
                    DexTwapValuationAdapter.DexSafetyConfig({
                        minimumDirectHarmonicLiquidity: minimumDirectLiquidity,
                        minimumBridgeHarmonicLiquidity: minimumBridgeLiquidity,
                        maximumSpotToShortDeviationBps:
                            MAXIMUM_SPOT_TO_SHORT_DEVIATION_BPS,
                        maximumShortToLongDeviationBps:
                            MAXIMUM_SHORT_TO_LONG_DEVIATION_BPS,
                        enabled: true
                    })
                );
            }

            uint8 sessions =
                record.kind == AssetRegistry.AssetKind.STOCK
                        || record.kind == AssetRegistry.AssetKind.ETF
                    ? 2
                    : 0;
            registry.recordQualificationV3(
                token,
                AssetRegistry.AssetQualificationV3({
                    evidenceHash: keccak256(
                        abi.encode(
                            "capacity-v3-migration-fixture",
                            block.chainid,
                            token,
                            capacities[i]
                        )
                    ),
                    observedAt: uint64(block.timestamp),
                    validUntil: uint64(block.timestamp + 7 days),
                    consecutiveHours: 48,
                    regularMarketSessions: sessions,
                    safeTwoSidedCapacityUsdWad: uint128(capacities[i]),
                    identityValid: true,
                    routeMature: token != reserve,
                    shortTwapValid: token != reserve,
                    longTwapValid: token != reserve,
                    timeWeightedLiquidityValid: token != reserve,
                    liquidityValid: token != reserve,
                    transferBehaviorValid: true,
                    tokenStateClear: true
                })
            );
        }

        registry.setQualificationV3Enabled(true);
        for (uint256 i; i < assets.length; ++i) {
            registry.setActive(assets[i], true);
        }
        vm.stopBroadcast();
    }
}
