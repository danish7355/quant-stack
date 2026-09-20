import fs from 'fs';

let panel = fs.readFileSync('src/components/StrategyPanel.tsx', 'utf8');

panel = panel.replace(/regime: 'trending'/g, "regime: 'TRENDING_UP'");
panel = panel.replace(/regime: 'ranging'/g, "regime: 'RANGING'");
panel = panel.replace(/regime: 'exhaustion'/g, "regime: 'EXHAUSTION_UP'");
panel = panel.replace(/regime: 'breakout'/g, "regime: 'BREAKOUT_UP'");
panel = panel.replace(/item\.regimes/g, "item.direction");

fs.writeFileSync('src/components/StrategyPanel.tsx', panel);

let auto = fs.readFileSync('server/services/AutoTrader.ts', 'utf8');
auto = auto.replace(/regime: 'not_tradable'/g, "regime: 'PANIC'");
fs.writeFileSync('server/services/AutoTrader.ts', auto);
