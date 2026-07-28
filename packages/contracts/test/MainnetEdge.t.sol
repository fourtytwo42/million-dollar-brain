// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockToken} from "../src/MockToken.sol";
import {MockValuationOracle} from "../src/MockValuationOracle.sol";
import {BasketVault, IExecutionAdapterV3} from "../src/BasketVault.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {ChainlinkValuationAdapter} from "../src/ChainlinkValuationAdapter.sol";
import {ParityAssetToken} from "../src/ParityAssetToken.sol";
import {ZeroExExecutionAdapter} from "../src/ZeroExExecutionAdapter.sol";

contract MockAggregator {
    uint8 public immutable decimals;
    uint80 public roundId = 1;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound = 1;

    constructor(uint8 decimals_, int256 answer_) {
        decimals = decimals_;
        answer = answer_;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
    }

    function setRound(int256 answer_, uint256 startedAt_, uint256 updatedAt_) external {
        roundId++;
        answer = answer_;
        startedAt = startedAt_;
        updatedAt = updatedAt_;
        answeredInRound = roundId;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}

contract MockZeroExTarget {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    ) external {
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "pull");
        require(IERC20(tokenOut).transfer(recipient, amountOut), "send");
    }
}

contract MockRewardFund {
    IERC20 public immutable token;

    constructor(address token_) {
        token = IERC20(token_);
    }

    function fund(uint256 amount) external {
        require(token.transferFrom(msg.sender, address(this), amount), "fund");
    }
}

