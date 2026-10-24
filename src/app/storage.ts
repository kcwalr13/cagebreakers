/**
 * Key-value storage behind one small interface, so an app-store wrapper can swap in native
 * storage later without touching game code. Every call is guarded: private windows, cleared
 * site data and storage quotas must never break play.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const memory = new Map<string, string>();

export const storage: KeyValueStore = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch { return memory.get(key) ?? null; }
  },
  set(key, value) {
    memory.set(key, value);
    try { window.localStorage.setItem(key, value); } catch { /* memory copy keeps this session going */ }
  },
  remove(key) {
    memory.delete(key);
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

export function readJson<T>(key: string): T | null {
  const raw = storage.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function writeJson(key: string, value: unknown): void {
  storage.set(key, JSON.stringify(value));
}
