// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { BasketVault } from "../src/BasketVault.sol";

contract UpgradeBasketImplementation is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        string memory deployment =
            vm.readFile(string.concat(vm.projectRoot(), "/deployments/local.json"));
        BasketVault basket = BasketVault(vm.parseJsonAddress(deployment, ".basket"));
        vm.startBroadcast(key);
        BasketVault implementation = new BasketVault();
        basket.upgradeToAndCall(address(implementation), "");
        vm.stopBroadcast();
    }
}
