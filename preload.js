'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Safe, explicit bridge between the renderer UI and the data layer.
contextBridge.exposeInMainWorld('inventory', {
  get: () => ipcRenderer.invoke('inventory:get'),
  add: (item) => ipcRenderer.invoke('inventory:add', item),
  update: (item) => ipcRenderer.invoke('inventory:update', item),
  adjust: (id, delta) => ipcRenderer.invoke('inventory:adjust', { id, delta }),
  remove: (id) => ipcRenderer.invoke('inventory:delete', id),
  exportJson: () => ipcRenderer.invoke('inventory:export'),
  exportCsv: () => ipcRenderer.invoke('inventory:exportCsv'),
  importJson: () => ipcRenderer.invoke('inventory:import'),
  dataDir: () => ipcRenderer.invoke('inventory:dataDir'),
  revealData: () => ipcRenderer.invoke('inventory:revealData'),
});
