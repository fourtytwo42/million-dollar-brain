// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    UUPSUpgradeable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

interface IRobinhoodOraclePause {
    function oraclePaused() external view returns (bool);
}

/// @notice Chainlink valuation adapter with per-asset heartbeat and Robinhood pause checks.
contract ChainlinkValuationAdapter is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    bytes32 public constant ORACLE_ADMIN_ROLE = keccak256("ORACLE_ADMIN_ROLE");

    struct FeedConfig {
        address feed;
        uint32 heartbeat;
        bool checkTokenOraclePause;
        bool enabled;
    }

    mapping(address token => FeedConfig config) public feedConfig;
    IAggregatorV3 public sequencerUptimeFeed;
    uint32 public sequencerGracePeriod;
    uint256[47] private __gap;

    event FeedConfigured(address indexed token, address indexed feed, uint32 heartbeat);
    event SequencerConfigured(address indexed feed, uint32 gracePeriod);

    function initialize(address admin, address sequencerFeed, uint32 gracePeriod)
        external
        initializer
    {
        require(admin != address(0), "zero admin");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ADMIN_ROLE, admin);
        sequencerUptimeFeed = IAggregatorV3(sequencerFeed);
        sequencerGracePeriod = gracePeriod;
    }

    function configureFeed(
        address token,
        address feed,
        uint32 heartbeat,
        bool checkTokenOraclePause,
        bool enabled
    ) external onlyRole(ORACLE_ADMIN_ROLE) {
        require(token != address(0) && feed != address(0), "zero address");
        require(heartbeat > 0, "zero heartbeat");
        feedConfig[token] = FeedConfig(feed, heartbeat, checkTokenOraclePause, enabled);
        emit FeedConfigured(token, feed, heartbeat);
    }

    function configureSequencer(address feed, uint32 gracePeriod)
        external
        onlyRole(ORACLE_ADMIN_ROLE)
    {
        sequencerUptimeFeed = IAggregatorV3(feed);
        sequencerGracePeriod = gracePeriod;
        emit SequencerConfigured(feed, gracePeriod);
    }

    function quoteStatus(address token)
        external
        view
        returns (uint256 priceWad, uint256 updatedAt, bool valid)
    {
        FeedConfig memory config = feedConfig[token];
        if (!config.enabled || config.feed == address(0)) return (0, 0, false);
        if (!_sequencerReady()) return (0, 0, false);
        if (config.checkTokenOraclePause) {
            try IRobinhoodOraclePause(token).oraclePaused() returns (bool paused) {
                if (paused) return (0, 0, false);
            } catch {
                return (0, 0, false);
            }
        }
        try IAggregatorV3(config.feed).latestRoundData() returns (
            uint80 roundId, int256 answer, uint256, uint256 observedAt, uint80 answeredInRound
        ) {
            if (
                answer <= 0 || observedAt == 0 || observedAt > block.timestamp
                    || answeredInRound < roundId || block.timestamp - observedAt > config.heartbeat
            ) return (0, observedAt, false);
            uint8 decimals = IAggregatorV3(config.feed).decimals();
            if (decimals > 36) return (0, observedAt, false);
            priceWad = decimals == 18
                ? uint256(answer)
                : decimals < 18
                    ? uint256(answer) * (10 ** (18 - decimals))
                    : uint256(answer) / (10 ** (decimals - 18));
            return (priceWad, observedAt, priceWad > 0);
        } catch {
            return (0, 0, false);
        }
    }

    function _sequencerReady() private view returns (bool) {
        if (address(sequencerUptimeFeed) == address(0)) return true;
        try sequencerUptimeFeed.latestRoundData() returns (
            uint80, int256 answer, uint256 startedAt, uint256, uint80
        ) {
            return answer == 0 && startedAt <= block.timestamp
                && block.timestamp - startedAt > sequencerGracePeriod;
        } catch {
            return false;
        }
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) { }
}
