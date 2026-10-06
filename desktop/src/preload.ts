import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Exposed as window.skybox (see web/src/desktop.ts).
contextBridge.exposeInMainWorld('skybox', {
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  token: ipcRenderer.sendSync('skybox:token') as string,
  version: ipcRenderer.sendSync('skybox:version') as string,
  checkForUpdate: () => ipcRenderer.invoke('skybox:update-check'),
  installUpdate: (onProgress: (fraction: number) => void) => {
    const listener = (_e: unknown, fraction: number) => onProgress(fraction);
    ipcRenderer.on('skybox:update-progress', listener);
    return ipcRenderer.invoke('skybox:update-install').finally(() => ipcRenderer.removeListener('skybox:update-progress', listener));
  },
});
