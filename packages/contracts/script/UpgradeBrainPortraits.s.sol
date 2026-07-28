// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { BrainMarketplace } from "../src/BrainMarketplace.sol";

contract UpgradeBrainPortraits is Script {
    function run() external {
        require(block.chainid == 31_337 || block.chainid == 46_630, "unsupported chain");
        address proxy = vm.envAddress("MDB_BRAIN");
        require(proxy != address(0), "zero proxy");

        vm.startBroadcast();
        BrainMarketplace implementation = new BrainMarketplace();
        BrainMarketplace(proxy).upgradeToAndCall(address(implementation), "");
        vm.stopBroadcast();
    }
}
