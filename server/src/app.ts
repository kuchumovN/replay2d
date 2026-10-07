import { existsSync } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import fastifyStatic from '@fastify/static';
import { checkDemoMagic } from '@skybox/shared/parse';
import Fastify, { type FastifyInstance } from 'fastify';
import { getRound, getStatus, startParse } from './store.js';

export const LOCAL_TOKEN_HEADER = 'x-skybox-token';

/**
 * Backend of the desktop app: parses demos with the native parser straight from disk (the browser build parses
 * in a Web Worker instead and needs no server).
 */
export interface ServerOptions {
  /** Built web app to serve; skipped if the directory does not exist. */
  webRoot?: string;
  logger?: boolean;
  /** Required on local-file requests so other local pages cannot make the app read arbitrary files. */
  localFileToken: string;
}

async function readMagic(path: string): Promise<string | null> {
  const fh = await open(path, 'r');
  try {
    const head = new Uint8Array(8);
    await fh.read(head, 0, 8, 0);
    return checkDemoMagic(head);
  } finally {
    await fh.close();
  }
}

export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ? { level: 'info' } : false });

  app.post('/api/demos/local', async (req, reply) => {
    if (req.headers[LOCAL_TOKEN_HEADER] !== options.localFileToken) return reply.code(403).send({ error: 'Forbidden.' });
    const path = (req.body as { path?: unknown } | null)?.path;
    if (typeof path !== 'string' || !isAbsolute(path)) return reply.code(400).send({ error: 'Invalid file path.' });
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return reply.code(400).send({ error: 'File not found.' });
    if (info.size === 0) return reply.code(400).send({ error: 'Empty file.' });
    const problem = await readMagic(path);
    if (problem) return reply.code(400).send({ error: problem });
    return { id: startParse(path, basename(path)) };
  });

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
