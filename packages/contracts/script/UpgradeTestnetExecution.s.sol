// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {ZeroExExecutionAdapter} from "../src/ZeroExExecutionAdapter.sol";

contract UpgradeTestnetExecution is Script {
    function run() external {
        require(block.chainid == 46_630, "testnet chain only");
        address proxy = vm.envAddress("MDB_EXECUTION_ADAPTER");
        require(proxy != address(0), "zero proxy");

        vm.startBroadcast();
        ZeroExExecutionAdapter implementation = new ZeroExExecutionAdapter();
        ZeroExExecutionAdapter(proxy)
            .upgradeToAndCall(
                address(implementation),
                abi.encodeCall(ZeroExExecutionAdapter.setExecutionLimits, (uint16(100), uint32(600)))
            );
        vm.stopBroadcast();
    }
}
