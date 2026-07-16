const mineflayer = require('mineflayer');
const { GoogleGenAI } = require('@google/genai');
const net = require('net');
const { Vec3 } = require('vec3');
const path = require('path');
const fs = require('fs');

class BotManager {
  constructor(io, globalConfig) {
    this.io = io;
    this.globalConfig = globalConfig;
    this.bots = {}; // accountId -> { bot, config, status, reconnectTimeout, antiAfkInterval }
    this.startTelemetryBroadcast();
    
    // Batch connect queue variables
    this.batchQueue = [];
    this.batchTimeout = null;
    this.batchOverrideHost = '';
    this.batchOverridePort = 25565;
  }

  startTelemetryBroadcast() {
    this.telemetryInterval = setInterval(() => {
      this.broadcastTelemetry();
    }, 1000);
  }

  broadcastTelemetry() {
    Object.keys(this.bots).forEach(accountId => {
      const botData = this.bots[accountId];
      if (!botData || !botData.bot || botData.status !== 'online') return;

      const bot = botData.bot;

      try {
        const position = bot.entity?.position;
        if (!position) return;

        // 1. Coordinates and Yaw
        const telemetry = {
          accountId,
          x: Math.round(position.x),
          y: Math.round(position.y),
          z: Math.round(position.z),
          dimension: bot.game?.dimension || 'minecraft:overworld',
          yaw: bot.entity.yaw || 0, // facing direction in radians
          pitch: bot.entity.pitch || 0,
          
          // 2. Chunks (loaded columns coordinates)
          chunks: (bot.world && typeof bot.world.getColumns === 'function') 
            ? bot.world.getColumns().map(c => ({ x: c.x, z: c.z })) 
            : [],
          
          inventory: bot.inventory ? bot.inventory.items().map(item => ({
            name: item.name,
            displayName: item.displayName || item.name,
            count: item.count,
            slot: item.slot
          })) : [],
          
          // 2b. Block Terrain Scanning (25x25 grid centered on bot)
          blocks: (() => {
            const blocksList = [];
            const startX = Math.round(position.x);
            const startY = Math.round(position.y);
            const startZ = Math.round(position.z);
            const radius = 12; // 25x25 grid
            
            for (let dz = -radius; dz <= radius; dz++) {
              for (let dx = -radius; dx <= radius; dx++) {
                let blockId = 0;
                for (let dy = 2; dy >= -4; dy--) {
                  const block = bot.blockAt(new Vec3(startX + dx, startY + dy, startZ + dz));
                  if (block && block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air') {
                    const name = block.name.toLowerCase();
                    if (name.includes('grass') || name.includes('moss') || name.includes('leaves') || name.includes('vine') || name.includes('lily') || name.includes('rose') || name.includes('flower') || name.includes('dandelion')) {
                      blockId = 1; // Grass / Plant (Green)
                    } else if (name.includes('dirt') || name.includes('podzol') || name.includes('farmland') || name.includes('log') || name.includes('wood') || name.includes('plank')) {
                      blockId = 2; // Dirt / Wood (Brown)
                    } else if (name.includes('stone') || name.includes('cobble') || name.includes('andesite') || name.includes('diorite') || name.includes('granite') || name.includes('deepslate') || name.includes('brick') || name.includes('ore') || name.includes('iron') || name.includes('gold') || name.includes('obsidian') || name.includes('netherrack') || name.includes('basalt')) {
                      blockId = 3; // Stone / Ore (Grey)
                    } else if (name.includes('water')) {
                      blockId = 4; // Water (Blue)
                    } else if (name.includes('lava') || name.includes('fire') || name.includes('magma')) {
                      blockId = 5; // Lava (Orange/Red)
                    } else if (name.includes('sand') || name.includes('clay') || name.includes('gravel')) {
                      blockId = 6; // Sand / Gravel (Yellow/Beige)
                    } else {
                      blockId = 7; // Other block
                    }
                    break;
                  }
                }
                blocksList.push(blockId);
              }
            }
            return blocksList;
          })(),
          
          // 3. Surrounding Entities (players and mobs within 64 blocks)
          entities: Object.keys(bot.entities)
            .map(id => bot.entities[id])
            .filter(e => e && e.id !== bot.entity.id && e.position && e.position.distanceTo(position) < 64)
            .map(e => {
              let type = 'unknown';
              if (e.type === 'player') {
                type = 'player';
              } else if (e.type === 'mob') {
                const hostileKeywords = ['zombie', 'skeleton', 'creeper', 'spider', 'witch', 'enderman', 'phantom', 'blaze', 'piglin', 'husk', 'drowned', 'slime', 'ghast', 'wither', 'pillager', 'ravager'];
                const name = (e.name || '').toLowerCase();
                const isHostile = hostileKeywords.some(kw => name.includes(kw));
                type = isHostile ? 'hostile' : 'friendly';
              }
              
              return {
                id: e.id,
                username: e.username || e.name || 'Entity',
                type: type,
                x: Math.round(e.position.x),
                z: Math.round(e.position.z)
              };
            })
        };

        this.io.emit('bot_telemetry', telemetry);
      } catch (err) {
        // Silent catch during bot loading/unloading states
      }
    });
  }

