import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Source maps are built, but kept off the public site: published, they would
// hand RunTruck's original source code to anyone who asks for it. After a
// build they are moved from dist/ (what is deployed) to maps/ (which is not).
// To read an error's stack line by line: check out the commit shown as the
// entry's Build in Developer › Error log, run `npm run build`, and open the
// matching file in maps/.
function keepMapsPrivate(): Plugin {
  return {
    name: 'keep-maps-private',
    apply: 'build',
    closeBundle() {
      const from = 'dist/assets'
      if (!existsSync(from)) return
      rmSync('maps', { recursive: true, force: true })
      mkdirSync('maps', { recursive: true })
      for (const f of readdirSync(from)) if (f.endsWith('.map')) renameSync(join(from, f), join('maps', f))
    },
  }
}

// The commit being built (set by Vercel), shown in error reports so a
// developer knows exactly which code a problem came from.
const build = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), keepMapsPrivate()],
  define: {
    __APP_BUILD__: JSON.stringify(build),
  },
  build: {
    // Built without a link from the code to the map (see keepMapsPrivate).
    sourcemap: 'hidden',
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
