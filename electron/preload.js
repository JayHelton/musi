const { contextBridge } = require('electron');

// Minimal, safe bridge. The app is a self-contained static site, so it needs no
// privileged APIs today — this exposes only a small metadata object and leaves
// room to add IPC features later without weakening context isolation.
contextBridge.exposeInMainWorld('musi', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
});
