import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramService, escapeHtml, formatPrice, formatNum } from '../../server/services/TelegramService';

describe('TelegramService - Robustness & Alert Bug Fixes', () => {
  let service: TelegramService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    service = new TelegramService(false);
    // Configure with valid test credentials
    service.updateConfig('123456:TEST_TOKEN', '987654321');
    service.alertOnNewSignal = true;
    service.alertOnTradeExecuted = true;
    service.alertOnTpHit = true;
    service.alertOnSlHit = true;
    service.alertOnTsMoved = true;
    service.alertOnDailyLossLimit = true;
    service.alertOnRangingDetected = true;
    service.alertFormat = 'Verbose';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Sanitization & Helpers', () => {
    it('strips redundant "bot" prefix from tokens', () => {
      expect(service.sanitizeToken('bot123456:ABC-DEF')).toBe('123456:ABC-DEF');
      expect(service.sanitizeToken('BOT999999:SECRET')).toBe('999999:SECRET');
      expect(service.sanitizeToken('   bot777777:KEY   ')).toBe('777777:KEY');
      expect(service.sanitizeToken('123456:PLAIN')).toBe('123456:PLAIN');
      expect(service.sanitizeToken(undefined)).toBe('');
    });

    it('strips quotes and whitespace from chat IDs', () => {
      expect(service.sanitizeChatId('"12345678"')).toBe('12345678');
      expect(service.sanitizeChatId("'987654321'")).toBe('987654321');
      expect(service.sanitizeChatId('  -100123456789  ')).toBe('-100123456789');
      expect(service.sanitizeChatId(undefined)).toBe('');
    });

    it('escapes HTML special characters safely', () => {
      expect(escapeHtml('BTC & ETH < 50000 > 40000')).toBe('BTC &amp; ETH &lt; 50000 &gt; 40000');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml(null)).toBe('');
    });

    it('formats prices and numbers safely without throwing TypeError on undefined/null/NaN', () => {
      expect(formatPrice(undefined)).toBe('0.00');
      expect(formatPrice(null)).toBe('0.00');
      expect(formatPrice(NaN)).toBe('0.00');
      expect(formatPrice(65432.1)).toBe('65,432.10');

      expect(formatNum(undefined)).toBe('0.00');
      expect(formatNum(null)).toBe('0.00');
      expect(formatNum(NaN)).toBe('0.00');
      expect(formatNum(12.3456, 4)).toBe('12.3456');
    });

    it('correctly reports isConfigured()', () => {
      const empty = new TelegramService();
      empty.updateConfig('', '');
      expect(empty.isConfigured()).toBe(false);

      empty.updateConfig('valid_token', '');
      expect(empty.isConfigured()).toBe(false);

      empty.updateConfig('valid_token', 'valid_chat');
      expect(empty.isConfigured()).toBe(true);
    });

    it('does not overwrite configured token or chatId with masked strings containing **** or ••••', async () => {
      service.updateConfig('real_valid_token_123', 'real_chat_id_456');
      expect(service.isConfigured()).toBe(true);

      // Attempt to overwrite with masked token/chat via updateConfig
      service.updateConfig('real_va****', 'real_ch****');

      // Attempt to overwrite with masked token/chat via updateSettings
      service.updateSettings({
        telegramBotToken: '••••••••',
        telegramChatId: '••••••••'
      });

      let sentUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        sentUrl = url;
        return { json: async () => ({ ok: true, result: { message_id: 999 } }) };
      });

      await service.sendMessage('Test');
      expect(sentUrl).toBe('https://api.telegram.org/botreal_valid_token_123/sendMessage');
    });
  });

  describe('Unfreezable Queue & Error Handling', () => {
    it('does not permanently freeze queue if fetch rejects with network error', async () => {
      // Mock fetch rejection on first attempt
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network connection offline'));

      const res1 = await service.sendMessage('First alert');
      expect(res1).toBe(false);
      expect(service.getLastError()).toContain('Network connection offline');

      // Second attempt succeeds - queue processor must not be stuck!
      global.fetch = vi.fn().mockResolvedValueOnce({
        json: async () => ({ ok: true, result: { message_id: 101 } })
      } as any);

      const res2 = await service.sendMessage('Second alert');
      expect(res2).toBe(true);
      expect(service.getLastError()).toBe('');
    });

    it('records exact Telegram API error message on 400 (e.g., chat not found)', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        status: 400,
        json: async () => ({
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found'
        })
      } as any);

      const success = await service.sendMessage('Test message');
      expect(success).toBe(false);
      expect(service.getLastError()).toBe('Bad Request: chat not found');
    });

    it('falls back to plain text if HTML entity parsing fails', async () => {
      // 1st call: Telegram returns entity parse error
      // 2nd call: Fallback with plain text succeeds
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          status: 400,
          json: async () => ({
            ok: false,
            error_code: 400,
            description: "Bad Request: can't parse entities: Unexpected end tag"
          })
        } as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: 102 }
          })
        } as any);

      global.fetch = fetchMock;

      const success = await service.sendMessage('<b>Broken tag test');
      expect(success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify the 2nd call had HTML tags stripped
      const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(secondCallBody.text).toBe('Broken tag test');
      expect(secondCallBody.parse_mode).toBeUndefined();
    });
  });

  describe('Alert Event Triggers', () => {
    it('sends notifyTradeOpen with HTML formatting and handles missing optional fields gracefully', async () => {
      let sentBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (_, opts) => {
        sentBody = JSON.parse(opts.body);
        return { json: async () => ({ ok: true }) };
      });

      const success = await service.notifyTradeOpen({
        id: 'pos_123',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        entry_price: 65000,
        // intentionally omit optional fields to verify null-safety
      });

      expect(success).toBe(true);
      expect(sentBody.chat_id).toBe('987654321');
      expect(sentBody.parse_mode).toBe('HTML');
      expect(sentBody.text).toContain('BTCUSDT');
      expect(sentBody.text).toContain('LONG');
    });

    it('respects alertOnTradeExecuted = false', async () => {
      service.alertOnTradeExecuted = false;
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      const success = await service.notifyTradeOpen({
        id: 'pos_123',
        symbol: 'ETHUSDT',
        direction: 'SHORT',
        entry_price: 3500
      });

      expect(success).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends notifyTradeClose with profit and stop loss details', async () => {
      let sentBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (_, opts) => {
        sentBody = JSON.parse(opts.body);
        return { json: async () => ({ ok: true }) };
      });

      const success = await service.notifyTradeClose({
        id: 'pos_456',
        symbol: 'SOLUSDT',
        direction: 'LONG',
        entry_price: 150,
        allocated_balance: 500
      }, 165, 50, 10, 'TP1');

      expect(success).toBe(true);
      expect(sentBody.text).toContain('TRADE CLOSED');
      expect(sentBody.text).toContain('SOLUSDT');
      expect(sentBody.text).toContain('+$50.00');
      expect(sentBody.text).toContain('+10.00%');
    });

    it('sends notifyTrailingStop when trailing stop moves', async () => {
      let sentBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (_, opts) => {
        sentBody = JSON.parse(opts.body);
        return { json: async () => ({ ok: true }) };
      });

      // Long position trailing stop moved above entry price (Profit locked)
      const success = await service.notifyTrailingStop({
        id: 'pos_789',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        entry_price: 60000
      }, 59000, 61000, 63000);

      expect(success).toBe(true);
      expect(sentBody.text).toContain('TRAILING STOP UPDATED');
      expect(sentBody.text).toContain('PROFIT LOCKED');
      expect(sentBody.text).toContain('$59,000.00');
      expect(sentBody.text).toContain('$61,000.00');
    });

    it('sends notifyDailyLossLimit when daily loss threshold breached', async () => {
      let sentBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (_, opts) => {
        sentBody = JSON.parse(opts.body);
        return { json: async () => ({ ok: true }) };
      });

      const success = await service.notifyDailyLossLimit(-3.5, -3.0);
      expect(success).toBe(true);
      expect(sentBody.text).toContain('DAILY LOSS LIMIT REACHED');
      expect(sentBody.text).toContain('-3.50%');
      expect(sentBody.text).toContain('-3.00%');
    });

    it('sends notifySignal when high-score signal is detected', async () => {
      let sentBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (_, opts) => {
        sentBody = JSON.parse(opts.body);
        return { json: async () => ({ ok: true }) };
      });

      const success = await service.notifySignal({
        symbol: 'DOGEUSDT',
        direction: 'LONG',
        strategy: 'VOLATILITY_COMPRESSION',
        score: 92,
        price: 0.15,
        sl: 0.142,
        tp1: 0.165,
        reason: 'Squeeze break + 3.2x RVOL'
      });

      expect(success).toBe(true);
      expect(sentBody.text).toContain('HIGH-SCORE SIGNAL DETECTED');
      expect(sentBody.text).toContain('DOGEUSDT');
      expect(sentBody.text).toContain('92/100');
    });
  });
});
