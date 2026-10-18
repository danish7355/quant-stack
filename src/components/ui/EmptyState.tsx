import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center bg-[#161B22]/50 border border-dashed border-[#30363D] rounded-xl ${className}`}
    >
      {icon && (
        <div className="w-12 h-12 rounded-full bg-[#21262D] border border-[#30363D] flex items-center justify-center text-gray-400 mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      {description && (
        <p className="text-xs text-gray-400 max-w-sm mt-1 mb-4">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
