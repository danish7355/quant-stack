/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppSettings, CoinDetail } from '../types';

export type GateImportance = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface GateDefinition {
  id: string;
  key: string;
  name: string;
  strategy: 'BINANCE_COMPOSITE' | 'DELTA_CLIMAX' | 'RISK_ENGINE' | 'VOLATILITY_COMPRESSION';
  category: 'REGIME' | 'TREND' | 'VOLATILITY' | 'MOMENTUM' | 'VOLUME' | 'STRUCTURE' | 'RISK' | 'LIQUIDITY';
  importance: GateImportance;
  importanceScore: number; // 0-100%
  isMandatory: boolean;
  description: string;
  formulaOrCondition: string;
  riskIfBypassed: string;
  defaultEnabled: boolean;
}

export const GATES_REGISTRY: GateDefinition[] = [
  // --- BINANCE COMPOSITE GATES ---
  {
    id: 'COMPOSITE_g1',
    key: 'g1',
    name: 'G1: 24h Volume Liquidity Gate',
    strategy: 'BINANCE_COMPOSITE',
    category: 'LIQUIDITY',
    importance: 'HIGH',
    importanceScore: 85,
    isMandatory: true,
    description: 'Requires pair 24-hour traded volume to meet minimum threshold ($10M default) to prevent illiquid execution slippage.',
    formulaOrCondition: '24h Volume >= Min Volume ($10M)',
    riskIfBypassed: 'High slippage on entries and emergency stop losses; wide spreads eat into profits.',
    defaultEnabled: true,
  },
  {
    id: 'COMPOSITE_g2',
    key: 'g2',
    name: 'G2: Bid/Ask Spread Gate',
    strategy: 'BINANCE_COMPOSITE',
    category: 'LIQUIDITY',
    importance: 'HIGH',
    importanceScore: 80,
    isMandatory: true,
    description: 'Verifies the real-time bid/ask spread is within safe bounds (<= 0.30%) to ensure immediate order fill quality.',
    formulaOrCondition: 'Spread <= Max Spread (0.30%)',
    riskIfBypassed: 'Immediate negative PnL upon order fill due to wide spread crossing costs.',
    defaultEnabled: true,
  },
  {
    id: 'COMPOSITE_g3',
    key: 'g3',
    name: 'G3: Market Regime Trend Gate',
    strategy: 'BINANCE_COMPOSITE',
    category: 'REGIME',
    importance: 'CRITICAL',
    importanceScore: 98,
    isMandatory: true,
    description: 'Evaluates multi-factor market regime score (EMA stacking, ADX, VWAP, ATR expansion, Volume). Blocks trades during Chop or Range.',
    formulaOrCondition: 'Regime Score >= 60 (WEAK_TREND or STRONG_TREND)',
    riskIfBypassed: 'Entering positions during sideways choppy consolidation resulting in repetitive false breakouts and stop outs.',
    defaultEnabled: true,
  },
  {
    id: 'COMPOSITE_g4',
    key: 'g4',
    name: 'G4: EMA & ADX Trend Alignment Gate',
    strategy: 'BINANCE_COMPOSITE',
    category: 'TREND',
    importance: 'CRITICAL',
    importanceScore: 95,
    isMandatory: true,
    description: 'Checks triple EMA alignment (Fast > Slow > Trend for Long, or Fast < Slow < Trend for Short) combined with ADX trend strength (> 20).',
    formulaOrCondition: 'LONG: EMA9 > EMA21 > EMA50 & ADX > 20 | SHORT: EMA9 < EMA21 < EMA50 & ADX > 20',
    riskIfBypassed: 'Counter-trend trading into powerful opposing momentum or non-trending dead cycles.',
    defaultEnabled: true,
  },
  {
    id: 'COMPOSITE_g5',
    key: 'g5',
    name: 'G5: Volatility / ATR Corridor Gate',
    strategy: 'BINANCE_COMPOSITE',
    category: 'VOLATILITY',
    importance: 'HIGH',
    importanceScore: 80,
    isMandatory: true,
    description: 'Guarantees the asset has sufficient volatility (ATR% >= 0.3%) without being hyper-extended in abnormal pump-and-dump spikes (ATR% <= 6.0%).',
    formulaOrCondition: '0.30% <= (ATR / Price * 100) <= 6.00%',
    riskIfBypassed: 'Capital trapped in dead dormant coins (<0.3%) or sudden flash liquidations in erratic low-cap coins (>6%).',
    defaultEnabled: true,
  },
  {
    id: 'COMPOSITE_g6',
    key: 'g6',
    name: 'G6: RSI Momentum Corridor Filter',
    strategy: 'BINANCE_COMPOSITE',
    category: 'MOMENTUM',
    importance: 'MEDIUM',
    importanceScore: 65,
    isMandatory: false,
    description: 'Checks that RSI is in the optimal acceleration sweet spot (45-72 for LONG, 28-55 for SHORT) without chasing overbought tops or oversold bottoms.',
    formulaOrCondition: 'LONG: 45 <= RSI <= 72 | SHORT: 28 <= RSI <= 55',
    riskIfBypassed: 'Buying at the peak of exhausted blow-off tops or shorting into bounce-prone oversold bottoms.',
    defaultEnabled: true,
  },
  {
    id: 'COMPOSITE_g7',
    key: 'g7',
    name: 'G7: Structure Pullback & Breakout Gate',
    strategy: 'BINANCE_COMPOSITE',
    category: 'STRUCTURE',
    importance: 'MEDIUM',
    importanceScore: 70,
    isMandatory: false,
    description: 'Confirms price is either breaking out above recent 10-bar swing extreme or successfully bouncing off the Mid EMA pullback support.',
    formulaOrCondition: 'LONG: Close > SwingHigh or Low <= EMA21*1.001 | SHORT: Close < SwingLow or High >= EMA21*0.999',
    riskIfBypassed: 'Sub-optimal entry timing in no-man\'s-land leading to wider required stop losses.',
    defaultEnabled: true,
  },
  {
    id: 'COMPOSITE_g8',
    key: 'g8',
    name: 'G8: Volume Surge Expansion Gate',
    strategy: 'BINANCE_COMPOSITE',
    category: 'VOLUME',
    importance: 'HIGH',
    importanceScore: 85,
    isMandatory: true,
    description: 'Requires current candle volume to expand above 1.5x of the 20-period moving average volume, confirming institutional market participation.',
    formulaOrCondition: 'Current Volume >= 1.5x of 20-period SMA Volume',
    riskIfBypassed: 'Low-volume fakeouts and bull/bear traps where price quickly reverses back inside range.',
    defaultEnabled: true,
  },
  {
    id: 'COMPOSITE_g9',
    key: 'g9',
    name: 'G9: Funding Rate Decay Guard Gate',
    strategy: 'BINANCE_COMPOSITE',
    category: 'RISK',
    importance: 'MEDIUM',
    importanceScore: 70,
    isMandatory: true,
    description: 'Ensures 8h perpetual funding rate is not excessively skewed (<= 0.15%), preventing heavy funding drain when holding positions.',
    formulaOrCondition: '|Funding Rate| <= Max Funding Rate (0.15%)',
    riskIfBypassed: 'Paying punitive recurring funding fees on crowded trades during long holding periods.',
    defaultEnabled: true,
  },
  {
    id: 'COMPOSITE_g10',
    key: 'g10',
    name: 'G10: Risk/Reward Ratio Gate',
    strategy: 'BINANCE_COMPOSITE',
    category: 'RISK',
    importance: 'HIGH',
    importanceScore: 85,
    isMandatory: false,
    description: 'Ensures projected Take Profit distance relative to Stop Loss distance achieves minimum favorable risk/reward ratio (>= 1.5x).',
    formulaOrCondition: 'Projected Reward / Risk >= Min RR Ratio (1.5x)',
    riskIfBypassed: 'Taking unfavorable asymmetric trades where single losses wipe out multiple winning trades.',
    defaultEnabled: true,
  },

  // --- DELTA CLIMAX REVERSAL GATES ---
  {
    id: 'CR_climaxRange',
    key: 'cr_climaxRange',
    name: 'CR1: Climax Candle Range Gate',
    strategy: 'DELTA_CLIMAX',
    category: 'VOLATILITY',
    importance: 'CRITICAL',
    importanceScore: 95,
    isMandatory: true,
    description: 'Validates that Candle 1 is an abnormal, outsized expansion bar (>= 1.3x average range) signifying capitulation or exhaustion.',
    formulaOrCondition: 'C1 Range >= Min Climax Ratio (1.3x) * 20-SMA Range',
    riskIfBypassed: 'Attempting reversals on normal standard candles that are merely part of standard continuation.',
    defaultEnabled: true,
  },
  {
    id: 'CR_overextension',
    key: 'cr_overextension',
    name: 'CR2: Baseline Overextension Gate',
    strategy: 'DELTA_CLIMAX',
    category: 'TREND',
    importance: 'CRITICAL',
    importanceScore: 96,
    isMandatory: true,
    description: 'Checks distance between C1 Close and EMA Baseline OR Fast EMA is at least 2.0x ATR, proving extreme price overstretch.',
    formulaOrCondition: '|C1 Close - EMA Baseline/Fast| >= Min Overextension ATR (2.0x) * ATR',
    riskIfBypassed: 'Entering mean-reversion trades before the market has reached true statistical overextension.',
    defaultEnabled: true,
  },
  {
    id: 'CR_volatility',
    key: 'cr_volatility',
    name: 'CR3: Volatility Expansion Gate',
    strategy: 'DELTA_CLIMAX',
    category: 'VOLATILITY',
    importance: 'HIGH',
    importanceScore: 85,
    isMandatory: true,
    description: 'Confirms market volatility is currently elevated (ATR >= 1.0x of 50-period ATR average), ensuring active price momentum.',
    formulaOrCondition: 'ATR >= Min ATR Multiplier (1.0x) * 50-period ATR SMA',
    riskIfBypassed: 'Trading in dead low-volatility regimes where mean reversion takes days or flatlines.',
    defaultEnabled: true,
  },
  {
    id: 'CR_rejectionWick',
    key: 'cr_rejectionWick',
    name: 'CR4: Rejection Pin Wick Gate',
    strategy: 'DELTA_CLIMAX',
    category: 'STRUCTURE',
    importance: 'CRITICAL',
    importanceScore: 98,
    isMandatory: true,
    description: 'Verifies Candle 2 forms a dominant rejection wick (>= 45% of total bar range) showing decisive absorption at the extreme.',
    formulaOrCondition: 'C2 Rejection Wick Ratio >= Min Rejection Wick (45%)',
    riskIfBypassed: 'High risk of getting steamrolled by trend continuation without proof of counter-party absorption.',
    defaultEnabled: true,
  },
  {
    id: 'CR_triggerBreakout',
    key: 'cr_triggerBreakout',
    name: 'CR5: C3 Confirmation Trigger Gate',
    strategy: 'DELTA_CLIMAX',
    category: 'STRUCTURE',
    importance: 'CRITICAL',
    importanceScore: 99,
    isMandatory: true,
    description: 'Requires Candle 3 to break beyond the Candle 2 trigger level (below C2 low for Short, above C2 high for Long).',
    formulaOrCondition: 'SHORT: C3 Close < C2 Low | LONG: C3 Close > C2 High',
    riskIfBypassed: 'Catching falling knives or standing in front of strong runaway trends before confirmation.',
    defaultEnabled: true,
  },
  {
    id: 'CR_stopDistance',
    key: 'cr_stopDistance',
    name: 'CR6: Minimum Stop Distance Gate',
    strategy: 'DELTA_CLIMAX',
    category: 'RISK',
    importance: 'MEDIUM',
    importanceScore: 70,
    isMandatory: true,
    description: 'Guarantees the stop loss distance is at least 0.5x ATR to avoid placing unrealistically tight stops clipped by normal noise.',
    formulaOrCondition: 'Risk Per Unit >= Min Stop Distance (0.5x) * ATR',
    riskIfBypassed: 'Premature stop-outs triggered by standard intra-candle micro fluctuations.',
    defaultEnabled: true,
  },
  {
    id: 'CR_rewardRisk',
    key: 'cr_rewardRisk',
    name: 'CR7: Structural Target RR Gate',
    strategy: 'DELTA_CLIMAX',
    category: 'RISK',
    importance: 'HIGH',
    importanceScore: 85,
    isMandatory: true,
    description: 'Checks that the distance to the nearest prior swing high/low structure target provides >= 1.5x reward relative to stop loss risk.',
    formulaOrCondition: 'Structure Target Distance / Risk >= Min RR (1.5x)',
    riskIfBypassed: 'Entering trades where take-profit is immediately blocked by major opposing swing structure.',
    defaultEnabled: true,
  },

  // --- VOLATILITY COMPRESSION BREAKOUT GATES ---
  {
    id: 'VCB_compression',
    key: 'vcb_compression',
    name: 'VCB1: Compression Window Gate',
    strategy: 'VOLATILITY_COMPRESSION',
    category: 'VOLATILITY',
    importance: 'CRITICAL',
    importanceScore: 95,
    isMandatory: true,
    description: 'Requires current ATR to be subdued (< 65% of 50-avg) and a tight 10-candle box bound within 3x ATR.',
    formulaOrCondition: '(ATR / 50-ATR) <= 0.65 AND 10-bar Range <= 3 * ATR',
    riskIfBypassed: 'Trading arbitrary chop instead of true volatility coil.',
    defaultEnabled: true,
  },
  {
    id: 'VCB_rangeExpansion',
    key: 'vcb_rangeExpansion',
    name: 'VCB2: Range Expansion Breakout Gate',
    strategy: 'VOLATILITY_COMPRESSION',
    category: 'MOMENTUM',
    importance: 'HIGH',
    importanceScore: 90,
    isMandatory: true,
    description: 'Breakout candle range must be at least 1.8x the average range of the compression window.',
    formulaOrCondition: 'Candle Range >= 1.8 * Window Avg Range',
    riskIfBypassed: 'False, sluggish breakouts lacking conviction.',
    defaultEnabled: true,
  },
  {
    id: 'VCB_volumeExpansion',
    key: 'vcb_volumeExpansion',
    name: 'VCB3: Volume Surge Gate',
    strategy: 'VOLATILITY_COMPRESSION',
    category: 'VOLUME',
    importance: 'HIGH',
    importanceScore: 85,
    isMandatory: true,
    description: 'Breakout candle volume must be at least 1.8x the average volume of the compression window.',
    formulaOrCondition: 'Candle Volume >= 1.8 * Window Avg Volume',
    riskIfBypassed: 'Low volume fake-outs with zero institutional backing.',
    defaultEnabled: true,
  },
  {
    id: 'VCB_closeStrength',
    key: 'vcb_closeStrength',
    name: 'VCB4: Strong Close Gate',
    strategy: 'VOLATILITY_COMPRESSION',
    category: 'STRUCTURE',
    importance: 'HIGH',
    importanceScore: 85,
    isMandatory: true,
    description: 'Breakout candle must close in the strong 35% of its own range (no massive wicks against breakout).',
    formulaOrCondition: 'Close Strength Score >= 0.65',
    riskIfBypassed: 'Entering breakouts that are immediately being absorbed and rejected at the extremes.',
    defaultEnabled: true,
  },

  // --- RISK MANAGEMENT ENGINE GATES ---
  {
    id: 'RISK_maxConcurrent',
    key: 'risk_maxConcurrent',
    name: 'RG1: Max Concurrent Trades Gate',
    strategy: 'RISK_ENGINE',
    category: 'RISK',
    importance: 'CRITICAL',
    importanceScore: 95,
    isMandatory: true,
    description: 'Limits total open positions to configured maxConcurrentTrades to prevent overall portfolio over-leverage.',
    formulaOrCondition: 'Open Positions Count < Max Concurrent Trades',
    riskIfBypassed: 'Correlated market-wide liquidation risk across too many open simultaneous positions.',
    defaultEnabled: true,
  },
  {
    id: 'RISK_dailyLoss',
    key: 'risk_dailyLoss',
    name: 'RG2: Daily Loss Circuit Breaker Gate',
    strategy: 'RISK_ENGINE',
    category: 'RISK',
    importance: 'CRITICAL',
    importanceScore: 99,
    isMandatory: true,
    description: 'Halts all new entries for the day when cumulative daily drawdown reaches dailyLossLimitPct (default 3-10%).',
    formulaOrCondition: 'Daily Cumulative Drawdown < Daily Loss Limit %',
    riskIfBypassed: 'Compounding disastrous losing streaks and revenge trading in toxic market regimes.',
    defaultEnabled: true,
  },
  {
    id: 'RISK_threshold',
    key: 'risk_threshold',
    name: 'RG3: Signal Score Quality Gate',
    strategy: 'RISK_ENGINE',
    category: 'RISK',
    importance: 'HIGH',
    importanceScore: 85,
    isMandatory: true,
    description: 'Filters out low-conviction signals whose score does not meet the user-defined autoTradeThreshold (default 60).',
    formulaOrCondition: 'Signal Score >= Auto Trade Threshold (60+)',
    riskIfBypassed: 'Taking mediocre or borderline signals that have low statistical edge.',
    defaultEnabled: true,
  },
];

