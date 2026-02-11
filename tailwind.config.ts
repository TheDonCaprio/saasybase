import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    screens: {
      sm: '640px',
      // bump md so "md:" utilities kick in at 1025px and above
      md: '1025px',
      // keep larger breakpoints comfortably above md
      lg: '1280px',
      xl: '1440px',
      '2xl': '1536px'
    },
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6366f1',
          foreground: '#ffffff'
        }
      }
      ,
      // add extra extra small font size used for compact UI bits (image urls, small metadata)
      fontSize: {
        xxs: '0.6rem'
      }
    }
  },
  plugins: []
};

export default config;
