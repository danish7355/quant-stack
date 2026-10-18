import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none gap-2';

  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30',
    secondary: 'bg-[#21262D] hover:bg-[#30363D] text-gray-200 border border-[#30363D]',
    outline: 'border border-[#30363D] hover:bg-[#21262D] text-gray-300 hover:text-white',
    ghost: 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]',
    danger: 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30',
    success: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30',
  };

  const sizes: Record<ButtonSize, string> = {
    xs: 'px-2 py-1 text-[11px] h-6',
    sm: 'px-2.5 py-1.5 text-xs h-7.5',
    md: 'px-3.5 py-2 text-xs sm:text-sm h-9',
    lg: 'px-5 py-2.5 text-sm h-11',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
