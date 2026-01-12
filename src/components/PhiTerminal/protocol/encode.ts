export function b64urlEncodeBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function b64urlEncodeString(str: string): string {
  return b64urlEncodeBytes(new TextEncoder().encode(str));
}

export function b64urlDecodeToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
  return new TextDecoder().decode(bytes);
}

export function randomNonce(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return b64urlEncodeBytes(arr);
}