contract MainnetEdgeTest is Test {
    uint256 private authorizerKey = 0xA11CE;
    address private authorizer;
    MockToken private tokenIn;
    MockToken private tokenOut;
    MockValuationOracle private oracle;
    ZeroExExecutionAdapter private adapter;
    MockZeroExTarget private venue;

    function setUp() public {
        vm.warp(1_000_000);
        authorizer = vm.addr(authorizerKey);
        tokenIn = new MockToken("Input", "IN", 18, address(this));
        tokenOut = new MockToken("Output", "OUT", 18, address(this));
        oracle = new MockValuationOracle(address(this));
        oracle.setPrice(address(tokenIn), 1e18);
        oracle.setPrice(address(tokenOut), 1e18);
        venue = new MockZeroExTarget();
        ZeroExExecutionAdapter implementation = new ZeroExExecutionAdapter();
        adapter = ZeroExExecutionAdapter(
            address(
                new ERC1967Proxy(
                    address(implementation),
                    abi.encodeCall(
                        ZeroExExecutionAdapter.initialize,
                        (address(this), address(oracle), authorizer, 100, 20)
                    )
                )
            )
        );
        adapter.grantRole(adapter.VAULT_ROLE(), address(this));
        adapter.configureVenue(address(venue), address(venue), true);
        adapter.configureSelector(MockZeroExTarget.swap.selector, true);
        adapter.configureToken(address(tokenIn), true);
        adapter.configureToken(address(tokenOut), true);
        tokenIn.mint(address(this), 1_000e18);
        tokenOut.mint(address(venue), 1_000e18);
        tokenIn.approve(address(adapter), type(uint256).max);
    }

    function testQualifiedAssetActivationRequiresDurableEvidence() public {
        AssetRegistry implementation = new AssetRegistry();
        AssetRegistry registry = AssetRegistry(
            address(
                new ERC1967Proxy(
                    address(implementation),
                    abi.encodeCall(AssetRegistry.initialize, (address(this), block.chainid))
                )
            )
        );
        AssetRegistry.AssetRecord memory record = AssetRegistry.AssetRecord({
            token: address(tokenOut),
            robinhoodUid: keccak256("OUT"),
            kind: AssetRegistry.AssetKind.CRYPTO,
            riskClass: AssetRegistry.RiskClass.HIGH_VOLATILITY,
            valuationAdapter: address(oracle),
            executionAdapter: address(adapter),
            circulatingSupplyAdapter: makeAddr("supply-adapter"),
            maximumWeightBps: 2_000,
            registered: false,
            active: false
        });
        registry.registerAsset(record);
        registry.recordQualification(
            address(tokenOut),
            AssetRegistry.AssetQualification({
                evidenceHash: keccak256("qualified"),
                observedAt: uint64(block.timestamp),
                validUntil: uint64(block.timestamp + 2 days),
                consecutiveDays: 30,
                marketCapOrAumUsdWad: uint128(100_000_000e18),
                executableDepthUsdWad: uint128(250_000e18),
                identityValid: true,
                oracleValid: true,
                liquidityValid: true,
                transferBehaviorValid: true,
                corporateActionClear: true
            })
        );
        registry.setActive(address(tokenOut), true);
        assertTrue(registry.isActive(address(tokenOut)));
        vm.warp(block.timestamp + 3 days);
        assertFalse(registry.isActive(address(tokenOut)));
    }

    function testChainlinkFeedScalesAndHonorsRobinhoodPause() public {
        ParityAssetToken stock =
            new ParityAssetToken("Test Replica Apple", "trAAPL", keccak256("AAPL"), address(this));
        MockAggregator feed = new MockAggregator(8, 12_345_000_000);
        ChainlinkValuationAdapter implementation = new ChainlinkValuationAdapter();
        ChainlinkValuationAdapter valuation = ChainlinkValuationAdapter(
            address(
                new ERC1967Proxy(
                    address(implementation),
                    abi.encodeCall(
                        ChainlinkValuationAdapter.initialize, (address(this), address(0), 3_600)
                    )
                )
            )
        );
        valuation.configureFeed(address(stock), address(feed), 1 hours, true, true);
        (uint256 price,, bool valid) = valuation.quoteStatus(address(stock));
        assertTrue(valid);
        assertEq(price, 123_450_000_000_000_000_000);
        stock.setOraclePaused(true);
        (,, valid) = valuation.quoteStatus(address(stock));
        assertFalse(valid);
    }

    function testSignedExecutionBindsCalldataAndPreventsReplay() public {
        bytes memory data = abi.encodeCall(
            MockZeroExTarget.swap,
            (address(tokenIn), address(tokenOut), 100e18, 100e18, address(adapter))
        );
        ZeroExExecutionAdapter.ExecutionIntent memory intent = ZeroExExecutionAdapter.ExecutionIntent({
            vault: address(this),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 100e18,
            minimumAmountOut: 99e18,
            recipient: address(this),
            target: address(venue),
            allowanceTarget: address(venue),
            callDataHash: keccak256(data),
            expiry: block.timestamp + 2 minutes,
            referenceBlock: block.number,
            nonce: 1
        });
        bytes32 digest = adapter.intentDigest(intent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(authorizerKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        uint256 amountOut = adapter.execute(intent, data, signature);
        assertEq(amountOut, 100e18);
        vm.expectRevert("intent already used");
        adapter.execute(intent, data, signature);
    }

    function testSignedExecutionRejectsModifiedCalldata() public {
        bytes memory signedData = abi.encodeCall(
            MockZeroExTarget.swap,
            (address(tokenIn), address(tokenOut), 100e18, 100e18, address(adapter))
        );
        bytes memory changedData = abi.encodeCall(
            MockZeroExTarget.swap,
            (address(tokenIn), address(tokenOut), 100e18, 101e18, address(adapter))
        );
        ZeroExExecutionAdapter.ExecutionIntent memory intent = ZeroExExecutionAdapter.ExecutionIntent({
            vault: address(this),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 100e18,
            minimumAmountOut: 99e18,
            recipient: address(this),
            target: address(venue),
            allowanceTarget: address(venue),
            callDataHash: keccak256(signedData),
            expiry: block.timestamp + 2 minutes,
            referenceBlock: block.number,
            nonce: 2
        });
        bytes32 digest = adapter.intentDigest(intent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(authorizerKey, digest);
        vm.expectRevert("calldata changed");
        adapter.execute(intent, changedData, abi.encodePacked(r, s, v));
    }

    function testBasketV3DepositAndRedemptionUseAtomicSignedPlans() public {
        AssetRegistry registryImplementation = new AssetRegistry();
        AssetRegistry registry = AssetRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImplementation),
                    abi.encodeCall(AssetRegistry.initialize, (address(this), block.chainid))
                )
            )
        );
        registry.registerAsset(
            AssetRegistry.AssetRecord({
                token: address(tokenOut),
                robinhoodUid: keccak256("OUT-STOCK"),
                kind: AssetRegistry.AssetKind.STOCK,
                riskClass: AssetRegistry.RiskClass.STANDARD,
                valuationAdapter: address(oracle),
                executionAdapter: address(adapter),
                circulatingSupplyAdapter: address(0),
                maximumWeightBps: 2_000,
                registered: false,
                active: false
            })
        );
        registry.recordQualification(
            address(tokenOut),
            AssetRegistry.AssetQualification({
                evidenceHash: keccak256("qualified-stock"),
                observedAt: uint64(block.timestamp),
                validUntil: uint64(block.timestamp + 2 days),
                consecutiveDays: 30,
                marketCapOrAumUsdWad: uint128(100_000_000e18),
                executableDepthUsdWad: uint128(250_000e18),
                identityValid: true,
                oracleValid: true,
                liquidityValid: true,
                transferBehaviorValid: true,
                corporateActionClear: true
            })
        );
        registry.setActive(address(tokenOut), true);

        MockRewardFund rewards = new MockRewardFund(address(tokenIn));
        address[] memory assets = new address[](1);
        assets[0] = address(tokenOut);
        BasketVault basketImplementation = new BasketVault();
        BasketVault basket = BasketVault(
            address(
                new ERC1967Proxy(
                    address(basketImplementation),
                    abi.encodeCall(
                        BasketVault.initialize,
                        (
                            address(this),
                            address(tokenIn),
                            address(venue),
                            address(rewards),
                            makeAddr("creator"),
                            makeAddr("automation"),
                            assets
                        )
                    )
                )
            )
        );
        address[] memory targets = new address[](2);
        uint16[] memory weights = new uint16[](2);
        targets[0] = address(tokenIn);
        targets[1] = address(tokenOut);
        weights[0] = 8_000;
        weights[1] = 2_000;
        basket.reinitializeV2(address(oracle), 120, 100, targets, weights);
        basket.reinitializeV3(address(registry), address(adapter));
        adapter.grantRole(adapter.VAULT_ROLE(), address(basket));
        tokenIn.approve(address(basket), type(uint256).max);

        uint256 depositBuy = 198e18;
        bytes memory buyData = abi.encodeCall(
            MockZeroExTarget.swap,
            (address(tokenIn), address(tokenOut), depositBuy, depositBuy, address(adapter))
        );
        BasketVault.SwapPlan[] memory buyPlans = new BasketVault.SwapPlan[](1);
        buyPlans[0] = _plan(
            address(basket), address(tokenIn), address(tokenOut), depositBuy, buyData, 100
        );
        uint256 shares =
            basket.depositWithPlan(1_000e18, 989e18, block.timestamp + 1 hours, buyPlans);
        assertEq(shares, 990e18);
        assertEq(tokenOut.balanceOf(address(basket)), depositBuy);

        bytes memory sellData = abi.encodeCall(
            MockZeroExTarget.swap,
            (address(tokenOut), address(tokenIn), depositBuy, depositBuy, address(adapter))
        );
        BasketVault.SwapPlan[] memory sellPlans = new BasketVault.SwapPlan[](1);
        sellPlans[0] = _plan(
            address(basket), address(tokenOut), address(tokenIn), depositBuy, sellData, 101
        );
        uint256 net =
            basket.redeemWithPlan(shares, 979e18, block.timestamp + 1 hours, sellPlans);
        assertEq(net, 980_100_000_000_000_000_000);
        assertEq(basket.totalSupply(), 0);
        assertEq(tokenOut.balanceOf(address(basket)), 0);
    }

    function _plan(
        address vault,
        address input,
        address output,
        uint256 amount,
        bytes memory data,
        uint256 nonce
    ) private returns (BasketVault.SwapPlan memory plan) {
        ZeroExExecutionAdapter.ExecutionIntent memory adapterIntent =
            ZeroExExecutionAdapter.ExecutionIntent({
                vault: vault,
                tokenIn: input,
                tokenOut: output,
                amountIn: amount,
                minimumAmountOut: (amount * 99) / 100,
                recipient: vault,
                target: address(venue),
                allowanceTarget: address(venue),
                callDataHash: keccak256(data),
                expiry: block.timestamp + 2 minutes,
                referenceBlock: block.number,
                nonce: nonce
            });
        bytes32 digest = adapter.intentDigest(adapterIntent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(authorizerKey, digest);
        plan = BasketVault.SwapPlan({
            intent: IExecutionAdapterV3.ExecutionIntent({
                vault: adapterIntent.vault,
                tokenIn: adapterIntent.tokenIn,
                tokenOut: adapterIntent.tokenOut,
                amountIn: adapterIntent.amountIn,
                minimumAmountOut: adapterIntent.minimumAmountOut,
                recipient: adapterIntent.recipient,
                target: adapterIntent.target,
                allowanceTarget: adapterIntent.allowanceTarget,
                callDataHash: adapterIntent.callDataHash,
                expiry: adapterIntent.expiry,
                referenceBlock: adapterIntent.referenceBlock,
                nonce: adapterIntent.nonce
            }),
            executionData: data,
            authorizerSignature: abi.encodePacked(r, s, v)
        });
    }
}
