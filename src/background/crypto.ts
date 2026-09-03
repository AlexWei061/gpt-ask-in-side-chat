const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface Ciphertext {
  iv: Uint8Array;
  bytes: ArrayBuffer;
}

export async function createHistoryKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptJson(value: unknown, key: CryptoKey): Promise<Ciphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const bytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv, bytes };
}

export async function decryptJson<T>(ciphertext: Ciphertext, key: CryptoKey): Promise<T> {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ciphertext.iv as Uint8Array<ArrayBuffer> }, key, ciphertext.bytes);
  return JSON.parse(decoder.decode(plaintext)) as T;
}
