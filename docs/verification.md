# Verification / 验证矩阵

Evidence is version-specific. A scripted model is not a real DeepSeek model; a passing CI run is not marketplace acceptance.

## Completed local checks

| Layer | Version / environment | Result |
| --- | --- | --- |
| Typecheck, Host/client build, 19 behavior tests | rc.1 source, Node 24.22.1, macOS | PASS |
| Clean tarball install in a newly created profile | rc.1 / Harness 0.2.2-rc.1 | PASS |
| Native Bot, memory, task, approval, review and correction feedback | rc.1 / scripted model | PASS; no real model requests |
| Private-memory isolation, explicit handoff, editing, paused idempotent import | rc.1 / scripted model | PASS |
| Native daily schedule with Asia/Shanghai; manual interval delivery | rc.1 / scripted model | PASS |
| Real native timer after 60 seconds, without a browser | rc.1 / scripted model | PASS; receipt identity matched the new task run |
| Cold state recovery | rc.1 / native Host | PASS; zero model calls on cold reopen |
| Graceful shutdown, uninstall, reinstall | rc.1 / native Host | PASS; owned schedule suspended, records retained, owned schedule resumed on reinstall |
| Forced process loss during an active model stream | rc.1 / native Host | PASS; recovered uncertain, zero model calls on restart |
| Stop while native session creation is still pending | rc.1 / real native creation with a test gate | PASS; cancelled before task prompt admission, no extra model call |
| Web task creation, evidence checks and acceptance | alpha.2–alpha.4 / Chrome / Harness 0.2.2-rc.1 | PASS |
| Web memory add/edit, Escape focus return, 390×844 layout | alpha.4 / Chrome | PASS |
| Desktop install, enable, Bot/memory/task UI | alpha.3 / user's Harness 0.2.2-rc.1 | PASS |
| Real DeepSeek model reads two local sample files and submits evidence | alpha.3 / desktop / DeepSeek-V4.1-Flash High | PASS; 4 native steps, human-reviewed sample result |
| Assistant-first home, message delivery into native conversation, memory search/edit, task review drawer, daily-plan creation/removal and 390×844 layout | rc.1 / Chrome / scripted fixture | PASS |
| Desktop alpha.3 → rc.1 install and enable | user's Harness 0.2.2-rc.1 | PASS; existing Bot, confirmed memory and accepted sample retained |
| New home composer → native main conversation | rc.1 / desktop / DeepSeek-V4.1-Flash High | PASS; reply follows retained format preference, one native step |
| Native 60-second plan → real model → evidence submission | rc.1 / desktop / DeepSeek-V4.1-Flash High | PASS; timer delivered at 2026-11-09 22:44:15 Asia/Shanghai, 5 native steps, submitted at 22:44:26 |
| Review and temporary-plan removal | rc.1 / desktop | PASS; checked sample file lines 3–4, recorded test-only acceptance, plans page empty |
| GitHub macOS check and full native package integration | fad4d24 / Node 24.22.1 | [PASS](https://github.com/RoketrP/dsh-bot-workbench/actions/runs/42635663683) |

The real-model test used non-sensitive artificial source files in a dedicated directory. References and the 10:00–11:00 intersection were checked against those files. The separate conversational answer included an inaccurate “no overlap” phrase; the submitted evidence and intersection were correct. Model correctness is not guaranteed by this workflow.

Native scripted-model receipts are summarized in [native-test-report.json](native-test-report.json). The rc.1 desktop scheduled result correctly cited source-a.md:3 (09:00–11:00), source-b.md:3 (10:00–12:00), and their shared Asia/Shanghai time zone. The intersection was checked as 10:00–11:00. This is an artificial local integration sample, not a benchmark of model reliability. Its temporary plan was removed before closing the verification.

The installed rc.1 Host/client JavaScript and bundle patch matched the local release build byte-for-byte. The final tarball refreshes documentation and screenshot assets; it is not the identical archive originally installed for desktop verification. Screenshots show rc.1 assistant-first UI with isolated scripted examples, not the user's private data or real-model session. Native screenshot capture still returned a minimized-window thumbnail after successful accessibility-based actions; no such thumbnail is presented as a valid full-window screenshot.

## Release and marketplace status

The [rc.1 release](https://github.com/RoketrP/dsh-bot-workbench/releases/tag/v0.1.0-rc.1) provides the prebuilt tarball and SHA256SUMS.txt. Release-asset download/integrity is recorded separately from source and native test results in its release notes.

Marketplace application is not yet submitted. The repository was created at 2026-11-09T13:08:39Z, so the earliest time satisfying the current one-day age rule is 2026-11-10 21:08:39 Asia/Shanghai. The topic and installable bundle are present; submission materials are prepared separately. Submission, CI, merge and storefront visibility remain separate outcomes.

Linux and Windows have not been validated. No external sending, purchasing, deployment or real-recipient action was exercised.

## Reproduce the native package test

Use Node ≥24.9 and the exact Host version. The default Node installation on the development Mac had a missing shared library; a project-local verified Node 24.22.1 was used, without changing the global installation.

```sh
npm ci --ignore-scripts
npm run check
npm run format:check
mkdir -p dist .runtime/harness
npm run pack:plugin
npm install --prefix .runtime/harness --ignore-scripts @deepseek-ai/dsh@0.2.2-rc.1 pnpm@11.22.0
DSH_TEST_CLI="$PWD/.runtime/harness/node_modules/.bin/dsh" npm run test:native
```

The runner creates its own DSH_HOME, instructions directory, workspace and profile under .runtime/. It installs the actual tarball through the native plugin CLI, uses only a scripted LLM adapter, observes native approval events, exercises a real timer, uninstalls/reinstalls, then kills only its own Host child for recovery verification. Cold restarts must issue zero model calls. Test logs may contain local authentication links, so .runtime/ stays untracked and only a sanitized result summary may be published.

## Dependency check boundaries

Direct js-yaml and Zod versions were updated after registry advisories were found. The client bundles its own patched Zod runtime; its license is included. The development graph unifies Zod types through a local override to avoid cross-version structural-type expansion. This does not replace the Host's own Zod or modify the user's other plugins.

[JS-YAML advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh) · [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)

A package audit covers the resolved development/runtime graph at its reported date; it is not a security audit of the user's Host, other plugins, model output or external services.
