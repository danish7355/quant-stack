import React, { useState, useRef, useEffect } from 'react';
import { AlertOctagon } from 'lucide-react';

interface ConfirmHoldButtonProps {
  onConfirm: () => void;
  holdDurationMs?: number;
  label?: string;
  holdingLabel?: string;
  confirmedLabel?: string;
  icon?: React.ReactNode;
  className?: string;
  variant?: 'danger' | 'warning' | 'primary';
  disabled?: boolean;
}

export function ConfirmHoldButton({
  onConfirm,
  holdDurationMs = 1500,
  label = 'HOLD TO CONFIRM',
  holdingLabel = 'HOLD TO TRIGGER...',
  confirmedLabel = 'CONFIRMED',
  icon = <AlertOctagon size={16} />,
  className = '',
  variant = 'danger',
  disabled = false,
}: ConfirmHoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isTriggered, setIsTriggered] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const startHold = () => {
    if (disabled || isTriggered) return;
    setIsHolding(true);
    startTimeRef.current = Date.now();

    const update = () => {
      if (!startTimeRef.current) return;
      const elapsed = Date.now() - startTimeRef.current;
      const currentProgress = Math.min(100, (elapsed / holdDurationMs) * 100);
      setProgress(currentProgress);

      if (currentProgress >= 100) {
        setIsTriggered(true);
        setIsHolding(false);
        onConfirm();
        setTimeout(() => {
          setIsTriggered(false);
          setProgress(0);
        }, 1500);
      } else {
        animFrameRef.current = requestAnimationFrame(update);
      }
    };

    animFrameRef.current = requestAnimationFrame(update);
  };

  const cancelHold = () => {
    if (isTriggered) return;
    setIsHolding(false);
    setProgress(0);
    startTimeRef.current = null;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const variantColors = {
    danger: {
      bg: 'bg-rose-950/40 hover:bg-rose-950/60 border-rose-500/40 text-rose-300',
      fill: 'bg-rose-600',
    },
    warning: {
      bg: 'bg-amber-950/40 hover:bg-amber-950/60 border-amber-500/40 text-amber-300',
      fill: 'bg-amber-600',
    },
    primary: {
      bg: 'bg-indigo-950/40 hover:bg-indigo-950/60 border-indigo-500/40 text-indigo-300',
      fill: 'bg-indigo-600',
    },
  };

  const currentTheme = variantColors[variant];

  return (
    <button
      type="button"
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          startHold();
        }
      }}
      onKeyUp={cancelHold}
      disabled={disabled}
      className={`relative overflow-hidden select-none border rounded-lg px-4 py-2.5 font-bold text-xs tracking-wider transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${currentTheme.bg} ${className}`}
    >
      {/* Progress fill overlay */}
      <div
        className={`absolute inset-0 opacity-40 transition-none ${currentTheme.fill}`}
        style={{ width: `${progress}%` }}
      />

      <div className="relative z-10 flex items-center justify-center gap-2">
        {icon}
        <span>
          {isTriggered
            ? confirmedLabel
            : isHolding
            ? `${holdingLabel} (${Math.round(progress)}%)`
            : label}
        </span>
      </div>
    </button>
  );
}
