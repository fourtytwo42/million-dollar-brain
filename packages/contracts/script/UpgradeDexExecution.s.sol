// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {UniswapExecutionAdapter} from "../src/UniswapExecutionAdapter.sol";

contract UpgradeDexExecution is Script {
    function run() external {
        require(block.chainid == 46_630, "testnet chain only");
        address proxy = vm.envAddress("MDB_DEX_EXECUTION_ADAPTER");
        require(proxy != address(0), "zero proxy");

        vm.startBroadcast();
        UniswapExecutionAdapter implementation = new UniswapExecutionAdapter();
        UniswapExecutionAdapter(proxy).upgradeToAndCall(address(implementation), bytes(""));
        vm.stopBroadcast();
    }
}
