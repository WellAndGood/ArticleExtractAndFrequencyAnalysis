export async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("AgentsDB", 1);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("agents")) {
        db.createObjectStore("agents", { keyPath: "id", autoIncrement: true });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function searchAgentsByName(query) {
  const db = await openDB();
  const tx = db.transaction("agents", "readonly");
  const store = tx.objectStore("agents");

  return new Promise((resolve) => {
    const results = [];
    const request = store.openCursor();

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const { name, type } = cursor.value;
        if (
          type !== 'alias' &&
          name.toLowerCase().includes(query.toLowerCase())
        ) {
          results.push(cursor.value);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
  });
}