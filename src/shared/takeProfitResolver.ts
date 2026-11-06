/**
 * Centralised Take Profit Resolver
 * Shared across Backend Trading Engine (AutoTrader, OMS, PositionMonitor)
 * and Frontend React Dashboard (App.tsx, SettingsPanel).
 *
 * Rules:
 * - Provides a unified multi-target Take Profit structure (TP1, TP2, TP3) for all strategies.
 * - Mode support: R_MULTIPLE (Risk:Reward R-multiple), PERCENTAGE (Fixed %), ATR_MULTIPLE (Volatility ATR).
 * - "If take profit is present in the strategy itself, then override centralised take profit structure tp1, tp2, tp3".
 * - If the strategy specifies partial targets (e.g., only TP1), the strategy's TP1 is preserved while
 *   centralised TP fills TP2 and TP3 to ensure complete multi-tier execution.
 * - Supports an optional "Force Centralised TP" toggle to override strategy targets if requested by the user.
 */

export type CentralisedTpMode = 'R_MULTIPLE' | 'PERCENTAGE' | 'ATR_MULTIPLE';

export interface StrategyTpInput {
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  tp1ClosePct?: number | null;
  tp2ClosePct?: number | null;
  tp3ClosePct?: number | null;
}

export interface CentralisedTakeProfitConfig {
  enabled?: boolean;
  mode?: CentralisedTpMode;
  tp1Value?: number; // e.g. 1.5 (1.5R, 1.5%, or 1.5x ATR)
  tp2Value?: number; // e.g. 2.5 (2.5R, 2.5%, or 2.5x ATR)
  tp3Value?: number; // e.g. 4.0 (4.0R, 4.0%, or 4.0x ATR)
  tp1ClosePct?: number; // e.g. 50%
  tp2ClosePct?: number; // e.g. 30%
  tp3ClosePct?: number; // e.g. 20%
  moveToBeAfterTp1?: boolean; // Move SL to entry / breakeven once TP1 is hit
  overrideStrategyTp?: boolean; // Force centralised TP even if strategy has TP
}

export interface TakeProfitSettingsSource {
  centralisedTakeProfit?: CentralisedTakeProfitConfig;
  centralisedTpEnabled?: boolean;
  centralisedTpMode?: CentralisedTpMode;
  centralisedTp1Value?: number;
  centralisedTp2Value?: number;
  centralisedTp3Value?: number;
  centralisedTp1ClosePct?: number;
  centralisedTp2ClosePct?: number;
  centralisedTp3ClosePct?: number;
  centralisedTpMoveToBe?: boolean;
  centralisedTpOverrideStrategy?: boolean;
  // Legacy fallbacks
  tp1AtrMultiple?: number;
  tp2AtrMultiple?: number;
  tp3FibLevel?: number;
}

export interface ResolvedTakeProfitResult {
  tp1: number;
  tp2: number;
  tp3: number;
  tp1ClosePct: number;
  tp2ClosePct: number;
  tp3ClosePct: number;
  mode: CentralisedTpMode;
  source: 'STRATEGY' | 'CENTRALISED' | 'HYBRID';
  explanation: string;
  isStrategyOverridden: boolean;
}

export const CENTRALISED_TP_DEFAULTS: Required<CentralisedTakeProfitConfig> = {
  enabled: true,
  mode: 'R_MULTIPLE',
  tp1Value: 2.0,
  tp2Value: 3.5,
  tp3Value: 5.0,
  tp1ClosePct: 40,
  tp2ClosePct: 35,
  tp3ClosePct: 25,
  moveToBeAfterTp1: true,
  overrideStrategyTp: false,
};

/**
 * Format price to realistic decimal precision matching the magnitude of entry price
 */
export function formatTpPrice(price: number, referencePrice: number): number {
  if (!isFinite(price) || price <= 0) return 0;
  if (referencePrice >= 1000) return Number(price.toFixed(2));
  if (referencePrice >= 10) return Number(price.toFixed(4));
  if (referencePrice >= 1) return Number(price.toFixed(5));
  if (referencePrice >= 0.01) return Number(price.toFixed(6));
  return Number(price.toFixed(8));
}

