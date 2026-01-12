import { sha256Hex } from "../crypto/sha256";
import type { PhiPortalMetaV1, PhiPortalSessionV1 } from "./portalTypes";
import { microToPhiString } from "./phiMath";

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function extractPhiKeyFromUnknown(u: unknown): string | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;

  // Common fields in your ecosystem
  const direct = o["phiKey"] ?? o["userPhiKey"] ?? o["merchantPhiKey"];
  if (typeof direct === "string" && direct.length > 10) return direct;

  // Sometimes nested in proofCapsule
  const pc = o["proofCapsule"];
  if (pc && typeof pc === "object") {
    const pco = pc as Record<string, unknown>;
    const pk = pco["phiKey"];
    if (typeof pk === "string" && pk.length > 10) return pk;
  }

  return null;
}

function extractLabelFromUnknown(u: unknown): string | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const label = o["merchantLabel"] ?? o["label"] ?? o["name"];
  return typeof label === "string" ? label : null;
}

function tryParseSvgMetadata(svgText: string): unknown | null {
  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svg = doc.querySelector("svg");
    const attrPhiKey =
      svg?.getAttribute("data-phi-key") ??
      svg?.getAttribute("data-merchant-phi-key") ??
      svg?.getAttribute("data-user-phi-key") ??
      svg?.getAttribute("data-phiKey");
    if (attrPhiKey && attrPhiKey.length > 10) {
      return { phiKey: attrPhiKey };
    }

    const metas = Array.from(doc.querySelectorAll("metadata"));
    for (const meta of metas) {
      const raw = meta.textContent?.trim();
      if (!raw) continue;
      const cdataMatch = raw.match(/^<!\[CDATA\[(.*)\]\]>$/s);
      const txt = cdataMatch ? cdataMatch[1].trim() : raw;
      const parsed = safeParseJson(txt);
      if (parsed && extractPhiKeyFromUnknown(parsed)) {
        return parsed;
      }
    }
  } catch {
    return null;
  }

  const attrMatch = svgText.match(/data-phi-key=["']([^"']+)["']/i);
  if (attrMatch && attrMatch[1]?.length > 10) {
    return { phiKey: attrMatch[1] };
  }

  const jsonMatches = svgText.matchAll(/<!\[CDATA\[(\{[\s\S]*?\})\]\]>/g);
  for (const match of jsonMatches) {
    const parsed = safeParseJson(match[1]);
    if (parsed && extractPhiKeyFromUnknown(parsed)) {
      return parsed;
    }
  }

  return null;
}

export async function createArmedPortalSessionFromGlyph(file: File): Promise<{
  session: PhiPortalSessionV1;
  anchorText: string;
}> {
  const anchorText = await file.text();
  const anchorHash = await sha256Hex(anchorText);

  let payload: unknown | null = null;
  let anchorKind: "svg" | "json" = "json";

  if (file.name.toLowerCase().endsWith(".svg") || file.type === "image/svg+xml") {
    anchorKind = "svg";
    payload = tryParseSvgMetadata(anchorText);
  } else {
    payload = safeParseJson(anchorText);
  }

  const merchantPhiKey = extractPhiKeyFromUnknown(payload) ?? "";
  if (!merchantPhiKey) throw new Error("Could not extract phiKey from merchant glyph metadata.");

  const merchantLabel = extractLabelFromUnknown(payload) ?? file.name.replace(/\.(svg|json)$/i, "");

  const portalHeader = {
    merchantPhiKey,
    merchantLabel,
    anchorHash,
    anchorName: file.name,
    anchorKind,
  };

  const portalId = await sha256Hex(JSON.stringify(portalHeader));

  const meta: PhiPortalMetaV1 = Object.freeze({
    v: "PHI-PORTAL-1",
    canon: "JCS",
    hashAlg: "sha256",

    portalId,

    merchantPhiKey,
    merchantLabel,

    status: "ARMED",
    openedAtMs: Date.now(),
    receiveCount: 0,
    totalMicroPhi: "0",
    totalPhi: microToPhiString(0n),

    rollingRoot: await sha256Hex("PHI_PORTAL_ROOT_0"),
    allowDirectReceives: false,

    anchorName: file.name,
    anchorHash,
    anchorKind,
  });

  const session: PhiPortalSessionV1 = Object.freeze({
    v: "PHI-PORTAL-SESSION-1",
    meta,
    invoices: [],
  });

  return { session, anchorText };
}
