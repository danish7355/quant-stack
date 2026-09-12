const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  /'bg-blue-500\/10 text-blue-400 font-bold'/g,
  "'bg-[#21262D] text-gray-200 font-bold border border-[#30363D]'"
);

fs.writeFileSync('src/App.tsx', code);
