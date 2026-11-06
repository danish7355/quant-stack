import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center rounded-xl bg-[#121721] border border-[#232B3B] ${className}`}>
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-[#1A202E] border border-[#2A3447] flex items-center justify-center text-gray-400 mb-3">
          <Icon size={22} className="stroke-[1.75]" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      <p className="text-xs text-gray-400 mt-1 max-w-sm leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-3.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 text-xs font-medium transition-colors cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
