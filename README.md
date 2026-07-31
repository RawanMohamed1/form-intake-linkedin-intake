# Marlow & Finch — Intake Automation

Structured intake workflow. Turns messy inbound
(forwarded emails, LinkedIn DMs, web form submissions) into consistent structured records
via an n8n workflow with an LLM extraction step.

## Contents

- `q1-n8n-workflow/` — n8n workflow build materials:
  - `web-form/` — hosted web form (GitHub Pages) that POSTs enquiries to the n8n webhook
  - `claude-request-body.json` — the Claude API prompt/schema used for extraction
  - `validate-llm-output.js` — deterministic guardrail code that validates the LLM's JSON output
  - `linkedin-paste-form.html` — early standalone version of the LinkedIn paste-in form (superseded by the n8n Form Trigger)

## Channels → triggers

| Channel | Trigger |
|---|---|
| Forwarded email | Gmail Trigger (n8n native) |
| Web form | Webhook node, called by the hosted form in `q1-n8n-workflow/web-form/` |
| LinkedIn DM | n8n Form Trigger (paste-in) — no public LinkedIn DM API exists, so a consultant pastes the message |

More detail, the full workflow export, and sample outputs to follow as the build is completed.
