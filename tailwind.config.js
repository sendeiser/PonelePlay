/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-primary)',
        card: 'var(--bg-card)',
        elevated: 'var(--bg-elevated)',
        ink: 'var(--text-primary)',
        muted: 'var(--text-muted)',
        brand: 'var(--brand-primary)',
        'on-brand': 'var(--on-brand)',
        'brand-soft': 'var(--brand-soft)',
        amber: 'var(--accent-amber)',
        danger: 'var(--accent-danger)',
        stroke: 'var(--border-subtle)',
      },
      fontFamily: {
        display: ['"Outfit"', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        surface: '0 8px 24px -4px rgba(0, 0, 0, 0.35)',
        elevated: '0 16px 40px -8px rgba(0, 0, 0, 0.48)',
      }
    }
  },
  plugins: [],
};
