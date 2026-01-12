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
import { usePhiUsd } from "../pricing/usePhiUsd";
import {
  formatUsdFromMicroPhi,
  microPhiFromPhiInput,
  microPhiFromUsdCents,
  phiInputFromMicroPhi,
  usdCentsFromUsdInput,
  type UnitMode,
} from "../pricing/amountModel";

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function shortKey(key: string) {
  if (!key) return "";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function trimTrailingZeros(input: string): string {
  if (!input.includes(".")) return input;
  return input.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function PortalView(props: {
  // Optional hook to your real presence verifier (FaceID / passkey)
  onVerifyOwnerPresence?: (purpose: "OPEN" | "CLOSE") => Promise<{ ok: boolean; proof?: unknown }>;
}) {
  const store = usePortalStore();
  const rate = usePhiUsd();

  const [scanOpen, setScanOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [primaryUnit, setPrimaryUnit] = useState<UnitMode>("phi");
  const [amountInput, setAmountInput] = useState("0");
  const [amountMicroPhi, setAmountMicroPhi] = useState(() => microPhiFromPhiInput("0").toString());
  const [memo, setMemo] = useState("");

  const [activeInvoiceUrl, setActiveInvoiceUrl] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const anchorTextRef = useRef<string | null>(null);

  const status = store.session?.meta.status ?? "LOCKED";
  const rateAvailable = Boolean(rate.usdPerPhi && rate.phiPerUsd);
  const microPhi = useMemo(() => BigInt(amountMicroPhi || "0"), [amountMicroPhi]);

  const amountPhi = useMemo(() => phiInputFromMicroPhi(microPhi), [microPhi]);
  const amountUsd = useMemo(() => formatUsdFromMicroPhi(microPhi, rate.usdPerPhi), [microPhi, rate.usdPerPhi]);

  const primaryDisplay = primaryUnit === "phi"
    ? `${amountPhi} Φ`
    : amountUsd
      ? `$${amountUsd}`
      : "—";

  const secondaryDisplay = primaryUnit === "phi"
    ? amountUsd ? `$${amountUsd}` : "—"
    : `${amountPhi} Φ`;

  const applyAmountInput = useCallback((nextValue: string, unit = primaryUnit) => {
    setAmountInput(nextValue);
    if (unit === "phi") {
      const micro = microPhiFromPhiInput(nextValue);
      setAmountMicroPhi(micro.toString());
      return;
    }
    const cents = usdCentsFromUsdInput(nextValue);
    const micro = microPhiFromUsdCents(cents, rate.usdPerPhi);
    if (micro != null) {
      setAmountMicroPhi(micro.toString());
    }
  }, [primaryUnit, rate.usdPerPhi]);

  React.useEffect(() => {
    if (primaryUnit !== "usd") return;
    if (!rate.usdPerPhi) return;
    const cents = usdCentsFromUsdInput(amountInput);
    const micro = microPhiFromUsdCents(cents, rate.usdPerPhi);
    if (micro != null) setAmountMicroPhi(micro.toString());
  }, [amountInput, primaryUnit, rate.usdPerPhi]);

  const tone = useMemo(() => {
    if (status === "OPEN") return "ok";
    if (status === "ARMED") return "aqua";
    if (status === "CLOSED") return "neutral";
    return "neutral";
  }, [status]);

  const clearActiveInvoice = useCallback((note?: string) => {
    setActiveInvoiceUrl(null);
    setActiveInvoiceId(null);
    setQrOpen(false);
    if (note) setMsg(note);
  }, []);

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
    setMsg("Portal OPEN.");
  }, [props.onVerifyOwnerPresence, store]);

  const armFromGlyph = useCallback(async (file: File) => {
    try {
      const { session, anchorText } = await createArmedPortalSessionFromGlyph(file);
      anchorTextRef.current = anchorText;
      await PortalDB.clearAll();
      await PortalDB.putSession(session);
      await store.refresh();
      setMsg("Merchant glyph loaded. Ready to open.");
    } catch (err) {
      setMsg((err as Error)?.message ?? "Failed to load merchant glyph.");
    }
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
      if (settlement.invoiceId === activeInvoiceId) {
        clearActiveInvoice();
      }
    }

    setMsg(res.note);
    await store.refresh();
  }, [activeInvoiceId, clearActiveInvoice, store]);

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
  }, [store.session, ingestSettlement, ingestInvoice]);

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
    setQrOpen(true);
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

    clearActiveInvoice();

    setMsg("Portal CLOSED and Settlement Glyph minted.");
  }, [clearActiveInvoice, props.onVerifyOwnerPresence, store]);

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

  const handleToggleUnit = useCallback((next: UnitMode) => {
    if (next === primaryUnit) return;
    if (next === "usd" && !rateAvailable) return;
    setPrimaryUnit(next);
    const nextValue = next === "phi"
      ? phiInputFromMicroPhi(microPhi)
      : trimTrailingZeros(formatUsdFromMicroPhi(microPhi, rate.usdPerPhi) ?? amountInput);
    setAmountInput(nextValue);
  }, [amountInput, microPhi, primaryUnit, rate.usdPerPhi, rateAvailable]);

  const quickKeys = primaryUnit === "usd" ? ["5", "10", "25", "50", "100"] : ["9", "18", "36", "72", "144"];

  if (!store.session) {
    return (
      <div className="pt-portal pt-portalEmpty">
        <div className="pt-card">
          <div className="pt-cardInner pt-portalEmptyInner">
            <div className="pt-h1">Portal Register</div>
            <div className="pt-muted">Upload merchant glyph to arm a register.</div>
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
            {msg ? <div className="pt-muted">{msg}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  const recentReceipts = store.receipts.slice(0, 3);

  return (
    <div className="pt-portal">
      <header className="pt-portalHeader">
        <div className="pt-merchantBlock">
          <div className="pt-merchantLabel">{store.stats.merchantLabel || "Merchant"}</div>
          <div className="pt-merchantKey">{shortKey(store.stats.merchantPhiKey)}</div>
          <div className="pt-merchantMeta">{store.stats.receiveCount} receives • {store.stats.totalPhi} Φ</div>
        </div>
        <div className="pt-headerActions">
          <Pill tone={tone as any} text={status} />
          {status === "OPEN" ? (
            <button className="pt-btn bad pt-btnCompact" type="button" onClick={() => void closePortal()}>
              Close
            </button>
          ) : null}
          {status === "ARMED" ? (
            <button className="pt-btn ok pt-btnCompact" type="button" onClick={() => void openPortal()}>
              Open
            </button>
          ) : null}
          {status === "CLOSED" ? (
            <label className="pt-btn pt-btnCompact" style={{ cursor: "pointer" }}>
              New
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
          ) : null}
          <button className="pt-iconBtn" type="button" onClick={() => setDetailsOpen(true)} aria-label="Details">
            ⓘ
          </button>
        </div>
      </header>

      {status === "OPEN" ? (
        <div className="pt-portalMain">
          <section className="pt-portalLeft">
            <div className="pt-card pt-amountCard">
              <div className="pt-cardInner">
                <div className="pt-row">
                  <div className="pt-h1">Charge</div>
                  <div className="pt-unitToggle">
                    <button
                      type="button"
                      className={primaryUnit === "phi" ? "pt-unitBtn active" : "pt-unitBtn"}
                      onClick={() => handleToggleUnit("phi")}
                    >
                      Φ
                    </button>
                    <button
                      type="button"
                      className={primaryUnit === "usd" ? "pt-unitBtn active" : "pt-unitBtn"}
                      onClick={() => handleToggleUnit("usd")}
                      disabled={!rateAvailable}
                    >
                      $
                    </button>
                  </div>
                </div>
                <div className="pt-amountPrimary">{primaryDisplay}</div>
                <div className="pt-amountSecondary">{secondaryDisplay}</div>
                <div className="pt-rateLine">
                  Rate: {rateAvailable ? `$${(rate.usdPerPhi ?? 0).toFixed(4)} / Φ` : "—"}
                  <span className={`pt-rateStatus ${rate.status}`}>{rate.status}</span>
                </div>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Memo"
                  className="pt-input"
                />
              </div>
            </div>

            <AmountPad
              value={amountInput}
              mode={primaryUnit}
              onChange={applyAmountInput}
              quick={quickKeys}
            />

            <div className="pt-actionRow">
              <button className="pt-btn primary" type="button" onClick={() => void createSessionInvoice()}>
                Create QR
              </button>
              <button className="pt-btn" type="button" onClick={() => setScanOpen(true)}>
                Ingest
              </button>
            </div>
          </section>

          <section className="pt-portalRight">
            <div className="pt-card pt-qrPanel">
              <div className="pt-cardInner">
                {activeInvoiceUrl ? (
                  <div className="pt-qrReady">
                    <div className="pt-qrReadyTitle">
                      {activeInvoiceId ? `Invoice ${activeInvoiceId.slice(0, 6)}…` : "Invoice ready"}
                    </div>
                    <div className="pt-qrPlaceholder">QR appears only in the popover.</div>
                    <div className="pt-actionRow">
                      <button className="pt-btn" type="button" onClick={() => setQrOpen(true)}>
                        Open QR
                      </button>
                      <button className="pt-btn bad" type="button" onClick={() => clearActiveInvoice("Invoice cleared.")}>
                        Clear Invoice
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-qrPlaceholder">Create invoice to display QR</div>
                )}
              </div>
            </div>

            <div className="pt-recent">
              <div className="pt-h1">Recent</div>
              <div className="pt-recentRow">
                {recentReceipts.length === 0 ? (
                  <div className="pt-muted">No receipts yet.</div>
                ) : recentReceipts.map((r) => (
                  <div className="pt-receiptChip" key={r.settlementId}>
                    <div className="pt-receiptAmount">{r.amountPhi} Φ</div>
                    <div className="pt-receiptMeta">{r.fromPhiKey.slice(0, 6)}…</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="pt-portalMain pt-portalLocked">
          <div className="pt-card">
            <div className="pt-cardInner pt-portalEmptyInner">
              <div className="pt-h1">Portal Register</div>
              <div className="pt-muted">Upload → Open → Receive → Close → Mint one settlement glyph.</div>
              {status === "ARMED" ? (
                <button className="pt-btn ok" type="button" onClick={() => void openPortal()}>
                  Verify & Open
                </button>
              ) : null}
              {status === "CLOSED" ? (
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
              ) : null}
            </div>
          </div>
        </div>
      )}

      {msg ? <div className="pt-statusMessage">{msg}</div> : null}

      {detailsOpen ? (
        <div className="pt-modalOverlay" role="dialog" aria-modal="true">
          <div className="pt-modal">
            <div className="pt-modalHeader">
              <div className="pt-modalTitle">Details</div>
              <button className="pt-iconBtn" type="button" onClick={() => setDetailsOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="pt-detailGrid">
              <div className="pt-k">Portal ID</div>
              <div className="pt-v">{store.stats.portalId}</div>
              <div className="pt-k">Root</div>
              <div className="pt-v">{store.stats.rollingRoot.slice(0, 18)}…</div>
              <div className="pt-k">Direct</div>
              <div className="pt-v">{store.stats.allowDirectReceives ? "On" : "Off"}</div>
            </div>
            <div className="pt-modalActions">
              <button className="pt-btn" type="button" onClick={() => void toggleDirect()}>
                Direct Receives: {store.stats.allowDirectReceives ? "ON" : "OFF"}
              </button>
              <button className="pt-btn" type="button" onClick={() => void downloadPatchedMerchantGlyph()}>
                Download Patched Glyph
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
              <button className="pt-btn" type="button" onClick={() => void PortalDB.clearAll().then(store.refresh)}>
                Reset Session
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ScanSheet
        open={scanOpen}
        title="Ingest Invoice / Receipt"
        onClose={() => setScanOpen(false)}
        onScannedText={async (text) => {
          await ingestTextOrUrl(text);
          setScanOpen(false);
        }}
      />

      {activeInvoiceUrl && qrOpen ? (
        <div className="pt-qrOverlay" role="dialog" aria-modal="true">
          <div className="pt-qrModal" onClick={(e) => e.stopPropagation()}>
            <div className="pt-qrModalHeader">
              <div className="pt-qrModalTitle">
                {activeInvoiceId ? `Invoice ${activeInvoiceId.slice(0, 6)}…` : "Invoice"}
              </div>
              <button
                type="button"
                className="pt-qrModalClose"
                aria-label="Close QR"
                onClick={() => setQrOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="pt-qrModalBody">
              <InvoiceQR value={activeInvoiceUrl} size={280} label="Scan to Pay" />
              <div className="pt-qrModalHint">Scan to pay • Closes automatically after receipt</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function safeJson(anchorText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(anchorText);
    if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
    return { raw: parsed };
  } catch {
    return { raw: anchorText };
  }
}
