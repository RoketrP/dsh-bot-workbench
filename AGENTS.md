# Workbench development

Work only in this repository. Reference checkouts and host installations are read-only except for isolated test profiles under the parent workspace's work/ directory. Do not read or modify the user's ~/.dsh. Use public Harness APIs; never import upstream internal source paths.

This is an independent Harness extension, not a renamed fork of MJ-CJM/DSH-Bot. Preserve upstream attribution when adapting integration examples. Do not claim native Host, browser, desktop, real-model, release-package or marketplace checks from unit tests. Record those layers separately.

Use project-local toolchains. Run npm run check and relevant integration checks before release. Keep credentials, generated user data, private logs and local machine paths out of Git. UI acceptance and model-submitted results are separate; models must not have an accept/reconcile tool. An uncertain run is never replayed automatically.
