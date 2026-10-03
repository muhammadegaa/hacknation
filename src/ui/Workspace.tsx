import { actionLabel, apScenario as S, lookupContent, lookupLabel } from "../domain/scenario-ap";
import type { ActionType, Invoice, LookupKey } from "../domain/types";

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const TABS: LookupKey[] = ["po_receipt", "vendor_history", "contract", "bank_log", "dup_search"];
const ACTIONS: ActionType[] = ["approve", "approve_early", "hold", "reject", "escalate"];

export interface WorkspaceProps {
  title: string;
  invoice: Invoice;
  index: number;
  total: number;
  doneCount: number;
  decision?: ActionType;
  /** Tutor mode paints right and wrong picks. */
  grade?: (a: ActionType) => "good" | "bad" | undefined;
  opened: LookupKey[];
  active: LookupKey;
  onLookup: (k: LookupKey) => void;
  onDecide: (a: ActionType) => void;
  presence: string;
  children?: React.ReactNode;
}

export function Workspace(p: WorkspaceProps) {
  const inv = p.invoice;
  const variance = inv.poAmount ? ((inv.amount - inv.poAmount) / inv.poAmount) * 100 : null;
  const content = lookupContent(inv, p.active);
  const isNew = inv.vendorNote.startsWith("NEW VENDOR");

  return (
    <div className="ws" data-testid="workspace">
      <div className="ws-head">
        <h2>{p.title}</h2>
        <span className="watching" aria-live="polite">
          <span className="eye" /> {p.presence}
        </span>
        <div className="ws-progress" aria-label={`Invoice ${p.index + 1} of ${p.total}`}>
          {Array.from({ length: p.total }).map((_, i) => (
            <i key={i} className={i < p.doneCount ? "done" : i === p.index ? "cur" : ""} />
          ))}
        </div>
      </div>

      <div className="card inv" data-testid="invoice">
        <div className="inv-top">
          <div>
            <div className="inv-id">
              {inv.id} · invoice {p.index + 1} of {p.total}
            </div>
            <div className="inv-vendor">
              {inv.vendor}
              {isNew && <span className="new-flag">NEW VENDOR</span>}
            </div>
            <div className="inv-sub">{isNew ? "First invoice" : inv.vendorNote}</div>
          </div>
          <div>
            <div className="inv-amount">{gbp(inv.amount)}</div>
            <div className="inv-sub" style={{ textAlign: "right" }}>
              due {inv.dueDate} · {inv.terms}
            </div>
          </div>
        </div>
        <p className="inv-desc">{inv.description}</p>
        <div className="match">
          <div>
            <div className="k">Invoice</div>
            <div className="v">{gbp(inv.amount)}</div>
          </div>
          <div>
            <div className="k">Purchase order</div>
            <div className={`v ${inv.poNumber ? "" : "warn"}`}>{inv.poAmount != null ? gbp(inv.poAmount) : "none"}</div>
          </div>
          <div>
            <div className="k">Variance</div>
            <div className={`v ${variance == null ? "warn" : Math.abs(variance) > 2 ? "bad" : "ok"}`}>
              {variance == null ? "n/a" : `${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%`}
            </div>
          </div>
          <div>
            <div className="k">Goods receipt</div>
            <div className={`v ${inv.receipt === "full" ? "ok" : inv.receipt === "none" ? "bad" : "warn"}`}>{inv.receipt}</div>
          </div>
        </div>
      </div>

      <div>
        <div className="tabs" role="tablist" aria-label="Lookups">
          {TABS.map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={p.active === k}
              className={`tab ${p.active === k ? "on" : ""} ${p.opened.includes(k) ? "visited" : ""}`}
              onClick={() => p.onLookup(k)}
              data-testid={`tab-${k}`}
            >
              {lookupLabel[k]}
            </button>
          ))}
        </div>
        <div className="card panel-body" style={{ marginTop: 8 }} data-testid="lookup-panel">
          <h4>{content.title}</h4>
          <ul>
            {content.lines.filter(Boolean).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="actions" role="group" aria-label="Decision">
        {ACTIONS.map((a) => {
          const g = p.grade?.(a);
          const cls = g ? g : p.decision === a ? "picked" : "";
          return (
            <button key={a} className={`act ${cls}`} onClick={() => p.onDecide(a)} data-testid={`act-${a}`}>
              {actionLabel[a]}
            </button>
          );
        })}
      </div>

      {p.children}

      <details className="sop card" style={{ padding: "10px 14px" }}>
        <summary>The written procedure new hires get today</summary>
        <ol>
          {S.sopText.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
