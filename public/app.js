const socket = io();

// State
let config = { webPort: 2855, geminiApiKey: '', accounts: [] };
let currentLocalIp = '127.0.0.1';
let botStatuses = {}; // accountId -> { status, username, ping }
let botLogs = {}; // accountId -> array of log objects
let selectedAccountId = null;
let isUpdatingUI = false;
let currentBotYaw = 0;
let currentBotPitch = 0;
let isGodModeActive = false;
let ctrlPressCount = 0;

function applyLanguage() {
  const lang = config.language || 'en';
  document.documentElement.lang = lang;
  if (lang === 'ar') {
    document.documentElement.dir = 'rtl';
    document.body.classList.add('rtl-layout');
  } else {
    document.documentElement.dir = 'ltr';
    document.body.classList.remove('rtl-layout');
  }

  const dict = translations[lang] || translations['en'];

  // Update document title
  document.title = (dict.title || "RyzionMC AFK Client") + " Dashboard";

  // Translate elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const value = dict[key] || (translations['en'] && translations['en'][key]);
    if (value) {
      el.textContent = value;
    }
  });

  // Translate placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const value = dict[key] || (translations['en'] && translations['en'][key]);
    if (value) {
      el.placeholder = value;
    }
  });

  // Dynamic remote access text
  const remoteTextEl = document.getElementById('remote-access-text');
  if (remoteTextEl) {
    const ip = currentLocalIp || '127.0.0.1';
    const port = config.webPort || 2855;
    
    // Check if private/local IP
    let isLocal = true;
    if (ip !== '127.0.0.1' && ip !== 'localhost') {
      const parts = ip.split('.');
      if (parts.length === 4) {
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        if (first !== 10 && !(first === 172 && second >= 16 && second <= 31) && !(first === 192 && second === 168)) {
          isLocal = false;
        }
      } else {
        isLocal = false;
      }
    }
    
    const key = isLocal ? 'remote_access_help_local' : 'remote_access_help_public';
    const rawTemplate = dict[key] || (translations['en'] && translations['en'][key]) || "";
    remoteTextEl.textContent = rawTemplate.replace('{ip}', ip).replace('{port}', port);
  }
}

// UI Elements
const accountsListEl = document.getElementById('accounts-list');
const botPanelEl = document.getElementById('bot-panel');
const selectBotPromptEl = document.getElementById('select-bot-prompt');

const currentBotUsernameEl = document.getElementById('current-bot-username');
const currentBotAvatarEl = document.getElementById('current-bot-avatar');
const badgeStatusEl = document.getElementById('badge-status');
const badgePingEl = document.getElementById('badge-ping');
const btnToggleBotEl = document.getElementById('btn-toggle-bot');
const btnEditBotEl = document.getElementById('btn-edit-bot');
const btnDeleteBotEl = document.getElementById('btn-delete-bot');

const terminalLogsEl = document.getElementById('terminal-logs');
const chatInputEl = document.getElementById('chat-input');
const btnSendChatEl = document.getElementById('btn-send-chat');

const toggleAntiAfkEl = document.getElementById('toggle-anti-afk');
const toggleGeminiEl = document.getElementById('toggle-gemini');
const toggleReconnectEl = document.getElementById('toggle-reconnect');
const toggleRespawnEl = document.getElementById('toggle-respawn');
const toggleFeedEl = document.getElementById('toggle-feed');

const infoHostEl = document.getElementById('info-host');
const infoPortEl = document.getElementById('info-port');
const infoAuthEl = document.getElementById('info-auth');
const infoCoordinatesEl = document.getElementById('info-coordinates');
const infoDimensionEl = document.getElementById('info-dimension');
const radarInfoCoordinatesEl = document.getElementById('radar-info-coordinates');

const minimapCanvas = document.getElementById('minimap-canvas');
const ctx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

// Modals
const modalAccount = document.getElementById('modal-account');
const formAccount = document.getElementById('form-account');
const modalTitle = document.getElementById('modal-title');
const btnAddAccount = document.getElementById('btn-add-account');

const modalSettings = document.getElementById('modal-settings');
const formGlobalSettings = document.getElementById('form-global-settings');
const btnGlobalSettings = document.getElementById('btn-global-settings');
const btnShowLicenses = document.getElementById('btn-show-licenses');
const modalLicenses = document.getElementById('modal-licenses');

const modalGodModeAuth = document.getElementById('modal-godmode-auth');
const formGodModeAuth = document.getElementById('form-godmode-auth');
const godModeActiveText = document.getElementById('godmode-active-text');
const godModeBatchOptions = document.getElementById('godmode-batch-options');
const batchCustomFields = document.getElementById('batch-custom-fields');

const modalControl = document.getElementById('modal-control');
const btnOpenControl = document.getElementById('btn-open-control');

const modalInventory = document.getElementById('modal-inventory');
const btnOpenInventory = document.getElementById('btn-open-inventory');
const inventoryMainGrid = document.getElementById('inventory-main-grid');
const inventoryHotbarGrid = document.getElementById('inventory-hotbar-grid');

const modalBatchConnect = document.getElementById('modal-batch-connect');
const btnBatchConnect = document.getElementById('btn-batch-connect');
const btnBatchDisconnect = document.getElementById('btn-batch-disconnect');
const btnConfirmBatchConnect = document.getElementById('btn-confirm-batch-connect');
const btnStopBatch = document.getElementById('btn-stop-batch');
const batchStatusBanner = document.getElementById('batch-status-banner');
const batchStatusText = document.getElementById('batch-status-text');

const modalDeleteConfirm = document.getElementById('modal-delete-confirm');
const btnDeleteConfirm = document.getElementById('btn-delete-confirm');
const btnDeleteCancel = document.getElementById('btn-delete-cancel');

const modalErrorAlert = document.getElementById('modal-error-alert');
const errorAlertText = document.getElementById('error-alert-text');

const modalMsaAuth = document.getElementById('modal-msa-auth');
const msaCodeDisplay = document.getElementById('msa-code-display');
const msaBotUsername = document.getElementById('msa-bot-username');
const btnMsaLogin = document.getElementById('btn-msa-login');

const accountsCountEl = document.getElementById('accounts-count');

// Socket Events
socket.on('init_data', (data) => {
  config = data.config;
  botStatuses = data.botStatuses;
  isGodModeActive = data.isGodModeActive || false;
  currentLocalIp = data.localIp || '127.0.0.1';
  applyLanguage();
  renderAccounts();
  if (selectedAccountId) {
    selectAccount(selectedAccountId);
  }
  updateGodModeUI();
});

socket.on('config_updated', (newConfig) => {
  config = newConfig;
  applyLanguage();
  renderAccounts();
  if (selectedAccountId) {
    updateBotDetails();
  }
});

socket.on('bot_status', (data) => {
  botStatuses[data.accountId] = data;
  updateAccountListItemStatus(data.accountId);
  if (selectedAccountId === data.accountId) {
    updateBotDetails();
  }
});

socket.on('bot_log', (logEntry) => {
  const { accountId } = logEntry;
  if (!botLogs[accountId]) botLogs[accountId] = [];
  botLogs[accountId].push(logEntry);
  
  // Cap logs limit at 200 items to avoid DOM lag
  if (botLogs[accountId].length > 200) {
    botLogs[accountId].shift();
  }

  if (selectedAccountId === accountId) {
    appendLogToTerminal(logEntry);
  }
});