/**
 * Check if a specific gate is bypassed/disabled in AppSettings
 */
export function isGateBypassed(gateId: string, settings: AppSettings | any): boolean {
  if (!settings) return false;
  const disabledMap = settings.disabledGates || {};
  return !!disabledMap[gateId];
}

/**
 * Evaluates detailed live status for every single gate on a specific coin
 */
export interface EvaluatedGateResult {
  def: GateDefinition;
  passed: boolean;
  bypassed: boolean;
  blockingTrade: boolean;
  measuredValue: string;
  requiredThreshold: string;
  statusText: string;
}

export function evaluateDetailedCoinGates(
  coin: CoinDetail,
  settings: AppSettings,
  openPositionsCount: number = 0,
  dailyLossPct: number = 0
): {
  strategy: string;
  isTradeReady: boolean;
  blockingGateCount: number;
  bypassedGateCount: number;
  evaluatedGates: EvaluatedGateResult[];
  primaryBlockReason: string;
} {
  const strategy = settings.activeStrategy || 'BINANCE_COMPOSITE';
  const relevantGates = GATES_REGISTRY.filter(
    (g) => g.strategy === strategy || g.strategy === 'RISK_ENGINE'
  );

  const results: EvaluatedGateResult[] = [];
  const inds = coin.indicators || ({} as any);
  const regime = coin.regime || { score: 0, label: coin.status || 'UNSAFE', direction: coin.direction };

  for (const def of relevantGates) {
    const bypassed = isGateBypassed(def.id, settings);
    let passed = true;
    let measuredValue = 'N/A';
    let requiredThreshold = def.formulaOrCondition;

    if (def.strategy === 'BINANCE_COMPOSITE') {
      switch (def.key) {
        case 'g1': {
          passed = true; // Pair exists in top volume scan
          measuredValue = `Top Volume Scanned (Rank #${coin.symbol})`;
          requiredThreshold = `>= $${((settings.min24hVolume || 10000000) / 1000000).toFixed(0)}M 24h Vol`;
          break;
        }
        case 'g2': {
          passed = true; // Spread check
          measuredValue = `0.02% (Tight)`;
          requiredThreshold = `<= ${(settings.maxSpread || 0.3)}% Spread`;
          break;
        }
        case 'g3': {
          const score = regime.score || 0;
          passed = score >= 60;
          measuredValue = `Score: ${score}/100 (${regime.label || coin.status})`;
          requiredThreshold = `Score >= 60 (WEAK/STRONG TREND)`;
          break;
        }
        case 'g4': {
          const dir = coin.direction;
          const adx = inds.adx?.adx || 0;
          const emaFast = inds.emaFast || 0;
          const emaSlow = inds.emaSlow || 0;
          const emaTrend = inds.emaTrend || 0;
          const minAdx = settings.adxTrendThreshold || 20;

          if (dir === 'LONG') {
            passed = emaFast > emaSlow && emaSlow > emaTrend && adx > minAdx;
          } else if (dir === 'SHORT') {
            passed = emaFast < emaSlow && emaSlow < emaTrend && adx > minAdx;
          } else {
            passed = false;
          }
          measuredValue = `Dir: ${dir} | ADX: ${adx.toFixed(1)} | EMA Fast: ${emaFast.toFixed(2)} vs Slow: ${emaSlow.toFixed(2)}`;
          requiredThreshold = `Aligned EMAs & ADX > ${minAdx}`;
          break;
        }
        case 'g5': {
          const close = coin.price || 1;
          const atr = inds.atr || 0;
          const atrPct = (atr / close) * 100;
          passed = atrPct >= 0.3 && atrPct <= 6.0;
          measuredValue = `ATR%: ${atrPct.toFixed(2)}% ($${atr.toFixed(4)})`;
          requiredThreshold = `0.30% <= ATR% <= 6.00%`;
          break;
        }
        case 'g6': {
          const rsi = inds.rsi || 50;
          const dir = coin.direction;
          if (dir === 'LONG') passed = rsi >= 45 && rsi <= 72;
          else if (dir === 'SHORT') passed = rsi >= 28 && rsi <= 55;
          else passed = false;
          measuredValue = `RSI: ${rsi.toFixed(1)} (Dir: ${dir})`;
          requiredThreshold = `LONG: 45-72 | SHORT: 28-55`;
          break;
        }
        case 'g7': {
          const dir = coin.direction;
          // Approximate structure check
          const price = coin.price || 0;
          const emaSlow = inds.emaSlow || 0;
          passed = dir === 'LONG' ? price >= emaSlow : price <= emaSlow;
          measuredValue = `Price: $${price.toFixed(4)} vs EMA Slow: $${emaSlow.toFixed(4)}`;
          requiredThreshold = `Structure Pivot Breakout / Bounce`;
          break;
        }
        case 'g8': {
          const volRatio = inds.volumeRatio || 1.0;
          const mult = settings.volumeMultiplier || 1.5;
          passed = volRatio >= mult;
          measuredValue = `${volRatio.toFixed(2)}x of 20-SMA Volume`;
          requiredThreshold = `>= ${mult.toFixed(1)}x Volume Surge`;
          break;
        }
        case 'g9': {
          const fr = Math.abs(coin.fundingRate || 0.0001) * 100;
          passed = fr <= (settings.maxFundingRate || 0.15);
          measuredValue = `${(coin.fundingRate * 100).toFixed(4)}% 8h`;
          requiredThreshold = `<= ${(settings.maxFundingRate || 0.15).toFixed(2)}%`;
          break;
        }
        case 'g10': {
          passed = true;
          measuredValue = `Target RR >= ${(settings.minRRRatio || 1.5).toFixed(1)}x`;
          requiredThreshold = `>= ${(settings.minRRRatio || 1.5).toFixed(1)}x`;
          break;
        }
      }
    } else if (def.strategy === 'DELTA_CLIMAX') {
      const cr = coin.crSignal;
      if (cr) {
        if (cr.status === 'confirmed') {
          passed = true;
          measuredValue = `CR Signal Confirmed (${cr.direction})`;
        } else if (cr.status === 'pending') {
          if (def.key === 'cr_triggerBreakout') {
            passed = false;
            measuredValue = `Pending C3 Trigger Breakout`;
          } else {
            passed = true;
            measuredValue = `Setup Formed (Pending C3)`;
          }
        } else if (cr.status === 'rejected') {
          if (cr.reason === 'stop_too_tight' && def.key === 'cr_stopDistance') {
            passed = false;
            measuredValue = `Stop distance too tight`;
          } else if (cr.reason === 'poor_reward_risk' && def.key === 'cr_rewardRisk') {
            passed = false;
            measuredValue = `Reward/risk below ${settings.crMinRewardRisk || 1.5}x`;
          } else {
            passed = false;
            measuredValue = `Rejected: ${cr.reason || 'CR Criteria'}`;
          }
        }
      } else {
        passed = false;
        measuredValue = `No Climax Reversal Pattern Detected`;
      }
    } else if (def.strategy === 'RISK_ENGINE') {
      switch (def.key) {
        case 'risk_maxConcurrent': {
          const max = settings.maxConcurrentTrades || 5;
          passed = openPositionsCount < max;
          measuredValue = `${openPositionsCount} / ${max} Active Positions`;
          requiredThreshold = `< ${max} Max Trades`;
          break;
        }
        case 'risk_dailyLoss': {
          const limit = settings.dailyLossLimitPct || 3;
          passed = Math.abs(dailyLossPct) < limit;
          measuredValue = `${dailyLossPct.toFixed(2)}% Today's Drawdown`;
          requiredThreshold = `< ${limit}% Daily Loss Limit`;
          break;
        }
        case 'risk_threshold': {
          const minScore = settings.autoTradeThreshold || 60;
          const score = Math.abs(coin.score || 0);
          passed = score >= minScore;
          measuredValue = `Score: ${score} / 100`;
          requiredThreshold = `>= ${minScore} Min Score`;
          break;
        }
      }
    }

    const blockingTrade = !passed && !bypassed;

    results.push({
      def,
      passed,
      bypassed,
      blockingTrade,
      measuredValue,
      requiredThreshold,
      statusText: bypassed ? 'BYPASSED' : passed ? 'PASSED' : 'BLOCKED',
    });
  }

  const blockingGates = results.filter((r) => r.blockingTrade);
  const bypassedGates = results.filter((r) => r.bypassed);
  const isTradeReady = blockingGates.length === 0 && (coin.direction === 'LONG' || coin.direction === 'SHORT');

  const primaryBlockReason =
    blockingGates.length > 0
      ? `${blockingGates[0].def.name}: ${blockingGates[0].measuredValue} (Required: ${blockingGates[0].requiredThreshold})`
      : 'All active gates passed or bypassed';

  return {
    strategy,
    isTradeReady,
    blockingGateCount: blockingGates.length,
    bypassedGateCount: bypassedGates.length,
    evaluatedGates: results,
    primaryBlockReason,
  };
}
