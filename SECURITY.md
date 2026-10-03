# Security and privacy

## Public export preparation

- Removed 12 node credential bindings, workflow/version/instance IDs, webhook IDs and organization metadata.
- Replaced the shared workbook ID, tab locators/cached URLs, HAPP assistant ID, callback route and Telegram chat ID.
- Cleared pinned execution data and set all three exports inactive.
- Retained node names, graph connections, Code nodes, prompts, schemas and application column mappings.
- Checked sanitized files for original deployment identifiers and common secret-token patterns before publication.

Credential bindings usually identify stored credentials rather than contain the credential secret. Their removal is not a substitute for secret scanning or incident response. Rotate any credential if it was exposed elsewhere.

## Deployment boundary

Inactive exports are safer to import, but manual execution can still make calls, incur provider charges, write Sheets data or send Telegram messages once credentials are bound. Do not execute outbound nodes with public synthetic examples.

The source's callback has no configured authentication or missing-ID gate. Do not publish that endpoint without a separately validated authenticity/replay-protection mechanism appropriate to the provider. A hidden route alone is not authentication.

## Personal data

The live design processes names, telephone numbers, qualification statements, transcripts, recording links and conversation identifiers. The public examples are synthetic, use reserved demonstration telephone numbers and contain no real recording URLs.

Use least-privilege accounts, isolated test resources, appropriate retention and restricted access to Sheets, recordings and execution logs. Do not publish actual callbacks, transcripts, credential files or private recording URLs in issues, commits or screenshots.

The initial merge error includes the invalid raw model response. Redact it before a live run. Treat transcripts and model output as untrusted data: output schema constraints do not establish factual truth or prevent prompt injection, and human review should govern consequential follow-up.

## Reporting a problem

For a security issue, contact the author's public business address: **vladyslavmoskalkov@gmail.com**. Do not paste secrets or real customer data into a public issue. This educational repository does not provide a production security or support guarantee.
