// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    UUPSUpgradeable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/// @notice Governance-controlled identity and risk registry for assets the allocator may hold.
/// @dev Symbols are presentation metadata only. Chain ID, token address and optional Robinhood UID
///      form the executable identity.
contract AssetRegistry is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    bytes32 public constant ASSET_ADMIN_ROLE = keccak256("ASSET_ADMIN_ROLE");
    bytes32 public constant QUALIFIER_ROLE = keccak256("QUALIFIER_ROLE");
    uint256 public constant BPS = 10_000;
    uint256 public constant MINIMUM_MARKET_CAP_USD = 100_000_000e18;
    uint256 public constant MINIMUM_EXECUTABLE_DEPTH_USD = 250_000e18;
    uint32 public constant MINIMUM_QUALIFICATION_HOURS = 48;
    uint8 public constant MINIMUM_REGULAR_MARKET_SESSIONS = 2;

    enum AssetKind {
        RESERVE,
        STOCK,
        ETF,
        CRYPTO,
        TOKEN
    }

    enum RiskClass {
        RESERVE,
        STANDARD,
        HIGH_VOLATILITY
    }

    struct AssetRecord {
        address token;
        bytes32 robinhoodUid;
        AssetKind kind;
        RiskClass riskClass;
        address valuationAdapter;
        address executionAdapter;
        address circulatingSupplyAdapter;
        uint16 maximumWeightBps;
        bool registered;
        bool active;
    }

    struct AssetQualification {
        bytes32 evidenceHash;
        uint64 observedAt;
        uint64 validUntil;
        uint32 consecutiveHours;
        uint8 regularMarketSessions;
        uint128 marketCapOrAumUsdWad;
        uint128 executableDepthUsdWad;
        bool identityValid;
        bool oracleValid;
        bool liquidityValid;
        bool transferBehaviorValid;
        bool corporateActionClear;
    }

    /// @notice DEX-native qualification evidence. Off-chain capitalization and oracle feeds are
    /// deliberately excluded: identity, price formation, liquidity and capacity must be proven
    /// from canonical contracts and approved on-chain pools.
    struct AssetQualificationV3 {
        bytes32 evidenceHash;
        uint64 observedAt;
        uint64 validUntil;
        uint32 consecutiveHours;
        uint8 regularMarketSessions;
        uint128 safeTwoSidedCapacityUsdWad;
        bool identityValid;
        bool routeMature;
        bool shortTwapValid;
        bool longTwapValid;
        bool timeWeightedLiquidityValid;
        bool liquidityValid;
        bool transferBehaviorValid;
        bool tokenStateClear;
    }

    uint256 public registryChainId;
    address[] private _tokens;
    mapping(address token => AssetRecord record) private _records;
    mapping(bytes32 uid => address token) public tokenByRobinhoodUid;
    mapping(address token => AssetQualification qualification) private _qualifications;
    // Appended V2 storage for stable control-catalog identities and sector tags.
    mapping(address token => uint32 id) private _assetIds;
    mapping(uint32 id => address token) private _tokensByAssetId;
    mapping(uint32 id => mapping(bytes32 tag => bool enabled)) private _assetTags;
    uint16 public assetIdentityVersion;
    // Appended V3 storage. The legacy qualification mapping remains intact for rollback/audit.
    mapping(address token => AssetQualificationV3 qualification) private _qualificationsV3;
    mapping(address token => uint128 maximumExposure) private _maximumExposureUsdWad;
    uint16 public qualificationSchemaVersion;
    bool public qualificationV3Enabled;
    uint256[38] private __gap;

    event AssetRegistered(address indexed token, bytes32 indexed robinhoodUid, AssetKind kind);
    event AssetConfigurationUpdated(address indexed token);
    event QualificationRecorded(
        address indexed token,
        bytes32 indexed evidenceHash,
        uint32 consecutiveHours,
        uint8 regularMarketSessions,
        bool eligible
    );
    event AssetActivationChanged(address indexed token, bool active);
    event AssetIdentityConfigured(address indexed token, uint32 indexed assetId);
    event AssetTagConfigured(uint32 indexed assetId, bytes32 indexed tag, bool enabled);
    event QualificationV3Recorded(
        address indexed token,
        bytes32 indexed evidenceHash,
        uint128 safeTwoSidedCapacityUsdWad,
        uint128 maximumExposureUsdWad,
        bool eligible
    );
    event QualificationV3Enabled(bool enabled);

    function initialize(address admin, uint256 chainId_) external initializer {
        require(admin != address(0), "zero admin");
        require(chainId_ != 0, "zero chain");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ASSET_ADMIN_ROLE, admin);
        _grantRole(QUALIFIER_ROLE, admin);
        registryChainId = chainId_;
    }

    function registerAsset(AssetRecord calldata record) external onlyRole(ASSET_ADMIN_ROLE) {
        require(record.token != address(0), "zero token");
        require(record.maximumWeightBps <= 2_000, "weight above protocol maximum");
        require(!_records[record.token].registered, "already registered");
        if (record.robinhoodUid != bytes32(0)) {
            require(
                tokenByRobinhoodUid[record.robinhoodUid] == address(0), "uid already registered"
            );
            tokenByRobinhoodUid[record.robinhoodUid] = record.token;
        }
        AssetRecord memory stored = record;
        stored.registered = true;
        stored.active = false;
        _records[record.token] = stored;
        _tokens.push(record.token);
        emit AssetRegistered(record.token, record.robinhoodUid, record.kind);
    }

    function updateAssetConfiguration(
        address token,
        address valuationAdapter,
        address executionAdapter,
        address circulatingSupplyAdapter,
        RiskClass riskClass,
        uint16 maximumWeight
    ) external onlyRole(ASSET_ADMIN_ROLE) {
        AssetRecord storage record = _records[token];
        require(record.registered, "unknown asset");
        require(maximumWeight <= 2_000, "weight above protocol maximum");
        record.valuationAdapter = valuationAdapter;
        record.executionAdapter = executionAdapter;
        record.circulatingSupplyAdapter = circulatingSupplyAdapter;
        record.riskClass = riskClass;
        record.maximumWeightBps = maximumWeight;
        emit AssetConfigurationUpdated(token);
    }

    function recordQualification(address token, AssetQualification calldata qualification)
        external
        onlyRole(QUALIFIER_ROLE)
    {
        AssetRecord storage record = _records[token];
        require(record.registered, "unknown asset");
        require(qualification.observedAt <= block.timestamp, "future observation");
        require(qualification.validUntil > block.timestamp, "expired evidence");
        _qualifications[token] = qualification;
        if (record.active && !_eligible(record, qualification)) {
            record.active = false;
            emit AssetActivationChanged(token, false);
        }
        emit QualificationRecorded(
            token,
            qualification.evidenceHash,
            qualification.consecutiveHours,
            qualification.regularMarketSessions,
            _eligible(record, qualification)
        );
    }

    function reinitializeV3() external reinitializer(3) onlyRole(DEFAULT_ADMIN_ROLE) {
        qualificationSchemaVersion = 3;
    }

    function recordQualificationV3(address token, AssetQualificationV3 calldata qualification)
        external
        onlyRole(QUALIFIER_ROLE)
    {
        AssetRecord storage record = _records[token];
        require(record.registered, "unknown asset");
        require(qualification.observedAt <= block.timestamp, "future observation");
        require(qualification.validUntil > block.timestamp, "expired evidence");
        _qualificationsV3[token] = qualification;
        uint128 maximumExposure = record.kind == AssetKind.RESERVE
            ? type(uint128).max
            : qualification.safeTwoSidedCapacityUsdWad / 2;
        _maximumExposureUsdWad[token] = maximumExposure;
        if (qualificationV3Enabled && record.active && !_eligibleV3(record, qualification)) {
            record.active = false;
            emit AssetActivationChanged(token, false);
        }
        emit QualificationV3Recorded(
            token,
            qualification.evidenceHash,
            qualification.safeTwoSidedCapacityUsdWad,
            maximumExposure,
            _eligibleV3(record, qualification)
        );
    }

    function setQualificationV3Enabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!enabled || qualificationSchemaVersion == 3, "v3 not initialized");
        qualificationV3Enabled = enabled;
        emit QualificationV3Enabled(enabled);
    }

    function setActive(address token, bool active) external onlyRole(ASSET_ADMIN_ROLE) {
        AssetRecord storage record = _records[token];
        require(record.registered, "unknown asset");
        if (active) require(_eligibleCurrent(record, token), "asset not qualified");
        record.active = active;
        emit AssetActivationChanged(token, active);
    }

    function asset(address token)
        external
        view
        returns (AssetRecord memory record, AssetQualification memory qualification)
    {
        return (_records[token], _qualifications[token]);
    }

    function isActive(address token) external view returns (bool) {
        AssetRecord storage record = _records[token];
        return record.active && _eligibleCurrent(record, token);
    }

    function isHighVolatility(address token) external view returns (bool) {
        return _records[token].riskClass == RiskClass.HIGH_VOLATILITY;
    }

    function maximumWeightBps(address token) external view returns (uint16) {
        return _records[token].maximumWeightBps;
    }

    function tokens() external view returns (address[] memory) {
        return _tokens;
    }

    function activeTokens() external view returns (address[] memory active) {
        uint256 count;
        for (uint256 i; i < _tokens.length; ++i) {
            AssetRecord storage record = _records[_tokens[i]];
            if (record.active && _eligibleCurrent(record, _tokens[i])) count++;
        }
        active = new address[](count);
        uint256 cursor;
        for (uint256 i; i < _tokens.length; ++i) {
            AssetRecord storage record = _records[_tokens[i]];
            if (record.active && _eligibleCurrent(record, _tokens[i])) {
                active[cursor++] = _tokens[i];
            }
        }
    }

    function configureAssetIdentity(address token, uint32 id, bytes32[] calldata tags)
        external
        onlyRole(ASSET_ADMIN_ROLE)
    {
        require(_records[token].registered, "unknown asset");
        require(id != 0, "zero asset id");
        require(_assetIds[token] == 0 || _assetIds[token] == id, "token id changed");
        require(_tokensByAssetId[id] == address(0) || _tokensByAssetId[id] == token, "id used");
        _assetIds[token] = id;
        _tokensByAssetId[id] = token;
        for (uint256 i; i < tags.length; ++i) {
            require(tags[i] != bytes32(0), "zero tag");
            _assetTags[id][tags[i]] = true;
            emit AssetTagConfigured(id, tags[i], true);
        }
        assetIdentityVersion = 1;
        emit AssetIdentityConfigured(token, id);
    }

    function setAssetTag(uint32 id, bytes32 tag, bool enabled) external onlyRole(ASSET_ADMIN_ROLE) {
        require(_tokensByAssetId[id] != address(0), "unknown asset id");
        require(tag != bytes32(0), "zero tag");
        _assetTags[id][tag] = enabled;
        emit AssetTagConfigured(id, tag, enabled);
    }

    function assetId(address token) external view returns (uint32) {
        return _assetIds[token];
    }

    function tokenForAssetId(uint32 id) external view returns (address) {
        return _tokensByAssetId[id];
    }

    function hasTag(uint32 id, bytes32 tag) external view returns (bool) {
        return _assetTags[id][tag];
    }

    function isActiveId(uint32 id) external view returns (bool) {
        address token = _tokensByAssetId[id];
        if (token == address(0)) return false;
        AssetRecord storage record = _records[token];
        return record.active && _eligibleCurrent(record, token);
    }

    function qualificationV3(address token)
        external
        view
        returns (AssetQualificationV3 memory qualification, uint128 maximumExposureUsdWad_)
    {
        return (_qualificationsV3[token], _maximumExposureUsdWad[token]);
    }

    function maximumExposureUsdWad(address token) external view returns (uint128) {
        return _maximumExposureUsdWad[token];
    }

    function isEligibleV3(address token) external view returns (bool) {
        return _eligibleV3(_records[token], _qualificationsV3[token]);
    }

    function _eligibleCurrent(AssetRecord memory record, address token)
        private
        view
        returns (bool)
    {
        return qualificationV3Enabled
            ? _eligibleV3(record, _qualificationsV3[token])
            : _eligible(record, _qualifications[token]);
    }

    function _eligibleV3(AssetRecord memory record, AssetQualificationV3 memory qualification)
        private
        view
        returns (bool)
    {
        if (!record.registered || qualification.validUntil <= block.timestamp) return false;
        if (qualification.consecutiveHours < MINIMUM_QUALIFICATION_HOURS) return false;
        if (
            (record.kind == AssetKind.STOCK || record.kind == AssetKind.ETF)
                && qualification.regularMarketSessions < MINIMUM_REGULAR_MARKET_SESSIONS
        ) return false;
        if (
            !qualification.identityValid || !qualification.transferBehaviorValid
                || !qualification.tokenStateClear
        ) return false;
        if (record.kind == AssetKind.RESERVE) return true;
        if (
            qualification.safeTwoSidedCapacityUsdWad == 0 || !qualification.routeMature
                || !qualification.shortTwapValid || !qualification.longTwapValid
                || !qualification.timeWeightedLiquidityValid || !qualification.liquidityValid
        ) return false;
        return record.valuationAdapter != address(0) && record.executionAdapter != address(0);
    }

    function _eligible(AssetRecord memory record, AssetQualification memory qualification)
        private
        view
        returns (bool)
    {
        if (!record.registered || qualification.validUntil <= block.timestamp) return false;
        if (
            qualification.consecutiveHours < MINIMUM_QUALIFICATION_HOURS
                || qualification.marketCapOrAumUsdWad < MINIMUM_MARKET_CAP_USD
                || qualification.executableDepthUsdWad < MINIMUM_EXECUTABLE_DEPTH_USD
        ) return false;
        if (
            (record.kind == AssetKind.STOCK || record.kind == AssetKind.ETF)
                && qualification.regularMarketSessions < MINIMUM_REGULAR_MARKET_SESSIONS
        ) return false;
        if (
            !qualification.identityValid || !qualification.oracleValid
                || !qualification.liquidityValid || !qualification.transferBehaviorValid
                || !qualification.corporateActionClear
        ) return false;
        if (record.kind != AssetKind.RESERVE) {
            if (record.valuationAdapter == address(0) || record.executionAdapter == address(0)) {
                return false;
            }
            if (
                (record.kind == AssetKind.CRYPTO || record.kind == AssetKind.TOKEN)
                    && record.circulatingSupplyAdapter == address(0)
            ) return false;
        }
        return true;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) { }
}
