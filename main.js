/* eslint-disable no-undef */
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuración necesaria para __dirname en módulos modernos (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,    // Permite a React acceder a recursos de Node
      contextIsolation: false,  // Facilita la comunicación para este tipo de apps POS
      webSecurity: false        // Ayuda a cargar imágenes locales en desarrollo
    },
  });

  // --- LÓGICA DE CARGA ---
  if (!app.isPackaged) {
    // MODO DESARROLLO: Carga Vite (React)
    mainWindow.loadURL('http://localhost:5173');
    // Abre la consola de desarrollador (F12) para ver errores
    // mainWindow.webContents.openDevTools(); 
  } else {
    // MODO PRODUCCIÓN: Carga el archivo compilado
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // --- CONFIGURACIÓN DE IMPRESIÓN ---
  
  // Esto permite que la librería 'react-to-print' abra la ventana de impresión
  // Quitamos el argumento de los paréntesis
mainWindow.webContents.setWindowOpenHandler(() => {
  return { action: 'allow' };
});
  // (Opcional) Si quisieras impresión 100% silenciosa en el futuro,
  // tendríamos que agregar código aquí para interceptar 'window.print()',
  // pero por ahora dejamos que salga el cuadro de diálogo estándar de Windows.
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});