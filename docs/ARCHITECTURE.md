# Architecture

## Execution boundaries

### 1. Lead qualification — two independent entry points

**Outbound path:** Google Sheets row-added trigger (polling every minute) → phone/key normalization → phone-format IF → two-minute Wait → HAPP HTTP POST.

The request sends `phoneNumber` and dynamic variables including `lead_key`, `lead_id`, name, company, qualification context and scenario. The assistant ID and authorization are deployment-specific. The export does not include HAPP's assistant prompt, voice, tool configuration or callback registration. A successful HTTP request alone does not prove a completed conversation.

**Callback path:** POST webhook → payload normalization → BANT LLM chain → context merge → update `Leads` by `lead_key` → upsert `CallAnalysis` by `conversation_id`, setting `analysis_status=pending`.

The callback normalizer supports several root/nested payload shapes, string or turn-array transcripts, and an `end_call` tool reason as a next-step fallback. It passes IDs, call duration and recording reference into later nodes. It does not authenticate callbacks or reject missing IDs.

The first LLM stage requests four 0–25 BANT components, a total score, temperature, outcome, summary and follow-up. The subsequent Code node parses JSON, clamps the total to 0–100 and protects identity/transcript fields from model overwrites. It does **not** recompute the BANT sum or validate the complete result schema.

### 2. Scheduled conversation analysis

Schedule → read `CallAnalysis` rows with `analysis_status=pending` → Loop Over Items → AI Agent with gpt-5-mini and structured parser → upsert results by `conversation_id`, setting `analysis_status=analyzed` → loop.

The agent receives the transcript, falling back to a summary. Its parser requires 15 fields and constrains score type/range and categorical values. This constrains output shape, not factual correctness, cross-field score consistency or prompt-injection resistance.

The stored output includes BANT facts, objections, agent errors, successful patterns, sentiment and next action. The supplied write mapping has a transcript preservation defect; see the audit before running.

### 3. Scheduled executive reporting

Schedule fans out to read `Leads` and analyzed `CallAnalysis` rows → Merge → JavaScript metric calculation → AI Agent with structured report parser → HTML formatter → Telegram.

The Code node reads the two named upstream nodes directly. It calculates counts and averages; the model writes an interpretation of those metrics. The model's Green/Yellow/Red status remains an AI judgment, not a deterministic rule checked in code.

No workflow runs another workflow directly. The shared workbook is the boundary between intake, daily analysis and CEO reporting. The exported flows contain no Zoho API operation; a `zoho_lead_id` column is carried as optional context only.

## Metric semantics in the supplied code

| Field | Actual calculation / population |
| --- | --- |
| `total_leads` | All returned lead rows |
| `completed_calls` | Lead rows whose normalized `call_status` equals `done` |
| `analyzed_calls` | Analysis rows whose normalized status equals `analyzed` |
| `successful_calls` | Analyzed rows with normalized result `успішно` |
| `partial_calls` / `unsuccessful_calls` | Analyzed rows with `частково` / `неуспішно` |
| `conversion_rate` | Rounded `successful_calls / analyzed_calls × 100`, or 0 for no analyzed rows |
| `average_ai_score` | Rounded mean of numeric-convertible scores; empty values become zero in the current code |
| `hot_leads` / `warm_leads` / `cold_leads` | Counts of stored temperature labels in analyzed rows |
| `human_handoffs` | Lead rows whose handoff flag is boolean true or normalized string `true` |
| `missing_duration_count` | Analyzed rows with falsy duration; not a complete validity check |

The two populations are not joined by conversation ID before counting. Duplicate rows can inflate metrics. There is **no period filter**, no revenue metric, and no proof of a sale.

## Scoring is not yet a single policy

| Stage | Hot | Warm | Cold |
| --- | --- | --- | --- |
| Initial callback prompt / merge fallback | 75–100 | 45–74 | 0–44 |
| Daily analysis prompt | 70–100 | 40–69 | 0–39 |

The initial merge accepts a non-empty model temperature even if it contradicts the score. Daily schema validation does not enforce these threshold relationships. The CEO report counts the labels stored by daily analysis; it does not recalculate them.

## Schedule interpretation

The daily export specifies hour 09, minute 10 without an explicit interval field. Confirm the imported interval in the target n8n version. The CEO export specifies weeks, weekday value 5 (Friday), hour 19; confirm minute/defaults after import. Neither export sets a timezone.

n8n uses the workflow timezone or, if absent, the instance timezone. Configure it deliberately; see the [official Schedule Trigger documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/). Weekly execution frequency does not create a weekly data window.
