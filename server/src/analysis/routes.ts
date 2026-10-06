import { join } from 'node:path';
import type { AppSettings, SummaryRequest } from '@skybox/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DemoSource } from '../app.js';
import { SettingsStore } from '../settings.js';
import { AnalysisLibrary } from './library.js';
import { LlmError, listModels, summarize } from './llm.js';

interface Sources {
  receiveUpload: (req: FastifyRequest) => Promise<DemoSource>;
  localFile: ((req: FastifyRequest) => Promise<DemoSource>) | null;
}

export function registerAnalysis(app: FastifyInstance, dataDir: string, sources: Sources) {
  const settings = new SettingsStore(join(dataDir, 'settings.json'));
  const library = new AnalysisLibrary(join(dataDir, 'analysis'));

  app.get('/api/settings', () => settings.get());
  app.put('/api/settings', (req) => settings.update((req.body ?? {}) as Partial<AppSettings>));

  app.get('/api/analysis/demos', () => library.list());

  app.post('/api/analysis/demos', async (req, reply) => {
    const src = await sources.receiveUpload(req);
    if ('error' in src) return reply.code(src.code).send({ error: src.error });
    return { jobId: library.add(src.path, src.fileName, { deleteFile: true }) };
  });

  if (sources.localFile) {
    const localFile = sources.localFile;
    app.post('/api/analysis/demos/local', async (req, reply) => {
      const src = await localFile(req);
      if ('error' in src) return reply.code(src.code).send({ error: src.error });
      return { jobId: library.add(src.path, src.fileName, { deleteFile: false }) };
    });
  }

  app.get('/api/analysis/jobs/:id', async (req, reply) => {
    const job = library.job((req.params as { id: string }).id);
    return job ?? reply.code(404).send({ error: 'Job not found.' });
  });

  app.delete('/api/analysis/demos/:id', async (req, reply) => {
    const removed = await library.remove((req.params as { id: string }).id);
    return removed ? { ok: true } : reply.code(404).send({ error: 'Demo not found.' });
  });

  app.get('/api/analysis/maps/:map', (req) => library.forMap((req.params as { map: string }).map));

  app.get('/api/llm/models', async (_req, reply) => {
    try {
      return await listModels((await settings.get()).ollamaUrl);
    } catch (err) {
      if (err instanceof LlmError) return reply.code(502).send({ error: err.message });
      throw err;
    }
  });

  app.post('/api/llm/summary', async (req, reply) => {
    const s = await settings.get();
    try {
      return { text: await summarize(s.ollamaUrl, s.ollamaModel, req.body as SummaryRequest, s.summaryLanguage) };
    } catch (err) {
      if (err instanceof LlmError) return reply.code(502).send({ error: err.message });
      throw err;
    }
  });
}
