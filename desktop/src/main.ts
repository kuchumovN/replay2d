import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { buildServer } from '../../server/src/app.js';
import { setWorkerScript } from '../../server/src/store.js';
import { checkForUpdate, installUpdate } from './updater.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const token = randomBytes(24).toString('hex');

// Packaged builds keep the native parser in resources/native (outside the app bundle).
const packagedParser = join(process.resourcesPath ?? '', 'native', 'demoparser2');
if (app.isPackaged && existsSync(packagedParser)) process.env.SKYBOX_DEMOPARSER = packagedParser;
// Parsing runs in workers, but the native module must stay loaded in the main process too: otherwise it is unloaded
// when a worker exits while the parser's thread pool is still alive, and the app crashes (access violation).
createRequire(import.meta.url)(process.env.SKYBOX_DEMOPARSER ?? '@laihoe/demoparser2');

setWorkerScript(new URL('./worker.mjs', import.meta.url));

if (!app.requestSingleInstanceLock()) app.quit();

let window: BrowserWindow | null = null;

async function start() {
  const server = await buildServer({ webRoot: join(here, 'web'), localFileToken: token, dataDir: app.getPath('userData') });
  // Random free port on loopback only.
  await server.listen({ port: 0, host: '127.0.0.1' });
  const address = server.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  ipcMain.on('skybox:token', (e) => (e.returnValue = token));
  ipcMain.on('skybox:version', (e) => (e.returnValue = app.getVersion()));
  ipcMain.handle('skybox:update-check', () => checkForUpdate());
  ipcMain.handle('skybox:update-install', (e) => installUpdate((fraction) => e.sender.send('skybox:update-progress', fraction)));

  window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: 'Skybox',
    backgroundColor: '#0b0e12',
    show: false,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.once('ready-to-show', () => window?.show());
  // Links leave the app; navigation inside the window stays on the local server.
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}/`)) e.preventDefault();
  });
  window.on('closed', () => (window = null));
  await window.loadURL(`http://127.0.0.1:${port}/`);
}

app.on('second-instance', () => {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  return start();
});