socket.on('bot_telemetry', (data) => {
  if (selectedAccountId !== data.accountId) return;

  currentBotYaw = data.yaw || 0;
  currentBotPitch = data.pitch || 0;

  // 1. Update text displays
  if (infoCoordinatesEl) {
    infoCoordinatesEl.textContent = `X: ${data.x}, Y: ${data.y}, Z: ${data.z}`;
  }
  if (radarInfoCoordinatesEl) {
    radarInfoCoordinatesEl.textContent = `X: ${data.x}, Y: ${data.y}, Z: ${data.z}`;
  }
  if (infoDimensionEl) {
    const lang = config.language || 'en';
    const dict = translations[lang] || translations['en'];
    const dimKey = 'dimension_' + (data.dimension.replace('minecraft:', ''));
    infoDimensionEl.textContent = dict[dimKey] || data.dimension;
  }

  // 2. Draw Minimap Canvas
  drawMinimap(data);

  // 2b. Update angle displays
  const yawDegrees = Math.round((currentBotYaw * 180) / Math.PI);
  const pitchDegrees = Math.round((currentBotPitch * 180) / Math.PI);
  const angleYawVal = document.getElementById('angle-yaw-val');
  const anglePitchVal = document.getElementById('angle-pitch-val');
  if (angleYawVal) angleYawVal.textContent = `${yawDegrees}°`;
  if (anglePitchVal) anglePitchVal.textContent = `${pitchDegrees}°`;

  // 3. Render Inventory
  if (data.inventory) {
    renderInventory(data.inventory);
  }
});

socket.on('batch_status', (data) => {
  if (data.active) {
    const lang = config.language || 'en';
    const dict = translations[lang] || translations['en'];
    batchStatusText.textContent = dict.batch_status_waiting.replace('{sec}', data.nextDelay);
    batchStatusBanner.classList.remove('hidden');
  } else {
    batchStatusBanner.classList.add('hidden');
  }
});

socket.on('microsoft_auth_trigger', (data) => {
  // data: { accountId, userCode, verificationUri }
  const acc = config.accounts.find(a => a.id === data.accountId);
  const username = acc ? acc.username : data.accountId;

  if (msaCodeDisplay && msaBotUsername && btnMsaLogin && modalMsaAuth) {
    msaCodeDisplay.textContent = data.userCode;
    msaBotUsername.textContent = username;
    btnMsaLogin.href = data.verificationUri;
    modalMsaAuth.classList.remove('hidden');
  }
});


function showErrorAlert(message) {
  if (errorAlertText && modalErrorAlert) {
    errorAlertText.textContent = message;
    modalErrorAlert.classList.remove('hidden');
  } else {
    alert(message);
  }
}

// App Logic & Render Helpers
function renderAccounts() {
  accountsListEl.innerHTML = '';
  
  const lang = config.language || 'en';
  const dict = translations[lang] || translations['en'];

  if (accountsCountEl) {
    accountsCountEl.textContent = `(${config.accounts.length})`;
  }

  if (config.accounts.length === 0) {
    accountsListEl.innerHTML = `<div class="empty-state" data-i18n="no_accounts_yet">${dict.no_accounts_yet}</div>`;
    return;
  }

  config.accounts.forEach(acc => {
    const statusData = botStatuses[acc.id] || { status: 'offline' };
    
    const item = document.createElement('div');
    item.className = `account-item ${selectedAccountId === acc.id ? 'active' : ''}`;
    item.dataset.id = acc.id;
    
    // Status text wrapper
    let badgeClass = 'badge-offline';
    let badgeText = dict.status_offline;
    if (statusData.status === 'online') {
      badgeClass = 'badge-online';
      badgeText = dict.status_online;
    } else if (statusData.status === 'connecting') {
      badgeClass = 'badge-connecting';
      badgeText = dict.status_connecting;
    } else if (statusData.status === 'reconnecting') {
      badgeClass = 'badge-reconnecting';
      badgeText = dict.status_reconnecting;
    }

    item.innerHTML = `
      <div class="acc-main-details">
        <img src="https://minotar.net/helm/${acc.username}/32" alt="${acc.username}" class="acc-skin-head" onerror="this.src='https://minotar.net/avatar/char/32'">
        <div class="acc-info">
          <span class="acc-name">${acc.username}</span>
          <span class="acc-server">${acc.host}:${acc.port || 25565}</span>
        </div>
      </div>
      <span class="badge ${badgeClass}" id="list-badge-${acc.id}">${badgeText}</span>
    `;

    item.addEventListener('click', () => selectAccount(acc.id));
    accountsListEl.appendChild(item);
  });
}

function updateAccountListItemStatus(accountId) {
  const badge = document.getElementById(`list-badge-${accountId}`);
  if (!badge) return;

  const statusData = botStatuses[accountId] || { status: 'offline' };
  const lang = config.language || 'en';
  const dict = translations[lang] || translations['en'];
  
  // Reset classes
  badge.className = 'badge';
  
  if (statusData.status === 'online') {
    badge.textContent = dict.status_online;
    badge.classList.add('badge-online');
  } else if (statusData.status === 'connecting') {
    badge.textContent = dict.status_connecting;
    badge.classList.add('badge-connecting');
  } else if (statusData.status === 'reconnecting') {
    badge.textContent = dict.status_reconnecting;
    badge.classList.add('badge-reconnecting');
  } else {
    badge.textContent = dict.status_offline;
    badge.classList.add('badge-offline');
  }
}

function selectAccount(id) {
  selectedAccountId = id;
  isSneakToggled = false;
  highlightButton('sneak', false);

  // Clear inventory grids on account switch to prevent ghost items
  if (inventoryMainGrid) inventoryMainGrid.innerHTML = '';
  if (inventoryHotbarGrid) inventoryHotbarGrid.innerHTML = '';
  
  // Highlight in sidebar
  document.querySelectorAll('.account-item').forEach(el => {
    el.classList.remove('active');
    if (el.dataset.id === id) el.classList.add('active');
  });

  botPanelEl.classList.remove('hidden');
  selectBotPromptEl.classList.add('hidden');

  updateBotDetails();
  
  // Render logs
  terminalLogsEl.innerHTML = '';
  const logs = botLogs[id] || [];
  logs.forEach(appendLogToTerminal);

  // Smooth scroll to bot details panel on mobile
  if (window.innerWidth <= 768) {
    botPanelEl.scrollIntoView({ behavior: 'smooth' });
  }
}

