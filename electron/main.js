const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Root of the web app (one level up from this electron/ folder).
const APP_ROOT = path.join(__dirname, '..');

// Custom scheme used to serve the app. A real scheme (instead of file://) is
// required so that ES module imports work — Chromium blocks `<script type=module>`
// loaded over file:// due to its CORS policy.
const SCHEME = 'app';
const START_URL = `${SCHEME}://musi/index.html`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }
]);

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl);
  // Strip the leading slash and decode; default to index.html.
  let pathname = decodeURIComponent(url.pathname);
  if (!pathname || pathname === '/') pathname = '/index.html';

  // Resolve safely within APP_ROOT to prevent path traversal.
  const resolved = path.normalize(path.join(APP_ROOT, pathname));
  if (resolved !== APP_ROOT && !resolved.startsWith(APP_ROOT + path.sep)) {
    return null;
  }
  return resolved;
}

function registerAppProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const filePath = resolveRequestPath(request.url);
    if (!filePath) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      // net.fetch over a file URL streams the file and infers the MIME type.
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 360,
    minHeight: 480,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    title: 'Musi',
    icon: path.join(APP_ROOT, 'favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadURL(START_URL);

  // Open external links (e.g. Google Fonts docs) in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  return win;
}

function setupPermissions() {
  const ses = require('electron').session.defaultSession;
  // The recorder / tuner / ear-trainer features need microphone + audio access.
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'microphone'];
    callback(allowed.includes(permission));
  });
  ses.setPermissionCheckHandler((webContents, permission) => {
    return ['media', 'audioCapture', 'microphone'].includes(permission);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    registerAppProtocol();
    setupPermissions();
    Menu.setApplicationMenu(null);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
