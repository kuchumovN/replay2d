import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { registerAnalysis } from './analysis/routes.js';
import { getRound, getStatus, startParse } from './store.js';

const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;
const UPLOAD_DIR = join(tmpdir(), 'skybox-uploads');
export const LOCAL_TOKEN_HEADER = 'x-skybox-token';

export interface ServerOptions {
  /** Built web app to serve; skipped if the directory does not exist (dev uses Vite). */
  webRoot?: string;
  logger?: boolean;
  /**
   * Desktop mode: allows opening a demo by its local path (no copy of a 300 MB file). Requests must carry
   * this token so other local pages cannot make the app read arbitrary files.
   */
  localFileToken?: string;
  /** Where settings and route-analysis data are stored; without it those endpoints are not registered. */
  dataDir?: string;
}

export type DemoSource = { path: string; fileName: string } | { code: number; error: string };

class TooLargeError extends Error {}

/** CS2 (Source 2) demos start with "PBDEMS2\0"; CS:GO demos start with "HL2DEMO\0". */
async function checkDemoMagic(path: string): Promise<string | null> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(8);
    await fh.read(buf, 0, 8, 0);
    const magic = buf.toString('latin1');
    if (magic === 'PBDEMS2\0') return null;
    if (magic === 'HL2DEMO\0') return 'This is a CS:GO demo. Only CS2 demos are supported.';
    return 'Not a CS2 demo file.';
  } finally {
    await fh.close();
  }
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ? { level: 'info' } : false });

  // Uploads are sent as a raw body and streamed straight to disk.
  app.addContentTypeParser('application/octet-stream', (_req, payload, done) => done(null, payload));

  /** Streams a raw-body upload to a temporary file and validates it. */
  async function receiveUpload(req: FastifyRequest): Promise<DemoSource> {
    const fileName = String((req.query as Record<string, string>).name ?? 'demo.dem');
    await mkdir(UPLOAD_DIR, { recursive: true });
    const path = join(UPLOAD_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}.dem`);

    let received = 0;
    const limiter = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length;
        cb(received > MAX_UPLOAD_BYTES ? new TooLargeError() : null, chunk);
      },
    });
    try {
      await pipeline(req.body as NodeJS.ReadableStream, limiter, createWriteStream(path));
      const problem = received === 0 ? 'Empty file.' : await checkDemoMagic(path);
      if (problem) {
        await rm(path, { force: true });
        return { code: 400, error: problem };
      }
    } catch (err) {
      await rm(path, { force: true });
      if (err instanceof TooLargeError) return { code: 413, error: 'Demo is larger than 2 GB.' };
      throw err;
    }
    return { path, fileName };
  }

  /** Desktop mode: validates a demo path sent by the app window. */
  async function localFile(req: FastifyRequest): Promise<DemoSource> {
    if (!options.localFileToken || req.headers[LOCAL_TOKEN_HEADER] !== options.localFileToken) return { code: 403, error: 'Forbidden.' };
    const path = (req.body as { path?: unknown } | null)?.path;
    if (typeof path !== 'string' || !isAbsolute(path)) return { code: 400, error: 'Invalid file path.' };
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return { code: 400, error: 'File not found.' };
    if (info.size === 0) return { code: 400, error: 'Empty file.' };
    const problem = await checkDemoMagic(path);
    if (problem) return { code: 400, error: problem };
    return { path, fileName: basename(path) };
  }

  app.post('/api/demos', async (req, reply) => {
    const src = await receiveUpload(req);
    if ('error' in src) return reply.code(src.code).send({ error: src.error });
    return { id: startParse(src.path, src.fileName, { deleteFile: true }) };
  });

  if (options.localFileToken) {
    app.post('/api/demos/local', async (req, reply) => {
      const src = await localFile(req);
      if ('error' in src) return reply.code(src.code).send({ error: src.error });
      return { id: startParse(src.path, src.fileName, { deleteFile: false }) };
    });
  }

  if (options.dataDir) registerAnalysis(app, options.dataDir, { receiveUpload, localFile: options.localFileToken ? localFile : null });

  app.get('/api/demos/:id', async (req, reply) => {
    const status = getStatus((req.params as { id: string }).id);
    if (!status) return reply.code(404).send({ error: 'Demo not found. It may have been unloaded after a restart.' });
    return status;
  });

  app.get('/api/demos/:id/rounds/:n', async (req, reply) => {
    const { id, n } = req.params as { id: string; n: string };
    const json = getRound(id, Number(n) - 1);
    if (!json) return reply.code(404).send({ error: 'Round not found.' });
    return reply.type('application/json').send(json);
  });

  if (options.webRoot && existsSync(options.webRoot)) {
    await app.register(fastifyStatic, { root: options.webRoot });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'),
    );
  }

  return app;
}
