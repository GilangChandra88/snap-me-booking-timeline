const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Handler IPC: buat folder lokal di beberapa path sekaligus
ipcMain.handle('create-local-folders', async (_event, basePaths, folderName) => {
  const results = [];
  for (const base of (basePaths || [])) {
    if (!base || !base.trim()) continue;
    const localFolderPath = path.join(base.trim(), folderName);
    try {
      if (fs.existsSync(localFolderPath)) {
        results.push({ path: localFolderPath, status: 'exists' });
      } else {
        fs.mkdirSync(localFolderPath, { recursive: true });
        results.push({ path: localFolderPath, status: 'created' });
      }
    } catch (err) {
      results.push({ path: localFolderPath, status: 'error', message: err.message });
    }
  }
  return results;
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Karena menggunakan mode dev, load localhost (coba 5173 dulu, fallback 5174)
  const devServerURL = 'http://localhost:5173';
  const devServerURL2 = 'http://localhost:5174';
  
  const http = require('http');
  const tryLoad = (url) => {
    const req = http.get(url, () => {
      mainWindow.loadURL(url);
      req.destroy();
    });
    req.on('error', () => mainWindow.loadURL(devServerURL2));
    req.setTimeout(1000, () => {
      req.destroy();
      mainWindow.loadURL(devServerURL2);
    });
  };
  tryLoad(devServerURL);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
