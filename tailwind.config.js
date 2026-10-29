/** @type {import('tailwindcss').Config} */
const token = (name) => `oklch(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Sora Variable"', 'Sora', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        'table-head': token('table-head'),
        border: 'var(--border)',
        input: 'var(--input)',
        ring: token('brand'),
        brand: { DEFAULT: token('brand'), foreground: token('brand-foreground'), strong: token('brand-strong') },
        primary: { DEFAULT: token('brand'), foreground: token('brand-foreground') },
        ink: {
          DEFAULT: token('ink'),
          2: token('ink-2'),
          foreground: token('ink-foreground'),
          muted: token('ink-muted'),
          border: 'var(--ink-border)',
        },
        info: token('info'),
        success: token('success'),
        warning: token('warning'),
        destructive: token('destructive'),
      },
    },
  },
  plugins: [],
};
