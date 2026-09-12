const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsPanel.tsx', 'utf8');

code = code.replace(/bg-\[\#0f172a\]/g, 'bg-[#161B22]');
code = code.replace(/bg-\[\#1e293b\]/g, 'bg-[#0E1117]');
code = code.replace(/border-gray-800/g, 'border-[#30363D]');
code = code.replace(/border-gray-800\/50/g, 'border-[#30363D]');
code = code.replace(/bg-gray-900/g, 'bg-[#0E1117]');
code = code.replace(/border-gray-600/g, 'border-[#30363D]');
code = code.replace(/hover:bg-gray-700/g, 'hover:bg-[#21262D]');
code = code.replace(/text-gray-300/g, 'text-gray-400');
code = code.replace(/text-\[\#00e696\]/g, 'text-gray-200');
code = code.replace(/border-\[\#00e696\]/g, 'border-gray-200');
code = code.replace(/bg-\[\#00e696\] text-\[\#0f172a\]/g, 'bg-gray-200 text-[#0E1117]');
code = code.replace(/hover:bg-\[\#00c984\]/g, 'hover:bg-white');
code = code.replace(/shadow-emerald-950/g, 'shadow-sm');

fs.writeFileSync('src/components/SettingsPanel.tsx', code);
