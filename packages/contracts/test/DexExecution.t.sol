// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { MockToken } from "../src/MockToken.sol";
import { UniswapExecutionAdapter, ISwapRouter02 } from "../src/UniswapExecutionAdapter.sol";
import { BasketVault } from "../src/BasketVault.sol";

contract DexFactoryMock {
    mapping(bytes32 => address) internal pools;

    function setPool(address tokenA, address tokenB, uint24 fee, address pool) external {
        pools[_key(tokenA, tokenB, fee)] = pool;
    }

    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address) {
        return pools[_key(tokenA, tokenB, fee)];
    }

    function _key(address tokenA, address tokenB, uint24 fee) private pure returns (bytes32) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return keccak256(abi.encode(token0, token1, fee));
    }
}

contract DexPriceMock {
    mapping(address => uint256) public price;
    mapping(address => bool) public valid;
    mapping(address => uint256) public updatedAt;

    function set(address token, uint256 value, bool isValid) external {
        price[token] = value;
        valid[token] = isValid;
        updatedAt[token] = block.timestamp;
    }

    function setUpdatedAt(address token, uint256 value) external {
        updatedAt[token] = value;
    }

    function quoteStatus(address token) external view returns (uint256, uint256, bool) {
        return (price[token], updatedAt[token], valid[token]);
    }

    function quoteAmount(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 amountOut, bool isValid)
    {
        if (!valid[tokenIn] || !valid[tokenOut] || price[tokenOut] == 0) return (0, false);
        return ((amountIn * price[tokenIn]) / price[tokenOut], true);
    }
}

contract SwapRouterMock {
    mapping(bytes32 => uint256) public rateWad;

    function setRate(address tokenIn, address tokenOut, uint256 value) external {
        rateWad[keccak256(abi.encode(tokenIn, tokenOut))] = value;
    }

    function exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        amountOut =
            (params.amountIn * rateWad[keccak256(abi.encode(params.tokenIn, params.tokenOut))])
                / 1e18;
        require(amountOut >= params.amountOutMinimum, "minimum");
        IERC20(params.tokenOut).transfer(params.recipient, amountOut);
    }

    function exactInput(ISwapRouter02.ExactInputParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        require(params.path.length == 66, "path");
        bytes calldata path = params.path;
        address tokenIn;
        address intermediate;
        address tokenOut;
        assembly {
            tokenIn := shr(96, calldataload(path.offset))
            intermediate := shr(96, calldataload(add(path.offset, 23)))
            tokenOut := shr(96, calldataload(add(path.offset, 46)))
        }
        IERC20(tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        uint256 firstOut =
            (params.amountIn * rateWad[keccak256(abi.encode(tokenIn, intermediate))]) / 1e18;
        amountOut = (firstOut * rateWad[keccak256(abi.encode(intermediate, tokenOut))]) / 1e18;
        require(amountOut >= params.amountOutMinimum, "minimum");
        IERC20(tokenOut).transfer(params.recipient, amountOut);
    }
}

contract ArbSysBlockNumberMock {
    uint256 public l2BlockNumber;

    function setL2BlockNumber(uint256 value) external {
        l2BlockNumber = value;
    }

    function arbBlockNumber() external view returns (uint256) {
        return l2BlockNumber;
    }
}

contract AssetCapacityRegistryMock {
    uint128 public maximumExposure;

    function setMaximumExposure(uint128 value) external {
        maximumExposure = value;
    }

    function isActive(address) external pure returns (bool) {
        return true;
    }

    function isHighVolatility(address) external pure returns (bool) {
        return false;
    }

    function maximumWeightBps(address) external pure returns (uint16) {
        return 2_000;
    }

    function maximumExposureUsdWad(address) external view returns (uint128) {
        return maximumExposure;
    }
}

contract TransferTaxToken is ERC20 {
    constructor() ERC20("Taxed Asset", "TAX") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 tax = value / 100;
            super._update(from, address(0), tax);
            value -= tax;
        }
        super._update(from, to, value);
    }
}

