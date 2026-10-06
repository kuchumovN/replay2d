import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_SETTINGS, type AppSettings } from '@skybox/shared';

/** App settings stored as JSON next to the analysis data (the desktop origin changes every launch, so not localStorage). */
export class SettingsStore {
  private cache: AppSettings | null = null;

  constructor(private readonly file: string) {}

  async get(): Promise<AppSettings> {
    if (this.cache) return this.cache;
    let stored: Partial<AppSettings> = {};
    try {
      stored = JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      // Missing or broken file: defaults.
    }
    return (this.cache = { ...DEFAULT_SETTINGS, ...stored });
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = { ...(await this.get()) };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
      if (patch[key] !== undefined && typeof patch[key] === typeof DEFAULT_SETTINGS[key]) (next as Record<string, unknown>)[key] = patch[key];
    }
    if (next.summaryLanguage !== 'en' && next.summaryLanguage !== 'ru') next.summaryLanguage = 'en';
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(next, null, 2));
    return (this.cache = next);
  }
}
