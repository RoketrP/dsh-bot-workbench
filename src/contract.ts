import { z } from 'zod';
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info';
import type { RemoteResult, TypertRemoteSpec } from '@deepseek-ai/dsh-typert-protocol';
import { commandSchema, snapshotSchema, type Command, type Snapshot } from './schema.ts';

const codec = <T extends z.ZodType>(name: string, schema: T) => ({
  mode: 'strict' as const, typeSymbol: `dsh-bot-workbench#${name}`, create: () => schema,
  encode: (value: unknown) => schema.parse(value), decode: (value: unknown) => schema.parse(value),
});
const input = codec('Command', commandSchema), output = codec('Snapshot', snapshotSchema);
const owner = { service: 'botWorkbench', invocation: { kind: 'direct' as const } };
export const spec = {
  package: 'dsh-bot-workbench', methods: {
    'botWorkbench/snapshot': { ...owner, parameters: [], result: output },
    'botWorkbench/command': { ...owner, parameters: [{ name: 'command', source: 'json', codec: input, strictCodec: input }], result: output },
  },
} satisfies TypertRemoteSpec;
export const REMOTE = createTypertRemoteInfo(spec, z);
export const HOST = { package: 'dsh-bot-workbench', face: 'host' as const, schemas: [],
  get invocations() { return REMOTE.descriptors; }, model: { services: [], events: [], objects: [] } };
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'botWorkbench/snapshot': () => Promise<RemoteResult<Snapshot>>;
    'botWorkbench/command': (command: Command) => Promise<RemoteResult<Snapshot>>;
  }
  interface TypertRemoteNamespaceMap {
    botWorkbench: { snapshot(): Promise<RemoteResult<Snapshot>>; command(command: Command): Promise<RemoteResult<Snapshot>> };
  }
}
