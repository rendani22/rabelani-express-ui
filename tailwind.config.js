/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  darkMode: 'class',
  safelist: [
    'col-span-12',
    'col-span-8',
    'col-span-6',
    'col-span-4',
    'lg:col-span-8',
    'lg:col-span-4',
    'sm:col-span-6',
    'block',
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
      },
    },
  },
  plugins: [],
}

