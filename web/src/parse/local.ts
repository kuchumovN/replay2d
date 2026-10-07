import type { MatchMeta, RoundData } from '@skybox/shared';
import type { WorkerMessage } from './worker';

export type ParseProgress = { kind: 'reading'; fraction: number } | { kind: 'parsing'; stage: string };

/** Demos parsed in this tab (lost on reload); older ones are dropped. */
const MAX_DEMOS = 3;
const demos = new Map<string, { meta: MatchMeta; rounds: RoundData[] }>();

export function localDemo(id: string) {
  return demos.get(id);
}

/** Parses a demo in a Web Worker with the wasm build of demoparser2; nothing leaves the browser. */
export function parseInBrowser(file: File, onProgress: (progress: ParseProgress) => void): Promise<MatchMeta> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const fail = (message: string) => {
      worker.terminate();
      reject(new Error(message));
    };
    worker.onerror = (e) => fail(`Parser crashed: ${e.message || 'unknown error'}`);
    worker.onmessage = ({ data: msg }: MessageEvent<WorkerMessage>) => {
      if (msg.type === 'reading') onProgress({ kind: 'reading', fraction: msg.fraction });
      else if (msg.type === 'stage') onProgress({ kind: 'parsing', stage: msg.stage });
      else if (msg.type === 'error') fail(msg.message);
      else {
        worker.terminate();
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const meta = { ...msg.meta, id };
        demos.set(id, { meta, rounds: msg.rounds });
        for (const old of [...demos.keys()].slice(0, -MAX_DEMOS)) demos.delete(old);
        resolve(meta);
      }
    };
    worker.postMessage(file);
  });
}
