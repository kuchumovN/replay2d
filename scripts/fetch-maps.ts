/**
 * Downloads radar images and overview calibration for CS2 maps into web/public/maps.
 * Source: https://github.com/MurkyYT/cs2-map-icons (auto-updated from the game depot).
 *
 * Usage: npm run fetch-maps [-- de_mirage de_nuke ...]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { MapInfo, MapLevel } from '../shared/src/types.js';
import { buildMapInfo, type SourceMap } from './map-info.js';

const INDEX_URL = 'https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main/data/available.json';
const OUT_DIR = fileURLToPath(new URL('../web/public/maps/', import.meta.url));
const CONCURRENCY = 6;

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function readExisting(): Promise<Record<string, MapInfo>> {
  try {
    return JSON.parse(await readFile(`${OUT_DIR}maps.json`, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const wanted = new Set(process.argv.slice(2));
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`Failed to fetch map index: ${res.status}`);
  const index = (await res.json()) as { maps: Record<string, SourceMap> };

  // A filtered run updates the listed maps and keeps the rest of maps.json.
  const maps: Record<string, MapInfo> = wanted.size > 0 ? await readExisting() : {};
  const jobs: { url: string; dest: string; level: MapLevel }[] = [];
  for (const [name, source] of Object.entries(index.maps)) {
    if (wanted.size > 0 && !wanted.has(name)) continue;
    const built = buildMapInfo(name, source);
    if (!built) continue;
    maps[name] = built.info;
    await mkdir(`${OUT_DIR}${name}`, { recursive: true });
    for (const { level, url } of built.downloads) jobs.push({ url, dest: `${OUT_DIR}${level.image}`, level });
  }

  let done = 0;
  const failed = new Set<string>();
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          await download(job.url, job.dest);
        } catch (err) {
          console.error(`  ! ${(err as Error).message}`);
          failed.add(job.level.image);
        }
        process.stdout.write(`\r  downloaded ${++done}/${jobs.length}`);
      }
    }),
  );
  process.stdout.write('\n');

  for (const [name, info] of Object.entries(maps)) {
    if (wanted.size > 0 && !wanted.has(name)) continue;
    info.levels = info.levels.filter((l) => !failed.has(l.image));
    if (info.levels.length === 0) delete maps[name];
  }
  await writeFile(`${OUT_DIR}maps.json`, JSON.stringify(maps, null, 2));
  console.log(`Saved ${Object.keys(maps).length} maps to ${OUT_DIR}`);
  if (failed.size > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
