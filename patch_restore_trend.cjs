const fs = require('fs');
let code = fs.readFileSync('src/components/StrategyPanel.tsx', 'utf8');

const targetStr = '            {/* SMC Liquidity Sweep */}';

const trendCard = `            <button
              onClick={() => handleInputChange('activeStrategy', 'TREND_PULLBACK')}
              className={\`p-4 rounded-xl border flex flex-col items-start justify-between gap-2 transition-all cursor-pointer text-left \${
                settings.activeStrategy === 'TREND_PULLBACK' 
                  ? 'border-blue-400 bg-blue-400/10 text-blue-400' 
                  : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500'
              }\`}
            >
              <div className="font-bold text-sm">Trend Pullback</div>
              <div className="text-[11px] opacity-80 leading-relaxed">Rides macro trend, enters on pullback rejection at moving averages</div>
            </button>

`;

code = code.replace(targetStr, trendCard + targetStr);

fs.writeFileSync('src/components/StrategyPanel.tsx', code);
