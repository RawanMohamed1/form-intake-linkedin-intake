# Marlow & Finch — Intake Automation

Turns messy inbound enquiries (forwarded emails, chat/LinkedIn-style DMs, web form submissions)
into consistent structured records, using an n8n workflow with an LLM extraction step in the
middle. Built for the Relay Systems AI & Automation Specialist trial task, Question 1.

**Live demo page:** https://rawanmohamed1.github.io/task-trail-Q1/
**Workflow export:** [`Q1_Trail_Task.json`](Q1_Trail_Task.json)

---

## Try it in 2 minutes

1. Open the live demo page above.
2. Fill in the form at the top with any enquiry (or use one of the sample enquiries below) and
   click **Submit enquiry**.
3. Or click the 💬 bubble in the bottom-right corner and chat instead — type naturally, the bot
   asks a couple of follow-up questions (role, location, budget, name, contact), then logs the
   enquiry automatically once it has enough.
4. Either path lands the enquiry in n8n within a second or two, where it's read by an LLM, turned
   into a structured record, and written to Airtable.

### The three task sample enquiries, and where to enter each one

| Sample enquiry | How to run it |
|---|---|
| *"Spoke to Priya at the London office — we need 2 warehouse team leads in Leeds asap, budget ~32k, immediate start."* | Send/forward yourself an email with this text (see "Testing the email channel" below) |
| *"hey are you the finance recruitment guys? after a management accountant, hybrid Bristol, perm."* | Type it into the chat bubble on the demo page |
| Name: **Tom R**, Company: *(blank)*, Message: *"resend the terms doc"* | Fill in the form at the top of the demo page |

The third one is deliberately not a real hiring enquiry — see "What happens when something
doesn't fit" below for what the workflow does with it.

---

## What happens after you submit

```
                Gmail Trigger (real inbox, polls every 1 min)
                        │
                        ▼
                  Set: normalize
                        │
                        ├──────────────┐
                                       ▼
Webhook (web form + chat widget) ──▶ Set: normalize ──▶ Merge ──▶ LLM Extraction ──▶ Validate (Code)
                                                                                            │
                                                                                            ▼
                                                                                    IF: route on
                                                                                type + confidence
                                                                                     ┌──────┴──────┐
                                                                                     ▼             ▼
                                                                          Look up + assign     Flag for
                                                                          consultant (Airtable  human review
                                                                          lookup + Code)              │
                                                                                     │             │
                                                                                     ▼             ▼
                                                                          Write to "Leads"   Write to "Needs
                                                                          table (Airtable)   Review" table
```

1. **A trigger fires** — Gmail (for forwarded emails) or a Webhook (for the form and chat widget).
2. **A Set node normalizes** whatever shape that channel sent into one common shape:
   `source`, `raw_text`, `name`, `company`.
3. **Merge** combines both paths into a single stream, so everything downstream only has to be
   built once.
4. **An LLM call** (currently via OpenRouter, a free-tier model) reads `raw_text` and returns a
   structured JSON record: contact details, role, location, salary, urgency, enquiry type, and
   a confidence score.
5. **A validation step (plain code)** checks that JSON is well-formed and uses only the expected
   values. If it isn't, the record is still saved, just flagged `needs_human_review: true`.
6. **An IF node routes** on the LLM's own output: a confident `job_requisition` goes one way,
   everything else goes the other.
7. **Confident leads** get looked up against a `Consultants` table in Airtable (keyword match on
   role/location) and written to the `Leads` table with a consultant assigned.
8. **Everything else** gets written to a `Needs Review` table instead — nothing is silently
   dropped or forced into a fake lead.

---

## Where I used the LLM, and where I used plain rules — and why

