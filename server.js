const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const BotManager = require('./bot-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const CONFIG_PATH = process.versions.electron 
  ? path.join(require('electron').app.getPath('userData'), 'config.json')
  : path.join(__dirname, 'config.json');

// Generate session token on startup
let currentSessionToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
let isGodModeActive = false;

function isLocalRequest(req) {
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

function getCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      let val = parts.join('=');
      try {
        val = decodeURIComponent(val);
      } catch (e) {}
      list[key] = val;
    });
  }
  return list;
}

function checkAuth(req, res, next) {
  if (isLocalRequest(req)) {
    return next();
  }

  // If remote access is not allowed, reject non-local requests immediately!
  if (!globalConfig.allowRemoteAccess) {
    console.log(`[checkAuth] Blocked remote request from ${req.ip || req.connection?.remoteAddress} because allowRemoteAccess is false.`);
    return res.status(403).send('Forbidden: Remote access is disabled.');
  }
  // Allow unauthenticated requests to login-related routes
  const allowedPaths = [
    '/login',
    '/api/login',
    '/api/language',
    '/translations.js',
    '/logo.jpg'
  ];
  if (allowedPaths.includes(req.path)) {
    return next();
  }

  // Check cookie
  const cookies = getCookies(req);
  console.log(`[checkAuth] Path: ${req.path}, Cookie Token: ${cookies.panel_token}, Server Token: ${currentSessionToken}`);
  if (cookies.panel_token === currentSessionToken) {
    return next();
  }

  console.log(`[checkAuth] Auth failed for ${req.path}. Redirecting to /login`);
  // Redirect to login page
  res.redirect('/login');
}

// Enable JSON parsing
app.use(express.json());

// Apply Authentication Middleware
app.use(checkAuth);

// Failed attempts cache in memory: IP -> { count, cooldownUntil }
const failedAttempts = {};

// Login endpoints
app.post('/api/login', (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
  
  if (!failedAttempts[ip]) {
    failedAttempts[ip] = { count: 0, cooldownUntil: 0 };
  }
  
  const attempt = failedAttempts[ip];
  
  // Check if currently locked out
  if (attempt.cooldownUntil > Date.now()) {
    const remaining = attempt.cooldownUntil - Date.now();
    return res.status(429).json({ 
      success: false, 
      error: 'Too many attempts', 
      cooldownRemaining: remaining 
    });
  }
  
  const { username, password } = req.body;
  console.log(`[/api/login] Login attempt from IP: ${ip}. Username: ${username}, Expected: ${globalConfig.panelUsername}`);
  
  if (username === globalConfig.panelUsername && password === globalConfig.panelPassword) {
    // Reset attempts on successful login
    failedAttempts[ip] = { count: 0, cooldownUntil: 0 };
    
    res.setHeader('Set-Cookie', `panel_token=${currentSessionToken}; Path=/; Max-Age=${30 * 24 * 60 * 60}; HttpOnly; SameSite=Strict`);
    console.log(`[/api/login] Login success. Cookie set with token: ${currentSessionToken}`);
    return res.json({ success: true });
  } else {
    attempt.count += 1;
    let cooldownDuration = 0;
    
    // Determine cooldown based on failure count
    if (attempt.count >= 30) {
      cooldownDuration = 24 * 60 * 60 * 1000; // 1 day
    } else if (attempt.count >= 15) {
      cooldownDuration = 6 * 60 * 60 * 1000; // 6 hours
    } else if (attempt.count >= 10) {
      cooldownDuration = 2 * 60 * 60 * 1000; // 2 hours
    } else if (attempt.count >= 5) {
      cooldownDuration = 30 * 60 * 1000; // 30 minutes
    }
    
    if (cooldownDuration > 0) {
      attempt.cooldownUntil = Date.now() + cooldownDuration;
      console.log(`[/api/login] IP ${ip} blocked until ${new Date(attempt.cooldownUntil).toISOString()} (count: ${attempt.count})`);
      return res.status(429).json({
        success: false,
        error: 'Too many attempts',
        cooldownRemaining: cooldownDuration
      });
    }
    
    console.log(`[/api/login] Login failed for username: ${username} (failed count: ${attempt.count})`);
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  }
});

