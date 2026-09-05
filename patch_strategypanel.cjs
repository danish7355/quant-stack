const fs = require('fs');
let code = fs.readFileSync('src/components/StrategyPanel.tsx', 'utf8');

// Replace cyan glowing shadow with clean border
code = code.replace(
  /'bg-cyan-500\/10 border-cyan-500 shadow-\[0_0_15px_rgba\(6,182,212,0\.15\)\]'/g,
  "'bg-[#1F2937] border-cyan-500/80'"
);
// Make the default card states a clean neutral
code = code.replace(
  /'bg-gray-800\/40 border-gray-700\/50 hover:bg-gray-800\/80'/g,
  "'bg-[#161B22] border-[#30363D] hover:border-gray-500'"
);
code = code.replace(
  /'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500'/g,
  "'border-[#30363D] bg-[#161B22] text-gray-400 hover:border-gray-500'"
);

// Container backgrounds
code = code.replace(
  /className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg max-h-\[calc\(100vh-80px\)\] overflow-y-auto"/g,
  'className="bg-[#0E1117] border-r border-[#30363D] h-full p-6 overflow-y-auto"'
);
code = code.replace(
  /className="bg-gray-800\/50 rounded-xl p-5 border border-gray-700\/50"/g,
  'className="bg-[#161B22] rounded-xl p-5 border border-[#30363D]"'
);
code = code.replace(
  /className="bg-gray-800\/30 rounded-xl p-6 border border-gray-700\/50 space-y-4"/g,
  'className="bg-[#161B22] rounded-xl p-6 border border-[#30363D] space-y-4"'
);

fs.writeFileSync('src/components/StrategyPanel.tsx', code);
