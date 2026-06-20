const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Membuat folder lokal di path yang diberikan.
   * @param {string[]} basePaths - Array path induk (Folder Lokal 1, Folder Lokal 2)
   * @param {string} folderName  - Nama sub-folder yang akan dibuat
   * @returns {Promise<{path: string, status: 'created'|'exists'|'error', message?: string}[]>}
   */
  createLocalFolders: (basePaths, folderName) =>
    ipcRenderer.invoke('create-local-folders', basePaths, folderName),
});
