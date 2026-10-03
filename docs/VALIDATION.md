# Validation and provenance

## Reproduce

```sh
node --version
npm test
```

Node.js 22+, built-in Node test runner, no third-party dependencies. Tests load the public exports and run the actual five Code-node bodies in a limited `node:vm` harness with synthetic n8n inputs. No network APIs, credentials, n8n execution engine or LLM are used. The VM is a test harness, not a security sandbox for arbitrary untrusted code.

The 64 checks cover graph references, sanitization structure, shared Sheets resources, model identifiers, connected parsers, trigger/write mappings, phone normalization, callback payload handling, initial JSON merge, deterministic CEO metrics and Telegram formatting. Characterization checks explicitly capture existing edge cases and defects. A green build means the documented source behavior is reproduced; it does **not** mean those defects are fixed.

## Demonstration fixture

`examples/demo-data.json` contains invented records with known outcomes: 6 lead rows, 5 analyzed rows, scores 90/80/75/55/40 (average 68), 2 successful, 2 partial, 1 unsuccessful, 3 Hot labels and 40% successful-conversation share. One pending row is excluded from outcome statistics. No call is made to construct these data.

The portfolio narrative reports a similar MVP sample. This fixture is an independent arithmetic illustration, not reconstructed production evidence. The Loom recording is linked for human review and was not re-recorded or certified by these tests.

## Source fingerprints

SHA-256 of the user-supplied original bytes, before sanitization:

| Source | Nodes | SHA-256 |
| --- | ---: | --- |
| Голосова AI-кваліфікація нових лідів.json | 12 | `9b0037b025b66b8d33223c11839be5853b07f8c33caae0ada81f80ac48d96852` |
| Щоденний AI-аналіз голосових розмов.json | 7 | `971e55528e6784995627c2a12a048b2b3b4f5c482ffd01993e9d85afe03acff5` |
| Щотижневий AI-звіт для CEO.json | 10 | `2d96988fe8a369698c0d04cb6f8b06015b7953d19e8f7fb933c29ad2268890c1` |

Preparation verified one shared workbook and two distinct tabs across all three source exports, with 29 nodes, 5 Code nodes and 12 credential-bound nodes. Original files and live workflows were not edited.

All graph edges and non-deployment node parameters were compared with the originals during preparation. Security changes are described in [SECURITY.md](../SECURITY.md); source behavior findings are in [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md).

## Required integration validation remains separate

Import compatibility, linked-item behavior, HTTP contracts, provider authentication, actual scheduler behavior, callback replay protection, AI quality, end-to-end call completion and Telegram delivery require an authorized isolated integration test. No production activation or client-result claim follows from this offline suite.
