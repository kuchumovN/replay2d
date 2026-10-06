import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Exposed as window.skybox (see web/src/desktop.ts).
contextBridge.exposeInMainWorld('skybox', {
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  token: ipcRenderer.sendSync('skybox:token') as string,
});
