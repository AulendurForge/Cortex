import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'cortex-gradient':
          'radial-gradient(60% 60% at 20% 10%, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0) 60%), radial-gradient(60% 60% at 80% 0%, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0) 60%), radial-gradient(80% 60% at 50% 100%, rgba(14,165,233,0.16) 0%, rgba(14,165,233,0) 60%), linear-gradient(180deg, #0b1020 0%, #0a0f1a 100%)',
      },
      borderColor: {
        glass: 'rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
};

export default config;