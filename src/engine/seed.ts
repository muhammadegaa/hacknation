import type { Scenario, WorkMap } from "../domain/types";
import { addInsight, confirmInsight, emptyWorkMap } from "./workmap";

/**
 * A pre-captured Work Map in the shape a real capture session produces. It lets
 * the tutor run immediately (and lets judges try it without a capture first).
 * It is built through the same addInsight/confirmInsight code path as live capture.
 */
export function seedWorkMap(s: Scenario): WorkMap {
  let map = emptyWorkMap(s);
  const T = 1_790_000_000_000;

  const add = (input: Parameters<typeof addInsight>[1], confirm = true, n = 0) => {
    const r = addInsight(map, input, T + n * 60_000);
    map = r.map;
    if (confirm) map = confirmInsight(map, r.insight.id, true).map;
  };

  add(
    {
      kind: "exception",
      step_id: "S3",
      title: "Fuel-surcharge vendors can run up to 5% over",
      condition: "A freight vendor's invoice is over the PO by more than 2% and the contract has a fuel-surcharge side letter",
      action: "Approve without holding it",
      rationale: "The side letter lets them pass fuel costs through, capped at 5% of the PO value",
      unless: "The overage is above 5%, or the vendor has no side letter. Then hold and ask for the breakdown.",
      source_quote:
        "Brightline always runs three to four percent over. There's a side letter from 2024 that lets them pass through fuel surcharge up to five percent. Over five, I hold it.",
      case_id: "INV-2041",
    },
    true,
    1,
  );
  add(
    {
      kind: "judgment",
      step_id: "S2",
      new_step: "Confirm delivery with the requester",
      title: "Small vendors are paid on the requester's word",
      condition: "A small or family-run vendor's invoice has no goods receipt logged yet, and it is under about £2,500",
      action: "Message the requester to confirm the work was done; if they confirm, approve",
      rationale: "Site managers log receipts late, and small vendors should not wait on our paperwork",
      unless: "Above roughly £2,500, wait for the receipt",
      source_quote: "I don't make small vendors wait over paperwork. My line is about two and a half thousand pounds. Above that I wait for the receipt.",
      case_id: "INV-2043",
    },
    true,
    2,
  );
  add(
    {
      kind: "guardrail",
      step_id: "S3",
      new_step: "Verify changed bank details by call-back",
      title: "Never pay changed bank details without a call-back",
      condition: "The bank account on an invoice differs from the one on file, whatever else matches",
      action: "Hold the invoice and phone the vendor on the number already on file",
      rationale: "Changed account details sent by email are the standard payment-diversion fraud",
      unless: "Never overridden. Use the number on file, not the one on the invoice.",
      severity: "hard_stop",
      source_quote:
        "I never pay a changed account on an email. I hold it and call the vendor on the number we already had on file, not the one on the invoice. It doesn't matter if everything else matches.",
      case_id: "INV-2044",
    },
    true,
    3,
  );
  add(
    {
      kind: "heuristic",
      step_id: "S4",
      title: "Near-duplicates count as duplicates",
      condition: "Same vendor, same amount and same PO as an invoice already processed, with an invoice number that differs by a character or a suffix",
      action: "Reject as a duplicate and tell the vendor",
      rationale: "Vendors resubmit with a tweaked number, and the system only catches exact matches",
      source_quote: "If amount and PO match and the numbers are one character apart, it's a duplicate. I reject it and tell the vendor.",
      case_id: "INV-2042/A",
    },
    true,
    4,
  );
  add(
    {
      kind: "escalation",
      step_id: "S5",
      title: "New vendor, no PO, just under the limit: escalate, don't reject",
      condition: "First invoice from a recently created vendor, no PO, amount just below the £10,000 approval limit",
      action: "Escalate to the controller",
      rationale: "Looks like a vendor set up to stay under the approval threshold; rejecting only prompts a resubmission with a PO",
      severity: "strong",
      source_quote: "I don't just reject it, because then it comes back with a PO. I escalate to the controller so they can look at who created the vendor.",
      case_id: "INV-2046",
    },
    true,
    5,
  );
  add(
    {
      kind: "judgment",
      step_id: "S6",
      title: "Capture early-payment discounts",
      condition: "The vendor offers a discount such as 2/10 net 30 and the cash forecast allows it",
      action: "Schedule payment inside the discount window instead of on the due date",
      rationale: "A 2% discount for paying 20 days early is a very high annualised return",
      unless: "The cash forecast is tight",
      source_quote: "On twenty-two thousand that's four hundred and forty pounds. I schedule it for day ten, not the due date, as long as the cash forecast is fine.",
      case_id: "INV-2047",
    },
    true,
    6,
  );

  return { ...map, capturedAt: T + 7 * 60_000, stats: { casesObserved: 8, questionsAsked: 6, silentCases: 2 } };
}
