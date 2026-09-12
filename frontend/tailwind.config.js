/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark-mode-first palette; toggled via 'dark' class on <html>
        surface: { DEFAULT: '#0f1115', light: '#ffffff' },
      },
    },
  },
  plugins: [],
};
