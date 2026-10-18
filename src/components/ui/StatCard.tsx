import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  className?: string;
}

export function StatCard({
  label,
  value,
  subValue,
  change,
  changeLabel,
  icon,
  variant = 'default',
  className = '',
}: StatCardProps) {
  const borderVariants = {
    default: 'border-[#30363D]',
    success: 'border-emerald-500/30 bg-gradient-to-b from-[#161B22] to-emerald-950/10',
    danger: 'border-rose-500/30 bg-gradient-to-b from-[#161B22] to-rose-950/10',
    warning: 'border-amber-500/30 bg-gradient-to-b from-[#161B22] to-amber-950/10',
    info: 'border-blue-500/30 bg-gradient-to-b from-[#161B22] to-blue-950/10',
  };

  return (
    <div
      className={`bg-[#161B22] border rounded-xl p-4 transition-all duration-200 hover:border-[#484F58] ${borderVariants[variant]} ${className}`}
    >
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
        <span className="font-medium tracking-wide uppercase text-[11px] text-gray-400">
          {label}
        </span>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xl sm:text-2xl font-bold text-gray-100 font-mono tabular-nums tracking-tight">
          {value}
        </div>
        {change !== undefined && (
          <span
            className={`text-xs font-semibold tabular-nums ${
              change >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {change >= 0 ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        )}
      </div>

      {(subValue || changeLabel) && (
        <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
          {subValue && <span className="font-mono">{subValue}</span>}
          {changeLabel && <span>{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
