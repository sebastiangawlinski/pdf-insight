import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages serwuje aplikację pod https://<user>.github.io/<repo>/,
// więc wszystkie zasoby muszą mieć prefiks /<repo>/.
export default defineConfig({
  base: '/pdf-insight/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'worker/src/**/*.test.ts'],
    environment: 'node',
  },
});
