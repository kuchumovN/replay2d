import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXTRACT_VERSION, type AnalysisJob, type DemoExtract, type LibraryDemo } from '@skybox/shared';
import type { WorkerMessage } from '../parse/worker.js';
import { createWorker } from '../store.js';

interface QueuedDemo {
  jobId: string;
  path: string;
  fileName: string;
  deleteFile: boolean;
}

/** Stable id of a demo file, so adding the same demo twice replaces it. */
async function demoId(path: string, fileName: string): Promise<string> {
  const { size } = await stat(path);
  return createHash('sha1').update(`${fileName}:${size}`).digest('hex').slice(0, 16);
}

// The native parser must stay out of this module graph: it runs in the Electron main process, before
// SKYBOX_DEMOPARSER is set, and only workers load the parser.
const summary = ({ places: _places, lives: _lives, ...demo }: DemoExtract): LibraryDemo => demo;

/** Route-analysis extracts persisted as one JSON file per demo; demos are extracted one at a time. */
export class AnalysisLibrary {
  private extracts: Map<string, DemoExtract> | null = null;
  private readonly jobs = new Map<string, AnalysisJob>();
  private readonly queue: QueuedDemo[] = [];
  private running = false;

  constructor(private readonly dir: string) {}

  private async load(): Promise<Map<string, DemoExtract>> {
    if (this.extracts) return this.extracts;
    await mkdir(this.dir, { recursive: true });
    const map = new Map<string, DemoExtract>();
    for (const file of await readdir(this.dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const e = JSON.parse(await readFile(join(this.dir, file), 'utf8')) as DemoExtract;
        if (e.version === EXTRACT_VERSION) map.set(e.id, e);
      } catch {
        // A broken file is skipped rather than breaking the whole library.
      }
    }
    return (this.extracts ??= map);
  }

  async list(): Promise<LibraryDemo[]> {
    return [...(await this.load()).values()].map(summary).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  async forMap(mapName: string): Promise<DemoExtract[]> {
    return [...(await this.load()).values()].filter((e) => e.mapName === mapName);
  }

  async remove(id: string): Promise<boolean> {
    const extracts = await this.load();
    if (!extracts.delete(id)) return false;
    await rm(join(this.dir, `${id}.json`), { force: true });
    return true;
  }

  job(id: string): AnalysisJob | undefined {
    return this.jobs.get(id);
  }

  /** Queues a demo for extraction; an uploaded (temporary) file is deleted afterwards. */
  add(path: string, fileName: string, { deleteFile }: { deleteFile: boolean }): string {
    const jobId = randomUUID();
    this.jobs.set(jobId, { state: 'parsing', stage: 'Queued' });
    this.queue.push({ jobId, path, fileName, deleteFile });
    void this.next();
    return jobId;
  }

  private async next() {
    if (this.running) return;
    const item = this.queue.shift();
    if (!item) return;
    this.running = true;
    try {
      const extract = await this.extract(item);
      const extracts = await this.load();
      extracts.set(extract.id, extract);
      await writeFile(join(this.dir, `${extract.id}.json`), JSON.stringify(extract));
      this.jobs.set(item.jobId, { state: 'ready', demo: summary(extract) });
    } catch (err) {
      this.jobs.set(item.jobId, { state: 'error', error: (err as Error).message });
    } finally {
      if (item.deleteFile) await rm(item.path, { force: true }).catch(() => {});
      this.running = false;
      void this.next();
    }
  }

  private async extract({ jobId, path, fileName }: QueuedDemo): Promise<DemoExtract> {
    const id = await demoId(path, fileName);
    return new Promise((resolve, reject) => {
      const worker = createWorker({ mode: 'extract', path, fileName, id });
      let done = false;
      worker.on('message', (msg: WorkerMessage) => {
        if (msg.type === 'stage') this.jobs.set(jobId, { state: 'parsing', stage: msg.stage });
        else if (msg.type === 'error') {
          done = true;
          reject(new Error(msg.message));
        } else if (msg.type === 'extracted') {
          done = true;
          resolve(msg.extract);
        }
      });
      worker.on('error', (err) => reject(new Error(`Parser crashed: ${err.message}`)));
      worker.on('exit', (code) => !done && reject(new Error(`Parser exited with code ${code}`)));
    });
  }
}
