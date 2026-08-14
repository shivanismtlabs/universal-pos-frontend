/**
 * At-rest encryption for sensitive offline fields (Web Crypto AES-GCM).
 * Key is non-extractable, derived from tenant+device material after login.
 * IndexedDB itself is not file-encrypted in browsers; we encrypt PII / sale payloads.
 */
const KEY_STORE = "upos-offline-crypto-v1";

function bufToB64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function b64ToBuf(b64: string) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(material: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(material),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("universal-pos-offline-v1"),
      iterations: 120_000,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

let cachedKey: CryptoKey | null = null;
let cachedMaterial: string | null = null;

export async function unlockOfflineCrypto(opts: {
  tenantId: string;
  deviceId: string;
  userId: string;
}) {
  const material = `${opts.tenantId}:${opts.deviceId}:${opts.userId}:${KEY_STORE}`;
  if (cachedKey && cachedMaterial === material) return cachedKey;
  cachedKey = await deriveKey(material);
  cachedMaterial = material;
  return cachedKey;
}

export function lockOfflineCrypto() {
  cachedKey = null;
  cachedMaterial = null;
}

export async function encryptJson(
  value: unknown,
  key?: CryptoKey | null,
): Promise<string> {
  const k = key ?? cachedKey;
  if (!k) throw new Error("Offline crypto not unlocked");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, plain);
  return `${bufToB64(iv.buffer)}:${bufToB64(cipher)}`;
}

export async function decryptJson<T = unknown>(
  packed: string,
  key?: CryptoKey | null,
): Promise<T> {
  const k = key ?? cachedKey;
  if (!k) throw new Error("Offline crypto not unlocked");
  const [ivB64, dataB64] = packed.split(":");
  if (!ivB64 || !dataB64) throw new Error("Invalid cipher payload");
  const iv = new Uint8Array(b64ToBuf(ivB64));
  const data = b64ToBuf(dataB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, data);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export function isOfflineCryptoUnlocked() {
  return Boolean(cachedKey);
}
