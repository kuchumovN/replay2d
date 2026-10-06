import type { AnalysisJob, AppSettings, DemoExtract, LibraryDemo, MapInfo, ParseStatus, RoundData, SummaryRequest } from '@skybox/shared';
import { desktop } from './desktop';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
  return body as T;
}

/** Uploads a demo as a raw body; resolves with the parse job id. */
export function uploadDemo(file: File, onProgress: (fraction: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/demos?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { id?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // handled below
      }
      if (xhr.status === 200 && body.id) resolve(body.id);
      else reject(new Error(body.error ?? `Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Upload failed: server is not reachable.'));
    xhr.send(file);
  });
}

/** Desktop only: parses a demo straight from disk instead of uploading it. */
export async function openLocalDemo(path: string): Promise<string> {
  const res = await fetch('/api/demos/local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-skybox-token': desktop?.token ?? '' },
    body: JSON.stringify({ path }),
  });
  return (await json<{ id: string }>(res)).id;
}

export async function getStatus(id: string): Promise<ParseStatus> {
  return json<ParseStatus>(await fetch(`/api/demos/${id}`));
}

const roundCache = new Map<string, Promise<RoundData>>();

export function getRound(id: string, round: number): Promise<RoundData> {
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
  mapsPromise ??= fetch('/maps/maps.json').then((res) => {
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

// Settings and route analysis

export async function getSettings(): Promise<AppSettings> {
  return json<AppSettings>(await fetch('/api/settings'));
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return json<AppSettings>(
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }),
  );
}

export async function listAnalysisDemos(): Promise<LibraryDemo[]> {
  return json<LibraryDemo[]>(await fetch('/api/analysis/demos'));
}

/** Queues a demo for route extraction: by path in the desktop app, otherwise uploaded. Resolves with the job id. */
export async function addAnalysisDemo(file: File): Promise<string> {
  const path = desktop?.pathForFile(file);
  const res = path
    ? await fetch('/api/analysis/demos/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-skybox-token': desktop?.token ?? '' },
        body: JSON.stringify({ path }),
      })
    : await fetch(`/api/analysis/demos?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
  return (await json<{ jobId: string }>(res)).jobId;
}

export async function getAnalysisJob(id: string): Promise<AnalysisJob> {
  return json<AnalysisJob>(await fetch(`/api/analysis/jobs/${id}`));
}

export async function removeAnalysisDemo(id: string): Promise<void> {
  await json(await fetch(`/api/analysis/demos/${id}`, { method: 'DELETE' }));
}

export async function getMapExtracts(map: string): Promise<DemoExtract[]> {
  return json<DemoExtract[]>(await fetch(`/api/analysis/maps/${encodeURIComponent(map)}`));
}

export async function listModels(): Promise<string[]> {
  return json<string[]>(await fetch('/api/llm/models'));
}

export async function summarize(req: SummaryRequest): Promise<string> {
  const res = await fetch('/api/llm/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
  return (await json<{ text: string }>(res)).text;
}
