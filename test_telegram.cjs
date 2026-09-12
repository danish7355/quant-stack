const botToken = '8995200775:AAEPDZ9V9wHxon1qupNgAV_Pi_R7WWNNp4U';
const chatId = '5029073195';

async function testTelegram() {
  console.log("Testing Telegram dispatch...");
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  // Test 1: Simple message
  try {
    const res1 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: "🔔 *Bot Test Alert*\nTesting Telegram connectivity from server.",
        parse_mode: 'Markdown'
      })
    });
    const data1 = await res1.json();
    console.log("Test 1 (Simple message) result:", data1);
  } catch (e) {
    console.error("Test 1 error:", e);
  }

  // Test 2: Trade open notification message format (as formatted in TelegramService.ts)
  const isLong = true;
  const icon = isLong ? '🟢' : '🔴';
  const arrow = isLong ? '📈 LONG' : '📉 SHORT';
  const stratName = '💥 VCB Breakout (Squeeze)';
  const freqBadge = '🛡️ Low Freq (Strict)';
  const regimeLine = '*Detected Regime:* `Consolidation Squeeze`\n';
  const modeBadge = '*Selection Mode:* `Manual / Default`\n';
  const pos = {
    symbol: 'KATUSDT',
    entry_price: 0.00579,
    leverage: 1,
    allocated_balance: 1005.00,
    quantity: 173576,
    tp1: 0.00593,
    tp2: 0.00593,
    tp3: 0.00593,
    sl: 0.00562
  };
  const score = 100;

  const message = `${icon} *24/7 BOT: TRADE OPENED*\n\n` +
    `*Pair:* \`${pos.symbol}\`\n` +
    `*Action:* ${arrow}\n` +
    `*Strategy:* \`${stratName}\`\n` +
    regimeLine +
    modeBadge +
    `*Frequency Mode:* \`${freqBadge}\`\n` +
    `*Entry Price:* \`$${pos.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
    `*Leverage:* \`${pos.leverage}x\`\n` +
    `*Allocated Margin:* \`$${pos.allocated_balance.toFixed(2)}\`\n` +
    `*Position Size:* \`$${(pos.allocated_balance * pos.leverage).toFixed(2)}\` (\`${pos.quantity.toFixed(4)}\`)\n` +
    (score ? `*Strategy Score:* \`${score}/100\`\n` : '') +
    `----------------------------\n` +
    `🎯 *TP1:* \`$${pos.tp1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
    `🎯 *TP2:* \`$${pos.tp2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
    `🎯 *TP3:* \`$${pos.tp3.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n` +
    `🛑 *Stop Loss:* \`$${pos.sl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\`\n\n` +
    `⏰ _Time: ${new Date().toUTCString()}_`;

  try {
    const res2 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    const data2 = await res2.json();
    console.log("Test 2 (Trade open format) result:", data2);
  } catch (e) {
    console.error("Test 2 error:", e);
  }
}

testTelegram().catch(console.error);
