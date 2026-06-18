const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

const PORT = process.env.PORT || 5000;
let mainWindow = null;

// Use the product name for the runtime app identity so the user-data dir is
// ~/.config/Cantina (Electron otherwise defaults to the package.json "name").
// Must run before any app.getPath() call.
app.setName('Cantina');

// 1. Writable data dir — a packaged app cannot write inside its install dir.
const userDataDir = app.getPath('userData');
fs.mkdirSync(userDataDir, { recursive: true });
process.env.CANTINA_STATE_FILE = path.join(userDataDir, 'state.json');

// 2. Baked-in YouTube key: load the bundled .env (repo root in dev,
//    process.resourcesPath when packaged) before the server reads it.
const envCandidates = [
  path.join(process.resourcesPath || '', '.env'),
  path.join(__dirname, '..', '.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
}

// Resolve once a TCP port is found free (or report it busy).
function checkPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Cantina',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadWhenReady();
}

// The window may be created before server.listen() finishes; retry the load.
function loadWhenReady(attempt = 0) {
  const url = `http://localhost:${PORT}/?mode=bar`;
  mainWindow.loadURL(url).catch(() => {});
  mainWindow.webContents.once('did-fail-load', () => {
    if (attempt < 20) {
      setTimeout(() => loadWhenReady(attempt + 1), 400);
    } else {
      dialog.showErrorBox('Cantina', 'Could not load the bar console — the server did not start.');
    }
  });
}

app.whenReady().then(async () => {
  const free = await checkPortFree(PORT);
  if (!free) {
    dialog.showErrorBox('Cantina', `Cantina is already running, or port ${PORT} is in use.`);
    app.quit();
    return;
  }
  // Boot the bundled back end in-process.
  require(path.join(__dirname, '..', 'server', 'index.js'));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
