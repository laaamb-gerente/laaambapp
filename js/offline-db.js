// ── offline-db.js ─────────────────────────────────────
// Capa de persistencia local (IndexedDB) para operación sin
// señal en campo. Cachea entidades principales y mantiene una
// cola de operaciones pendientes que se sincroniza con Supabase
// cuando vuelve la conexión.

window.OfflineDB = {
  _db: null,
  _dbName: 'laaambapp_offline',
  _version: 1,

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._dbName, this._version);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Store para cada entidad principal
        ['animales','lotes','pesajes','eventos',
         'tratamientos','eventos_reproductivos',
         'sync_queue'  // cola de operaciones pendientes
        ].forEach(store => {
          if (!db.objectStoreNames.contains(store)) {
            const s = db.createObjectStore(store, { keyPath: 'id' });
            if (store === 'sync_queue') {
              s.createIndex('timestamp', 'timestamp');
            }
          }
        });
      };

      req.onsuccess = (e) => {
        this._db = e.target.result;
        console.log('[OfflineDB] IndexedDB lista');
        resolve(this._db);
      };

      req.onerror = () => reject(req.error);
    });
  },

  // Guardar datos en IndexedDB (cache local)
  async guardar(store, datos) {
    if (!this._db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      const items = Array.isArray(datos) ? datos : [datos];
      items.forEach(item => s.put(item));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  // Leer datos de IndexedDB
  async leer(store) {
    if (!this._db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  // Agregar operación a la cola de sync
  async encolar(operacion) {
    // operacion = { tabla, accion, datos, timestamp }
    const item = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...operacion,
      sincronizado: false
    };
    await this.guardar('sync_queue', item);
    console.log('[OfflineDB] Operación encolada:', operacion.accion, operacion.tabla);
    return item;
  },

  // Obtener cola pendiente de sync
  async getPendientes() {
    const todos = await this.leer('sync_queue');
    return todos.filter(o => !o.sincronizado);
  },

  // Marcar operación como sincronizada
  async marcarSincronizado(id) {
    if (!this._db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item) {
          item.sincronizado = true;
          store.put(item);
        }
        resolve(true);
      };
      tx.onerror = () => reject(tx.error);
    });
  },

  // Sincronizar cola pendiente con Supabase
  async sincronizar() {
    const pendientes = await this.getPendientes();
    if (!pendientes.length) return { sincronizados: 0 };

    console.log(`[OfflineDB] Sincronizando ${pendientes.length} operaciones...`);
    let ok = 0;

    for (const op of pendientes) {
      try {
        if (op.accion === 'insert' || op.accion === 'upsert') {
          const { error } = await window._sb
            .from(op.tabla)
            .upsert(op.datos);
          if (!error) {
            await this.marcarSincronizado(op.id);
            ok++;
          }
        } else if (op.accion === 'update') {
          const { error } = await window._sb
            .from(op.tabla)
            .update(op.datos)
            .eq('id', op.datos.id);
          if (!error) {
            await this.marcarSincronizado(op.id);
            ok++;
          }
        }
      } catch(e) {
        console.warn('[OfflineDB] Error sync:', op.tabla, e.message);
      }
    }

    console.log(`[OfflineDB] Sincronizados: ${ok}/${pendientes.length}`);
    return { sincronizados: ok, total: pendientes.length };
  },

  // Detectar conectividad y auto-sincronizar
  setupAutoSync() {
    // Sincronizar cuando vuelve la conexión
    window.addEventListener('online', async () => {
      console.log('[OfflineDB] Conexión restaurada — sincronizando...');
      const resultado = await this.sincronizar();
      if (resultado.sincronizados > 0) {
        // Notificar al usuario
        document.dispatchEvent(new CustomEvent('offline:sincronizado', {
          detail: resultado
        }));
      }
    });

    // Badge de pendientes en el sidebar
    document.addEventListener('offline:sincronizado', (e) => {
      console.log('[OfflineDB] Sync completo:', e.detail);
    });
  }
};
