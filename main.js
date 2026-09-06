'use strict';

// Keep the Chromium build Playwright downloads next to the package (node_modules)
// instead of the OS-level cache, so it travels with the packaged app.
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const runner = require('./automation/runner');

let mainWindow;
let browserContext = null;
let browserPage = null;
let browserHandle = null; // CDP browser object, only set in "attach" mode
let browserMode = null;
let stopRequested = false;

function sendLog(message, level = 'info') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', { message, level, ts: Date.now() });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (browserMode === 'attach') {
    // Only disconnect — never close the user's real Chrome/context.
    if (browserHandle) await browserHandle.close().catch(() => {});
  } else if (browserContext) {
    await browserContext.close().catch(() => {});
  }
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-browser', async (_event, { mode } = {}) => {
  try {
    let context, page, browser;
    if (mode === 'attach') {
      ({ context, page, browser } = await runner.openBrowserAttached(sendLog));
    } else {
      const userDataDir = path.join(app.getPath('userData'), 'vsfy-browser-profile');
      ({ context, page } = await runner.openBrowser(userDataDir, sendLog));
    }
    browserContext = context;
    browserPage = page;
    browserHandle = browser || null;
    browserMode = mode === 'attach' ? 'attach' : 'isolated';

    // Detect login asynchronously so the UI doesn't block.
    runner
      .waitForLogin(page, sendLog, () => stopRequested)
      .then((loggedIn) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('login-status', { loggedIn });
        }
      });

    return { ok: true };
  } catch (err) {
    sendLog(`Erro ao abrir o navegador: ${err.message}`, 'error');
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('run-automation', async (_event, { templates, options }) => {
  if (!browserPage) {
    sendLog('Abra o navegador e faça login antes de iniciar.', 'error');
    return { ok: false, error: 'no-browser' };
  }
  stopRequested = false;
  runner
    .runAll(browserPage, templates, options, sendLog, () => stopRequested)
    .then((result) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('run-finished', result);
      }
    })
    .catch((err) => {
      sendLog(`Erro inesperado na automação: ${err.message}`, 'error');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('run-finished', { ok: false, error: err.message });
      }
    });
  return { ok: true };
});

ipcMain.handle('stop-automation', async () => {
  stopRequested = true;
  sendLog('Solicitação de parada recebida. Vou parar após o template atual.', 'warn');
  return { ok: true };
});
