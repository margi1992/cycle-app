// Desktop shell: loads the same built web app (dist/) in a window.
// Data stays in this app's own profile folder (%APPDATA%/Cycle) — nothing leaves the machine.
const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('path')

app.setName('Cycle')
if (!app.requestSingleInstanceLock()) app.quit()

let win

function createWindow() {
  Menu.setApplicationMenu(null)
  win = new BrowserWindow({
    width: 480,
    height: 860,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#F6F1EA',
    title: 'Cycle',
    icon: path.join(__dirname, '..', 'public', 'icon-512.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  // Never navigate away from the app; open any external link in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault() })
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
