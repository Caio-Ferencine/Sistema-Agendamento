import { defineConfig } from 'vitest/config';

// A single worker thread avoids slow process startup on Windows/OneDrive.
// Angular CLI still supplies compilation, jsdom and TestBed initialization.
export default defineConfig({
  test: {
    pool: 'threads',
    maxWorkers: 1,
    fileParallelism: false,
  },
});
