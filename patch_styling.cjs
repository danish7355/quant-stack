const fs = require('fs');

function patchFile(file, replacements) {
  let code = fs.readFileSync(file, 'utf8');
  for (const [find, replace] of replacements) {
    code = code.split(find).join(replace);
  }
  fs.writeFileSync(file, code);
}

// ScannerList
patchFile('src/components/ScannerList.tsx', [
  ['bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg', 'bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden'],
  ['bg-gray-950/40 border-b border-gray-800/80', 'bg-[#161B22] border-b border-[#30363D]'],
  ['bg-gray-900 border border-gray-800 focus:border-indigo-500', 'bg-[#0E1117] border border-[#30363D] focus:border-gray-500'],
  ['bg-gray-950/40 hover:bg-gray-900/60', 'hover:bg-[#21262D]'],
  ['bg-gray-900 text-gray-300 border border-gray-800 focus:border-indigo-500', 'bg-[#0E1117] text-gray-300 border border-[#30363D] focus:border-gray-500'],
  ['border-gray-800/80', 'border-[#30363D]'],
  ['text-indigo-400', 'text-gray-300'],
  ['text-emerald-400', 'text-emerald-400'],
  ['text-rose-400', 'text-rose-400'],
  ['bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30', 'bg-[#21262D] hover:bg-[#30363D] text-gray-300 border border-[#30363D]']
]);

// PerformancePage
patchFile('src/components/PerformancePage.tsx', [
  ['bg-gray-905 bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-sm flex flex-col justify-between', 'bg-[#161B22] border border-[#30363D] rounded-xl p-5 flex flex-col justify-between'],
  ['bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-sm flex flex-col justify-between', 'bg-[#161B22] border border-[#30363D] rounded-xl p-5 flex flex-col justify-between'],
  ['bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg', 'bg-[#161B22] border border-[#30363D] rounded-xl p-6'],
  ['border-gray-800', 'border-[#30363D]'],
  ['text-indigo-400', 'text-gray-200'] // Make Sharpe ratio neutral color
]);

