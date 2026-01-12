function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function jcsCanonicalize(value: unknown): string {
  // Minimal deterministic JSON canonicalization:
  // - objects: lexicographic key order
  // - arrays: order preserved
  // - no extra whitespace
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number not allowed");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcsCanonicalize).join(",")}]`;
  if (isObj(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${jcsCanonicalize(value[k])}`).join(",")}}`;
  }
  throw new Error(`Unsupported type in JCS: ${typeof value}`);
}
