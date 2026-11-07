/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Sora Variable"', 'Sora', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Deep blacks and charcoals for the cinematic canvas.
        ink: {
          950: '#050506',
          900: '#0a0a0c',
          850: '#0f0f12',
          800: '#141418',
          750: '#1a1a1f',
          700: '#222228',
          600: '#2c2c34',
          500: '#3a3a44',
          400: '#5a5a66',
          300: '#8a8a96',
          200: '#b4b4bf',
          100: '#dcdce3',
        },
        // BingeBox red: the single accent for actions and highlights.
        brand: {
          50: '#fff1f2',
          100: '#ffe0e3',
          200: '#ffc6cc',
          300: '#ff9aa5',
          400: '#ff5c6e',
          500: '#ff2d46',
          600: '#ec1430',
          700: '#c70b25',
          800: '#a40d24',
          900: '#880f23',
        },
        ember: '#ff6a3d',
        gold: '#f5c518',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        glow: '0 10px 40px -10px rgba(255, 45, 70, 0.55)',
        'glow-lg': '0 20px 70px -15px rgba(255, 45, 70, 0.6)',
        card: '0 18px 50px -18px rgba(0, 0, 0, 0.9)',
        pop: '0 30px 80px -20px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #ff2d46 0%, #ff4a3d 55%, #ff6a3d 100%)',
        'hero-left': 'linear-gradient(90deg, rgba(5,5,6,0.96) 0%, rgba(5,5,6,0.72) 32%, rgba(5,5,6,0.15) 62%, rgba(5,5,6,0) 100%)',
        'hero-bottom': 'linear-gradient(0deg, #050506 0%, rgba(5,5,6,0.85) 12%, rgba(5,5,6,0) 45%)',
        'card-bottom': 'linear-gradient(0deg, rgba(5,5,6,0.95) 0%, rgba(5,5,6,0.55) 38%, rgba(5,5,6,0) 70%)',
      },
      transitionTimingFunction: {
        cinematic: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'kenburns': {
          '0%': { transform: 'scale(1.04) translate3d(0,0,0)' },
          '100%': { transform: 'scale(1.14) translate3d(-1.5%, -1%, 0)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(14px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'progress': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        'equalizer': {
          '0%,100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        kenburns: 'kenburns 18s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
        'fade-in': 'fade-in 0.5s ease both',
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both',
        'scale-in': 'scale-in 0.35s cubic-bezier(0.22,1,0.36,1) both',
        'spin-slow': 'spin-slow 1s linear infinite',
        equalizer: 'equalizer 0.9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
