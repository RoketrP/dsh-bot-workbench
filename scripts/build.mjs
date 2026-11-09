import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';

await rm('lib', { recursive: true, force: true }); await mkdir('lib', { recursive: true });
await build({ entryPoints: ['src/host.ts'], outfile: 'lib/host.js', bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', sourcemap: true });
const external = ['react','react/jsx-runtime','@deepseek-ai/cordis','zod'];
await build({ entryPoints: ['src/client.tsx'], outfile: 'lib/client.js', bundle: true, platform: 'browser', format: 'cjs', jsx: 'automatic', target: 'es2023', external, loader: { '.css':'text' }, sourcemap: true,
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-bot-workbench",factory(require){var module={exports:{}};var exports=module.exports;' },
  footer: { js:'return module.exports;}});' },
});
const json = JSON.parse(await (await import('node:fs/promises')).readFile('package.json','utf8'));
await writeFile('lib/version.json',JSON.stringify({version:json.version}));
console.log('Built Host and native client bundles.');
