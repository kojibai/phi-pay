import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pill } from "../ui/Pill";
import { AmountPad } from "../ui/AmountPad";
import { InvoiceQR } from "../ui/InvoiceQR";
import { ScanSheet } from "../ui/ScanSheet";
import { createInvoice } from "../protocol/invoice";
import { b64urlEncodeString } from "../protocol/encode";
import { decodePayloadFromText, decodePayloadFromFile } from "../transport/ingestTransport";
import { listenLocalChannel } from "../transport/broadcastChannelTransport";
import type { PhiInvoiceV1, PhiSettlementV1 } from "../protocol/types";
import { PortalDB } from "../storage/portalDB";
import { createArmedPortalSessionFromGlyph } from "../portal/portalOpen";
import { appendSettlementToSession } from "../portal/portalAppend";
import { closePortalSession } from "../portal/portalClose";
import { buildPortalSettlementSvg, patchAnchorSvgWithPortalMeta } from "../portal/portalExport";
import { usePortalStore } from "../hooks/usePortalStore";

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PortalView(props: {
  // Optional hook to your real presence verifier (FaceID / passkey)
  onVerifyOwnerPresence?: (purpose: "OPEN" | "CLOSE") => Promise<{ ok: boolean; proof?: unknown }>;
}) {
  const store = usePortalStore();

  const [scanOpen, setScanOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [amountPhi, setAmountPhi] = useState("144");
  const [memo, setMemo] = useState("");

  const [activeInvoiceUrl, setActiveInvoiceUrl] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);

  const anchorTextRef = useRef<string | null>(null);

  const status = store.session?.meta.status ?? "LOCKED";

  // Local broadcast ingest (optional, but great for multi-tab / companion-wallet flows)
  React.useEffect(() => {
    const off = listenLocalChannel(async (p) => {
      // Only ingest if portal open
      if (!store.session) return;
      if ((p as any)?.v === "PHI-SETTLEMENT-1") {
        await ingestSettlement(p as PhiSettlementV1);
      }
      if ((p as any)?.v === "PHI-INVOICE-1") {
        await ingestInvoice(p as PhiInvoiceV1);
      }
    });
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.session]);

  const tone = useMemo(() => {
    if (status === "OPEN") return "ok";
    if (status === "ARMED") return "aqua";
    if (status === "CLOSED") return "neutral";
    return "neutral";
  }, [status]);

  const openPortal = useCallback(async () => {
    if (!store.session) return;

    const verifier = props.onVerifyOwnerPresence;
    if (verifier) {
      const res = await verifier("OPEN");
      if (!res.ok) {
        setMsg("Owner presence failed. Portal not opened.");
        return;
      }
      // (If you want to store open-proof, add it to meta here.)
    }

    const next = Object.freeze({
      ...store.session,
      meta: Object.freeze({
        ...store.session.meta,
        status: "OPEN" as const,
      }),
    });

    await PortalDB.putSession(next);
    await store.refresh();
    setMsg("✅ Portal OPEN.");
  }, [props.onVerifyOwnerPresence, store]);

  const armFromGlyph = useCallback(async (file: File) => {
    const { session, anchorText } = await createArmedPortalSessionFromGlyph(file);
    anchorTextRef.current = anchorText;
    await PortalDB.clearAll();
    await PortalDB.putSession(session);
    await store.refresh();
    setMsg("Merchant glyph loaded. Ready to open.");
  }, [store]);

  const ingestInvoice = useCallback(async (invoice: PhiInvoiceV1) => {
    await PortalDB.putInvoice(invoice, "OPEN");
    setMsg("Invoice imported.");
  }, []);

  const ingestSettlement = useCallback(async (settlement: PhiSettlementV1) => {
    if (!store.session) {
      setMsg("No active portal session.");
      return;
    }
    if (store.session.meta.status !== "OPEN") {
      setMsg("Portal not open. Open the register to accept receipts.");
      return;
    }

    // Dedup
    const exists = await PortalDB.hasReceipt(settlement.settlementId);
    if (exists) {
      setMsg("Receipt already recorded.");
      return;
    }

    const openInvoices = await PortalDB.getOpenInvoices();
    const res = await appendSettlementToSession({
      session: store.session,
      settlement,
      openInvoices,
      allowDirectReceives: store.session.meta.allowDirectReceives,
    });

    if (!res.accepted || !res.receiptRow) {
      setMsg(res.note);
      return;
    }

    await PortalDB.putReceipt(res.receiptRow);
    await PortalDB.putSession(res.updatedSession);

    if (res.matchedInvoice && settlement.invoiceId) {
      await PortalDB.setInvoiceStatus(settlement.invoiceId, "SETTLED");
    }

    setMsg(res.note);
    await store.refresh();
  }, [store]);

  const ingestTextOrUrl = useCallback(async (text: string) => {
    const payload = await decodePayloadFromText(text);
    if (!payload) {
      setMsg("Could not parse payload.");
      return;
    }
    if ((payload as any).v === "PHI-INVOICE-1") {
      await ingestInvoice(payload as PhiInvoiceV1);
      return;
    }
    if ((payload as any).v === "PHI-SETTLEMENT-1") {
      await ingestSettlement(payload as PhiSettlementV1);
      return;
    }
    setMsg("Unknown payload type.");
  }, [ingestInvoice, ingestSettlement]);

  const ingestFile = useCallback(async (file: File) => {
    const payload = await decodePayloadFromFile(file);
    if (!payload) {
      setMsg("Could not parse file.");
      return;
    }
    if ((payload as any).v === "PHI-INVOICE-1") {
      await ingestInvoice(payload as PhiInvoiceV1);
      return;
    }
    if ((payload as any).v === "PHI-SETTLEMENT-1") {
      await ingestSettlement(payload as PhiSettlementV1);
      return;
    }
    setMsg("Unknown file payload type.");
  }, [ingestInvoice, ingestSettlement]);

  const createSessionInvoice = useCallback(async () => {
    if (!store.session) return;
    if (store.session.meta.status !== "OPEN") {
      setMsg("Open the portal first.");
      return;
    }

    const inv = await createInvoice({
      merchantPhiKey: store.session.meta.merchantPhiKey,
      merchantLabel: store.session.meta.merchantLabel,
      amountPhi,
      memo: memo.trim() || undefined,
      createdPulse: 0,
    });

    await PortalDB.putInvoice(inv, "OPEN");

    const r = b64urlEncodeString(JSON.stringify(inv));
    const url = `${window.location.origin}${window.location.pathname}?r=${r}`;

    setActiveInvoiceId(inv.invoiceId);
    setActiveInvoiceUrl(url);
    setMsg("Invoice created.");
  }, [amountPhi, memo, store.session]);

  const closePortal = useCallback(async () => {
    if (!store.session) return;
    if (store.session.meta.status !== "OPEN") return;

    const verifier = props.onVerifyOwnerPresence;
    let ownerCloseProof: unknown | undefined;

    if (verifier) {
      const res = await verifier("CLOSE");
      if (!res.ok) {
        setMsg("Owner presence failed. Portal not closed.");
        return;
      }
      ownerCloseProof = res.proof;
    }

    const receipts = await PortalDB.listReceipts(20000);
    const settlementObj = closePortalSession({
      session: store.session,
      receipts,
      ownerCloseProof,
    });

    const svg = buildPortalSettlementSvg(settlementObj);
    const fileName = `phi-portal-settlement-${settlementObj.portalId.slice(0, 10)}.svg`;
    downloadText(fileName, svg, "image/svg+xml");

    // Mark CLOSED in session meta (persist lock until owner re-arms)
    const closedSession = Object.freeze({
      ...store.session,
      meta: Object.freeze({
        ...store.session.meta,
        status: "CLOSED" as const,
        closedAtMs: settlementObj.closedAtMs,
      }),
    });

    await PortalDB.putSession(closedSession);
    await store.refresh();

    setActiveInvoiceUrl(null);
    setActiveInvoiceId(null);

    setMsg("✅ Portal CLOSED and Settlement Glyph minted.");
  }, [props.onVerifyOwnerPresence, store]);

  const downloadPatchedMerchantGlyph = useCallback(async () => {
    if (!store.session) return;
    const meta = store.session.meta;

    const anchor = anchorTextRef.current;
    if (!anchor) {
      setMsg("No anchor glyph text in memory (reload loses original text). Re-upload merchant glyph to patch.");
      return;
    }

    if (meta.anchorKind === "svg") {
      const patched = patchAnchorSvgWithPortalMeta(anchor, meta);
      downloadText(`merchant-glyph-patched-${meta.portalId.slice(0, 10)}.svg`, patched, "image/svg+xml");
      setMsg("Patched merchant glyph downloaded.");
    } else {
      const patchedJson = JSON.stringify({ ...safeJson(anchor), portalMeta: meta }, null, 2);
      downloadText(`merchant-glyph-patched-${meta.portalId.slice(0, 10)}.json`, patchedJson, "application/json");
      setMsg("Patched merchant JSON downloaded.");
    }
  }, [store.session]);

  const toggleDirect = useCallback(async () => {
    if (!store.session) return;
    const next = Object.freeze({
      ...store.session,
      meta: Object.freeze({
        ...store.session.meta,
        allowDirectReceives: !store.session.meta.allowDirectReceives,
      }),
    });
    await PortalDB.putSession(next);
    await store.refresh();
  }, [store]);

  if (!store.session) {
    return (
      <div className="pt-card pt-scroll">
        <div className="pt-cardInner">
          <div className="pt-h1">Portal</div>
          <div className="pt-muted" style={{ marginTop: 6 }}>
            Drop your Merchant Glyph to arm a register session. This portal stays open until the owner closes it.
          </div>

          <div className="pt-divider" />

          <label className="pt-btn primary" style={{ cursor: "pointer" }}>
            Upload Merchant Glyph
            <input
              type="file"
              accept=".svg,.json,application/json,image/svg+xml"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) void armFromGlyph(f);
                e.currentTarget.value = "";
              }}
            />
          </label>

          {msg ? <div className="pt-muted" style={{ marginTop: 10 }}>{msg}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-split">
      <div className="pt-card pt-scroll">
        <div className="pt-cardInner">
          <div className="pt-row">
            <div>
              <div className="pt-h1">Portal Register</div>
              <div className="pt-muted" style={{ marginTop: 6 }}>
                Upload → Open → Receive → Close → Mint one Settlement Glyph file.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Pill tone={tone as any} text={status} />
              {status === "OPEN" ? (
                <button className="pt-btn bad" type="button" onClick={() => void closePortal()}>
                  Close Register
                </button>
              ) : null}
            </div>
          </div>

          <div className="pt-divider" />

          <div className="pt-kv">
            <div className="pt-k">Merchant</div>
            <div className="pt-v">{store.stats.merchantLabel || "Merchant"} • {store.stats.merchantPhiKey.slice(0, 10)}…</div>

            <div className="pt-k">Receives</div>
            <div className="pt-v">{store.stats.receiveCount}</div>

            <div className="pt-k">Total</div>
            <div className="pt-v">{store.stats.totalPhi} Φ</div>

            <div className="pt-k">Root</div>
            <div className="pt-v">{store.stats.rollingRoot.slice(0, 20)}…</div>
          </div>

          <div className="pt-divider" />

          {status === "ARMED" ? (
            <div className="pt-actions">
              <button className="pt-btn ok" type="button" onClick={() => void openPortal()}>
                Verify & Open Register
              </button>
              <button className="pt-btn" type="button" onClick={() => void PortalDB.clearAll().then(store.refresh)}>
                Reset
              </button>
            </div>
          ) : null}

          {status === "OPEN" ? (
            <>
              <div className="pt-h1" style={{ marginTop: 4 }}>Charge (Invoice)</div>
              <div className="pt-amount">{amountPhi} Φ</div>

              <div className="pt-row" style={{ marginTop: 10 }}>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Memo (optional)"
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(242,255,252,0.92)",
                    padding: "12px 12px",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>

              <AmountPad valuePhi={amountPhi} onChange={setAmountPhi} />

              <div className="pt-actions">
                <button className="pt-btn primary" type="button" onClick={() => void createSessionInvoice()}>
                  Create Invoice QR
                </button>

                <button className="pt-btn" type="button" onClick={() => setScanOpen(true)}>
                  Ingest Receipt
                </button>

                <label className="pt-btn" style={{ cursor: "pointer" }}>
                  Import File
                  <input
                    type="file"
                    accept=".json,.svg,application/json,image/svg+xml"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f) void ingestFile(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="pt-actions" style={{ marginTop: 6 }}>
                <button className="pt-btn" type="button" onClick={() => void toggleDirect()}>
                  Direct Receives: {store.stats.allowDirectReceives ? "ON" : "OFF"}
                </button>
                <button className="pt-btn" type="button" onClick={() => void downloadPatchedMerchantGlyph()}>
                  Download Patched Merchant Glyph
                </button>
              </div>

              {activeInvoiceUrl ? (
                <div className="pt-qrBox" style={{ marginTop: 12 }}>
                  <InvoiceQR value={activeInvoiceUrl} label={activeInvoiceId ? `Invoice • ${activeInvoiceId.slice(0, 10)}…` : "Invoice"} />
                </div>
              ) : null}
            </>
          ) : null}

          {status === "CLOSED" ? (
            <div className="pt-actions">
              <label className="pt-btn primary" style={{ cursor: "pointer" }}>
                Upload Merchant Glyph (New Session)
                <input
                  type="file"
                  accept=".svg,.json,application/json,image/svg+xml"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f) void armFromGlyph(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          ) : null}

          {msg ? <div className="pt-muted" style={{ marginTop: 10 }}>{msg}</div> : null}
        </div>
      </div>

      <div className="pt-card pt-scroll">
        <div className="pt-cardInner">
          <div className="pt-h1">Session Receipts</div>
          <div className="pt-muted" style={{ marginTop: 6 }}>
            These are stored offline during the open portal, then sealed into one Settlement Glyph on close.
          </div>

          <div className="pt-divider" />

          <div className="pt-list">
            {store.receipts.slice(0, 40).map((r) => (
              <div className="pt-item" key={r.settlementId}>
                <div className="pt-itemTop">
                  <div>
                    <div className="pt-itemTitle">{r.amountPhi} Φ</div>
                    <div className="pt-itemSub">
                      From {r.fromPhiKey.slice(0, 10)}… • {r.settlementId.slice(0, 10)}…
                    </div>
                  </div>
                  <Pill tone={r.matchedInvoice ? "ok" : "warn"} text={r.matchedInvoice ? "Matched" : "Direct"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ScanSheet
        open={scanOpen}
        title="Ingest Invoice / Receipt"
        onClose={() => setScanOpen(false)}
        onScannedText={async (text) => {
          await ingestTextOrUrl(text);
          setScanOpen(false);
        }}
      />
    </div>
  );
}

function safeJson(anchorText: string): unknown {
  try { return JSON.parse(anchorText); } catch { return { raw: anchorText }; }
}
