import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { app, shell } from 'electron';

const REPO = 'kuchumovN/skybox-cs2';

export interface UpdateCheck {
  current: string;
  latest: string;
  available: boolean;
}

interface Release {
  version: string;
  assetName: string;
  assetUrl: string;
}

let latest: Release | null = null;

/** Installer asset for this platform, as named by desktop/scripts/dist.mjs. */
function assetSuffix(): string | null {
  if (process.platform === 'win32') return '-windows-setup.exe';
  if (process.platform === 'darwin' && process.arch === 'arm64') return '-mac-apple-silicon.dmg';
  return null;
}

/** True if version a (x.y.z) is newer than b. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateCheck> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Skybox' },
  });
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  const release = (await res.json()) as { tag_name: string; assets: { name: string; browser_download_url: string }[] };
  const version = release.tag_name.replace(/^v/, '');
  const suffix = assetSuffix();
  const asset = suffix ? release.assets.find((a) => a.name.endsWith(suffix)) : undefined;
  latest = asset ? { version, assetName: asset.name, assetUrl: asset.browser_download_url } : null;
  const current = app.getVersion();
  return { current, latest: version, available: !!latest && isNewer(version, current) };
}

/**
 * Downloads the installer of the latest release and starts it. On Windows the silent installer replaces the app and
 * relaunches it; macOS cannot self-update without code signing, so the disk image is opened for the user.
 */
export async function installUpdate(onProgress: (fraction: number) => void): Promise<'restarting' | 'opened'> {
  if (!app.isPackaged) throw new Error('Updates can only be installed in the packaged app');
  if (!latest) await checkForUpdate();
  if (!latest) throw new Error('No installer for this platform in the latest release');

  const res = await fetch(latest.assetUrl, { headers: { 'User-Agent': 'Skybox' } });
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const file = join(app.getPath('temp'), latest.assetName);
  const out = createWriteStream(file);
  const written = new Promise<void>((resolve, reject) => {
    out.on('error', reject);
    out.on('finish', resolve);
  });
  let received = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!out.write(value)) await Promise.race([new Promise((r) => out.once('drain', r)), written]);
      if (total) onProgress(received / total);
    }
  } finally {
    out.end();
  }
  await written;

  if (process.platform === 'win32') {
    // Same flags electron-updater passes to electron-builder's NSIS installer.
    spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 500);
    return 'restarting';
  }
  const error = await shell.openPath(file);
  if (error) throw new Error(error);
  return 'opened';
}
