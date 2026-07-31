// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { AssetRegistry } from "../src/AssetRegistry.sol";
import { CreatorRiskController } from "../src/CreatorRiskController.sol";

contract RiskVaultMock {
    uint256 public tvlCapUsdWad = 60_000e18;

    function setTvlCapUsdWad(uint256 capUsdWad) external {
        tvlCapUsdWad = capUsdWad;
    }
}

contract CreatorRiskControllerTest is Test {
    AssetRegistry internal registry;
    CreatorRiskController internal controller;
    RiskVaultMock internal vault;
    address[] internal assets;

    function setUp() public {
        registry = AssetRegistry(
            address(
                new ERC1967Proxy(
                    address(new AssetRegistry()),
                    abi.encodeCall(AssetRegistry.initialize, (address(this), block.chainid))
                )
            )
        );
        registry.reinitializeV3();
        registry.setQualificationV3Enabled(true);
        vault = new RiskVaultMock();
        controller = CreatorRiskController(
            address(
                new ERC1967Proxy(
                    address(new CreatorRiskController()),
                    abi.encodeCall(
                        CreatorRiskController.initialize,
                        (address(this), address(vault), address(registry), uint64(48 hours))
                    )
                )
            )
        );
        for (uint256 i; i < 5; ++i) {
            address token = address(uint160(0x1000 + i));
            assets.push(token);
            registry.registerAsset(
                AssetRegistry.AssetRecord({
                    token: token,
                    robinhoodUid: bytes32(i + 1),
                    kind: AssetRegistry.AssetKind.STOCK,
                    riskClass: i == 4
                        ? AssetRegistry.RiskClass.HIGH_VOLATILITY
                        : AssetRegistry.RiskClass.STANDARD,
                    valuationAdapter: address(0xA11CE),
                    executionAdapter: address(0xB0B),
                    circulatingSupplyAdapter: address(0),
                    maximumWeightBps: 2_000,
                    registered: false,
                    active: false
                })
            );
            registry.recordQualificationV3(token, _qualification(25_000e18, true));
            registry.setActive(token, true);
        }
        registry.reinitializeV4(address(controller), assets);
    }

    function testRiskReductionsAreImmediateAndIncreasesAreDelayed() public {
        controller.reduceTvlCap(50_000e18);
        assertEq(vault.tvlCapUsdWad(), 50_000e18);
        address[] memory witness = _witnessFour();
        controller.scheduleTvlCapIncrease(60_000e18, witness);
        vm.expectRevert(bytes("not ready"));
        controller.executeTvlCapIncrease(witness);
        vm.warp(block.timestamp + 48 hours);
        controller.executeTvlCapIncrease(witness);
        assertEq(vault.tvlCapUsdWad(), 60_000e18);
    }

    function testCapacityWitnessRejectsDuplicatesAndInsufficientCapacity() public {
        address[] memory duplicate = _witnessFour();
        duplicate[3] = duplicate[0];
        vm.expectRevert(bytes("duplicate asset"));
        controller.scheduleTvlCapIncrease(70_000e18, duplicate);
        vm.expectRevert(bytes("insufficient risk capacity"));
        controller.scheduleTvlCapIncrease(100_000e18, _witnessFour());
    }

    function testDisableIsImmediateAndReapprovalIsDelayed() public {
        address token = assets[0];
        controller.reduceAssetPolicy(token, false, 0);
        assertFalse(registry.isCreatorApproved(token));
        assertFalse(registry.isActive(token));
        (AssetRegistry.AssetRecord memory record,) = registry.asset(token);
        assertTrue(record.active);
        vm.expectRevert(bytes("disabled cap must be zero"));
        controller.reduceAssetPolicy(token, false, 1);
        controller.scheduleAssetPolicy(token, true, 10_000e18);
        vm.expectRevert(bytes("not ready"));
        controller.executeAssetPolicy(token);
        vm.warp(block.timestamp + 48 hours);
        controller.executeAssetPolicy(token);
        assertTrue(registry.isCreatorApproved(token));
        assertTrue(registry.isActive(token));
        (, uint128 effectiveCap) = registry.riskPolicy(token);
        assertEq(effectiveCap, 10_000e18);
    }

    function testAssetReductionCannotUseTheDelayedIncreasePath() public {
        vm.expectRevert(bytes("not an increase"));
        controller.scheduleAssetPolicy(assets[0], true, 10_000e18);
    }

    function testQualificationAlwaysOverridesCreatorApproval() public {
        address token = assets[0];
        registry.recordQualificationV3(token, _qualification(25_000e18, false));
        assertFalse(registry.isActive(token));
        controller.reduceAssetPolicy(token, true, 10_000e18);
        (AssetRegistry.AssetRiskPolicyV1 memory reduced,) = registry.riskPolicy(token);
        assertEq(reduced.creatorCapUsdWad, 10_000e18);
        assertFalse(registry.isActive(token));
        vm.expectRevert(bytes("asset not qualified"));
        controller.scheduleAssetPolicy(token, true, 25_000e18);
    }

    function testOnlyRiskAuthorityCanChangePolicy() public {
        vm.startPrank(address(0xBAD));
        vm.expectRevert();
        controller.reduceTvlCap(50_000e18);
        vm.expectRevert();
        controller.reduceAssetPolicy(assets[0], false, 0);
        vm.stopPrank();
    }

    function testExposureLimitViewIdentifiesTheBindingConstraint() public {
        AssetRegistry.AssetExposureLimitsV1 memory limits =
            registry.exposureLimits(assets[0], 60_000e18);
        assertEq(limits.effectiveCapUsdWad, 12_000e18);
        assertEq(
            uint256(limits.limitingConstraint),
            uint256(AssetRegistry.ExposureLimitConstraint.CONFIGURED_WEIGHT)
        );
        controller.reduceAssetPolicy(assets[0], true, 10_000e18);
        limits = registry.exposureLimits(assets[0], 60_000e18);
        assertEq(limits.effectiveCapUsdWad, 10_000e18);
        assertEq(
            uint256(limits.limitingConstraint),
            uint256(AssetRegistry.ExposureLimitConstraint.CREATOR_CAP)
        );
    }

    function testMigrationCannotSeedAnUnqualifiedApproval() public {
        AssetRegistry fresh = AssetRegistry(
            address(
                new ERC1967Proxy(
                    address(new AssetRegistry()),
                    abi.encodeCall(AssetRegistry.initialize, (address(this), block.chainid))
                )
            )
        );
        fresh.reinitializeV3();
        fresh.setQualificationV3Enabled(true);
        address token = address(0xBADC0DE);
        fresh.registerAsset(
            AssetRegistry.AssetRecord({
                token: token,
                robinhoodUid: keccak256("unqualified"),
                kind: AssetRegistry.AssetKind.STOCK,
                riskClass: AssetRegistry.RiskClass.STANDARD,
                valuationAdapter: address(0xA11CE),
                executionAdapter: address(0xB0B),
                circulatingSupplyAdapter: address(0),
                maximumWeightBps: 2_000,
                registered: false,
                active: true
            })
        );
        address[] memory approved = new address[](1);
        approved[0] = token;
        vm.expectRevert(bytes("asset not qualified"));
        fresh.reinitializeV4(address(controller), approved);
    }

    function testRiskAuthorityUsesTwoStepTransfer() public {
        address futureDao = address(0xDA0);
        controller.proposeRiskAuthority(futureDao);
        vm.prank(futureDao);
        controller.acceptRiskAuthority();
        assertEq(controller.riskAuthority(), futureDao);
        vm.expectRevert();
        controller.reduceTvlCap(50_000e18);
        vm.prank(futureDao);
        controller.reduceTvlCap(50_000e18);
        assertEq(vault.tvlCapUsdWad(), 50_000e18);
        assertFalse(controller.hasRole(controller.DEFAULT_ADMIN_ROLE(), futureDao));
        assertTrue(controller.hasRole(controller.DEFAULT_ADMIN_ROLE(), address(this)));
        bytes32 riskAdminRole = controller.RISK_ADMIN_ROLE();
        vm.expectRevert();
        controller.grantRole(riskAdminRole, address(this));
        vm.expectRevert();
        controller.revokeRole(riskAdminRole, futureDao);
        vm.prank(futureDao);
        vm.expectRevert();
        controller.renounceRole(riskAdminRole, futureDao);
    }

    function _witnessFour() private view returns (address[] memory witness) {
        witness = new address[](4);
        for (uint256 i; i < 4; ++i) {
            witness[i] = assets[i];
        }
    }

    function _qualification(uint128 capacity, bool valid)
        private
        view
        returns (AssetRegistry.AssetQualificationV3 memory)
    {
        return AssetRegistry.AssetQualificationV3({
            evidenceHash: keccak256(abi.encode(capacity, valid, block.timestamp)),
            observedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 7 days),
            consecutiveHours: 48,
            regularMarketSessions: 2,
            safeTwoSidedCapacityUsdWad: capacity,
            identityValid: valid,
            routeMature: valid,
            shortTwapValid: valid,
            longTwapValid: valid,
            timeWeightedLiquidityValid: valid,
            liquidityValid: valid,
            transferBehaviorValid: valid,
            tokenStateClear: valid
        });
    }
}
