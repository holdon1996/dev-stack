/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        bg: '#0a0c10',
        surface: '#13151a',
        panel: '#1c1f26',
        border: '#262a33',
        accent: '#00e5a0',
        accentDim: '#00c68a',
        warn: '#f5a623',
        danger: '#ff4d6d',
        info: '#3d9cf5',
        muted: '#6b7280',
        text: '#f3f4f6',
        textDim: '#9ca3af',
      },
      boxShadow: {
        glow: '0 0 24px rgba(0,229,160,0.15), inset 0 0 10px rgba(0,229,160,0.05)',
        card: '0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
        liquid: '0 8px 24px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
        'liquid-hover': '0 16px 40px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.08)',
      },
      spacing: {
        '4.5': '1.125rem',
      },
      transitionTimingFunction: {
        liquid: 'cubic-bezier(0.25, 1, 0.5, 1)',
      },
    },
  },
  plugins: [],
}
