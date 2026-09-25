/**
 * Database Collection Namespacing
 * Provides isolated collections for multi-instance deployments
 * (e.g. local vs Render, or multiple bots sharing the same Firebase project).
 * Set APP_INSTANCE_ID or APP_PREFIX in environment variables.
 * Default: 'quant_stack' -> produces 'quant_stack_positions', 'quant_stack_trade_logs', etc.
 */

const rawPrefix = process.env.APP_PREFIX || process.env.APP_INSTANCE_ID || 'quant_stack';
export const APP_PREFIX = rawPrefix ? (rawPrefix.endsWith('_') ? rawPrefix : `${rawPrefix}_`) : 'quant_stack_';

export const COLLECTIONS = {
  POSITIONS: `${APP_PREFIX}positions`,
  TRADE_LOGS: `${APP_PREFIX}trade_logs`,
  SETTINGS: `${APP_PREFIX}settings`,
  SETTINGS_DOC: 'bot_config',
  SIGNAL_AUDITS: `${APP_PREFIX}signal_audits`,
  SETTINGS_AUDIT: `${APP_PREFIX}settings_audit`,
  TRADE_ADMISSIONS: `${APP_PREFIX}trade_admissions`,
} as const;

export function getAppPrefix(): string {
  return APP_PREFIX;
}
