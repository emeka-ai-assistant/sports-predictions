import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        pitch: {
          900: '#0a1628',
          800: '#0f2040',
          700: '#1a2f55',
          600: '#1e3a6e',
        },
        grass: {
          500: '#22c55e',
          400: '#4ade80',
          300: '#86efac',
        },
      },
    },
  },
  plugins: [],
}
export default config
