/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { display: ['Orbitron', 'system-ui', 'sans-serif'] },
      colors: {
        neon: { cyan: '#22e5ff', blue: '#3b6bff', violet: '#8b5cff', magenta: '#ff2bd6', pink: '#ff4d8d', lime: '#b6ff3b' },
        void: { 900: '#03030a', 800: '#070713', 700: '#0d0d1f' },
      },
      boxShadow: {
        neon: '0 0 12px rgba(34,229,255,.55), inset 0 0 12px rgba(34,229,255,.12)',
        magenta: '0 0 14px rgba(255,43,214,.6), inset 0 0 12px rgba(255,43,214,.15)',
      },
    },
  },
  plugins: [],
};
