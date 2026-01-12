const MICRO_PHI_SCALE = 1_000_000n;
const USD_CENTS_SCALE = 100n;
const USD_RATE_SCALE = 1_000_000n;
const USD_RATE_DENOM = 1_000_000_000_000n;

export type UnitMode = "phi" | "usd";

export function normalizeNumericInput(raw: string, decimals: number): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  const int = (parts[0] ?? "").replace(/^0+(?=\d)/, "");
  const dec = (parts[1] ?? "").slice(0, decimals);
  return parts.length > 1 ? `${int || "0"}.${dec}` : (int || "0");
}

export function normalizePhiInput(raw: string): string {
  return normalizeNumericInput(raw, 6);
}

export function normalizeUsdInput(raw: string): string {
  return normalizeNumericInput(raw, 2);
}

export function microPhiFromPhiInput(raw: string): bigint {
  const s = normalizePhiInput(raw).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return 0n;
  const [a, bRaw] = s.split(".");
  const b = (bRaw ?? "").slice(0, 6).padEnd(6, "0");
  return BigInt(a || "0") * MICRO_PHI_SCALE + BigInt(b || "0");
}

export function phiInputFromMicroPhi(microPhi: bigint): string {
  const neg = microPhi < 0n;
  const value = neg ? -microPhi : microPhi;
  const int = value / MICRO_PHI_SCALE;
  const dec = value % MICRO_PHI_SCALE;
  const decStr = dec.toString().padStart(6, "0").replace(/0+$/g, "");
  const out = decStr.length ? `${int.toString()}.${decStr}` : int.toString();
  return neg ? `-${out}` : out;
}

export function usdCentsFromUsdInput(raw: string): bigint {
  const s = normalizeUsdInput(raw).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return 0n;
  const [a, bRaw] = s.split(".");
  const b = (bRaw ?? "").slice(0, 2).padEnd(2, "0");
  return BigInt(a || "0") * USD_CENTS_SCALE + BigInt(b || "0");
}

export function usdInputFromCents(cents: bigint): string {
  const neg = cents < 0n;
  const value = neg ? -cents : cents;
  const int = value / USD_CENTS_SCALE;
  const dec = value % USD_CENTS_SCALE;
  const out = `${int.toString()}.${dec.toString().padStart(2, "0")}`;
  return neg ? `-${out}` : out;
}

export function usdCentsFromMicroPhi(microPhi: bigint, usdPerPhi: number | null): bigint | null {
  if (!Number.isFinite(usdPerPhi) || usdPerPhi == null || usdPerPhi <= 0) return null;
  const scaled = BigInt(Math.round(usdPerPhi * Number(USD_RATE_SCALE)));
  if (scaled <= 0n) return null;
  const numerator = microPhi * scaled * USD_CENTS_SCALE;
  const rounded = numerator + USD_RATE_DENOM / 2n;
  return rounded / USD_RATE_DENOM;
}

export function microPhiFromUsdCents(usdCents: bigint, usdPerPhi: number | null): bigint | null {
  if (!Number.isFinite(usdPerPhi) || usdPerPhi == null || usdPerPhi <= 0) return null;
  const scaled = BigInt(Math.round(usdPerPhi * Number(USD_RATE_SCALE)));
  if (scaled <= 0n) return null;
  const numerator = usdCents * MICRO_PHI_SCALE * USD_RATE_SCALE;
  const denom = USD_CENTS_SCALE * scaled;
  const rounded = numerator + denom / 2n;
  return rounded / denom;
}

export function formatUsdFromMicroPhi(microPhi: bigint, usdPerPhi: number | null): string | null {
  const cents = usdCentsFromMicroPhi(microPhi, usdPerPhi);
  if (cents == null) return null;
  return usdInputFromCents(cents);
}
