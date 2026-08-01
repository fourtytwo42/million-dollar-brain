// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    UUPSUpgradeable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

interface IRiskControlledVault {
    function tvlCapUsdWad() external view returns (uint256);
    function setTvlCapUsdWad(uint256 capUsdWad) external;
}

interface IRiskControlledRegistry {
    function isEligibleV3(address token) external view returns (bool);
    function hasCurrentDexEvidenceV3(address token) external view returns (bool);
    function hasCanonicalIdentity(address token) external view returns (bool);
    function isHighVolatility(address token) external view returns (bool);
    function maximumWeightBps(address token) external view returns (uint16);
    function capacityExposureUsdWad(address token) external view returns (uint128);
    function riskPolicy(address token)
        external
        view
        returns (AssetRiskPolicyV1 memory policy, uint128 effectiveCapUsdWad);
    function applyRiskPolicy(address token, bool approved, uint128 creatorCapUsdWad) external;

    struct AssetRiskPolicyV1 {
        uint128 creatorCapUsdWad;
        uint64 version;
        bool approved;
    }
}

/// @notice Creator-controlled risk changes with delayed increases and an explicit future-DAO handoff.
contract CreatorRiskController is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    bytes32 public constant RISK_ADMIN_ROLE = keccak256("RISK_ADMIN_ROLE");
    uint256 public constant BPS = 10_000;
    uint256 public constant MIN_RESERVE_BPS = 2_000;
    uint256 public constant MAX_HIGH_VOLATILITY_BPS = 3_000;
    uint256 public constant MAX_ASSET_WEIGHT_BPS = 2_000;
    uint256 public constant MAX_WITNESS_ASSETS = 9;
    uint256 public constant MIN_RISK_ASSETS = 4;

    struct PendingTvlCap {
        uint128 capUsdWad;
        uint64 executableAt;
        bytes32 witnessHash;
    }

    struct PendingAssetPolicy {
        uint128 creatorCapUsdWad;
        uint64 executableAt;
        bool approved;
    }

    IRiskControlledVault public vault;
    IRiskControlledRegistry public registry;
    address public riskAuthority;
    address public pendingRiskAuthority;
    uint64 public riskIncreaseDelay;
    PendingTvlCap public pendingTvlCap;
    mapping(address token => PendingAssetPolicy policy) public pendingAssetPolicies;
    uint256[43] private __gap;

    event TvlCapReduced(uint256 previousCapUsdWad, uint256 newCapUsdWad);
    event TvlCapIncreaseScheduled(uint256 newCapUsdWad, uint64 executableAt, bytes32 witnessHash);
    event TvlCapIncreaseExecuted(uint256 previousCapUsdWad, uint256 newCapUsdWad);
    event TvlCapIncreaseCancelled();
    event AssetPolicyReduced(address indexed token, bool approved, uint128 creatorCapUsdWad);
    event AssetEmergencyDeactivated(address indexed token);
    event AssetPolicyScheduled(
        address indexed token, bool approved, uint128 creatorCapUsdWad, uint64 executableAt
    );
    event AssetPolicyExecuted(address indexed token, bool approved, uint128 creatorCapUsdWad);
    event AssetPolicyCancelled(address indexed token);
    event RiskAuthorityTransferStarted(
        address indexed currentAuthority, address indexed pendingAuthority
    );
    event RiskAuthorityTransferred(address indexed previousAuthority, address indexed newAuthority);

    function initialize(address admin, address vault_, address registry_, uint64 delaySeconds)
        external
        initializer
    {
        require(
            admin != address(0) && vault_ != address(0) && registry_ != address(0), "zero address"
        );
        require(delaySeconds >= 24 hours && delaySeconds <= 7 days, "invalid delay");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RISK_ADMIN_ROLE, admin);
        riskAuthority = admin;
        vault = IRiskControlledVault(vault_);
        registry = IRiskControlledRegistry(registry_);
        riskIncreaseDelay = delaySeconds;
    }

    function reduceTvlCap(uint128 newCapUsdWad) external onlyRole(RISK_ADMIN_ROLE) {
        uint256 previous = vault.tvlCapUsdWad();
        require(newCapUsdWad != 0 && newCapUsdWad < previous, "not a reduction");
        vault.setTvlCapUsdWad(newCapUsdWad);
        emit TvlCapReduced(previous, newCapUsdWad);
    }

    function scheduleTvlCapIncrease(uint128 newCapUsdWad, address[] calldata witness)
        external
        onlyRole(RISK_ADMIN_ROLE)
    {
        require(newCapUsdWad > vault.tvlCapUsdWad(), "not an increase");
        _validateCapacityWitness(newCapUsdWad, witness);
        bytes32 witnessHash = keccak256(abi.encode(witness));
        uint64 executableAt = uint64(block.timestamp + riskIncreaseDelay);
        pendingTvlCap = PendingTvlCap(newCapUsdWad, executableAt, witnessHash);
        emit TvlCapIncreaseScheduled(newCapUsdWad, executableAt, witnessHash);
    }

    function executeTvlCapIncrease(address[] calldata witness) external {
        PendingTvlCap memory pending = pendingTvlCap;
        require(pending.executableAt != 0 && block.timestamp >= pending.executableAt, "not ready");
        require(keccak256(abi.encode(witness)) == pending.witnessHash, "witness changed");
        _validateCapacityWitness(pending.capUsdWad, witness);
        uint256 previous = vault.tvlCapUsdWad();
        require(pending.capUsdWad > previous, "no longer an increase");
        delete pendingTvlCap;
        vault.setTvlCapUsdWad(pending.capUsdWad);
        emit TvlCapIncreaseExecuted(previous, pending.capUsdWad);
    }

    function cancelTvlCapIncrease() external onlyRole(RISK_ADMIN_ROLE) {
        delete pendingTvlCap;
        emit TvlCapIncreaseCancelled();
    }

    function reduceAssetPolicy(address token, bool approved, uint128 creatorCapUsdWad)
        external
        onlyRole(RISK_ADMIN_ROLE)
    {
        require(approved || creatorCapUsdWad == 0, "disabled cap must be zero");
        (IRiskControlledRegistry.AssetRiskPolicyV1 memory current,) = registry.riskPolicy(token);
        require(
            !approved || (current.approved && creatorCapUsdWad < current.creatorCapUsdWad),
            "not risk reducing"
        );
        registry.applyRiskPolicy(token, approved, creatorCapUsdWad);
        delete pendingAssetPolicies[token];
        emit AssetPolicyReduced(token, approved, creatorCapUsdWad);
        if (!approved) emit AssetEmergencyDeactivated(token);
    }

    function scheduleAssetPolicy(address token, bool approved, uint128 creatorCapUsdWad)
        external
        onlyRole(RISK_ADMIN_ROLE)
    {
        require(approved && creatorCapUsdWad != 0, "invalid increase");
        require(registry.hasCanonicalIdentity(token), "asset identity not registered");
        require(registry.hasCurrentDexEvidenceV3(token), "asset DEX evidence invalid");
        require(
            creatorCapUsdWad <= registry.capacityExposureUsdWad(token), "cap above DEX capacity"
        );
        (IRiskControlledRegistry.AssetRiskPolicyV1 memory current,) = registry.riskPolicy(token);
        require(!current.approved || creatorCapUsdWad > current.creatorCapUsdWad, "not an increase");
        uint64 executableAt = uint64(block.timestamp + riskIncreaseDelay);
        pendingAssetPolicies[token] = PendingAssetPolicy(creatorCapUsdWad, executableAt, approved);
        emit AssetPolicyScheduled(token, approved, creatorCapUsdWad, executableAt);
    }

    function executeAssetPolicy(address token) external {
        PendingAssetPolicy memory pending = pendingAssetPolicies[token];
        require(pending.executableAt != 0 && block.timestamp >= pending.executableAt, "not ready");
        require(registry.isEligibleV3(token), "asset not qualified");
        require(
            pending.creatorCapUsdWad <= registry.capacityExposureUsdWad(token),
            "cap above DEX capacity"
        );
        delete pendingAssetPolicies[token];
        registry.applyRiskPolicy(token, pending.approved, pending.creatorCapUsdWad);
        emit AssetPolicyExecuted(token, pending.approved, pending.creatorCapUsdWad);
    }

    function cancelAssetPolicy(address token) external onlyRole(RISK_ADMIN_ROLE) {
        delete pendingAssetPolicies[token];
        emit AssetPolicyCancelled(token);
    }

    function proposeRiskAuthority(address newAuthority) external onlyRole(RISK_ADMIN_ROLE) {
        require(newAuthority != address(0) && newAuthority != riskAuthority, "invalid authority");
        pendingRiskAuthority = newAuthority;
        emit RiskAuthorityTransferStarted(riskAuthority, newAuthority);
    }

    function acceptRiskAuthority() external {
        require(msg.sender == pendingRiskAuthority, "not pending authority");
        address previous = riskAuthority;
        pendingRiskAuthority = address(0);
        riskAuthority = msg.sender;
        _grantRole(RISK_ADMIN_ROLE, msg.sender);
        _revokeRole(RISK_ADMIN_ROLE, previous);
        emit RiskAuthorityTransferred(previous, msg.sender);
    }

    function grantRole(bytes32 role, address account) public override {
        require(role != RISK_ADMIN_ROLE, "use two-step transfer");
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override {
        require(role != RISK_ADMIN_ROLE, "use two-step transfer");
        super.revokeRole(role, account);
    }

    function renounceRole(bytes32 role, address callerConfirmation) public override {
        require(role != RISK_ADMIN_ROLE, "use two-step transfer");
        super.renounceRole(role, callerConfirmation);
    }

    function validateCapacityWitness(uint128 capUsdWad, address[] calldata witness)
        external
        view
        returns (bool)
    {
        _validateCapacityWitness(capUsdWad, witness);
        return true;
    }

    function _validateCapacityWitness(uint128 capUsdWad, address[] calldata witness) private view {
        require(
            witness.length >= MIN_RISK_ASSETS && witness.length <= MAX_WITNESS_ASSETS,
            "invalid witness count"
        );
        uint256 standardCapacity;
        uint256 highVolatilityCapacity;
        for (uint256 i; i < witness.length; ++i) {
            address token = witness[i];
            require(registry.isEligibleV3(token), "asset not qualified");
            for (uint256 j; j < i; ++j) {
                require(witness[j] != token, "duplicate asset");
            }
            (IRiskControlledRegistry.AssetRiskPolicyV1 memory policy, uint128 effectiveCap) =
                registry.riskPolicy(token);
            require(policy.approved && effectiveCap != 0, "asset not approved");
            uint256 weightCap = (uint256(capUsdWad) * registry.maximumWeightBps(token)) / BPS;
            uint256 protocolCap = (uint256(capUsdWad) * MAX_ASSET_WEIGHT_BPS) / BPS;
            uint256 contribution = effectiveCap;
            if (contribution > weightCap) contribution = weightCap;
            if (contribution > protocolCap) contribution = protocolCap;
            if (registry.isHighVolatility(token)) highVolatilityCapacity += contribution;
            else standardCapacity += contribution;
        }
        uint256 highVolatilityLimit = (uint256(capUsdWad) * MAX_HIGH_VOLATILITY_BPS) / BPS;
        if (highVolatilityCapacity > highVolatilityLimit) {
            highVolatilityCapacity = highVolatilityLimit;
        }
        uint256 requiredRiskCapacity = (uint256(capUsdWad) * (BPS - MIN_RESERVE_BPS)) / BPS;
        require(
            standardCapacity + highVolatilityCapacity >= requiredRiskCapacity,
            "insufficient risk capacity"
        );
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) { }
}
