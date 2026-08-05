/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--cofrito-primary)',
          foreground: 'var(--cofrito-primary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--cofrito-accent)',
          foreground: 'var(--cofrito-accent-foreground)',
        },
        background: 'var(--cofrito-background)',
        foreground: 'var(--cofrito-foreground)',
        muted: {
          DEFAULT: 'var(--cofrito-muted)',
          foreground: 'var(--cofrito-muted-foreground)',
        },
        border: 'var(--cofrito-border)',
        ring: 'var(--cofrito-ring)',
        success: 'var(--cofrito-success)',
        warning: 'var(--cofrito-warning)',
        danger: 'var(--cofrito-danger)',
      },
      borderRadius: {
        lg: 'var(--cofrito-radius-lg)',
        md: 'var(--cofrito-radius-md)',
        sm: 'var(--cofrito-radius-sm)',
      },
      fontFamily: {
        sans: ['var(--cofrito-font-sans)'],
        serif: ['var(--cofrito-font-serif)'],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
