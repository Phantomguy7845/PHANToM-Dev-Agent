// ---------- DOM refs ----------

const workspacePathEl = document.getElementById('workspace-path');
const btnChangeWorkspace = document.getElementById('btn-change-workspace');
const fileTreeEl = document.getElementById('file-tree');

const currentFileEl = document.getElementById('current-file');
const btnSave = document.getElementById('btn-save');
const editorEl = document.getElementById('editor');

const terminalLogEl = document.getElementById('terminal-log');
const terminalFormEl = document.getElementById('terminal-form');
const terminalCommandEl = document.getElementById('terminal-command');

const aiMessagesEl = document.getElementById('ai-messages');
const aiFormEl = document.getElementById('ai-form');
const aiPromptEl = document.getElementById('ai-prompt');
const aiProviderEl = document.getElementById('ai-provider');
const aiApiKeyEl = document.getElementById('ai-api-key');

// ---------- State ----------

let currentWorkspaceRoot = null;
let currentDir = null;
let currentFilePath = null;
let chatHistory = []; // [{role, content}, ...]

window.api.onTerminalLog(line => {
  terminalLogEl.textContent += line;
  terminalLogEl.scrollTop = terminalLogEl.scrollHeight;
});

// ---------- Workspace / File tree ----------

async function refreshWorkspaceLabel() {
  if (!currentWorkspaceRoot) {
    workspacePathEl.textContent = 'ยังไม่ได้ตั้งค่า workspace';
  } else {
    workspacePathEl.textContent = currentWorkspaceRoot;
  }
}

async function loadWorkspaceFromMain() {
  const res = await window.api.getWorkspaceRoot();
  currentWorkspaceRoot = res.root || null;
  currentDir = currentWorkspaceRoot;

  await refreshWorkspaceLabel();

  if (currentWorkspaceRoot) {
    await loadFileTree(currentDir);
  }
}

async function chooseWorkspace() {
  try {
    const res = await window.api.chooseWorkspace();
    if (!res.ok) return;

    currentWorkspaceRoot = res.root;
    currentDir = currentWorkspaceRoot;
    await refreshWorkspaceLabel();
    await loadFileTree(currentDir);
  } catch (err) {
    console.error(err);
    alert('เลือก workspace ไม่สำเร็จ: ' + err.message);
  }
}

async function loadFileTree(dirPath) {
  try {
    const items = await window.api.readDir(dirPath);
    fileTreeEl.innerHTML = '';

    // เพิ่ม ".." กลับไปโฟลเดอร์ก่อนหน้า ถ้าไม่ใช่ root
    if (dirPath !== currentWorkspaceRoot) {
      const liUp = document.createElement('li');
      liUp.textContent = '..';
      liUp.style.fontStyle = 'italic';
      liUp.addEventListener('click', () => {
        const parent = dirPath.split(/[\\/]/).slice(0, -1).join(pathSeparator(dirPath));
        if (parent && parent.startsWith(currentWorkspaceRoot)) {
          currentDir = parent;
          loadFileTree(currentDir);
        }
      });
      fileTreeEl.appendChild(liUp);
    }

    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item.isDir ? `📁 ${item.name}` : item.name;
      li.dataset.fullPath = item.fullPath;
      li.dataset.isDir = item.isDir ? '1' : '0';

      li.addEventListener('click', async () => {
        const fullPath = li.dataset.fullPath;
        const isDir = li.dataset.isDir === '1';

        if (isDir) {
          currentDir = fullPath;
          await loadFileTree(currentDir);
        } else {
          await openFile(fullPath);
        }
      });

      fileTreeEl.appendChild(li);
    }
  } catch (err) {
    console.error(err);
    alert('โหลดไฟล์ลิสต์ไม่สำเร็จ: ' + err.message);
  }
}

// helper แบบง่าย ๆ แยก path separator
function pathSeparator(p) {
  return p.includes('\\') ? '\\' : '/';
}

async function openFile(filePath) {
  try {
    const content = await window.api.readFile(filePath);
    currentFilePath = filePath;
    editorEl.value = content;
    currentFileEl.textContent = filePath;
  } catch (err) {
    console.error(err);
    alert('อ่านไฟล์ไม่สำเร็จ: ' + err.message);
  }
}

async function saveCurrentFile() {
  if (!currentFilePath) {
    alert('ยังไม่ได้เลือกไฟล์');
    return;
  }
  try {
    await window.api.writeFile(currentFilePath, editorEl.value);
    alert('บันทึกไฟล์สำเร็จ');
  } catch (err) {
    console.error(err);
    alert('บันทึกไฟล์ไม่สำเร็จ: ' + err.message);
  }
}

// ---------- Terminal ----------

terminalFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const cmd = terminalCommandEl.value.trim();
  if (!cmd) return;
  if (!currentWorkspaceRoot) {
    alert('ยังไม่ได้ตั้งค่า workspace');
    return;
  }

  terminalLogEl.textContent += `\n> ${cmd}\n`;
  terminalLogEl.scrollTop = terminalLogEl.scrollHeight;
  terminalCommandEl.value = '';

  try {
    await window.api.runCommand(cmd, currentDir || currentWorkspaceRoot);
  } catch (err) {
    console.error(err);
    terminalLogEl.textContent += `[ERROR] ${err.message}\n`;
  }
});

// ---------- AI Chat ----------

function appendMessage(role, content) {
  chatHistory.push({ role, content });

  const msg = document.createElement('div');
  msg.classList.add('ai-message', role === 'user' ? 'user' : 'assistant');
  msg.textContent = content;
  aiMessagesEl.appendChild(msg);
  aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
}

aiFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();

  const text = aiPromptEl.value.trim();
  const apiKey = aiApiKeyEl.value.trim();
  const providerId = aiProviderEl.value;

  if (!text) return;
  if (!apiKey) {
    alert('กรุณาใส่ OpenAI API key ก่อน');
    return;
  }

  appendMessage('user', text);
  aiPromptEl.value = '';

  // เตรียม messages ทั้ง history
  const messages = chatHistory.map(m => ({
    role: m.role,
    content: m.content
  }));

  // เพิ่ม assistant placeholder
  appendMessage('assistant', '…กำลังคิดให้ก่อนนะ…');
  const placeholderIndex = chatHistory.length - 1;
  const lastMessageEl = aiMessagesEl.lastChild;

  try {
    const reply = await window.api.aiChat({
      providerId,
      apiKey,
      messages,
      options: { model: 'gpt-4.1-mini' } // เปลี่ยนตามที่คุณใช้จริง
    });

    // แทนที่ placeholder
    chatHistory[placeholderIndex].content = reply;
    lastMessageEl.textContent = reply;
  } catch (err) {
    console.error(err);
    lastMessageEl.textContent = '[ERROR] ' + err.message;
  }
});

// ---------- Events ----------

btnChangeWorkspace.addEventListener('click', chooseWorkspace);
btnSave.addEventListener('click', saveCurrentFile);

// โหลด workspace ถ้ามีอยู่แล้ว
loadWorkspaceFromMain().catch(console.error);
