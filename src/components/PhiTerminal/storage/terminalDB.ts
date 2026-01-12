import type { PhiInvoiceV1, PhiSettlementV1, InvoiceStatus } from "../protocol/types";

const DB_NAME = "phi_terminal_db";
const DB_VERSION = 1;

type InvoiceRow = {
  invoiceId: string;
  status: InvoiceStatus;
  createdAtMs: number;
  invoice: PhiInvoiceV1;
};

type SettlementRow = {
  settlementId: string;
  createdAtMs: number;
  settlement: PhiSettlementV1;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      const invoices = db.createObjectStore("invoices", { keyPath: "invoiceId" });
      invoices.createIndex("status", "status", { unique: false });
      invoices.createIndex("createdAtMs", "createdAtMs", { unique: false });

      const settlements = db.createObjectStore("settlements", { keyPath: "settlementId" });
      settlements.createIndex("createdAtMs", "createdAtMs", { unique: false });
      settlements.createIndex("invoiceId", "settlement.invoiceId", { unique: false });

      db.createObjectStore("kv", { keyPath: "k" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await openDB();
  const t = db.transaction(["invoices", "settlements", "kv"], mode);
  const out = await fn(t);
  await new Promise<void>((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error ?? new Error("IDB tx error"));
    t.onabort = () => rej(t.error ?? new Error("IDB tx abort"));
  });
  db.close();
  return out;
}

function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IDB request error"));
  });
}

export const TerminalDB = {
  async putInvoice(invoice: PhiInvoiceV1, status: InvoiceStatus = "OPEN") {
    const row: InvoiceRow = { invoiceId: invoice.invoiceId, status, createdAtMs: Date.now(), invoice };
    return tx("readwrite", async (t) => {
      const store = t.objectStore("invoices");
      await reqP(store.put(row));
    });
  },

  async setInvoiceStatus(invoiceId: string, status: InvoiceStatus) {
    return tx("readwrite", async (t) => {
      const store = t.objectStore("invoices");
      const row = await reqP(store.get(invoiceId));
      if (!row) return;
      row.status = status;
      await reqP(store.put(row));
    });
  },

  async getOpenInvoices(): Promise<PhiInvoiceV1[]> {
    return tx("readonly", async (t) => {
      const idx = t.objectStore("invoices").index("status");
      const rows = await reqP(idx.getAll("OPEN"));
      rows.sort((a: InvoiceRow, b: InvoiceRow) => b.createdAtMs - a.createdAtMs);
      return rows.map((r: InvoiceRow) => r.invoice);
    });
  },

  async getInvoice(invoiceId: string): Promise<PhiInvoiceV1 | null> {
    return tx("readonly", async (t) => {
      const row = await reqP(t.objectStore("invoices").get(invoiceId));
      return (row as InvoiceRow | undefined)?.invoice ?? null;
    });
  },

  async listInvoices(limit = 50): Promise<InvoiceRow[]> {
    return tx("readonly", async (t) => {
      const store = t.objectStore("invoices");
      const rows = await reqP(store.getAll());
      rows.sort((a: InvoiceRow, b: InvoiceRow) => b.createdAtMs - a.createdAtMs);
      return rows.slice(0, limit);
    });
  },

  async putSettlement(settlement: PhiSettlementV1) {
    const row: SettlementRow = { settlementId: settlement.settlementId, createdAtMs: Date.now(), settlement };
    return tx("readwrite", async (t) => {
      const store = t.objectStore("settlements");
      await reqP(store.put(row));
    });
  },

  async listSettlements(limit = 100): Promise<SettlementRow[]> {
    return tx("readonly", async (t) => {
      const store = t.objectStore("settlements");
      const rows = await reqP(store.getAll());
      rows.sort((a: SettlementRow, b: SettlementRow) => b.createdAtMs - a.createdAtMs);
      return rows.slice(0, limit);
    });
  },
};
