// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { StdInvariant } from "forge-std/StdInvariant.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { MockToken } from "../src/MockToken.sol";
import { MockRouter } from "../src/MockRouter.sol";
import { MockValuationOracle } from "../src/MockValuationOracle.sol";
import { RewardDistributor } from "../src/RewardDistributor.sol";
import { CreatorVault } from "../src/CreatorVault.sol";
import { BrainMarketplace } from "../src/BrainMarketplace.sol";
import { BrainProfileCatalog } from "../src/generated/BrainProfileCatalog.sol";
import { BasketVault } from "../src/BasketVault.sol";

contract DevnetTortureHandler is Test {
    MockToken public immutable usdg;
    MockToken public immutable nvda;
    MockToken public immutable aapl;
    RewardDistributor public immutable rewards;
    BrainMarketplace public immutable brain;
    BasketVault public immutable basket;

    address[12] private actors;
    uint256 public successfulDeposits;
    uint256 public successfulRedemptions;
    uint256 public successfulTransfers;
    uint256 public successfulBrainPurchases;
    uint256 public successfulClaims;
    uint256 public successfulProfiles;

    constructor(
        MockToken usdg_,
        MockToken nvda_,
        MockToken aapl_,
        RewardDistributor rewards_,
        BrainMarketplace brain_,
        BasketVault basket_,
        address[12] memory actors_
    ) {
        usdg = usdg_;
        nvda = nvda_;
        aapl = aapl_;
        rewards = rewards_;
        brain = brain_;
        basket = basket_;
        actors = actors_;
    }

    function actorAt(uint256 index) external view returns (address) {
        return actors[index];
    }

    function deposit(uint256 actorSeed, uint256 amountSeed, uint256 minSharesSeed) external {
        address actor = actors[actorSeed % actors.length];
        uint256 gross = bound(amountSeed, 1, 5_000e18);
        uint256 minShares = minSharesSeed % 2 == 0 ? 0 : gross;
        vm.startPrank(actor);
        usdg.approve(address(basket), gross);
        try basket.deposit(gross, minShares, block.timestamp + 1 hours) {
            successfulDeposits++;
        } catch { }
        vm.stopPrank();
    }

    function redeem(uint256 actorSeed, uint256 shareSeed, uint256 minOutputSeed) external {
        address actor = actors[actorSeed % actors.length];
        uint256 balance = basket.balanceOf(actor);
        if (balance == 0) return;
        uint256 shares = bound(shareSeed, 1, balance);
        uint256 minOutput = minOutputSeed % 3 == 0 ? type(uint256).max : 0;
        vm.prank(actor);
        try basket.redeem(shares, minOutput, block.timestamp + 1 hours) {
            successfulRedemptions++;
        } catch { }
    }

    function transferShares(uint256 fromSeed, uint256 toSeed, uint256 amountSeed) external {
        address from = actors[fromSeed % actors.length];
        address to = actors[toSeed % actors.length];
        if (from == to) return;
        uint256 balance = basket.balanceOf(from);
        if (balance == 0) return;
        uint256 amount = bound(amountSeed, 1, balance);
        vm.prank(from);
        try basket.transfer(to, amount) returns (bool ok) {
            if (ok) successfulTransfers++;
        } catch { }
    }

    function allowanceChurn(uint256 actorSeed, uint256 amount) external {
        address actor = actors[actorSeed % actors.length];
        vm.startPrank(actor);
        usdg.approve(address(basket), amount);
        usdg.approve(address(basket), 0);
        basket.approve(actors[(actorSeed + 1) % actors.length], amount);
        basket.approve(actors[(actorSeed + 1) % actors.length], 0);
        vm.stopPrank();
    }

    function buyBrain(uint256 actorSeed, uint256 pieceSeed, uint256 priceMode) external {
        address actor = actors[actorSeed % actors.length];
        uint256 pieceId = (pieceSeed % 42) + 1;
        if (brain.ownerOf(pieceId) == actor) return;
        uint256 price = brain.currentPrice(pieceId);
        uint256 maximumPrice = priceMode % 4 == 0 && price > 0 ? price - 1 : price;
        vm.startPrank(actor);
        usdg.approve(address(brain), price);
        try brain.buy(pieceId, maximumPrice, block.timestamp + 1 hours) {
            successfulBrainPurchases++;
        } catch { }
        vm.stopPrank();
    }

    function setPreset(uint256 actorSeed, uint256 pieceSeed, uint8 presetSeed) external {
        address actor = actors[actorSeed % actors.length];
        uint256 pieceId = (pieceSeed % 42) + 1;
        if (brain.ownerOf(pieceId) != actor) return;
        vm.prank(actor);
        try brain.setPreset(pieceId, presetSeed % 7) { } catch { }
    }

    function setProfile(uint256 actorSeed, uint256 pieceSeed, uint256 profileSeed) external {
        address actor = actors[actorSeed % actors.length];
        uint256 pieceId = (pieceSeed % 42) + 1;
        if (!brain.canChangeProfile(pieceId, actor)) return;
        bytes32 portrait = keccak256(abi.encode("torture-profile", profileSeed));
        vm.prank(actor);
        try brain.setProfileV2(
            pieceId,
            portrait,
            "Torture Cell",
            "https://42braincells.com",
            "Still thinking, unfortunately.",
            0
        ) {
            successfulProfiles++;
        } catch { }
    }

    function claim(uint256 actorSeed, uint256 pieceSeed) external {
        address actor = actors[actorSeed % actors.length];
        uint256 pieceId = (pieceSeed % 42) + 1;
        if (brain.ownerOf(pieceId) != actor) return;
        uint256[] memory pieces = new uint256[](1);
        pieces[0] = pieceId;
        vm.prank(actor);
        try rewards.claim(pieces) {
            successfulClaims++;
        } catch { }
    }

    function expiredDeposit(uint256 actorSeed, uint256 amountSeed) external {
        address actor = actors[actorSeed % actors.length];
        uint256 gross = bound(amountSeed, 1, 1_000e18);
        vm.startPrank(actor);
        usdg.approve(address(basket), gross);
        try basket.deposit(gross, 0, block.timestamp - 1) { } catch { }
        vm.stopPrank();
    }
}

