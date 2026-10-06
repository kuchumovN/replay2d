import { parentPort, workerData } from 'node:worker_threads';
import { DemoError, parseDemo } from './parse.js';

export type WorkerMessage =
  | { type: 'stage'; stage: string }
  | { type: 'done'; meta: unknown; rounds: string[] }
  | { type: 'error'; message: string };

const { path, fileName } = workerData as { path: string; fileName: string };
const post = (msg: WorkerMessage) => parentPort!.postMessage(msg);

try {
  const match = parseDemo(path, fileName, (stage) => post({ type: 'stage', stage }));
  // Rounds are serialized here so the main thread only stores and sends strings.
  post({ type: 'done', meta: match.meta, rounds: match.rounds.map((r) => JSON.stringify(r)) });
} catch (err) {
  const message = err instanceof DemoError ? err.message : `Failed to parse demo: ${(err as Error).message ?? err}`;
  post({ type: 'error', message });
}
