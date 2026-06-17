/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b1020',
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
        },
      },
    },
  },
  plugins: [],
}
