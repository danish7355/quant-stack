const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(
    'if (settingsRef.current.autoTradeEnabled) {\n      processAutoTradingRules(finalCoinsList);\n    }',
    '// processAutoTradingRules(finalCoinsList); // Disabled on frontend to prevent conflict with 24/7 backend'
);
fs.writeFileSync('src/App.tsx', code);
