# Work Map schema

The Work Map is plain JSON (`Download JSON` on the Work Map screen). Types live in `src/domain/types.ts`.

```jsonc
{
  "workflow": "Resolving invoice exceptions in the weekly payment run",
  "expertName": "Maria",
  "expertRole": "Senior Accounts Payable Analyst, 14 years",
  "company": "Northwind Facilities",
  "capturedAt": 1790000420000,
  "steps": [
    { "id": "S3", "label": "Check tolerance", "description": "...", "documented": true },
    { "id": "H1", "label": "Verify changed bank details by call-back", "description": "...", "documented": false }
  ],
  "insights": [
    {
      "id": "I-3",
      "kind": "guardrail",              // judgment | exception | guardrail | heuristic | escalation
      "stepId": "H1",                   // where it attaches; H* ids are steps discovered from the expert
      "title": "Never pay changed bank details without a call-back",
      "condition": "WHEN the bank account on an invoice differs from the one on file",
      "action": "THEN hold and phone the vendor on the number already on file",
      "rationale": "BECAUSE changed account details sent by email are the standard payment-diversion fraud",
      "unless": "UNLESS (boundary of the rule, optional)",
      "severity": "hard_stop",          // guardrails: hard_stop | strong | soft
      "sourceQuote": "I never pay a changed account on an email...",
      "caseId": "INV-2044",             // the observed decision that prompted the rule
      "status": "confirmed",            // proposed | confirmed | corrected  (teach-back result)
      "correction": "optional: what the expert said was wrong",
      "createdAt": 1790000180000
    }
  ],
  "openQuestions": [{ "id": "Q-1", "topic": "...", "caseId": "INV-2046", "createdAt": 0 }],
  "stats": { "casesObserved": 8, "questionsAsked": 6, "silentCases": 2 }
}
```

Design choices worth defending:

- **`documented: false` steps** are the headline. They are work the expert does that the written procedure doesn't contain.
- **`status`** distinguishes what the model inferred from what the expert confirmed. The tutor teaches from corrections, not originals.
- **`caseId`** gives every rule provenance: the exact decision that prompted it. It is also how the tutor links rules to practice invoices.
- **`condition` / `action` / `rationale` / `unless`** keep rules executable by a person and checkable by a reviewer; a rule without a concrete `condition` is a platitude.
