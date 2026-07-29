// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

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

    uint256 public registryChainId;
    address[] private _tokens;
    mapping(address token => AssetRecord record) private _records;
    mapping(bytes32 uid => address token) public tokenByRobinhoodUid;
    mapping(address token => AssetQualification qualification) private _qualifications;
    uint256[45] private __gap;

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
            require(tokenByRobinhoodUid[record.robinhoodUid] == address(0), "uid already registered");
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

    function setActive(address token, bool active) external onlyRole(ASSET_ADMIN_ROLE) {
        AssetRecord storage record = _records[token];
        require(record.registered, "unknown asset");
        if (active) require(_eligible(record, _qualifications[token]), "asset not qualified");
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
        return record.active && _eligible(record, _qualifications[token]);
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
            if (record.active && _eligible(record, _qualifications[_tokens[i]])) count++;
        }
        active = new address[](count);
        uint256 cursor;
        for (uint256 i; i < _tokens.length; ++i) {
            AssetRecord storage record = _records[_tokens[i]];
            if (record.active && _eligible(record, _qualifications[_tokens[i]])) {
                active[cursor++] = _tokens[i];
            }
        }
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

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
