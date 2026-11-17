import React from 'react';

interface PonelePlayLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  subtitle?: string;
}

const SIZES = {
  sm: { box: 'h-9 w-9', text: 'text-lg sm:text-xl' },
  md: { box: 'h-11 w-11', text: 'text-2xl' },
  lg: { box: 'h-14 w-14', text: 'text-3xl sm:text-4xl' },
};

export const PonelePlayLogo: React.FC<PonelePlayLogoProps> = ({
  size = 'sm',
  showWordmark = true,
  subtitle,
}) => {
  const cfg = SIZES[size];
  const gradId = React.useId();

  return (
    <div className="inline-flex items-center gap-3">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${cfg.box} shrink-0 drop-shadow-sm`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${gradId}-bg`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="52%" stopColor="#EC4899" />
            <stop offset="100%" stopColor="#F97316" />
          </linearGradient>
          <linearGradient id={`${gradId}-sheen`} x1="12" y1="4" x2="36" y2="26" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Emblema squircle Sonic Prism */}
        <rect width="48" height="48" rx="15" fill={`url(#${gradId}-bg)`} />
        <rect
          x="1"
          y="1"
          width="46"
          height="46"
          rx="14"
          stroke="#FFFFFF"
          strokeOpacity="0.28"
          strokeWidth="1.25"
        />
        {/* Brillo especular superior cristalino */}
        <path
          d="M4 15C4 8.92487 8.92487 4 15 4H33C39.0751 4 44 8.92487 44 15V19C34 15 14 15 4 19V15Z"
          fill={`url(#${gradId}-sheen)`}
        />

        {/* Ondas acústicas curvas izquierda */}
        <path
          d="M11.5 18.5C9.7 21.8 9.7 26.2 11.5 29.5"
          stroke="#FFFFFF"
          strokeOpacity="0.72"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* Letra P aerodinámica + Play iluminado en el núcleo */}
        <path
          d="M17.5 34.5V13.5H26.2C30.4 13.5 33 16 33 19.9C33 23.8 30.4 26.3 26.2 26.3H21.2"
          stroke="#FFFFFF"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M22.2 16.5L30.2 20.5L22.2 24.5V16.5Z" fill="#FFFFFF" />

        {/* Ondas acústicas derechas */}
        <rect x="35.5" y="21" width="2.8" height="10" rx="1.4" fill="#FFFFFF" fillOpacity="0.92" />
        <rect x="40" y="16.5" width="2.8" height="15" rx="1.4" fill="#FFFFFF" fillOpacity="0.72" />
      </svg>

      {showWordmark && (
        <div className="min-w-0 leading-none">
          <div className={`font-display font-extrabold tracking-tight ${cfg.text}`}>
            <span className="text-ink">Ponele</span>
            <span className="text-brand">Play</span>
          </div>
          {subtitle && (
            <p className="mt-1 text-[11px] font-medium text-muted">{subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
};
