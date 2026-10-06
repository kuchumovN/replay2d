import { parentPort, workerData } from 'node:worker_threads';
import type { DemoExtract } from '@skybox/shared';
import { extractDemo } from '../analysis/extract.js';
import { DemoError, parseDemo } from './parse.js';

export type WorkerMessage =
  | { type: 'stage'; stage: string }
  | { type: 'done'; meta: unknown; rounds: string[] }
  | { type: 'extracted'; extract: DemoExtract }
  | { type: 'error'; message: string };

/** `match` parses everything for the replay viewer; `extract` builds the compact route-analysis data. */
export type WorkerData = { mode: 'match'; path: string; fileName: string } | { mode: 'extract'; path: string; fileName: string; id: string };

const data = workerData as WorkerData;
const post = (msg: WorkerMessage) => parentPort!.postMessage(msg);
const onStage = (stage: string) => post({ type: 'stage', stage });

try {
  if (data.mode === 'extract') {
    post({ type: 'extracted', extract: extractDemo(data.path, data.fileName, data.id, onStage) });
  } else {
    const match = parseDemo(data.path, data.fileName, onStage);
    // Rounds are serialized here so the main thread only stores and sends strings.
    post({ type: 'done', meta: match.meta, rounds: match.rounds.map((r) => JSON.stringify(r)) });
  }
} catch (err) {
  const message = err instanceof DemoError ? err.message : `Failed to parse demo: ${(err as Error).message ?? err}`;
  post({ type: 'error', message });
}
