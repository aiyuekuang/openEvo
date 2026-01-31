import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  gateway: {
    start: () => ipcRenderer.invoke('gateway:start'),
    stop: () => ipcRenderer.invoke('gateway:stop'),
    status: () => ipcRenderer.invoke('gateway:status'),
    getPort: () => ipcRenderer.invoke('gateway:getPort'),
  },
});

// 类型声明
declare global {
  interface Window {
    electronAPI: {
      gateway: {
        start: () => Promise<boolean>;
        stop: () => Promise<void>;
        status: () => Promise<'stopped' | 'starting' | 'running' | 'error'>;
        getPort: () => Promise<number>;
      };
    };
  }
}
