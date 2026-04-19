/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: 'oklch(0.78 0.14 82)',
          400: 'oklch(0.78 0.14 82 / 0.4)',
          200: 'oklch(0.78 0.14 82 / 0.2)',
        },
        navy: {
          900: 'oklch(0.12 0.04 258)',
          800: 'oklch(0.16 0.04 258)',
        },
        felt: 'oklch(0.18 0.04 150)',
      },
      fontFamily: {
        display: ['"Georgia"', '"Times New Roman"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-gold': 'linear-gradient(135deg, var(--gold-light) 0%, var(--gold-primary) 50%, var(--gold-dark) 100%)',
        'felt-pattern': "radial-gradient(circle at center, oklch(0.22 0.04 150) 0%, oklch(0.14 0.04 150) 100%)",
      },
      textGradient: {
        gold: 'linear-gradient(135deg, #e8c76a 0%, #c9a84c 50%, #8a6a28 100%)',
      },
    },
  },
  plugins: [],
};