function updateBotDetails() {
  const account = config.accounts.find(acc => acc.id === selectedAccountId);
  if (!account) {
    botPanelEl.classList.add('hidden');
    selectBotPromptEl.classList.remove('hidden');
    selectedAccountId = null;
    return;
  }

  isUpdatingUI = true;

  const statusData = botStatuses[selectedAccountId] || { status: 'offline', ping: 0 };
  
  currentBotUsernameEl.textContent = account.username;
  currentBotAvatarEl.src = `https://minotar.net/helm/${account.username}/32`;
  
  // Update status badge
  const lang = config.language || 'en';
  const dict = translations[lang] || translations['en'];

  badgeStatusEl.className = 'badge';
  if (statusData.status === 'online') {
    badgeStatusEl.classList.add('badge-online');
    badgeStatusEl.textContent = dict.status_online;
    btnToggleBotEl.textContent = dict.btn_disconnect;
    btnToggleBotEl.className = 'btn btn-danger';
    chatInputEl.removeAttribute('disabled');
    btnSendChatEl.removeAttribute('disabled');
  } else if (statusData.status === 'connecting' || statusData.status === 'reconnecting') {
    badgeStatusEl.classList.add('badge-connecting');
    badgeStatusEl.textContent = statusData.status === 'connecting' ? dict.status_connecting : dict.status_reconnecting;
    btnToggleBotEl.textContent = dict.btn_disconnect;
    btnToggleBotEl.className = 'btn btn-danger';
    chatInputEl.setAttribute('disabled', 'true');
    btnSendChatEl.setAttribute('disabled', 'true');
  } else {
    badgeStatusEl.classList.add('badge-offline');
    badgeStatusEl.textContent = dict.status_offline;
    btnToggleBotEl.textContent = dict.btn_connect;
    btnToggleBotEl.className = 'btn btn-success';
    chatInputEl.setAttribute('disabled', 'true');
    btnSendChatEl.setAttribute('disabled', 'true');
  }

  // Ping badge
  badgePingEl.textContent = `Ping: ${statusData.ping}ms`;

  // Update Vitals
  const health = statusData.health !== undefined ? statusData.health : 0;
  const food = statusData.food !== undefined ? statusData.food : 0;
  const healthPct = Math.min(100, Math.max(0, (health / 20) * 100));
  const foodPct = Math.min(100, Math.max(0, (food / 20) * 100));

  document.getElementById('vital-health-val').textContent = `${Math.round(health)} / 20`;
  document.getElementById('vital-health-bar').style.width = `${healthPct}%`;

  document.getElementById('vital-food-val').textContent = `${Math.round(food)} / 20`;
  document.getElementById('vital-food-bar').style.width = `${foodPct}%`;

  // Update XP / Level
  const xpLevel = statusData.xpLevel !== undefined ? statusData.xpLevel : 0;
  const xpProgress = statusData.xpProgress !== undefined ? statusData.xpProgress : 0;
  const xpPct = Math.min(100, Math.max(0, xpProgress * 100));

  const vitalXpValEl = document.getElementById('vital-xp-val');
  const vitalXpBarEl = document.getElementById('vital-xp-bar');
  if (vitalXpValEl) {
    vitalXpValEl.textContent = `Level ${xpLevel} (${Math.round(xpPct)}%)`;
  }
  if (vitalXpBarEl) {
    vitalXpBarEl.style.width = `${xpPct}%`;
  }

  // Info details
  infoHostEl.textContent = account.host;
  infoPortEl.textContent = account.port || 25565;
  infoAuthEl.textContent = account.auth === 'microsoft' ? 'Microsoft' : 'Offline / Cracked';

  // Toggle buttons values
  toggleAntiAfkEl.checked = account.antiAfk?.enabled !== false;
  toggleGeminiEl.checked = !!account.gemini?.enabled;
  toggleReconnectEl.checked = account.autoReconnect !== false;
  toggleRespawnEl.checked = account.autoRespawn !== false;
  toggleFeedEl.checked = account.autoFeed !== false;

  isUpdatingUI = false;
}

function appendLogToTerminal(logEntry) {
  const row = document.createElement('div');
  row.className = 'log-row';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = new Date(logEntry.timestamp).toLocaleTimeString();

  const msgSpan = document.createElement('span');
  msgSpan.className = `log-${logEntry.type}`;
  msgSpan.textContent = logEntry.message;

  row.appendChild(timeSpan);
  row.appendChild(msgSpan);

  // Check if user is scrolled to the bottom before appending
  // Using a threshold of 30px
  const isScrolledToBottom = (terminalLogsEl.scrollHeight - terminalLogsEl.clientHeight) <= (terminalLogsEl.scrollTop + 30);

  terminalLogsEl.appendChild(row);

  if (isScrolledToBottom) {
    terminalLogsEl.scrollTop = terminalLogsEl.scrollHeight;
  }
}

// Save Config with API Callback
function pushConfig(updatedConfig) {
  config = updatedConfig;
  socket.emit('save_config', updatedConfig, (res) => {
    if (res && !res.success) {
      showErrorAlert('Error saving config: ' + res.error);
    }
  });
}

// Event Listeners

// Close modals helper
document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    if (window.windowControl) {
      window.windowControl.setRadarOpen(false);
    }
    // Clear head active styles
    document.querySelectorAll('#head-look-up, #head-look-down, #head-look-left, #head-look-right').forEach(el => el.classList.remove('active'));
  });
});

// Close modals when clicking on the backdrop/overlay
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      if (window.windowControl && modal.id === 'modal-control') {
        window.windowControl.setRadarOpen(false);
      }
      // Clear head active styles
      document.querySelectorAll('#head-look-up, #head-look-down, #head-look-left, #head-look-right').forEach(el => el.classList.remove('active'));
    }
  });
});

// Open control & radar modal
if (btnOpenControl && modalControl) {
  btnOpenControl.addEventListener('click', () => {
    modalControl.classList.remove('hidden');
    if (window.windowControl) {
      window.windowControl.setRadarOpen(true);
    }
  });
}

// Open inventory modal
if (btnOpenInventory && modalInventory) {
  btnOpenInventory.addEventListener('click', () => {
    modalInventory.classList.remove('hidden');
  });
}

// Drop zone events binding
const inventoryDropZone = document.getElementById('inventory-drop-zone');
if (inventoryDropZone) {
  inventoryDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    inventoryDropZone.classList.add('drag-over');
  });

  inventoryDropZone.addEventListener('dragleave', () => {
    inventoryDropZone.classList.remove('drag-over');
  });

  inventoryDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    inventoryDropZone.classList.remove('drag-over');

    const fromSlotStr = e.dataTransfer.getData('text/plain');
    if (!fromSlotStr) return;
    const fromSlot = parseInt(fromSlotStr);

    if (selectedAccountId) {
      socket.emit('drop_item', { accountId: selectedAccountId, slot: fromSlot });
    }
  });
}

// Open batch connect modal
if (btnBatchConnect && modalBatchConnect) {
  btnBatchConnect.addEventListener('click', () => {
    if (document.querySelector('input[name="batch-connect-mode"][value="configured"]')) {
      document.querySelector('input[name="batch-connect-mode"][value="configured"]').checked = true;
    }
    if (batchCustomFields) {
      batchCustomFields.classList.add('hidden');
    }
    document.getElementById('batch-custom-host').value = '';
    document.getElementById('batch-custom-port').value = '25565';
    modalBatchConnect.classList.remove('hidden');
  });
}

// Modal tab logic
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    e.target.classList.add('active');
    document.getElementById(e.target.dataset.tab).classList.add('active');
  });
});

// Global settings
btnGlobalSettings.addEventListener('click', () => {
  document.getElementById('global-language').value = config.language || 'en';
  document.getElementById('global-gemini-key').value = config.geminiApiKey || '';
  document.getElementById('global-openai-key').value = config.openaiApiKey || '';
  document.getElementById('global-claude-key').value = config.claudeApiKey || '';
  document.getElementById('global-deepseek-key').value = config.deepseekApiKey || '';
  document.getElementById('global-ollama-url').value = config.ollamaUrl || 'http://localhost:11434';
  document.getElementById('global-web-port').value = config.webPort || 2855;
  document.getElementById('global-panel-username').value = config.panelUsername || 'admin';
  document.getElementById('global-panel-password').value = config.panelPassword || 'admin';
  modalSettings.classList.remove('hidden');
});

// Open Source Licenses modal trigger
if (btnShowLicenses && modalLicenses) {
  btnShowLicenses.addEventListener('click', () => {
    modalLicenses.classList.remove('hidden');
  });
}

