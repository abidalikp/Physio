/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#edfff5',
          100: '#d5ffea',
          200: '#aeffd5',
          300: '#70ffb4',
          400: '#2bfb8c',
          500: '#00e06b',
          600: '#00c05a',
          700: '#009047',
          800: '#06713c',
          900: '#075d34',
          950: '#00341a',
        },
      },
    },
  },
  plugins: [],
};
