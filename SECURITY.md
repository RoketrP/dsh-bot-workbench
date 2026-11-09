# Security and data handling

Supported release candidate: 0.1.0-rc.1 on the exact declared Host version.

This extension runs with the Host's local permissions. Bot workspaces and private memory are organizational boundaries, not a sandbox. The extension adds no telemetry, remote server, credential store or external-message connector. Native model/tool data flows and any other installed plugins remain the Host user's responsibility.

Model output, memory candidates and imported records are untrusted data. Models receive no Workbench accept/reconcile management tool. Results require human checks; import cannot grant execution or acceptance authority. This does not prevent a fully privileged native agent from using other local tools outside the Workbench workflow.

Keep credentials out of roles, memory, issues, exports and screenshots. Report security concerns through the repository's **Security → Report a vulnerability** channel when available. If that channel is unavailable, open a minimal issue requesting a private contact without publishing exploit details or sensitive data.

Release candidates bundle their own Zod client runtime and use patched direct runtime dependency versions. Host-supplied packages and other plugins have their own dependency graph; this project's checks are not a security audit of the Host installation. See THIRD_PARTY_NOTICES.md and docs/verification.md.
