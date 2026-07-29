// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { BasketVault } from "../src/BasketVault.sol";

contract UpgradeBasketIdentity is Script {
    function run() external {
        require(block.chainid == 31_337 || block.chainid == 46_630, "unsupported chain");
        address proxy = vm.envAddress("MDB_BASKET");
        require(proxy != address(0), "zero proxy");

        vm.startBroadcast();
        BasketVault implementation = new BasketVault();
        BasketVault(proxy).upgradeToAndCall(address(implementation), "");
        vm.stopBroadcast();
    }
}