formGlobalSettings.addEventListener('submit', (e) => {
  e.preventDefault();
  const oldLang = config.language || 'en';
  const newLang = document.getElementById('global-language').value || 'en';
  
  config.language = newLang;
  config.geminiApiKey = document.getElementById('global-gemini-key').value;
  config.openaiApiKey = document.getElementById('global-openai-key').value;
  config.claudeApiKey = document.getElementById('global-claude-key').value;
  config.deepseekApiKey = document.getElementById('global-deepseek-key').value;
  config.ollamaUrl = document.getElementById('global-ollama-url').value;
  config.webPort = parseInt(document.getElementById('global-web-port').value) || 2855;
  config.panelUsername = document.getElementById('global-panel-username').value || 'admin';
  config.panelPassword = document.getElementById('global-panel-password').value || 'admin';

  if (oldLang !== newLang) {
    socket.emit('save_config', config, (res) => {
      if (res && res.success) {
        window.location.reload();
      } else {
        showErrorAlert('Error saving config: ' + (res ? res.error : 'unknown'));
      }
    });
  } else {
    pushConfig(config);
  }
  
  modalSettings.classList.add('hidden');
});

// Quick toggles logic
toggleAntiAfkEl.addEventListener('change', () => {
  if (isUpdatingUI) return;
  const account = config.accounts.find(acc => acc.id === selectedAccountId);
  if (account) {
    if (!account.antiAfk) account.antiAfk = {};
    account.antiAfk.enabled = toggleAntiAfkEl.checked;
    pushConfig(config);
  }
});

toggleGeminiEl.addEventListener('change', () => {
  if (isUpdatingUI) return;
  const account = config.accounts.find(acc => acc.id === selectedAccountId);
  if (account) {
    if (!account.gemini) account.gemini = {};
    account.gemini.enabled = toggleGeminiEl.checked;
    pushConfig(config);
  }
});

toggleReconnectEl.addEventListener('change', () => {
  if (isUpdatingUI) return;
  const account = config.accounts.find(acc => acc.id === selectedAccountId);
  if (account) {
    account.autoReconnect = toggleReconnectEl.checked;
    pushConfig(config);
  }
});

toggleRespawnEl.addEventListener('change', () => {
  if (isUpdatingUI) return;
  const account = config.accounts.find(acc => acc.id === selectedAccountId);
  if (account) {
    account.autoRespawn = toggleRespawnEl.checked;
    pushConfig(config);
  }
});

toggleFeedEl.addEventListener('change', () => {
  if (isUpdatingUI) return;
  const account = config.accounts.find(acc => acc.id === selectedAccountId);
  if (account) {
    account.autoFeed = toggleFeedEl.checked;
    pushConfig(config);
  }
});

// Bot triggers
btnToggleBotEl.addEventListener('click', () => {
  const statusData = botStatuses[selectedAccountId] || { status: 'offline' };
  if (statusData.status === 'online' || statusData.status === 'connecting' || statusData.status === 'reconnecting') {
    socket.emit('stop_bot', selectedAccountId);
  } else {
    socket.emit('start_bot', selectedAccountId);
  }
});

// Chat input triggers
function sendChatMsg() {
  const text = chatInputEl.value.trim();
  if (text && selectedAccountId) {
    socket.emit('send_chat', { accountId: selectedAccountId, message: text });
    chatInputEl.value = '';
  }
}

btnSendChatEl.addEventListener('click', sendChatMsg);
chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendChatMsg();
  }
});

// Add Account Trigger
btnAddAccount.addEventListener('click', () => {
  const lang = config.language || 'en';
  const dict = translations[lang] || translations['en'];
  modalTitle.textContent = dict.add_account_title;
  
  document.getElementById('account-id').value = '';
  document.getElementById('acc-username').value = '';
  document.getElementById('acc-auth').value = 'offline';
  document.getElementById('acc-version').value = '';
  document.getElementById('acc-host').value = '';
  document.getElementById('acc-port').value = '25565';
  document.getElementById('acc-auto-commands').value = '';
  document.getElementById('acc-auto-commands-delay').value = '2000';
  document.getElementById('acc-enabled').checked = false;
  document.getElementById('acc-reconnect').checked = true;
  document.getElementById('acc-reconnect-delay').value = '10000';
  document.getElementById('acc-respawn').checked = true;
  document.getElementById('acc-feed').checked = true;
  document.getElementById('acc-afk-enabled').checked = true;
  document.getElementById('acc-afk-mode').value = 'random';
  document.getElementById('acc-afk-interval').value = '8000';
  document.getElementById('acc-gemini-enabled').checked = false;
  document.getElementById('acc-gemini-provider').value = 'gemini';
  document.getElementById('acc-gemini-model').value = '';
  document.getElementById('acc-gemini-key').value = '';
  document.getElementById('acc-gemini-url').value = '';
  document.getElementById('acc-gemini-triggers').value = '';
  document.getElementById('acc-gemini-respond-all').checked = false;
  document.getElementById('acc-gemini-instruction').value = '';
  
  // Show modal and focus first tab
  document.querySelectorAll('.tab-btn')[0].click();
  checkRyzionTabVisibility();
  modalAccount.classList.remove('hidden');
});

// Edit Account settings
btnEditBotEl.addEventListener('click', () => {
  const account = config.accounts.find(acc => acc.id === selectedAccountId);
  if (!account) return;

  const lang = config.language || 'en';
  const dict = translations[lang] || translations['en'];
  modalTitle.textContent = dict.edit_account_title;
  
  document.getElementById('account-id').value = account.id;
  document.getElementById('acc-username').value = account.username;
  document.getElementById('acc-auth').value = account.auth || 'offline';
  document.getElementById('acc-version').value = account.version || '';
  document.getElementById('acc-host').value = account.host;
  document.getElementById('acc-port').value = account.port || 25565;
  document.getElementById('acc-auto-commands').value = account.autoCommands ? account.autoCommands.join('\n') : '';
  document.getElementById('acc-auto-commands-delay').value = account.autoCommandsDelay || 2000;
  document.getElementById('acc-enabled').checked = !!account.enabled;
  document.getElementById('acc-reconnect').checked = account.autoReconnect !== false;
  document.getElementById('acc-reconnect-delay').value = account.reconnectDelay || 10000;
  document.getElementById('acc-respawn').checked = account.autoRespawn !== false;
  document.getElementById('acc-feed').checked = account.autoFeed !== false;
  
  document.getElementById('acc-afk-enabled').checked = account.antiAfk?.enabled !== false;
  document.getElementById('acc-afk-mode').value = account.antiAfk?.mode || 'random';
  document.getElementById('acc-afk-interval').value = account.antiAfk?.interval || 8000;
  
  document.getElementById('acc-gemini-enabled').checked = !!account.gemini?.enabled;
  document.getElementById('acc-gemini-provider').value = account.gemini?.provider || 'gemini';
  document.getElementById('acc-gemini-model').value = account.gemini?.model || '';
  document.getElementById('acc-gemini-key').value = account.gemini?.apiKey || '';
  document.getElementById('acc-gemini-url').value = account.gemini?.apiUrl || '';
  document.getElementById('acc-gemini-triggers').value = account.gemini?.triggerKeywords ? account.gemini.triggerKeywords.join(',') : '';
  document.getElementById('acc-gemini-respond-all').checked = !!account.gemini?.respondAll;
  document.getElementById('acc-gemini-instruction').value = account.gemini?.systemInstruction || '';

  document.querySelectorAll('.tab-btn')[0].click();
  checkRyzionTabVisibility();
  modalAccount.classList.remove('hidden');
});

