# DeepSeek Bot Workbench

[中文](README.md) · English

A community DeepSeek Harness extension for personal Bots, acceptance criteria, explicit task handoffs and interrupted-run reconciliation.

**Development alpha. Not released or submitted to the marketplace yet.** See [verification](docs/verification.md) for evidence and [implementation decisions](docs/decisions.md) for scope. Initial target: Harness `0.2.2-rc.1`.

Model result submission is separate from user acceptance. Every criterion requires evidence and an explicit check. Interrupted work is not automatically replayed. Scheduled work requires a running Host. Bot workspaces are not security boundaries, and model-provided references need independent review.

Node.js >=24.9.0: `npm ci --ignore-scripts`, `npm run check`, then `npm run pack:plugin`. Native installation instructions and screenshots will be added after Host validation. Never commit credentials or private sessions.

MIT. See [third-party attribution](THIRD_PARTY_NOTICES.md). Not affiliated with DeepSeek or MJ-CJM/DSH-Bot.