app.get('/api/language', (req, res) => {
  res.json({ language: globalConfig.language || 'en' });
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve Minecraft item textures from resource pack
app.use('/items', express.static(path.join(__dirname, 'items_resource', 'assets', 'minecraft', 'textures', 'item')));
app.use('/items', express.static(path.join(__dirname, 'items_resource', 'assets', 'minecraft', 'textures', 'block')));

// Serve static UI files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Load configuration helper
function loadConfig() {
  try {
    if (process.versions.electron) {
      const defaultLocalPath = path.join(__dirname, 'config.json');
      if (!fs.existsSync(CONFIG_PATH) && fs.existsSync(defaultLocalPath)) {
        try {
          fs.copyFileSync(defaultLocalPath, CONFIG_PATH);
          console.log('Copied default config.json to userData directory');
        } catch (copyErr) {
          console.error('Failed to copy default config.json:', copyErr);
        }
      }
    }

    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      let updated = false;
      if (parsed.panelUsername === undefined) {
        parsed.panelUsername = 'admin';
        updated = true;
      }
      if (parsed.panelPassword === undefined) {
        parsed.panelPassword = 'admin';
        updated = true;
      }
      if (parsed.allowRemoteAccess === undefined) {
        parsed.allowRemoteAccess = false;
        updated = true;
      }
      if (updated) {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(parsed, null, 2), 'utf-8');
      }
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load config.json:', err);
  }
  const defaultConfig = { webPort: 2855, geminiApiKey: '', accounts: [], panelUsername: 'admin', panelPassword: 'admin', allowRemoteAccess: false };
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to create default config.json:', err);
  }
  return defaultConfig;
}

// Save configuration helper
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save config.json:', err);
    return false;
  }
}

// Load initial config
let globalConfig = loadConfig();

// Initialize Bot Manager
const botManager = new BotManager(io, globalConfig);

// Socket.io middleware to verify connections
io.use((socket, next) => {
  const ip = socket.handshake.address || socket.conn.remoteAddress;
  const isLocalIp = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
  if (isLocalIp) {
    return next();
  }

  // If remote access is not allowed, reject non-local socket connections!
  if (!globalConfig.allowRemoteAccess) {
    console.log(`[Socket.io] Blocked remote connection from ${ip} because allowRemoteAccess is false.`);
    return next(new Error('Remote access is disabled'));
  }
  
  const rc = socket.handshake.headers.cookie;
  const list = {};
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      let val = parts.join('=');
      try {
        val = decodeURIComponent(val);
      } catch (e) {}
      list[key] = val;
    });
  }
  
  if (list.panel_token === currentSessionToken) {
    return next();
  }
  
  return next(new Error('Authentication required'));
});

// Helper to get local network IP address (filters out VirtualBox, VMware, WSL and other virtual adapters)
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  
  for (const name of Object.keys(interfaces)) {
    const isVirtualName = /virtual|vmware|vbox|vmnet|wsl|pseudo|host-only|vethernet/i.test(name);
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // VirtualBox OUI: 0a:00:27, 08:00:27 | VMware OUI: 00:50:56, 00:0c:29, 00:1c:14 | Hyper-V: 00:15:5d
        const isVirtualMac = /^0a:00:27|^08:00:27|^00:50:56|^00:0c:29|^00:1c:14|^00:15:5d/i.test(iface.mac);
        candidates.push({
          name: name,
          address: iface.address,
          isVirtual: isVirtualName || isVirtualMac
        });
      }
    }
  }

  if (candidates.length === 0) return '127.0.0.1';
  if (candidates.length === 1) return candidates[0].address;

  // 1. Look for Wi-Fi / WLAN interfaces
  const wifi = candidates.find(c => !c.isVirtual && /wi-fi|wifi|wlan|wireless/i.test(c.name));
  if (wifi) return wifi.address;

  // 2. Look for physical Ethernet interfaces
  const eth = candidates.find(c => !c.isVirtual && /ethernet|local area|lan/i.test(c.name));
  if (eth) return eth.address;

  // 3. Fallback to any non-virtual candidate
  const physical = candidates.find(c => !c.isVirtual);
  if (physical) return physical.address;

  // 4. Ultimate fallback to the first candidate found
  return candidates[0].address;
}

