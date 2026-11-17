import React from 'react';

interface PonelePlayLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  subtitle?: string;
}

const SIZES = {
  sm: { box: 'h-9 w-9', text: 'text-lg sm:text-xl' },
  md: { box: 'h-11 w-11', text: 'text-2xl' },
  lg: { box: 'h-14 w-14', text: 'text-3xl' },
};

export const PonelePlayLogo: React.FC<PonelePlayLogoProps> = ({
  size = 'sm',
  showWordmark = true,
  subtitle,
}) => {
  const cfg = SIZES[size];

  return (
    <div className="inline-flex items-center gap-2.5">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${cfg.box} shrink-0`}
        aria-hidden="true"
      >
        {/* Base Squircle Turquesa Océano */}
        <rect width="48" height="48" rx="14" fill="var(--brand-primary)" />
        {/* Surco sutil de vinilo */}
        <circle
          cx="24"
          cy="24"
          r="18.5"
          stroke="var(--on-brand)"
          strokeOpacity="0.22"
          strokeWidth="1.5"
          strokeDasharray="18 6 8 6"
        />
        {/* Primera P geométrica */}
        <path
          d="M12.5 34V14H20.5C24.2 14 26.5 16.2 26.5 19.6C26.5 23 24.2 25.2 20.5 25.2H16"
          stroke="var(--on-brand)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Segunda P entrelazada */}
        <path
          d="M18.5 34V18H25.2C28.4 18 30.5 19.8 30.5 22.8C30.5 25.8 28.4 27.6 25.2 27.6H21.2"
          stroke="var(--on-brand)"
          strokeOpacity="0.88"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Triángulo Play central en Coral */}
        <path d="M21 19.5L29.5 24L21 28.5V19.5Z" fill="var(--brand-coral)" />
        {/* 3 ondas de audio ascendentes */}
        <rect x="33" y="21" width="2.5" height="9" rx="1.25" fill="var(--on-brand)" />
        <rect x="37" y="16" width="2.5" height="14" rx="1.25" fill="var(--brand-coral)" />
      </svg>

      {showWordmark && (
        <div className="min-w-0 leading-none">
          <div className={`font-display font-extrabold tracking-tight ${cfg.text}`}>
            <span className="text-ink">Ponele</span>
            <span className="text-brand">Play</span>
            <span className="text-coral">.</span>
          </div>
          {subtitle && (
            <p className="mt-0.5 text-[11px] font-medium text-muted">{subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
};
