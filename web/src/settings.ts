import { DEFAULT_SETTINGS, type AppSettings } from '@skybox/shared';
import { useSyncExternalStore } from 'react';
import { getSettings, saveSettings } from './api';

let settings: AppSettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();
const set = (next: AppSettings) => {
  settings = next;
  listeners.forEach((l) => l());
};

// Loaded once; until then (or if the server has no settings) the defaults apply.
getSettings().then(set, () => {});

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => settings,
  );
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  set({ ...settings, ...patch });
  set(await saveSettings(patch));
}
