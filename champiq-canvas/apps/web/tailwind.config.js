/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        champgraph: '#3B82F6',
        champmail: '#22C55E',
        champvoice: '#A855F7',
        goal: '#F97316',
      },
    },
  },
  plugins: [],
}
