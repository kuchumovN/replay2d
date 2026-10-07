import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDemo, type BuiltMatch } from '@skybox/shared/parse';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseDemoFile } from './parse.js';

/**
 * The browser parses with the wasm build of demoparser2 (web/src/parse); it must produce what the native
 * parser of the desktop app does. Skipped if the demo or the wasm build (`npm run build-wasm`) is missing.
 */
const demo = process.env.SKYBOX_TEST_DEMO ?? fileURLToPath(new URL('../../../fixtures/test_demo.dem', import.meta.url));
const pkg = new URL('../../../web/src/parse/demoparser/', import.meta.url);
const wasmFile = new URL('demoparser_bg.wasm', pkg);

/**
 * Floats cross the wasm boundary as JSON text (shortest f32 representation) while the native module passes the
 * exact value, so a value on a rounding boundary may end up 0.1 apart after rounding in build.ts.
 */
const ROUNDING = 0.1 + 1e-9;

function differences(a: unknown, b: unknown, path: string, out: string[] = []): string[] {
  if (out.length >= 20 || a === b) return out;
  if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= ROUNDING) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      differences((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`, out);
    }
    return out;
  }
  out.push(`${path}: wasm ${JSON.stringify(a)}, native ${JSON.stringify(b)}`);
  return out;
}

describe.skipIf(!existsSync(demo) || !existsSync(wasmFile))('wasm parser', () => {
  let native: BuiltMatch;
  let wasm: BuiltMatch;
  beforeAll(async () => {
    const { DemoFile, initSync } = await import(new URL('demoparser.js', pkg).href);
    const { loadDemoFile, wasmParser } = await import('../../../web/src/parse/wasm.js');
    initSync({ module: readFileSync(wasmFile) });
    const file = await loadDemoFile(DemoFile, new Blob([readFileSync(demo)]), () => {});
    try {
      wasm = parseDemo(wasmParser(file), 'test.dem', () => {});
    } finally {
      file.free();
    }
    native = parseDemoFile(demo, 'test.dem', () => {});
  }, 300_000);

  it('matches the native parser', () => {
    expect(wasm.meta).toEqual(native.meta);
    expect(differences(wasm.rounds, native.rounds, 'rounds')).toEqual([]);
  });
});
