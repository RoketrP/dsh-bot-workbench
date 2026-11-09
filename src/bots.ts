import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include';
import { entryListProblem, type PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry';
import { load } from 'js-yaml';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Domain } from '@deepseek-ai/dsh-storage-domain';
import { domainSpec } from './persistence.ts';
import type { Bot } from './schema.ts';

/** Native preset adapter. Does not read or modify any other Bot plugin's data. */
export class NativeBots {
  private disposers = new Map<string, () => Promise<void>>();
  constructor(private ctx: Context, readonly domain: Domain<typeof domainSpec>) {}
  list() { return Promise.resolve([...this.domain.table('bots').entries()].map(([,b])=>structuredClone(b))); }
  get(id: string) { const value=this.domain.table('bots').get(id);if(!value)throw new Error('Bot not found');return Promise.resolve(structuredClone(value)); }
  forAgent(agent: Agent) { const preset=agent.session.header.agentPreset;return [...this.domain.table('bots').entries()].map(([,b])=>b).find(b=>this.presetId(b.id)===preset); }
  presetId(id:string) { return `workbench-${id}`; }
  async status() { const roster=await this.ctx.agentPresets.list(); return (await this.list()).map(b=>({id:b.id,presetId:this.presetId(b.id),preset:{state:roster.some(r=>r.id===this.presetId(b.id)&&!r.broken)?'ok':'broken'}})); }
  async start() { for(const bot of await this.list())await this.register(bot); }
  private async register(bot:Bot) {
    const document=await this.ctx.agentPresets.readDocument('standard');
    const value:unknown=load(document.content,{schema:entryListSchema});
    const problem=entryListProblem(value);if(problem)throw new Error(problem);
    // The public parser above validates the Loader row vocabulary before crossing this type boundary.
    const plugins=value as PresetDefinition['plugins'];
    const dispose=await this.ctx.agentPresets.register({id:this.presetId(bot.id),name:bot.name,description:bot.description,order:80,plugins});
    this.disposers.set(bot.id,dispose);
  }
  async create(input:{name:string;persona:{prefix:string};defaultCwd?:string}) {
    if(!input.defaultCwd)throw new Error('A workspace directory is required');
    const bot:Bot={id:randomUUID(),name:input.name,description:input.persona.prefix.slice(0,180),persona:input.persona.prefix,defaultCwd:input.defaultCwd,paused:false,createdAt:Date.now()};
    await this.register(bot);
    try { await this.domain.table('bots').put(bot.id,bot);return bot; }
    catch(error){await this.disposers.get(bot.id)?.();this.disposers.delete(bot.id);throw error;}
  }
  async close(){for(const dispose of this.disposers.values())await dispose();this.disposers.clear();}
}
