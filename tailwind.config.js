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
        'clay-deep': '#A85638',
        'clay-soft': '#E5B19C',
        sand: '#F2EBDC',
        paper: '#F7F1E3',
        parchment: '#EDE4D2',
        stone: '#D8CFC0',
        'stone-light': '#E8E2D6',
        ink: '#1C1814',
        'ink-soft': '#4A4339',
        'ink-faint': '#857A6A',
        inbound: '#3A3530',
        hairline: 'rgba(28, 24, 20, 0.12)',
        'hairline-soft': 'rgba(28, 24, 20, 0.06)',
        'bg-warm': '#ECE7DC',
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
