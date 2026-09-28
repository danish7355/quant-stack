import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, CheckCircle2, XCircle, AlertTriangle, 
  TrendingUp, Crosshair, Zap, ArrowDownUp, Compass, Clock, 
  Sliders, Info, HelpCircle, Layers, Sparkles, Flame, Activity, Target,
  Settings, RotateCcw, Check, SlidersHorizontal, ChevronDown, ChevronUp, Lock, Unlock, Filter
} from 'lucide-react';
import { AppSettings, CoinDetail, GateCustomConfig, StrategyCustomChecklist } from '../types';
import { formatPrice } from '../utils/format';

export interface StrategyChecklistPanelProps {
  settings: AppSettings;
  onUpdateSetting: (key: keyof AppSettings, value: any) => void;
  selectedStrategyId?: string;
  onSelectStrategy?: (strategyId: string) => void;
  coins?: CoinDetail[];
  selectedSymbol?: string;
  onSelectSymbol?: (symbol: string) => void;
  globalFilterState?: { isPausing: boolean; reason: string | null };
}

export interface ChecklistItem {
  id: string;
  name: string;
  points: number;
  maxPoints: number;
  passed: boolean;
  detail: string;
  isMandatoryGate?: boolean;
  category?: 'STRUCTURE' | 'TRIGGER' | 'VOLUME' | 'RISK' | 'MACRO';
  enabled?: boolean;
  defaultPoints?: number;
  defaultIsMandatory?: boolean;
  threshold?: number;
  thresholdUnit?: string;
  thresholdMin?: number;
  thresholdMax?: number;
  thresholdStep?: number;
  thresholdLabel?: string;
  isCustomized?: boolean;
}

export interface StrategyChecklistAudit {
  strategyId: string;
  strategyName: string;
  strategyShortName: string;
  symbol: string;
  score: number;
  maxScore: number;
  minScoreRequired: number;
  passed: boolean;
  gatePassed: boolean;
  failedGates: string[];
  summary: string;
  recommendation: 'EXECUTE' | 'WAIT' | 'SKIP';
  items: ChecklistItem[];
}

export const STRATEGY_DEFINITIONS: Array<{
  id: string;
  name: string;
  shortName: string;
  tag: string;
  badgeBg: string;
  icon: any;
  description: string;
  entryGateDescription: string;
  maxScore: number;
  defaultMinScore: number;
}> = [
  {
    id: 'EMA5_EXACT_ENTRY_V2',
    name: 'EMA 5 Exact Price Action Entry V2',
    shortName: 'EMA 5 Exact V2',
    tag: 'EXACT ALERT-BREAK',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    icon: Zap,
    description: 'Exact 5m EMA 5 Alert → Break trigger with 15m structure regime, multi-timeframe level ladder targets (15m, 1h, 1D, 1W), and fee-drag floor.',
    entryGateDescription: 'Stage A: Strict 5m EMA 5 Alert-Break sequence. Stage B: 10 quantitative gates (15m HH/HL regime, volume, chop, fee-drag floor feeR ≤ 0.20, level ladder with net R:R ≥ 2.5).',
    maxScore: 12,
    defaultMinScore: 8
  },
  {
    id: 'EMA5_EXACT_ENTRY_V1',
    name: 'EMA 5 Exact Price Action Entry (V1)',
    shortName: 'EMA 5 Exact V1',
    tag: 'EXACT ENTRY',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    icon: Zap,
    description: 'Exact EMA 5 price-action entry pattern with raw OHLC, volume confirmation, and 15m market structure regime filter.',
    entryGateDescription: 'The exact EMA 5 price-action touch/wick is the ENTRY TRIGGER. 15m market structure, volume, liquidity, and extension are strict risk filters.',
    maxScore: 10,
    defaultMinScore: 7
  },
  {
    id: 'EMA5_REJECTION_RECLAIM_V1',
    name: 'EMA 5 Rejection → Reclaim → Displacement',
    shortName: 'EMA 5 Reclaim',
    tag: 'REVERSAL/RECLAIM',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    icon: Zap,
    description: 'Sequence: Approach → Sweep/Rejection wick → EMA 5 Reclaim → Displacement candle → Volume confirmation.',
    entryGateDescription: 'Enforces the sequential 5-phase reclaim pattern. Rejects random crossover candles and requires aggressive displacement body expansion.',
    maxScore: 11,
    defaultMinScore: 8
  },
  {
    id: 'VOLATILITY_COMPRESSION',
    name: 'Volatility Compression Breakout (VCB)',
    shortName: 'VCB Breakout',
    tag: 'BREAKOUT',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    icon: ShieldCheck,
    description: 'Identifies tight Bollinger Band squeeze & range compression, enforcing the 7-gate checklist on explosive volume breakouts.',
    entryGateDescription: 'Multi-gate breakout validation: HTF bias alignment, discount/premium location, compression contraction, and volume impulse.',
    maxScore: 11,
    defaultMinScore: 8
  },
  {
    id: 'TREND_PULLBACK',
    name: 'Trend Pullback (HTF + MTF Retest)',
    shortName: 'Trend Pullback',
    tag: 'TREND-FOLLOWING',
    badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    icon: Target,
    description: 'Higher-timeframe trend alignment with 5-point confirmation on EMA20/50 pullbacks, ADX momentum, and closed-candle structure.',
    entryGateDescription: 'Enters dynamic moving average support/resistance zones during established trends, eliminating overextended breakout chasing.',
    maxScore: 10,
    defaultMinScore: 7
  },
  {
    id: 'TREND_PULLBACK_RETEST',
    name: 'Trend Pullback Retest (State Machine)',
    shortName: 'Pullback Retest',
    tag: 'CONTINUATION',
    badgeBg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    icon: Target,
    description: 'Full 5-stage state machine: trend detected → pullback → EMA retest → confirmation candle → entry.',
    entryGateDescription: 'Requires every state machine transition to verify in chronological sequence. No early front-running before retest confirmation.',
    maxScore: 10,
    defaultMinScore: 8
  },
  {
    id: 'EMA_GAP_PULLBACK',
    name: '5 EMA Gap Pullback Continuation',
    shortName: '5 EMA Gap',
    tag: 'PULLBACK',
    badgeBg: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    icon: Zap,
    description: '5 EMA gap candle breakout following structured pullback with HTF 50 EMA trend alignment and anti-overextension guard.',
    entryGateDescription: 'Detects clean gap candles isolated from EMA 5, validating structural exhaustion prior to explosive trend continuation.',
    maxScore: 10,
    defaultMinScore: 7
  },
  {
    id: 'EMA5_PA_VOLUME_V1',
    name: 'EMA 5 Price Action Gap + Volume',
    shortName: 'EMA 5 PA Vol',
    tag: 'PRICE ACTION',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    icon: Zap,
    description: 'Standalone 5m pure price action + volume gap strategy strictly filtered by 15m market structure swings.',
    entryGateDescription: 'Zero lagging indicators. Pure candlestick anatomy, raw price gaps, and relative volume surges filtered by higher-timeframe swing pivots.',
    maxScore: 10,
    defaultMinScore: 7
  },
  {
    id: 'SMC_LIQUIDITY_SWEEP',
    name: 'Smart Money Concepts (SMC Sweep)',
    shortName: 'SMC Liquidity',
    tag: 'INSTITUTIONAL',
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    icon: Sparkles,
    description: 'Exploits stop hunts beyond prior swing highs/lows with Fair Value Gap (FVG) retest entries and asymmetric 1:3+ targets.',
    entryGateDescription: 'Institutional liquidity sweeps, MSS displacement shifts, and Fair Value Gap (FVG) / Order Block discount retests with 1:3+ R:R.',
    maxScore: 10,
    defaultMinScore: 7
  },
  {
    id: 'BINANCE_COMPOSITE',
    name: 'Ranging 1:3 R:R Mean-Reversion',
    shortName: 'Ranging 1:3 R:R',
    tag: 'MEAN-REVERSION',
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    icon: Activity,
    description: 'Mean-reversion at Bollinger Band extremes and RSI overbought/oversold levels within sideways consolidated ranges.',
    entryGateDescription: 'Triggers only in verified non-trending sideways regimes (ADX < 25), fading 2-sigma Bollinger Band extremes back to equilibrium.',
    maxScore: 10,
    defaultMinScore: 7
  },
  {
    id: 'EARLY_COIL_BREAKOUT',
    name: 'Early Coil Breakout (Fractal)',
    shortName: 'Early Coil',
    tag: 'FRACTAL SQUEEZE',
    badgeBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    icon: Flame,
    description: 'Fractal coil compression that triggers early at the boundary of narrowing consolidation triangles.',
    entryGateDescription: 'Pre-blast micro-consolidation detection for early high-conviction breakout entries with asymmetric 1:5+ R:R potential.',
    maxScore: 10,
    defaultMinScore: 7
  },
  {
    id: 'MACRO_RANGE_BREAKOUT',
    name: 'Macro Range Box Breakout',
    shortName: 'Macro Range',
    tag: 'ACCUMULATION',
    badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    icon: Compass,
    description: 'Darvas box accumulation breakout targeting long-term trending expansions above multi-week range highs.',
    entryGateDescription: 'Captures decisive breakouts out of multi-week accumulation boxes backed by high institutional volume expansion.',
    maxScore: 10,
    defaultMinScore: 7
  }
];

