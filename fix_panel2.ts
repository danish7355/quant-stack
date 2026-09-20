import fs from 'fs';

let panel = fs.readFileSync('src/components/StrategyPanel.tsx', 'utf8');

// The original fix_panel missed some things because it matched too specifically.
panel = panel.replace(/\{ key: 'trending',/g, "{ key: 'TRENDING_UP',");
panel = panel.replace(/\{ key: 'ranging',/g, "{ key: 'RANGING',");
panel = panel.replace(/\{ key: 'exhaustion',/g, "{ key: 'EXHAUSTION_UP',");
panel = panel.replace(/\{ key: 'breakout',/g, "{ key: 'BREAKOUT_UP',");
panel = panel.replace(/\.regimes/g, ".direction");
panel = panel.replace(/item\.direction\.includes/g, "item.direction === ");
panel = panel.replace(/item\.direction\.filter/g, "([item.direction]).filter");
panel = panel.replace(/s\.direction\.join\(\', \'\)/g, "s.direction || 'BOTH'");

fs.writeFileSync('src/components/StrategyPanel.tsx', panel);

let auto = fs.readFileSync('server/services/AutoTrader.ts', 'utf8');
auto = auto.replace(/regime: 'not_tradable'/g, "regime: 'PANIC'");
fs.writeFileSync('server/services/AutoTrader.ts', auto);
