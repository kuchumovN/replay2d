import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);

const app = await buildServer({
  webRoot: fileURLToPath(new URL('../../web/dist', import.meta.url)),
  logger: true,
  dataDir: process.env.SKYBOX_DATA ?? join(homedir(), '.skybox'),
});
await app.listen({ port: PORT, host: '127.0.0.1' });
