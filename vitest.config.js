import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Test-only config: the app's vite.config.js keeps Tailwind for CSS builds,
// which is not needed (or wanted) when running the suite.
export default defineConfig({
  plugins: [react()],
  test: {
    // globals lets @testing-library/react register its automatic cleanup.
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
