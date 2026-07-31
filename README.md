# Marlow & Finch — Intake Automation

Turns messy inbound enquiries (forwarded emails, LinkedIn-style DMs, web form submissions)
into consistent structured records, using an n8n workflow with an LLM extraction step in the
middle. Built for the Relay Systems AI & Automation Specialist trial task, Question 1.

Live demo page (web form + chat widget): **https://rawanmohamed1.github.io/form-intake-linkedin-intake/**

---

## The problem this solves

Marlow & Finch consultants currently read every enquiry by hand and retype it into their CRM.
Three channels feed in, all differently shaped:

- A client calls or emails a consultant, who forwards the email on
- Someone messages the company on LinkedIn
- Someone fills in a basic web contact form

This workflow gives all three one consistent path: raw text in, structured record out, routed
automatically where the content is clear, and flagged for a human where it isn't.

---

## Architecture

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
                                                                          Assign consultant   Flag for
                                                                          (Set, rule table)   human review
                                                                                     │             │
                                                                                     └──────┬──────┘
                                                                                            ▼
                                                                         Write: Airtable + Google Sheets + mock CRM
```

### Channels → triggers

| Channel | How it arrives | Why |
|---|---|---|
| Forwarded email | **Gmail Trigger** (n8n native node), polling a labelled inbox every minute | Real native integration — no bridge needed |
| Web form | A **Webhook** node, called by the hosted form page below | Straightforward POST from a real hosted page |
| LinkedIn DM | The same **Webhook**, called by a chat widget on the same page | See note below — there is no public API for this |

**Why LinkedIn DMs aren't pulled automatically:** LinkedIn does not expose a public API for
reading or sending direct messages, even to approved partners — that access is restricted to
LinkedIn's own products (Recruiter, Sales Navigator). The only ways around this are unofficial
session-automation tools that violate LinkedIn's terms of service, which isn't something to
build for a client. Instead, the demo page includes a chat widget styled like a DM conversation:
a visitor types naturally, an LLM (via a small Cloudflare Worker proxy) asks the same follow-up
questions a consultant would, and once it has enough — role, location, budget, urgency, name,
and a contact method — it submits the transcript into the same pipeline as the other channels.
In production this would more realistically be "a consultant pastes in a DM they received,"
which takes the same 10 seconds as forwarding an email.

---

## Deterministic logic vs. the LLM — and why

| Step | Deterministic or LLM? | Why |
|---|---|---|
| Which channel it came from | Deterministic | It's just which trigger fired — no judgment involved |
| Normalizing field names (`snippet` → `raw_text`, etc.) | Deterministic | Pure relabelling, not language understanding |
| Extracting role, location, salary, urgency, contact info from free text | **LLM** | This is the one part that genuinely requires understanding messy human language — "asap" means urgent, "32k" means a salary figure, "hybrid Bristol, perm" implies a permanent hybrid role. No fixed set of rules covers every way people phrase this |
| Validating the LLM's JSON structurally | Deterministic | LLMs occasionally return malformed JSON, wrong enum values, or miss a field — this is caught in code, not trusted blindly |
| Deciding whether something is a real lead vs. needs a human | Deterministic (reads the LLM's own output) | An `IF` node checks `enquiry_type` and `confidence` against a threshold — auditable and editable without touching the AI prompt |
| Assigning a consultant | Deterministic (rule table) | Sector/location → consultant name is a lookup, not a judgment call. Keeping this as an editable table (rather than baked into the AI prompt) means the founder can update it themselves |
| Writing to Airtable / Sheets / mock CRM | Deterministic | Plain API calls, no ambiguity |

**The general principle:** the LLM is used exactly once, for the one thing only a language
model can do here — turning unstructured text into structured meaning. Everything before and
after that step is plain rules, because rules are cheaper, faster, 100% predictable, and easy
for a non-technical founder to audit or edit later.

### What happens when something doesn't fit

Sample 3 (Tom R, "resend the terms doc") is deliberately not a hiring enquiry. The extraction
step classifies `enquiry_type` as `admin_request` rather than forcing role/location/salary
fields that don't exist. The routing step then sends it to the "needs human review" path
instead of auto-assigning a consultant — nothing gets silently dropped, and nothing gets
force-fit into a fake lead record.

If the LLM's response itself is malformed (bad JSON, an unrecognised enum value, a timeout),
the validation step catches it and routes the record to human review with
`needs_human_review: true` and the parse error attached — the raw enquiry is still saved,
just flagged, rather than the whole run failing silently.

---

## Repo contents

```
├── q1-n8n-workflow/
│   ├── web-form/index.html          — source for the hosted intake page (form + chat widget)
│   ├── openrouter-request-body.json — the LLM extraction prompt + schema (via OpenRouter)
│   ├── claude-request-body.json     — same prompt, Claude API request shape (alternative)
│   └── validate-llm-output.js       — the deterministic guardrail Code node
├── linkedin-chat-worker/
│   ├── src/index.js                 — Cloudflare Worker: proxies chat to an LLM, keeps the API key
│   │                                   server-side, and forwards finished conversations to n8n
│   └── wrangler.toml
├── docs/                            — GitHub Pages copy of the hosted intake page (same as web-form/)
└── README.md
```

**Workflow export (`workflow.json`):** not yet included — see "Still to do" below.

---

## User guide — running/trying this yourself

### Try the live demo

1. Open **https://rawanmohamed1.github.io/form-intake-linkedin-intake/**
2. Fill in the form at the top (Name, Company, Message) and submit — this goes straight to
   the n8n webhook.
3. Or click the 💬 bubble in the bottom-right corner to chat instead — the bot will ask a few
   natural follow-up questions, then log the enquiry once it has enough information (including
   your name and a contact method).

### Reproduce the three task samples

| Sample | Where to enter it |
|---|---|
| "Spoke to Priya at the London office — we need 2 warehouse team leads in Leeds asap, budget ~32k, immediate start." | Send yourself an email with this text, labelled so the Gmail Trigger picks it up — or POST it directly to the webhook with `{"source":"email","raw_text":"..."}` |
| "hey are you the finance recruitment guys? after a management accountant, hybrid Bristol, perm." | Type it into the chat bubble |
| Name: Tom R / Company: blank / Message: "resend the terms doc" | Fill in the form at the top of the page |

### Set it up yourself in n8n

1. Import the workflow (once `workflow.json` is added — see below), or rebuild node-by-node
   using the architecture diagram above.
2. Create credentials for: Gmail (OAuth2), your LLM provider (OpenRouter or Anthropic — header
   auth with an API key), and whichever of Airtable / Google Sheets / mock CRM webhook you want
   to write to.
3. Point the Webhook node's production URL at the `WEBHOOK_URL` constant in
   `q1-n8n-workflow/web-form/index.html`, and at `N8N_WEBHOOK_URL` in
   `linkedin-chat-worker/src/index.js`.
4. If you want the chat widget live on your own page: deploy the Cloudflare Worker
   (`cd linkedin-chat-worker && npx wrangler deploy`), set your LLM provider's API key as a
   Worker secret (`npx wrangler secret put OPENROUTER_API_KEY`), and update `WORKER_URL` in
   `web-form/index.html` to your Worker's URL.

---

## Still to do

- [ ] Export and commit the final `workflow.json`
- [ ] Finish wiring: routing IF node, consultant assignment rule table, and the three write
      nodes (Airtable, Google Sheets, mock CRM)
- [ ] Run and capture all three sample outputs in an `outputs/` file or below in this README
- [ ] Consultant assignment is currently a simple keyword rule table in a Set node — for a real
      handover, this should live in an editable sheet/table the founder can update without
      touching the workflow

## What I'd improve with more time

- The Gmail Trigger currently reads the email `snippet` (a short preview) rather than the full
  body — fine for short test enquiries, but a real build should decode the full plain-text body
  for longer emails
- The free-tier LLM used for extraction is noticeably less reliable at strictly following the
  JSON schema than a paid model like Claude — the validation step compensates for this, but a
  production build serving real clients would likely default to a paid model for this step and
  reserve free models for the lower-stakes conversational chat widget
- No rate-limiting on the public chat widget endpoint — low risk for a demo, but worth adding
  for a long-lived production deployment
