/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B1020',
        card: 'rgba(15, 23, 42, 0.4)',
        border: 'rgba(255, 255, 255, 0.05)',
        critical: '#FF3B30',
        high: '#FF9500',
        moderate: '#FFD60A',
        low: '#34C759',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
