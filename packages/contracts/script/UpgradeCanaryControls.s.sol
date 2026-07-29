// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {BasketVault} from "../src/BasketVault.sol";
import {BrainMarketplace} from "../src/BrainMarketplace.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";

contract UpgradeCanaryControls is Script {
    function run() external {
        require(block.chainid == 31_337 || block.chainid == 46_630, "unsupported chain");
        address basketProxy = vm.envAddress("MDB_BASKET");
        address brainProxy = vm.envAddress("MDB_BRAIN");
        address registryProxy = vm.envOr("MDB_REGISTRY", address(0));
        bool buysEnabled = vm.envOr("MDB_CANARY_BUYS_ENABLED", true);
        bool sellsEnabled = vm.envOr("MDB_CANARY_SELLS_ENABLED", true);
        bool rebalancesEnabled = vm.envOr("MDB_CANARY_REBALANCES_ENABLED", true);
        bool brainPurchasesEnabled = vm.envOr("MDB_CANARY_BRAIN_PURCHASES_ENABLED", true);
        require(basketProxy != address(0) && brainProxy != address(0), "zero proxy");

        vm.startBroadcast();
        if (registryProxy != address(0)) {
            AssetRegistry registryImplementation = new AssetRegistry();
            AssetRegistry registry = AssetRegistry(registryProxy);
            registry.upgradeToAndCall(address(registryImplementation), "");
            address[] memory tokens = registry.tokens();
            for (uint256 i; i < tokens.length; ++i) {
                (, AssetRegistry.AssetQualification memory oldQualification) =
                    registry.asset(tokens[i]);
                oldQualification.observedAt = uint64(block.timestamp);
                oldQualification.validUntil = uint64(block.timestamp + 7 days);
                oldQualification.consecutiveHours = 48;
                oldQualification.regularMarketSessions = 2;
                registry.recordQualification(tokens[i], oldQualification);
            }
        }
        (bool basketCallOk, bytes memory basketResult) =
            basketProxy.staticcall(abi.encodeCall(BasketVault.canaryControlsConfigured, ()));
        bool basketConfigured =
            basketCallOk && basketResult.length >= 32 && abi.decode(basketResult, (bool));
        if (!basketConfigured) {
            BasketVault basketImplementation = new BasketVault();
            BasketVault(basketProxy).upgradeToAndCall(
                address(basketImplementation),
                abi.encodeCall(
                    BasketVault.reinitializeV4,
                    (buysEnabled, sellsEnabled, rebalancesEnabled)
                )
            );
        }
        (bool brainCallOk, bytes memory brainResult) =
            brainProxy.staticcall(abi.encodeCall(BrainMarketplace.marketControlsConfigured, ()));
        bool brainConfigured =
            brainCallOk && brainResult.length >= 32 && abi.decode(brainResult, (bool));
        if (!brainConfigured) {
            BrainMarketplace brainImplementation = new BrainMarketplace();
            BrainMarketplace(brainProxy).upgradeToAndCall(
                address(brainImplementation),
                abi.encodeCall(BrainMarketplace.reinitializeV2, (brainPurchasesEnabled))
            );
        }
        vm.stopBroadcast();
    }
}
