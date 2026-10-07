import type { Columns, DemoParser } from '@skybox/shared/parse';
import type { DemoFile } from './demoparser/demoparser.js';

/** Bytes per chunk when copying a demo into wasm memory, so the whole file is never held twice. */
const CHUNK = 16 * 1024 * 1024;

export async function loadDemoFile(
  DemoFileClass: typeof DemoFile,
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<DemoFile> {
  const demo = new DemoFileClass(file.size);
  try {
    for (let offset = 0; offset < file.size; offset += CHUNK) {
      demo.append(new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer()));
      onProgress(Math.min(1, (offset + CHUNK) / file.size));
    }
  } catch (err) {
    demo.free();
    throw err;
  }
  return demo;
}

export function wasmParser(demo: DemoFile): DemoParser {
  return {
    parseHeader: () => JSON.parse(demo.parseHeader()),
    parseEvents: (events, playerProps, otherProps) => JSON.parse(demo.parseEvents(events, playerProps, otherProps)),
    parseTicks: (props, ticks) => JSON.parse(demo.parseTicks(props, Int32Array.from(ticks), true)) as Columns,
    parseGrenades: () => JSON.parse(demo.parseGrenades([], false)),
  };
}
