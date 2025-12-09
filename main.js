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
  return { root: WORKSPACE_ROOT };
});

// ---------- IPC: File system ----------

ipcMain.handle('fs:readDir', async (_event, dirPath) => {
  if (!WORKSPACE_ROOT) throw new Error('Workspace ยังไม่ได้ตั้งค่า');
  if (!isPathAllowed(dirPath)) throw new Error('Access denied: outside workspace');

  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  return items.map(i => ({
    name: i.name,
    isDir: i.isDirectory(),
    fullPath: path.join(dirPath, i.name)
  }));
});

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  if (!WORKSPACE_ROOT) throw new Error('Workspace ยังไม่ได้ตั้งค่า');
  if (!isPathAllowed(filePath)) throw new Error('Access denied: outside workspace');

  return fs.readFileSync(filePath, 'utf8');
});

ipcMain.handle('fs:writeFile', async (_event, { filePath, content }) => {
  if (!WORKSPACE_ROOT) throw new Error('Workspace ยังไม่ได้ตั้งค่า');
  if (!isPathAllowed(filePath)) throw new Error('Access denied: outside workspace');

  fs.writeFileSync(filePath, content, 'utf8');
  return true;
});

// ---------- IPC: Terminal / Commands ----------

function isCommandDangerous(cmd) {
  const lowered = cmd.toLowerCase();
  if (lowered.includes('rm -rf /')) return true;
  if (lowered.includes('rm -rf /*')) return true;
  if (lowered.includes('format ')) return true;
  return false;
}

ipcMain.handle('terminal:run', (event, { command, cwd }) => {
  if (!WORKSPACE_ROOT) throw new Error('Workspace ยังไม่ได้ตั้งค่า');

  const dirToUse = cwd ? path.resolve(cwd) : WORKSPACE_ROOT;
  if (!isPathAllowed(dirToUse)) throw new Error('Cannot run outside workspace');

  if (isCommandDangerous(command)) {
    throw new Error('Command blocked by safety policy');
  }

  const child = spawn(command, {
    shell: true,
    cwd: dirToUse
  });

  child.stdout.on('data', data => {
    event.sender.send('terminal:log', data.toString());
  });

  child.stderr.on('data', data => {
    event.sender.send('terminal:log', data.toString());
  });

  child.on('close', code => {
    event.sender.send('terminal:log', `\n[Process exited with code ${code}]\n`);
  });

  return true;
});

// ---------- IPC: AI Chat (OpenAI v0) ----------

ipcMain.handle('ai:chat', async (_event, { providerId, apiKey, messages, options }) => {
  if (providerId !== 'openai') {
    throw new Error('ตอนนี้รองรับเฉพาะ OpenAI เท่านั้น');
  }
  if (!apiKey) {
    throw new Error('ยังไม่ได้ใส่ API key');
  }

  const model = options?.model || 'gpt-4.1-mini';

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages
      })
    });

    const data = await res.json();
    if (data.error) {
      console.error('[OpenAI Error]', data.error);
      throw new Error(data.error.message || 'OpenAI API error');
    }

    const content = data.choices?.[0]?.message?.content || '';
    return content;
  } catch (err) {
    console.error('[ai:chat] error:', err);
    throw err;
  }
});
