const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');
code = code.replace(
  "  vcbSlBufferAtrMult: number;",
  "  vcbSlBufferAtrMult: number;\n\n  // Dynamic Enhancements\n  useMtfAlignment: boolean;\n  useVpvrFilter: boolean;\n  useAtrTrailingStop: boolean;\n  trailingStopAtrMultiplier: number;"
);
fs.writeFileSync('src/types.ts', code);