// Form account submissions (Add or Edit)
formAccount.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const accountId = document.getElementById('account-id').value;
  const username = document.getElementById('acc-username').value;
  const auth = document.getElementById('acc-auth').value;
  const version = document.getElementById('acc-version').value.trim();
  const host = document.getElementById('acc-host').value.trim();
  const port = parseInt(document.getElementById('acc-port').value) || 25565;

  // Validation: limit 3 registered accounts per IP
  const hostLower = host.toLowerCase();
  let count = 0;
  config.accounts.forEach(acc => {
    if (acc.id !== accountId && acc.host && acc.host.trim().toLowerCase() === hostLower) {
      count++;
    }
  });

  if (!isGodModeActive && count >= 3) {
    const lang = config.language || 'en';
    const dict = translations[lang] || translations['en'];
    const msg = (dict.max_connections_exceeded || translations['en'].max_connections_exceeded || 'You cannot register more than 3 accounts for the same server IP ({ip}).').replace('{ip}', host);
    showErrorAlert(msg);
    return;
  }
  
  const rawCommands = document.getElementById('acc-auto-commands').value;
  const autoCommands = rawCommands.split('\n').map(c => c.trim()).filter(Boolean);
  const autoCommandsDelay = parseInt(document.getElementById('acc-auto-commands-delay').value) || 2000;
  
  const enabled = document.getElementById('acc-enabled').checked;
  const autoReconnect = document.getElementById('acc-reconnect').checked;
  const reconnectDelay = parseInt(document.getElementById('acc-reconnect-delay').value) || 10000;
  const autoRespawn = document.getElementById('acc-respawn').checked;
  const autoFeed = document.getElementById('acc-feed').checked;

  const antiAfk = {
    enabled: document.getElementById('acc-afk-enabled').checked,
    mode: document.getElementById('acc-afk-mode').value,
    interval: parseInt(document.getElementById('acc-afk-interval').value) || 8000
  };

  const rawTriggers = document.getElementById('acc-gemini-triggers').value;
  const triggerKeywords = rawTriggers.split(',').map(t => t.trim()).filter(Boolean);

  const gemini = {
    enabled: document.getElementById('acc-gemini-enabled').checked,
    provider: document.getElementById('acc-gemini-provider').value,
    model: document.getElementById('acc-gemini-model').value,
    apiKey: document.getElementById('acc-gemini-key').value,
    apiUrl: document.getElementById('acc-gemini-url').value,
    triggerKeywords: triggerKeywords,
    respondAll: document.getElementById('acc-gemini-respond-all').checked,
    systemInstruction: document.getElementById('acc-gemini-instruction').value
  };

  const accountData = {
    id: accountId || 'acc_' + Date.now(),
    username,
    auth,
    version,
    host,
    port,
    autoCommands,
    autoCommandsDelay,
    enabled,
    autoReconnect,
    reconnectDelay,
    autoRespawn,
    autoFeed,
    antiAfk,
    gemini
  };

  if (accountId) {
    // Edit Mode
    const index = config.accounts.findIndex(acc => acc.id === accountId);
    if (index !== -1) {
      config.accounts[index] = accountData;
    }
  } else {
    // Add Mode
    config.accounts.push(accountData);
  }

  pushConfig(config);
  renderAccounts();
  if (accountId === selectedAccountId) {
    updateBotDetails();
  } else if (!accountId) {
    selectAccount(accountData.id);
  }
  
  modalAccount.classList.add('hidden');
});

// Delete account
btnDeleteBotEl.addEventListener('click', () => {
  if (selectedAccountId) {
    modalDeleteConfirm.classList.remove('hidden');
  }
});

// Confirm delete
btnDeleteConfirm.addEventListener('click', () => {
  if (selectedAccountId) {
    // Stop bot first
    socket.emit('stop_bot', selectedAccountId);
    
    config.accounts = config.accounts.filter(acc => acc.id !== selectedAccountId);
    pushConfig(config);
    renderAccounts();
    
    selectedAccountId = null;
    botPanelEl.classList.add('hidden');
    selectBotPromptEl.classList.remove('hidden');
  }
  modalDeleteConfirm.classList.add('hidden');
});

// Cancel delete
btnDeleteCancel.addEventListener('click', () => {
  modalDeleteConfirm.classList.add('hidden');
});

// Provider changes placeholder helper
const accProviderEl = document.getElementById('acc-gemini-provider');
const accModelEl = document.getElementById('acc-gemini-model');
const accUrlEl = document.getElementById('acc-gemini-url');

accProviderEl.addEventListener('change', () => {
  const provider = accProviderEl.value;
  if (provider === 'gemini') {
    accModelEl.placeholder = 'gemini-2.5-flash';
    accUrlEl.placeholder = 'Custom API URL (Optional, uses @google/genai SDK)';
  } else if (provider === 'openai') {
    accModelEl.placeholder = 'gpt-4o-mini';
    accUrlEl.placeholder = 'https://api.openai.com/v1/chat/completions';
  } else if (provider === 'claude') {
    accModelEl.placeholder = 'claude-3-5-sonnet-20240620';
    accUrlEl.placeholder = 'https://api.anthropic.com/v1/messages';
  } else if (provider === 'deepseek') {
    accModelEl.placeholder = 'deepseek-chat';
    accUrlEl.placeholder = 'https://api.deepseek.com/chat/completions';
  } else if (provider === 'ollama') {
    accModelEl.placeholder = 'llama3';
    accUrlEl.placeholder = 'http://localhost:11434';
  }
});

// --- INVENTORY DRAWING & EMOJI MAPPING ---
function getItemEmoji(name) {
  const n = name.toLowerCase();
  if (n.includes('sword')) return '⚔️';
  if (n.includes('pickaxe')) return '⛏️';
  if (n.includes('axe')) return '🪓';
  if (n.includes('shovel')) return '🥄';
  if (n.includes('hoe')) return '🪚';
  if (n.includes('helmet') || n.includes('chestplate') || n.includes('leggings') || n.includes('boots') || n.includes('shield')) return '🛡️';
  if (n.includes('bow') || n.includes('arrow') || n.includes('crossbow')) return '🏹';
  if (n.includes('raw_') || n.includes('cooked_') || n.includes('food') || n.includes('bread') || n.includes('apple') || n.includes('potato') || n.includes('carrot') || n.includes('pie') || n.includes('melon') || n.includes('steak') || n.includes('mutton') || n.includes('beef') || n.includes('chicken') || n.includes('porkchop') || n.includes('cookie') || n.includes('fish') || n.includes('berries') || n.includes('berry')) return '🍖';
  if (n.includes('coal') || n.includes('charcoal')) return '🔥';
  if (n.includes('iron_') || n.includes('gold_') || n.includes('copper_')) return '🪙';
  if (n.includes('diamond') || n.includes('emerald') || n.includes('lapis') || n.includes('amethyst') || n.includes('quartz') || n.includes('netherite')) return '💎';
  if (n.includes('bucket')) return '🪣';
  if (n.includes('stone') || n.includes('cobble') || n.includes('granite') || n.includes('diorite') || n.includes('andesite') || n.includes('obsidian') || n.includes('dirt') || n.includes('grass') || n.includes('sand') || n.includes('gravel') || n.includes('clay')) return '🪨';
  if (n.includes('wood') || n.includes('plank') || n.includes('log')) return '🪵';
  if (n.includes('potion')) return '🧪';
  if (n.includes('egg')) return '🥚';
  if (n.includes('ender_pearl')) return '🔮';
  if (n.includes('totem')) return '🔱';
  if (n.includes('book') || n.includes('paper')) return '📖';
  if (n.includes('seed') || n.includes('wheat') || n.includes('sapling')) return '🌱';
  if (n.includes('wool') || n.includes('string') || n.includes('feather')) return '☁️';
  return '📦'; // Default package icon for other items
}

function renderInventory(items) {
  if (!inventoryMainGrid || !inventoryHotbarGrid) return;

  // 1. Populate/Update Main Inventory (Slots 9-35)
  for (let i = 9; i <= 35; i++) {
    updateOrCreateSlot(inventoryMainGrid, items, i);
  }

  // 2. Populate/Update Hotbar (Slots 36-44)
  for (let i = 36; i <= 44; i++) {
    updateOrCreateSlot(inventoryHotbarGrid, items, i);
  }
}

