/**
 * GlassFolio desktop shell (Electron main process).
 *
 * It starts the same zero-dependency local server as the Docker image (server/docker-server.mjs) on a fixed
 * loopback port, then shows it in its own window at http://localhost:<port>. The web app, its CSP, the vault API,
 * the market-data proxy and the MCP bridge are therefore exactly the local edition: nothing is re-implemented here.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, session, shell, utilityProcess } from 'electron';
import electronUpdater from 'electron-updater';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR_NAME, SETTINGS_FILE_NAME, UPDATE_CHECK_INTERVAL_MS, UPDATE_FIRST_CHECK_DELAY_MS } from './lib/constants.mjs';
import { messagesFor } from './lib/messages.mjs';
import { appUrl, isAppUrl, isExternalOpenable } from './lib/navigation.mjs';
import { choosePort } from './lib/ports.mjs';
import { waitForHealth } from './lib/serverProcess.mjs';
import { buildServerEnv } from './lib/serverEnv.mjs';
import { createSettingsStore } from './lib/settingsStore.mjs';
import { createUpdateController } from './lib/updateController.mjs';
import { publicKeyFromBase64 } from './lib/updateManifest.mjs';
import { findWoobRuntime } from './lib/woobRuntime.mjs';
import { UPDATE_PUBLIC_KEY_BASE64 } from './update-public-key.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const isMac = process.platform === 'darwin';

app.setName('GlassFolio');
// Tests and development runs use a throwaway profile; a packaged app always uses the real one
if (!app.isPackaged && process.env.GLASSFOLIO_DESKTOP_USER_DATA) app.setPath('userData', process.env.GLASSFOLIO_DESKTOP_USER_DATA);

// Development: `npm run desktop:dev` builds ../dist and runs this folder. Packaged: everything sits in Resources.
const resourcesRoot = app.isPackaged ? process.resourcesPath : path.resolve(here, '..');
const serverScript = path.join(resourcesRoot, 'server', 'docker-server.mjs');
const staticDir = path.join(resourcesRoot, 'dist');
const mcpEntry = path.join(resourcesRoot, 'mcp-server', 'index.mjs');

let mainWindow = null;
let serverProcess = null;
let serverPort = 0;
let quitting = false;
let settings = null;
let updates = null;
let updateTimer = null;

// One window, one server: a second launch only brings the first one forward (a second MCP bridge tab would steal the first).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(boot).catch(fail);
}

function fail(error) {
  const text = messagesFor(app.getLocale());
  const detail = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox('GlassFolio', `${text.startFailed}\n\n${detail}`);
  quitting = true;
  app.exit(1);
}

async function boot() {
  settings = createSettingsStore(path.join(app.getPath('userData'), SETTINGS_FILE_NAME));
  hardenSession();
  Menu.setApplicationMenu(buildMenu());

  const port = await choosePort({ remembered: settings.get().port });
  if (port === null) throw new Error(messagesFor(app.getLocale()).portsBusy);
  serverPort = port;
  settings.update({ port });

  await startServer(port);
  setUpUpdates();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function startServer(port) {
  const dataDir = path.join(app.getPath('userData'), DATA_DIR_NAME);
  serverProcess = utilityProcess.fork(serverScript, [], {
    env: buildServerEnv({ port, dataDir, staticDir, woob: findWoobRuntime({ resourcesRoot, packaged: app.isPackaged }) }),
    serviceName: 'glassfolio-server',
    stdio: 'ignore',
  });
  let alive = true;
  serverProcess.once('exit', () => {
    alive = false;
    if (quitting) return;
    dialog.showErrorBox('GlassFolio', messagesFor(app.getLocale()).serverStopped);
    app.quit();
  });
  return waitForHealth({ port, isAlive: () => alive }).then((ready) => {
    if (!ready) throw new Error(messagesFor(app.getLocale()).startFailed);
  });
}

function createWindow() {
  const saved = settings.get().window;
  const bounds = saved && screen.getAllDisplays().some((display) => rectsOverlap(display.workArea, saved)) ? saved : null;

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1360,
    height: bounds?.height ?? 900,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'GlassFolio',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  if (bounds?.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const contents = mainWindow.webContents;
  // Links that leave the app open in the system browser; the window itself never leaves the local server
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalOpenable(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const keepInApp = (event, url) => {
    if (isAppUrl(url, serverPort)) return;
    event.preventDefault();
    if (isExternalOpenable(url)) shell.openExternal(url);
  };
  contents.on('will-navigate', keepInApp);
  contents.on('will-redirect', keepInApp);

  let saveTimer = null;
  const saveBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
      const maximized = mainWindow.isMaximized();
      const current = maximized ? (settings.get().window ?? mainWindow.getNormalBounds()) : mainWindow.getBounds();
      settings.update({ window: { x: current.x, y: current.y, width: current.width, height: current.height, maximized } });
    }, 400);
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);
  mainWindow.on('close', saveBounds);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(appUrl(serverPort));
}

const rectsOverlap = (a, b) => b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y;

/** Nothing beyond what the app needs: no camera, no microphone, no geolocation, no webview, no navigation away. */
function hardenSession() {
  const allowed = new Set(['clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed.has(permission));
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}

function buildMenu() {
  // Role-based menus only: the system translates them, so no text of ours lives in the shell
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]);
}