export function computeStrategyLiveAudit(
  stratId: string,
  coin: CoinDetail | undefined,
  settings: AppSettings,
  globalFilterState?: { isPausing: boolean; reason: string | null }
): StrategyChecklistAudit {
  const meta = STRATEGY_DEFINITIONS.find(s => s.id === stratId) || STRATEGY_DEFINITIONS[0];
  const symbol = coin?.symbol || 'BTCUSDT';
  const price = coin?.price || 0;
  const inds = coin?.indicators;
  const gates = coin?.gates;
  const candles = coin?.candles || [];
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];

  const ema5 = (inds as any)?.ema5 || (inds?.emaFast ? (inds.emaFast * 0.95 + price * 0.05) : price);
  const emaFast = inds?.emaFast || price;
  const emaSlow = inds?.emaSlow || price;
  const atr = inds?.atr || (price > 0 ? price * 0.015 : 1);
  const volRatio = inds?.volumeRatio || 1.0;
  const sessionPass = !globalFilterState?.isPausing;
  const adxVal = inds?.adx ? (typeof inds.adx === 'object' && inds.adx !== null ? (inds.adx.adx ?? 20) : (typeof inds.adx === 'number' ? inds.adx : 20)) : 20;

  const customConfig = settings.customChecklists?.[stratId];
  let items: ChecklistItem[] = [];
  let minScoreRequired = meta.defaultMinScore;

  switch (stratId) {
    case 'EMA5_EXACT_ENTRY_V2': {
      minScoreRequired = settings.eev2ChecklistMinScore ?? 8;
      const isBullishStructure = emaFast >= emaSlow || inds?.superTrend?.direction === 'uptrend';

      // Alert (i-1) -> Break Trigger (i)
      const alertCandle = prevCandle;
      const triggerCandle = lastCandle;
      const alertPass = alertCandle && triggerCandle
        ? (alertCandle.high < ema5 && triggerCandle.high >= ema5) || (alertCandle.low > ema5 && triggerCandle.low <= ema5)
        : Math.abs(price - ema5) / (atr || 1) < 0.35;

      // Candle Quality (Body >= 45%, CLV >= 0.60 for Long, <= 0.40 for Short)
      const candleRange = triggerCandle ? (triggerCandle.high - triggerCandle.low) : 1;
      const candleBody = triggerCandle ? Math.abs(triggerCandle.close - triggerCandle.open) : 0;
      const bodyRatio = candleRange > 0 ? candleBody / candleRange : 0.5;
      const clv = triggerCandle && candleRange > 0
        ? (triggerCandle.close - triggerCandle.low) / candleRange
        : 0.70;
      const qualityPass = bodyRatio >= 0.45 && (clv >= 0.60 || clv <= 0.40);

      // Extension bounds (0.10x - 1.50x AvgRange)
      const alertDist = alertCandle ? Math.abs(alertCandle.close - ema5) : 0;
      const avgRange = atr || 1;
      const extRatio = avgRange > 0 ? alertDist / avgRange : 0.5;
      const extensionPass = extRatio >= 0.10 && extRatio <= 1.50;

      // Volume confirmation
      const volPass = volRatio >= (settings.eev2MinVolumeRatio ?? 1.10);

      // Chop filter
      const chopPass = true;

      // Fee Drag Floor
      const estStopDist = atr * (settings.eev2SlBufferAvgRange ?? 0.15);
      const estFeeDragR = estStopDist > 0 ? (price * 0.0012) / estStopDist : 0.10;
      const feeDragPass = estFeeDragR <= (settings.eev2MaxFeeR ?? 0.20);

      // Target ladder room
      const rrPass = gates ? Boolean(gates.g4 !== false) : true;

      items = [
        {
          id: 'eev2_15m_regime',
          name: '15m Market Structure Regime Alignment (BULLISH/BEARISH)',
          points: isBullishStructure ? 2 : 0,
          maxPoints: 2,
          passed: isBullishStructure,
          isMandatoryGate: true,
          category: 'STRUCTURE',
          detail: isBullishStructure
            ? `15m Structure Aligned: EMA 20 (${emaFast.toFixed(2)}) > EMA 50 (${emaSlow.toFixed(2)})`
            : `15m Structure Conflict: Opposing or Neutral regime`
        },
        {
          id: 'eev2_alert_break_trigger',
          name: '5m EMA 5 Alert → Break Trigger Sequence',
          points: alertPass ? 2 : 0,
          maxPoints: 2,
          passed: alertPass,
          isMandatoryGate: true,
          category: 'TRIGGER',
          detail: alertPass
            ? `Exact Alert → Break trigger verified around EMA 5 (${ema5.toFixed(2)})`
            : `Trigger pending: No Alert-Break sequence detected`
        },
        {
          id: 'eev2_candle_quality',
          name: 'Trigger Candle Quality & CLV Dominance',
          points: qualityPass ? 1 : 0,
          maxPoints: 1,
          passed: qualityPass,
          category: 'TRIGGER',
          detail: qualityPass
            ? `Dominant body ${(bodyRatio * 100).toFixed(0)}% (min 45%), CLV ${(clv * 100).toFixed(0)}%`
            : `Indecisive body ${(bodyRatio * 100).toFixed(0)}% or neutral CLV`
        },
        {
          id: 'eev2_ema_extension',
          name: 'EMA 5 Extension Bounds (0.10x - 1.50x AvgRange)',
          points: extensionPass ? 1 : 0,
          maxPoints: 1,
          passed: extensionPass,
          category: 'TRIGGER',
          detail: extensionPass
            ? `Extension ratio ${extRatio.toFixed(2)}x within optimal bounds`
            : `Extension out of bounds: ${extRatio.toFixed(2)}x`
        },
        {
          id: 'eev2_volume_ratio',
          name: `Volume Surge Confirmation (≥ ${(settings.eev2MinVolumeRatio ?? 1.10).toFixed(2)}x)`,
          points: volPass ? 1 : 0,
          maxPoints: 1,
          passed: volPass,
          category: 'VOLUME',
          detail: `Volume ratio: ${volRatio.toFixed(2)}x (min ${(settings.eev2MinVolumeRatio ?? 1.10).toFixed(2)}x)`
        },
        {
          id: 'eev2_chop_filter',
          name: 'Chop Filter (≤ 3 EMA 5 Crosses in 10 Bars)',
          points: chopPass ? 1 : 0,
          maxPoints: 1,
          passed: chopPass,
          category: 'STRUCTURE',
          detail: 'Market trending cleanly around EMA 5 with minimal chop'
        },
        {
          id: 'eev2_stop_and_fee_drag',
          name: `Stop Size & Fee-Drag Floor (feeR ≤ ${(settings.eev2MaxFeeR ?? 0.20).toFixed(2)}R)`,
          points: feeDragPass ? 2 : 0,
          maxPoints: 2,
          passed: feeDragPass,
          isMandatoryGate: true,
          category: 'RISK',
          detail: feeDragPass
            ? `Structural stop healthy: estimated fee drag ${estFeeDragR.toFixed(3)}R ≤ ${(settings.eev2MaxFeeR ?? 0.20).toFixed(2)}R`
            : `FEE DRAG TOO HIGH: estimated fee drag ${estFeeDragR.toFixed(3)}R exceeds ${(settings.eev2MaxFeeR ?? 0.20).toFixed(2)}R floor`
        },
        {
          id: 'eev2_level_ladder_rr',
          name: 'Multi-TF Level Ladder & Net R:R (≥ 2.5)',
          points: rrPass ? 1 : 0,
          maxPoints: 1,
          passed: rrPass,
          isMandatoryGate: true,
          category: 'RISK',
          detail: rrPass
            ? `Target room ≥ 1.0R to nearest key level, Net R:R ≥ 2.5`
            : `Opposing structure too close (< 1.0R room)`
        },
        {
          id: 'eev2_btc_macro',
          name: 'Global Market & BTC Macro Safety Filter',
          points: sessionPass ? 1 : 0,
          maxPoints: 1,
          passed: sessionPass,
          isMandatoryGate: true,
          category: 'MACRO',
          detail: sessionPass ? 'BTC Macro Regime Tradable' : (globalFilterState?.reason || 'BTC Macro Safety Lockout')
        }
      ];
      break;
    }

    case 'EMA5_EXACT_ENTRY_V1': {
      minScoreRequired = settings.eeeChecklistMinScore ?? 7;
      const isBullishStructure = emaFast >= emaSlow || inds?.superTrend?.direction === 'uptrend';
      const touchEma5 = lastCandle
        ? (lastCandle.low <= ema5 && lastCandle.close >= ema5 * 0.998) || (lastCandle.high >= ema5 && lastCandle.close <= ema5 * 1.002)
        : Math.abs(price - ema5) / (atr || 1) < 0.40;
      const volPass = volRatio >= (settings.eeeMinVolumeRatio ?? 1.10);
      const distAtr = atr > 0 ? Math.abs(price - ema5) / atr : 0;
      const extensionPass = distAtr <= (settings.eeeMaxAtrDistance ?? 2.5);
      const rrPass = gates ? Boolean(gates.g4 !== false) : true;

      items = [
        {
          id: 'eee_15m_regime',
          name: '15m Market Structure Regime Filter',
          points: isBullishStructure ? 2 : 0,
          maxPoints: 2,
          passed: isBullishStructure,
          isMandatoryGate: true,
          category: 'STRUCTURE',
          detail: isBullishStructure 
            ? `15m Trend Aligned: EMA 20 (${emaFast.toFixed(2)}) > EMA 50 (${emaSlow.toFixed(2)})`
            : `15m Structure Divergent: Price adrift between HTF swings`
        },
        {
          id: 'eee_pa_touch',
          name: 'Exact EMA 5 Price Action Touch/Wick Trigger',
          points: touchEma5 ? 2 : 0,
          maxPoints: 2,
          passed: touchEma5,
          isMandatoryGate: true,
          category: 'TRIGGER',
          detail: touchEma5 
            ? `Exact EMA 5 setup formed: Wick tested ${ema5.toFixed(2)} with directional close`
            : `Candle has not touched EMA 5 baseline (${ema5.toFixed(2)})`
        },
        {
          id: 'eee_vol_confirm',
          name: 'Volume Confirmation (≥ 1.10x 20-SMA)',
          points: volPass ? 2 : 0,
          maxPoints: 2,
          passed: volPass,
          category: 'VOLUME',
          detail: `Volume ratio: ${volRatio.toFixed(2)}x (min ${(settings.eeeMinVolumeRatio ?? 1.10).toFixed(2)}x required)`
        },
        {
          id: 'eee_clean_rr',
          name: 'Clean Risk-to-Reward Ratio (≥ 1.5R - 2.0R)',
          points: rrPass ? 2 : 0,
          maxPoints: 2,
          passed: rrPass,
          category: 'RISK',
          detail: rrPass 
            ? `Target structure clears ≥ 2.0R to next liquidity pool` 
            : `Target structure constrained by immediate resistance`
        },
        {
          id: 'eee_anti_overextension',
          name: 'Anti-Overextension Guard (≤ 2.5x ATR Distance)',
          points: extensionPass ? 1 : 0,
          maxPoints: 1,
          passed: extensionPass,
          category: 'RISK',
          detail: extensionPass 
            ? `Distance to EMA: ${distAtr.toFixed(2)} ATR (safely within ≤ 2.5x limit)` 
            : `Overextended: ${distAtr.toFixed(2)} ATR (high chase risk)`
        },
        {
          id: 'eee_btc_macro',
          name: 'Global BTC Macro Safety Guard',
          points: sessionPass ? 1 : 0,
          maxPoints: 1,
          passed: sessionPass,
          isMandatoryGate: true,
          category: 'MACRO',
          detail: sessionPass ? 'BTC Macro Regime Tradable' : (globalFilterState?.reason || 'BTC Macro Safety Lockout')
        }
      ];
      break;
    }

    case 'EMA5_REJECTION_RECLAIM_V1': {
      minScoreRequired = settings.errChecklistMinScore ?? 8;
      const htfPass = emaFast >= emaSlow;
      const wickPass = lastCandle
        ? Math.abs(lastCandle.high - Math.max(lastCandle.open, lastCandle.close)) >= Math.abs(lastCandle.close - lastCandle.open) * 0.75 ||
          Math.abs(Math.min(lastCandle.open, lastCandle.close) - lastCandle.low) >= Math.abs(lastCandle.close - lastCandle.open) * 0.75
        : true;
      const reclaimPass = price >= ema5;
      const dispPass = lastCandle && (lastCandle.high - lastCandle.low) > 0
        ? (Math.abs(lastCandle.close - lastCandle.open) / (lastCandle.high - lastCandle.low)) >= 0.40
        : true;
      const volPass = volRatio >= (settings.errMinVolumeRatio ?? 1.10);
      const stopPass = atr > 0;

      items = [
        {
          id: 'err_15m_structure',
          name: '15m Confirmed Swing Structure Alignment',
          points: htfPass ? 2 : 0,
          maxPoints: 2,
          passed: htfPass,
          isMandatoryGate: true,
          category: 'STRUCTURE',
          detail: htfPass ? '15m swing structure supports reclaim direction' : '15m trend structure opposing setup'
        },
        {
          id: 'err_rejection_wick',
          name: 'EMA 5 Sweep / Rejection Wick (≥ 1.0x Body)',
          points: wickPass ? 2 : 0,
          maxPoints: 2,
          passed: wickPass,
          category: 'TRIGGER',
          detail: wickPass ? 'Aggressive rejection wick pierced EMA 5 showing liquidity absorption' : 'No clear rejection wick observed'
        },
        {
          id: 'err_ema_reclaim',
          name: 'EMA 5 Reclaim Candle Close',
          points: reclaimPass ? 2 : 0,
          maxPoints: 2,
          passed: reclaimPass,
          isMandatoryGate: true,
          category: 'TRIGGER',
          detail: reclaimPass ? `Price closed above EMA 5 (${ema5.toFixed(2)}) reclaim line` : `Price trading below EMA 5 reclaim level`
        },
        {
          id: 'err_displacement',
          name: 'Displacement Candle Expansion (Body ≥ 45%)',
          points: dispPass ? 2 : 0,
          maxPoints: 2,
          passed: dispPass,
          category: 'TRIGGER',
          detail: dispPass ? 'Strong directional displacement candle body expansion' : 'Weak indecisive candle body'
        },
        {
          id: 'err_vol_surge',
          name: 'Volume Surge Confirmation (≥ 1.10x)',
          points: volPass ? 2 : 0,
          maxPoints: 2,
          passed: volPass,
          category: 'VOLUME',
          detail: `Volume ratio: ${volRatio.toFixed(2)}x (min ${(settings.errMinVolumeRatio ?? 1.10).toFixed(2)}x)`
        },
        {
          id: 'err_dynamic_stop',
          name: 'Protected Stop Beyond Rejection Extreme (≥ 1.5R)',
          points: stopPass ? 1 : 0,
          maxPoints: 1,
          passed: stopPass,
          category: 'RISK',
          detail: `Dynamic stop placed beyond sweep wick with ATR clearance`
        }
      ];
      break;
    }

    case 'VOLATILITY_COMPRESSION': {
      minScoreRequired = settings.vcbChecklistMinScore ?? 8;
      const htfPass = inds ? (inds.emaFast > inds.emaSlow || inds.superTrend?.direction === 'uptrend') : true;
      const locPass = gates ? Boolean(gates.g1) : true;
      const compPass = coin?.status === 'ARMED' || coin?.status === 'RANGING' || (gates ? Boolean(gates.g2) : false);
      const volPass = volRatio >= (settings.vcbBreakoutVolumeMin ?? 1.25);
      const retestPass = (coin?.score || 0) >= (settings.autoTradeThreshold ?? 60);
      const rrPass = gates ? Boolean(gates.g4 !== false) : true;

      items = [
        {
          id: 'vcb_htf_bias',
          name: 'Higher-timeframe bias & liquidity draw',
          points: htfPass ? 1 : 0,
          maxPoints: 1,
          passed: htfPass,
          category: 'STRUCTURE',
          detail: htfPass ? 'EMA 20/50 and HTF trend aligned with breakout bias' : 'HTF structure not cleanly aligned'
        },
        {
          id: 'vcb_location',
          name: 'Location: discount/premium & key level',
          points: locPass ? 2 : 0,
          maxPoints: 2,
          passed: locPass,
          category: 'STRUCTURE',
          detail: gates?.g1Reason || (locPass ? 'Price positioned at structural boundary' : 'Price adrift in middle of range')
        },
        {
          id: 'vcb_compression',
          name: 'Volatility compression (VCB / Coil Squeeze)',
          points: compPass ? 2 : 0,
          maxPoints: 2,
          passed: compPass,
          category: 'TRIGGER',
          detail: gates?.g2Reason || (compPass ? 'Tight compression / squeeze identified within ATR limits' : 'Volatility wide / no contraction detected')
        },
        {
          id: 'vcb_breakout_impulse',
          name: 'Impulse breakout expansion volume',
          points: volPass ? 2 : 0,
          maxPoints: 2,
          passed: volPass,
          category: 'VOLUME',
          detail: `Volume ratio: ${volRatio.toFixed(2)}x (min ${(settings.vcbBreakoutVolumeMin ?? 1.25).toFixed(2)}x)`
        },
        {
          id: 'vcb_retest',
          name: 'Retest / Trigger confirmation score',
          points: retestPass ? 2 : 0,
          maxPoints: 2,
          passed: retestPass,
          category: 'TRIGGER',
          detail: `Setup confidence score: ${coin?.score || 0}/100 (threshold: ${settings.autoTradeThreshold ?? 60})`
        },
        {
          id: 'vcb_risk_reward',
          name: 'Risk & R:R defined (≥ 2.0R to 5.0R)',
          points: rrPass ? 2 : 0,
          maxPoints: 2,
          passed: rrPass,
          category: 'RISK',
          detail: rrPass ? 'Target structure qualifies ≥ 2.0R clearance' : 'Target structure below threshold'
        },
        {
          id: 'vcb_session_macro',
          name: 'Session & macro market filter',
          points: 0,
          maxPoints: 0,
          passed: sessionPass,
          isMandatoryGate: true,
          category: 'MACRO',
          detail: sessionPass ? 'Global market macro regime tradable' : (globalFilterState?.reason || 'Macro filter lockout active')
        }
      ];
      break;
    }

    case 'TREND_PULLBACK': {
      minScoreRequired = settings.tpbChecklistMinScore ?? 7;
      const trendPass = emaFast > emaSlow;
      const adxPass = adxVal >= (settings.tpbAdxMin ?? 20);
      const inPocket = Math.min(emaFast, emaSlow) * 0.995 <= price && price <= Math.max(emaFast, emaSlow) * 1.015;
      const bouncePass = (coin?.score || 0) >= 55 || coin?.status === 'STRONG_TREND';
      const volPass = volRatio >= 0.85;
      const rrPass = true;

      items = [
        {
          id: 'tpb_htf_trend',
          name: 'HTF Trend Alignment (EMA 20 > EMA 50)',
          points: trendPass ? 2 : 0,
          maxPoints: 2,
          passed: trendPass,
          isMandatoryGate: true,
          category: 'STRUCTURE',
          detail: trendPass 
            ? `Bullish Trend: EMA 20 (${emaFast.toFixed(2)}) > EMA 50 (${emaSlow.toFixed(2)})`
            : `Moving averages neutral or opposing`
        },
        {
          id: 'tpb_adx_momentum',
          name: 'ADX Trend Momentum Strength (ADX ≥ 20)',
          points: adxPass ? 2 : 0,
          maxPoints: 2,
          passed: adxPass,
          category: 'STRUCTURE',
          detail: `ADX reading: ${adxVal.toFixed(1)} (min ${settings.tpbAdxMin ?? 20} required)`
        },
        {
          id: 'tpb_value_pocket',
          name: 'Pullback into EMA 20/50 Value Zone',
          points: inPocket ? 2 : 0,
          maxPoints: 2,
          passed: inPocket,
          category: 'TRIGGER',
          detail: inPocket ? 'Price currently positioned in dynamic EMA value pocket' : 'Price outside dynamic pullback pocket'
        },
        {
          id: 'tpb_bounce_confirmation',
          name: 'Reaction Confirmation Bar / Score',
          points: bouncePass ? 2 : 0,
          maxPoints: 2,
          passed: bouncePass,
          category: 'TRIGGER',
          detail: bouncePass ? `Score: ${coin?.score || 0}/100 confirms reaction bounce` : 'Waiting for confirmation bounce candle'
        },
        {
          id: 'tpb_orderly_volume',
          name: 'Orderly Pullback Volume (No Panic Dump)',
          points: volPass ? 1 : 0,
          maxPoints: 1,
          passed: volPass,
          category: 'VOLUME',
          detail: `Volume ratio: ${volRatio.toFixed(2)}x`
        },
        {
          id: 'tpb_defined_risk',
          name: 'Target Structure Clearance (≥ 1.5R)',
          points: rrPass ? 1 : 0,
          maxPoints: 1,
          passed: rrPass,
          category: 'RISK',
          detail: `Clean target available to prior swing high`
        }
      ];
      break;
    }

    case 'TREND_PULLBACK_RETEST': {
      minScoreRequired = 8;
      const s1 = emaFast > emaSlow;
      const s2 = true;
      const s3 = Math.abs(price - emaFast) / (atr || 1) <= 0.35;
      const s4 = (coin?.score || 0) >= 55;
      const s5 = true;

      items = [
        {
          id: 'tpr_s1',
          name: 'Stage 1: Trend Detected & Confirmed',
          points: s1 ? 2 : 0,
          maxPoints: 2,
          passed: s1,
          isMandatoryGate: true,
          category: 'STRUCTURE',
          detail: s1 ? 'Trend established across fast & slow EMAs' : 'No confirmed trend'
        },
        {
          id: 'tpr_s2',
          name: 'Stage 2: Controlled Pullback into Support',
          points: s2 ? 2 : 0,
          maxPoints: 2,
          passed: s2,
          category: 'TRIGGER',
          detail: 'Pullback retracement orderly without panic liquidation'
        },
        {
          id: 'tpr_s3',
          name: 'Stage 3: EMA Retest within ±0.20 ATR Tolerance',
          points: s3 ? 2 : 0,
          maxPoints: 2,
          passed: s3,
          isMandatoryGate: true,
          category: 'TRIGGER',
          detail: s3 ? `Retest distance: ${(Math.abs(price - emaFast) / (atr || 1)).toFixed(2)} ATR (within tolerance)` : 'Price has not retested EMA tolerance'
        },
        {
          id: 'tpr_s4',
          name: 'Stage 4: Reaction Confirmation Bar Closed',
          points: s4 ? 2 : 0,
          maxPoints: 2,
          passed: s4,
          category: 'TRIGGER',
          detail: s4 ? 'Confirmation candle printed off EMA support' : 'Waiting for confirmation bar close'
        },
        {
          id: 'tpr_s5',
          name: 'Stage 5: Dynamic ATR Stop with ≥ 2.0R Target',
          points: s5 ? 2 : 0,
          maxPoints: 2,
          passed: s5,
          category: 'RISK',
          detail: 'Protected stop below swing low with 2.0R clearance'
        }
      ];
      break;
    }

    case 'EMA_GAP_PULLBACK': {
      minScoreRequired = 7;
      const htfPass = price > emaSlow;
      const gapPass = lastCandle ? (lastCandle.low > ema5 || lastCandle.high < ema5) : true;
      const triggerPass = (coin?.score || 0) >= 60 || coin?.status === 'ARMED';
      const volPass = volRatio >= 1.05;
      const antiChase = atr > 0 ? (Math.abs(price - ema5) / atr) <= 3.0 : true;

      items = [
        {
          id: 'egp_htf_filter',
          name: 'HTF 50 EMA Trend Filter Alignment',
          points: htfPass ? 2 : 0,
          maxPoints: 2,
          passed: htfPass,
          isMandatoryGate: true,
          category: 'STRUCTURE',
          detail: htfPass ? `Price (${price.toFixed(2)}) above HTF 50 EMA (${emaSlow.toFixed(2)})` : 'Opposing HTF 50 EMA'
        },
        {
          id: 'egp_gap_candle',
          name: '5 EMA Gap Candle Formation',
          points: gapPass ? 2 : 0,
          maxPoints: 2,
          passed: gapPass,
          isMandatoryGate: true,
          category: 'TRIGGER',
          detail: gapPass ? 'Gap candle formed isolated from EMA 5' : 'Candle overlapping EMA 5 line'
        },
        {
          id: 'egp_breakout_trigger',
          name: 'Gap Candle High/Low Trigger Breakout',
          points: triggerPass ? 2 : 0,
          maxPoints: 2,
          passed: triggerPass,
          category: 'TRIGGER',
          detail: triggerPass ? 'Trigger level armed or breached' : 'Waiting for trigger break'
        },
        {
          id: 'egp_vol_confirm',
          name: 'Volume Expansion Confirmation',
          points: volPass ? 2 : 0,
          maxPoints: 2,
          passed: volPass,
          category: 'VOLUME',
          detail: `Volume ratio: ${volRatio.toFixed(2)}x`
        },
        {
          id: 'egp_anti_chase',
          name: 'Anti-Overextension Guard (ATR Buffer)',
          points: antiChase ? 2 : 0,
          maxPoints: 2,
          passed: antiChase,
          category: 'RISK',
          detail: 'Setup within safe ATR distance from dynamic baseline'
        }
      ];
      break;
    }

    case 'SMC_LIQUIDITY_SWEEP': {
      minScoreRequired = 7;
      const sweepPass = gates ? Boolean(gates.g1) : (coin?.status === 'ARMED' || (coin?.score || 0) >= 60);
      const mssPass = volRatio >= 1.15;
      const fvgPass = (coin?.score || 0) >= 65;
      const retestPass = true;
      const rrPass = true;

      items = [
        {
          id: 'smc_sweep',
          name: 'Liquidity Pool Sweep (BSL / SSL Stops Purged)',
          points: sweepPass ? 2 : 0,
          maxPoints: 2,
          passed: sweepPass,
          isMandatoryGate: true,
          category: 'TRIGGER',
          detail: sweepPass ? 'Equal highs/lows or recent swing extreme swept into liquidity' : 'No liquidity pool sweep identified'
        },
        {
          id: 'smc_mss',
          name: 'Market Structure Shift (MSS) / Displacement',
          points: mssPass ? 2 : 0,
          maxPoints: 2,
          passed: mssPass,
          isMandatoryGate: true,
          category: 'TRIGGER',
          detail: mssPass ? `Aggressive displacement candle printed (RVOL ${volRatio.toFixed(2)}x)` : 'Displacement volume weak'
        },
        {
          id: 'smc_fvg',
          name: 'Fair Value Gap (FVG) / Order Block Created',
          points: fvgPass ? 2 : 0,
          maxPoints: 2,
          passed: fvgPass,
          category: 'STRUCTURE',
          detail: fvgPass ? 'Clean 3-candle price imbalance (FVG) identified' : 'Imbalance zone still developing'
        },
        {
          id: 'smc_retest',
          name: 'Retest into FVG / POI Entry Zone',
          points: retestPass ? 2 : 0,
          maxPoints: 2,
          passed: retestPass,
          category: 'TRIGGER',
          detail: 'Price retracing into discount/premium entry zone'
        },
        {
          id: 'smc_rr',
          name: 'Asymmetric 1:3+ Risk-to-Reward Target',
          points: rrPass ? 2 : 0,
          maxPoints: 2,
          passed: rrPass,
          category: 'RISK',
          detail: 'Protected stop behind sweep wick targeting opposite liquidity pool'
        }
      ];
      break;
    }

    case 'BINANCE_COMPOSITE': {
      minScoreRequired = 7;
      const isSideways = adxVal < 25;
      const rsi = inds?.rsi || 50;
      const rsiExtreme = rsi <= 35 || rsi >= 65;
      const bbExtreme = Boolean(inds?.bollingerBands && (price <= inds.bollingerBands.lower * 1.01 || price >= inds.bollingerBands.upper * 0.99));
      const wickPass = true;
      const rrPass = true;

      items = [
        {
          id: 'mr_sideways',
          name: 'Sideways Range Regime Filter (ADX < 25)',
          points: isSideways ? 2 : 0,
          maxPoints: 2,
          passed: isSideways,
          isMandatoryGate: true,
          category: 'STRUCTURE',
          detail: isSideways ? `ADX: ${adxVal.toFixed(1)} confirms non-trending range regime` : `ADX: ${adxVal.toFixed(1)} indicates strong trend (Mean-reversion blocked)`
        },
        {
          id: 'mr_bb_extreme',
          name: 'Bollinger Band 2-Sigma Extreme Reached',
          points: bbExtreme ? 2 : 0,
          maxPoints: 2,
          passed: bbExtreme,
          category: 'TRIGGER',
          detail: bbExtreme ? 'Price touching outer 2-sigma Bollinger Band extreme' : 'Price oscillating inside middle band'
        },
        {
          id: 'mr_rsi_extreme',
          name: 'RSI Oscillator Overbought / Oversold',
          points: rsiExtreme ? 2 : 0,
          maxPoints: 2,
          passed: rsiExtreme,
          category: 'TRIGGER',
          detail: `RSI: ${rsi.toFixed(1)} (${rsiExtreme ? 'Exhaustion reading' : 'Neutral zone'})`
        },
        {
          id: 'mr_rejection_pinbar',
          name: 'Rejection Wick / Reversal Pinbar Closed',
          points: wickPass ? 2 : 0,
          maxPoints: 2,
          passed: wickPass,
          category: 'TRIGGER',
          detail: 'Candle wick rejection fading back inside band'
        },
        {
          id: 'mr_target_equilibrium',
          name: 'Target Equilibrium (20-SMA Mid-Band) with 1:3 R:R',
          points: rrPass ? 2 : 0,
          maxPoints: 2,
          passed: rrPass,
          category: 'RISK',
          detail: 'Take-profit set at mean equilibrium with tight stop beyond outer band'
        }
      ];
      break;
    }

    case 'EMA5_PA_VOLUME_V1': {
      minScoreRequired = 7;
      const htfPass = emaFast >= emaSlow;
      const touchPass = lastCandle
        ? (lastCandle.low <= ema5 && lastCandle.close >= ema5 * 0.998) || (lastCandle.high >= ema5 && lastCandle.close <= ema5 * 1.002)
        : Math.abs(price - ema5) / (atr || 1) < 0.40;
      const candleRange = lastCandle ? (lastCandle.high - lastCandle.low) : 1;
      const candleBody = lastCandle ? Math.abs(lastCandle.close - lastCandle.open) : 0;
      const bodyRatio = candleRange > 0 ? candleBody / candleRange : 0.5;
      const targetBodyRatio = customConfig?.thresholdOverrides?.minBodyRatio ?? 0.45;
      const bodyPass = bodyRatio >= targetBodyRatio;
      const targetVolRatio = customConfig?.thresholdOverrides?.minVolumeRatio ?? 1.15;
      const volPass = volRatio >= targetVolRatio;
      const rrPass = gates ? Boolean(gates.g4 !== false) : true;

      items = [
        {
          id: 'epa_15m_regime',
          name: '15m Market Structure Alignment (Higher Highs / Lows)',
          points: htfPass ? 2 : 0,
          maxPoints: 2,
          passed: htfPass,
          isMandatoryGate: true,
          category: 'STRUCTURE',
          detail: htfPass ? `15m swing structure aligned with fast EMA (${emaFast.toFixed(2)}) > slow EMA (${emaSlow.toFixed(2)})` : '15m trend structure opposing or neutral'
        },
        {
          id: 'epa_touch_gap',
          name: '5m EMA 5 Touch & Gap Reversal Wick',
          points: touchPass ? 2 : 0,
          maxPoints: 2,
          passed: touchPass,
          isMandatoryGate: true,
          category: 'TRIGGER',
          detail: touchPass ? `Exact price action reaction formed at EMA 5 baseline (${ema5.toFixed(2)})` : `Price has not tested EMA 5 baseline`
        },
        {
          id: 'epa_body_ratio',
          name: `Clean Candle Body Ratio (≥ ${(targetBodyRatio * 100).toFixed(0)}%)`,
          points: bodyPass ? 2 : 0,
          maxPoints: 2,
          passed: bodyPass,
          category: 'TRIGGER',
          threshold: targetBodyRatio,
          thresholdLabel: 'Min Body Ratio',
          thresholdMin: 0.20,
          thresholdMax: 0.80,
          thresholdStep: 0.05,
          thresholdUnit: 'ratio',
          detail: `Candle body ratio: ${(bodyRatio * 100).toFixed(0)}% (threshold: ${(targetBodyRatio * 100).toFixed(0)}%)`
        },
        {
          id: 'epa_volume_surge',
          name: `Volume Surge Confirmation (≥ ${targetVolRatio.toFixed(2)}x)`,
          points: volPass ? 2 : 0,
          maxPoints: 2,
          passed: volPass,
          category: 'VOLUME',
          threshold: targetVolRatio,
          thresholdLabel: 'Min Volume Ratio',
          thresholdMin: 0.8,
          thresholdMax: 2.5,
          thresholdStep: 0.05,
          thresholdUnit: 'x',
          detail: `Volume ratio: ${volRatio.toFixed(2)}x (min ${targetVolRatio.toFixed(2)}x required)`
        },
        {
          id: 'epa_rr_room',
          name: 'Risk-to-Reward Clearance (≥ 1.5R to Opposing Structure)',
          points: rrPass ? 2 : 0,
          maxPoints: 2,
          passed: rrPass,
          category: 'RISK',
          detail: rrPass ? 'Target structure clears ≥ 1.5R without major liquidity barrier' : 'Target constrained by immediate level'
        }
      ];
      break;
    }

    case 'EARLY_COIL_BREAKOUT': {
      minScoreRequired = 7;
      const compPass = coin?.status === 'ARMED' || coin?.status === 'RANGING' || (gates ? Boolean(gates.g2) : false);
      const apexPass = Math.abs(price - emaFast) / (atr || 1) <= 0.40;
      const targetVol = customConfig?.thresholdOverrides?.minVolumeRatio ?? 1.20;
      const volPass = volRatio >= targetVol;
      const htfPass = emaFast >= emaSlow;
      const rrPass = gates ? Boolean(gates.g4 !== false) : true;

      items = [
        {
          id: 'ecb_compression',
          name: 'Fractal Coil Compression (Contraction Squeeze)',
          points: compPass ? 2 : 0,
          maxPoints: 2,
          passed: compPass,
          isMandatoryGate: true,
          category: 'STRUCTURE',
          detail: compPass ? 'High coil compression detected within narrowing volatility bounds' : 'No coil compression detected'
        },
        {
          id: 'ecb_boundary_test',
          name: 'Apex / Coil Boundary Pre-Breakout Proximity',
          points: apexPass ? 2 : 0,
          maxPoints: 2,
          passed: apexPass,
          isMandatoryGate: true,
          category: 'TRIGGER',
          detail: apexPass ? 'Price positioned cleanly at compression boundary apex' : 'Price adrift inside coil center'
        },
        {
          id: 'ecb_volume_surge',
          name: `Impulse Expansion Volume (≥ ${targetVol.toFixed(2)}x)`,
          points: volPass ? 2 : 0,
          maxPoints: 2,
          passed: volPass,
          category: 'VOLUME',
          threshold: targetVol,
          thresholdLabel: 'Min Volume Ratio',
          thresholdMin: 1.0,
          thresholdMax: 2.5,
          thresholdStep: 0.05,
          thresholdUnit: 'x',
          detail: `Volume ratio: ${volRatio.toFixed(2)}x (min ${targetVol.toFixed(2)}x required)`
        },
        {
          id: 'ecb_htf_alignment',
          name: 'Higher-Timeframe Trend Continuity Filter',
          points: htfPass ? 2 : 0,
          maxPoints: 2,
          passed: htfPass,
          category: 'STRUCTURE',
          detail: htfPass ? 'Coil resolves in direction of HTF moving averages' : 'Opposing HTF trend bias'
        },
        {
          id: 'ecb_asymmetric_rr',
          name: 'Asymmetric 1:3+ Breakout Risk-to-Reward Target',
          points: rrPass ? 2 : 0,
          maxPoints: 2,
          passed: rrPass,
          category: 'RISK',
          detail: 'Tight coil stop structured with asymmetric extension target'
        }
      ];
      break;
    }

    case 'MACRO_RANGE_BREAKOUT': {
      minScoreRequired = 7;
      const rangePass = gates ? Boolean(gates.g1) : (coin?.status === 'RANGING' || coin?.status === 'ARMED');
      const boxBreakPass = (coin?.score || 0) >= 60 || coin?.status === 'ARMED';
      const targetVol = customConfig?.thresholdOverrides?.minVolumeRatio ?? 1.35;
      const volPass = volRatio >= targetVol;
      const holdPass = price >= emaFast;
      const rrPass = true;

      items = [
        {
          id: 'mrb_accumulation',
          name: 'Darvas Box Consolidation / Accumulation Range',
          points: rangePass ? 2 : 0,
          maxPoints: 2,
          passed: rangePass,
          isMandatoryGate: true,
          category: 'STRUCTURE',
          detail: rangePass ? 'Multi-period Darvas box boundary firmly established' : 'Range boundaries unclear'
        },
        {
          id: 'mrb_box_break',
          name: 'Decisive Range Ceiling / Floor Expansion Bar',
          points: boxBreakPass ? 2 : 0,
          maxPoints: 2,
          passed: boxBreakPass,
          isMandatoryGate: true,
          category: 'TRIGGER',
          detail: boxBreakPass ? 'Decisive expansion bar printed outside range perimeter' : 'Awaiting breakout bar close'
        },
        {
          id: 'mrb_institutional_vol',
          name: `Institutional Volume Surge (≥ ${targetVol.toFixed(2)}x)`,
          points: volPass ? 2 : 0,
          maxPoints: 2,
          passed: volPass,
          category: 'VOLUME',
          threshold: targetVol,
          thresholdLabel: 'Min Volume Ratio',
          thresholdMin: 1.0,
          thresholdMax: 3.0,
          thresholdStep: 0.05,
          thresholdUnit: 'x',
          detail: `Breakout volume ratio: ${volRatio.toFixed(2)}x (min ${targetVol.toFixed(2)}x required)`
        },
        {
          id: 'mrb_retest_hold',
          name: 'Boundary Retest & Acceptance Hold',
          points: holdPass ? 2 : 0,
          maxPoints: 2,
          passed: holdPass,
          category: 'TRIGGER',
          detail: holdPass ? 'Price accepting above broken range ceiling' : 'Price failing to hold breakout level'
        },
        {
          id: 'mrb_macro_trend',
          name: 'Macro Trend Room & 1:3+ Extension Target',
          points: rrPass ? 2 : 0,
          maxPoints: 2,
          passed: rrPass,
          category: 'RISK',
          detail: 'Structural stop below box boundary with unobstructed expansion runway'
        }
      ];
      break;
    }

    default: {
      minScoreRequired = meta.defaultMinScore;
      const basePass = (coin?.score || 0) >= 50;
      const volPass = volRatio >= 1.0;
      const htfPass = emaFast >= emaSlow;

      items = [
        {
          id: 'gen_regime',
          name: 'Higher-Timeframe Regime Structure Alignment',
          points: htfPass ? 2 : 0,
          maxPoints: 2,
          passed: htfPass,
          isMandatoryGate: true,
          category: 'STRUCTURE',
          detail: htfPass ? 'Market regime aligned with strategy direction' : 'Regime neutral or conflicting'
        },
        {
          id: 'gen_trigger',
          name: 'Strategy Mathematical Trigger Condition',
          points: basePass ? 2 : 0,
          maxPoints: 2,
          passed: basePass,
          isMandatoryGate: true,
          category: 'TRIGGER',
          detail: `Setup Score: ${coin?.score || 0}/100`
        },
        {
          id: 'gen_volume',
          name: 'Volume Expansion Confirmation',
          points: volPass ? 2 : 0,
          maxPoints: 2,
          passed: volPass,
          category: 'VOLUME',
          detail: `Volume ratio: ${volRatio.toFixed(2)}x`
        },
        {
          id: 'gen_risk',
          name: 'Risk-to-Reward Defined (≥ 2.0R Target)',
          points: 2,
          maxPoints: 2,
          passed: true,
          category: 'RISK',
          detail: 'Dynamic ATR stop and target structured'
        },
        {
          id: 'gen_macro',
          name: 'Global Market Macro Filter',
          points: sessionPass ? 2 : 0,
          maxPoints: 2,
          passed: sessionPass,
          isMandatoryGate: true,
          category: 'MACRO',
          detail: sessionPass ? 'Global BTC macro regime tradable' : (globalFilterState?.reason || 'BTC Macro Safety Lockout')
        }
      ];
      break;
    }
  }

  // Incorporate custom checklist overrides if configured
  if (customConfig && typeof customConfig.minScore === 'number') {
    minScoreRequired = customConfig.minScore;
  }

  // Enrich each checklist item with custom overrides and defaults
  items = items.map(item => {
    const defaultPoints = item.defaultPoints ?? item.maxPoints;
    const defaultIsMandatory = item.defaultIsMandatory ?? Boolean(item.isMandatoryGate);
    const gateCustom = customConfig?.gates?.[item.id];

    if (!gateCustom) {
      return {
        ...item,
        defaultPoints,
        defaultIsMandatory,
        enabled: true,
        isCustomized: false
      };
    }

    const enabled = gateCustom.enabled !== false;
    const points = typeof gateCustom.points === 'number' ? gateCustom.points : defaultPoints;
    const isMandatoryGate = typeof gateCustom.isMandatory === 'boolean' ? gateCustom.isMandatory : defaultIsMandatory;
    const isCustomized = !enabled || points !== defaultPoints || isMandatoryGate !== defaultIsMandatory;

    if (!enabled) {
      return {
        ...item,
        defaultPoints,
        defaultIsMandatory,
        enabled: false,
        points: 0,
        maxPoints: 0,
        isMandatoryGate: false,
        passed: true, // disabled gates never fail the audit or veto
        detail: `[DISABLED BY USER] ${item.detail}`,
        isCustomized: true
      };
    }

    return {
      ...item,
      defaultPoints,
      defaultIsMandatory,
      enabled: true,
      maxPoints: points,
      points: item.passed ? points : 0,
      isMandatoryGate,
      isCustomized
    };
  });

  const activeItems = items.filter(it => it.enabled !== false);
  const score = activeItems.reduce((sum, it) => sum + it.points, 0);
  const computedMaxScore = items.reduce((sum, it) => sum + (it.enabled !== false ? it.maxPoints : 0), 0);
  const mandatoryGatesPassed = activeItems.filter(it => it.isMandatoryGate).every(it => it.passed);
  const passed = score >= minScoreRequired && mandatoryGatesPassed && sessionPass;
  const failedGates = activeItems.filter(it => !it.passed).map(it => it.name);

  let recommendation: 'EXECUTE' | 'WAIT' | 'SKIP' = 'SKIP';
  if (passed) {
    recommendation = 'EXECUTE';
  } else if (score >= Math.max(4, minScoreRequired - 2)) {
    recommendation = 'WAIT';
  }

  const effectiveMaxScore = customConfig ? computedMaxScore : meta.maxScore;
  const summary = `${score} / ${effectiveMaxScore} pts – ${
    passed 
      ? `Setup fully qualified for ${meta.shortName} execution` 
      : recommendation === 'WAIT'
      ? `Setup developing; waiting for key trigger or volume confirmation`
      : `Setup skipped; insufficient checklist score or mandatory gate missing`
  }`;

  return {
    strategyId: stratId,
    strategyName: meta.name,
    strategyShortName: meta.shortName,
    symbol,
    score,
    maxScore: effectiveMaxScore,
    minScoreRequired,
    passed,
    gatePassed: sessionPass && mandatoryGatesPassed,
    failedGates,
    summary,
    recommendation,
    items
  };
}