function updateOrCreateSlot(gridEl, items, slotIndex) {
  let slotEl = gridEl.querySelector(`[data-slot="${slotIndex}"]`);
  const item = items.find(it => it.slot === slotIndex);

  if (!slotEl) {
    slotEl = document.createElement('div');
    slotEl.className = 'inventory-slot';
    slotEl.dataset.slot = slotIndex;

    // Drag over target behavior
    slotEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      slotEl.classList.add('drag-over');
    });

    slotEl.addEventListener('dragleave', () => {
      slotEl.classList.remove('drag-over');
    });

    // Handle item drop on the slot
    slotEl.addEventListener('drop', (e) => {
      e.preventDefault();
      slotEl.classList.remove('drag-over');
      
      const fromSlotStr = e.dataTransfer.getData('text/plain');
      if (!fromSlotStr) return;
      const fromSlot = parseInt(fromSlotStr);
      const toSlot = slotIndex;

      if (fromSlot !== toSlot && selectedAccountId) {
        socket.emit('move_item', { accountId: selectedAccountId, fromSlot, toSlot });
      }
    });

    gridEl.appendChild(slotEl);
  }

  const prevItemName = slotEl.dataset.itemName || '';
  const prevCount = parseInt(slotEl.dataset.itemCount || '0');

  if (item) {
    const itemName = item.name;
    const itemCount = item.count;

    // Only update elements inside the slot if change occurred
    if (prevItemName !== itemName || prevCount !== itemCount) {
      slotEl.dataset.itemName = itemName;
      slotEl.dataset.itemCount = itemCount;
      slotEl.title = `${item.displayName} (x${itemCount})`;
      slotEl.setAttribute('draggable', 'true');

      // Drag start behavior (only bind once)
      if (!slotEl.dataset.dragBound) {
        slotEl.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', slotIndex);
          slotEl.classList.add('dragging');
        });

        slotEl.addEventListener('dragend', () => {
          slotEl.classList.remove('dragging');
        });
        slotEl.dataset.dragBound = 'true';
      }

      slotEl.innerHTML = '';

      // Try to load item texture image from served resource pack or CDNs
      const imgEl = document.createElement('img');
      imgEl.className = 'slot-icon';
      imgEl.src = `/items/${itemName}.png`;
      imgEl.alt = item.displayName;
      
      let fallbackStage = 0;
      imgEl.onerror = () => {
        const activeAccount = config?.accounts?.find(a => a.id === selectedAccountId);
        const mcVersion = activeAccount?.version || '1.20.4';
        
        if (fallbackStage === 0) {
          fallbackStage = 1;
          imgEl.src = `https://assets.mcasset.cloud/${mcVersion}/assets/minecraft/textures/item/${itemName}.png`;
        } else if (fallbackStage === 1) {
          fallbackStage = 2;
          imgEl.src = `https://assets.mcasset.cloud/${mcVersion}/assets/minecraft/textures/block/${itemName}.png`;
        } else if (fallbackStage === 2) {
          fallbackStage = 3;
          imgEl.src = `https://assets.mcasset.cloud/latest/assets/minecraft/textures/item/${itemName}.png`;
        } else if (fallbackStage === 3) {
          fallbackStage = 4;
          imgEl.src = `https://assets.mcasset.cloud/latest/assets/minecraft/textures/block/${itemName}.png`;
        } else if (fallbackStage === 4) {
          fallbackStage = 5;
          imgEl.src = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.4/assets/minecraft/textures/item/${itemName}.png`;
        } else if (fallbackStage === 5) {
          fallbackStage = 6;
          imgEl.src = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.4/assets/minecraft/textures/block/${itemName}.png`;
        } else {
          // If all image loading stages fail, hide the image and display the fallback emoji
          imgEl.style.display = 'none';
          if (!slotEl.querySelector('.slot-emoji')) {
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'slot-emoji';
            emojiSpan.textContent = getItemEmoji(itemName);
            slotEl.appendChild(emojiSpan);
          }
        }
      };
      
      slotEl.appendChild(imgEl);

      if (itemCount > 1) {
        const countEl = document.createElement('span');
        countEl.className = 'slot-count';
        countEl.textContent = itemCount;
        slotEl.appendChild(countEl);
      }
    }
  } else {
    // Slot is now empty
    if (prevItemName !== '') {
      slotEl.dataset.itemName = '';
      slotEl.dataset.itemCount = '0';
      slotEl.title = 'Empty Slot';
      slotEl.removeAttribute('draggable');
      slotEl.innerHTML = '';
    }
  }
}

// --- HEAD LOOK ROTATION ---
function highlightHeadIndicator(code, active) {
  let elementId = '';
  if (code === 'ArrowLeft') elementId = 'head-look-left';
  else if (code === 'ArrowRight') elementId = 'head-look-right';
  else if (code === 'ArrowUp') elementId = 'head-look-up';
  else if (code === 'ArrowDown') elementId = 'head-look-down';

  if (elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      if (active) el.classList.add('active');
      else el.classList.remove('active');
    }
  }
}

function handleKeyboardLook(code) {
  if (!selectedAccountId) return;
  const step = 0.15; // rotation speed step in radians
  let newYaw = currentBotYaw;
  let newPitch = currentBotPitch;

  if (code === 'ArrowLeft') {
    newYaw += step; // turn left
  } else if (code === 'ArrowRight') {
    newYaw -= step; // turn right
  } else if (code === 'ArrowUp') {
    newPitch = Math.max(-Math.PI / 2, newPitch - step); // look up
  } else if (code === 'ArrowDown') {
    newPitch = Math.min(Math.PI / 2, newPitch + step); // look down
  }

  // Update local variables immediately for smooth continuous movement
  currentBotYaw = newYaw;
  currentBotPitch = newPitch;

  // Send to server
  socket.emit('look_state', { accountId: selectedAccountId, yaw: newYaw, pitch: newPitch });
}

