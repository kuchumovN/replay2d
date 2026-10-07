import { checkDemoMagic, DemoError, parseDemo, type BuiltMatch } from '@replay2d/shared/parse';
import init, { DemoFile } from './demoparser/demoparser.js';
import { loadDemoFile, wasmParser } from './wasm';

/** Parses one demo with the wasm parser. A fresh worker is used per demo: wasm memory never shrinks. */
export type WorkerMessage =
  | { type: 'reading'; fraction: number }
  | { type: 'stage'; stage: string }
  | ({ type: 'done' } & BuiltMatch)
  | { type: 'error'; message: string };

const post = (msg: WorkerMessage) => self.postMessage(msg);

function errorMessage(err: unknown): string {
  if (err instanceof DemoError) return err.message;
  // Allocation failures surface as a RangeError (memory.grow) or as an abort ("unreachable").
  if (err instanceof RangeError || /memory|unreachable/i.test(String(err))) {
    return 'Not enough memory to parse this demo in the browser.';
  }
  return `Failed to parse demo: ${(err as Error).message ?? err}`;
}

self.onmessage = async ({ data: file }: MessageEvent<File>) => {
  try {
    const problem = file.size === 0 ? 'Empty file.' : checkDemoMagic(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
    if (problem) throw new DemoError(problem);
    await init();
    const demo = await loadDemoFile(DemoFile, file, (fraction) => post({ type: 'reading', fraction }));
    const match = parseDemo(wasmParser(demo), file.name, (stage) => post({ type: 'stage', stage }));
    post({ type: 'done', ...match });
  } catch (err) {
    post({ type: 'error', message: errorMessage(err) });
  }
};
