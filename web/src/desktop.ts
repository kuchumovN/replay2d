/** Bridge exposed by the Electron preload script; absent in the browser. */
export interface DesktopBridge {
  /** Absolute path of a dropped/selected file, or "" if unknown. */
  pathForFile(file: File): string;
  /** Token required by the local-file endpoint. */
  token: string;
  /** App version (x.y.z). */
  version: string;
  /** Compares the app with the latest GitHub release. */
  checkForUpdate(): Promise<{ current: string; latest: string; available: boolean }>;
  /** Downloads and starts the latest installer: Windows restarts into it, macOS opens the disk image. */
  installUpdate(onProgress: (fraction: number) => void): Promise<'restarting' | 'opened'>;
}

declare global {
  interface Window {
    replay2d?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = typeof window === 'undefined' ? undefined : window.replay2d;
