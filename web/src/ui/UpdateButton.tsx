import { useSyncExternalStore } from 'react';
import { desktop } from '../desktop';

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; latest: string }
  | { kind: 'downloading'; latest: string; fraction: number }
  | { kind: 'restarting' }
  | { kind: 'opened' }
  | { kind: 'error'; message: string };

// Shared by every screen so the startup check runs once per app launch.
let state: UpdateState = { kind: 'idle' };
const listeners = new Set<() => void>();
const set = (next: UpdateState) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// Electron prefixes errors thrown in ipcMain.handle with "Error invoking remote method ...: Error: ".
const message = (err: unknown) => String((err as Error).message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

async function check(manual: boolean) {
  if (!desktop) return;
  set({ kind: 'checking' });
  try {
    const r = await desktop.checkForUpdate();
    set(r.available ? { kind: 'available', latest: r.latest } : manual ? { kind: 'up-to-date' } : { kind: 'idle' });
  } catch (err) {
    // A failed background check (offline, rate limit) should not nag.
    set(manual ? { kind: 'error', message: message(err) } : { kind: 'idle' });
  }
}

async function install(latest: string) {
  if (!desktop) return;
  set({ kind: 'downloading', latest, fraction: 0 });
  try {
    const result = await desktop.installUpdate((fraction) => set({ kind: 'downloading', latest, fraction }));
    set(result === 'restarting' ? { kind: 'restarting' } : { kind: 'opened' });
  } catch (err) {
    set({ kind: 'error', message: message(err) });
  }
}

if (desktop) void check(false);

export function UpdateButton() {
  const s = useSyncExternalStore(subscribe, () => state);
  if (!desktop) return null;
  const version = `v${desktop.version}`;
  switch (s.kind) {
    case 'idle':
      return (
        <button className="ghost update" onClick={() => check(true)} title="Check for updates">
          {version} · Check for updates
        </button>
      );
    case 'checking':
      return (
        <button className="ghost update" disabled>
          Checking for updates…
        </button>
      );
    case 'up-to-date':
      return (
        <button className="ghost update" onClick={() => check(true)} title="Check again">
          {version} · Up to date
        </button>
      );
    case 'available':
      return (
        <button className="update available" onClick={() => install(s.latest)} title={`Download and install v${s.latest}`}>
          Update to v{s.latest}
        </button>
      );
    case 'downloading':
      return (
        <button className="update available" disabled>
          Downloading v{s.latest}… {Math.round(s.fraction * 100)}%
        </button>
      );
    case 'restarting':
      return (
        <button className="update available" disabled>
          Installing, the app will restart…
        </button>
      );
    case 'opened':
      return (
        <button className="ghost update" disabled>
          Drag Skybox to Applications to finish
        </button>
      );
    case 'error':
      return (
        <button className="ghost update error" onClick={() => check(true)} title={s.message}>
          Update failed · Retry
        </button>
      );
  }
}
