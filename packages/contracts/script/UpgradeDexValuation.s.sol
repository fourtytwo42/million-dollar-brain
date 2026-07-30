// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { DexTwapValuationAdapter } from "../src/DexTwapValuationAdapter.sol";

contract UpgradeDexValuation is Script {
    function run() external {
        DexTwapValuationAdapter adapter =
            DexTwapValuationAdapter(vm.envAddress("MDB_DEX_VALUATION_ADAPTER"));
        address[] memory assets = vm.envAddress("MDB_DEX_ASSETS", ",");
        uint32 maximumObservationAge =
            uint32(vm.envOr("MDB_DEX_MAXIMUM_OBSERVATION_AGE", uint256(15 minutes)));
        string memory output = vm.envString("MDB_DEX_VALUATION_UPGRADE_OUTPUT");

        vm.startBroadcast();
        DexTwapValuationAdapter implementation = new DexTwapValuationAdapter();
        adapter.upgradeToAndCall(address(implementation), bytes(""));
        for (uint256 i; i < assets.length; ++i) {
            adapter.setMaximumObservationAge(assets[i], maximumObservationAge);
        }
        vm.stopBroadcast();

        string memory root = "upgrade";
        string memory json =
            vm.serializeAddress(root, "dexValuationImplementation", address(implementation));
        vm.writeJson(json, output);
    }
}