contract DevnetTortureInvariant is StdInvariant, Test {
    address internal admin = makeAddr("admin");
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
    DevnetTortureHandler internal handler;
    address[12] internal actors;

    function setUp() public {
        usdg = new MockToken("Mock USDG", "USDG", 18, admin);
        nvda = new MockToken("Mock NVIDIA", "NVDA", 18, admin);
        aapl = new MockToken("Mock Apple", "AAPL", 18, admin);
        router = new MockRouter(address(usdg), admin);
        oracle = new MockValuationOracle(admin);

        uint256[] memory rewardWeights = new uint256[](42);
        uint16[] memory brainWeights = new uint16[](42);
        for (uint256 i; i < 42; ++i) {
            if (i < 6) brainWeights[i] = 500;
            else if (i < 18) brainWeights[i] = 300;
            else if (i < 34) brainWeights[i] = 150;
            else brainWeights[i] = 125;
            rewardWeights[i] = brainWeights[i];
            actors[i % actors.length] =
                actors[i % actors.length] == address(0)
                    ? makeAddr(string.concat("actor-", vm.toString(i % actors.length)))
                    : actors[i % actors.length];
        }

        vm.startPrank(admin);
        router.setPrice(address(nvda), 180e18);
        router.setPrice(address(aapl), 220e18);
        oracle.setPrice(address(nvda), 180e18);
        oracle.setPrice(address(aapl), 220e18);
        usdg.mint(address(router), 100_000_000e18);
        nvda.mint(address(router), 1_000_000e18);
        aapl.mint(address(router), 1_000_000e18);
        for (uint256 i; i < actors.length; ++i) {
            usdg.mint(actors[i], 100_000_000e18);
        }

        CreatorVault creatorImpl = new CreatorVault();
        creatorVault = CreatorVault(
            address(
                new ERC1967Proxy(
                    address(creatorImpl),
                    abi.encodeCall(CreatorVault.initialize, (admin, address(usdg)))
                )
            )
        );
        RewardDistributor rewardsImpl = new RewardDistributor();
        rewards = RewardDistributor(
            address(
                new ERC1967Proxy(
                    address(rewardsImpl),
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
        brain.reinitializeV2(true);
        brain.reinitializeV6(
            BrainProfileCatalog.VERSION, BrainProfileCatalog.CATALOG_HASH, true, true
        );

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

        handler =
            new DevnetTortureHandler(usdg, nvda, aapl, rewards, brain, basket, actors);
        targetContract(address(handler));
    }

    function invariant_shareSupplyEqualsKnownBalances() public view {
        uint256 sum;
        for (uint256 i; i < actors.length; ++i) {
            sum += basket.balanceOf(actors[i]);
        }
        assertEq(sum, basket.totalSupply(), "BRAINS supply escaped known actors");
    }

    function invariant_navReconcilesWithValidatedAssets() public view {
        uint256 expected = usdg.balanceOf(address(basket));
        expected += oracle.quoteUsd(address(nvda), nvda.balanceOf(address(basket)));
        expected += oracle.quoteUsd(address(aapl), aapl.balanceOf(address(basket)));
        assertApproxEqAbs(basket.totalAssetsUsd(), expected, 3, "NAV mismatch");
    }

    function invariant_noQueuedRedemptions() public view {
        assertEq(basket.nextRedemptionRequestId(), 1);
        assertEq(basket.nextRedemptionToProcess(), 1);
        for (uint256 i; i < actors.length; ++i) {
            assertEq(basket.pendingRedemptionByAccount(actors[i]), 0);
        }
    }

    function invariant_brainOwnersAndRewardsAgree() public view {
        for (uint256 pieceId = 1; pieceId <= 42; ++pieceId) {
            address owner = brain.ownerOf(pieceId);
            if (owner == address(brain)) owner = address(0);
            assertEq(rewards.ownerByPiece(pieceId), owner, "reward owner mismatch");
        }
    }

    function invariant_rewardLiabilitiesAreFunded() public view {
        uint256 totalPending;
        for (uint256 i; i < actors.length; ++i) {
            uint256 ownedCount;
            for (uint256 pieceId = 1; pieceId <= 42; ++pieceId) {
                if (brain.ownerOf(pieceId) == actors[i]) ownedCount++;
            }
            uint256[] memory owned = new uint256[](ownedCount);
            uint256 cursor;
            for (uint256 pieceId = 1; pieceId <= 42; ++pieceId) {
                if (brain.ownerOf(pieceId) == actors[i]) owned[cursor++] = pieceId;
            }
            totalPending += rewards.pendingRewards(actors[i], owned);
        }
        // Per-piece accumulator division can leave at most one wei of liability dust per piece.
        assertLe(
            totalPending,
            usdg.balanceOf(address(rewards)) + 42,
            "reward liabilities exceed bounded rounding dust"
        );
    }

    function invariant_secondaryTransfersDoNotTradeUnderlying() public view {
        assertEq(usdg.allowance(address(basket), address(router)), 0, "reserve allowance leaked");
        assertEq(nvda.allowance(address(basket), address(router)), 0, "NVDA allowance leaked");
        assertEq(aapl.allowance(address(basket), address(router)), 0, "AAPL allowance leaked");
    }
}
