// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { AssetRegistry } from "../src/AssetRegistry.sol";
import { CreatorRiskController } from "../src/CreatorRiskController.sol";

/// @notice Adds pre-qualification notice views without changing initialized storage.
contract UpgradePausedCanaryPolicy is Script {
    function run() external {
        AssetRegistry registry = AssetRegistry(vm.envAddress("MDB_REGISTRY"));
        CreatorRiskController controller =
            CreatorRiskController(vm.envAddress("MDB_RISK_CONTROLLER"));
        vm.startBroadcast();
        AssetRegistry registryImplementation = new AssetRegistry();
        registry.upgradeToAndCall(address(registryImplementation), bytes(""));
        CreatorRiskController controllerImplementation = new CreatorRiskController();
        controller.upgradeToAndCall(address(controllerImplementation), bytes(""));
        vm.stopBroadcast();

        string memory root = "pausedCanaryPolicyUpgrade";
        vm.serializeAddress(root, "registryImplementation", address(registryImplementation));
        string memory json = vm.serializeAddress(
            root, "riskControllerImplementation", address(controllerImplementation)
        );
        vm.writeJson(json, vm.envString("MDB_PAUSED_CANARY_UPGRADE_EVIDENCE"));
    }
}
