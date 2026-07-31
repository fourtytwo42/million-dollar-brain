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
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUniswapV3FactoryExecution {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
    function exactInput(ExactInputParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

interface IDexMark {
    function quoteAmount(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 amountOut, bool valid);
}

interface ICircuitBreakerPrice {
    function quoteStatus(address token)
        external
        view
        returns (uint256 priceWad, uint256 updatedAt, bool valid);
}

interface IArbSysBlockNumber {
    function arbBlockNumber() external view returns (uint256);
}

contract UniswapExecutionAdapter is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    error InvalidConfiguration();
    error UnauthorizedVault();
    error InvalidPlan();
    error UnsupportedRoute();
    error ExpiredPlan();
    error StaleReferenceBlock();
    error TransferTaxUnsupported();
    error InsufficientOutput();
    error TwapDeviation();
    error CircuitBreakerUnavailable();
    error CircuitBreakerDivergence();

    bytes32 public constant CONFIGURATOR_ROLE = keccak256("CONFIGURATOR_ROLE");
    uint256 public constant BPS = 10_000;
    uint16 public constant MAX_QUOTE_SLIPPAGE_BPS = 100;
    uint16 public constant MAX_TWAP_DEVIATION_BPS = 300;
    uint16 public constant MAX_CIRCUIT_BREAKER_DEVIATION_BPS = 500;
    uint32 public constant MAX_PLAN_LIFETIME = 30;
    // Robinhood L2 blocks are fast enough that an external-wallet signature can
    // legitimately land dozens of blocks after its pinned quote. The plan's
    // independent 30-second expiry remains the primary wall-clock bound.
    uint32 public constant MAX_REFERENCE_BLOCK_AGE = 128;

    struct DexRouteV1 {
        address tokenIn;
        address tokenOut;
        address intermediate;
        uint24 firstFee;
        uint24 secondFee;
    }

    struct DexSwapPlanV1 {
        DexRouteV1 route;
        uint256 amountIn;
        uint256 quotedAmountOut;
        uint256 minimumAmountOut;
        address recipient;
        uint64 issuedAt;
        uint64 deadline;
        uint64 referenceBlock;
    }

    address public vault;
    address public reserve;
    address public weth;
    IUniswapV3FactoryExecution public factory;
    ISwapRouter02 public router;
    IDexMark public dexMark;
    ICircuitBreakerPrice public circuitBreaker;
    uint32 public maximumCircuitBreakerAge;
    mapping(uint24 => bool) public approvedFeeTier;
    mapping(address => bool) public approvedIntermediate;
    mapping(address => bool) public approvedPool;
    // Appended DEX-only safety mode. Legacy circuit-breaker fields remain readable for UUPS
    // storage compatibility but have no authority while this flag is enabled.
    bool public dexOnlySafetyEnabled;

    event PoolApprovalUpdated(address indexed pool, bool approved);
    event FeeTierApprovalUpdated(uint24 indexed feeTier, bool approved);
    event DexOnlySafetyEnabled(bool enabled);
    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address firstPool,
        address secondPool,
        uint64 referenceBlock
    );

    function initialize(
        address admin,
        address vault_,
        address reserve_,
        address weth_,
        address factory_,
        address router_,
        address dexMark_,
        address circuitBreaker_,
        uint32 maximumCircuitBreakerAge_
    ) external initializer {
        if (
            admin == address(0) || vault_ == address(0) || reserve_ == address(0)
                || weth_ == address(0) || factory_ == address(0) || router_ == address(0)
                || dexMark_ == address(0) || circuitBreaker_ == address(0)
                || maximumCircuitBreakerAge_ == 0
        ) revert InvalidConfiguration();
        _initializeBase(admin, vault_, reserve_, weth_, factory_, router_, dexMark_);
        circuitBreaker = ICircuitBreakerPrice(circuitBreaker_);
        maximumCircuitBreakerAge = maximumCircuitBreakerAge_;
    }

    function initializeDexOnly(
        address admin,
        address vault_,
        address reserve_,
        address weth_,
        address factory_,
        address router_,
        address dexMark_
    ) external initializer {
        if (
            admin == address(0) || vault_ == address(0) || reserve_ == address(0)
                || weth_ == address(0) || factory_ == address(0) || router_ == address(0)
                || dexMark_ == address(0)
        ) revert InvalidConfiguration();
        _initializeBase(admin, vault_, reserve_, weth_, factory_, router_, dexMark_);
        dexOnlySafetyEnabled = true;
        emit DexOnlySafetyEnabled(true);
    }

    function reinitializeDexOnly() external reinitializer(2) onlyRole(DEFAULT_ADMIN_ROLE) {
        dexOnlySafetyEnabled = true;
        emit DexOnlySafetyEnabled(true);
    }

    function _initializeBase(
        address admin,
        address vault_,
        address reserve_,
        address weth_,
        address factory_,
        address router_,
        address dexMark_
    ) private {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CONFIGURATOR_ROLE, admin);
        vault = vault_;
        reserve = reserve_;
        weth = weth_;
        factory = IUniswapV3FactoryExecution(factory_);
        router = ISwapRouter02(router_);
        dexMark = IDexMark(dexMark_);
        approvedIntermediate[weth_] = true;
    }

    function setFeeTier(uint24 feeTier, bool approved) external onlyRole(CONFIGURATOR_ROLE) {
        approvedFeeTier[feeTier] = approved;
        emit FeeTierApprovalUpdated(feeTier, approved);
    }

    function setPool(address pool, bool approved) external onlyRole(CONFIGURATOR_ROLE) {
        if (pool == address(0)) revert InvalidConfiguration();
        approvedPool[pool] = approved;
        emit PoolApprovalUpdated(pool, approved);
    }

    function execute(DexSwapPlanV1 calldata plan, bool increasesExposure)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (msg.sender != vault) revert UnauthorizedVault();
        (address firstPool, address secondPool) = _validatePlan(plan);
        if (increasesExposure && !dexOnlySafetyEnabled) {
            _checkCircuitBreaker(plan.route.tokenOut);
        }

        IERC20 tokenIn = IERC20(plan.route.tokenIn);
        IERC20 tokenOut = IERC20(plan.route.tokenOut);
        uint256 inputBefore = tokenIn.balanceOf(address(this));
        uint256 outputBefore = tokenOut.balanceOf(address(this));
        tokenIn.safeTransferFrom(vault, address(this), plan.amountIn);
        if (tokenIn.balanceOf(address(this)) - inputBefore != plan.amountIn) {
            revert TransferTaxUnsupported();
        }
        tokenIn.forceApprove(address(router), plan.amountIn);
        if (plan.route.intermediate == address(0)) {
            router.exactInputSingle(
                ISwapRouter02.ExactInputSingleParams({
                    tokenIn: plan.route.tokenIn,
                    tokenOut: plan.route.tokenOut,
                    fee: plan.route.firstFee,
                    recipient: address(this),
                    amountIn: plan.amountIn,
                    amountOutMinimum: plan.minimumAmountOut,
                    sqrtPriceLimitX96: 0
                })
            );
        } else {
            router.exactInput(
                ISwapRouter02.ExactInputParams({
                    path: abi.encodePacked(
                        plan.route.tokenIn,
                        plan.route.firstFee,
                        plan.route.intermediate,
                        plan.route.secondFee,
                        plan.route.tokenOut
                    ),
                    recipient: address(this),
                    amountIn: plan.amountIn,
                    amountOutMinimum: plan.minimumAmountOut
                })
            );
        }
        tokenIn.forceApprove(address(router), 0);
        if (tokenIn.balanceOf(address(this)) != inputBefore) revert TransferTaxUnsupported();
        amountOut = tokenOut.balanceOf(address(this)) - outputBefore;
        if (amountOut < plan.minimumAmountOut) revert InsufficientOutput();
        _checkTwapDeviation(plan.route.tokenIn, plan.route.tokenOut, plan.amountIn, amountOut);
        uint256 vaultOutputBefore = tokenOut.balanceOf(vault);
        tokenOut.safeTransfer(vault, amountOut);
        if (
            tokenOut.balanceOf(address(this)) != outputBefore
                || tokenOut.balanceOf(vault) - vaultOutputBefore != amountOut
        ) {
            revert TransferTaxUnsupported();
        }
        emit SwapExecuted(
            plan.route.tokenIn,
            plan.route.tokenOut,
            plan.amountIn,
            amountOut,
            firstPool,
            secondPool,
            plan.referenceBlock
        );
    }

    function _validatePlan(DexSwapPlanV1 calldata plan)
        private
        view
        returns (address firstPool, address secondPool)
    {
        if (
            plan.recipient != vault || plan.amountIn == 0 || plan.quotedAmountOut == 0
                || plan.minimumAmountOut == 0 || plan.minimumAmountOut > plan.quotedAmountOut
                || plan.minimumAmountOut
                    < (plan.quotedAmountOut * (BPS - MAX_QUOTE_SLIPPAGE_BPS)) / BPS
        ) revert InvalidPlan();
        if (
            plan.issuedAt > block.timestamp || plan.deadline < block.timestamp
                || plan.deadline - plan.issuedAt > MAX_PLAN_LIFETIME
        ) revert ExpiredPlan();
        uint256 currentReferenceBlock = _currentReferenceBlock();
        if (
            plan.referenceBlock > currentReferenceBlock
                || currentReferenceBlock - plan.referenceBlock > MAX_REFERENCE_BLOCK_AGE
        ) {
            revert StaleReferenceBlock();
        }
        if (!((plan.route.tokenIn == reserve && plan.route.tokenOut != reserve)
                    || (plan.route.tokenOut == reserve && plan.route.tokenIn != reserve))) revert UnsupportedRoute();
        if (!approvedFeeTier[plan.route.firstFee]) revert UnsupportedRoute();
        address firstOut =
            plan.route.intermediate == address(0) ? plan.route.tokenOut : plan.route.intermediate;
        firstPool = factory.getPool(plan.route.tokenIn, firstOut, plan.route.firstFee);
        if (firstPool == address(0) || !approvedPool[firstPool]) revert UnsupportedRoute();
        if (plan.route.intermediate != address(0)) {
            if (
                plan.route.intermediate != weth || !approvedIntermediate[plan.route.intermediate]
                    || !approvedFeeTier[plan.route.secondFee]
            ) revert UnsupportedRoute();
            secondPool =
                factory.getPool(plan.route.intermediate, plan.route.tokenOut, plan.route.secondFee);
            if (secondPool == address(0) || !approvedPool[secondPool]) revert UnsupportedRoute();
        } else if (plan.route.secondFee != 0) {
            revert UnsupportedRoute();
        }
    }

    function _checkTwapDeviation(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    ) private view {
        (uint256 markedOut, bool valid) = dexMark.quoteAmount(tokenIn, tokenOut, amountIn);
        if (!valid || markedOut == 0) revert TwapDeviation();
        uint256 difference = amountOut > markedOut ? amountOut - markedOut : markedOut - amountOut;
        if (difference * BPS > markedOut * MAX_TWAP_DEVIATION_BPS) revert TwapDeviation();
    }

    function _checkCircuitBreaker(address exposureToken) private view {
        (uint256 dexPrice,, bool dexValid) = _price(exposureToken, dexMark);
        (uint256 breakerPrice, uint256 updatedAt, bool breakerValid) =
            circuitBreaker.quoteStatus(exposureToken);
        if (
            !dexValid || !breakerValid || breakerPrice == 0 || updatedAt > block.timestamp
                || block.timestamp - updatedAt > maximumCircuitBreakerAge
        ) revert CircuitBreakerUnavailable();
        uint256 difference =
            dexPrice > breakerPrice ? dexPrice - breakerPrice : breakerPrice - dexPrice;
        if (difference * BPS > breakerPrice * MAX_CIRCUIT_BREAKER_DEVIATION_BPS) {
            revert CircuitBreakerDivergence();
        }
    }

    function _price(address token, IDexMark mark)
        private
        view
        returns (uint256 priceWad, uint256 updatedAt, bool valid)
    {
        (bool ok, bytes memory data) =
            address(mark).staticcall(abi.encodeWithSignature("quoteStatus(address)", token));
        if (!ok || data.length < 96) return (0, 0, false);
        return abi.decode(data, (uint256, uint256, bool));
    }

    function _currentReferenceBlock() private view returns (uint256) {
        if (block.chainid == 46_630 || block.chainid == 4_663) {
            return IArbSysBlockNumber(address(100)).arbBlockNumber();
        }
        return block.number;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) { }
}
