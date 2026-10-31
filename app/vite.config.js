import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Stamp the service worker with a hash of the built files: each deploy gets a new worker and a fresh cache.
function stampServiceWorker() {
  let outDir;
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    configResolved(c) { outDir = join(c.root, c.build.outDir); },
    closeBundle() {
      const sw = join(outDir, 'sw.js');
      if (!existsSync(sw)) return;
      const files = readdirSync(join(outDir, 'assets')).sort().join('|');
      const id = createHash('sha256').update(files).update(readFileSync(join(outDir, 'index.html'))).digest('hex').slice(0, 10);
      writeFileSync(sw, readFileSync(sw, 'utf8').replaceAll('__BUILD__', id));
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
