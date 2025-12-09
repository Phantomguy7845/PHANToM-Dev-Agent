// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const fetch = require('node-fetch'); // สำหรับเรียก OpenAI API

let mainWindow = null;
let WORKSPACE_ROOT = null;

// ---------- Workspace helpers ----------

function setWorkspaceRoot(rootPath) {
  if (!rootPath) {
    WORKSPACE_ROOT = null;
    return;
  }
  WORKSPACE_ROOT = path.resolve(rootPath);
  console.log('[Workspace] set to:', WORKSPACE_ROOT);
}

// ฟังก์ชันเช็ค path เวอร์ชันแก้แล้ว
function isPathAllowed(targetPath) {
  if (!WORKSPACE_ROOT) return false;

  const root = path.resolve(WORKSPACE_ROOT);
  const resolvedTarget = path.resolve(targetPath);

  // อนุญาต root เอง
  if (resolvedTarget === root) return true;

  // อนุญาตทุก path ที่อยู่ "ใต้" root
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  return resolvedTarget.startsWith(rootWithSep);
}

// ---------- Create window ----------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC: Workspace ----------

ipcMain.handle('workspace:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'เลือก Workspace Root',
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths.length) {
    return { ok: false, root: WORKSPACE_ROOT };
  }

  setWorkspaceRoot(result.filePaths[0]);
  return { ok: true, root: WORKSPACE_ROOT };
});

ipcMain.handle('workspace:get', () => {
  ret
