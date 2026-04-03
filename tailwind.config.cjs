/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        hsf: {
          light: '#EDE9FF',
          accent: '#A792FF',
          text: '#1A1A1A',
          purple: '#4A0E99',
          cyan: '#2182BF',
          pale: '#D3E6F2',
          deep: '#092130',
          mid: '#114160'
        }
      },
      fontFamily: {
        sans: ['Open Sans', 'ui-sans-serif', 'system-ui'],
        work: ['Work Sans', 'ui-sans-serif', 'system-ui']
      }
    }
  },
  plugins: []
}
