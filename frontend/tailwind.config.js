/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        accent: {
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
        'gradient-card':    'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)',
        'gradient-green':   'linear-gradient(135deg, #059669 0%, #10B981 100%)',
        'gradient-orange':  'linear-gradient(135deg, #EA580C 0%, #F97316 100%)',
        'gradient-blue':    'linear-gradient(135deg, #2563EB 0%, #60A5FA 100%)',
        'gradient-gold':    'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
        'gradient-dark':    'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)',
      },
      boxShadow: {
        'card':       '0 1px 3px 0 rgba(0,0,0,0.06), 0 4px 16px 0 rgba(0,0,0,0.04)',
        'card-hover': '0 4px 24px 0 rgba(0,0,0,0.10), 0 1px 4px 0 rgba(0,0,0,0.05)',
        'glow':       '0 0 0 3px rgba(37,99,235,0.20)',
        'nav':        '0 1px 0 0 rgba(0,0,0,0.06)',
      },
      animation: {
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.35s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' },                               '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};
