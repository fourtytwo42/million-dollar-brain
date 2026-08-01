// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { AssetRegistry } from "../src/AssetRegistry.sol";
import { BasketVault } from "../src/BasketVault.sol";
import { CreatorRiskController } from "../src/CreatorRiskController.sol";

/// @notice Adds pre-qualification notice views without changing initialized storage.
contract UpgradePausedCanaryPolicy is Script {
    function run() external {
        AssetRegistry registry = AssetRegistry(vm.envAddress("MDB_REGISTRY"));
        CreatorRiskController controller =
            CreatorRiskController(vm.envAddress("MDB_RISK_CONTROLLER"));
        BasketVault basket = BasketVault(vm.envAddress("MDB_BASKET"));
        vm.startBroadcast();
        AssetRegistry registryImplementation = new AssetRegistry();
        registry.upgradeToAndCall(address(registryImplementation), bytes(""));
        CreatorRiskController controllerImplementation = new CreatorRiskController();
        controller.upgradeToAndCall(address(controllerImplementation), bytes(""));
        BasketVault basketImplementation = new BasketVault();
        basket.upgradeToAndCall(address(basketImplementation), bytes(""));
        vm.stopBroadcast();

        string memory root = "pausedCanaryPolicyUpgrade";
        vm.serializeAddress(root, "registryImplementation", address(registryImplementation));
        string memory json = vm.serializeAddress(
            root, "riskControllerImplementation", address(controllerImplementation)
        );
        json = vm.serializeAddress(root, "basketImplementation", address(basketImplementation));
        vm.writeJson(json, vm.envString("MDB_PAUSED_CANARY_UPGRADE_EVIDENCE"));
    }
}
