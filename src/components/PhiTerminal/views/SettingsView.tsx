import React, { useCallback, useState } from "react";
import { TerminalDB } from "../storage/terminalDB";
import { Pill } from "../ui/Pill";

type ExportPack = {
  v: "PHI-TERMINAL-EXPORT-1";
  invoices: unknown[];
  settlements: unknown[];
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SettingsView() {
  const [msg, setMsg] = useState<string | null>(null);

  const exportLedger = useCallback(async () => {
    const inv = await TerminalDB.listInvoices(10000);
    const setl = await TerminalDB.listSettlements(20000);
    const pack: ExportPack = {
      v: "PHI-TERMINAL-EXPORT-1",
      invoices: inv,
      settlements: setl,
    };
    downloadText(`phi-terminal-ledger-${Date.now()}.json`, JSON.stringify(pack, null, 2));
    setMsg("Exported ledger.");
  }, []);

  const importLedger = useCallback(async (file: File) => {
    const txt = await file.text();
    const u = JSON.parse(txt) as ExportPack;
    if (!u || u.v !== "PHI-TERMINAL-EXPORT-1") {
      setMsg("Invalid export pack.");
      return;
    }

    // Re-ingest rows by calling TerminalDB methods directly:
    for (const row of u.invoices) {
      const r = row as { invoice?: unknown; status?: unknown };
      const inv = (r as { invoice: unknown }).invoice as { invoiceId?: unknown };
      if (inv && typeof (inv as { invoiceId: unknown }).invoiceId === "string") {
        // @ts-expect-error: safe at runtime (pack is from our own export)
        await TerminalDB.putInvoice(inv, (r as { status?: unknown }).status === "SETTLED" ? "SETTLED" : "OPEN");
      }
    }

    for (const row of u.settlements) {
      const r = row as { settlement?: unknown };
      const s = (r as { settlement: unknown }).settlement as { settlementId?: unknown };
      if (s && typeof (s as { settlementId: unknown }).settlementId === "string") {
        // @ts-expect-error: safe at runtime (pack is from our own export)
        await TerminalDB.putSettlement(s);
      }
    }

    setMsg("Imported ledger.");
  }, []);

  return (
    <div className="pt-card pt-scroll">
      <div className="pt-cardInner">
        <div className="pt-h1">Settings</div>
        <div className="pt-muted" style={{ marginTop: 6 }}>
          Terminal is offline-first. Export/import is how you move the ledger sovereignly between devices.
        </div>

        <div className="pt-divider" />

        <div className="pt-actions">
          <button className="pt-btn primary" type="button" onClick={() => void exportLedger()}>
            Export Ledger
          </button>

          <label className="pt-btn" style={{ cursor: "pointer" }}>
            Import Ledger
            <input
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) void importLedger(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        <div className="pt-divider" />

        <div className="pt-h1">Notes</div>
        <div className="pt-muted" style={{ marginTop: 8, lineHeight: 1.45 }}>
          <div style={{ marginBottom: 8 }}>
            <Pill tone="aqua" text="Auto-settle rule" /> Settlements settle automatically only when they match a merchant-issued invoice (invoiceId + nonce).
          </div>
          <div style={{ marginBottom: 8 }}>
            <Pill tone="warn" text="Inbox" /> Unmatched settlements go to Inbox for review (prevents spam auto-accept).
          </div>
          <div>
            <Pill tone="ok" text="Sovereign" /> No accounts. No processors. Receipts are verifiable artifacts.
          </div>
        </div>

        {msg ? (
          <div style={{ marginTop: 14 }}>
            <Pill tone="gold" text={msg} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
