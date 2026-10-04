import type { ActionType, Invoice, LookupContent, LookupKey, Scenario } from "./types";

/**
 * Scenario: the Accounts Payable exception desk at Northwind Facilities.
 *
 * The written SOP is a three-way match with a 2% tolerance. The expert, Maria,
 * has 14 years of judgment that the SOP does not contain. Six of those hidden
 * rules are seeded across the capture queue (the benchmark ground truth), and
 * the trainee queue tests each one in a fresh form, including two traps where
 * the surface looks like a known rule but the right answer is different.
 */

const TOLERANCE = 0.02;

function variance(inv: Invoice): number | null {
  if (inv.poAmount == null || inv.poAmount === 0) return null;
  return (inv.amount - inv.poAmount) / inv.poAmount;
}

/** The written procedure as code. Exact-match duplicate check only. */
export function sopPredict(inv: Invoice): ActionType {
  if (!inv.poNumber) return "reject";
  const v = variance(inv);
  if (inv.receipt !== "full") return "hold";
  if (v == null || Math.abs(v) > TOLERANCE) return "hold";
  return "approve";
}

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

const matchLine = (inv: Invoice) => {
  const v = variance(inv);
  return v == null
    ? "No PO on file"
    : `Invoice ${gbp(inv.amount)} vs PO ${gbp(inv.poAmount!)} (${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%)`;
};

function poLookup(inv: Invoice, receiptLine: string): Invoice["lookups"] {
  return {
    po_receipt: {
      title: "PO and goods receipt",
      lines: inv.poNumber
        ? [`PO ${inv.poNumber} · ${gbp(inv.poAmount!)}`, matchLine(inv), receiptLine]
        : ["No purchase order is linked to this invoice.", "Requester field is empty."],
    },
  };
}

// ---------------------------------------------------------------------------
// Capture queue (Maria works these; the Apprentice watches)
// ---------------------------------------------------------------------------

const harbor: Invoice = (() => {
  const inv: Invoice = {
    id: "INV-2042",
    vendor: "Harbor Office Supply",
    vendorNote: "Stationery · supplier since 2016",
    amount: 412,
    poNumber: "PO-8810",
    poAmount: 412,
    receipt: "full",
    invoiceDate: "2026-09-28",
    dueDate: "2026-10-28",
    terms: "Net 30",
    description: "Printer paper and toner, Leeds office",
    lookups: {},
  };
  inv.lookups = {
    ...poLookup(inv, "Goods receipt GR-5521 · received in full, 26 Sep"),
    vendor_history: { title: "Vendor history", lines: ["38 invoices in 24 months", "Every one paid on time, no disputes"] },
    dup_search: { title: "Duplicate search", lines: ["No other invoice with this number or amount in the last 90 days."] },
  };
  return inv;
})();

const brightline: Invoice = (() => {
  const inv: Invoice = {
    id: "INV-2041",
    vendor: "Brightline Logistics",
    vendorNote: "Freight · supplier since 2019",
    amount: 10380,
    poNumber: "PO-8794",
    poAmount: 10000,
    receipt: "full",
    invoiceDate: "2026-09-27",
    dueDate: "2026-10-27",
    terms: "Net 30",
    description: "Pallet freight, Manchester to Leeds, September",
    lookups: {},
  };
  inv.lookups = {
    ...poLookup(inv, "Goods receipt GR-5517 · delivered in full, 25 Sep"),
    vendor_history: {
      title: "Vendor history",
      lines: ["21 invoices in 18 months", "Last 6 invoices ran 3.1% to 4.4% over PO", "All approved, none disputed"],
    },
    contract: {
      title: "Contract notes",
      lines: ["Master agreement 2019, renewed 2025", "Side letter (Mar 2024): fuel surcharge pass-through, capped at 5% of PO value"],
    },
  };
  return inv;
})();

const pennant: Invoice = (() => {
  const inv: Invoice = {
    id: "INV-2043",
    vendor: "Pennant Cleaning Services",
    vendorNote: "Cleaning · family-run · supplier since 2021",
    amount: 1860,
    poNumber: "PO-8802",
    poAmount: 1860,
    receipt: "none",
    invoiceDate: "2026-09-30",
    dueDate: "2026-10-30",
    terms: "Net 30",
    description: "September office cleaning, Leeds",
    lookups: {},
  };
  inv.lookups = {
    ...poLookup(inv, "No goods receipt logged for September"),
    vendor_history: {
      title: "Vendor history",
      lines: ["16 invoices in 16 months", "Receipts were logged late on 11 of them, never disputed"],
    },
  };
  return inv;
})();