| Step | Deterministic or LLM? | Why |
|---|---|---|
| Which channel it came from | Deterministic | It's just which trigger fired — no judgment involved |
| Normalizing field names (`snippet` → `raw_text`, etc.) | Deterministic | Pure relabelling, not language understanding |
| Extracting role, location, salary, urgency, contact info from free text | **LLM** | The one part that genuinely requires understanding messy human language — "asap" means urgent, "32k" means a salary figure, "hybrid Bristol, perm" implies a permanent hybrid role. No fixed set of rules covers every way people phrase this |
| Validating the LLM's JSON structurally | Deterministic | LLMs occasionally return malformed JSON, wrong enum values, or miss a field — this is caught in code, never trusted blindly |
| Deciding whether something is a real lead vs. needs a human | Deterministic (reads the LLM's own output) | An `IF` node checks `enquiry_type` and `confidence` against a threshold — auditable and editable without touching the AI prompt |
| Assigning a consultant | Deterministic (Airtable lookup + code) | Sector/location → consultant name is a lookup, not a judgment call. Keeping it as an editable Airtable table (rather than baked into the AI prompt) means the founder can add or reassign consultants themselves, with no workflow changes |
| Writing to Airtable | Deterministic | Plain API calls, no ambiguity |

**The general principle:** the LLM is used exactly once, for the one thing only a language model
can do here — turning unstructured text into structured meaning. Everything before and after
that step is plain rules, because rules are cheaper, faster, 100% predictable, and easy for a
non-technical founder to audit or edit later.

### What happens when something doesn't fit

Sample 3 (Tom R, "resend the terms doc") is deliberately not a hiring enquiry. The extraction
step classifies `enquiry_type` as `admin_request` rather than forcing role/location/salary
fields that don't exist. The routing step sends it to the "needs human review" path instead of
auto-assigning a consultant — nothing gets silently dropped, and nothing gets force-fit into a
fake lead record.

If the LLM's response itself is malformed (bad JSON, an unrecognised enum value, a timeout), the
validation step catches it and routes the record to human review with `needs_human_review: true`
and the parse error attached — the raw enquiry is still saved, just flagged, rather than the
whole run failing silently.

### Why LinkedIn DMs aren't pulled automatically

LinkedIn does not expose a public API for reading or sending direct messages, even to approved
partners — that access is restricted to LinkedIn's own products. The only workarounds are
unofficial session-automation tools that violate LinkedIn's terms of service, which isn't
something to build for a client. Instead, the demo page's chat widget is styled like a DM
conversation: a visitor types naturally, an LLM asks the same follow-up questions a consultant
would, and once it has enough, it logs the enquiry through the same pipeline as the other
channels. In production this would more realistically be "a consultant pastes in a DM they
received," which takes the same 10 seconds as forwarding an email.

---

## Repo contents

```
├── Q1_Trail_Task.json               — the n8n workflow export, import this to run it yourself
├── web-form/index.html              — source for the hosted intake page (form + chat widget)
├── linkedin-chat-worker/
│   ├── src/index.js                 — Cloudflare Worker: proxies the chat widget to an LLM,
│   │                                   keeping the API key server-side, and forwards finished
│   │                                   conversations into the n8n pipeline
│   └── wrangler.toml
├── n8n-workflow-support/            — reference materials (LLM prompt bodies, validation code,
│                                       Airtable table templates) — not required to run the
│                                       workflow, included for transparency
├── docs/                            — GitHub Pages copy of the hosted intake page
└── README.md
```

---

## Setting it up yourself

1. **Import the workflow**: in n8n, Workflows → Import from File → select `Q1_Trail_Task.json`.
2. **Credentials to create**:
   - Gmail (OAuth2) — for the email trigger
   - Groq (Bearer/Header Auth with an API key — free tier, no card required) — for the LLM
     extraction step
   - Airtable Personal Access Token, scoped to a base with three tables: `Consultants`
     (Name, Specialty Keywords, Email), `Leads` (Contact Name, Contact Email, Contact Phone,
     Company, Role Sought, Location, Salary Budget, Urgency, Assigned Consultant, Source,
     Confidence, Summary, Raw Text), and `Needs Review` (Contact Name, Enquiry Type, Confidence,
     Summary, Source, Raw Text).
3. **Point the Webhook node** at the URL n8n gives you, and update:
   - The `WEBHOOK_URL` constant in `web-form/index.html`
   - The `N8N_WEBHOOK_URL` constant in `linkedin-chat-worker/src/index.js`
4. **Deploy the chat widget's backend** (optional, only needed if you want the chat bubble live
   on your own page): `cd linkedin-chat-worker && npx wrangler deploy`, then set your LLM
   provider's key as a Worker secret: `npx wrangler secret put GROQ_API_KEY`.

