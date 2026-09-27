const OLD = "site-builder";

function moveOldKeys() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${OLD}:`)) continue;
      const next = `fayteworks:${key.slice(OLD.length + 1)}`;
      if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key) ?? "");
      localStorage.removeItem(key);
    }
  } catch {
    return;
  }
}

moveOldKeys();

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function copyFromOld(db: IDBDatabase, name: string, store: string): Promise<void> {
  const oldName = `${OLD}-${name}`;
  const existing = (await indexedDB.databases?.()) ?? [];
  if (!existing.some((d) => d.name === oldName)) return;
  const old = await request(indexedDB.open(oldName));
  if (old.objectStoreNames.contains(store)) {
    const rows = await request(old.transaction(store).objectStore(store).getAll());
    const tx = db.transaction(store, "readwrite");
    for (const row of rows) tx.objectStore(store).put(row);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  old.close();
  indexedDB.deleteDatabase(oldName);
}

export function openDatabase(name: string, store: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let fresh = false;
    const req = indexedDB.open(`fayteworks-${name}`, 1);
    req.onupgradeneeded = () => {
      fresh = true;
      req.result.createObjectStore(store, { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!fresh) return resolve(db);
      copyFromOld(db, name, store).then(
        () => resolve(db),
        () => resolve(db)
      );
    };
    req.onerror = () => reject(req.error);
  });
}
