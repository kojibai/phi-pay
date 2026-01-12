import React, { useCallback, useState } from "react";
import { useTerminalStore } from "../hooks/useTerminalStore";
import { ScanSheet } from "../ui/ScanSheet";
import { decodePayloadFromText, decodePayloadFromFile, ingestPayload } from "../transport/ingestTransport";
import { Pill } from "../ui/Pill";
import { deriveSettlementFromSendSigilFileForInvoices, markSendSigilUsedFromMeta } from "../transport/sigilSettlement";
import { TerminalDB } from "../storage/terminalDB";

export function InboxView() {
  const store = useTerminalStore();
  const [scanOpen, setScanOpen] = useState(false);

  const ingestText = useCallback(async (text: string) => {
    const payload = await decodePayloadFromText(text);
    if (!payload) return;
    await ingestPayload(payload);
    await store.refresh();
  }, [store]);

  const ingestFile = useCallback(async (file: File) => {
    const payload = await decodePayloadFromFile(file);
    if (payload) {
      await ingestPayload(payload);
      await store.refresh();
      return;
    }

    const openInvoices = await TerminalDB.getOpenInvoices();
    const derived = await deriveSettlementFromSendSigilFileForInvoices(file, openInvoices);
    if (!derived) return;
    markSendSigilUsedFromMeta(derived.meta);
    await ingestPayload(derived.settlement);
    await store.refresh();
  }, [store]);

  return (
    <div className="pt-card pt-scroll">
      <div className="pt-cardInner">
        <div className="pt-row">
          <div>
            <div className="pt-h1">Inbox</div>
            <div className="pt-muted" style={{ marginTop: 6 }}>
              Unmatched settlements land here. Normal payments settle automatically when they match an invoice.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="pt-btn primary" type="button" onClick={() => setScanOpen(true)}>
              Ingest
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
            <button className="pt-btn" type="button" onClick={() => void store.refresh()}>
              Refresh
            </button>
          </div>
        </div>

        <div className="pt-divider" />

        {store.loading ? <div className="pt-muted">Loading…</div> : null}

        <div className="pt-list">
          {store.unmatchedSettlements.length === 0 && !store.loading ? (
            <div className="pt-muted">Inbox empty.</div>
          ) : null}

          {store.unmatchedSettlements.map((row) => {
            const s = row.settlement;
            return (
              <div className="pt-item" key={row.settlementId}>
                <div className="pt-itemTop">
                  <div>
                    <div className="pt-itemTitle">{s.amount.phi} Φ</div>
                    <div className="pt-itemSub">
                      From {s.fromPhiKey.slice(0, 8)}…{s.fromPhiKey.slice(-6)}
                    </div>
                  </div>
                  <Pill tone="warn" text="Unmatched" />
                </div>

                <div className="pt-kv">
                  <div className="pt-k">InvoiceId</div>
                  <div className="pt-v">{s.invoiceId}</div>
                  <div className="pt-k">Settlement</div>
                  <div className="pt-v">{s.settlementId}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ScanSheet
        open={scanOpen}
        title="Ingest Settlement / Invoice"
        onClose={() => setScanOpen(false)}
        onScannedText={async (text) => {
          await ingestText(text);
          setScanOpen(false);
        }}
      />
    </div>
  );
}
