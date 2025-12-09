const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Workspace
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  getWorkspaceRoot: () => ipcRenderer.invoke('workspace:get'),

  // File system
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', { filePath, content }),

  // Terminal
  runCommand: (command, cwd) => ipcRenderer.invoke('terminal:run', { command, cwd }),
  onTerminalLog: (callback) => {
    ipcRenderer.on('terminal:log', (_event, data) => callback(data));
  },

  // AI Chat
  aiChat: (payload) => ipcRenderer.invoke('ai:chat', payload)
});
