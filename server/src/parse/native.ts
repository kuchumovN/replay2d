import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Packaged desktop builds ship the native parser outside the bundle and point to it via SKYBOX_DEMOPARSER.
export const parser = require(process.env.SKYBOX_DEMOPARSER ?? '@laihoe/demoparser2') as typeof import('@laihoe/demoparser2');

/** CS2 demos are recorded at 64 ticks per second regardless of server subtick settings. */
export const TICKRATE = 64;