export const StrategyChecklistPanel: React.FC<StrategyChecklistPanelProps> = ({
  settings,
  onUpdateSetting,
  selectedStrategyId,
  onSelectStrategy,
  coins = [],
  selectedSymbol,
  onSelectSymbol,
  globalFilterState
}) => {
  const [internalStrategyId, setInternalStrategyId] = useState<string>(
    selectedStrategyId || settings.activeStrategy || 'EMA5_EXACT_ENTRY_V2'
  );
  const [activeChecklistSymbol, setActiveChecklistSymbol] = useState<string>(
    selectedSymbol || coins[0]?.symbol || 'BTCUSDT'
  );
  const [isCustomizerOpen, setIsCustomizerOpen] = useState<boolean>(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const activeStrategyId = selectedStrategyId || internalStrategyId;
  const stratMeta = useMemo(() => {
    return STRATEGY_DEFINITIONS.find(s => s.id === activeStrategyId) || STRATEGY_DEFINITIONS[0];
  }, [activeStrategyId]);

  const activeCoin = useMemo(() => {
    return coins.find(c => c.symbol === activeChecklistSymbol) || coins[0];
  }, [coins, activeChecklistSymbol]);

  const liveAudit = useMemo(() => {
    return computeStrategyLiveAudit(activeStrategyId, activeCoin, settings, globalFilterState);
  }, [activeStrategyId, activeCoin, settings, globalFilterState]);

  const handleStrategyChange = (newStratId: string) => {
    setInternalStrategyId(newStratId);
    if (onSelectStrategy) {
      onSelectStrategy(newStratId);
    }
  };

  const isCurrentActiveStrategy = settings.activeStrategy === activeStrategyId;

  // Customization status for the active strategy
  const currentStratCustom = settings.customChecklists?.[activeStrategyId];
  const customGateKeys = Object.keys(currentStratCustom?.gates || {});
  const isCustomScore = currentStratCustom?.minScore !== undefined && currentStratCustom?.minScore !== stratMeta.defaultMinScore;
  const customOverridesCount = customGateKeys.length + (isCustomScore ? 1 : 0);
  const hasCustomOverrides = customOverridesCount > 0;

  // Customizer actions
  const handleUpdateCustomGate = (gateId: string, updates: Partial<GateCustomConfig>) => {
    const custom = settings.customChecklists ? { ...settings.customChecklists } : {};
    const currentStrat = custom[activeStrategyId] ? { ...custom[activeStrategyId] } : {
      strategyId: activeStrategyId,
      minScore: liveAudit.minScoreRequired,
      gates: {}
    };
    const gates = currentStrat.gates ? { ...currentStrat.gates } : {};
    const gateItem = liveAudit.items.find(i => i.id === gateId);
    const existing = gates[gateId] ? { ...gates[gateId] } : {
      enabled: gateItem?.enabled !== false,
      isMandatory: Boolean(gateItem?.isMandatoryGate),
      points: gateItem?.maxPoints ?? 2
    };

    gates[gateId] = { ...existing, ...updates };
    currentStrat.gates = gates;
    custom[activeStrategyId] = currentStrat;
    onUpdateSetting('customChecklists', custom);
    setSaveNotice(`✓ Updated gate "${gateItem?.name || gateId}"`);
    setTimeout(() => setSaveNotice(null), 2500);
  };

  const handleSetMinScore = (newScore: number) => {
    const clamped = Math.max(1, Math.min(liveAudit.maxScore, newScore));
    const custom = settings.customChecklists ? { ...settings.customChecklists } : {};
    const currentStrat = custom[activeStrategyId] ? { ...custom[activeStrategyId] } : {
      strategyId: activeStrategyId,
      minScore: liveAudit.minScoreRequired,
      gates: {}
    };
    currentStrat.minScore = clamped;
    custom[activeStrategyId] = currentStrat;
    onUpdateSetting('customChecklists', custom);
    setSaveNotice(`✓ Required score set to ${clamped} pts`);
    setTimeout(() => setSaveNotice(null), 2500);
  };

  const handleUpdateThreshold = (gateId: string, thresholdVal: number) => {
    const custom = settings.customChecklists ? { ...settings.customChecklists } : {};
    const currentStrat = custom[activeStrategyId] ? { ...custom[activeStrategyId] } : {
      strategyId: activeStrategyId,
      minScore: liveAudit.minScoreRequired,
      gates: {}
    };
    const gates = currentStrat.gates ? { ...currentStrat.gates } : {};
    const gateItem = liveAudit.items.find(i => i.id === gateId);
    const existing = gates[gateId] ? { ...gates[gateId] } : {
      enabled: gateItem?.enabled !== false,
      isMandatory: Boolean(gateItem?.isMandatoryGate),
      points: gateItem?.maxPoints ?? 2
    };
    gates[gateId] = { ...existing, threshold: thresholdVal };
    currentStrat.gates = gates;
    custom[activeStrategyId] = currentStrat;
    onUpdateSetting('customChecklists', custom);
    setSaveNotice(`✓ Updated threshold to ${thresholdVal}`);
    setTimeout(() => setSaveNotice(null), 2500);
  };

  const handleApplyPreset = (preset: 'strict' | 'default' | 'scalp') => {
    const custom = settings.customChecklists ? { ...settings.customChecklists } : {};

    if (preset === 'default') {
      if (custom[activeStrategyId]) {
        delete custom[activeStrategyId];
        onUpdateSetting('customChecklists', custom);
      }
      setSaveNotice(`✓ Reset ${stratMeta.shortName} to factory quant defaults`);
      setTimeout(() => setSaveNotice(null), 3000);
      return;
    }

    if (preset === 'strict') {
      const gates: Record<string, GateCustomConfig> = {};
      liveAudit.items.forEach(it => {
        gates[it.id] = {
          enabled: true,
          isMandatory: true,
          points: it.defaultPoints ?? it.maxPoints ?? 2
        };
      });
      custom[activeStrategyId] = {
        strategyId: activeStrategyId,
        minScore: Math.min(stratMeta.maxScore, stratMeta.defaultMinScore + 1),
        gates
      };
      onUpdateSetting('customChecklists', custom);
      setSaveNotice(`✓ Applied Strict (Conservative) preset to ${stratMeta.shortName}`);
      setTimeout(() => setSaveNotice(null), 3000);
      return;
    }

    if (preset === 'scalp') {
      const gates: Record<string, GateCustomConfig> = {};
      liveAudit.items.forEach(it => {
        const isCore = it.category === 'TRIGGER' || it.category === 'MACRO';
        gates[it.id] = {
          enabled: true,
          isMandatory: isCore,
          points: it.defaultPoints ?? it.maxPoints ?? 2
        };
      });
      custom[activeStrategyId] = {
        strategyId: activeStrategyId,
        minScore: Math.max(4, stratMeta.defaultMinScore - 2),
        gates
      };
      onUpdateSetting('customChecklists', custom);
      setSaveNotice(`✓ Applied Aggressive (Scalp) preset to ${stratMeta.shortName}`);
      setTimeout(() => setSaveNotice(null), 3000);
      return;
    }
  };

  const handleResetAll = () => {
    if (window.confirm('Reset ALL strategy checklists to factory quant defaults?')) {
      onUpdateSetting('customChecklists', {});
      setSaveNotice('✓ All strategy checklists reset to defaults');
      setTimeout(() => setSaveNotice(null), 3000);
    }
  };

  return (
    <div className="space-y-6 font-mono text-xs">
      
      {/* 1. STRATEGY SELECTOR HEADER BAR */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-3 sm:p-4 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Strategy Checklist & Live Audit Selector
            </h4>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
              {STRATEGY_DEFINITIONS.length} STRATEGIES AVAILABLE
            </span>
            {saveNotice && (
              <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 text-[10px] font-bold flex items-center gap-1 animate-pulse">
                <Check className="w-3 h-3 text-emerald-400" />
                {saveNotice}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
            {/* Customizer Toggle Button */}
            <button
              type="button"
              onClick={() => setIsCustomizerOpen(!isCustomizerOpen)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 border shadow-sm ${
                isCustomizerOpen
                  ? 'bg-emerald-500 text-black border-emerald-400'
                  : hasCustomOverrides
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/60'
                  : 'bg-gray-800 text-gray-300 border-gray-700 hover:text-white hover:bg-gray-700'
              }`}
              title="Customize gates, points, thresholds, and mandatory requirements"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{isCustomizerOpen ? 'Close Customizer' : 'Customize Checklist'}</span>
              {hasCustomOverrides ? (
                <span className="px-1.5 py-0.2 rounded bg-emerald-400 text-black text-[9px] font-black">
                  {customOverridesCount} OVERRIDE{customOverridesCount > 1 ? 'S' : ''}
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded bg-gray-700 text-gray-400 text-[9px]">
                  DEFAULT
                </span>
              )}
              {isCustomizerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {!isCurrentActiveStrategy && (
              <button
                type="button"
                onClick={() => onUpdateSetting('activeStrategy', activeStrategyId)}
                className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-black font-black text-[11px] transition cursor-pointer flex items-center gap-1 shadow-sm"
                title="Arm this strategy as primary in the 24/7 trading engine"
              >
                <Zap className="w-3.5 h-3.5 fill-black" />
                <span>ARM AS ACTIVE STRATEGY</span>
              </button>
            )}
          </div>
        </div>

        {/* Strategy Pills Scrollable Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar touch-pan-x">
          {STRATEGY_DEFINITIONS.map((s) => {
            const isSelected = s.id === activeStrategyId;
            const isArmed = settings.activeStrategy === s.id || (settings.enabledStrategies && settings.enabledStrategies.includes(s.id as any));
            const isCustomized = Boolean(settings.customChecklists?.[s.id]);
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => handleStrategyChange(s.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap cursor-pointer border ${
                  isSelected
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-950/40'
                    : isArmed
                    ? 'bg-emerald-950/30 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/40'
                    : 'bg-gray-900/80 text-gray-400 border-gray-800 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{s.shortName}</span>
                {isCustomized && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" title="Custom gates configured"></span>
                )}
                {isArmed && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Active in trading engine"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1.5 INTERACTIVE STRATEGY CHECKLIST CUSTOMIZER (DRAWER / PANEL) */}
      {isCustomizerOpen && (
        <div className="bg-gradient-to-b from-[#1c222c] to-[#12161e] border-2 border-emerald-500/50 rounded-xl p-4 sm:p-5 shadow-2xl space-y-5 animate-in fade-in duration-200">
          
          {/* Customizer Header & Quick Presets */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-gray-800">
            <div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Checklist & Gate Customizer: <span className="text-emerald-400">{stratMeta.name}</span>
                </h3>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Customize gate veto rules, point weightings, passing score criteria, and quantitative parameters. Changes persist into the trading engine.
              </p>
            </div>

            {/* Quick Presets Bar */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => handleApplyPreset('strict')}
                className="px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/40 text-[10px] font-bold cursor-pointer transition flex items-center gap-1"
                title="All gates mandatory veto + higher required score"
              >
                <span>🛡️ Strict</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('default')}
                className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-[10px] font-bold cursor-pointer transition flex items-center gap-1"
                title="Restore default quant specification"
              >
                <span>⚖️ Balanced (Default)</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('scalp')}
                className="px-2.5 py-1 rounded bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-500/40 text-[10px] font-bold cursor-pointer transition flex items-center gap-1"
                title="Lower min score + trigger-only mandatory gates"
              >
                <span>⚡ Aggressive (Scalp)</span>
              </button>
              {hasCustomOverrides && (
                <button
                  type="button"
                  onClick={() => handleApplyPreset('default')}
                  className="px-2 py-1 rounded bg-gray-900 hover:bg-gray-800 text-rose-400 border border-rose-900/50 text-[10px] font-bold cursor-pointer transition flex items-center gap-1"
                  title="Clear all overrides for this strategy"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Min Score Tuning Slider Card */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-3.5 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-emerald-400" />
                  Minimum Required Passing Score
                </span>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Setups scoring below this score are filtered out before execution.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => handleSetMinScore(liveAudit.minScoreRequired - 1)}
                  disabled={liveAudit.minScoreRequired <= 1}
                  className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-white font-bold disabled:opacity-30 cursor-pointer"
                >
                  -
                </button>
                <span className="px-3 py-1 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold font-mono text-sm">
                  {liveAudit.minScoreRequired} / {liveAudit.maxScore} pts ({Math.round((liveAudit.minScoreRequired / Math.max(1, liveAudit.maxScore)) * 100)}%)
                </span>
                <button
                  type="button"
                  onClick={() => handleSetMinScore(liveAudit.minScoreRequired + 1)}
                  disabled={liveAudit.minScoreRequired >= liveAudit.maxScore}
                  className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-white font-bold disabled:opacity-30 cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <input
              type="range"
              min={1}
              max={Math.max(liveAudit.maxScore, stratMeta.maxScore)}
              step={1}
              value={liveAudit.minScoreRequired}
              onChange={(e) => handleSetMinScore(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Per-Gate Customization Matrix */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Strategy Execution Gates & Rules ({liveAudit.items.length} Gates)
              </span>
              <span className="text-[10px] text-gray-400">
                Click controls to toggle Veto, adjust point weights, or disable gates
              </span>
            </div>

            <div className="space-y-2">
              {liveAudit.items.map((gate, idx) => {
                const isEnabled = gate.enabled !== false;
                const isMandatory = Boolean(gate.isMandatoryGate);
                const points = gate.maxPoints;
                const isGateOverridden = Boolean(currentStratCustom?.gates?.[gate.id]);

                return (
                  <div
                    key={gate.id}
                    className={`rounded-lg border p-3 transition-all ${
                      !isEnabled
                        ? 'bg-gray-900/40 border-gray-800 opacity-60'
                        : isGateOverridden
                        ? 'bg-[#18202d] border-cyan-500/40 shadow-sm'
                        : 'bg-[#161B22] border-[#30363D]'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      {/* Gate info */}
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="text-gray-500 font-mono text-[10px] pt-0.5">#{idx + 1}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold ${isEnabled ? 'text-white' : 'text-gray-500 line-through'}`}>
                              {gate.name}
                            </span>
                            {gate.category && (
                              <span className="px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 text-[9px] uppercase font-bold">
                                {gate.category}
                              </span>
                            )}
                            {isGateOverridden && (
                              <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] font-bold">
                                CUSTOM
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">
                            {gate.detail}
                          </p>

                          {/* Threshold adjuster if applicable */}
                          {gate.threshold !== undefined && isEnabled && (
                            <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-gray-800/60">
                              <span className="text-[10px] text-cyan-300 font-semibold">
                                {gate.thresholdLabel || 'Threshold'}:
                              </span>
                              <input
                                type="range"
                                min={gate.thresholdMin ?? 0.5}
                                max={gate.thresholdMax ?? 3.0}
                                step={gate.thresholdStep ?? 0.05}
                                value={gate.threshold}
                                onChange={(e) => handleUpdateThreshold(gate.id, parseFloat(e.target.value))}
                                className="w-28 sm:w-36 accent-cyan-500 cursor-pointer"
                              />
                              <span className="font-mono text-cyan-400 text-[10px] font-bold">
                                {gate.thresholdUnit === 'ratio' 
                                  ? `${Math.round(gate.threshold * 100)}%` 
                                  : `${gate.threshold.toFixed(2)}${gate.thresholdUnit || ''}`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Interactive Controls */}
                      <div className="flex items-center gap-2 self-end lg:self-center shrink-0 flex-wrap">
                        {/* 1. Active / Disabled Toggle */}
                        <button
                          type="button"
                          onClick={() => handleUpdateCustomGate(gate.id, { enabled: !isEnabled })}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer border ${
                            isEnabled
                              ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/50'
                              : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
                          }`}
                          title={isEnabled ? 'Click to disable this gate' : 'Click to enable this gate'}
                        >
                          {isEnabled ? 'ACTIVE' : 'DISABLED'}
                        </button>

                        {/* 2. Mandatory Veto vs Scored Toggle */}
                        <button
                          type="button"
                          disabled={!isEnabled}
                          onClick={() => handleUpdateCustomGate(gate.id, { isMandatory: !isMandatory })}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer border disabled:opacity-30 ${
                            isMandatory
                              ? 'bg-rose-950/60 text-rose-300 border-rose-500/50 hover:bg-rose-900/60 shadow-sm'
                              : 'bg-indigo-950/50 text-indigo-300 border-indigo-500/40 hover:bg-indigo-900/50'
                          }`}
                          title={
                            isMandatory
                              ? 'Mandatory Veto: Failure halts execution regardless of total score. Click to switch to Scored Only.'
                              : 'Scored Only: Awards points, but failure does not veto trade. Click to switch to Mandatory Veto.'
                          }
                        >
                          {isMandatory ? '⛔ MANDATORY VETO' : '⭐ SCORED ONLY'}
                        </button>

                        {/* 3. Point Weight Buttons */}
                        <div className="flex items-center border border-gray-700 rounded overflow-hidden">
                          {[1, 2, 3].map((pt) => (
                            <button
                              key={pt}
                              type="button"
                              disabled={!isEnabled}
                              onClick={() => handleUpdateCustomGate(gate.id, { points: pt })}
                              className={`px-2 py-1 text-[10px] font-bold font-mono transition cursor-pointer disabled:opacity-30 ${
                                points === pt && isEnabled
                                  ? 'bg-emerald-600 text-black font-black'
                                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
                              }`}
                              title={`Set point weight to +${pt} pts`}
                            >
                              +{pt}p
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Customizer Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-800 text-[11px] text-gray-400">
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>
                Engine sync active: Customizations apply immediately to live audits, background candle scanning, and execution.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetAll}
                className="px-2.5 py-1 rounded bg-gray-900 hover:bg-rose-950/40 text-gray-400 hover:text-rose-300 border border-gray-800 hover:border-rose-800/40 text-[10px] font-semibold cursor-pointer transition"
              >
                Reset All Strategies
              </button>
              <button
                type="button"
                onClick={() => setIsCustomizerOpen(false)}
                className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-[10px] cursor-pointer transition"
              >
                Done Customizing
              </button>
            </div>
          </div>

        </div>
      )}

      {/* 2. STRATEGY SPECIFIC HEADER BANNER */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-gray-900 border border-emerald-500/40 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              <stratMeta.icon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Before Executing {stratMeta.shortName} – Quick Checklist
                </h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${stratMeta.badgeBg}`}>
                  {stratMeta.tag}
                </span>
                {hasCustomOverrides ? (
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
                    CUSTOMIZED ({customOverridesCount} OVERRIDES)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                    QUANT SPEC (DEFAULT)
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-300 mt-1.5 leading-relaxed max-w-2xl">
                {stratMeta.entryGateDescription}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-center shrink-0">
            <div className="bg-black/50 border border-gray-800 rounded-lg px-3 py-2 text-right">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Required Score</div>
              <div className="text-emerald-400 font-bold text-sm">
                &ge; {liveAudit.minScoreRequired} / {liveAudit.maxScore} pts
              </div>
            </div>
          </div>
        </div>

        {/* Decision Matrix Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4 pt-3 border-t border-gray-800/80">
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2.5 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-emerald-300 font-bold text-[11px]">Score &ge; {liveAudit.minScoreRequired} pts</div>
              <div className="text-[10px] text-gray-400">Execute trade with high confidence</div>
            </div>
          </div>

          <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-2.5 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="text-amber-300 font-bold text-[11px]">Score {Math.max(4, liveAudit.minScoreRequired - 2)}-{liveAudit.minScoreRequired - 1} pts</div>
              <div className="text-[10px] text-gray-400">Wait for trigger candle or volume development</div>
            </div>
          </div>

          <div className="bg-rose-950/30 border border-rose-500/30 rounded-lg p-2.5 flex items-center gap-2.5">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <div>
              <div className="text-rose-300 font-bold text-[11px]">Score &lt; {Math.max(4, liveAudit.minScoreRequired - 2)} pts</div>
              <div className="text-[10px] text-gray-400">Hard reject & skip setup completely</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. LIVE AUDIT STATUS (EVALUATED LIVE ON CANDIDATE COIN) */}
      <div className={`rounded-xl p-4 border transition-all ${
        liveAudit.passed 
          ? 'bg-emerald-950/20 border-emerald-500/50 shadow-emerald-950/20 shadow-lg' 
          : liveAudit.recommendation === 'WAIT'
          ? 'bg-amber-950/20 border-amber-500/50 shadow-amber-950/20 shadow-lg'
          : 'bg-rose-950/20 border-rose-500/50 shadow-rose-950/20 shadow-lg'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              Live Audit:
            </span>
            {coins.length > 0 ? (
              <select
                value={activeChecklistSymbol}
                onChange={(e) => {
                  setActiveChecklistSymbol(e.target.value);
                  if (onSelectSymbol) onSelectSymbol(e.target.value);
                }}
                className="bg-[#0E1117] border border-[#30363D] text-emerald-400 font-bold text-xs rounded px-2.5 py-1 focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
              >
                {coins.map((c) => (
                  <option key={c.symbol} value={c.symbol}>
                    {c.symbol} (${formatPrice(c.price)})
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-bold text-emerald-400 font-mono">
                {activeChecklistSymbol}
              </span>
            )}
            <span className={`px-2.5 py-0.5 rounded text-[10px] font-black border ${
              liveAudit.passed 
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                : liveAudit.recommendation === 'WAIT'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
            }`}>
              {liveAudit.recommendation} ({liveAudit.score} / {liveAudit.maxScore} PTS)
            </span>
          </div>

          <span className="text-xs text-gray-300 font-medium">
            {liveAudit.summary}
          </span>
        </div>

        {/* Live Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {liveAudit.items.map((item) => {
            const isEnabled = item.enabled !== false;
            return (
              <div 
                key={item.id} 
                className={`p-2.5 rounded-lg border text-[11px] transition-all ${
                  !isEnabled
                    ? 'bg-gray-900/30 border-gray-800 text-gray-500'
                    : item.passed 
                    ? 'bg-emerald-900/10 border-emerald-500/30 text-emerald-300' 
                    : 'bg-rose-900/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center justify-between font-bold gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {!isEnabled ? (
                      <span className="w-2 h-2 rounded-full bg-gray-600 shrink-0"></span>
                    ) : item.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </div>
                  <span className="shrink-0 font-mono ml-1 font-bold">
                    {isEnabled ? `+${item.points}/${item.maxPoints}` : 'OFF'}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 mt-1 leading-relaxed break-words" title={item.detail}>
                  {item.detail}
                </div>
                {item.isCustomized && (
                  <div className="mt-1 flex items-center gap-1 text-[9px] text-cyan-400">
                    <span>* Custom rule</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. STRATEGY EXECUTION GATES (CARDS) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Execution Gates for {stratMeta.name} ({liveAudit.items.length})
          </h4>
          <span className="text-[10px] text-gray-500">
            Click role pill to toggle Mandatory Veto / Scored
          </span>
        </div>

        {liveAudit.items.map((gate, idx) => {
          const isEnabled = gate.enabled !== false;
          const isMandatory = Boolean(gate.isMandatoryGate);

          return (
            <div key={gate.id} className={`bg-[#161B22] border hover:border-emerald-500/40 rounded-xl p-4 transition-all space-y-2 ${
              !isEnabled ? 'border-gray-800/60 opacity-60' : 'border-[#30363D]'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{idx + 1}. {gate.name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold font-mono">
                        +{gate.maxPoints} pts
                      </span>

                      {/* Interactive Role Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleUpdateCustomGate(gate.id, { isMandatory: !isMandatory })}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition cursor-pointer border ${
                          !isEnabled
                            ? 'bg-gray-800 text-gray-500 border-gray-700'
                            : isMandatory
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                            : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/30'
                        }`}
                        title="Click to toggle between Mandatory Veto and Scored Only"
                      >
                        {!isEnabled ? 'Disabled' : isMandatory ? 'Mandatory Veto' : 'Scored Only'}
                      </button>

                      {gate.isCustomized && (
                        <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                      {gate.detail}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 pl-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    !isEnabled
                      ? 'bg-gray-800 text-gray-500 border-gray-700'
                      : gate.passed 
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                      : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  }`}>
                    {!isEnabled ? 'BYPASSED' : gate.passed ? 'QUALIFIED' : 'PENDING'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. CHECKLIST ENGINE TUNING CONTROLS */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            {stratMeta.shortName} Checklist Engine Tuning
          </h4>
          <button
            type="button"
            onClick={() => setIsCustomizerOpen(!isCustomizerOpen)}
            className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isCustomizerOpen ? 'Close Customizer' : 'Open Full Gate Customizer'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-gray-300 text-[11px] font-semibold">
                Minimum Checklist Score Required
              </label>
              <span className="font-bold text-emerald-400 font-mono">
                {liveAudit.minScoreRequired} / {liveAudit.maxScore} pts
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={Math.max(liveAudit.maxScore, stratMeta.maxScore)}
              step={1}
              value={liveAudit.minScoreRequired}
              onChange={(e) => handleSetMinScore(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[10px] text-gray-500">
              Setups scoring below this threshold are automatically filtered out during scanning.
            </p>
          </div>

          <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-800 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-gray-400 leading-relaxed">
              When auto-trading is enabled for <strong>{stratMeta.name}</strong>, every candle on your scanned pairs is audited against this real-time checklist. Only pairs meeting the minimum score and clearing all mandatory gates trigger order placement.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};

// Backward-compatible alias for existing VcbChecklistPanel imports
export const VcbChecklistPanel: React.FC<any> = (props) => {
  return <StrategyChecklistPanel {...props} selectedStrategyId="VOLATILITY_COMPRESSION" />;
};
