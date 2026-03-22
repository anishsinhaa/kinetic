/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#CCFF00',
        'primary-hover': '#b8e600',
        background: '#0B0B0B',
        surface: '#161616',
        'surface-2': '#1E1E1E',
        'surface-3': '#252525',
        border: '#2A2A2A',
        'text-primary': '#FFFFFF',
        'text-secondary': '#787878',
        'text-muted': '#4A4A4A',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.4)',
        'card-hover': '0 4px 20px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
}