contract DexExecutionTest is Test {
    MockToken internal usdg;
    MockToken internal asset;
    MockToken internal weth;
    DexFactoryMock internal factory;
    DexPriceMock internal twap;
    DexPriceMock internal breaker;
    SwapRouterMock internal router;
    UniswapExecutionAdapter internal adapter;
    address internal pool = address(0xBEEF);

    function setUp() public {
        vm.warp(1_000);
        usdg = new MockToken("USDG", "USDG", 18, address(this));
        asset = new MockToken("Asset", "AST", 18, address(this));
        weth = new MockToken("WETH", "WETH", 18, address(this));
        factory = new DexFactoryMock();
        twap = new DexPriceMock();
        breaker = new DexPriceMock();
        router = new SwapRouterMock();
        adapter = new UniswapExecutionAdapter();
        adapter.initialize(
            address(this),
            address(this),
            address(usdg),
            address(weth),
            address(factory),
            address(router),
            address(twap),
            address(breaker),
            60
        );
        adapter.setFeeTier(3000, true);
        adapter.setPool(pool, true);
        factory.setPool(address(usdg), address(asset), 3000, pool);
        twap.set(address(usdg), 1e18, true);
        twap.set(address(asset), 2e18, true);
        breaker.set(address(asset), 2e18, true);
        router.setRate(address(usdg), address(asset), 0.5e18);
        usdg.mint(address(this), 1_000e18);
        asset.mint(address(router), 1_000e18);
        usdg.approve(address(adapter), type(uint256).max);
    }

    function testDirectBuyUsesStructuredPlanAndBalanceDeltas() public {
        UniswapExecutionAdapter.DexSwapPlanV1 memory plan = _buyPlan(100e18, 50e18);
        uint256 received = adapter.execute(plan, true);
        assertEq(received, 50e18);
        assertEq(asset.balanceOf(address(this)), 50e18);
        assertEq(usdg.allowance(address(adapter), address(router)), 0);
    }

    function testApprovedTwoHopRouteExecutesDeterministically() public {
        address wethPool = address(0xCAFE);
        factory.setPool(address(usdg), address(weth), 3000, wethPool);
        factory.setPool(address(weth), address(asset), 3000, pool);
        adapter.setPool(wethPool, true);
        router.setRate(address(usdg), address(weth), 0.25e18);
        router.setRate(address(weth), address(asset), 2e18);
        UniswapExecutionAdapter.DexSwapPlanV1 memory plan = _buyPlan(100e18, 50e18);
        plan.route.intermediate = address(weth);
        plan.route.secondFee = 3000;
        assertEq(adapter.execute(plan, true), 50e18);
        assertEq(asset.balanceOf(address(this)), 50e18);
        assertEq(usdg.allowance(address(adapter), address(router)), 0);
    }

    function testRejectsWrongRecipientAndExpiredPlan() public {
        UniswapExecutionAdapter.DexSwapPlanV1 memory plan = _buyPlan(100e18, 50e18);
        plan.recipient = address(0xBAD);
        vm.expectRevert(UniswapExecutionAdapter.InvalidPlan.selector);
        adapter.execute(plan, true);

        plan = _buyPlan(100e18, 50e18);
        plan.deadline = uint64(block.timestamp - 1);
        vm.expectRevert(UniswapExecutionAdapter.ExpiredPlan.selector);
        adapter.execute(plan, true);
    }

    function testRejectsUnapprovedPoolAndPathLoop() public {
        adapter.setPool(pool, false);
        vm.expectRevert(UniswapExecutionAdapter.UnsupportedRoute.selector);
        adapter.execute(_buyPlan(100e18, 50e18), true);

        adapter.setPool(pool, true);
        UniswapExecutionAdapter.DexSwapPlanV1 memory plan = _buyPlan(100e18, 50e18);
        plan.route.intermediate = address(asset);
        plan.route.secondFee = 3000;
        vm.expectRevert(UniswapExecutionAdapter.UnsupportedRoute.selector);
        adapter.execute(plan, true);
    }

    function testStaleCircuitBreakerDoesNotBlockReduction() public {
        asset.mint(address(this), 20e18);
        asset.approve(address(adapter), type(uint256).max);
        usdg.mint(address(router), 1_000e18);
        router.setRate(address(asset), address(usdg), 2e18);
        factory.setPool(address(asset), address(usdg), 3000, pool);
        breaker.setUpdatedAt(address(asset), block.timestamp - 61);
        UniswapExecutionAdapter.DexSwapPlanV1 memory plan = _sellPlan(10e18, 20e18);
        assertEq(adapter.execute(plan, false), 20e18);
        vm.expectRevert(UniswapExecutionAdapter.CircuitBreakerUnavailable.selector);
        adapter.execute(_buyPlan(10e18, 5e18), true);
    }

    function testRejectsQuoteOutsideOnePercent() public {
        UniswapExecutionAdapter.DexSwapPlanV1 memory plan = _buyPlan(100e18, 50e18);
        plan.minimumAmountOut = 49e18 - 1;
        vm.expectRevert(UniswapExecutionAdapter.InvalidPlan.selector);
        adapter.execute(plan, true);
    }

    function testRejectsStaleReferenceBlock() public {
        vm.roll(block.number + 129);
        UniswapExecutionAdapter.DexSwapPlanV1 memory plan = _buyPlan(100e18, 50e18);
        plan.referenceBlock = uint64(block.number - 129);
        vm.expectRevert(UniswapExecutionAdapter.StaleReferenceBlock.selector);
        adapter.execute(plan, true);
    }

    function testRobinhoodUsesArbSysL2ReferenceBlock() public {
        ArbSysBlockNumberMock implementation = new ArbSysBlockNumberMock();
        vm.etch(address(100), address(implementation).code);
        ArbSysBlockNumberMock(address(100)).setL2BlockNumber(1_000);
        vm.chainId(46_630);

        UniswapExecutionAdapter.DexSwapPlanV1 memory plan = _buyPlan(100e18, 50e18);
        plan.referenceBlock = 872;
        assertEq(adapter.execute(plan, true), 50e18);

        plan = _buyPlan(100e18, 50e18);
        plan.referenceBlock = 871;
        vm.expectRevert(UniswapExecutionAdapter.StaleReferenceBlock.selector);
        adapter.execute(plan, true);
    }

    function testRejectsExecutionBeyondTwapDeviation() public {
        router.setRate(address(usdg), address(asset), 0.45e18);
        UniswapExecutionAdapter.DexSwapPlanV1 memory plan = _buyPlan(100e18, 45e18);
        vm.expectRevert(UniswapExecutionAdapter.TwapDeviation.selector);
        adapter.execute(plan, true);
    }

    function testV5PermanentlyDisablesLegacySignedPlanEntry() public {
        address[] memory assets = new address[](1);
        assets[0] = address(asset);
        BasketVault vault = new BasketVault();
        vault.initialize(
            address(this),
            address(usdg),
            address(router),
            address(this),
            address(this),
            address(this),
            assets
        );
        vault.reinitializeV5(address(twap), address(adapter));
        assertTrue(vault.legacyPlanExecutionDisabled());
        BasketVault.SwapPlan[] memory plans = new BasketVault.SwapPlan[](0);
        vm.expectRevert(BasketVault.LegacyExecutionDisabled.selector);
        vault.depositWithPlan(1e18, 0, block.timestamp + 1, plans);

        vault.setDexPriceAge(900);
        assertEq(vault.maximumPriceAge(), 900);
        vm.expectRevert(BasketVault.InvalidConfiguration.selector);
        vault.setDexPriceAge(1 hours + 1);
        vm.prank(address(0xB0B));
        vm.expectRevert();
        vault.setDexPriceAge(900);

        vault.setDexAdapters(address(0xA11CE), address(0xBEEF));
        assertEq(address(vault.valuation()), address(0xA11CE));
        assertEq(address(vault.dexExecutionAdapter()), address(0xBEEF));
        vm.prank(address(0xB0B));
        vm.expectRevert();
        vault.setDexAdapters(address(twap), address(adapter));
    }

    function testV6RejectsExposureAboveProvenCapacity() public {
        AssetCapacityRegistryMock registry = new AssetCapacityRegistryMock();
        registry.setMaximumExposure(10e18);
        address[] memory assets = new address[](1);
        assets[0] = address(asset);
        BasketVault vault = new BasketVault();
        vault.initialize(
            address(this),
            address(usdg),
            address(router),
            address(this),
            address(this),
            address(this),
            assets
        );
        vault.reinitializeV3(address(registry), address(adapter));
        vault.reinitializeV5(address(twap), address(adapter));
        vault.reinitializeV6(60_000e18);
        usdg.mint(address(vault), 80e18);
        asset.mint(address(vault), 10e18);

        address[] memory targetAssets = new address[](2);
        targetAssets[0] = address(usdg);
        targetAssets[1] = address(asset);
        uint16[] memory weights = new uint16[](2);
        weights[0] = 8_000;
        weights[1] = 2_000;
        BasketVault.DexSwapPlan[] memory plans = new BasketVault.DexSwapPlan[](0);

        vm.expectRevert(BasketVault.AssetCapacityExceeded.selector);
        vault.rebalanceWithDexPlan(targetAssets, weights, keccak256("capacity"), plans);
    }

    function testRejectsTransferTaxOnInputAndOutput() public {
        TransferTaxToken taxed = new TransferTaxToken();
        factory.setPool(address(usdg), address(taxed), 3000, pool);
        twap.set(address(taxed), 2e18, true);
        breaker.set(address(taxed), 2e18, true);
        router.setRate(address(usdg), address(taxed), 0.5e18);
        taxed.mint(address(router), 1_000e18);

        UniswapExecutionAdapter.DexSwapPlanV1 memory buyPlan = UniswapExecutionAdapter.DexSwapPlanV1({
            route: UniswapExecutionAdapter.DexRouteV1({
                tokenIn: address(usdg),
                tokenOut: address(taxed),
                intermediate: address(0),
                firstFee: 3000,
                secondFee: 0
            }),
            amountIn: 100e18,
            quotedAmountOut: 50e18,
            minimumAmountOut: 49.5e18,
            recipient: address(this),
            issuedAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 30),
            referenceBlock: uint64(block.number)
        });
        vm.expectRevert(UniswapExecutionAdapter.TransferTaxUnsupported.selector);
        adapter.execute(buyPlan, true);

        taxed.mint(address(this), 10e18);
        taxed.approve(address(adapter), type(uint256).max);
        usdg.mint(address(router), 1_000e18);
        router.setRate(address(taxed), address(usdg), 2e18);
        UniswapExecutionAdapter.DexSwapPlanV1 memory sellPlan = UniswapExecutionAdapter.DexSwapPlanV1({
            route: UniswapExecutionAdapter.DexRouteV1({
                tokenIn: address(taxed),
                tokenOut: address(usdg),
                intermediate: address(0),
                firstFee: 3000,
                secondFee: 0
            }),
            amountIn: 10e18,
            quotedAmountOut: 20e18,
            minimumAmountOut: 19.8e18,
            recipient: address(this),
            issuedAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 30),
            referenceBlock: uint64(block.number)
        });
        vm.expectRevert(UniswapExecutionAdapter.TransferTaxUnsupported.selector);
        adapter.execute(sellPlan, false);
    }

    function _buyPlan(uint256 amountIn, uint256 quotedOut)
        private
        view
        returns (UniswapExecutionAdapter.DexSwapPlanV1 memory)
    {
        return UniswapExecutionAdapter.DexSwapPlanV1({
            route: UniswapExecutionAdapter.DexRouteV1({
                tokenIn: address(usdg),
                tokenOut: address(asset),
                intermediate: address(0),
                firstFee: 3000,
                secondFee: 0
            }),
            amountIn: amountIn,
            quotedAmountOut: quotedOut,
            minimumAmountOut: (quotedOut * 9900) / 10_000,
            recipient: address(this),
            issuedAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 30),
            referenceBlock: uint64(block.number)
        });
    }

    function _sellPlan(uint256 amountIn, uint256 quotedOut)
        private
        view
        returns (UniswapExecutionAdapter.DexSwapPlanV1 memory plan)
    {
        plan = _buyPlan(amountIn, quotedOut);
        plan.route.tokenIn = address(asset);
        plan.route.tokenOut = address(usdg);
    }
}
