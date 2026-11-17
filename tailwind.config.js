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
        coral: 'var(--brand-coral)',
        'on-coral': 'var(--on-coral)',
        'coral-soft': 'var(--coral-soft)',
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
        surface: '0 4px 20px -2px rgba(13, 148, 136, 0.08)',
        elevated: '0 12px 32px -4px rgba(15, 23, 42, 0.12)',
      }
    }
  },
  plugins: [],
};