/**
 * Resolves TP1, TP2, TP3 targets and position scale-out percentages
 * applying the core rule:
 * Strategy TP (if present) overrides Centralised TP.
 * Missing targets fall back to Centralised TP structure.
 */
export function resolveTakeProfitTargets(
  entryPrice: number,
  direction: 'LONG' | 'SHORT',
  stopLossPrice: number,
  atr: number = 0,
  strategyTps?: StrategyTpInput | null,
  settings?: TakeProfitSettingsSource | null
): ResolvedTakeProfitResult {
  const isLong = direction === 'LONG';
  const validEntry = Number(entryPrice) > 0 ? Number(entryPrice) : 1;

  // 1. Extract Centralised TP Config (coalescing nested object and flat fields)
  const ctpObj = settings?.centralisedTakeProfit;
  const isEnabled = ctpObj?.enabled ?? settings?.centralisedTpEnabled ?? CENTRALISED_TP_DEFAULTS.enabled;
  const mode: CentralisedTpMode = (ctpObj?.mode ?? settings?.centralisedTpMode ?? CENTRALISED_TP_DEFAULTS.mode) as CentralisedTpMode;
  const tp1Val = Math.max(0.1, Number(ctpObj?.tp1Value ?? settings?.centralisedTp1Value ?? CENTRALISED_TP_DEFAULTS.tp1Value));
  const tp2Val = Math.max(0.2, Number(ctpObj?.tp2Value ?? settings?.centralisedTp2Value ?? CENTRALISED_TP_DEFAULTS.tp2Value));
  const tp3Val = Math.max(0.3, Number(ctpObj?.tp3Value ?? settings?.centralisedTp3Value ?? CENTRALISED_TP_DEFAULTS.tp3Value));

  const tp1ClosePct = Math.max(1, Math.min(100, Number(ctpObj?.tp1ClosePct ?? settings?.centralisedTp1ClosePct ?? CENTRALISED_TP_DEFAULTS.tp1ClosePct)));
  const tp2ClosePct = Math.max(0, Math.min(100, Number(ctpObj?.tp2ClosePct ?? settings?.centralisedTp2ClosePct ?? CENTRALISED_TP_DEFAULTS.tp2ClosePct)));
  const tp3ClosePct = Math.max(0, Math.min(100, Number(ctpObj?.tp3ClosePct ?? settings?.centralisedTp3ClosePct ?? CENTRALISED_TP_DEFAULTS.tp3ClosePct)));

  const forceOverride = Boolean(ctpObj?.overrideStrategyTp ?? settings?.centralisedTpOverrideStrategy ?? false);

  // 2. Check if Take Profit is present in the strategy itself
  const stratTp1 = (strategyTps?.tp1 !== undefined && strategyTps.tp1 !== null && Number(strategyTps.tp1) > 0)
    ? Number(strategyTps.tp1)
    : 0;
  const stratTp2 = (strategyTps?.tp2 !== undefined && strategyTps.tp2 !== null && Number(strategyTps.tp2) > 0)
    ? Number(strategyTps.tp2)
    : 0;
  const stratTp3 = (strategyTps?.tp3 !== undefined && strategyTps.tp3 !== null && Number(strategyTps.tp3) > 0)
    ? Number(strategyTps.tp3)
    : 0;

  const strategyHasTp = stratTp1 > 0;

  // 3. Compute baseline Centralised TP Targets
  const stopDist = Math.abs(validEntry - Number(stopLossPrice || 0));
  const effectiveRiskDist = (stopDist > 0 && isFinite(stopDist))
    ? stopDist
    : (atr > 0 ? atr * 1.5 : validEntry * 0.015);

  const effectiveAtr = (atr > 0 && isFinite(atr))
    ? atr
    : (effectiveRiskDist / 1.5);

  let calcCtp1 = 0;
  let calcCtp2 = 0;
  let calcCtp3 = 0;

  if (mode === 'PERCENTAGE') {
    calcCtp1 = isLong ? validEntry * (1 + tp1Val / 100) : validEntry * (1 - tp1Val / 100);
    calcCtp2 = isLong ? validEntry * (1 + tp2Val / 100) : validEntry * (1 - tp2Val / 100);
    calcCtp3 = isLong ? validEntry * (1 + tp3Val / 100) : validEntry * (1 - tp3Val / 100);
  } else if (mode === 'ATR_MULTIPLE') {
    calcCtp1 = isLong ? validEntry + (effectiveAtr * tp1Val) : validEntry - (effectiveAtr * tp1Val);
    calcCtp2 = isLong ? validEntry + (effectiveAtr * tp2Val) : validEntry - (effectiveAtr * tp2Val);
    calcCtp3 = isLong ? validEntry + (effectiveAtr * tp3Val) : validEntry - (effectiveAtr * tp3Val);
  } else {
    // Standard 'R_MULTIPLE'
    calcCtp1 = isLong ? validEntry + (effectiveRiskDist * tp1Val) : validEntry - (effectiveRiskDist * tp1Val);
    calcCtp2 = isLong ? validEntry + (effectiveRiskDist * tp2Val) : validEntry - (effectiveRiskDist * tp2Val);
    calcCtp3 = isLong ? validEntry + (effectiveRiskDist * tp3Val) : validEntry - (effectiveRiskDist * tp3Val);
  }

  calcCtp1 = formatTpPrice(Math.max(0.000001, calcCtp1), validEntry);
  calcCtp2 = formatTpPrice(Math.max(0.000001, calcCtp2), validEntry);
  calcCtp3 = formatTpPrice(Math.max(0.000001, calcCtp3), validEntry);

  // 4. Evaluate Override Rule:
  // "if take profit is present in the strategy itself then override centralised take profit structure tp1,tp2,tp3"
  if (strategyHasTp && !forceOverride) {
    const finalTp1 = formatTpPrice(stratTp1, validEntry);
    const finalTp2 = stratTp2 > 0 ? formatTpPrice(stratTp2, validEntry) : calcCtp2;
    const finalTp3 = stratTp3 > 0 ? formatTpPrice(stratTp3, validEntry) : calcCtp3;

    const finalClose1 = Number(strategyTps?.tp1ClosePct) || tp1ClosePct;
    const finalClose2 = Number(strategyTps?.tp2ClosePct) || tp2ClosePct;
    const finalClose3 = Number(strategyTps?.tp3ClosePct) || tp3ClosePct;

    const isFullyStrategy = stratTp2 > 0 && stratTp3 > 0;

    return {
      tp1: finalTp1,
      tp2: finalTp2,
      tp3: finalTp3,
      tp1ClosePct: finalClose1,
      tp2ClosePct: finalClose2,
      tp3ClosePct: finalClose3,
      mode,
      source: isFullyStrategy ? 'STRATEGY' : 'HYBRID',
      isStrategyOverridden: true,
      explanation: isFullyStrategy
        ? `Strategy Take Profit active (${finalTp1} / ${finalTp2} / ${finalTp3}) — overrides Centralised TP structure`
        : `Strategy TP1 (${finalTp1}) overrides Centralised; TP2/TP3 filled by Centralised TP structure (${mode})`
    };
  }

  // Centralised Take Profit applies (either strategy has no TP, or forceOverride is enabled)
  return {
    tp1: calcCtp1,
    tp2: calcCtp2,
    tp3: calcCtp3,
    tp1ClosePct,
    tp2ClosePct,
    tp3ClosePct,
    mode,
    source: 'CENTRALISED',
    isStrategyOverridden: false,
    explanation: forceOverride
      ? `Forced Centralised TP applied (${mode}: ${tp1Val} / ${tp2Val} / ${tp3Val}) — strategy TP overridden`
      : `Centralised Take Profit applied (${mode}: ${tp1Val} / ${tp2Val} / ${tp3Val})`
  };
}
