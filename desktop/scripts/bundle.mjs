// Bundles the Electron main process, the parser worker and the preload script into desktop/dist,
// and copies the built web app (with radar images) next to them.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

if (!existsSync(`${root}web/public/maps/maps.json`)) run('npm run fetch-maps');
run('npm run build -w web');

rmSync(dist, { recursive: true, force: true });

// CommonJS dependencies (fastify) call require() for Node built-ins, which ESM bundles need a shim for.
const requireShim = "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);";
const common = { bundle: true, platform: 'node', target: 'node22', logLevel: 'warning', sourcemap: 'linked' };

await build({
  ...common,
  entryPoints: { main: `${root}desktop/src/main.ts`, worker: `${root}server/src/parse/worker.ts` },
  outdir: dist,
  outExtension: { '.js': '.mjs' },
  format: 'esm',
  banner: { js: requireShim },
  // The native parser is resolved at runtime (REPLAY2D_DEMOPARSER in packaged builds).
  external: ['electron', '@laihoe/demoparser2'],
});

await build({
  ...common,
  entryPoints: { preload: `${root}desktop/src/preload.ts` },
  outdir: dist,
  outExtension: { '.js': '.cjs' },
  format: 'cjs',
  external: ['electron'],
});

cpSync(`${root}web/dist`, `${dist}web`, { recursive: true });
console.log(`Bundled into ${dist}`);
