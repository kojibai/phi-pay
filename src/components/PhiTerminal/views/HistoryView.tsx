import React from "react";
import { useTerminalStore } from "../hooks/useTerminalStore";
import { Pill } from "../ui/Pill";

export function HistoryView() {
  const store = useTerminalStore();

  return (
    <div className="pt-card pt-scroll">
      <div className="pt-cardInner">
        <div className="pt-row">
          <div>
            <div className="pt-h1">History</div>
            <div className="pt-muted" style={{ marginTop: 6 }}>
              Offline ledger: invoices + settlements stored locally.
            </div>
          </div>
          <button className="pt-btn" type="button" onClick={() => void store.refresh()}>
            Refresh
          </button>
        </div>

        <div className="pt-divider" />

        <div className="pt-list">
          {store.invoices.length === 0 && !store.loading ? (
            <div className="pt-muted">No invoices yet.</div>
          ) : null}

          {store.invoices.map((row) => {
            const inv = row.invoice;
            return (
              <div className="pt-item" key={row.invoiceId}>
                <div className="pt-itemTop">
                  <div>
                    <div className="pt-itemTitle">{inv.amount.phi} Φ</div>
                    <div className="pt-itemSub">
                      {inv.merchantLabel ?? "Merchant"} • {inv.invoiceId.slice(0, 10)}…
                    </div>
                  </div>
                  {row.status === "SETTLED" ? <Pill tone="ok" text="Settled" /> : <Pill tone="aqua" text="Open" />}
                </div>

                {inv.memo ? (
                  <div className="pt-itemSub" style={{ marginTop: 10 }}>
                    Memo: {inv.memo}
                  </div>
                ) : null}

                <div className="pt-kv">
                  <div className="pt-k">InvoiceId</div>
                  <div className="pt-v">{inv.invoiceId}</div>
                  <div className="pt-k">To</div>
                  <div className="pt-v">{inv.merchantPhiKey}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-divider" />

        <div className="pt-h1">Settlements</div>
        <div className="pt-list" style={{ marginTop: 10 }}>
          {store.settlements.length === 0 && !store.loading ? (
            <div className="pt-muted">No settlements yet.</div>
          ) : null}

          {store.settlements.slice(0, 40).map((row) => {
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
                  <Pill tone="neutral" text="Receipt" />
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
    </div>
  );
}
