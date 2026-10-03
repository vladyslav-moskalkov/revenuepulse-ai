# Safe setup

## Start offline

1. Use Node.js 22 or later and run `npm test` from the repository root. No dependencies or services are required.
2. Read [known limitations](KNOWN-LIMITATIONS.md), especially transcript preservation and callback security.
3. Import all three files from `workflows/` into an isolated n8n workspace. **Leave them inactive/unpublished.** Manual execution can still cause side effects; do not execute the HAPP or Telegram nodes yet.

The exporting n8n application version was not supplied. Node `typeVersion` values are retained, but import/runtime compatibility has not been exercised. Check every node for import warnings, resolve credential bindings and refresh Sheets column mappings after selecting the destination workbook.

## Workbook

Create one test workbook with two tabs named **Leads** and **CallAnalysis**. Replace `REPLACE_WITH_REVENUEPULSE_SPREADSHEET_ID` in all seven Sheets/Sheets Trigger nodes. Keep keys as text and unique: lead `lead_key`; conversation `conversation_id`. The exported flow does not enforce uniqueness or non-empty keys.

### Leads headers

```text
created_at, lead_key, zoho_lead_id, client_name, company, phone, email, scenario, pain, budget, decision_maker, timeline, call_status, ai_score, lead_temperature, result, summary, next_step, human_handoff, conversation_id, call_session_id, recording_url, updated_at
```

### CallAnalysis headers

```text
analysis_date, lead_key, zoho_lead_id, client_name, company, phone, call_session_id, conversation_id, duration_seconds, result, ai_score, lead_temperature, budget, authority, need, timeline, pain, decision_maker, customer_objections, agent_errors, successful_pattern, summary, next_step, sentiment, recording_url, transcript, analysis_status
```

These are application columns from the supplied mappings. `row_number` is an n8n read-only helper, not a header to create. Optional `zoho_lead_id` does not imply an included Zoho integration.

`pending` rows are eligible for daily analysis; the daily write uses `analyzed`. The CEO read filters `analyzed`. Match labels exactly unless you intentionally change all filters.

## Credential bindings

Reconnect credentials in n8n, not in JSON or Git:

| Integration | Nodes requiring bindings |
| --- | ---: |
| Google Sheets / Sheets Trigger OAuth | 7 |
| OpenAI | 3 |
| HAPP HTTP Header Auth | 1 |
| Telegram bot | 1 |

Set `REPLACE_WITH_HAPP_ASSISTANT_ID` in the outbound URL and `REPLACE_WITH_TELEGRAM_CHAT_ID` in the Telegram node. Determine the correct HAPP header/authentication convention from your account's provider documentation; a credential name is not a specification. All exported model nodes use `gpt-5-mini`.

## External HAPP configuration

The assistant is **not** bundled. Independently configure its qualification scenario, allowed tools, caller settings and post-call callback. Preserve lead/conversation identifiers in the callback payload. The example in [callback.json](../examples/callback.json) illustrates one shape accepted by the supplied normalizer; it is not an authoritative HAPP API contract.

The sanitized callback route is `revenuepulse-demo-callback`. Obtain its test URL from the imported Webhook node. Test and production webhook URLs have different lifecycles; follow the [official Webhook documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/).

Do not expose the source's unauthenticated callback to the internet. Add an appropriate provider-supported verification mechanism and missing-ID rejection in a separately reviewed implementation before activation.

## Manual test gates — not performed by this repository's CI

- Confirm target n8n version, daily/weekly interval fields, timezone and Merge behavior with both upstream reads empty/non-empty.
- Inspect the initial BANT text expression's `=={{` prefix in the n8n expression preview; verify it evaluates correctly before a model call.
- Correct transcript write mapping and preserve an immutable source transcript outside mutable analysis fields.
- Choose one scoring policy; validate/recompute BANT components, score and temperature independently of the model.
- Reject missing keys; verify linked-item references survive Sheets updates and loop iterations.
- Replay a callback twice; confirm it does not repeat calls or reset finalized analysis unexpectedly.
- Test provider failure, timeout, invalid JSON, invalid phone, no pending rows and no analyzed rows without sending external messages.
- Only then use a consenting test recipient and a dedicated test Telegram chat for an explicitly authorized end-to-end exercise. Synthetic example phone numbers must **not** be dialed.

Keep all schedules inactive until these gates pass. Importing JSON and passing offline tests do not establish readiness for production.
