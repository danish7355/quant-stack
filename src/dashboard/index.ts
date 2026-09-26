// src/dashboard/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight Express dashboard for strategy signals, regime status, and risk audit.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import fs from 'fs';
import path from 'path';

export function createDashboardApp() {
  const app = express();
  const logFile = path.resolve(process.cwd(), 'logs', 'strategies.log');

  function readRecentSignals(limit = 100): any[] {
    if (!fs.existsSync(logFile)) return [];
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      const parsed: any[] = [];
      for (let i = lines.length - 1; i >= 0 && parsed.length < limit; i--) {
        try {
          parsed.push(JSON.parse(lines[i]));
        } catch {
          // ignore corrupted lines
        }
      }
      return parsed;
    } catch {
      return [];
    }
  }

  app.get('/api/signals', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json(readRecentSignals(limit));
  });

  app.get('/api/summary', (_req, res) => {
    const signals = readRecentSignals(200);
    const accepted = signals.filter(s => !s.rejectionReason);
    const rejected = signals.filter(s => !!s.rejectionReason);

    const byStrategy: Record<string, { total: number; accepted: number; rejected: number }> = {};
    for (const s of signals) {
      const strat = s.strategy || 'unknown';
      if (!byStrategy[strat]) byStrategy[strat] = { total: 0, accepted: 0, rejected: 0 };
      byStrategy[strat].total++;
      if (s.rejectionReason) byStrategy[strat].rejected++;
      else byStrategy[strat].accepted++;
    }

    res.json({
      total: signals.length,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      byStrategy,
      lastUpdated: new Date().toISOString(),
    });
  });

  app.get('/', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Quant Strategy Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f1f5f9; padding: 24px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 6px; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    p.sub { font-size: 14px; color: #94a3b8; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; }
    .card-title { font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 8px; }
    .card-val { font-size: 28px; font-weight: 700; color: #f8fafc; }
    .val-green { color: #4ade80; }
    .val-red { color: #f87171; }
    .val-cyan { color: #38bdf8; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; border: 1px solid #334155; font-size: 13px; }
    th { background: #0f172a; padding: 12px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; border-bottom: 1px solid #334155; }
    td { padding: 10px 14px; border-bottom: 1px solid #1e293b; }
    tr:nth-child(even) { background: #162032; }
    tr:hover { background: #233554; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .tag-long { background: rgba(74, 222, 128, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); }
    .tag-short { background: rgba(248, 113, 113, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }
    .tag-valid { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
    .tag-reject { background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
    .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .live-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #4ade80; font-weight: 600; }
    .pulse { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; box-shadow: 0 0 8px #4ade80; }
  </style>
</head>
<body>
  <div class="header-row">
    <div>
      <h1>⚡ Quant Strategy Signal Dashboard</h1>
      <p class="sub">Auditable multi-strategy signal monitoring, risk buffer checks & execution pipeline</p>
    </div>
    <div class="live-badge">
      <div class="pulse"></div> Live Auto-Refresh (5s)
    </div>
  </div>

  <div class="grid" id="stats-grid">
    <div class="card"><div class="card-title">Total Signals Logged</div><div class="card-val val-cyan" id="total-val">-</div></div>
    <div class="card"><div class="card-title">Accepted Signals</div><div class="card-val val-green" id="accepted-val">-</div></div>
    <div class="card"><div class="card-title">Rejected / Filtered</div><div class="card-val val-red" id="rejected-val">-</div></div>
    <div class="card"><div class="card-title">Active Strategies</div><div class="card-val" id="strat-val">-</div></div>
  </div>

  <h2 style="font-size: 16px; margin-bottom: 12px; color: #e2e8f0;">Recent Signals & Execution Audit</h2>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Strategy</th>
        <th>Symbol</th>
        <th>Direction</th>
        <th>Entry</th>
        <th>Stop Loss</th>
        <th>Target 1</th>
        <th>ATR</th>
        <th>Setup Score</th>
        <th>Status / Reason</th>
      </tr>
    </thead>
    <tbody id="signals-body">
      <tr><td colspan="10" style="text-align: center; color: #64748b; padding: 24px;">Loading signals...</td></tr>
    </tbody>
  </table>

  <script>
    async function refresh() {
      try {
        const [sumRes, sigRes] = await Promise.all([
          fetch('/api/summary').then(r => r.json()),
          fetch('/api/signals?limit=40').then(r => r.json())
        ]);

        document.getElementById('total-val').textContent = sumRes.total;
        document.getElementById('accepted-val').textContent = sumRes.acceptedCount;
        document.getElementById('rejected-val').textContent = sumRes.rejectedCount;
        document.getElementById('strat-val').textContent = Object.keys(sumRes.byStrategy || {}).length;

        const tbody = document.getElementById('signals-body');
        if (!sigRes.length) {
          tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #64748b; padding: 24px;">No signals logged yet. Active trading loops write to logs/strategies.log.</td></tr>';
          return;
        }

        tbody.innerHTML = sigRes.map(s => {
          const isReject = !!s.rejectionReason;
          const dirTag = s.direction === 'long' 
            ? '<span class="tag tag-long">LONG</span>' 
            : s.direction === 'short' 
              ? '<span class="tag tag-short">SHORT</span>' 
              : '<span class="tag">-</span>';
          const statusTag = isReject 
            ? \`<span class="tag tag-reject">\${s.rejectionReason}</span>\`
            : '<span class="tag tag-valid">CONFIRMED</span>';

          const time = s.ts ? new Date(s.ts).toLocaleTimeString() : '-';
          return \`<tr>
            <td>\${time}</td>
            <td><strong>\${s.strategy || '-'}</strong></td>
            <td>\${s.symbol || '-'}</td>
            <td>\${dirTag}</td>
            <td>\${s.entry !== undefined ? Number(s.entry).toFixed(4) : '-'}</td>
            <td>\${s.sl !== undefined ? Number(s.sl).toFixed(4) : '-'}</td>
            <td>\${s.tp1 !== undefined ? Number(s.tp1).toFixed(4) : '-'}</td>
            <td>\${s.atr !== undefined ? Number(s.atr).toFixed(4) : '-'}</td>
            <td>\${s.setupScore !== undefined ? s.setupScore : '-'}</td>
            <td>\${statusTag}</td>
          </tr>\`;
        }).join('');
      } catch (e) {
        console.error('Failed to refresh dashboard', e);
      }
    }
    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`);
  });

  return app;
}

export function startDashboard(port = 4500) {
  const app = createDashboardApp();
  return app.listen(port, () => {
    console.log(`[Dashboard] Strategy Signal Dashboard running at http://localhost:${port}`);
  });
}

// Allow direct run via tsx
if (process.argv[1]?.includes('dashboard')) {
  startDashboard(Number(process.env.DASHBOARD_PORT) || 4500);
}
