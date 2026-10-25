/**
 * Save codes: everything this phone remembers (runs, the Daily Page, the scriptorium, settings),
 * packed into text you can paste on another phone. No account, no server.
 */
import { storage } from './storage';

const KEYS = [
  'cagebreakers.run', 'cagebreakers.daily', 'cagebreakers.daily.best', 'cagebreakers.slot', 'cagebreakers.meta', 'cagebreakers.meta.last',
  'cagebreakers.settings', 'cagebreakers.prefs', 'cagebreakers.coach', 'cagebreakers.m1.page',
];
const PREFIX = 'CB1';

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (text: string) => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function exportCode(): Promise<string> {
  const data: Record<string, string> = {};
  for (const k of KEYS) { const v = storage.get(k); if (v) data[k] = v; }
  const bytes = new TextEncoder().encode(JSON.stringify({ app: 'cagebreakers', data }));
  if (typeof CompressionStream === 'function') return `${PREFIX}Z${toB64(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
  return `${PREFIX}J${toB64(bytes)}`;
}

/** Restores a save code. Returns why it couldn't, or null on success. */
export async function importCode(code: string): Promise<string | null> {
  const text = code.replace(/\s+/g, '');
  if (!text.startsWith(PREFIX)) return "That doesn't look like a Cagebreakers save code.";
  try {
    let bytes: Uint8Array = fromB64(text.slice(PREFIX.length + 1));
    if (text[PREFIX.length] === 'Z') {
      if (typeof DecompressionStream !== 'function') return "This phone's browser can't open that code. Update it and try again.";
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { app?: string; data?: Record<string, string> };
    if (parsed.app !== 'cagebreakers' || !parsed.data) return "That doesn't look like a Cagebreakers save code.";
    for (const k of KEYS) storage.remove(k);
    for (const [k, v] of Object.entries(parsed.data)) if (KEYS.includes(k)) storage.set(k, v);
    return null;
  } catch {
    return 'That code is incomplete. Copy the whole code and try again.';
  }
}
