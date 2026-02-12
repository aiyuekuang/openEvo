/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6366f1',
          light: '#818cf8'
        }
      }
    }
  },
  plugins: []
}
