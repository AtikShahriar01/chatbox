"use client";

// Image blob store on IndexedDB — data URLs no longer live inside the zustand
// localStorage state (~5MB quota; a few attached images used to silently stop
// ALL chat-history persistence). Messages hold small references instead:
//   "idb:<id>"  → resolve through getImage()
// Content-addressed ids (hash of the data URL) dedupe re-attached images.
// Fallback: if IndexedDB is unavailable (private mode), callers keep data URLs
// inline — everything degrades to the old behaviour.

const DB_NAME = "chatbox-images";
const STORE = "images";
const MEM = new Map(); // id → dataURL (hot cache)

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

// Stable short id for a data URL (FNV-1a over length + sampled chars — fast,
// collision-safe enough for a single device's image cache).
function idFor(dataUrl) {
  let h = 0x811c9dc5;
  const s = String(dataUrl);
  const step = Math.max(1, Math.floor(s.length / 512));
  for (let i = 0; i < s.length; i += step) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return "img_" + h.toString(36) + "_" + (s.length % 99991).toString(36);
}

// Store a data URL → returns a reference token ("idb:<id>"), or the original
// data URL when IndexedDB is unavailable.
export async function storeImage(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return dataUrl;
  const id = idFor(dataUrl);
  MEM.set(id, dataUrl);
  try {
    const db = await openDb();
    if (!db) return dataUrl;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(dataUrl, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return "idb:" + id;
  } catch {
    return dataUrl; // inline fallback
  }
}

// Resolve a reference (or pass through plain data URLs). Returns null when the
// blob is missing from the store (e.g. IndexedDB cleared) — callers show a
// placeholder.
export async function getImage(ref) {
  if (typeof ref !== "string") return ref;
  if (!ref.startsWith("idb:")) return ref;
  const id = ref.slice(4);
  if (MEM.has(id)) return MEM.get(id);
  try {
    const db = await openDb();
    if (!db) return null;
    const out = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const rq = tx.objectStore(STORE).get(id);
      rq.onsuccess = () => resolve(rq.result || null);
      rq.onerror = () => reject(rq.error);
    });
    if (out) MEM.set(id, out);
    return out;
  } catch {
    return null;
  }
}

// Migrate every inline data URL inside the persisted store to idb references.
// Idempotent: references and plain strings pass through untouched. Runs once
// after rehydration; best-effort (falls back to inline on any failure).
export async function migrateStoreImages(useStore) {
  try {
    const db = await openDb();
    if (!db) return 0;
    const state = useStore.getState();
    let moved = 0;
    const chats = await Promise.all(
      (state.chats || []).map(async (c) => {
        let changed = false;
        const messages = await Promise.all(
          (c.messages || []).map(async (m) => {
            if (!Array.isArray(m.images) || !m.images.some((x) => typeof x === "string" && x.startsWith("data:"))) return m;
            const images = await Promise.all(
              m.images.map(async (x) => {
                if (typeof x === "string" && x.startsWith("data:")) {
                  moved++;
                  return storeImage(x);
                }
                return x;
              })
            );
            changed = true;
            return { ...m, images };
          })
        );
        return changed ? { ...c, messages } : c;
      })
    );
    if (moved > 0) useStore.setState({ chats });
    return moved;
  } catch {
    return 0;
  }
}
