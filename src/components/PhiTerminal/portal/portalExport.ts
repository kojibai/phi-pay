import type { PhiPortalMetaV1, PhiPortalSettlementV1 } from "./portalTypes";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function wrapMetadataSvg(metaJson: unknown, title: string): string {
  const meta = escapeXml(JSON.stringify(metaJson));
  const t = escapeXml(title);

  // Minimal but “terminal-seal” looking SVG.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <metadata>${meta}</metadata>
  <defs>
    <radialGradient id="g" cx="30%" cy="25%" r="70%">
      <stop offset="0%" stop-color="rgba(55,255,228,0.85)"/>
      <stop offset="55%" stop-color="rgba(55,255,228,0.10)"/>
      <stop offset="100%" stop-color="rgba(10,18,22,1)"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="rgba(10,18,22,1)"/>
  <circle cx="512" cy="512" r="420" fill="url(#g)" opacity="0.9"/>
  <circle cx="512" cy="512" r="420" fill="none" stroke="rgba(55,255,228,0.35)" stroke-width="6"/>
  <circle cx="512" cy="512" r="330" fill="none" stroke="rgba(255,231,160,0.18)" stroke-width="4"/>
  <text x="512" y="520" text-anchor="middle" font-size="210" font-family="system-ui, -apple-system, Segoe UI, Roboto" fill="rgba(242,255,252,0.92)" font-weight="900">Φ</text>
  <text x="512" y="610" text-anchor="middle" font-size="28" font-family="system-ui, -apple-system, Segoe UI, Roboto" fill="rgba(242,255,252,0.72)" font-weight="800" letter-spacing="2">${t}</text>
</svg>`;
}

export function buildPortalSettlementSvg(settlement: PhiPortalSettlementV1): string {
  const title = `Φ PORTAL SETTLEMENT • ${settlement.portalId.slice(0, 10)}…`;
  return wrapMetadataSvg(settlement, title);
}

export function patchAnchorSvgWithPortalMeta(anchorSvgText: string, portalMeta: PhiPortalMetaV1): string {
  // Replace existing <metadata> if present; else inject.
  const metaJson = JSON.stringify(portalMeta);
  const metaEsc = metaJson.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  if (/<metadata>[\s\S]*?<\/metadata>/.test(anchorSvgText)) {
    return anchorSvgText.replace(/<metadata>[\s\S]*?<\/metadata>/, `<metadata>${metaEsc}</metadata>`);
  }

  // Insert right after <svg ...>
  const m = anchorSvgText.match(/<svg[^>]*>/);
  if (!m) return anchorSvgText;

  const idx = anchorSvgText.indexOf(m[0]) + m[0].length;
  return `${anchorSvgText.slice(0, idx)}\n  <metadata>${metaEsc}</metadata>\n${anchorSvgText.slice(idx)}`;
}