function setUpUpdates() {
  let publicKey = null;
  try {
    if (UPDATE_PUBLIC_KEY_BASE64) publicKey = publicKeyFromBase64(UPDATE_PUBLIC_KEY_BASE64);
  } catch {
    publicKey = null;
  }

  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  updates = createUpdateController({
    currentVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    publicKey,
    execPath: process.execPath,
    appImage: process.env.APPIMAGE ?? '',
    pid: process.pid,
    workRoot: app.getPath('temp'),
    standardUpdater: autoUpdater,
    quitApp: () => {
      quitting = true;
      app.quit();
    },
    openExternal: (url) => shell.openExternal(url),
  });
  updates.subscribe((state) => mainWindow?.webContents.send('glassfolio:update-state', state));

  const runAutoCheck = () => {
    if (settings.get().autoUpdateCheck) updates.check({ manual: false });
  };
  setTimeout(runAutoCheck, UPDATE_FIRST_CHECK_DELAY_MS).unref();
  updateTimer = setInterval(runAutoCheck, UPDATE_CHECK_INTERVAL_MS);
  updateTimer.unref();
}

/** Only the app's own page may talk to the main process. */
const fromApp = (event) => event.senderFrame !== null && isAppUrl(event.senderFrame.url, serverPort);

function registerIpc() {
  const handle = (channel, handler) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (!fromApp(event)) throw new Error('Untrusted sender');
      return handler(...args);
    });

  handle('glassfolio:get-info', () => ({
    version: app.getVersion(),
    platform: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux',
    arch: process.arch,
    port: serverPort,
    mcpEntryPath: mcpEntry,
    executablePath: process.execPath,
    autoUpdateCheck: settings.get().autoUpdateCheck,
  }));
  handle('glassfolio:update-get-state', () => updates.getState());
  handle('glassfolio:update-check', () => updates.check({ manual: true }));
  handle('glassfolio:update-install', () => updates.install());
  handle('glassfolio:update-open-release-page', () => updates.openReleasePage());
  handle('glassfolio:set-auto-update-check', (enabled) => {
    settings.update({ autoUpdateCheck: enabled === true });
    return settings.get().autoUpdateCheck;
  });
}

app.on('before-quit', () => {
  quitting = true;
  clearInterval(updateTimer);
});
app.on('will-quit', () => {
  serverProcess?.kill();
});
// The server only serves this window (and the MCP bridge relays to it): closing the window ends both, on every platform
app.on('window-all-closed', () => app.quit());
