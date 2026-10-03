# Source audit and launch gates

The public exports retain the supplied graph, Code nodes, prompts, parser schemas and column mappings. Only deployment identifiers, bindings and publication state were sanitized. **The findings below are not silently fixed.** Characterization tests intentionally record several current defects so a future correction can be reviewed and tested as a separate version.

## Must resolve before an active demonstration

1. **Transcript overwrite.** `Збереження результату аналізу` maps `transcript` to the loop item's `summary`, not `transcript`. The initial queue write does not supply `summary`, so this can replace the transcript with an empty value. Preserve the original transcript and remap the write in a reviewed revision.
2. **Unauthenticated callback and unchecked identifiers.** The POST Webhook has no configured authentication. `has_lead_id` is calculated but never gates Sheets writes; `conversation_id` can also be empty. Add verification, validation and an explicit rejection/quarantine path.
3. **Duplicate side effects.** Intake has no outbound-call idempotency key or persisted dispatched state. Repeated callbacks upsert by conversation ID but always set `pending`, potentially reopening finalized analysis. Upsert is not end-to-end idempotency.
4. **Initial JSON handling.** The first BANT chain has no connected structured parser; merge throws with raw model content on malformed JSON, potentially leaking personal data to execution logs. `{}` becomes score 0; JSON `null` throws. Validate types and required fields, and redact error messages.
5. **Expression preview required.** The initial chain's text starts `=={{`. This exact source string is retained; its rendering/evaluation has not been tested in n8n. Check the imported expression before calling the model.
6. **Failure routing.** No error workflow, retry/backoff policy, dead-letter queue or alert path is configured. The phone IF has no connected false branch. Add observable failure handling and bounded retries without repeating paid calls.

## Reporting accuracy

- **No weekly window:** CEO Code reads all returned rows, including old records. It does not emit `period_start`/`period_end`; the prompt falls back to an unspecified start and report timestamp. A weekly schedule is not a weekly metric definition.
- **Misleading conversion label:** exported `conversion_rate` and Telegram `Конверсія` are the successful-conversation share, not sales conversion. This repository labels it explicitly; a future workflow revision should rename it.
- **Different populations:** completion counts use `Leads`; outcome/temperature counts use analyzed `CallAnalysis`. No join or deduplication is performed. A lead can have multiple conversations.
- **Provider status mismatch:** lead update preserves non-empty HAPP status, but completion count recognizes only `done`. A value such as `completed` is not counted as completed by the current code.
- **Empty score conversion:** `Number(String(value ?? ''))` treats empty/null scores as 0. Finite scores outside 0–100 are also included. Validate scores before averaging and distinguish no data from zero performance.
- **Missing narratives:** `values.map(String)` turns absent values into literal `undefined` / `null` strings. Filter absent values before converting.
- **Duration heuristic:** numeric 0 is counted as missing; string `"0"` is not. Negative and invalid-but-truthy durations are not properly rejected.

## AI and state consistency

- Initial Hot/Warm cutoffs are 75/45; daily cutoffs are 70/40. Daily analysis can change the label without changing the business evidence.
- Both prompts request BANT-derived scores, but neither flow recomputes or checks the sum. The initial merge accepts fractions and model-provided temperature labels; schemas do not enforce score/temperature consistency.
- Missing callback fields use nullish precedence: an empty higher-priority key can suppress a valid fallback key. Negative finite callback durations are retained.
- Queue mappings assume the lead-update output contains several needed fields. Linked-item context across Sheets/loop nodes and empty-data Merge behavior require live n8n verification.
- The CEO model chooses its status. Numeric metrics come from code; narrative recommendations, risk assessment and status are not deterministic facts.
- CEO array limits are prompt instructions, not `maxItems` schema constraints. Telegram renders only two risks and two recommendations and omits `headline`/`key_insights`.
- Telegram fields are shortened and HTML-escaped, but there is no final encoded message-length check. A failed send is not centrally handled.
- Source prompts/report text are Ukrainian. English documentation does not translate HAPP's external assistant or the generated messages.

## Not established by this audit

Live call delivery, HAPP callback contract, provider authentication, n8n runtime compatibility, factual AI accuracy, business time savings, revenue lift and legal readiness were not tested. The portfolio's reported MVP numbers are narrative evidence, not a fresh execution record produced by this audit.

Before real recipients: separately review consent/notification requirements, call handling, retention, restricted recording access, provider data handling and a human override. This is an engineering checklist, not legal advice.
