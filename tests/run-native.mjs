import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  realpath,
  copyFile,
  readdir,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.DSH_TEST_CLI)
  throw new Error(
    "Set DSH_TEST_CLI to the installed Harness 0.2.2-rc.1 executable. See docs/verification.md.",
  );
const cli = await realpath(process.env.DSH_TEST_CLI),
  pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const tarball = process.argv[2]
  ? resolve(process.argv[2])
  : join(root, "dist", `${pkg.name}-${pkg.version}.tgz`);
await mkdir(join(root, ".runtime"), { recursive: true });
const dir = await mkdtemp(join(root, ".runtime", "native-"));
const home = join(dir, "home"),
  profile = join(home, "profiles", "probe"),
  workspace = join(dir, "workspace");
await mkdir(profile, { recursive: true });
await mkdir(workspace, { recursive: true });
const env = {
  ...process.env,
  DSH_HOME: home,
  DSH_AGENTS_HOME: join(dir, "instructions"),
  PATH: dirname(process.execPath) + ":" + process.env.PATH,
};
let current;
function child(args, label) {
  let log = "";
  const p = spawn(process.execPath, [cli, ...args], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", (b) => (log += b));
  p.stderr.on("data", (b) => (log += b));
  const done = new Promise((r, j) => {
    p.on("error", j);
    p.on("exit", (code, signal) => r({ code, signal }));
  });
  return { p, done, save: () => writeFile(join(dir, label + ".log"), log) };
}
async function command(args, label) {
  const c = child(args, label),
    r = await c.done;
  await c.save();
  if (r.code !== 0)
    throw new Error(`${label} failed; inspect the private test log.`);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function stop(signal = "SIGINT") {
  if (!current) return;
  const c = current;
  current = undefined;
  c.p.kill(signal);
  const r = await Promise.race([c.done, delay(15000).then(() => null)]);
  await c.save();
  if (!r) {
    c.p.kill("SIGKILL");
    await c.done;
    throw new Error("Host did not close gracefully");
  }
}
async function phase(label, config) {
  const output = join(dir, label + ".json");
  const disabled = [
    "llm-deepseek",
    "llm-deepseek-account",
    "llm-pi-ai",
    "session-title-llm",
    "llm-retry",
    "session-log-deepseek",
    "session-telemetry-otel",
    "desktop-product-telemetry",
    "product-analytics",
  ].map((id) => ({ id, disabled: true }));
  const patch = [
    ...disabled,
    {
      id: "agent-default-model",
      config: { provider: "workbench-fixture", model: "fixture" },
    },
    { id: "approval", config: { policy: "ask" } },
    {
      insert: [
        {
          id: "workbench-probe",
          name: join(root, "tests", "host-probe.mjs"),
          config: { workspace, output, ...config },
        },
      ],
    },
  ];
  await writeFile(
    join(profile, "cordis.patch.yml"),
    yaml.dump(patch, { lineWidth: -1 }),
  );
  current = child(
    ["--profile", "probe", "--no-open", "--host", "127.0.0.1", "--port", "0"],
    label,
  );
  let result;
  for (let i = 0; i < (config.timer ? 2400 : 1200); i++) {
    try {
      result = JSON.parse(await readFile(output, "utf8"));
      break;
    } catch {}
    if (current.p.exitCode !== null)
      throw new Error(`${label}: Host exited; inspect the private log.`);
    await delay(50);
  }
  if (!result) throw new Error(`${label}: no receipt after 60 seconds`);
  assert.ok(
    ["PASS", "CRASH_READY"].includes(result.status),
    JSON.stringify(result),
  );
  console.log(`${label}: ${result.status}`);
  return result;
}
try {
  await writeFile(
    join(profile, "package.json"),
    JSON.stringify(
      {
        name: "dsh-profile-probe",
        private: true,
        dependencies: {},
        dsh: {
          profile: {
            bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"],
          },
        },
      },
      null,
      2,
    ),
  );
  await writeFile(join(profile, "cordis.yml"), "[]\n");
  await writeFile(
    join(profile, "pnpm-workspace.yaml"),
    "packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\n",
  );
  await command(
    ["plugin", "--profile", "probe", "add", tarball],
    "clean-install",
  );
  const hot = await phase("hot", {});
  await stop();
  const cold = await phase("cold", { cold: true });
  assert.equal(cold.calls, 0);
  await stop();
  const timer = await phase("timer", { timer: true });
  await stop();
  const lifecycle = await phase("lifecycle-before", { lifecycleBefore: true });
  await stop();
  const taskFile = join(
    home,
    "storages",
    "bot_workbench",
    "tasks",
    lifecycle.taskId + ".json",
  );
  const retained = JSON.parse(await readFile(taskFile, "utf8"));
  assert.equal(retained.record.schedule.suspendedByPlugin, true);
  const recordsBefore = (
    await readdir(join(home, "storages", "bot_workbench", "tasks"))
  ).length;
  await command(
    ["plugin", "--profile", "probe", "remove", "dsh-bot-workbench"],
    "uninstall",
  );
  assert.equal(
    (await readdir(join(home, "storages", "bot_workbench", "tasks"))).length,
    recordsBefore,
  );
  assert.deepEqual(JSON.parse(await readFile(taskFile, "utf8")), retained);
  await command(["plugin", "--profile", "probe", "add", tarball], "reinstall");
  const resumed = await phase("lifecycle-after", {
    lifecycleAfter: true,
    taskId: lifecycle.taskId,
  });
  await stop();
  const crash = await phase("crash", { crash: true });
  assert.equal(crash.pid, current.p.pid);
  await stop("SIGKILL");
  const recovery = await phase("recovery", {
    cold: true,
    crashTaskId: crash.taskId,
  });
  assert.equal(recovery.calls, 0);
  await stop();
  const report = {
    status: "PASS",
    version: pkg.version,
    hostVersion: hot.hostVersion,
    realModelRequests: 0,
    phases: {
      hot: { ...hot, taskId: undefined, sessionId: undefined },
      cold,
      headlessTimerDelivery: timer.nativeReceiptMatched,
      gracefulScheduleSuspension: true,
      uninstallPreservedRecords: true,
      reinstallResumedOwnedSchedule: resumed.resumed,
      forcedLossRecoveredUncertain: recovery.status === "PASS",
      stoppedBeforeAdmission: hot.stoppedBeforeAdmission === true,
    },
    timestamp: new Date().toISOString(),
  };
  await writeFile(join(dir, "report.json"), JSON.stringify(report, null, 2));
  if (process.env.DSH_TEST_REPORT)
    await copyFile(
      join(dir, "report.json"),
      resolve(process.env.DSH_TEST_REPORT),
    );
  console.log(
    "Native package verification PASS. No real model requests. Private fixtures retained under .runtime/.",
  );
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
} finally {
  await stop();
}
