'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openBrowser: () => ipcRenderer.invoke('open-browser'),
  selectImage: () => ipcRenderer.invoke('select-image'),
  runAutomation: (templates, options) => ipcRenderer.invoke('run-automation', { templates, options }),
  stopAutomation: () => ipcRenderer.invoke('stop-automation'),
  onLog: (callback) => ipcRenderer.on('log', (_event, data) => callback(data)),
  onLoginStatus: (callback) => ipcRenderer.on('login-status', (_event, data) => callback(data)),
  onRunFinished: (callback) => ipcRenderer.on('run-finished', (_event, data) => callback(data)),
});
