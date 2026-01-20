/* eslint-env node */
/* global require, process, __dirname */

const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // Para facilitar la integración simple
    },
    // Asegúrate de tener un icono en esta ruta para la ventana
    // Si no existe la imagen, no pasa nada, solo no se mostrará el icono
    icon: path.join(__dirname, 'src/images/logo.png') 
  });

  // En producción, cargamos el archivo index.html compilado
  if (app.isPackaged) {
      win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
      // En desarrollo, intentamos conectar con Vite
      win.loadURL('http://localhost:5173').catch(() => {
        // Si falla (Vite no está corriendo), cargamos el archivo
        win.loadFile(path.join(__dirname, 'dist', 'index.html'));
      });
  }
  
  // Opcional: Quitar la barra de menú superior estándar de Windows/Linux
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});