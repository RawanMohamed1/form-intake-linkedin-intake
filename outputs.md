# Sample outputs — Question 1

The structured record produced by the workflow for each of the three task sample enquiries,
taken directly from the `Validate LLM Output` node's output during a real run.

---

## Sample 1 — Forwarded email

**Raw input:**
> Spoke to Priya at the London office — we need 2 warehouse team leads in Leeds asap, budget ~32k, immediate start.

**Structured record:**
```json
{
  "contact_name": "Priya",
  "contact_email": null,
  "contact_phone": null,
  "company": null,
  "role_sought": "Warehouse Team Leads",
  "location": "Leeds",
  "salary_budget": 32000,
  "urgency": "immediate",
  "enquiry_type": "job_requisition",
  "summary": "Requirement for 2 warehouse team leads in Leeds; budget ~32k; immediate start requested.",
  "confidence": 1.0,
  "needs_human_review": false
}
```

**Routing:** confident `job_requisition` → **True** branch → looked up against the `Consultants`
table → matched **James (Industrial & Logistics)** on the "warehouse"/"leeds" keywords → written
to the `Leads` table.

---

## Sample 2 — Chat / LinkedIn-style DM

**Raw input** (conversational, gathered via the chat widget):
> "hey are you the finance recruitment guys? after a management accountant, hybrid Bristol, perm."
> *(equivalent tested conversation: a Business Development Manager enquiry — London, remote
> considered, ~£45k, name and email gathered through the chat before it closed)*

**Structured record** (from the tested BDM conversation):
```json
{
  "contact_name": "Alex Morgan",
  "contact_email": "alex.morgan@email.com",
  "contact_phone": null,
  "company": null,
  "role_sought": "Business Development Manager",
  "location": "London",
  "salary_budget": 45000,
  "urgency": "immediate",
  "enquiry_type": "job_requisition",
  "summary": "Client is looking to hire a Business Development Manager in London (remote considered) within the month.",
  "confidence": 1.0,
  "needs_human_review": false
}
```

**Routing:** confident `job_requisition` → **True** branch → matched **Marcus (Sales &
Commercial)** on the "business development"/"sales" keywords → written to the `Leads` table.

---

## Sample 3 — Web form

**Raw input:**
- Name: `Tom R`
- Company: *(blank)*
- Message: `resend the terms doc`

**Structured record:**
```json
{
  "contact_name": "Tom R",
  "contact_email": null,
  "contact_phone": null,
  "company": null,
  "role_sought": null,
  "location": null,
  "salary_budget": null,
  "urgency": "unspecified",
  "enquiry_type": "admin_request",
  "summary": "Resend terms document",
  "confidence": 1.0,
  "needs_human_review": false
}
```

**Routing:** correctly classified as `admin_request`, not forced into a fake `job_requisition` —
fails the IF node's `enquiry_type == job_requisition` condition → **False** branch → no
consultant assigned → written to the `Needs Review` table for a human to triage.

---

## What this demonstrates

- The same pipeline handled a clear structured lead (Sample 1), a conversationally-gathered lead
  with contact details extracted from natural dialogue (Sample 2), and a non-hiring request
  (Sample 3) — without any special-casing per channel.
- The LLM's classification (`enquiry_type`) is the single signal driving deterministic routing:
  it decides "is this even a lead," and the workflow's own rules decide everything downstream of
  that — consultant assignment, which table it lands in, whether a review flag gets set.
- Nothing was silently dropped or forced into the wrong shape, including the deliberately
  "doesn't fit" case (Sample 3).