### Testing the email channel

The Gmail Trigger polls a real inbox every minute for labelled emails. To test it: send or
forward yourself an email containing one of the sample enquiries, apply the label the trigger is
filtered on (e.g. `Enquiries`), and wait up to a minute.

---

## A note on the live demo page

The live, publicly-hosted demo page (`web-form/index.html`) and its chat widget were built to
make the submission something you can actually click through rather than just read about. Worth
explaining how it was built and why, since it introduces two extra pieces beyond n8n itself.

**Why a hosted page at all:** the three sample enquiries needed a real way to get *into* n8n
that wasn't just pasted JSON. The web form is a plain static page that POSTs straight to the n8n
webhook — simple, no extra moving parts, since it's just three text fields with no logic of its
own.

**Why the chat widget needed something extra:** there's no public API for reading LinkedIn DMs
(see above), so the chat widget stands in for that channel — but unlike the form, it needs to
hold a back-and-forth conversation, asking follow-up questions the way a consultant would. That
requires calling an LLM live, turn by turn, from the page. An LLM API key can never be placed
directly in a public webpage's JavaScript — anyone viewing the page's source could read and
misuse it. So a small Cloudflare Worker sits in between: the page talks to the Worker, the Worker
holds the API key and talks to the LLM, and once the conversation has enough information, the
Worker forwards the finished transcript into the same n8n webhook the form uses. This was a
security requirement of building the chat feature at all, not scope creep for its own sake.

**Why the reference materials in `n8n-workflow-support/` exist:** these are the exact prompt
text and validation code used inside the n8n nodes, kept as plain files purely so the reasoning
is readable without opening n8n itself. They aren't executed directly — they're already inside
the workflow JSON; these copies are for transparency only.

### If you import `Q1_Trail_Task.json` into your own n8n instance

The workflow will need reconnecting before it runs, for reasons that are standard to n8n, not
specific to this build:

- **Credentials don't travel with an export.** n8n deliberately excludes credential values from
  workflow JSON — you'll see credential *placeholders* for Gmail, Groq, and Airtable that need
  your own accounts connected.
- **The webhook gets a new URL.** Activating the imported workflow generates a webhook URL unique
  to your n8n instance — it won't match the one hardcoded in `web-form/index.html` or
  `linkedin-chat-worker/src/index.js`. Update the `WEBHOOK_URL` / `N8N_WEBHOOK_URL` constants in
  those two files to point at your new URL if you want the demo page to talk to your instance.
- **Airtable base/table IDs are specific to this submission's base.** Recreate the three tables
  (`Consultants`, `Leads`, `Needs Review` — column names listed above) in your own base, or point
  the Airtable nodes at an existing base of your own with matching field names.

None of this is required to evaluate the workflow's logic — the JSON, README, and `outputs.md`
together show the full structure and real results without needing to run it again.

---

## Sample outputs

See [`outputs.md`](outputs.md) for the structured record produced for each of the three task
sample enquiries.

### Example: from raw LLM response to the final Airtable record

For the Priya/Leeds sample, this is what comes back from the LLM extraction call:

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
  "confidence": 1.0
}
```

After validation and consultant assignment, this is the final record written to the `Leads`
table in Airtable:

| Field | Value |
|---|---|
| Contact Name | Priya |
| Company | *(blank)* |
| Role Sought | Warehouse Team Leads |
| Location | Leeds |
| Salary Budget | 32000 |
| Urgency | immediate |
| Assigned Consultant | James (Industrial & Logistics) |
| Source | email |
| Confidence | 1.0 |
| Summary | Requirement for 2 warehouse team leads in Leeds; budget ~32k; immediate start requested. |
| Raw Text | Spoke to Priya at the London office — we need 2 warehouse team leads in Leeds asap, budget ~32k, immediate start. |
