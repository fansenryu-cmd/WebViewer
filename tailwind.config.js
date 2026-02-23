/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        naver: '#22c55e',
        kakao: '#eab308',
        munpia: '#3b82f6',
        ridi: '#a855f7',
        novelpia: '#f97316',
      },
    },
  },
  plugins: [],
};
