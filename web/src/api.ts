import type { MapInfo, MatchMeta, ParseStatus, RoundData } from '@replay2d/shared';
import { desktop } from './desktop';
import { localDemo, parseInBrowser, type ParseProgress } from './parse/local';

export type { ParseProgress };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
  return body as T;
}

const POLL_MS = 400;

/**
 * Opens a demo: the desktop app parses it in place with the native parser (via its local server); the browser
 * parses it in a Web Worker.
 */
export async function openDemo(file: File, onProgress: (progress: ParseProgress) => void): Promise<MatchMeta> {
  const localPath = desktop?.pathForFile(file);
  if (!localPath) return parseInBrowser(file, onProgress);

  const res = await fetch('/api/demos/local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-replay2d-token': desktop?.token ?? '' },
    body: JSON.stringify({ path: localPath }),
  });
  const { id } = await json<{ id: string }>(res);
  for (;;) {
    const status = await getStatus(id);
    if (status.state === 'ready') return status.meta;
    if (status.state === 'error') throw new Error(status.error);
    onProgress({ kind: 'parsing', stage: status.stage });
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export async function getStatus(id: string): Promise<ParseStatus> {
  const local = localDemo(id);
  if (local) return { state: 'ready', meta: local.meta };
  if (!desktop) throw new Error('The demo is no longer loaded. Open the file again.');
  return json<ParseStatus>(await fetch(`/api/demos/${id}`));
}

const roundCache = new Map<string, Promise<RoundData>>();

export function getRound(id: string, round: number): Promise<RoundData> {
  const local = localDemo(id);
  if (local) {
    const data = local.rounds[round - 1];
    return data ? Promise.resolve(data) : Promise.reject(new Error('Round not found.'));
  }
  const key = `${id}/${round}`;
  let promise = roundCache.get(key);
  if (!promise) {
    promise = fetch(`/api/demos/${id}/rounds/${round}`).then((res) => json<RoundData>(res));
    promise.catch(() => roundCache.delete(key));
    roundCache.set(key, promise);
  }
  return promise;
}

let mapsPromise: Promise<Record<string, MapInfo>> | null = null;

export function getMaps(): Promise<Record<string, MapInfo>> {
  mapsPromise ??= fetch('maps/maps.json').then((res) => {
    if (!res.ok) throw new Error('Radar images are missing. Run `npm run fetch-maps` and reload.');
    return res.json();
  });
  mapsPromise.catch(() => (mapsPromise = null));
  return mapsPromise;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}