// Socket.io event handling
io.on('connection', (socket) => {
  console.log(`Web Client connected: ${socket.id}`);

  // Send current configuration and bot statuses
  socket.emit('init_data', {
    config: globalConfig,
    botStatuses: botManager.getBotsStatus(),
    isGodModeActive: isGodModeActive,
    localIp: getLocalIpAddress()
  });

  // Save config changes from UI
  socket.on('save_config', (newConfig, callback) => {
    // If username or password changed, invalidate sessions
    if (newConfig.panelUsername !== globalConfig.panelUsername || newConfig.panelPassword !== globalConfig.panelPassword) {
      currentSessionToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    // Backend validation: Count registered accounts per host/IP (only validate if accounts array changed)
    const accountsChanged = JSON.stringify(newConfig.accounts) !== JSON.stringify(globalConfig.accounts);
    const hostCounts = {};
    let isLimitExceeded = false;
    let exceededHost = '';
    if (accountsChanged && !isGodModeActive && newConfig.accounts && Array.isArray(newConfig.accounts)) {
      for (const acc of newConfig.accounts) {
        if (acc.host) {
          const host = acc.host.trim().toLowerCase();
          hostCounts[host] = (hostCounts[host] || 0) + 1;
          if (hostCounts[host] > 3) {
            isLimitExceeded = true;
            exceededHost = acc.host;
            break;
          }
        }
      }
    }

    if (isLimitExceeded) {
      if (callback) {
        callback({ success: false, error: `Limit exceeded: Maximum of 3 accounts allowed for IP ${exceededHost}` });
      }
      return;
    }

    globalConfig = newConfig;
    const success = saveConfig(newConfig);
    if (success) {
      botManager.updateGlobalConfig(newConfig);
      // Sync other clients
      socket.broadcast.emit('config_updated', newConfig);
      if (callback) callback({ success: true });
    } else {
      if (callback) callback({ success: false, error: 'Could not save config file.' });
    }
  });

  // Start bot trigger
  socket.on('start_bot', (accountId) => {
    const account = globalConfig.accounts.find(acc => acc.id === accountId);
    if (account) {
      const activeBot = botManager.bots[accountId];
      if (activeBot && (activeBot.status === 'online' || activeBot.status === 'connecting' || activeBot.status === 'reconnecting')) {
        return;
      }
      botManager.startBot(accountId, account);
    }
  });

  // Stop bot trigger
  socket.on('stop_bot', (accountId) => {
    botManager.stopBot(accountId);
  });

  // Send direct message/command in-game
  socket.on('send_chat', ({ accountId, message }) => {
    const botData = botManager.bots[accountId];
    if (botData && botData.status === 'online') {
      if (message.trim().toLowerCase() === '/respawn') {
        try {
          botData.bot.respawn();
          botManager.log(accountId, `Triggered manual respawn via console command.`, 'success');
        } catch (err) {
          botManager.log(accountId, `Manual respawn failed: ${err.message}`, 'error');
        }
      } else {
        try {
          botData.bot.chat(message);
          botManager.log(accountId, `Sent chat: ${message}`, 'info');
        } catch (err) {
          botManager.log(accountId, `Failed to send chat message: ${err.message}`, 'error');
        }
      }
    }
  });

  // Handle manual movement controls (forward, back, left, right, jump, sneak)
  socket.on('control_state', ({ accountId, key, state }) => {
    botManager.setBotControlState(accountId, key, state);
  });

  // Handle moving items in inventory
  socket.on('move_item', async ({ accountId, fromSlot, toSlot }) => {
    const botData = botManager.bots[accountId];
    if (botData && botData.status === 'online') {
      try {
        const bot = botData.bot;
        // Click source slot to pick up item
        await bot.clickWindow(fromSlot, 0, 0);
        // Click destination slot to drop/swap item
        await bot.clickWindow(toSlot, 0, 0);
        botManager.log(accountId, `Moved item from slot ${fromSlot} to ${toSlot}.`, 'success');
      } catch (err) {
        botManager.log(accountId, `Failed to move item: ${err.message}`, 'error');
      }
    }
  });

  // Handle dropping items from inventory
  socket.on('drop_item', async ({ accountId, slot }) => {
    const botData = botManager.bots[accountId];
    if (botData && botData.status === 'online') {
      try {
        const bot = botData.bot;
        const item = bot.inventory.slots[slot];
        if (item) {
          await bot.tossStack(item);
          botManager.log(accountId, `Dropped item ${item.displayName} from slot ${slot}.`, 'success');
        }
      } catch (err) {
        botManager.log(accountId, `Failed to drop item: ${err.message}`, 'error');
      }
    }
  });

  // Handle looking around/rotating head
  socket.on('look_state', ({ accountId, yaw, pitch }) => {
    const botData = botManager.bots[accountId];
    if (botData && botData.status === 'online') {
      try {
        botData.bot.look(yaw, pitch, true);
      } catch (err) {
        // Silent catch for intermittent look errors
      }
    }
  });

  // Batch connect all accounts
  socket.on('batch_connect', ({ overrideHost, overridePort }) => {
    botManager.startBatchConnect(overrideHost, overridePort);
  });

  // Batch disconnect / stop connect queue
  socket.on('batch_disconnect', () => {
    botManager.disconnectAllBots();
  });

  // Stop batch connection queue
  socket.on('stop_batch_connect', () => {
    botManager.stopBatchConnect();
  });

  // Activate God Mode trigger
  socket.on('activate_godmode', (password, callback) => {
    if (password === 'ryziongodmode#245418') {
      isGodModeActive = true;
      io.emit('godmode_activated', true);
      if (callback) callback({ success: true });
    } else {
      if (callback) callback({ success: false, error: 'Invalid password' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Web Client disconnected: ${socket.id}`);
  });
});

// Auto-start accounts that have enabled = true
setTimeout(() => {
  if (globalConfig.accounts && globalConfig.accounts.length > 0) {
    globalConfig.accounts.forEach(account => {
      if (account.enabled) {
        botManager.startBot(account.id, account);
      }
    });
  }
}, 3000);

const PORT = globalConfig.webPort || 2855;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`-----------------------------------------------`);
  console.log(`Minecraft AFK Client running!`);
  console.log(`Open Web Dashboard at: http://localhost:${PORT}`);
  console.log(`Allow Remote Access: ${globalConfig.allowRemoteAccess ? 'Yes' : 'No'} (Access Control handled by Middleware)`);
  console.log(`-----------------------------------------------`);
});