const vantage: Invoice = (() => {
  const inv: Invoice = {
    id: "INV-2044",
    vendor: "Vantage Electrical",
    vendorNote: "Electrical contractor · supplier since 2020",
    amount: 7450,
    poNumber: "PO-8815",
    poAmount: 7450,
    receipt: "full",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-31",
    terms: "Net 30",
    description: "Emergency lighting inspection and repairs, Leeds",
    lookups: {},
  };
  inv.lookups = {
    ...poLookup(inv, "Goods receipt GR-5530 · work signed off by site manager"),
    vendor_history: { title: "Vendor history", lines: ["9 invoices in 22 months", "No disputes"] },
    bank_log: {
      title: "Bank details log",
      lines: [
        "Sort code and account number on this invoice differ from the last 9 invoices.",
        "Change received by email, 29 Sep. No call-back recorded.",
      ],
    },
  };
  return inv;
})();

const harborDup: Invoice = (() => {
  const inv: Invoice = {
    id: "INV-2042/A",
    vendor: "Harbor Office Supply",
    vendorNote: "Stationery · supplier since 2016",
    amount: 412,
    poNumber: "PO-8810",
    poAmount: 412,
    receipt: "full",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-31",
    terms: "Net 30",
    description: "Printer paper and toner, Leeds office",
    lookups: {},
  };
  inv.lookups = {
    ...poLookup(inv, "Goods receipt GR-5521 · received in full, 26 Sep"),
    vendor_history: { title: "Vendor history", lines: ["38 invoices in 24 months", "No disputes"] },
    dup_search: {
      title: "Duplicate search",
      lines: ["No exact match on invoice number.", "Near match: INV-2042, £412, same PO-8810, already approved today."],
    },
  };
  return inv;
})();

const apex: Invoice = (() => {
  const inv: Invoice = {
    id: "INV-2046",
    vendor: "Apex Facility Partners",
    vendorNote: "NEW VENDOR · first invoice",
    amount: 9900,
    poNumber: null,
    poAmount: null,
    receipt: "none",
    invoiceDate: "2026-10-02",
    dueDate: "2026-10-16",
    terms: "Net 14",
    description: "Consultancy services, October retainer",
    lookups: {},
  };
  inv.lookups = {
    ...poLookup(inv, ""),
    vendor_history: {
      title: "Vendor history",
      lines: ["Vendor created 6 days ago", "No prior invoices", "Requested by: unknown (no requester on file)"],
    },
    contract: { title: "Contract notes", lines: ["No contract on file."] },
  };
  return inv;
})();

const calder: Invoice = (() => {
  const inv: Invoice = {
    id: "INV-2047",
    vendor: "Calder Metals",
    vendorNote: "Raw materials · supplier since 2017",
    amount: 22000,
    poNumber: "PO-8821",
    poAmount: 22000,
    receipt: "full",
    invoiceDate: "2026-10-02",
    dueDate: "2026-11-01",
    terms: "2/10 net 30",
    description: "Steel sections, Q4 maintenance stock",
    lookups: {},
  };
  inv.lookups = {
    ...poLookup(inv, "Goods receipt GR-5534 · received in full, 1 Oct"),
    vendor_history: { title: "Vendor history", lines: ["30 invoices in 36 months", "Always offers 2/10 net 30"] },
    contract: { title: "Contract notes", lines: ["2% discount if paid within 10 days of invoice date."] },
  };
  return inv;
})();

const greenfield: Invoice = (() => {
  const inv: Invoice = {
    id: "INV-2048",
    vendor: "Greenfield Print",
    vendorNote: "Printing · supplier since 2018",
    amount: 1205,
    poNumber: "PO-8825",
    poAmount: 1200,
    receipt: "full",
    invoiceDate: "2026-10-02",
    dueDate: "2026-11-01",
    terms: "Net 30",
    description: "Safety signage, 40 units",
    lookups: {},
  };
  inv.lookups = {
    ...poLookup(inv, "Goods receipt GR-5536 · received in full, 1 Oct"),
    vendor_history: { title: "Vendor history", lines: ["12 invoices in 14 months", "No disputes"] },
  };
  return inv;
})();

