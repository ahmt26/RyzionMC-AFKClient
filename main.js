const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Configure autoUpdater logging to console
autoUpdater.logger = console;

// Start the Express and Socket.io server
require('./server.js');

// Helper to load the current webPort from config
function getWebPort() {
  const userDataPath = app.getPath('userData');
  const userConfigPath = path.join(userDataPath, 'config.json');
  const localConfigPath = path.join(__dirname, 'config.json');

  let configPath = localConfigPath;
  if (fs.existsSync(userConfigPath)) {
    configPath = userConfigPath;
  } else if (fs.existsSync(localConfigPath)) {
    configPath = localConfigPath;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    return config.webPort || 2855;
  } catch (err) {
    console.error('Failed to read webPort from config, falling back to 2855:', err);
    return 2855;
  }
}

let mainWindow;
let isRadarOpen = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'RyzionMC AFK Client',
    icon: path.join(__dirname, 'public', 'logo.ico'),
    frame: false, // Make window borderless / frameless
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Intercept keyboard inputs to block Ctrl + W closing during active bot control
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isRadarOpen && (input.control || input.meta) && input.key.toLowerCase() === 'w') {
      event.preventDefault(); // Stop Ctrl + W from closing the window
    }
  });

  // Hide default menu bar
  mainWindow.setMenuBarVisibility(false);

  const port = getWebPort();
  console.log(`[Electron] Loading dashboard from http://127.0.0.1:${port}`);
  
  // Wait slightly for Express/Socket.io server to bind and start listening
  setTimeout(() => {
    mainWindow.loadURL(`http://127.0.0.1:${port}`).catch(err => {
      console.error('Failed to load dashboard URL:', err);
      // Retry once if server is still starting
      setTimeout(() => {
        mainWindow.loadURL(`http://127.0.0.1:${port}`);
      }, 1000);
    });
  }, 1000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createWindow();
  
  // Check for updates and notify the user
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.error('Error checking for updates:', err);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Auto Updater Listeners
autoUpdater.on('checking-for-update', () => {
  console.log('[Updater] Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('[Updater] Update available:', info.version);
});

autoUpdater.on('update-not-available', (info) => {
  console.log('[Updater] Update not available.');
});

autoUpdater.on('error', (err) => {
  console.error('[Updater] Error in auto-updater:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`[Updater] Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[Updater] Update downloaded:', info.version);
  dialog.showMessageBox({
    type: 'info',
    title: 'Yeni Güncelleme Hazır',
    message: `RyzionMC AFK Client v${info.version} indirildi. Şimdi yüklemek için uygulamayı yeniden başlatmak ister misiniz?`,
    buttons: ['Evet', 'Daha Sonra']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

// IPC Window Controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('set-radar-open', (event, open) => {
  isRadarOpen = open;
});


