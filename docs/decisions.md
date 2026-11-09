# Implementation decisions — 2026-11-09

1. Research found MJ-CJM/DSH-Bot 0.6.5 already implements personal Bots, memory, groups and background work. Our incremental feature set is task acceptance, explicit handoff context and interrupted-run reconciliation.
2. Its release peer ranges accept the 0.2.1 prerelease tuple but exclude 0.2.2-rc.1. An ordinary npm installation together with current Harness rejected this combination. We did not force the peer resolver. Harness 0.2.1-rc.5 plus the original package installed in a separate development directory.
3. The user's actual desktop About panel shows Harness 0.2.2-rc.1. The existing Bots entry belongs to a separate Bot roster plugin; it is not MJ-CJM/DSH-Bot. It remains untouched.
4. To support the actual desktop without redistributing a patched third-party release, use native Harness presets, storage and schedule APIs. Bot role/confirmed memory are scoped to the assigned preset's agent. No private upstream source imports. The public readDocument/Loader row validation/register pattern follows the MIT-licensed reference, attributed separately.
5. The 0.2.2 native Schedule API differs from 0.2.1; the implementation is pinned to the tested tuple and uses create({timing,target}) and edit({action:'delete'}). No cross-version support is implied.
6. Scheduled instructions contain only a workbench receipt request. Task execution requires the live plugin tool, the stored session binding and a native schedule-source message in the current turn. Missing plugin or stale binding must not trigger a fallback ordinary task.
7. No new daemon, cloud service, remote-control listener or provider credentials are introduced. The user's existing plugin and task configuration are not replaced.