// ---------------------------------------------------------------------------
// Trainee queue (fresh invoices, each testing a captured rule in a new form)
// ---------------------------------------------------------------------------

function trainee(inv: Invoice, build: (i: Invoice) => Invoice["lookups"]): Invoice {
  inv.lookups = build(inv);
  return inv;
}

const kestrel = trainee(
  {
    id: "INV-3101",
    vendor: "Kestrel Fuel & Freight",
    vendorNote: "Freight · supplier since 2022",
    amount: 5190,
    poNumber: "PO-9034",
    poAmount: 5000,
    receipt: "full",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-31",
    terms: "Net 30",
    description: "Regional haulage, September",
    lookups: {},
  },
  (i) => ({
    ...poLookup(i, "Goods receipt GR-6102 · delivered in full"),
    vendor_history: { title: "Vendor history", lines: ["7 invoices in 8 months", "Last 4 ran 3% to 4% over PO"] },
    contract: { title: "Contract notes", lines: ["Fuel surcharge clause: pass-through up to 5% of PO value."] },
  }),
);

const dalton = trainee(
  {
    id: "INV-3102",
    vendor: "Dalton Roofing",
    vendorNote: "Roofing contractor · supplier since 2023",
    amount: 5190,
    poNumber: "PO-9041",
    poAmount: 5000,
    receipt: "full",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-31",
    terms: "Net 30",
    description: "Flat roof patch repairs, warehouse",
    lookups: {},
  },
  (i) => ({
    ...poLookup(i, "Goods receipt GR-6110 · work signed off"),
    vendor_history: { title: "Vendor history", lines: ["3 invoices in 12 months", "Previous invoices matched PO exactly"] },
    contract: { title: "Contract notes", lines: ["Fixed-price work order. No surcharge or variation clause."] },
  }),
);

const marlow = trainee(
  {
    id: "INV-3103",
    vendor: "Marlow Window Cleaning",
    vendorNote: "Cleaning · one-man business · supplier since 2020",
    amount: 940,
    poNumber: "PO-9050",
    poAmount: 940,
    receipt: "none",
    invoiceDate: "2026-09-30",
    dueDate: "2026-10-30",
    terms: "Net 30",
    description: "Quarterly window cleaning, head office",
    lookups: {},
  },
  (i) => ({
    ...poLookup(i, "No goods receipt logged"),
    vendor_history: { title: "Vendor history", lines: ["12 invoices in 3 years", "Receipts often logged late, never disputed"] },
  }),
);

const ridgeway = trainee(
  {
    id: "INV-3104",
    vendor: "Ridgeway Telecoms",
    vendorNote: "Telecoms · supplier since 2018",
    amount: 3200,
    poNumber: "PO-9062",
    poAmount: 3200,
    receipt: "full",
    invoiceDate: "2026-10-02",
    dueDate: "2026-11-01",
    terms: "Net 30",
    description: "Leased line rental, Q4",
    lookups: {},
  },
  (i) => ({
    ...poLookup(i, "Goods receipt GR-6120 · service confirmed"),
    vendor_history: { title: "Vendor history", lines: ["24 invoices in 24 months", "No disputes"] },
    bank_log: { title: "Bank details log", lines: ["Account number changed on 30 Sep, requested by email.", "No call-back recorded."] },
  }),
);

const orion = trainee(
  {
    id: "INV-7781",
    vendor: "Orion Paper",
    vendorNote: "Paper stock · supplier since 2015",
    amount: 2750,
    poNumber: "PO-9071",
    poAmount: 2750,
    receipt: "full",
    invoiceDate: "2026-10-02",
    dueDate: "2026-11-01",
    terms: "Net 30",
    description: "A4 stock, 50 reams",
    lookups: {},
  },
  (i) => ({
    ...poLookup(i, "Goods receipt GR-6125 · received in full"),
    vendor_history: { title: "Vendor history", lines: ["60 invoices in 5 years", "No disputes"] },
    dup_search: {
      title: "Duplicate search",
      lines: ["No exact match on number.", "Near match: INV-7718, £2,750, same PO-9071, paid 28 Sep."],
    },
  }),
);

