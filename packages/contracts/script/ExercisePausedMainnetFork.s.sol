// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { BasketVault } from "../src/BasketVault.sol";
import { AssetRegistry } from "../src/AssetRegistry.sol";
import { BrainMarketplace } from "../src/BrainMarketplace.sol";
import { CreatorRiskController } from "../src/CreatorRiskController.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Stateful assertions executed only against the disposable pinned mainnet fork.
contract ExercisePausedMainnetFork is Test {
    function run() external {
        string memory manifest = vm.readFile(vm.envString("MDB_FORK_MANIFEST"));
        address deployer = vm.parseJsonAddress(manifest, ".deployer");
        address usdg = vm.parseJsonAddress(manifest, ".usdg");
        BasketVault basket = BasketVault(vm.parseJsonAddress(manifest, ".basket"));
        AssetRegistry registry = AssetRegistry(vm.parseJsonAddress(manifest, ".assetRegistry"));
        BrainMarketplace brain = BrainMarketplace(vm.parseJsonAddress(manifest, ".brain"));
        CreatorRiskController risk =
            CreatorRiskController(vm.parseJsonAddress(manifest, ".riskController"));
        address[] memory preliminary = vm.parseJsonAddressArray(manifest, ".preliminaryAssets");
        assertGe(preliminary.length, 4);
        assertLe(preliminary.length, 9);

        assertFalse(basket.buysEnabled());
        assertFalse(basket.sellsEnabled());
        assertFalse(basket.rebalancesEnabled());
        assertFalse(brain.purchasesEnabled());
        assertTrue(registry.isActive(usdg));
        for (uint256 i; i < preliminary.length; ++i) {
            assertFalse(registry.isActive(preliminary[i]));
            (AssetRegistry.AssetRiskPolicyV1 memory policy,) = registry.riskPolicy(preliminary[i]);
            assertFalse(policy.approved);
        }

        address actor = makeAddr("paused-canary-actor");
        BasketVault.DexSwapPlan[] memory noPlans = new BasketVault.DexSwapPlan[](0);
        vm.expectRevert(BasketVault.BuysDisabled.selector);
        vm.prank(actor);
        basket.depositWithDexPlan(100e6, 0, block.timestamp + 1 minutes, noPlans);

        deal(usdg, actor, 1_000e6);
        vm.prank(deployer);
        basket.setCanaryControls(true, true, true);
        vm.prank(deployer);
        brain.setPurchasesEnabled(true);
        vm.startPrank(actor);
        IERC20(usdg).approve(address(basket), type(uint256).max);
        uint256 shares = basket.depositWithDexPlan(100e6, 1, block.timestamp + 1 minutes, noPlans);
        vm.stopPrank();
        address[] memory targets = new address[](1);
        uint16[] memory weights = new uint16[](1);
        targets[0] = usdg;
        weights[0] = 10_000;
        vm.prank(deployer);
        basket.rebalanceWithDexPlan(targets, weights, keccak256("fork-rebalance"), noPlans);
        vm.prank(actor);
        basket.redeemWithDexPlan(shares, 1, block.timestamp + 1 minutes, noPlans);

        address token = preliminary[0];
        (AssetRegistry.AssetQualificationV3 memory beforeQualification,) =
            registry.qualificationV3(token);
        uint128 proposedCap = registry.capacityExposureUsdWad(token);
        vm.prank(deployer);
        risk.scheduleAssetPolicy(token, true, proposedCap);
        vm.warp(block.timestamp + 48 hours);
        vm.expectRevert(bytes("asset not qualified"));
        risk.executeAssetPolicy(token);
        beforeQualification.observedAt = uint64(block.timestamp);
        beforeQualification.validUntil = uint64(block.timestamp + 2 hours);
        beforeQualification.consecutiveHours = 48;
        (AssetRegistry.AssetRecord memory record,) = registry.asset(token);
        if (
            record.kind == AssetRegistry.AssetKind.STOCK
                || record.kind == AssetRegistry.AssetKind.ETF
        ) {
            beforeQualification.regularMarketSessions = 2;
        }
        vm.prank(deployer);
        registry.recordQualificationV3(token, beforeQualification);
        risk.executeAssetPolicy(token);
        vm.prank(deployer);
        registry.setActive(token, true);
        assertTrue(registry.isActive(token));
        vm.prank(deployer);
        risk.reduceAssetPolicy(token, false, 0);
        vm.prank(deployer);
        registry.setActive(token, false);

        address futureDao = makeAddr("future-dao-timelock");
        vm.prank(deployer);
        risk.proposeRiskAuthority(futureDao);
        vm.prank(futureDao);
        risk.acceptRiskAuthority();
        assertEq(risk.riskAuthority(), futureDao);

        vm.prank(deployer);
        basket.setCanaryControls(false, false, false);
        vm.prank(deployer);
        brain.setPurchasesEnabled(false);
        assertEq(basket.totalSupply(), 0);
        assertEq(basket.totalAssetsUsd(), 0);
        assertFalse(basket.buysEnabled());
        assertFalse(basket.sellsEnabled());
        assertFalse(basket.rebalancesEnabled());
        assertFalse(brain.purchasesEnabled());
    }
}
