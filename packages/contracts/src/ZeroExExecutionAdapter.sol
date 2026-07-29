// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    UUPSUpgradeable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {
    EIP712Upgradeable
} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

interface IExecutionValuation {
    function quoteStatus(address token)
        external
        view
        returns (uint256 priceWad, uint256 updatedAt, bool valid);
}

/// @notice Validates an authorizer-bound 0x execution before making an allowlisted call.
/// @dev The authorizer must validate the upstream 0x response, including recipient and calldata.
contract ZeroExExecutionAdapter is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant VENUE_ADMIN_ROLE = keccak256("VENUE_ADMIN_ROLE");
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");
    uint256 public constant BPS = 10_000;
    address private constant ARBSYS = address(100);
    uint256 private constant ROBINHOOD_MAINNET_CHAIN_ID = 4_663;
    uint256 private constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    bytes32 public constant EXECUTION_INTENT_TYPEHASH = keccak256(
        "ExecutionIntent(address vault,address tokenIn,address tokenOut,uint256 amountIn,uint256 minimumAmountOut,address recipient,address target,address allowanceTarget,bytes32 callDataHash,uint256 expiry,uint256 referenceBlock,uint256 nonce)"
    );

    struct ExecutionIntent {
        address vault;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minimumAmountOut;
        address recipient;
        address target;
        address allowanceTarget;
        bytes32 callDataHash;
        uint256 expiry;
        uint256 referenceBlock;
        uint256 nonce;
    }

    IExecutionValuation public valuation;
    address public quoteAuthorizer;
    uint16 public maximumOracleDeviationBps;
    uint32 public maximumBlockDelay;
    mapping(address target => bool allowed) public allowedTarget;
    mapping(address target => bool allowed) public allowedAllowanceTarget;
    mapping(bytes4 selector => bool allowed) public allowedSelector;
    mapping(address token => bool allowed) public allowedToken;
    mapping(bytes32 digest => bool used) public usedIntent;
    uint256[42] private __gap;

    event VenueConfigured(address indexed target, address indexed allowanceTarget, bool allowed);
    event SelectorConfigured(bytes4 indexed selector, bool allowed);
    event TokenConfigured(address indexed token, bool allowed);
    event QuoteAuthorizerChanged(address indexed authorizer);
    event ExecutionLimitsChanged(uint16 maximumDeviationBps, uint32 maximumBlockDelay);
    event SwapExecuted(
        bytes32 indexed digest,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    function initialize(
        address admin,
        address valuation_,
        address authorizer,
        uint16 maximumDeviationBps,
        uint32 blockDelay
    ) external initializer {
        require(admin != address(0) && valuation_ != address(0) && authorizer != address(0), "zero");
        require(maximumDeviationBps <= 100 && blockDelay > 0, "unsafe limits");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __EIP712_init("MillionDollarBrain Execution", "1");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VENUE_ADMIN_ROLE, admin);
        valuation = IExecutionValuation(valuation_);
        quoteAuthorizer = authorizer;
        maximumOracleDeviationBps = maximumDeviationBps;
        maximumBlockDelay = blockDelay;
    }

    function configureVenue(address target, address allowanceTarget, bool allowed)
        external
        onlyRole(VENUE_ADMIN_ROLE)
    {
        require(target != address(0) && allowanceTarget != address(0), "zero venue");
        allowedTarget[target] = allowed;
        allowedAllowanceTarget[allowanceTarget] = allowed;
        emit VenueConfigured(target, allowanceTarget, allowed);
    }

    function configureSelector(bytes4 selector, bool allowed) external onlyRole(VENUE_ADMIN_ROLE) {
        require(selector != bytes4(0), "zero selector");
        allowedSelector[selector] = allowed;
        emit SelectorConfigured(selector, allowed);
    }

    function configureToken(address token, bool allowed) external onlyRole(VENUE_ADMIN_ROLE) {
        require(token != address(0), "zero token");
        allowedToken[token] = allowed;
        emit TokenConfigured(token, allowed);
    }

    function setQuoteAuthorizer(address authorizer) external onlyRole(VENUE_ADMIN_ROLE) {
        require(authorizer != address(0), "zero authorizer");
        quoteAuthorizer = authorizer;
        emit QuoteAuthorizerChanged(authorizer);
    }

    function setExecutionLimits(uint16 maximumDeviationBps, uint32 blockDelay)
        external
        onlyRole(VENUE_ADMIN_ROLE)
    {
        require(maximumDeviationBps <= 100, "unsafe deviation");
        require(blockDelay > 0 && blockDelay <= 7_200, "unsafe block delay");
        maximumOracleDeviationBps = maximumDeviationBps;
        maximumBlockDelay = blockDelay;
        emit ExecutionLimitsChanged(maximumDeviationBps, blockDelay);
    }

    function currentReferenceBlock() public view returns (uint256) {
        if (
            block.chainid == ROBINHOOD_MAINNET_CHAIN_ID
                || block.chainid == ROBINHOOD_TESTNET_CHAIN_ID
        ) {
            (bool ok, bytes memory result) =
                ARBSYS.staticcall(abi.encodeWithSignature("arbBlockNumber()"));
            require(ok && result.length >= 32, "ArbSys unavailable");
            return abi.decode(result, (uint256));
        }
        return block.number;
    }

    function intentDigest(ExecutionIntent calldata intent) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EXECUTION_INTENT_TYPEHASH,
                    intent.vault,
                    intent.tokenIn,
                    intent.tokenOut,
                    intent.amountIn,
                    intent.minimumAmountOut,
                    intent.recipient,
                    intent.target,
                    intent.allowanceTarget,
                    intent.callDataHash,
                    intent.expiry,
                    intent.referenceBlock,
                    intent.nonce
                )
            )
        );
    }

    function execute(
        ExecutionIntent calldata intent,
        bytes calldata executionData,
        bytes calldata authorizerSignature
    ) external onlyRole(VAULT_ROLE) nonReentrant returns (uint256 amountOut) {
        require(intent.vault == msg.sender && intent.recipient == msg.sender, "wrong vault");
        require(intent.tokenIn != intent.tokenOut && intent.amountIn > 0, "invalid pair");
        require(allowedToken[intent.tokenIn] && allowedToken[intent.tokenOut], "token not allowed");
        require(allowedTarget[intent.target], "target not allowed");
        require(allowedAllowanceTarget[intent.allowanceTarget], "spender not allowed");
        require(executionData.length >= 4, "missing selector");
        require(allowedSelector[bytes4(executionData[0:4])], "selector not allowed");
        require(keccak256(executionData) == intent.callDataHash, "calldata changed");
        require(block.timestamp <= intent.expiry, "quote expired");
        uint256 referenceBlock = currentReferenceBlock();
        uint256 blockDistance = referenceBlock >= intent.referenceBlock
            ? referenceBlock - intent.referenceBlock
            : intent.referenceBlock - referenceBlock;
        require(blockDistance <= maximumBlockDelay, "block reference expired");

        bytes32 digest = intentDigest(intent);
        require(!usedIntent[digest], "intent already used");
        require(
            SignatureChecker.isValidSignatureNow(quoteAuthorizer, digest, authorizerSignature),
            "invalid authorizer"
        );
        usedIntent[digest] = true;

        IERC20 tokenIn = IERC20(intent.tokenIn);
        IERC20 tokenOut = IERC20(intent.tokenOut);
        uint256 inputBefore = tokenIn.balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), intent.amountIn);
        require(tokenIn.balanceOf(address(this)) - inputBefore == intent.amountIn, "transfer fee");

        uint256 outputBefore = tokenOut.balanceOf(address(this));
        tokenIn.forceApprove(intent.allowanceTarget, intent.amountIn);
        (bool success, bytes memory result) = intent.target.call(executionData);
        tokenIn.forceApprove(intent.allowanceTarget, 0);
        if (!success) {
            assembly ("memory-safe") {
                revert(add(result, 32), mload(result))
            }
        }
        amountOut = tokenOut.balanceOf(address(this)) - outputBefore;
        require(amountOut >= intent.minimumAmountOut, "output below minimum");
        require(
            _withinOracleDeviation(intent.tokenIn, intent.amountIn, intent.tokenOut, amountOut),
            "oracle deviation"
        );
        tokenOut.safeTransfer(msg.sender, amountOut);
        emit SwapExecuted(digest, intent.tokenIn, intent.tokenOut, intent.amountIn, amountOut);
    }

    function _withinOracleDeviation(
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut
    ) private view returns (bool) {
        (uint256 priceIn,, bool validIn) = valuation.quoteStatus(tokenIn);
        (uint256 priceOut,, bool validOut) = valuation.quoteStatus(tokenOut);
        if (!validIn || !validOut || priceIn == 0 || priceOut == 0) return false;
        uint8 decimalsIn = IERC20Metadata(tokenIn).decimals();
        uint8 decimalsOut = IERC20Metadata(tokenOut).decimals();
        if (decimalsIn > 36 || decimalsOut > 36) return false;
        uint256 valueIn = (amountIn * priceIn) / (10 ** decimalsIn);
        uint256 valueOut = (amountOut * priceOut) / (10 ** decimalsOut);
        return valueOut * BPS >= valueIn * (BPS - maximumOracleDeviationBps);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) { }
}
