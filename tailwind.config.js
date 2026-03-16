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
        bg: '#0e0f11',
        surface: '#16181c',
        panel: '#1c1f25',
        border: '#2a2d35',
        accent: '#00e5a0',
        accentDim: '#00b87e',
        warn: '#f5a623',
        danger: '#ff4d6d',
        info: '#3d9cf5',
        muted: '#6b7280',
        text: '#e8eaf0',
        textDim: '#9ca3af',
      },
      boxShadow: {
        glow: '0 0 20px rgba(0,229,160,0.15)',
        card: '0 2px 16px rgba(0,0,0,0.4)',
      },
      spacing: {
        '4.5': '1.125rem',
      }
    },
  },
  plugins: [],
}
