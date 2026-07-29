// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

interface ITestPriceOracle {
    function setPrice(address token, uint256 priceWad) external;
    function setPriceStatus(address token, uint256 priceWad, uint256 updatedAt, bool valid) external;
    function setAutomaticFreshness(bool enabled) external;
}

interface ITestPriceRouter {
    function setPrice(address token, uint256 priceWad) external;
}

/// @notice Testnet-only signed publisher that updates valuation and RFQ prices atomically.
contract TestnetPricePublisher is Ownable {
    ITestPriceOracle public immutable oracle;
    ITestPriceRouter public immutable router;

    event PriceBatchPublished(bytes32 indexed evidenceHash, uint256 assetCount);

    constructor(address owner_, address oracle_, address router_) Ownable(owner_) {
        require(oracle_ != address(0) && router_ != address(0), "zero venue");
        oracle = ITestPriceOracle(oracle_);
        router = ITestPriceRouter(router_);
    }

    function publish(address[] calldata tokens, uint256[] calldata prices, bytes32 evidenceHash)
        external
        onlyOwner
    {
        require(tokens.length > 0 && tokens.length == prices.length, "batch length");
        for (uint256 i; i < tokens.length; ++i) {
            oracle.setPrice(tokens[i], prices[i]);
            router.setPrice(tokens[i], prices[i]);
        }
        emit PriceBatchPublished(evidenceHash, tokens.length);
    }

    function setOracleStatus(address token, uint256 price, uint256 updatedAt, bool valid)
        external
        onlyOwner
    {
        oracle.setPriceStatus(token, price, updatedAt, valid);
    }

    function setAutomaticFreshness(bool enabled) external onlyOwner {
        oracle.setAutomaticFreshness(enabled);
    }
}
