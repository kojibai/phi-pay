# Φ Pay — Sovereign Payment Terminal (Offline-First)

**Φ Pay is a merchant terminal for accepting Φ (Phi) with instant settlement and verifiable receipts — fully offline-first, with no accounts, no processors, and no database.**

It feels familiar (tap → scan → paid), but the underlying primitive is different:

> **The receipt is the proof.**  
> Every payment generates a **verifiable receipt glyph** that can be audited offline.

---

## What this is

Φ Pay is a **PWA merchant terminal** designed for businesses that accept payments regularly:

- cafés
- studios
- boutiques
- pop-ups
- service providers
- events
- on-site vendors

It provides a premium “terminal” experience (like a modern POS), but it remains **sovereign**:

- No sign-in
- No centralized payment processor
- No custodial gateway
- No hidden ledger server
- No “trust me bro”

Your terminal is simply a **deterministic verifier + receiver** that emits and stores **proof-carrying artifacts**.

---

## Why it matters

Conventional payment rails make merchants live inside these constraints:

- settlement delays
- chargebacks
- account freezes
- reversible “approval” systems
- centralized dispute authority
- data capture + surveillance
- dependence on uptime of a third party

Φ Pay flips the model:

### ✅ Instant settlement
When the customer pays, the merchant gets a **settled receipt** immediately.

### ✅ No chargebacks
Receipts are signed, verifiable events — not “authorized requests” that can be reversed by a network operator.

### ✅ Offline-first by design
Once installed, Φ Pay works in airplane mode:
- create invoices
- ingest receipts
- maintain a merchant session ledger
- close and seal a settlement file

### ✅ Proof over permission
Receipts and session settlements can be verified **without** an account, backend, or special access.

### ✅ Merchant-native recordkeeping
Instead of monthly statements from a third party, the merchant closes a register session and receives **one sealed Settlement Glyph file** containing the full session.

---

## The core concept

Φ Pay is built around a simple, powerful model:

1. **Invoice Glyph**  
   The terminal generates an invoice payload representing “pay X Φ to merchant”.

2. **Receipt / Settlement Glyph**  
   The payer produces a settlement receipt (a verifiable artifact) that references the invoice.

3. **Portal Register Session (merchant mode)**  
   A merchant “opens a register” and the terminal collects receipts into a session ledger.

4. **Close Register → Mint one Settlement Glyph**  
   When the owner closes the register, Φ Pay mints a single **Portal Settlement Glyph** that contains:
   - totals
   - receipt list (or blob)
   - rolling commitment root
   - (optional) owner close proof

That one file is the sovereign accounting object.

---

## How it works (high level)

### 1) Merchant arms the terminal
The owner uploads their **Merchant Glyph** (anchor glyph).  
This “arms” the portal and binds the session to a specific merchant ΦKey.

### 2) Merchant opens the portal
Owner verifies presence (optional plug-in) and opens the register.

The portal persists as OPEN across refresh/reload because it’s stored locally (IndexedDB).  
It cannot be closed accidentally.

### 3) Merchant creates an invoice (QR)
The terminal generates an **Invoice Glyph** and displays it as a QR.

Customers scan the QR and complete payment in their wallet/verifier flow.

### 4) Customer delivers a receipt glyph
Receipts can be ingested entirely offline via:
- scanning the receipt QR (terminal camera)
- pasting receipt URL/JSON payload
- importing a `.svg` or `.json` receipt file
- local broadcast / companion flow (optional)

The portal only auto-accepts receipts that are valid for the merchant, and can enforce:
- **invoice-gated auto-settle** (recommended)  
  accepts only receipts that match an issued invoice (invoiceId + nonce)
- or **direct receives** (optional)  
  accepts any receipt to the merchant key (with inbox review for unmatched)

### 5) Close register (seal)
On close, Φ Pay generates a single **Portal Settlement Glyph** (SVG) that includes:

- session header (merchant key, opened/closed times)
- counts + totals
- a cryptographic rolling root commitment across all receipts
- all receipts (or compressed blob)
- optional owner close proof

The result is a **portable, offline-verifiable settlement object** the merchant keeps forever.

---

## What “offline-first” means here

Offline-first is not a vibe — it’s a constraint:

- The terminal uses **IndexedDB** as the local ledger.
- It does not require an API to render state.
- It can ingest receipts via file/QR/paste without network access.
- The PWA caches its app shell to allow reload in airplane mode.
- When online is available, it can optionally sync or broadcast — but **offline remains complete**.

---

## Proof model (Truth ≠ Identity ≠ Presence)

Φ Pay is compatible with the Presence-Bound Identity framing:

- **Truth**: the receipt artifact is verifiable and unaltered
- **Identity**: who created it can remain private
- **Presence**: optional owner/payer presence proof can be attached when relevant

Φ Pay focuses on **merchant settlement truth**:
- the money movement/receipt truth
- the session ledger truth
- the sealed settlement file truth

---

## Repo structure

Key code lives here:

```

src/components/PhiTerminal/
PhiTerminal.tsx              # shell (optional)
views/PortalView.tsx         # merchant terminal (Portal Register)
portal/*                     # portal state machine + settlement minting
protocol/*                   # invoice/settlement primitives
storage/*                    # IndexedDB ledger
ui/*                         # keypad, QR, sheets, pills
transport/*                  # ingest helpers
pricing/*                    # USD/Φ conversion (optional module)

````

---

## Running locally

```bash
npm install
npm run dev
````

Build + preview:

```bash
npm run build
npm run preview
```

---

## Offline test (required)

1. Open the app once online.
2. Install to Home Screen (or desktop install).
3. Turn on Airplane Mode.
4. Re-open the installed app.
5. Confirm:

   * portal renders
   * invoices generate
   * QR renders
   * receipts can be ingested by paste/file
   * closing register mints a settlement glyph

---

## Design philosophy

Φ Pay is intentionally:

* **merchant-native**
* **artifact-native**
* **proof-native**
* **offline-complete**
* **sovereign by default**

This is not “another checkout UI.”
It’s a payment terminal built on verifiable objects.

