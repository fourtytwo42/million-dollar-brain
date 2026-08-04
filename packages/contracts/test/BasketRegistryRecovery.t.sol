// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {BasketVault} from "../src/BasketVault.sol";
import {MockToken} from "../src/MockToken.sol";
import {DevnetBasketRegistryRecovery} from "../script/UpgradeBasketRegistryRecovery.s.sol";

contract BasketRegistryRecoveryTest is Test {
    bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    address private admin = makeAddr("admin");
    address private registry = makeAddr("registry");
    BasketVault private basket;

    function setUp() public {
        MockToken usdg = new MockToken("Mock USDG", "USDG", 18, admin);
        address[] memory assets = new address[](0);
        BasketVault initialImplementation = new BasketVault();
        basket = BasketVault(
            address(
                new ERC1967Proxy(
                    address(initialImplementation),
                    abi.encodeCall(
                        BasketVault.initialize,
                        (admin, address(usdg), address(1), address(2), address(3), address(4), assets)
                    )
                )
            )
        );
        vm.startPrank(admin);
        basket.reinitializeV4(true, true, true);
        basket.reinitializeV5(address(5), address(6));
        basket.reinitializeV6(60_000e18);
        vm.stopPrank();
        assertEq(address(basket.assetRegistry()), address(0));
    }

    function testAtomicRecoveryReturnsToNormalImplementationAndPreservesState() public {
        BasketVault finalImplementation = new BasketVault();
        DevnetBasketRegistryRecovery recovery =
            new DevnetBasketRegistryRecovery(admin, registry, address(finalImplementation));
        uint256 supplyBefore = basket.totalSupply();
        uint256 capBefore = basket.tvlCapUsdWad();

        vm.prank(admin);
        basket.upgradeToAndCall(address(recovery), abi.encodeCall(DevnetBasketRegistryRecovery.recoverAndReturn, ()));

        assertEq(address(basket.assetRegistry()), registry);
        assertEq(basket.totalSupply(), supplyBefore);
        assertEq(basket.tvlCapUsdWad(), capBefore);
        assertEq(address(uint160(uint256(vm.load(address(basket), IMPLEMENTATION_SLOT)))), address(finalImplementation));
    }

    function testRecoveryRejectsUnauthorizedCallerAndNonzeroRegistrySlot() public {
        BasketVault finalImplementation = new BasketVault();
        DevnetBasketRegistryRecovery recovery =
            new DevnetBasketRegistryRecovery(admin, registry, address(finalImplementation));

        vm.prank(makeAddr("attacker"));
        vm.expectRevert();
        basket.upgradeToAndCall(address(recovery), abi.encodeCall(DevnetBasketRegistryRecovery.recoverAndReturn, ()));

        vm.store(address(basket), bytes32(uint256(15)), bytes32(uint256(uint160(makeAddr("existing registry")))));
        vm.prank(admin);
        vm.expectRevert();
        basket.upgradeToAndCall(address(recovery), abi.encodeCall(DevnetBasketRegistryRecovery.recoverAndReturn, ()));
    }
}
