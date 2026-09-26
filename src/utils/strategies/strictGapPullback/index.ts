// src/utils/strategies/strictGapPullback/index.ts
export { evaluateStrictGapPullback } from "./engine";
export { formatSignalOutput } from "./formatter";
export {
  evaluateTradeManagement,
  type ManagementAction,
  type TradeState,
  type ManagementResult,
} from "./tradeManager";
export * from "./types";
