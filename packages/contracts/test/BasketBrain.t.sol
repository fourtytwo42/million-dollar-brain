// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { MockToken } from "../src/MockToken.sol";
import { MockRouter } from "../src/MockRouter.sol";
import { MockValuationOracle } from "../src/MockValuationOracle.sol";
import { RewardDistributor } from "../src/RewardDistributor.sol";
import { CreatorVault } from "../src/CreatorVault.sol";
import { BrainMarketplace } from "../src/BrainMarketplace.sol";
import { BasketVault } from "../src/BasketVault.sol";

contract BasketBrainTest is Test {
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal automation = makeAddr("automation");
    MockToken internal usdg;
    MockToken internal nvda;
    MockToken internal aapl;
    MockRouter internal router;
    MockValuationOracle internal oracle;
    RewardDistributor internal rewards;
    CreatorVault internal creatorVault;
    BrainMarketplace internal brain;
    BasketVault internal basket;

    function setUp() public {
        usdg = new MockToken("Mock USDG", "USDG", 18, admin);
        nvda = new MockToken("Mock NVIDIA", "NVDA", 18, admin);
        aapl = new MockToken("Mock Apple", "AAPL", 18, admin);
        router = new MockRouter(address(usdg), admin);
        oracle = new MockValuationOracle(admin);
        vm.prank(admin);
        router.setPrice(address(nvda), 180e18);
        vm.prank(admin);
        router.setPrice(address(aapl), 220e18);
        vm.prank(admin);
        oracle.setPrice(address(nvda), 180e18);
        vm.prank(admin);
        oracle.setPrice(address(aapl), 220e18);
        vm.startPrank(admin);
        usdg.mint(address(router), 10_000_000e18);
        nvda.mint(address(router), 100_000e18);
        aapl.mint(address(router), 100_000e18);
        usdg.mint(alice, 100_000e18);
        usdg.mint(bob, 100_000e18);
        uint256[] memory rewardWeights = new uint256[](42);
        uint16[] memory brainWeights = new uint16[](42);
        for (uint256 i; i < 6; ++i) {
            brainWeights[i] = 500;
        }
        for (uint256 i = 6; i < 18; ++i) {
            brainWeights[i] = 300;
        }
        for (uint256 i = 18; i < 34; ++i) {
            brainWeights[i] = 150;
        }
        for (uint256 i = 34; i < 42; ++i) {
            brainWeights[i] = 125;
        }
        for (uint256 i; i < 42; ++i) {
            rewardWeights[i] = brainWeights[i];
        }
        CreatorVault creatorVaultImpl = new CreatorVault();
        creatorVault = CreatorVault(
            address(
                new ERC1967Proxy(
                    address(creatorVaultImpl),
                    abi.encodeCall(CreatorVault.initialize, (admin, address(usdg)))
                )
            )
        );
        RewardDistributor rewardImpl = new RewardDistributor();
        rewards = RewardDistributor(
            address(
                new ERC1967Proxy(
                    address(rewardImpl),
                    abi.encodeCall(
                        RewardDistributor.initialize,
                        (admin, address(usdg), rewardWeights, address(creatorVault))
                    )
                )
            )
        );
        BrainMarketplace brainImpl = new BrainMarketplace();
        brain = BrainMarketplace(
            address(
                new ERC1967Proxy(
                    address(brainImpl),
                    abi.encodeCall(
                        BrainMarketplace.initialize,
                        (
                            admin,
                            address(usdg),
                            address(rewards),
                            address(creatorVault),
                            brainWeights,
                            42_000e18,
                            3,
                            keccak256("MDB_BRAIN_CATALOG_V3")
                        )
                    )
                )
            )
        );
        rewards.grantRole(rewards.BRAIN_ROLE(), address(brain));
        address[] memory assets = new address[](2);
        assets[0] = address(nvda);
        assets[1] = address(aapl);
        BasketVault basketImpl = new BasketVault();
        basket = BasketVault(
            address(
                new ERC1967Proxy(
                    address(basketImpl),
                    abi.encodeCall(
                        BasketVault.initialize,
                        (
                            admin,
                            address(usdg),
                            address(router),
                            address(rewards),
                            address(creatorVault),
                            automation,
                            assets
                        )
                    )
                )
            )
        );
        address[] memory bootstrapAssets = new address[](3);
        uint16[] memory bootstrapWeights = new uint16[](3);
        bootstrapAssets[0] = address(usdg);
        bootstrapAssets[1] = address(nvda);
        bootstrapAssets[2] = address(aapl);
        bootstrapWeights[0] = 2_000;
        bootstrapWeights[1] = 4_000;
        bootstrapWeights[2] = 4_000;
        basket.reinitializeV2(address(oracle), 120, 100, bootstrapAssets, bootstrapWeights);
        vm.stopPrank();
    }

    function testDepositRebalanceAndRedeem() public {
        uint256 creatorBefore = usdg.balanceOf(address(creatorVault));
        vm.startPrank(alice);
        usdg.approve(address(basket), 10_000e18);
        uint256 shares = basket.deposit(10_000e18, 9_900e18, block.timestamp + 1 hours);
        vm.stopPrank();
        assertEq(shares, 9_900e18);
        // With no brain owners, the 50% brain share follows the locked fallback to creator.
        assertEq(usdg.balanceOf(address(creatorVault)) - creatorBefore, 90e18);
        assertEq(usdg.balanceOf(automation), 10e18);
        vm.prank(admin);
        creatorVault.withdraw(admin, 10e18);
        assertEq(usdg.balanceOf(address(creatorVault)) - creatorBefore, 80e18);
        address[] memory targets = new address[](3);
        uint16[] memory weights = new uint16[](3);
        targets[0] = address(usdg);
        weights[0] = 2_000;
        targets[1] = address(nvda);
        weights[1] = 4_000;
        targets[2] = address(aapl);
        weights[2] = 4_000;
        vm.prank(admin);
        basket.rebalance(targets, weights, keccak256("cycle"));
        assertGt(nvda.balanceOf(address(basket)), 0);

        // A synchronous redemption now liquidates the same fraction of every position.
        vm.prank(alice);
        basket.redeem(50e18, 1, block.timestamp + 1 hours);
        assertGt(usdg.balanceOf(alice), 90_000e18);
    }

    function testEventOnlyUpgradePreservesPoolStateAndEmitsRebalanceTrades() public {
        vm.startPrank(alice);
        usdg.approve(address(basket), type(uint256).max);
        basket.deposit(10_000e18, 9_899e18, block.timestamp + 1 hours);
        vm.stopPrank();
        uint256 supplyBefore = basket.totalSupply();
        uint256 navBefore = basket.totalAssetsUsd();
        uint256 aliceBefore = basket.balanceOf(alice);
        uint256 nextRequestBefore = basket.nextRedemptionRequestId();

        BasketVault replacement = new BasketVault();
        vm.prank(admin);
        basket.upgradeToAndCall(address(replacement), "");

        assertEq(basket.totalSupply(), supplyBefore);
        assertEq(basket.totalAssetsUsd(), navBefore);
        assertEq(basket.balanceOf(alice), aliceBefore);
        assertEq(basket.nextRedemptionRequestId(), nextRequestBefore);
        assertEq(basket.maximumSlippageBps(), 100);

        address[] memory targets = new address[](3);
        uint16[] memory weights = new uint16[](3);
        targets[0] = address(usdg);
        targets[1] = address(nvda);
        targets[2] = address(aapl);
        weights[0] = 2_000;
        weights[1] = 6_000;
        weights[2] = 2_000;
        vm.recordLogs();
        vm.prank(admin);
        basket.rebalance(targets, weights, keccak256("event-cycle"));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 signature =
            keccak256("RebalanceAssetTraded(bytes32,address,bool,uint256,uint256,uint256)");
        uint256 tradeEvents;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == signature) {
                tradeEvents += 1;
            }
        }
        assertGt(tradeEvents, 0);
    }

    function testBootstrapDepositBuysEveryPositiveTargetWithoutDilution() public {
        vm.startPrank(alice);
        usdg.approve(address(basket), type(uint256).max);
        uint256 aliceShares = basket.deposit(10_000e18, 9_899e18, block.timestamp + 1 hours);
        vm.stopPrank();

        assertEq(aliceShares, 9_900e18);
        assertGt(nvda.balanceOf(address(basket)), 0);
        assertGt(aapl.balanceOf(address(basket)), 0);
        assertApproxEqAbs(basket.navPerShareWad(), 1e18, 2);
        uint256 nvdaWeightBefore = basket.currentWeightBps(address(nvda));
        uint256 aaplWeightBefore = basket.currentWeightBps(address(aapl));

        vm.startPrank(bob);
        usdg.approve(address(basket), type(uint256).max);
        uint256 bobShares = basket.deposit(5_000e18, 4_949e18, block.timestamp + 1 hours);
        vm.stopPrank();

        assertApproxEqAbs(bobShares, 4_950e18, 3);
        assertApproxEqAbs(basket.navPerShareWad(), 1e18, 3);
        assertApproxEqAbs(basket.currentWeightBps(address(nvda)), nvdaWeightBefore, 1);
        assertApproxEqAbs(basket.currentWeightBps(address(aapl)), aaplWeightBefore, 1);
    }

    function testNavPriceMovesWithOracleWithoutChangingSupply() public {
        vm.startPrank(alice);
        usdg.approve(address(basket), 10_000e18);
        basket.deposit(10_000e18, 9_899e18, block.timestamp + 1 hours);
        vm.stopPrank();
        uint256 supplyBefore = basket.totalSupply();
        uint256 priceBefore = basket.navPerShareWad();

        vm.prank(admin);
        oracle.setPrice(address(nvda), 270e18);

        assertEq(basket.totalSupply(), supplyBefore);
        assertGt(basket.navPerShareWad(), priceBefore);
    }

    function testProportionalRedemptionPreservesRemainingWeights() public {
        vm.startPrank(alice);
        usdg.approve(address(basket), 10_000e18);
        basket.deposit(10_000e18, 9_899e18, block.timestamp + 1 hours);
        vm.stopPrank();
        uint256 usdgWeightBefore = basket.currentWeightBps(address(usdg));
        uint256 nvdaWeightBefore = basket.currentWeightBps(address(nvda));
        uint256 aaplWeightBefore = basket.currentWeightBps(address(aapl));
        uint256 priceBefore = basket.navPerShareWad();

        vm.prank(alice);
        basket.redeem(50e18, 1, block.timestamp + 1 hours);

        assertApproxEqAbs(basket.currentWeightBps(address(usdg)), usdgWeightBefore, 1);
        assertApproxEqAbs(basket.currentWeightBps(address(nvda)), nvdaWeightBefore, 1);
        assertApproxEqAbs(basket.currentWeightBps(address(aapl)), aaplWeightBefore, 1);
        assertApproxEqAbs(basket.navPerShareWad(), priceBefore, 3);
    }

    function testSecondaryTransferDoesNotTradeUnderlying() public {
        vm.startPrank(alice);
        usdg.approve(address(basket), 10_000e18);
        basket.deposit(10_000e18, 9_899e18, block.timestamp + 1 hours);
        uint256 usdgBefore = usdg.balanceOf(address(basket));
        uint256 nvdaBefore = nvda.balanceOf(address(basket));
        uint256 aaplBefore = aapl.balanceOf(address(basket));
        assertTrue(basket.transfer(bob, 1_000e18));
        vm.stopPrank();

        assertEq(usdg.balanceOf(address(basket)), usdgBefore);
        assertEq(nvda.balanceOf(address(basket)), nvdaBefore);
        assertEq(aapl.balanceOf(address(basket)), aaplBefore);
    }

    function testRebalanceIgnoresSubBasisPointRoundingDrift() public {
        vm.startPrank(alice);
        usdg.approve(address(basket), 10_000e18);
        basket.deposit(10_000e18, 9_899e18, block.timestamp + 1 hours);
        vm.stopPrank();
        address[] memory targets = new address[](3);
        uint16[] memory targetWeights = new uint16[](3);
        targets[0] = address(usdg);
        targets[1] = address(nvda);
        targets[2] = address(aapl);
        targetWeights[0] = 2_000;
        targetWeights[1] = 4_000;
        targetWeights[2] = 4_000;

        vm.prank(admin);
        basket.rebalance(targets, targetWeights, keccak256("rounding-drift"));

        assertApproxEqAbs(basket.currentWeightBps(address(usdg)), 2_000, 1);
        assertApproxEqAbs(basket.currentWeightBps(address(nvda)), 4_000, 1);
        assertApproxEqAbs(basket.currentWeightBps(address(aapl)), 4_000, 1);
    }

    function testStaleValuationFailsClosed() public {
        vm.warp(1_000);
        vm.startPrank(admin);
        oracle.setAutomaticFreshness(false);
        oracle.setPriceStatus(address(nvda), 180e18, block.timestamp - 121, true);
        vm.stopPrank();

        vm.startPrank(alice);
        usdg.approve(address(basket), 10_000e18);
        vm.expectRevert("stale price");
        basket.deposit(10_000e18, 1, block.timestamp + 1 hours);
        vm.stopPrank();
    }

    function testExecutionOutsideValuationSlippageRevertsAtomically() public {
        vm.prank(admin);
        router.setPrice(address(nvda), 360e18);
        vm.startPrank(alice);
        usdg.approve(address(basket), 10_000e18);
        vm.expectRevert();
        basket.deposit(10_000e18, 1, block.timestamp + 1 hours);
        vm.stopPrank();
        assertEq(basket.totalSupply(), 0);
        assertEq(usdg.balanceOf(address(basket)), 0);
    }

    function testFuzzProportionalDepositDoesNotDiluteExistingHolder(uint96 rawAmount) public {
        vm.startPrank(alice);
        usdg.approve(address(basket), 10_000e18);
        basket.deposit(10_000e18, 9_899e18, block.timestamp + 1 hours);
        vm.stopPrank();
        uint256 priceBefore = basket.navPerShareWad();
        uint256 amount = bound(uint256(rawAmount), 10e18, 25_000e18);

        vm.startPrank(bob);
        usdg.approve(address(basket), amount);
        basket.deposit(amount, 1, block.timestamp + 1 hours);
        vm.stopPrank();

        assertApproxEqAbs(basket.navPerShareWad(), priceBefore, 5);
    }

    function testBrainSaleExcludesTransferredPieceFromMarkupReward() public {
        assertEq(brain.catalogVersion(), 3);
        assertEq(brain.catalogHash(), keccak256("MDB_BRAIN_CATALOG_V3"));
        assertTrue(brain.affinityId(1) != bytes32(0));
        assertEq(brain.name(), "MillionDollar Brain Pieces");
        assertEq(brain.symbol(), "MDBP");
        assertEq(brain.ownerOf(1), address(brain));
        assertTrue(brain.isUnowned(1));
        vm.startPrank(alice);
        usdg.approve(address(brain), type(uint256).max);
        brain.buy(1, type(uint256).max, block.timestamp + 1 hours);
        brain.setPreset(1, 4);
        assertEq(brain.selectedPreset(1), 4);
        vm.expectRevert("invalid preset");
        brain.setPreset(1, 5);
        vm.expectRevert("use marketplace");
        brain.transferFrom(alice, bob, 1);
        vm.stopPrank();
        assertFalse(brain.isUnowned(1));
        vm.startPrank(bob);
        usdg.approve(address(brain), type(uint256).max);
        brain.buy(2, type(uint256).max, block.timestamp + 1 hours);
        vm.stopPrank();
        uint256 aliceBefore = usdg.balanceOf(alice);
        vm.startPrank(bob);
        brain.buy(1, type(uint256).max, block.timestamp + 1 hours);
        vm.stopPrank();
        assertGt(usdg.balanceOf(alice), aliceBefore);
        assertEq(brain.ownerOf(1), bob);
    }

    function testBrainOwnerCanChangePortraitOncePerOwnership() public {
        bytes32 alicePortrait = keccak256("alice portrait");
        bytes32 bobPortrait = keccak256("bob portrait");

        assertFalse(brain.canChangePortrait(1, alice));
        vm.prank(alice);
        vm.expectRevert("not owner");
        brain.setPortrait(1, alicePortrait);

        vm.startPrank(alice);
        usdg.approve(address(brain), type(uint256).max);
        brain.buy(1, type(uint256).max, block.timestamp + 1 hours);
        assertEq(brain.ownershipSerial(1), 1);
        assertTrue(brain.canChangePortrait(1, alice));
        vm.expectRevert("empty portrait");
        brain.setPortrait(1, bytes32(0));
        brain.setPortrait(1, alicePortrait);
        assertEq(brain.portraitHash(1), alicePortrait);
        assertFalse(brain.canChangePortrait(1, alice));
        vm.expectRevert("portrait already changed");
        brain.setPortrait(1, keccak256("second alice portrait"));
        vm.stopPrank();

        vm.startPrank(bob);
        usdg.approve(address(brain), type(uint256).max);
        brain.buy(1, type(uint256).max, block.timestamp + 1 hours);
        assertEq(brain.ownershipSerial(1), 2);
        assertEq(brain.portraitHash(1), alicePortrait);
        assertTrue(brain.canChangePortrait(1, bob));
        brain.setPortrait(1, bobPortrait);
        assertEq(brain.portraitHash(1), bobPortrait);
        assertFalse(brain.canChangePortrait(1, bob));
        vm.stopPrank();
    }

    function testExistingOwnerCanChangePortraitAfterImplementationUpgrade() public {
        vm.startPrank(alice);
        usdg.approve(address(brain), type(uint256).max);
        brain.buy(1, type(uint256).max, block.timestamp + 1 hours);
        vm.stopPrank();

        // A proxy upgraded from the previous implementation has zero in all
        // appended portrait slots. Its current owner must still receive one use.
        assertEq(brain.ownershipSerial(1), 1);
        assertEq(brain.portraitChangeSerialPlusOne(1), 0);
        assertTrue(brain.canChangePortrait(1, alice));
    }

    function testCurrentBrainOwnerCanClaimBasketFees() public {
        vm.startPrank(alice);
        usdg.approve(address(brain), type(uint256).max);
        brain.buy(1, type(uint256).max, block.timestamp + 1 hours);
        usdg.approve(address(basket), 1_000e18);
        basket.deposit(1_000e18, 990e18, block.timestamp + 1 hours);
        vm.stopPrank();

        uint256[] memory pieceIds = new uint256[](1);
        pieceIds[0] = 1;
        uint256 pending = rewards.pendingRewards(alice, pieceIds);
        assertEq(pending, 5e18);

        uint256 beforeClaim = usdg.balanceOf(alice);
        vm.prank(alice);
        uint256 claimed = rewards.claim(pieceIds);
        assertEq(claimed, pending);
        assertEq(usdg.balanceOf(alice), beforeClaim + pending);
        assertEq(rewards.pendingRewards(alice, pieceIds), 0);
    }

    function testLargeRedemptionExecutesAtomicallyWithoutQueue() public {
        vm.startPrank(alice);
        usdg.approve(address(basket), 10_000e18);
        basket.deposit(10_000e18, 9_900e18, block.timestamp + 1 hours);
        vm.stopPrank();

        address[] memory targets = new address[](3);
        uint16[] memory weights = new uint16[](3);
        targets[0] = address(usdg);
        weights[0] = 2_000;
        targets[1] = address(nvda);
        weights[1] = 4_000;
        targets[2] = address(aapl);
        weights[2] = 4_000;
        vm.prank(admin);
        basket.rebalance(targets, weights, keccak256("illiquid"));

        uint256 soldShares = 4_000e18;
        assertTrue(basket.canRedeemImmediately(alice, soldShares));
        uint256 beforeUsdg = usdg.balanceOf(alice);
        uint256 beforeSupply = basket.totalSupply();
        vm.prank(alice);
        basket.redeem(soldShares, 1, block.timestamp + 1 hours);
        assertEq(basket.totalSupply(), beforeSupply - soldShares);
        assertEq(basket.balanceOf(alice), 9_900e18 - soldShares);
        assertGt(usdg.balanceOf(alice), beforeUsdg);
        assertEq(basket.pendingRedemptionByAccount(alice), 0);
        assertEq(basket.balanceOf(address(basket)), 0);
    }

    function testAtomicRedemptionFailureLeavesStateUnchanged() public {
        vm.startPrank(alice);
        usdg.approve(address(basket), 10_000e18);
        basket.deposit(10_000e18, 9_900e18, block.timestamp + 1 hours);
        vm.stopPrank();

        uint256 shares = 4_000e18;
        uint256 beforeShares = basket.balanceOf(alice);
        uint256 beforeSupply = basket.totalSupply();
        uint256 beforeNvda = nvda.balanceOf(address(basket));
        uint256 beforeUsdg = usdg.balanceOf(alice);
        vm.prank(admin);
        router.setPrice(address(nvda), 90e18);

        vm.prank(alice);
        vm.expectRevert();
        basket.redeem(shares, 1, block.timestamp + 1 hours);

        assertEq(basket.balanceOf(alice), beforeShares);
        assertEq(basket.totalSupply(), beforeSupply);
        assertEq(nvda.balanceOf(address(basket)), beforeNvda);
        assertEq(usdg.balanceOf(alice), beforeUsdg);
        assertEq(basket.pendingRedemptionByAccount(alice), 0);
    }

    function testQueuedRedemptionsAreDisabled() public {
        vm.prank(alice);
        vm.expectRevert(BasketVault.QueuedExitsDisabled.selector);
        basket.requestRedemption(100e18, 1, block.timestamp + 1 hours);

        vm.prank(admin);
        vm.expectRevert(BasketVault.QueuedExitsDisabled.selector);
        basket.processRedemptions(10);
    }

    function testDepositAndRedemptionCapsAreEnforced() public {
        vm.startPrank(alice);
        usdg.approve(address(basket), type(uint256).max);
        vm.expectRevert("wallet cap");
        basket.deposit(26_000e18, 1, block.timestamp + 1 hours);
        basket.deposit(1_000e18, 990e18, block.timestamp + 1 hours);
        vm.expectRevert("minimum redemption");
        basket.redeem(5e18, 1, block.timestamp + 1 hours);
        vm.expectRevert(BasketVault.QueuedExitsDisabled.selector);
        basket.requestRedemption(5e18, 1, block.timestamp + 1 hours);
        vm.expectRevert(BasketVault.QueuedExitsDisabled.selector);
        basket.requestRedemption(100e18, 1, block.timestamp - 1);
        vm.stopPrank();
    }
}
