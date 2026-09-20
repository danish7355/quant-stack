import React from 'react';
import { ShieldAlert, TrendingDown, AlertTriangle } from 'lucide-react';

export function RiskCenter() {
  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex items-center gap-2 mb-6">
        <ShieldAlert className="text-amber-400" size={24} />
        <h2 className="text-lg font-bold text-gray-100">Risk Center</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-5">
          <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">
            <TrendingDown size={16} className="text-red-400" />
            Daily Drawdown & Limits
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Current Daily Loss</span>
                <span className="text-emerald-400 font-bold">0.00%</span>
              </div>
              <div className="w-full bg-[#0E1117] rounded-full h-1.5 border border-[#30363D]">
                <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: '0%' }}></div>
              </div>
            </div>
            
            <div className="p-3 bg-[#0E1117] border border-[#30363D] rounded-md text-xs text-gray-400">
              The Daily Loss Circuit Breaker is configured at <strong className="text-gray-200">5.0%</strong>. 
              If net losses exceed this threshold within a rolling 24-hour period, all new trade entries will be strictly blocked.
            </div>
          </div>
        </div>

        <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-5">
          <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" />
            Exposure
          </h3>
          <div className="space-y-4 text-xs">
            <div className="flex justify-between border-b border-[#30363D] pb-2">
              <span className="text-gray-400">Total Open Risk (SL Hits)</span>
              <span className="text-gray-200 font-bold">0.00%</span>
            </div>
            <div className="flex justify-between border-b border-[#30363D] pb-2">
              <span className="text-gray-400">Long Exposure</span>
              <span className="text-emerald-400 font-bold">0%</span>
            </div>
            <div className="flex justify-between border-b border-[#30363D] pb-2">
              <span className="text-gray-400">Short Exposure</span>
              <span className="text-red-400 font-bold">0%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
