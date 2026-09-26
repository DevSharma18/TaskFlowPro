/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0b0f19',
        surface: {
          50: 'rgba(255, 255, 255, 0.03)',
          100: 'rgba(255, 255, 255, 0.06)',
          200: 'rgba(255, 255, 255, 0.09)',
          300: 'rgba(255, 255, 255, 0.12)',
          border: 'rgba(255, 255, 255, 0.12)',
        },
        brand: {
          primary: '#2563eb',
          accent: '#0284c7',
          danger: '#ef4444',
          success: '#10b981',
          warning: '#f59e0b',
        }
      },
      borderRadius: {
        DEFAULT: '4px',
        none: '0px',
        sm: '2px',
        md: '4px',
        lg: '4px',
        xl: '4px',
        '2xl': '4px',
        '3xl': '4px',
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
