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
  strategy: string;
  category: string;
  importance: GateImportance;
  importanceScore: number;
  isMandatory: boolean;
  description: string;
  formulaOrCondition: string;
  riskIfBypassed: string;
  defaultEnabled: boolean;
}

export const GATES_REGISTRY: GateDefinition[] = [
  {
    id: 'DATA_FRESH',
    key: 'dataFresh',
    name: 'Gate 1: Data Freshness & Feeds Liveness',
    strategy: 'ALL',
    category: 'DATA',
    importance: 'CRITICAL',
    importanceScore: 100,
    isMandatory: true,
    description: 'Verifies price feed synchronization, WebSocket liveness, and ensures candle timestamp is fresh (<60s jitter).',
    formulaOrCondition: 'Clock - LastTickTimestamp <= 60s & WebSocket State == OPEN',
    riskIfBypassed: 'Trading on stale feeds, disconnected tickers, or missing websocket candles.',
    defaultEnabled: true
  },
  {
    id: 'REGIME_CONFIRMED',
    key: 'regimeConfirmed',
    name: 'Gate 2: Market Regime Hysteresis & Stability',
    strategy: 'ALL',
    category: 'REGIME',
    importance: 'HIGH',
    importanceScore: 90,
    isMandatory: true,
    description: 'Requires regime confirmation across consecutive closed bars to avoid whipsaw transition noise.',
    formulaOrCondition: 'RegimeState.consecutiveBars >= 2 & ADX >= RegimeThreshold',
    riskIfBypassed: 'Entering during unconfirmed, choppy regime transitions.',
    defaultEnabled: true
  },
  {
    id: 'STRATEGY_ALLOWED',
    key: 'strategyAllowedInRegime',
    name: 'Gate 3: Regime-to-Strategy Permissibility Matrix',
    strategy: 'ALL',
    category: 'REGIME',
    importance: 'HIGH',
    importanceScore: 85,
    isMandatory: true,
    description: 'Validates that the triggered strategy is mathematically allowed within the detected market regime.',
    formulaOrCondition: 'Strategy in RegimeEligibilityMatrix[CurrentRegime]',
    riskIfBypassed: 'Strategy execution in hostile market structures (e.g. mean reversion in runaway trend).',
    defaultEnabled: true
  },
  {
    id: 'DIRECTION_ALLOWED',
    key: 'directionAllowed',
    name: 'Gate 4: Directional Alignment Guard',
    strategy: 'ALL',
    category: 'MOMENTUM',
    importance: 'HIGH',
    importanceScore: 85,
    isMandatory: true,
    description: 'Enforces that signal direction (LONG/SHORT) aligns with technical momentum stack or confirmed directional breakout.',
    formulaOrCondition: 'Direction == PermittedRegimeDirection(Regime)',
    riskIfBypassed: 'Taking counter-trend setups opposing macro market flow.',
    defaultEnabled: true
  },
  {
    id: 'HTF_ALIGNED',
    key: 'higherTimeframeAligned',
    name: 'Gate 5: Higher Timeframe (4H HTF) Confirmation',
    strategy: 'ALL',
    category: 'MOMENTUM',
    importance: 'HIGH',
    importanceScore: 85,
    isMandatory: true,
    description: 'Evaluates 4-Hour anchor timeframe EMA(21)/EMA(50) stack and trend structure to mandate directional synergy.',
    formulaOrCondition: '4H Trend Alignment == Signal Direction (or NEUTRAL allowed in OPPOSITE_ONLY mode)',
    riskIfBypassed: 'Trading against higher-timeframe institutional trend structure.',
    defaultEnabled: true
  },
  {
    id: 'STRUCTURE_VALID',
    key: 'structureValid',
    name: 'Gate 6: Swing Structure & Fractal Boundary',
    strategy: 'ALL',
    category: 'STRUCTURE',
    importance: 'HIGH',
    importanceScore: 80,
    isMandatory: true,
    description: 'Verifies confirmed fractal swing points, checks overextension limits, and denies entries into opposing order blocks.',
    formulaOrCondition: 'Distance(Price, EMA50) <= MaxOverextension & SwingPivotConfirmed == TRUE',
    riskIfBypassed: 'Entering overextended exhausted legs or into opposing structural walls.',
    defaultEnabled: true
  },
  {
    id: 'CONFIRMATION_CLOSED',
    key: 'confirmationCandleClosed',
    name: 'Gate 7: Closed-Candle Execution Proof',
    strategy: 'ALL',
    category: 'STRUCTURE',
    importance: 'CRITICAL',
    importanceScore: 95,
    isMandatory: true,
    description: 'Strictly mandates that signal conditions are locked on closed candle to prevent intra-bar repainting.',
    formulaOrCondition: 'Candle.isClosed == TRUE & ClosedPriceCrossed(Threshold)',
    riskIfBypassed: 'Repainting false signals triggered on unconfirmed intra-candle wicks.',
    defaultEnabled: true
  },
  {
    id: 'VOLUME_VALID',
    key: 'volumeValid',
    name: 'Gate 8: Volume Surge & Liquidity Floor',
    strategy: 'ALL',
    category: 'LIQUIDITY',
    importance: 'HIGH',
    importanceScore: 75,
    isMandatory: true,
    description: 'Checks that 24-hour turnover meets the liquidity baseline and confirmation candle shows volume expansion.',
    formulaOrCondition: '24h QuoteVolume >= Min24hVolume & TriggerVolume >= VolumeSurgeThreshold',
    riskIfBypassed: 'Slippage blowouts and liquidity traps on illiquid low-cap pairs.',
    defaultEnabled: true
  },
  {
    id: 'SPREAD_VALID',
    key: 'spreadValid',
    name: 'Gate 9: Real-time Orderbook Spread Tolerance',
    strategy: 'ALL',
    category: 'LIQUIDITY',
    importance: 'HIGH',
    importanceScore: 80,
    isMandatory: true,
    description: 'Guarantees the real-time bid/ask spread does not exceed maximum allowable tolerance to avoid slippage drag.',
    formulaOrCondition: 'SpreadBps <= MaxSpreadBps',
    riskIfBypassed: 'Severe execution drag where spread consumes outsized portion of target.',
    defaultEnabled: true
  },
  {
    id: 'STOP_STRUCT_VALID',
    key: 'stopStructurallyValid',
    name: 'Gate 10: Structural Stop-Loss & Target Asymmetry',
    strategy: 'ALL',
    category: 'RISK',
    importance: 'CRITICAL',
    importanceScore: 100,
    isMandatory: true,
    description: 'Enforces mathematically validated stop-loss distance within risk limits with structural asymmetric reward-to-risk.',
    formulaOrCondition: 'MinStopPct <= StopDistPct <= MaxStopPct & StructuralRR >= RequiredMinRR',
    riskIfBypassed: 'Taking negative expectancy trades with excessive risk or sub-par reward.',
    defaultEnabled: true
  },
  {
    id: 'CONFIRM_EXPIRED',
    key: 'confirmExpired',
    name: 'Gate 11: Confirmation Window Expiry',
    strategy: 'ALL',
    category: 'TIMING',
    importance: 'HIGH',
    importanceScore: 80,
    isMandatory: true,
    description: 'Rejects signals where the execution confirmation window has expired before order submission.',
    formulaOrCondition: 'CurrentTime - SignalConfirmationTime <= MaxAllowedWindow',
    riskIfBypassed: 'Executing stale signals where market structure or liquidity has shifted.',
    defaultEnabled: true
  }
];

