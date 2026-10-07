import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildServer, LOCAL_TOKEN_HEADER } from './app.js';

const dir = mkdtempSync(join(tmpdir(), 'skybox-test-'));
const csgo = join(dir, 'old.dem');
writeFileSync(csgo, Buffer.from('HL2DEMO\0rest-of-file'));
const text = join(dir, 'notes.txt');
writeFileSync(text, 'hello');

describe('local demo endpoint', () => {
  const desktop = buildServer({ localFileToken: 'secret' });
  afterAll(async () => {
    await (await desktop).close();
  });

  const post = async (app: typeof desktop, body: unknown, token?: string) =>
    (await app).inject({
      method: 'POST',
      url: '/api/demos/local',
      headers: token ? { [LOCAL_TOKEN_HEADER]: token } : {},
      payload: body as object,
    });

  it('requires the token', async () => {
    expect((await post(desktop, { path: csgo })).statusCode).toBe(403);
    expect((await post(desktop, { path: csgo }, 'wrong')).statusCode).toBe(403);
  });

  it('validates the path and the file type', async () => {
    expect((await post(desktop, { path: 'relative.dem' }, 'secret')).json().error).toBe('Invalid file path.');
    expect((await post(desktop, { path: join(dir, 'missing.dem') }, 'secret')).json().error).toBe('File not found.');
    expect((await post(desktop, { path: dir }, 'secret')).json().error).toBe('File not found.');
    expect((await post(desktop, { path: text }, 'secret')).json().error).toBe('Not a CS2 demo file.');
    expect((await post(desktop, { path: csgo }, 'secret')).json().error).toMatch(/CS:GO demo/);
  });
});
