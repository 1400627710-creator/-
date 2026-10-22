import { ArchiveCore } from './core.js';
export const ArchiveStorage = (() => {
  const DB_NAME = 'novel-archive-studio-v1';
  const KEY = 'novel-archive-studio-workspace-v1';
  class Store {
    constructor() { this.db = null; this.mode = 'memory'; this.lastSavedRevision = null; this.memory = null; }
    async open() {
      try {
        this.db = await new Promise((resolve, reject) => {
          if (!globalThis.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
          const request = indexedDB.open(DB_NAME, 1);
          request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace'); };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('存储升级被其他窗口占用。'));
        });
        this.mode = 'indexedDB';
        this.db.onversionchange = () => { this.db.close(); this.mode = 'memory'; };
      } catch {
        try { localStorage.setItem(`${KEY}-probe`, '1'); localStorage.removeItem(`${KEY}-probe`); this.mode = 'localStorage'; } catch { this.mode = 'memory'; }
      }
      return this.mode;
    }
    async load() {
      let value = null;
      if (this.mode === 'indexedDB') {
        value = await new Promise((resolve, reject) => {
          const tx = this.db.transaction('workspace', 'readonly');
          const req = tx.objectStore('workspace').get('main');
          req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
        });
        if (!value) {
          try {
            const legacy = localStorage.getItem(KEY);
            if (legacy) { value = JSON.parse(legacy); this.db.close(); this.db = null; this.mode = 'localStorage'; }
          } catch (e) { if (e instanceof SyntaxError) throw e; }
        }
      } else if (this.mode === 'localStorage') {
        const raw = localStorage.getItem(KEY); value = raw ? JSON.parse(raw) : null;
      } else value = this.memory;
      this.lastSavedRevision = value?.revision ?? null;
      return value;
    }
    async save(value) {
      if (this.mode === 'memory') { this.memory = ArchiveCore.copy(value); throw ArchiveCore.error('STORAGE_UNAVAILABLE', '此环境无法持久保存，请下载备份。'); }
      const expected = this.lastSavedRevision;
      if (this.mode === 'indexedDB') {
        await new Promise((resolve, reject) => {
          const tx = this.db.transaction('workspace', 'readwrite');
          const store = tx.objectStore('workspace'); let problem = null;
          const req = store.get('main');
          req.onsuccess = () => {
            if ((req.result?.revision ?? null) !== expected) { problem = ArchiveCore.error('REVISION_CONFLICT', '另一窗口已更新档案，请先备份当前内容再重新载入。'); tx.abort(); return; }
            store.put(value, 'main');
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(problem || tx.error || ArchiveCore.error('STORAGE_UNAVAILABLE', '保存失败。'));
          tx.onabort = () => reject(problem || tx.error || ArchiveCore.error('STORAGE_UNAVAILABLE', '保存失败。'));
        });
      } else {
        const current = localStorage.getItem(KEY);
        if ((current ? JSON.parse(current).revision : null) !== expected) throw ArchiveCore.error('REVISION_CONFLICT', '另一窗口已更新档案，请先备份当前内容再重新载入。');
        localStorage.setItem(KEY, JSON.stringify(value));
      }
      this.lastSavedRevision = value.revision;
      return { saved: true, revision: value.revision };
    }
  }
  return { Store, DB_NAME, KEY };
})();
