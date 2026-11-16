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
        'brand-deep': 'var(--brand-indigo-deep)',
        neon: 'var(--accent-green)',
        'on-neon': 'var(--on-accent-green)',
        ytm: 'var(--accent-ytm)',
        amber: 'var(--accent-amber)',
        danger: 'var(--accent-danger)',
        stroke: 'var(--border-subtle)',
      },
      fontFamily: {
        display: ['"Righteous"', 'cursive'],
        sans: ['"Poppins"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'neon-green': '0 0 18px -2px rgba(34, 197, 94, 0.38)',
        'neon-indigo': '0 0 20px -2px rgba(67, 56, 202, 0.42)',
        'neon-ytm': '0 0 16px -2px rgba(255, 0, 51, 0.35)',
      }
    }
  },
  plugins: [],
};