const zenith = trainee(
  {
    id: "INV-3106",
    vendor: "Zenith Advisory",
    vendorNote: "NEW VENDOR · first invoice",
    amount: 9950,
    poNumber: null,
    poAmount: null,
    receipt: "none",
    invoiceDate: "2026-10-02",
    dueDate: "2026-10-16",
    terms: "Net 14",
    description: "Strategy workshop facilitation",
    lookups: {},
  },
  (i) => ({
    ...poLookup(i, ""),
    vendor_history: { title: "Vendor history", lines: ["Vendor created 4 days ago", "No prior invoices"] },
    contract: { title: "Contract notes", lines: ["No contract on file."] },
  }),
);

const slate = trainee(
  {
    id: "INV-3107",
    vendor: "Slate Industrial",
    vendorNote: "Industrial supplies · supplier since 2016",
    amount: 15000,
    poNumber: "PO-9088",
    poAmount: 15000,
    receipt: "full",
    invoiceDate: "2026-10-02",
    dueDate: "2026-11-01",
    terms: "2/10 net 30",
    description: "Bearings and fixings",
    lookups: {},
  },
  (i) => ({
    ...poLookup(i, "Goods receipt GR-6131 · received in full"),
    vendor_history: { title: "Vendor history", lines: ["18 invoices in 30 months", "Offers 2/10 net 30"] },
    contract: { title: "Contract notes", lines: ["2% discount if paid within 10 days of invoice date."] },
  }),
);

// ---------------------------------------------------------------------------

