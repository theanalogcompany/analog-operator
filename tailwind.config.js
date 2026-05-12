/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        clay: '#C66A4A',
        sand: '#F2EBDC',
        inbound: '#3A3530',
      },
      fontFamily: {
        fraunces: ['Fraunces_400Regular_Italic'],
        'inter-tight': ['InterTight_400Regular'],
        'inter-tight-medium': ['InterTight_500Medium'],
      },
    },
  },
  plugins: [],
};
