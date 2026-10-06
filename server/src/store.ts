import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import type { MatchMeta, ParseStatus } from '@skybox/shared';
import type { WorkerMessage } from './parse/worker.js';

/** Parsed demos kept in memory; older ones are evicted. */
const MAX_DEMOS = 3;

interface Entry {
  status: ParseStatus;
  rounds: string[];
}

const entries = new Map<string, Entry>();

/**
 * Worker entry. By default a bootstrap registers tsx and loads worker.ts (dev, `npm start`); bundled builds
 * (desktop) point it at their compiled worker instead.
 */
let workerScript: { url: URL; entry?: string } | null = null;

export function setWorkerScript(url: URL) {
  workerScript = { url };
}

function defaultWorkerScript() {
  return {
    url: new URL('./parse/worker-boot.mjs', import.meta.url),
    entry: new URL('./parse/worker.ts', import.meta.url).href,
  };
}

function evict() {
  const ids = [...entries.keys()];
  while (ids.length > MAX_DEMOS) entries.delete(ids.shift()!);
}

/** Starts parsing in a worker thread. An uploaded (temporary) demo file is deleted once parsing finishes. */
export function startParse(path: string, fileName: string, { deleteFile }: { deleteFile: boolean }): string {
  const id = randomUUID();
  const entry: Entry = { status: { state: 'parsing', stage: 'Starting' }, rounds: [] };
  entries.set(id, entry);
  evict();

  const script = workerScript ?? defaultWorkerScript();
  const worker = new Worker(script.url, { workerData: { path, fileName, entry: script.entry } });
  const finish = (status: ParseStatus) => {
    entry.status = status;
    if (deleteFile) rm(path, { force: true }).catch(() => {});
  };
  worker.on('message', (msg: WorkerMessage) => {
    if (msg.type === 'stage') entry.status = { state: 'parsing', stage: msg.stage };
    else if (msg.type === 'error') finish({ state: 'error', error: msg.message });
    else {
      entry.rounds = msg.rounds;
      finish({ state: 'ready', meta: { ...(msg.meta as Omit<MatchMeta, 'id'>), id } });
    }
  });
  worker.on('error', (err) => finish({ state: 'error', error: `Parser crashed: ${err.message}` }));
  worker.on('exit', (code) => {
    if (entry.status.state === 'parsing') finish({ state: 'error', error: `Parser exited with code ${code}` });
  });
  return id;
}

export function getStatus(id: string): ParseStatus | undefined {
  return entries.get(id)?.status;
}

export function getRound(id: string, index: number): string | undefined {
  return entries.get(id)?.rounds[index];
}
