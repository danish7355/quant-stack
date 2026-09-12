const fs = require('fs');
let code = fs.readFileSync('src/components/ActiveTrades.tsx', 'utf8');

// Remove side accent
const accentRegex = /\{\/\* Visual side accent \*\/\}\s*<div\s*className=\{\`absolute top-0 bottom-0 left-0 w-1 \$\{\s*isLong \? 'bg-emerald-500' : 'bg-rose-500'\s*\}\`\}\s*\/>/g;
code = code.replace(accentRegex, '');

// Clean up card styling
code = code.replace(
  'className="relative bg-gray-950/60 border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-all duration-200 overflow-hidden shadow-inner flex flex-col justify-between"',
  'className="bg-[#121418] border border-gray-800/60 hover:border-gray-700/80 rounded-xl p-5 transition-colors flex flex-col justify-between"'
);

// Clean up wrapping container styling
code = code.replace(
  'className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg"',
  'className="bg-[#161B22] border border-[#30363D] rounded-xl p-6"'
);

fs.writeFileSync('src/components/ActiveTrades.tsx', code);