  setBotControlState(accountId, key, state) {
    const botData = this.bots[accountId];
    if (!botData || !botData.bot || botData.status !== 'online') return;

    try {
      botData.bot.setControlState(key, !!state);
    } catch (err) {
      this.log(accountId, `Failed to set control state ${key}: ${err.message}`, 'error');
    }
  }

  startBatchConnect(overrideHost, overridePort) {
    this.stopBatchConnect();

    const pendingAccounts = [];
    this.globalConfig.accounts.forEach(acc => {
      const activeBot = this.bots[acc.id];
      const isOnline = activeBot && (activeBot.status === 'online' || activeBot.status === 'connecting' || activeBot.status === 'reconnecting');
      if (!isOnline) {
        pendingAccounts.push(acc);
      }
    });

    if (pendingAccounts.length === 0) return;

    this.batchQueue = pendingAccounts;
    this.batchOverrideHost = overrideHost;
    this.batchOverridePort = overridePort;
    
    this.processNextBatch();
  }

  stopBatchConnect() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.batchQueue = [];
    this.io.emit('batch_status', { active: false });
  }

  processNextBatch() {
    if (!this.batchQueue || this.batchQueue.length === 0) {
      this.stopBatchConnect();
      return;
    }

    const account = this.batchQueue.shift();
    const accountConfig = { ...account };
    if (this.batchOverrideHost) {
      accountConfig.host = this.batchOverrideHost;
    }
    if (this.batchOverridePort) {
      accountConfig.port = this.batchOverridePort;
    }

    this.startBot(accountConfig.id, accountConfig);

    if (this.batchQueue.length > 0) {
      const delaySec = Math.floor(Math.random() * 60) + 1; // 1 to 60 seconds
      this.io.emit('batch_status', { 
        active: true, 
        nextDelay: delaySec, 
        remaining: this.batchQueue.length 
      });
      
      this.log(accountConfig.id, `Batch queue active. Next account will connect in ${delaySec} seconds...`, 'info');

      this.batchTimeout = setTimeout(() => {
        this.processNextBatch();
      }, delaySec * 1000);
    } else {
      this.stopBatchConnect();
    }
  }

  disconnectAllBots() {
    this.stopBatchConnect();
    Object.keys(this.bots).forEach(accountId => {
      this.stopBot(accountId);
    });
  }

  updateGlobalConfig(config) {
    this.globalConfig = config;
    if (config.accounts) {
      config.accounts.forEach(acc => {
        if (this.bots[acc.id]) {
          const wasAntiAfkEnabled = this.bots[acc.id].config.antiAfk?.enabled !== false;
          const isAntiAfkEnabled = acc.antiAfk?.enabled !== false;
          
          this.bots[acc.id].config = acc;
          
          if (wasAntiAfkEnabled !== isAntiAfkEnabled) {
            if (isAntiAfkEnabled) {
              this.startAntiAFK(acc.id);
            } else {
              if (this.bots[acc.id].antiAfkInterval) {
                clearInterval(this.bots[acc.id].antiAfkInterval);
                this.bots[acc.id].antiAfkInterval = null;
                this.log(acc.id, 'Anti-AFK disabled dynamically.', 'info');
              }
            }
          }
        }
      });
    }
  }

  log(accountId, message, type = 'info') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      accountId,
      message,
      type // 'info', 'success', 'warning', 'error', 'chat'
    };
    this.io.emit('bot_log', logEntry);
    console.log(`[Bot ${accountId}] [${type.toUpperCase()}] ${message}`);
  }

  sendStatus(accountId) {
    const botData = this.bots[accountId];
    if (!botData) return;
    this.io.emit('bot_status', {
      accountId,
      status: botData.status,
      username: botData.bot?.username || botData.config.username,
      ping: botData.bot?.player?.ping || 0,
      health: botData.bot?.health !== undefined ? botData.bot.health : 0,
      food: botData.bot?.food !== undefined ? botData.bot.food : 0,
      xpLevel: botData.bot?.experience?.level !== undefined ? botData.bot.experience.level : 0,
      xpProgress: botData.bot?.experience?.progress !== undefined ? botData.bot.experience.progress : 0
    });
  }

  async startBot(accountId, config) {
    // If bot already exists and is active, stop it first
    if (this.bots[accountId]) {
      this.stopBot(accountId);
    }

    this.bots[accountId] = {
      config,
      status: 'connecting',
      bot: null,
      reconnectTimeout: null,
      antiAfkInterval: null,
      hasSpawnedOnce: false,
      hasRunAutoCommands: false,
      hasFeedPermission: true
    };

    this.log(accountId, `Connecting to Minecraft server at ${config.host}:${config.port || 25565}...`, 'info');

    try {
      const host = config.host;
      const port = parseInt(config.port) || 25565;

      const profilesFolder = process.versions.electron
        ? path.join(require('electron').app.getPath('userData'), 'auth_profiles')
        : path.join(__dirname, 'auth_profiles');

      if (process.versions.electron && !fs.existsSync(profilesFolder)) {
        try {
          fs.mkdirSync(profilesFolder, { recursive: true });
          const localProfiles = path.join(__dirname, 'auth_profiles');
          if (fs.existsSync(localProfiles)) {
            const files = fs.readdirSync(localProfiles);
            for (const file of files) {
              const src = path.join(localProfiles, file);
              const dest = path.join(profilesFolder, file);
              if (fs.statSync(src).isFile()) {
                fs.copyFileSync(src, dest);
              }
            }
            console.log('Copied auth profiles to userData folder');
          }
        } catch (err) {
          console.error('Failed to copy auth profiles:', err);
        }
      }

      const botOptions = {
        host: host,
        port: port,
        username: config.username,
        auth: config.auth === 'microsoft' ? 'microsoft' : 'offline',
        version: config.version || false, // false enables auto-negotiation
        hideErrors: true,
        respawn: false, // Disable mineflayer's instant auto-respawn to prevent fast-respawn kicks
        profilesFolder: profilesFolder,
        onMsaCode: (code) => {
          const userCode = code.user_code || code.userCode;
          const verificationUri = code.verification_uri || code.verificationUri;
          const isTr = this.globalConfig.language === 'tr';
          const msg = isTr
            ? `[Microsoft Girişi] Lütfen tarayıcınızdan ${verificationUri} adresine gidin ve şu kodu girin: ${userCode}`
            : `[Microsoft Login] Please open ${verificationUri} in your browser and enter this code: ${userCode}`;
          this.log(accountId, msg, 'warning');
          
          this.io.emit('microsoft_auth_trigger', {
            accountId: accountId,
            userCode: userCode,
            verificationUri: verificationUri
          });
        }
      };

      const bot = mineflayer.createBot(botOptions);
      this.bots[accountId].bot = bot;

      this.setupBotEvents(accountId, bot);
    } catch (err) {
      this.log(accountId, `Creation failed: ${err.message}`, 'error');
      this.handleReconnect(accountId);
    }
  }

  stopBot(accountId) {
    const botData = this.bots[accountId];
    if (!botData) return;

    this.log(accountId, 'Stopping bot...', 'warning');

    if (botData.reconnectTimeout) {
      clearTimeout(botData.reconnectTimeout);
    }
    if (botData.antiAfkInterval) {
      clearInterval(botData.antiAfkInterval);
    }

    botData.status = 'disconnected';

    if (botData.bot) {
      try {
        botData.bot.quit();
      } catch (err) {
        // Already quit
      }
    }

    this.sendStatus(accountId);
    delete this.bots[accountId];
  }

  setupBotEvents(accountId, bot) {
    const botData = this.bots[accountId];
    if (!botData) return;

    // Intercept client writes to block play-state packets during configuration state
    const originalWrite = bot._client.write.bind(bot._client);
    bot._client.write = (name, params) => {
      if (bot._client.state === 'configuration') {
        const allowedPackets = [
          'settings',
          'cookie_response',
          'custom_payload',
          'finish_configuration',
          'keep_alive',
          'pong',
          'resource_pack_receive',
          'select_known_packs',
          'custom_report_details',
          'server_links'
        ];
        if (!allowedPackets.includes(name)) {
          return; // Block play-state packets in configuration state
        }
      }
      return originalWrite(name, params);
    };

    // Workaround for Velocity/Bungeecord mid-session server transfer configuration packet decode error
    bot._client.on('start_configuration', () => {
      this.log(accountId, 'Received start_configuration packet. Disabling physics and queuing settings...', 'info');
      bot.physicsEnabled = false; // Disable physics loop to prevent sending position packets during configuration
      
      // We must run in setImmediate to ensure that minecraft-protocol's own start_configuration handler
      // has run, transitioning client.state to states.CONFIGURATION before we write settings!
      setImmediate(() => {
        try {
          bot.setSettings({}); // Let mineflayer send the settings packet in configuration state
          this.log(accountId, 'Successfully sent settings packet in configuration state.', 'success');
        } catch (err) {
          this.log(accountId, `Failed to send configuration settings: ${err.message}`, 'error');
        }
      });
    });

    bot.on('login', () => {
      this.log(accountId, `Successfully logged in as ${bot.username}. Joining lobby/limbo...`, 'success');
      botData.status = 'online';
      this.sendStatus(accountId);

      // Run auto-commands on login (e.g. /login command to authenticating proxy)
      if (!botData.hasRunAutoCommands) {
        botData.hasRunAutoCommands = true;
        if (botData.config.autoCommands && botData.config.autoCommands.length > 0) {
          this.log(accountId, 'Executing auto-commands in 3 seconds...', 'info');
          const delay = parseInt(botData.config.autoCommandsDelay) || 2000;
          botData.config.autoCommands.forEach((cmd, idx) => {
            setTimeout(() => {
              if (botData.status === 'online') {
                bot.chat(cmd);
                this.log(accountId, `Executed auto-command: ${cmd}`, 'info');
              }
            }, 3000 + (idx * delay));
          });
        }
      }
    });

    bot.on('spawn', () => {
      bot.physicsEnabled = true; // Re-enable physics loop when spawned in lobby/game world
      botData.status = 'online';
      this.sendStatus(accountId);

      if (!botData.hasSpawnedOnce) {
        botData.hasSpawnedOnce = true;
        this.log(accountId, `Successfully spawned in the world as ${bot.username}!`, 'success');

        // Fallback in case login event did not trigger auto-commands
        if (!botData.hasRunAutoCommands) {
          botData.hasRunAutoCommands = true;
          if (botData.config.autoCommands && botData.config.autoCommands.length > 0) {
            this.log(accountId, 'Executing auto-commands in 3 seconds...', 'info');
            const delay = parseInt(botData.config.autoCommandsDelay) || 2000;
            botData.config.autoCommands.forEach((cmd, idx) => {
              setTimeout(() => {
                if (botData.status === 'online') {
                  bot.chat(cmd);
                  this.log(accountId, `Executed auto-command: ${cmd}`, 'info');
                }
              }, 3000 + (idx * delay));
            });
          }
        }

        // Start Anti-AFK
        this.startAntiAFK(accountId);
      } else {
        this.log(accountId, `Bot respawned in the world as ${bot.username}.`, 'success');
        // Restart Anti-AFK to ensure clean state after respawn
        this.startAntiAFK(accountId);
      }
    });

    bot.on('health', () => {
      this.sendStatus(accountId);
      this.autoFeed(accountId);
    });

    bot.on('experience', () => {
      this.sendStatus(accountId);
    });

    bot.on('chat', (username, message) => {
      // Ignore bot's own messages
      if (username === bot.username) return;

      this.log(accountId, `<${username}> ${message}`, 'chat');

      // Process AI auto-reply logic
      this.handleAiChat(accountId, username, message);
    });

    bot.on('whisper', (username, message) => {
      if (username === bot.username) return;
      this.log(accountId, `[Whisper] <${username}> ${message}`, 'chat');

      this.handleAiChat(accountId, username, message, true);
    });

    bot.on('message', (jsonMsg, position) => {
      const cleanMsg = jsonMsg.toString();
      const cleanMsgLower = cleanMsg.toLowerCase();

      // Log system messages (like auth prompt / login reminders) to the user console
      if (position === 'system' || (position === undefined && !cleanMsg.startsWith('<') && !cleanMsg.includes(': '))) {
        // Only log if it's not empty/whitespace
        if (cleanMsg.trim()) {
          this.log(accountId, `[Sistem] ${cleanMsg}`, 'info');
        }
      }

      if (cleanMsgLower.includes('no permission') || 
          cleanMsgLower.includes('yetkiniz yok') || 
          cleanMsgLower.includes('yetkin yok') ||
          cleanMsgLower.includes('don\'t have permission') || 
          cleanMsgLower.includes('unknown command') || 
          cleanMsgLower.includes('bilinmeyen komut') ||
          cleanMsgLower.includes('you do not have') ||
          cleanMsgLower.includes('no select permission') ||
          cleanMsgLower.includes('command not found')) {
        
        if (botData.hasFeedPermission !== false) {
          botData.hasFeedPermission = false;
          this.log(accountId, 'Detected lack of /feed command permission from server message. Falling back to inventory eating.', 'warning');
        }
      }
    });

    bot.on('death', () => {
      botData.status = 'online';
      this.sendStatus(accountId);
      const respawnEnabled = botData.config.autoRespawn !== false;
      if (respawnEnabled) {
        this.log(accountId, 'Bot died! Auto-respawning in 2 seconds...', 'warning');
        setTimeout(() => {
          if (botData.status === 'online') {
            try {
              bot.respawn();
              this.log(accountId, 'Sent respawn packet.', 'success');
            } catch (err) {
              this.log(accountId, `Respawn failed: ${err.message}`, 'error');
            }
          }
        }, 2000);
      } else {
        this.log(accountId, 'Bot died! Type /respawn to respawn.', 'warning');
      }
    });

    bot.on('error', (err) => {
      this.log(accountId, `Error: ${err.message}`, 'error');
      console.error(`[Bot ${accountId}] Error stack:`, err.stack);
    });

    bot.on('end', (reason) => {
      botData.status = 'disconnected';
      this.log(accountId, `Disconnected: ${reason || 'Connection lost'}`, 'warning');
      this.sendStatus(accountId);

      if (botData.antiAfkInterval) {
        clearInterval(botData.antiAfkInterval);
      }

      this.handleReconnect(accountId);
    });
  }

  handleReconnect(accountId) {
    const botData = this.bots[accountId];
    if (!botData) return;

    // Check if auto-reconnect is enabled in config (default: true)
    const reconnectEnabled = botData.config.autoReconnect !== false;
    if (!reconnectEnabled) {
      this.log(accountId, 'Auto-reconnect is disabled for this bot.', 'info');
      return;
    }

    const delay = parseInt(botData.config.reconnectDelay) || 10000;
    this.log(accountId, `Reconnecting in ${delay / 1000} seconds...`, 'warning');

    botData.status = 'reconnecting';
    this.sendStatus(accountId);

    botData.reconnectTimeout = setTimeout(() => {
      if (this.bots[accountId]) {
        this.startBot(accountId, botData.config);
      }
    }, delay);
  }

  startAntiAFK(accountId) {
    const botData = this.bots[accountId];
    if (!botData) return;

    if (botData.antiAfkInterval) {
      clearInterval(botData.antiAfkInterval);
    }

    const antiAfkConfig = botData.config.antiAfk || { enabled: true, mode: 'random', interval: 8000 };
    if (!antiAfkConfig.enabled) {
      this.log(accountId, 'Anti-AFK is disabled.', 'info');
      return;
    }

    const interval = parseInt(antiAfkConfig.interval) || 8000;
    this.log(accountId, `Anti-AFK active (Mode: ${antiAfkConfig.mode || 'random'}, Interval: ${interval / 1000}s)`, 'info');

    botData.antiAfkInterval = setInterval(() => {
      const bot = botData.bot;
      if (!bot || botData.status !== 'online') return;

      const mode = antiAfkConfig.mode || 'random';

      try {
        if (mode === 'jump' || (mode === 'random' && Math.random() > 0.6)) {
          bot.setControlState('jump', true);
          setTimeout(() => bot.setControlState('jump', false), 500);
        }

        if (mode === 'walk' || (mode === 'random' && Math.random() > 0.6)) {
          const directions = ['forward', 'back', 'left', 'right'];
          const dir = directions[Math.floor(Math.random() * directions.length)];
          bot.setControlState(dir, true);
          setTimeout(() => bot.setControlState(dir, false), 800);
        }

        if (mode === 'random' && Math.random() > 0.5) {
          const yaw = (Math.random() - 0.5) * 2 * Math.PI;
          const pitch = (Math.random() - 0.5) * Math.PI;
          bot.look(yaw, pitch);
        }
      } catch (err) {
        this.log(accountId, `Anti-AFK execution error: ${err.message}`, 'error');
      }
    }, interval);
  }

  async handleAiChat(accountId, username, message, isWhisper = false) {
    const botData = this.bots[accountId];
    if (!botData) return;

    // Use either the new "ai" config block or fallback to legacy "gemini" block
    const aiConfig = botData.config.ai || botData.config.gemini || {};
    if (!aiConfig.enabled) return;

    const provider = aiConfig.provider || 'gemini';

    // Check triggers
    let shouldRespond = false;

    // 1. If it is a private whisper
    if (isWhisper) {
      shouldRespond = true;
    } 
    // 2. Mention check
    else if (message.toLowerCase().includes(botData.bot.username.toLowerCase())) {
      shouldRespond = true;
    } 
    // 3. Keyword triggers
    else if (aiConfig.triggerKeywords && aiConfig.triggerKeywords.length > 0) {
      const msgLower = message.toLowerCase();
      shouldRespond = aiConfig.triggerKeywords.some(keyword => msgLower.includes(keyword.toLowerCase()));
    } 
    // 4. Respond to all messages
    else if (aiConfig.respondAll === true) {
      shouldRespond = true;
    }

    if (!shouldRespond) return;

    this.log(accountId, `Generating ${provider.toUpperCase()} reply for <${username}>...`, 'info');

    try {
      const prompt = `Player ${username} said: "${message}". Reply to them in a short, natural Minecraft chat message. Do not use double quotes or prefix/suffix. Max 80 characters.`;
      
      const systemInstruction = aiConfig.systemInstruction || 
        "You are a friendly Minecraft player. Keep responses short (under 100 characters), simple, and conversational. Do not use hashtags, emojis, or markdown. Speak in the language the player spoke to you.";

      const reply = await this.getAiResponse(
        accountId,
        provider,
        aiConfig.apiKey,
        aiConfig.apiUrl,
        aiConfig.model,
        prompt,
        systemInstruction
      );

      if (reply) {
        const cleanedReply = reply.replace(/\n/g, ' ').trim();
        this.log(accountId, `${provider.toUpperCase()} Reply: ${cleanedReply}`, 'info');
        if (isWhisper) {
          botData.bot.chat(`/w ${username} ${cleanedReply}`);
        } else {
          botData.bot.chat(cleanedReply);
        }
      }
    } catch (err) {
      this.log(accountId, `AI Auto-Reply Error (${provider}): ${err.message}`, 'error');
    }
  }

  async getAiResponse(accountId, provider, apiKey, apiUrl, model, prompt, systemInstruction) {
    let targetKey = apiKey;
    let targetUrl = apiUrl;
    let targetModel = model;

    // Resolve global configurations and defaults
    if (provider === 'gemini') {
      targetKey = targetKey || this.globalConfig.geminiApiKey;
      targetModel = targetModel || 'gemini-2.5-flash';
    } else if (provider === 'openai') {
      targetKey = targetKey || this.globalConfig.openaiApiKey;
      targetUrl = targetUrl || 'https://api.openai.com/v1/chat/completions';
      targetModel = targetModel || 'gpt-4o-mini';
    } else if (provider === 'claude') {
      targetKey = targetKey || this.globalConfig.claudeApiKey;
      targetUrl = targetUrl || 'https://api.anthropic.com/v1/messages';
      targetModel = targetModel || 'claude-3-5-sonnet-20240620';
    } else if (provider === 'deepseek') {
      targetKey = targetKey || this.globalConfig.deepseekApiKey;
      targetUrl = targetUrl || 'https://api.deepseek.com/chat/completions';
      targetModel = targetModel || 'deepseek-chat';
    } else if (provider === 'ollama') {
      targetUrl = targetUrl || this.globalConfig.ollamaUrl || 'http://localhost:11434';
      targetModel = targetModel || 'llama3';
    }

    if (!targetKey && provider !== 'ollama') {
      throw new Error(`API key for ${provider} is missing. Please set it in Settings.`);
    }

    if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: targetKey });
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          maxOutputTokens: 50
        }
      });
      return response.text?.trim();
    }

    const headers = {
      'Content-Type': 'application/json'
    };

    let body = {};

    if (provider === 'openai' || provider === 'deepseek') {
      headers['Authorization'] = `Bearer ${targetKey}`;
      body = {
        model: targetModel,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.7
      };
      
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API returned status ${res.status}: ${errText}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim();

    } else if (provider === 'claude') {
      headers['x-api-key'] = targetKey;
      headers['anthropic-version'] = '2023-06-01';
      body = {
        model: targetModel,
        system: systemInstruction,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 50
      };
      
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API returned status ${res.status}: ${errText}`);
      }
      const data = await res.json();
      return data.content?.[0]?.text?.trim();

    } else if (provider === 'ollama') {
      const endpoint = `${targetUrl.replace(/\/$/, '')}/api/chat`;
      body = {
        model: targetModel,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ],
        options: {
          num_predict: 50
        },
        stream: false
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama returned status ${res.status}: ${errText}`);
      }
      const data = await res.json();
      return data.message?.content?.trim();
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  async autoFeed(accountId) {
    const botData = this.bots[accountId];
    if (!botData || !botData.bot) return;

    const bot = botData.bot;
    
    // Only feed if bot is spawned, status is online, and autoFeed is enabled
    if (botData.status !== 'online' || bot.food === undefined || bot.health === undefined) return;
    if (botData.config.autoFeed === false) return;

    // Trigger eating if food is below 16, OR if health is below 10 and food is below 20 (to enable health regeneration)
    const needsFood = bot.food < 16 || (bot.health < 10 && bot.food < 20);
    if (!needsFood) return;

    // Avoid double consumption/feeding loops
    if (botData.isFeeding) return;
    botData.isFeeding = true;

    // Pause Anti-AFK temporarily to stand still and prevent movement/jumping during eating
    const wasAntiAfkRunning = !!botData.antiAfkInterval;
    if (wasAntiAfkRunning) {
      clearInterval(botData.antiAfkInterval);
      botData.antiAfkInterval = null;
      this.log(accountId, 'Pausing Anti-AFK to eat...', 'info');
    }

    try {
      // 1. Try /feed command first if permitted
      if (botData.hasFeedPermission !== false) {
        const foodBefore = bot.food;
        this.log(accountId, `Hungry (Food: ${bot.food}/20). Attempting /feed command...`, 'info');
        bot.chat('/feed');
        
        // Wait 1.5 seconds for server processing/event loop ticks
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Check if food level increased
        if (bot.food > foodBefore) {
          this.log(accountId, `Successfully fed using /feed command (Food: ${bot.food}/20).`, 'success');
          return;
        } else {
          this.log(accountId, '/feed command failed to increase food level. Falling back to inventory eating.', 'warning');
        }
      }

      // 2. Classic inventory eating method
      const foodItems = bot.inventory.items().filter(item => {
        const name = item.name.toLowerCase();
        return name.includes('cooked') || 
               name.includes('bread') || 
               name.includes('apple') || 
               name.includes('potato') || 
               name.includes('carrot') || 
               name.includes('pie') || 
               name.includes('melon') || 
               name.includes('berry') || 
               name.includes('berries') || 
               name.includes('cookie') || 
               name.includes('steak');
      });

      if (foodItems.length === 0) {
        this.log(accountId, 'No food found in inventory!', 'warning');
        return;
      }

      const foodItem = foodItems[0];
      this.log(accountId, `Attempting to eat ${foodItem.name} from inventory...`, 'info');

      // Equip to hand
      await bot.equip(foodItem, 'hand');
      
      // Wait 500ms for slot confirmation (network sync buffer)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Eat it
      await bot.consume();
      this.log(accountId, `Successfully ate ${foodItem.name}.`, 'success');
    } catch (err) {
      this.log(accountId, `Auto-feed failed: ${err.message}`, 'error');
    } finally {
      botData.isFeeding = false;
      // Resume Anti-AFK if it was active before eating
      if (wasAntiAfkRunning && botData.status === 'online') {
        this.startAntiAFK(accountId);
      }
    }
  }

  getBotsStatus() {
    const statuses = {};
    Object.keys(this.bots).forEach(id => {
      const b = this.bots[id];
      statuses[id] = {
        status: b.status,
        username: b.bot?.username || b.config.username,
        ping: b.bot?.player?.ping || 0
      };
    });
    return statuses;
  }
}

module.exports = BotManager;