// --- MINIMAP RADAR DRAWING ---
function drawMinimap(data) {
  if (!ctx || !minimapCanvas) return;

  const cx = minimapCanvas.width / 2;
  const cy = minimapCanvas.height / 2;
  const gridSize = 25;
  const blockSize = minimapCanvas.width / gridSize; // Size of each block cell

  // Save context for circular clipping
  ctx.save();
  
  // Create circular clipping mask
  ctx.beginPath();
  ctx.arc(cx, cy, cx - 2, 0, 2 * Math.PI);
  ctx.clip();

  // Clear canvas
  ctx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

  // 1. Draw block-level terrain blocks
  if (data.blocks && data.blocks.length === gridSize * gridSize) {
    for (let gz = 0; gz < gridSize; gz++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const blockId = data.blocks[gz * gridSize + gx];
        if (blockId === 0) continue; // air / transparent
        
        let color = 'rgba(0,0,0,0)';
        if (blockId === 1) {
          color = '#1b5e20'; // Grass / Plant (Green)
        } else if (blockId === 2) {
          color = '#5d4037'; // Dirt / Wood (Brown)
        } else if (blockId === 3) {
          color = '#424242'; // Stone / Ore (Grey)
        } else if (blockId === 4) {
          color = '#0d47a1'; // Water (Blue)
        } else if (blockId === 5) {
          color = '#ff3d00'; // Lava (Red/Orange)
        } else if (blockId === 6) {
          color = '#f57f17'; // Sand / Gravel (Beige/Yellow)
        } else {
          color = '#37474f'; // Other blocks
        }

        ctx.fillStyle = color;
        ctx.fillRect(gx * blockSize, gz * blockSize, blockSize, blockSize);
      }
    }
  }

  // 2. Draw loaded chunks boundary grids on top of blocks
  ctx.strokeStyle = 'rgba(102, 252, 241, 0.15)';
  ctx.lineWidth = 1;
  const chunkZoom = 16 * blockSize;

  data.chunks.forEach(c => {
    // Relative position of chunk center relative to bot (in blocks)
    const rx = ((c.x * 16) + 8 - data.x) * blockSize;
    const rz = ((c.z * 16) + 8 - data.z) * blockSize;

    ctx.strokeRect(cx + rx - (chunkZoom / 2), cy + rz - (chunkZoom / 2), chunkZoom, chunkZoom);
  });

  // 3. Draw radar distance helper circles
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  [5, 10, 15].forEach(r => {
    ctx.beginPath();
    ctx.arc(cx, cy, r * blockSize, 0, 2 * Math.PI);
    ctx.stroke();
  });

  // 4. Draw surrounding entities (players, mobs)
  data.entities.forEach(e => {
    const rx = (e.x - data.x) * blockSize;
    const rz = (e.z - data.z) * blockSize;

    // Skip if off canvas bounds
    if (Math.abs(rx) > cx || Math.abs(rz) > cy) return;

    ctx.beginPath();
    ctx.arc(cx + rx, cy + rz, 4.5, 0, 2 * Math.PI);

    if (e.type === 'player') {
      ctx.fillStyle = '#38bdf8'; // Blue for players
    } else if (e.type === 'friendly') {
      ctx.fillStyle = '#86efac'; // Green for passive mobs
    } else if (e.type === 'hostile') {
      ctx.fillStyle = '#f87171'; // Red for hostile mobs
    } else {
      ctx.fillStyle = '#9ca3af'; // Grey for unknown
    }
    ctx.fill();

    // Player name labels
    if (e.type === 'player') {
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '9px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(e.username, cx + rx, cy + rz - 7);
    }
  });

  // 5. Draw Self (the bot) in the center
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
  ctx.fillStyle = '#66fcf1'; // Neon teal accent
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Draw yaw direction indicator line
  const angle = data.yaw;
  const pointerLen = 14;
  const px = cx - Math.sin(angle) * pointerLen;
  const py = cy + Math.cos(angle) * pointerLen;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(px, py);
  ctx.strokeStyle = '#66fcf1';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Restore context (removes clip mask)
  ctx.restore();
}

// --- MOVEMENT CONTROL EVENTS ---
const activeKeys = {};
let isSneakToggled = false;
let isSprintToggled = false;

// 1. Pointer (click & touch) movement pad events
document.querySelectorAll('.btn-ctrl').forEach(btn => {
  const action = btn.dataset.action;
  if (!action) return;

  if (action === 'sneak') {
    // UI Sneak button acts as a toggle
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!selectedAccountId) return;
      isSneakToggled = !isSneakToggled;
      highlightButton('sneak', isSneakToggled);
      socket.emit('control_state', { accountId: selectedAccountId, key: 'sneak', state: isSneakToggled });
    });
    return;
  }

  if (action === 'sprint') {
    // UI Sprint button acts as a toggle
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!selectedAccountId) return;
      isSprintToggled = !isSprintToggled;
      highlightButton('sprint', isSprintToggled);
      socket.emit('control_state', { accountId: selectedAccountId, key: 'sprint', state: isSprintToggled });
    });
    return;
  }

  btn.addEventListener('mousedown', () => startControl(action));
  btn.addEventListener('mouseup', () => stopControl(action));
  btn.addEventListener('mouseleave', () => stopControl(action));

  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startControl(action);
  });
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopControl(action);
  });
});

// 2. Keyboard W, A, S, D, Arrow, Space, Shift listeners
const keyMap = {
  'KeyW': 'forward',
  'KeyA': 'left',
  'KeyS': 'back',
  'KeyD': 'right',
  'Space': 'jump',
  'ShiftLeft': 'sneak',
  'ShiftRight': 'sneak',
  'ControlLeft': 'sprint',
  'ControlRight': 'sprint',
  'ArrowUp': 'forward',
  'ArrowLeft': 'left',
  'ArrowDown': 'back',
  'ArrowRight': 'right'
};

document.addEventListener('keydown', (e) => {
  // Trigger God Mode Authentication Modal via Ctrl x 10 + Home
  const isSettingsOpen = modalSettings && !modalSettings.classList.contains('hidden');
  if (isSettingsOpen) {
    if (e.key === 'Control') {
      if (!e.repeat) {
        ctrlPressCount++;
      }
    } else if (e.key === 'Home') {
      if (ctrlPressCount >= 10) {
        e.preventDefault();
        ctrlPressCount = 0;
        if (modalGodModeAuth) {
          document.getElementById('godmode-password').value = '';
          modalGodModeAuth.classList.remove('hidden');
        }
        return;
      }
      ctrlPressCount = 0;
    } else {
      ctrlPressCount = 0;
    }
  }

  const tag = e.target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  // If radar modal is open, redirect arrow keys to head rotation controls
  const isRadarOpen = modalControl && !modalControl.classList.contains('hidden');
  if (isRadarOpen && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
    highlightHeadIndicator(e.code, true);
    handleKeyboardLook(e.code);
    return;
  }

  const action = keyMap[e.code];
  if (action && selectedAccountId) {
    if (action === 'sneak') {
      // Keyboard shift acts as hold
      if (!activeKeys['sneak']) {
        activeKeys['sneak'] = true;
        highlightButton('sneak', true);
        socket.emit('control_state', { accountId: selectedAccountId, key: 'sneak', state: true });
      }
    } else if (action === 'sprint') {
      // Keyboard ctrl acts as hold
      if (!activeKeys['sprint']) {
        activeKeys['sprint'] = true;
        highlightButton('sprint', true);
        socket.emit('control_state', { accountId: selectedAccountId, key: 'sprint', state: true });
      }
    } else {
      if (!activeKeys[action]) {
        activeKeys[action] = true;
        highlightButton(action, true);
        socket.emit('control_state', { accountId: selectedAccountId, key: action, state: true });
      }
    }
  }
});

document.addEventListener('keyup', (e) => {
  // If radar modal is open, ignore arrow key releases
  const isRadarOpen = modalControl && !modalControl.classList.contains('hidden');
  if (isRadarOpen && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
    highlightHeadIndicator(e.code, false);
    return;
  }

  const action = keyMap[e.code];
  if (action && selectedAccountId) {
    if (action === 'sneak') {
      activeKeys['sneak'] = false;
      // Release sneak only if UI toggle is NOT active
      if (!isSneakToggled) {
        highlightButton('sneak', false);
        socket.emit('control_state', { accountId: selectedAccountId, key: 'sneak', state: false });
      }
    } else if (action === 'sprint') {
      activeKeys['sprint'] = false;
      // Release sprint only if UI toggle is NOT active
      if (!isSprintToggled) {
        highlightButton('sprint', false);
        socket.emit('control_state', { accountId: selectedAccountId, key: 'sprint', state: false });
      }
    } else {
      activeKeys[action] = false;
      highlightButton(action, false);
      socket.emit('control_state', { accountId: selectedAccountId, key: action, state: false });
    }
  }
});

function startControl(action) {
  if (selectedAccountId && !activeKeys[action]) {
    activeKeys[action] = true;
    highlightButton(action, true);
    socket.emit('control_state', { accountId: selectedAccountId, key: action, state: true });
  }
}

