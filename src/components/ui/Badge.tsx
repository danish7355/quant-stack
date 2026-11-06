import React from 'react';

export type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'info' | 'purple' | 'outline';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}

export function Badge({
  variant = 'default',
  size = 'sm',
  className = '',
  children,
  ...props
}: BadgeProps) {
  const variantStyles: Record<BadgeVariant, string> = {
    default: 'bg-[#21262D] text-gray-300 border-[#30363D]',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    danger: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    purple: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    outline: 'bg-transparent text-gray-400 border-[#30363D]',
  };

  const sizeStyles = {
    xs: 'px-1.5 py-0.2 text-[10px] leading-tight',
    sm: 'px-2 py-0.5 text-[11px] leading-tight',
    md: 'px-2.5 py-1 text-xs',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold border rounded-md uppercase tracking-wider tabular-nums ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
