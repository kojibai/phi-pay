export function parsePhiToMicro(phi: string): bigint {
  const s = phi.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return 0n;
  const [a, bRaw] = s.split(".");
  const b = (bRaw ?? "").slice(0, 6).padEnd(6, "0");
  const int = BigInt(a || "0");
  const dec = BigInt(b || "0");
  return int * 1_000_000n + dec;
}

export function microToPhiString(m: bigint): string {
  const neg = m < 0n;
  const v = neg ? -m : m;
  const int = v / 1_000_000n;
  const dec = v % 1_000_000n;

  const decStr = dec.toString().padStart(6, "0").replace(/0+$/g, "");
  const s = decStr.length ? `${int.toString()}.${decStr}` : int.toString();
  return neg ? `-${s}` : s;
}

export function addMicro(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}