function stopControl(action) {
  if (selectedAccountId && activeKeys[action]) {
    activeKeys[action] = false;
    highlightButton(action, false);
    socket.emit('control_state', { accountId: selectedAccountId, key: action, state: false });
  }
}

function highlightButton(action, state) {
  const btn = document.querySelector(`.btn-ctrl[data-action="${action}"]`);
  if (btn) {
    if (state) btn.classList.add('active');
    else btn.classList.remove('active');
  }
}

// --- BATCH CONNECTION EVENT HANDLERS ---

// Start Batch Connect Confirm
if (btnConfirmBatchConnect) {
  btnConfirmBatchConnect.addEventListener('click', () => {
    let overrideHost = undefined;
    let overridePort = undefined;

    if (isGodModeActive) {
      const mode = document.querySelector('input[name="batch-connect-mode"]:checked')?.value || 'configured';
      if (mode === 'custom') {
        const host = document.getElementById('batch-custom-host').value.trim();
        const portVal = document.getElementById('batch-custom-port').value.trim();
        if (!host) {
          const lang = config.language || 'en';
          showErrorAlert(lang === 'tr' ? 'Lütfen geçerli bir sunucu adresi girin!' : 'Please enter a valid server IP!');
          return;
        }
        overrideHost = host;
        if (portVal) {
          overridePort = parseInt(portVal) || 25565;
        } else {
          overridePort = 25565;
        }
      }
    }

    socket.emit('batch_connect', { overrideHost, overridePort });
    if (modalBatchConnect) modalBatchConnect.classList.add('hidden');
  });
}

// Stop Batch Connect / Disconnect All Bots
if (btnBatchDisconnect) {
  btnBatchDisconnect.addEventListener('click', () => {
    socket.emit('batch_disconnect');
  });
}

// Stop Batch Connect Queue (without disconnecting connected bots)
if (btnStopBatch) {
  btnStopBatch.addEventListener('click', () => {
    socket.emit('stop_batch_connect');
  });
}

// --- RYZIONMC EXTRA SETTINGS ACTIONS ---

function checkRyzionTabVisibility() {
  const hostVal = document.getElementById('acc-host').value.trim().toLowerCase();
  const tabBtn = document.getElementById('tab-btn-ryzion');
  if (!tabBtn) return;
  if (hostVal === 'play.ryzionmc.com') {
    tabBtn.classList.remove('hidden');
  } else {
    tabBtn.classList.add('hidden');
    if (tabBtn.classList.contains('active')) {
      document.querySelectorAll('.tab-btn')[0].click();
    }
  }
}

// Bind input and change events to acc-host
const accHostInput = document.getElementById('acc-host');
if (accHostInput) {
  accHostInput.addEventListener('input', checkRyzionTabVisibility);
  accHostInput.addEventListener('change', checkRyzionTabVisibility);
}
function showCommandFeedback(button) {
  // Prevent duplicate overlays
  if (button.classList.contains('cooldown')) return;
  button.classList.add('cooldown');

  const lang = config.language || 'en';
  const dict = translations[lang] || translations['en'];
  const text = dict.cmd_sent || (lang === 'tr' ? 'Komut gönderildi.' : 'Command sent.');

  const overlay = document.createElement('div');
  overlay.className = 'cmd-feedback-overlay';
  overlay.innerHTML = `
    <span>✅</span> <span>${text}</span>
    <div class="cooldown-bar"></div>
  `;
  
  // Save original styling and apply position relative to button if not set
  const origPosition = button.style.position;
  if (!button.style.position || button.style.position === 'static') {
    button.style.position = 'relative';
  }
  
  button.appendChild(overlay);

  // Remove overlay after 5s with slide/fade out animation
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.remove();
      button.style.position = origPosition;
      button.classList.remove('cooldown');
    }, 250); // wait for fade-out transition
  }, 4750); // 5 seconds minus fade-out transition duration
}

// Bind event listener to all RyzionMC command buttons
document.querySelectorAll('.btn-ryzion-cmd').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const button = e.currentTarget;
    if (button.classList.contains('cooldown')) return; // ignore clicks during cooldown
    const cmd = button.getAttribute('data-cmd');
    const lang = config.language || 'en';

    if (cmd) {
      if (!selectedAccountId) {
        showErrorAlert(lang === 'tr' ? 'Lütfen önce kenar çubuğundan bir hesap seçin!' : 'Please select an account first!');
        return;
      }
      const statusData = botStatuses[selectedAccountId] || { status: 'offline' };
      if (statusData.status !== 'online') {
        showErrorAlert(lang === 'tr' ? 'Bu komutu göndermek için botun çevrimiçi (online) olması gerekir!' : 'The bot must be online to send this command!');
        return;
      }
      socket.emit('send_chat', { accountId: selectedAccountId, message: cmd });
      
      // Visual click feedback with success overlay and 5s cooldown
      showCommandFeedback(button);
    }
  });
});

// --- GOD MODE UTILITIES ---
function updateGodModeUI() {
  if (isGodModeActive) {
    if (godModeActiveText) godModeActiveText.classList.remove('hidden');
    if (godModeBatchOptions) godModeBatchOptions.classList.remove('hidden');
  } else {
    if (godModeActiveText) godModeActiveText.classList.add('hidden');
    if (godModeBatchOptions) godModeBatchOptions.classList.add('hidden');
  }
}

socket.on('godmode_activated', (active) => {
  isGodModeActive = active;
  updateGodModeUI();
});

if (formGodModeAuth) {
  formGodModeAuth.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('godmode-password').value;
    
    socket.emit('activate_godmode', password, (res) => {
      const lang = config.language || 'en';
      const dict = translations[lang] || translations['en'];
      
      if (res && res.success) {
        isGodModeActive = true;
        updateGodModeUI();
        if (modalGodModeAuth) modalGodModeAuth.classList.add('hidden');
        showErrorAlert(dict.godmode_success || 'God Mode Activated!');
      } else {
        showErrorAlert(dict.godmode_error || 'Invalid Password!');
      }
    });
  });
}

document.querySelectorAll('input[name="batch-connect-mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (batchCustomFields) {
      if (e.target.value === 'custom') {
        batchCustomFields.classList.remove('hidden');
      } else {
        batchCustomFields.classList.add('hidden');
      }
    }
  });
});

// Password Visibility Toggles
function setupPasswordToggle(checkboxId, inputId) {
  const checkbox = document.getElementById(checkboxId);
  const input = document.getElementById(inputId);
  if (checkbox && input) {
    checkbox.addEventListener('change', function() {
      input.type = this.checked ? 'text' : 'password';
    });
  }
}

setupPasswordToggle('toggle-global-panel-password', 'global-panel-password');
setupPasswordToggle('toggle-godmode-password', 'godmode-password');

// --- Custom Window Control Bar Logic ---
if (window.windowControl) {
  document.body.classList.add('is-electron');
  
  const minBtn = document.getElementById('title-bar-btn-min');
  const maxBtn = document.getElementById('title-bar-btn-max');
  const closeBtn = document.getElementById('title-bar-btn-close');
  
  if (minBtn) {
    minBtn.addEventListener('click', () => {
      window.windowControl.minimize();
    });
  }
  
  if (maxBtn) {
    maxBtn.addEventListener('click', () => {
      window.windowControl.maximize();
    });
  }
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.windowControl.close();
    });
  }
}

// Prevent Ctrl+W window closure when control/radar modal is open
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
    const isRadarOpen = modalControl && !modalControl.classList.contains('hidden');
    if (isRadarOpen) {
      e.preventDefault();
      console.log('[Electron] Prevented default Ctrl+W closure since Radar is active.');
    }
  }
}, { capture: true });



