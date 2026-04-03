import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'scripts/**',
      'prisma/seed.js',
      'tests/**/*.js',
      'tests/**/*.cjs',
      'tests/**/*.mjs',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'react/no-unescaped-entities': 'warn',
      '@next/next/no-img-element': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];

export default config;
