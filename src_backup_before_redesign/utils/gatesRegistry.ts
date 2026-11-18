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

// Option C: All algorithmic strategy setups, indicator filters, and gates have been cleared.
export const GATES_REGISTRY: GateDefinition[] = [];

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
  return {
    strategy: (settings.activeStrategies && settings.activeStrategies.length > 0)
      ? settings.activeStrategies.join(', ')
      : (settings.activeStrategy || 'NONE'),
    isTradeReady: false,
    blockingGateCount: 0,
    bypassedGateCount: 0,
    evaluatedGates: [],
    primaryBlockReason: 'All strategy setups and gates cleared'
  };
}