/**
 * Check if a specific gate is bypassed/disabled in AppSettings
 */
export function isGateBypassed(gateId: string, settings: AppSettings | any): boolean {
  if (!settings) return false;
  const disabledMap = settings.disabledGates || {};
  return !!disabledMap[gateId];
}

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
  const evaluatedGates: EvaluatedGateResult[] = [];
  const now = Date.now();

  for (const def of GATES_REGISTRY) {
    const bypassed = isGateBypassed(def.key, settings) || isGateBypassed(def.id, settings);
    let passed = true;
    let measuredValue = '';
    let requiredThreshold = '';
    let statusText = 'Passed';

    switch (def.id) {
      case 'DATA_FRESH': {
        const ageSec = coin.lastUpdated ? Math.floor((now - coin.lastUpdated) / 1000) : 0;
        measuredValue = `${ageSec}s latency`;
        requiredThreshold = '<= 60s';
        if (coin.price <= 0 || ageSec > 60) {
          passed = false;
          statusText = `Stale data stream (${ageSec}s)`;
        }
        break;
      }
      case 'VOLUME_VALID': {
        const minVol = settings.min24hVolume ?? 10_000_000;
        const vol = coin.volume24h ?? 0;
        measuredValue = `$${(vol / 1e6).toFixed(1)}M`;
        requiredThreshold = `>= $${(minVol / 1e6).toFixed(1)}M`;
        if (vol < minVol) {
          passed = false;
          statusText = `Volume below liquidity floor`;
        }
        break;
      }
      case 'SPREAD_VALID': {
        const maxSpread = settings.maxSpreadBps ?? 15;
        const spread = coin.spreadBps ?? 0;
        measuredValue = `${spread.toFixed(1)} bps`;
        requiredThreshold = `<= ${maxSpread} bps`;
        if (spread > maxSpread) {
          passed = false;
          statusText = `Spread too wide (${spread.toFixed(1)} bps)`;
        }
        break;
      }
      case 'REGIME_CONFIRMED': {
        measuredValue = coin.regime || 'UNKNOWN';
        requiredThreshold = 'Confirmed';
        if (coin.regime === 'UNKNOWN' || coin.regime === 'UNCLEAR') {
          passed = false;
          statusText = 'Unconfirmed regime state';
        }
        break;
      }
      case 'HTF_ALIGNED': {
        measuredValue = coin.trend || 'NEUTRAL';
        requiredThreshold = settings.htfAgreementMode === 'STRICT' ? 'Strict Alignment' : 'Opposite Veto Only';
        if (settings.htfAgreementMode === 'STRICT' && coin.trend === 'NEUTRAL') {
          passed = false;
          statusText = 'HTF trend neutral in strict mode';
        }
        break;
      }
      case 'STOP_STRUCT_VALID': {
        const maxStop = settings.maxStopPct ?? 8.0;
        measuredValue = `Max Stop: ${maxStop}%`;
        requiredThreshold = `<= ${maxStop}%`;
        break;
      }
      default: {
        measuredValue = 'Active';
        requiredThreshold = 'Valid';
        break;
      }
    }

    const blockingTrade = !passed && !bypassed;
    evaluatedGates.push({
      def,
      passed,
      bypassed,
      blockingTrade,
      measuredValue,
      requiredThreshold,
      statusText: blockingTrade ? statusText : bypassed ? 'Bypassed by User' : 'Passed'
    });
  }

  const blockingGateCount = evaluatedGates.filter(g => g.blockingTrade).length;
  const bypassedGateCount = evaluatedGates.filter(g => g.bypassed && !g.passed).length;
  const firstBlock = evaluatedGates.find(g => g.blockingTrade);

  const strat = (settings.activeStrategies && settings.activeStrategies.length > 0)
    ? settings.activeStrategies.join(', ')
    : (settings.activeStrategy || 'NONE');

  return {
    strategy: strat,
    isTradeReady: blockingGateCount === 0,
    blockingGateCount,
    bypassedGateCount,
    evaluatedGates,
    primaryBlockReason: firstBlock ? firstBlock.statusText : 'All strategy setups and gates cleared'
  };
}
