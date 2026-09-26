# Strategy Catalog

> Generated automatically from `src/utils/strategies/core/strategyCatalog.ts`

## 1. EMA Gap Pullback
| | |
|---|---|
| **File** | `src/utils/strategies/emaGapPullbackAdapter.ts` |
| **Allowed Regimes** | `trend` |
| **Allowed Volatility** | `normal`, `expanded` |
| **Correlation Group** | `trend-continuation` |
| **Description** | Trades high-quality 5-EMA gap candles after structured pullbacks (≥3 bars), filtered by HTF EMA-50 trend alignment. Entry near EMA-5 or mid-gap. SL beyond recent swing. TP at 1R / 1.5R / 2.5R. |

## 2. Trend Pullback
| | |
|---|---|
| **File** | `src/utils/strategies/trendPullbackAdapter.ts` |
| **Allowed Regimes** | `trend` |
| **Allowed Volatility** | `normal`, `expanded` |
| **Correlation Group** | `trend-continuation` |
| **Description** | Enters a pullback against a confirmed HTF trend. Requires price to retrace ≤2×ATR toward the trend line. Entry at pullback extreme, SL beyond pullback high/low, TP at 2R. |
| ⚠️ **Correlation Warning** | Highly correlated with *EMA Gap Pullback* – both fire in trending + normal/expanded volatility regimes. Consider de-weighting when both fire simultaneously. |

## 3. Volatility Compression Breakout
| | |
|---|---|
| **File** | `src/utils/strategies/volatilityCompressionAdapter.ts` |
| **Allowed Regimes** | `range`, `neutral` |
| **Allowed Volatility** | `compressed` |
| **Correlation Group** | `volatility-expansion` |
| **Description** | Fires after ATR falls below its 50-bar median for N consecutive bars, then a breakout candle exceeds the compression range by ≥1.5×ATR. Entry at breakout, SL at compression range floor/ceiling. |

## 4. Early Coil Breakout
| | |
|---|---|
| **File** | `src/utils/strategies/earlyCoilBreakoutAdapter.ts` |
| **Allowed Regimes** | `trend`, `neutral` |
| **Allowed Volatility** | `compressed`, `normal` |
| **Correlation Group** | `volatility-expansion` |
| **Description** | Detects the first candle breaking out of a tight coil structure, using the TwoSidedCoil engine. Entry at breakout candle close, SL at opposite coil edge. |
| ⚠️ **Correlation Warning** | Shares the same coil-detection engine with *Two-Sided Coil Breakout* – signals may overlap. |

## 5. Two-Sided Coil Breakout
| | |
|---|---|
| **File** | `src/utils/strategies/twoSidedCoilBreakoutAdapter.ts` |
| **Allowed Regimes** | `neutral` |
| **Allowed Volatility** | `compressed`, `normal` |
| **Correlation Group** | `volatility-expansion` |
| **Description** | Trades the second breakout when both sides of a coil are penetrated within ≤5 bars. |
| **Strict Rules** | • Min 1×ATR breakout distance on each side. • Only candle-close counts (not wicks). • Volume must be elevated on the second break. • If both sides break in the same candle → signal discarded. • First breakout is invalidated if price closes back inside coil before the second break. |

## 6. Macro Range Breakout
| | |
|---|---|
| **File** | `src/utils/strategies/macroRangeAdapter.ts` |
| **Allowed Regimes** | `trend`, `neutral` |
| **Allowed Volatility** | `normal`, `expanded` |
| **Correlation Group** | `breakout` |
| **Description** | Validates a candle close beyond a pre-defined macro congestion box by a configurable margin (default 0.5×ATR). SL at the opposite box edge, TP at 1R / 1.5R / 2R. |

## 7. Range Mean Reversion
| | |
|---|---|
| **File** | `src/utils/strategies/rangeMeanReversionAdapter.ts` |
| **Allowed Regimes** | `range` |
| **Allowed Volatility** | `compressed`, `normal` |
| **Correlation Group** | `mean-reversion` |
| **Description** | Captures reversals inside a ranging regime. Entry at the opposite side of the range after a bounce. SL just beyond range edge, TP at 1R–2R. |
| **Note** | Only strategy in `mean-reversion` group – provides genuine diversification from the breakout cluster. |

## 8. SMC Liquidity Sweep
| | |
|---|---|
| **File** | `src/utils/strategies/smcLiquidityAdapter.ts` |
| **Allowed Regimes** | `trend`, `neutral` |
| **Allowed Volatility** | `normal`, `expanded` |
| **Correlation Group** | `order-flow` |
| **Description** | Identifies rapid liquidity-sweep patterns (order-block / BSL / SSL consumption). Entry at sweep breakout, SL at prior swing with ATR buffer, TP at 1.5R–2.5R. |

## 9. Strategy Regime Filters (Utility)
| | |
|---|---|
| **File** | `src/utils/strategies/strategyRegimeFiltersAdapter.ts` |
| **Correlation Group** | `utility` |
| **Description** | Utility adapter that runs the unified regime detector and exposes the MarketContext. Used as a pre-filter; does not generate trade signals on its own. |

---

## Correlation Matrix (Estimated)

| | EMA Gap | Trend PB | Vol. Comp | Early Coil | 2-Sided Coil | Macro Range | Range MR | SMC |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **EMA Gap** | — | 🔴 HIGH | 🟡 LOW | 🟡 MED | 🟢 LOW | 🟡 MED | 🟢 LOW | 🟡 MED |
| **Trend PB** | 🔴 HIGH | — | 🟢 LOW | 🟡 MED | 🟢 LOW | 🟡 MED | 🟢 LOW | 🟡 MED |
| **Vol. Comp** | 🟡 LOW | 🟢 LOW | — | 🔴 HIGH | 🔴 HIGH | 🟡 MED | 🟡 MED | 🟢 LOW |
| **Early Coil** | 🟡 MED | 🟡 MED | 🔴 HIGH | — | 🔴 HIGH | 🟡 MED | 🟢 LOW | 🟢 LOW |
| **2-Sided Coil** | 🟢 LOW | 🟢 LOW | 🔴 HIGH | 🔴 HIGH | — | 🟡 MED | 🟢 LOW | 🟢 LOW |
| **Macro Range** | 🟡 MED | 🟡 MED | 🟡 MED | 🟡 MED | 🟡 MED | — | 🟢 LOW | 🟡 MED |
| **Range MR** | 🟢 LOW | 🟢 LOW | 🟡 MED | 🟢 LOW | 🟢 LOW | 🟢 LOW | — | 🟡 MED |
| **SMC** | 🟡 MED | 🟡 MED | 🟢 LOW | 🟢 LOW | 🟢 LOW | 🟡 MED | 🟡 MED | — |

> 🔴 = Likely correlated (same regime/volatility bucket). 🟡 = Possible overlap. 🟢 = Likely independent.
> **Action**: When 🔴 strategies fire together, use the `signalValidator` composite score to pick the stronger one and discard the weaker.

---

## Validation Sequence

```
1. Unit tests for each helper (riskManager, regimeDetector, positionSizer, signalValidator)
2. Integration tests per adapter – verify StrategySignal shape on valid input
3. Event-driven backtester – candle-close only, with realistic costs
4. Per-strategy independent backtest – measure profit factor, expectancy, Sharpe
5. Combined portfolio backtest – with conflict resolution and position limits
6. Chronological out-of-sample evaluation
7. Walk-forward validation (rolling training window)
8. Reserve final untouched hold-out period
9. Paper trade → live with graduated position sizes
```
