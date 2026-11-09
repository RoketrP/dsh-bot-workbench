# Verification status

This file records checks actually completed; planned checks are not passes.

## Environment observations

- Project-local Node executable: 24.22.1, verified by running it. The default Homebrew Node failed because of a missing shared library; global installation was not changed.
- Published Harness 0.2.2-rc.1 installed in an isolated development directory; CLI --version returned 0.2.2-rc.1.
- Harness 0.2.1-rc.5 and original DSH-Bot 0.6.5 installed in another isolated directory. This is dependency installation evidence only.
- User desktop inspected using Computer Use: About panel displays DeepSeek Harness 0.2.2-rc.1. Existing Bot roster and other plugins were left unchanged.

## Completed development checks

- Typecheck and Host/client bundle build passed.
- 12 core behavior tests passed: optimistic edits, failed writes, concurrency, result ownership, acceptance evidence, bounded history and interruption recovery.
- Real 0.2.2-rc.1 Host with a scripted model passed Bot creation, confirmed-memory injection, task execution, native approval and separated acceptance. Real model requests: 0.
- Cold Host reopened persistent Bot/task/memory state with 0 model requests.
- Computer Use in isolated Chrome verified task creation, execution, evidence checkboxes and human acceptance. A missing Remote dependency lookup was found, fixed, rebuilt and retested. Chrome translation altered some visible text; native desktop validation remains separate.

## Pending release gates

- Full execution with a scripted model; approval, schedule, restart and uninstall.
- Native desktop installation and visual task flow.
- Real DeepSeek model task.
- Release archive clean-install and upgrade verification.
- Public repository, release and marketplace submission.

No real-model or marketplace completion is claimed.
