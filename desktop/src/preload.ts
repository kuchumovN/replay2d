import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Exposed as window.replay2d (see web/src/desktop.ts).
contextBridge.exposeInMainWorld('replay2d', {
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  token: ipcRenderer.sendSync('replay2d:token') as string,
  version: ipcRenderer.sendSync('replay2d:version') as string,
  checkForUpdate: () => ipcRenderer.invoke('replay2d:update-check'),
  installUpdate: (onProgress: (fraction: number) => void) => {
    const listener = (_e: unknown, fraction: number) => onProgress(fraction);
    ipcRenderer.on('replay2d:update-progress', listener);
    return ipcRenderer.invoke('replay2d:update-install').finally(() => ipcRenderer.removeListener('replay2d:update-progress', listener));
  },
});