export const apScenario: Scenario = {
  id: "ap-exceptions",
  title: "Accounts Payable exception desk",
  company: "Northwind Facilities",
  expertName: "Maria",
  expertRole: "Senior Accounts Payable Analyst, 14 years",
  workflow: "Resolving invoice exceptions in the weekly payment run",
  steps: [
    { id: "S1", label: "Receive and triage", description: "Pick the next invoice from the exceptions queue." },
    { id: "S2", label: "Match to PO and receipt", description: "Three-way match: invoice, purchase order, goods receipt." },
    { id: "S3", label: "Check tolerance", description: "Variance must be within 2% of the PO value." },
    { id: "S4", label: "Check for duplicates", description: "Reject if the same vendor and invoice number was already processed." },
    { id: "S5", label: "Decide", description: "Approve, hold, reject, or escalate." },
    { id: "S6", label: "Schedule payment", description: "Pay on the due date in the weekly payment run." },
  ],
  sopText: [
    "Match every invoice to its PO and goods receipt.",
    "Within 2% of the PO and fully received: approve.",
    "Outside tolerance or not fully received: hold and request a credit note or receipt.",
    "No PO: reject and return to the requester.",
    "Same vendor and invoice number as one already processed: reject as a duplicate.",
    "Approved invoices are paid on the due date.",
  ],
  sopPredict,
  sopLookups: ["po_receipt"],
  ambientLookups: ["vendor_history"],
  captureCases: [
    {
      invoice: harbor,
      ruleKey: null,
      expertAction: "approve",
      expertSays: "Routine. It matches, it's a vendor I've never had a problem with. Approve.",
    },
    {
      invoice: brightline,
      ruleKey: "fuel_surcharge",
      expertAction: "approve",
      expertSays:
        "Brightline always runs three to four percent over. There's a side letter from 2024 that lets them pass through fuel surcharge up to five percent. So up to five, I approve it. Over five, I hold it and ask for the breakdown.",
    },
    {
      invoice: vantage,
      ruleKey: "bank_change",
      expertAction: "hold",
      expertSays:
        "The bank details changed and nobody called the vendor. That is the oldest fraud trick there is. I never pay a changed account on an email. I hold it and call the vendor on the number we already had on file, not the one on the invoice. It doesn't matter if everything else matches.",
    },
    {
      invoice: pennant,
      ruleKey: "small_vendor_receipt",
      expertAction: "approve",
      expertSays:
        "Pennant are a family firm and the site managers are always late logging receipts. I ping the requester to confirm the work was done, and if they say yes I approve. I don't make small vendors wait over paperwork. My line is about two and a half thousand pounds. Above that I wait for the receipt.",
    },
    {
      invoice: harborDup,
      ruleKey: "near_duplicate",
      expertAction: "reject",
      expertSays:
        "Same amount, same PO, same vendor, and the number is just the one I paid this morning with a slash A on the end. Vendors resubmit all the time. The system only catches exact matches. If amount and PO match and the numbers are one character apart, it's a duplicate, I reject it and tell the vendor.",
    },
    {
      invoice: apex,
      ruleKey: "new_vendor_threshold",
      expertAction: "escalate",
      expertSays:
        "New vendor, first invoice, no PO, and nine thousand nine hundred pounds, which is just under our ten thousand approval limit. That is a classic. I don't just reject it, because then it comes back with a PO. I escalate to the controller so they can look at who created the vendor.",
    },
    {
      invoice: calder,
      ruleKey: "early_discount",
      expertAction: "approve_early",
      expertSays:
        "Calder offer two percent for paying inside ten days. On twenty-two thousand that's four hundred and forty pounds. I schedule it for day ten, not the due date, as long as the cash forecast is fine.",
    },
    {
      invoice: greenfield,
      ruleKey: null,
      expertAction: "approve",
      expertSays: "Five pounds over on twelve hundred. Inside tolerance. Approve.",
    },
  ],
  traineeCases: [
    {
      invoice: kestrel,
      ruleKey: "fuel_surcharge",
      expectedAction: "approve",
      expectedWhy: "3.8% over, but the contract has a fuel surcharge pass-through up to 5%.",
    },
    {
      invoice: dalton,
      ruleKey: "fuel_surcharge",
      expectedAction: "hold",
      expectedWhy: "Same 3.8% variance, but a fixed-price work order with no surcharge clause. The exception does not apply.",
      trap: true,
    },
    {
      invoice: marlow,
      ruleKey: "small_vendor_receipt",
      expectedAction: "approve",
      expectedWhy: "Small vendor under the line, receipt only late. Confirm with the requester and approve.",
    },
    {
      invoice: ridgeway,
      ruleKey: "bank_change",
      expectedAction: "hold",
      expectedWhy: "Matches perfectly, but the bank details changed by email with no call-back. Hold and verify by phone.",
    },
    {
      invoice: orion,
      ruleKey: "near_duplicate",
      expectedAction: "reject",
      expectedWhy: "Same amount, same PO, number two characters transposed, already paid. Near duplicate.",
    },
    {
      invoice: zenith,
      ruleKey: "new_vendor_threshold",
      expectedAction: "escalate",
      expectedWhy: "New vendor, no PO, just under the approval limit. Escalate rather than reject.",
    },
    {
      invoice: slate,
      ruleKey: "early_discount",
      expectedAction: "approve_early",
      expectedWhy: "2/10 net 30 discount is worth £300. Schedule payment inside ten days.",
    },
  ],
  rules: [
    { key: "fuel_surcharge", label: "Fuel-surcharge vendors can run up to 5% over" },
    { key: "small_vendor_receipt", label: "Small vendors are paid on requester confirmation" },
    { key: "bank_change", label: "Never pay changed bank details without a call-back" },
    { key: "near_duplicate", label: "Near-duplicate invoices are rejected" },
    { key: "new_vendor_threshold", label: "New vendor with no PO just under the limit is escalated" },
    { key: "early_discount", label: "Early-payment discounts are captured" },
  ],
  hesitationMs: 20000,
};

export const actionLabel: Record<ActionType, string> = {
  approve: "Approve",
  approve_early: "Approve, pay early",
  hold: "Hold",
  reject: "Reject",
  escalate: "Escalate",
};

export const lookupLabel: Record<LookupKey, string> = {
  po_receipt: "PO & receipt",
  vendor_history: "Vendor history",
  contract: "Contract notes",
  bank_log: "Bank details",
  dup_search: "Duplicates",
};

const DEFAULT_LOOKUPS: Record<LookupKey, LookupContent> = {
  po_receipt: { title: "PO and goods receipt", lines: ["Nothing on file."] },
  vendor_history: { title: "Vendor history", lines: ["No notable history."] },
  contract: { title: "Contract notes", lines: ["Standard terms. No special clauses."] },
  bank_log: { title: "Bank details log", lines: ["No changes in the last 24 months."] },
  dup_search: { title: "Duplicate search", lines: ["No similar invoices in the last 90 days."] },
};

/** Every lookup answers, so which tabs have content never gives the game away. */
export function lookupContent(inv: Invoice, key: LookupKey): LookupContent {
  return inv.lookups[key] ?? DEFAULT_LOOKUPS[key];
}
