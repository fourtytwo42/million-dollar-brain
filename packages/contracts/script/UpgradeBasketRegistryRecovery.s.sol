// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {BasketVault} from "../src/BasketVault.sol";

/// @dev One-transaction bridge used only for the legacy disposable devnet.
contract DevnetBasketRegistryRecovery {
    bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    uint256 private constant ASSET_REGISTRY_SLOT = 15;

    address private immutable _admin;
    address private immutable _registry;
    address private immutable _finalImplementation;

    error RecoveryRejected();

    constructor(address admin, address registry, address finalImplementation) {
        _admin = admin;
        _registry = registry;
        _finalImplementation = finalImplementation;
    }

    function proxiableUUID() external pure returns (bytes32) {
        return IMPLEMENTATION_SLOT;
    }

    function recoverAndReturn() external {
        if (block.chainid != 31_337 || msg.sender != _admin) revert RecoveryRejected();
        address registry = _registry;
        address finalImplementation = _finalImplementation;
        bytes32 implementationSlot = IMPLEMENTATION_SLOT;
        assembly ("memory-safe") {
            if sload(ASSET_REGISTRY_SLOT) {
                revert(0, 0)
            }
            sstore(ASSET_REGISTRY_SLOT, registry)
            sstore(implementationSlot, finalImplementation)
        }
    }
}

/// @notice Recovers the registry pointer omitted by an old disposable-devnet migration.
/// @dev The temporary implementation returns the proxy to BasketVault atomically.
contract UpgradeBasketRegistryRecovery is Script {
    bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function run() external {
        require(block.chainid == 31_337, "devnet only");
        require(vm.envBool("MDB_BASKET_REGISTRY_RECOVERY"), "recovery flag required");

        address basketProxy = vm.envAddress("MDB_BASKET");
        address registry = vm.envAddress("MDB_REGISTRY");
        require(basketProxy != address(0) && registry != address(0), "zero address");
        require(address(BasketVault(basketProxy).assetRegistry()) == address(0), "registry already set");

        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.addr(key);
        vm.startBroadcast(key);
        BasketVault implementation = new BasketVault();
        DevnetBasketRegistryRecovery recovery =
            new DevnetBasketRegistryRecovery(admin, registry, address(implementation));
        BasketVault(basketProxy)
            .upgradeToAndCall(address(recovery), abi.encodeCall(DevnetBasketRegistryRecovery.recoverAndReturn, ()));
        vm.stopBroadcast();

        require(address(BasketVault(basketProxy).assetRegistry()) == registry, "registry recovery failed");
        require(
            address(uint160(uint256(vm.load(basketProxy, IMPLEMENTATION_SLOT)))) == address(implementation),
            "implementation mismatch"
        );
    }
}
