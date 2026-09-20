import fs from 'fs';

let panel = fs.readFileSync('src/components/StrategyPanel.tsx', 'utf8');

// Replace handleToggleRegimeForStrategy with a no-op so it compiles, or just remove the chips toggle UI.
panel = panel.replace(/const handleToggleRegimeForStrategy = \([\s\S]*?handleUpdateBucket\(updated\);\n  };/g, "const handleToggleRegimeForStrategy = () => {};");
panel = panel.replace(/const exists = item\.direction === \(regime\);[\s\S]*?return \{ \.\.\.item, regimes: newRegimes \};/g, "return item;");

// Replace onClick={() => handleToggleRegimeForStrategy(strategy.id, r.key)} with a no-op
panel = panel.replace(/onClick=\{.*?handleToggleRegimeForStrategy.*?\}/g, "");

// Replace the styling condition for chips (which was using item.direction === r.key)
panel = panel.replace(/className=\{\`[\s\S]*?exists \? r\.badgeBg : 'bg-slate-800\/50 border-slate-700 text-slate-500'[\s\S]*?\}/g, "className={`px-2 py-1 rounded border text-xs cursor-pointer select-none transition-colors bg-slate-800/50 border-slate-700 text-slate-500`}");

// Fix the array map error by removing the chips map entirely from the UI, just show strategy name.
panel = panel.replace(/<div className="flex gap-2 mt-3">[\s\S]*?<\/div>\n.*?<\/div>/g, "</div>");

fs.writeFileSync('src/components/StrategyPanel.tsx', panel);

