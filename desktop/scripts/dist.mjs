// Builds installers for the current OS: macOS → .dmg (Apple Silicon), Windows → one-click NSIS .exe (x64).
// Usage: npm run dist -w desktop  (runs bundle.mjs first)
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, Platform } from 'electron-builder';

const desktop = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(`${desktop}package.json`, 'utf8'));
// Release builds take the version from the git tag (v1.2.3), local builds from desktop/package.json.
const version = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME.replace(/^v/, '') : pkg.version;
const electronVersion = require('electron/package.json').version;
const parserVersion = require('@laihoe/demoparser2/package.json').version;

// App directory: bundled code only, no node_modules.
const stage = `${desktop}stage/`;
rmSync(stage, { recursive: true, force: true });
cpSync(`${desktop}dist`, stage, { recursive: true });
writeFileSync(
  `${stage}package.json`,
  JSON.stringify(
    { name: 'skybox', productName: 'Skybox', version, description: '2D replay viewer for CS2 demos', main: 'main.mjs', type: 'module', author: 'Skybox' },
    null,
    2,
  ),
);

// Native parser for this OS, shipped as an extra resource at resources/native/demoparser2. The platform binary
// is copied next to the loader, which checks for a local .node file before requiring the platform package
// (electron-builder does not copy folders named node_modules into extra resources).
// macOS builds are Apple Silicon only: demoparser2 publishes no current darwin-x64 binary.
const install = `${desktop}native-install/`;
const native = `${desktop}native/`;
rmSync(install, { recursive: true, force: true });
rmSync(native, { recursive: true, force: true });
mkdirSync(install, { recursive: true });
writeFileSync(`${install}package.json`, '{"private":true}');
execSync(`npm install --no-save --no-package-lock --no-audit --no-fund @laihoe/demoparser2@${parserVersion}`, { cwd: install, stdio: 'inherit' });
const scope = `${install}node_modules/@laihoe/`;
cpSync(`${scope}demoparser2`, `${native}demoparser2`, { recursive: true });
const platformPackages = readdirSync(scope).filter((d) => d.startsWith('demoparser2-'));
if (platformPackages.length !== 1) throw new Error(`Expected one platform package, found: ${platformPackages.join(', ') || 'none'}`);
for (const f of readdirSync(`${scope}${platformPackages[0]}`).filter((f) => f.endsWith('.node'))) {
  cpSync(`${scope}${platformPackages[0]}/${f}`, `${native}demoparser2/${f}`);
}
rmSync(install, { recursive: true, force: true });

const targets = process.platform === 'darwin' ? Platform.MAC.createTarget() : Platform.WINDOWS.createTarget();

await build({
  targets,
  publish: 'never',
  config: {
    appId: 'com.kuchumov.skybox',
    productName: 'Skybox',
    electronVersion,
    directories: { app: stage, output: `${desktop}release`, buildResources: `${desktop}build` },
    asar: false,
    npmRebuild: false,
    extraResources: [{ from: native, to: 'native' }],
    mac: {
      target: [{ target: 'dmg', arch: ['arm64'] }],
      category: 'public.app-category.utilities',
      // Ad-hoc signature: unsigned builds do not launch on Apple Silicon at all. Hardened runtime is only
      // needed for notarization and would block loading the ad-hoc signed native parser.
      identity: '-',
      hardenedRuntime: false,
    },
    dmg: { artifactName: '${productName}-${version}-mac-apple-silicon.${ext}' },
    win: { target: [{ target: 'nsis', arch: ['x64'] }] },
    nsis: { oneClick: true, perMachine: false, artifactName: '${productName}-${version}-windows-setup.${ext}' },
  },
});
