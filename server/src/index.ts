import { fileURLToPath } from 'node:url';
import { buildServer } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);

const app = await buildServer({
  webRoot: fileURLToPath(new URL('../../web/dist', import.meta.url)),
  logger: true,
});
await app.listen({ port: PORT, host: '127.0.0.1' });
