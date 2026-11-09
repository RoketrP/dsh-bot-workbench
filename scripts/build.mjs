import { build } from "esbuild";
import { mkdir, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";

await rm("lib", { recursive: true, force: true });
await mkdir("lib", { recursive: true });
await build({
  entryPoints: ["src/host.ts"],
  outfile: "lib/host.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  sourcemap: true,
});
const external = ["react", "react/jsx-runtime", "@deepseek-ai/cordis"];
const clientBuild = await build({
  metafile: true,
  entryPoints: ["src/client.tsx"],
  outfile: "lib/client.js",
  bundle: true,
  platform: "browser",
  format: "cjs",
  jsx: "automatic",
  target: "es2023",
  external,
  loader: { ".css": "text" },
  sourcemap: true,
  banner: {
    js: 'window.__ModuleLoader__.load({id:"dsh-bot-workbench",factory(require){var module={exports:{}};var exports=module.exports;',
  },
  footer: { js: "return module.exports;}});" },
});
const json = JSON.parse(
  await (await import("node:fs/promises")).readFile("package.json", "utf8"),
);
await writeFile("lib/version.json", JSON.stringify({ version: json.version }));
console.log("Built Host and native client bundles.");

const packages = new Map();
for (const path of Object.keys(clientBuild.metafile.inputs).filter((p) =>
  p.startsWith("node_modules/"),
)) {
  let dir = dirname(path);
  while (dir !== ".") {
    try {
      const metadata = JSON.parse(
        await readFile(join(dir, "package.json"), "utf8"),
      );
      if (metadata.name && metadata.version) {
        packages.set(metadata.name, { ...metadata, dir });
        break;
      }
    } catch {}
    dir = dirname(dir);
  }
}
let notices = await readFile("docs/attribution-base.md", "utf8");
for (const pkg of [...packages.values()].sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  const files = (await readdir(pkg.dir)).filter((f) =>
    /^licen[sc]e(?:\.|$)/i.test(f),
  );
  if (!files.length) throw new Error(`Missing bundled license: ${pkg.name}`);
  notices += `\n\n## Bundled ${pkg.name} ${pkg.version} (${pkg.license ?? "see license"})\n\n`;
  for (const file of files)
    notices += await readFile(join(pkg.dir, file), "utf8");
}
await writeFile("THIRD_PARTY_NOTICES.md", notices);
console.log(
  "Checked bundled license notices:",
  [...packages.keys()].join(", "),
);
