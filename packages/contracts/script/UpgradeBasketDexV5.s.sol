// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { BasketVault } from "../src/BasketVault.sol";

contract UpgradeBasketDexV5 is Script {
    function run() external {
        BasketVault basket = BasketVault(vm.envAddress("MDB_BASKET"));
        string memory output = vm.envString("MDB_BASKET_UPGRADE_OUTPUT");
        vm.startBroadcast();
        BasketVault implementation = new BasketVault();
        basket.upgradeToAndCall(address(implementation), bytes(""));
        basket.setDexPriceAge(vm.envOr("MDB_DEX_PRICE_AGE", uint256(15 minutes)));
        vm.stopBroadcast();
        string memory root = "upgrade";
        string memory json =
            vm.serializeAddress(root, "basketImplementation", address(implementation));
        vm.writeJson(json, output);
    }
}
