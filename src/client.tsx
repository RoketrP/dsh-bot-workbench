import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { REMOTE } from './contract.ts';
import { en, zh, type TextKey } from './locales.ts';
import { activeStates, type Command, type Snapshot, type Task } from './schema.ts';
import css from './style.css';

export const name = 'dsh-bot-workbench-client';
export const inject = ['slots', 'locale', 'remote', 'layout', 'uiWorkspace'];
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'bot-workbench': TextKey } }
type Translate = (key: TextKey) => string;
type PageProps = { api: { load(): Promise<Snapshot>; command(command: Command): Promise<Snapshot> }; translate: Translate; openBots(): void; openSession(id: string): void };

export function WorkbenchPage({ api, translate: t, openBots, openSession }: PageProps) {
  const [snapshot, setSnapshot] = useState<Snapshot>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [selected, select] = useState(''), [filter, setFilter] = useState('all'), [dialog, setDialog] = useState<'task' | 'bot' | 'memory' | null>(null);
  const generation = useRef(0), commandBusy = useRef(false);
  async function refresh() {
    const ticket = ++generation.current;
    try { const value = await api.load(); if (ticket === generation.current) { setSnapshot(value); setError(''); } }
    catch (e) { if (ticket === generation.current) setError(e instanceof Error ? e.message : t('error')); }
  }
  useEffect(() => {
    let active = true;
    async function poll() { if (active && !document.hidden && !commandBusy.current) await refresh(); }
    void poll(); const timer = setInterval(() => { void poll(); }, 2500);
    return () => { active = false; generation.current++; clearInterval(timer); };
  }, [api]);
  async function command(c: Command) {
    if (commandBusy.current) return;
    commandBusy.current = true; setBusy(true); const ticket = ++generation.current;
    try { const next = await api.command(c); if (ticket === generation.current) { setSnapshot(next); setError(''); } return true; }
    catch (e) { setError(e instanceof Error ? e.message : t('error')); return false; }
    finally { commandBusy.current = false; setBusy(false); }
  }
  const tasks = (snapshot?.tasks ?? []).filter(task => !task.archived).filter(task => {
    const run = task.runs.at(-1);
    if (filter === 'active') return run && activeStates.has(run.state);
    if (filter === 'review') return run?.review === 'pending';
    if (filter === 'uncertain') return run?.state === 'uncertain';
    return true;
  });
  const task = snapshot?.tasks.find(t => t.id === selected) ?? tasks[0];
  function exportRecords() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'bot-workbench-export', version: 1, exportedAt: new Date().toISOString(), tasks: snapshot?.tasks ?? [] }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'bot-workbench-records.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const status = (task: Task) => {const run=task.runs.at(-1);return task.paused?'paused':run?.state==='submitted'?run.review:run?.state??'draft';};
  return <div id="dsh-bot-workbench" translate="no" aria-busy={busy}>
    <header className="wb-header"><div><span className="wb-eyebrow">{t('companion')}</span><h1>{t('title')}</h1><p>{t('subtitle')}</p></div>
      <div className="wb-actions"><button onClick={()=>setDialog('memory')}>{t('bots')}</button><button onClick={exportRecords} disabled={!snapshot}>{t('export')}</button><button onClick={() => setDialog('bot')}>{t('newBot')}</button><button className="wb-primary" onClick={() => setDialog('task')} disabled={!snapshot?.bots.length}>{t('newTask')} ＋</button></div></header>
    {error ? <div className="wb-error" role="alert">{error}<button onClick={() => { void refresh(); }}>{t('refresh')}</button></div> : null}
    <nav className="wb-filters" aria-label={t('filter')}>{(['all','active','review','uncertain'] as const).map(key => <button key={key} className={filter === key ? 'is-selected' : ''} onClick={() => setFilter(key)}>{t(key)} <span>{key === 'all' ? snapshot?.tasks.filter(t => !t.archived).length ?? 0 : snapshot?.tasks.filter(task => { const r=task.runs.at(-1); return key==='active' ? r&&activeStates.has(r.state) : key==='review' ? r?.review==='pending' : r?.state==='uncertain'; }).length ?? 0}</span></button>)}</nav>
    {!snapshot ? <p>{t('waiting')}</p> : !tasks.length ? <section className="wb-empty"><div className="wb-empty-mark">↗</div><h2>{t('emptyTitle')}</h2><p>{snapshot.bots.length ? t('emptyText') : t('noBots')}</p><button onClick={() => setDialog(snapshot.bots.length ? 'task' : 'bot')}>{t(snapshot.bots.length ? 'newTask' : 'newBot')}</button></section> : <div className="wb-grid">
      <aside className="wb-list" aria-label={t('all')}>{tasks.map(item => <button key={item.id} className={`wb-task ${task?.id===item.id?'is-selected':''}`} onClick={() => select(item.id)}><span className="wb-task-number">{item.id.slice(0,8)}</span><strong>{item.title}</strong><span>{snapshot.bots.find(b=>b.id===item.botId)?.name ?? item.botId}</span><span className={`wb-state state-${status(item)}`}>{t(status(item) as TextKey)}</span></button>)}</aside>
      {task ? <TaskDetail key={task.id} task={task} snapshot={snapshot} t={t} busy={busy} command={command} openSession={openSession}/> : null}
    </div>}
    <footer>{t('limits')} <span>{t('version')} {snapshot?.version ?? '0.1.0-alpha.2'}</span></footer>
    {dialog ? <div className="wb-modal-backdrop"><section className="wb-modal" role="dialog" aria-modal="true" aria-label={t(dialog==='memory'?'memory':dialog==='task'?'newTask':'newBot')}>{dialog==='memory'&&snapshot?<MemoryPanel snapshot={snapshot} t={t} busy={busy} command={command} close={()=>setDialog(null)} chat={async(botId)=>{try{const next=await api.command({action:'chatBot',botId});setSnapshot(next);const id=next.bots.find(b=>b.id===botId)?.mainSessionId;if(id){setDialog(null);openSession(id);}}catch(e){setError(e instanceof Error?e.message:t('error'));}}}/>:dialog!=='memory'?<CreateForm type={dialog} snapshot={snapshot} t={t} busy={busy} cancel={()=>setDialog(null)} submit={async c=>{ if(await command(c)) { if(c.action==='create')select(c.operationId); setDialog(null); } }}/>:null}</section></div> : null}
  </div>;
}
function MemoryPanel({snapshot,t,busy,command,close,chat}:{snapshot:Snapshot;t:Translate;busy:boolean;command(c:Command):Promise<boolean|undefined>;close():void;chat(id:string):Promise<void>}){
  const [botId,setBot]=useState(snapshot.bots[0]?.id??''),[content,setContent]=useState('');
  const rows=snapshot.memories.filter(m=>m.botId===botId);
  return <div><h2>{t('memory')}</h2><p>{t('memoryHelp')}</p><Field label={t('owner')}><select value={botId} onChange={e=>setBot(e.target.value)}>{snapshot.bots.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><button disabled={!botId||busy} onClick={()=>{void chat(botId);}}>{t('chat')} ↗</button>{rows.map(m=><div className="wb-criterion" key={m.id}><span>•</span><div><p>{m.content}</p><span className="wb-state">{t(m.state)}</span><div className="wb-actions">{m.state==='candidate'?<button disabled={busy} onClick={()=>{void command({action:'memoryConfirm',memoryId:m.id});}}>{t('confirm')}</button>:null}<button disabled={busy} onClick={()=>{if(window.confirm(t('memoryHelp')))void command({action:'memoryForget',memoryId:m.id});}}>{t('forget')}</button></div></div></div>)}<Field label={t('memoryContent')}><textarea value={content} onChange={e=>setContent(e.target.value)} rows={3} maxLength={4000}/></Field><div className="wb-actions"><button onClick={close}>{t('cancel')}</button><button disabled={busy||!botId||!content.trim()} onClick={()=>{void command({action:'memoryAdd',botId,content}).then(ok=>{if(ok)setContent('');});}}>{t('memoryAdd')}</button></div></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="wb-field"><span>{label}</span>{children}</label>; }
function CreateForm({type,snapshot,t,busy,cancel,submit}: {type:'task'|'bot';snapshot?:Snapshot;t:Translate;busy:boolean;cancel():void;submit(c:Command):Promise<void>}) {
  const operationId=useRef(crypto.randomUUID());
  function send(e:FormEvent<HTMLFormElement>) {e.preventDefault(); const d=new FormData(e.currentTarget), value=(k:string)=>String(d.get(k)??'');
    void submit(type==='task'?{action:'create',operationId:operationId.current,botId:value('botId'),title:value('title'),objective:value('objective'),criteria:value('criteria').split('\n').map(v=>v.trim()).filter(Boolean)}:{action:'createBot',name:value('name'),persona:value('persona'),cwd:value('cwd')}); }
  return <form onSubmit={send}><h2>{t(type==='task'?'newTask':'newBot')}</h2>{type==='task'?<>
    <Field label={t('owner')}><select name="botId" required>{snapshot?.bots.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></Field>
    <Field label={t('taskTitle')}><input name="title" maxLength={120} required autoFocus/></Field>
    <Field label={t('objective')}><textarea name="objective" rows={4} maxLength={16000} required/></Field>
    <Field label={t('criteria')}><textarea name="criteria" rows={3} required/></Field>
  </>:<><Field label={t('name')}><input name="name" maxLength={64} required autoFocus/></Field><Field label={t('persona')}><textarea name="persona" rows={4}/></Field><Field label={t('cwd')}><input name="cwd" required placeholder="/…"/></Field></>}
  <div className="wb-actions"><button type="button" onClick={cancel}>{t('cancel')}</button><button className="wb-primary" disabled={busy}>{t('create')}</button></div></form>;
}
function TaskDetail({task,snapshot,t,busy,command,openSession}:{task:Task;snapshot:Snapshot;t:Translate;busy:boolean;command(c:Command):Promise<boolean|undefined>;openSession(id:string):void}) {
  const [checked,setChecked]=useState<string[]>([]),[note,setNote]=useState(''),[summary,setSummary]=useState('');
  const run=task.runs.at(-1),active=run&&activeStates.has(run.state), base={taskId:task.id,revision:task.revision};
  useEffect(()=>{setChecked([]);setNote('');setSummary('');},[run?.id]);
  function handoff(e:FormEvent<HTMLFormElement>){e.preventDefault(); const d=new FormData(e.currentTarget); void command({...base,action:'handoff',operationId:crypto.randomUUID(),botId:String(d.get('botId')),context:String(d.get('context'))});}
  function schedule(e:FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);void command({...base,action:'schedule',kind:d.get('kind')==='daily'?'daily':'every',time:String(d.get('time')),timeZone:String(d.get('zone')),everySeconds:Number(d.get('seconds'))});}
  return <main className="wb-detail"><div className="wb-detail-heading"><div><span className="wb-eyebrow">{task.id.slice(0,8)} · {snapshot.bots.find(b=>b.id===task.botId)?.name??task.botId}</span><h2>{task.title}</h2></div><div className="wb-actions"><button disabled={busy||active||task.paused||run?.state==='uncertain'||run?.review==='pending'} className="wb-primary" onClick={()=>{void command({...base,action:'start',operationId:crypto.randomUUID()});}}>{t('start')}</button>{active?<button disabled={busy} onClick={()=>{void command({...base,action:'stop'});}}>{t('stop')}</button>:null}</div></div>
    <p className="wb-objective">{task.objective}</p>
    <section><h3>{t('criteria').split('（')[0]}</h3>{task.criteria.map((c,i)=><div className="wb-criterion" key={c.id}><span className="wb-index">{String(i+1).padStart(2,'0')}</span><div><strong>{c.text}</strong>{run?.evidence.filter(e=>e.criterionId===c.id).map((e,j)=><div className="wb-evidence" key={j}><p>{e.note}</p><code>{e.reference}</code></div>)}{run?.review==='pending'?<label className="wb-check"><input type="checkbox" checked={checked.includes(c.id)} onChange={e=>setChecked(v=>e.target.checked?[...v,c.id]:v.filter(id=>id!==c.id))} disabled={!run.evidence.some(e=>e.criterionId===c.id)}/>{run.evidence.some(e=>e.criterionId===c.id)?t('checked'):t('noEvidence')}</label>:null}</div></div>)}</section>
    {run?<section><div className="wb-section-heading"><h3>{t('outcome')}</h3><span className={`wb-state state-${run.state}`}>{t(run.state as TextKey)} · {t(run.review as TextKey)}</span></div><p className="wb-result">{run.summary||'—'}</p>{run.note?<p className="wb-notice">{run.note}</p>:null}{run.sessionId?<button onClick={()=>openSession(run.sessionId!)}>{t('original')} ↗</button>:null}
      {run.state==='submitted'&&run.review==='pending'?<div className="wb-review"><Field label={t('note')}><textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}/></Field><div className="wb-actions"><button disabled={busy||!note.trim()} onClick={()=>{void command({...base,action:'review',runId:run.id,decision:'changes_requested',note,checkedCriteria:checked});}}>{t('changes')}</button><button className="wb-primary" disabled={busy||checked.length!==task.criteria.length} onClick={()=>{void command({...base,action:'review',runId:run.id,decision:'accepted',note,checkedCriteria:checked});}}>{t('accept')}</button></div></div>:null}
      {run.state==='uncertain'?<div className="wb-review"><p>{t('uncertainHelp')}</p><Field label={t('summary')}><textarea value={summary} onChange={e=>setSummary(e.target.value)}/></Field><Field label={t('note')}><textarea value={note} onChange={e=>setNote(e.target.value)} required/></Field><div className="wb-actions"><button disabled={busy||!note.trim()} onClick={()=>{void command({...base,action:'reconcile',runId:run.id,decision:'close_without_result',summary,note});}}>{t('closeRun')}</button><button disabled={busy||!note.trim()||!summary.trim()} onClick={()=>{void command({...base,action:'reconcile',runId:run.id,decision:'record_result',summary,note});}}>{t('reconcile')}</button></div></div>:null}
    </section>:null}
    <details><summary>{t('schedule')}{task.schedule?` · ${task.schedule.description}`:''}</summary><p>{t('scheduleHelp')}</p>{task.schedule?<button disabled={busy} onClick={()=>{void command({...base,action:'unschedule'});}}>{t('unschedule')}</button>:<form onSubmit={schedule} className="wb-form-grid"><Field label={t('schedule')}><select name="kind"><option value="daily">{t('daily')}</option><option value="every">{t('interval')}</option></select></Field><Field label={t('time')}><input type="time" name="time" defaultValue="09:00"/></Field><Field label={t('timezone')}><input name="zone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}/></Field><Field label={t('seconds')}><input name="seconds" type="number" min="60" defaultValue="3600"/></Field><button disabled={busy||active||task.paused||run?.state==='uncertain'}>{t('saveSchedule')}</button></form>}</details>
    <details><summary>{t('handoff')}</summary><p>{t('handoffText')}</p><form onSubmit={handoff}><Field label={t('owner')}><select name="botId">{snapshot.bots.filter(b=>b.id!==task.botId).map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></Field><Field label={t('context')}><textarea name="context" required rows={3}/></Field><button disabled={busy||active||!!task.schedule||run?.state==='uncertain'||snapshot.bots.length<2}>{t('saveHandoff')}</button></form></details>
    <details><summary>{t('history')} · {task.runs.length}</summary>{task.runs.length?task.runs.toReversed().map(r=><div className="wb-history" key={r.id}><strong>{t(r.state as TextKey)}</strong><time>{new Date(r.startedAt).toLocaleString()}</time><span>{r.steps} {t('steps')} · {r.tokens??'—'} {t('tokens')}</span></div>):<p>{t('noRuns')}</p>}</details>
    {task.handoffs.length?<details><summary>{t('handoffs')} · {task.handoffs.length}</summary>{task.handoffs.map(h=><div className="wb-history" key={h.id}><strong>{h.fromBotId} → {h.toBotId}</strong><p>{h.context}</p></div>)}</details>:null}
    <div className="wb-actions wb-bottom"><button disabled={busy} onClick={()=>{void command({...base,action:'pause',paused:!task.paused});}}>{t(task.paused?'resume':'pause')}</button><button disabled={busy||active||!!task.schedule} onClick={()=>{if(window.confirm(t('confirmArchive')))void command({...base,action:'archive'});}}>{t('archive')}</button></div>
  </main>;
}
function Icon({size}:PropsRuntime<'sidebar.panellist'>){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 9 2 2 5-5M8 16h8"/></svg>;}
export async function apply(ctx:Context) {
  ctx.effect(()=>ctx.locale.register('bot-workbench',{en,zh}),'workbench: dictionaries');
  await ctx.effect(()=>ctx.remote.$mount(REMOTE),'workbench: Remote');
  ctx.effect(()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);return()=>style.remove();},'workbench: styles');
  const translate=(key:TextKey)=>ctx.locale.bind('bot-workbench')(key);
  const remote=()=>{const value=ctx.get('remote.botWorkbench');if(!value)throw new Error('Workbench connection is not ready');return value;};
  const api={async load(){const r=await remote().snapshot();if(!r.ok)throw r.error;return r.value;},async command(c:Command){const r=await remote().command(c);if(!r.ok)throw r.error;return r.value;}};
  ctx.effect(()=>ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'bot-workbench',locale:'bot-workbench',inject:()=>({api,translate,openBots:()=>ctx.layout.selectPanel('dsh-bot' as MainPanelId),openSession:(id:string)=>ctx.uiWorkspace.openSession(id as SessionId)})},WorkbenchPage)),'workbench: page');
  ctx.effect(()=>ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'bot-workbench',order:21,locale:'bot-workbench',label:()=>translate('title')},Icon)),'workbench: navigation');
}
