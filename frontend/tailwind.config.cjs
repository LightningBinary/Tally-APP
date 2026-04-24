/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          900: 'hsl(225 25% 6%)',
          800: 'hsl(220 20% 9%)',
          700: 'hsl(215 18% 11%)',
          600: 'hsl(215 14% 14%)',
          500: 'hsl(215 12% 22%)',
          400: 'hsl(215 10% 32%)',
          300: 'hsl(215 10% 45%)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
