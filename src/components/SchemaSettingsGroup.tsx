import React from 'react';
import { SETTINGS_SCHEMA, SettingDef } from '../shared/settingsSchema';

interface Props {
  group: SettingDef['group'] | string;
  settings: Record<string, any>;
  onUpdateSetting: (key: string, value: any) => void;
  className?: string;
}

export const SchemaSettingsGroup: React.FC<Props> = ({
  group,
  settings,
  onUpdateSetting,
  className = ''
}) => {
  const groupFields = SETTINGS_SCHEMA.filter(s => s.group === group);

  if (groupFields.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groupFields.map((field) => {
          const val = settings[field.key] ?? field.default;

          return (
            <div
              key={field.key}
              className="p-3.5 rounded-xl bg-[#0E1117] border border-[#30363D] hover:border-gray-700 transition flex flex-col justify-between"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    {field.label}
                    {field.unit && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 font-mono">
                        {field.unit}
                      </span>
                    )}
                  </label>
                  {field.help && (
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{field.help}</p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-xs font-mono font-bold text-cyan-300">
                    {field.type === 'boolean'
                      ? (val ? 'ENABLED' : 'DISABLED')
                      : field.type === 'multiselect'
                      ? Array.isArray(val) ? `${val.length} selected` : 'None'
                      : field.type === 'object'
                      ? 'Configured'
                      : String(val)}
                  </span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-[#30363D]/60">
                {field.type === 'boolean' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{val ? 'Active' : 'Bypassed'}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateSetting(field.key, !val)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        val ? 'bg-cyan-500' : 'bg-gray-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          val ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}

                {field.type === 'number' && (
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={field.min ?? 0}
                      max={field.max ?? 100}
                      step={field.step ?? 1}
                      value={Number(val ?? field.default)}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value);
                        if (!isNaN(parsed)) onUpdateSetting(field.key, parsed);
                      }}
                      className="w-full accent-cyan-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                    />
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={val ?? field.default}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value);
                        onUpdateSetting(field.key, isNaN(parsed) ? field.default : parsed);
                      }}
                      className="w-20 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs font-mono text-white text-right focus:border-cyan-500 focus:outline-hidden"
                    />
                  </div>
                )}

                {field.type === 'select' && field.options && (
                  <select
                    value={val ?? field.default}
                    onChange={(e) => onUpdateSetting(field.key, e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-200 focus:border-cyan-500 focus:outline-hidden cursor-pointer"
                  >
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {field.type === 'multiselect' && field.options && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {field.options.map((opt) => {
                      const selected = Array.isArray(val) && val.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            const cur = Array.isArray(val) ? [...val] : [];
                            const next = selected ? cur.filter(x => x !== opt) : [...cur, opt];
                            onUpdateSetting(field.key, next);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer border ${
                            selected
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                              : 'bg-gray-900 text-gray-500 border-gray-800 hover:text-gray-300'
                          }`}
                        >
                          {selected ? '✓ ' : '+ '}{opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {field.type === 'string' && (
                  <input
                    type="text"
                    value={val ?? ''}
                    onChange={(e) => onUpdateSetting(field.key, e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-200 font-mono focus:border-cyan-500 focus:outline-hidden"
                  />
                )}

                {field.type === 'object' && field.key === 'strategyScoreThresholds' && (
                  <div className="space-y-1.5 pt-1">
                    {Object.entries(val || {}).map(([sKey, sVal]) => (
                      <div key={sKey} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-gray-400 text-[11px] truncate max-w-[160px]">{sKey}</span>
                        <input
                          type="number"
                          min={40}
                          max={95}
                          value={Number(sVal)}
                          onChange={(e) => {
                            const num = Number(e.target.value);
                            onUpdateSetting(field.key, { ...val, [sKey]: num });
                          }}
                          className="w-16 px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 text-right font-mono text-white text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {field.type === 'object' && field.key === 'regimeStrategyMatrix' && (
                  <div className="space-y-2 pt-1 text-xs">
                    {Object.entries(val || {}).map(([rKey, strats]: [string, any]) => (
                      <div key={rKey} className="p-2 rounded bg-gray-900/80 border border-gray-800">
                        <div className="font-bold text-cyan-300 text-[10px] uppercase mb-1">{rKey}</div>
                        <div className="flex flex-wrap gap-1">
                          {['RANGE_REGIME_V1', 'LIQUIDITY_SWEEP_REVERSAL', 'ORDER_BLOCK', 'TREND_PULLBACK', 'COIL_BREAKOUT', 'MULTICOIN_SCALPER_PRO'].map((st) => {
                            const isIncluded = Array.isArray(strats) && strats.includes(st);
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => {
                                  const curList = Array.isArray(strats) ? [...strats] : [];
                                  const updated = isIncluded ? curList.filter(x => x !== st) : [...curList, st];
                                  onUpdateSetting(field.key, { ...val, [rKey]: updated });
                                }}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition ${
                                  isIncluded
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                                    : 'bg-gray-800 text-gray-500 border-transparent hover:text-gray-300'
                                }`}
                              >
                                {st}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
