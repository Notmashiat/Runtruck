import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The commit being built (set by Vercel), shown in error reports so a
// developer knows exactly which code a problem came from.
const build = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_BUILD__: JSON.stringify(build),
  },
  build: {
    // Source maps let the browser's developer tools show the original
    // TypeScript in a stack trace instead of the compressed bundle.
    sourcemap: true,
    // Keep function and component names, so an error report reads
    // "at PayrollTab" rather than "at t".
    rolldownOptions: {
      output: {
        keepNames: true,
        // React and the router go in their own file. It only changes when
        // they are upgraded, so browsers keep it cached across RunTruck
        // releases and re-download just the app's own code.
        codeSplitting: { groups: [{ name: 'vendor', test: /node_modules/ }] },
      },
    },
  },
  test: {
    environment: 'jsdom',
    // Worker threads start reliably on Windows, where forked processes can time out.
    pool: 'threads',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
  },
})
