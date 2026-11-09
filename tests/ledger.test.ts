import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Ledger, Conflict, currentRun, type TaskStore } from '../src/core.ts';
import type { Task } from '../src/schema.ts';
import { commandSchema } from '../src/schema.ts';
import { en, zh } from '../src/locales.ts';

function setup(limits={maxTasks:20,maxRunsPerTask:10}) {
  const rows=new Map<string,Task>();let fail=false;
  const store:TaskStore={list:()=>[...rows.values()],get:id=>rows.get(id),put:async task=>{if(fail)throw new Error('disk unavailable');rows.set(task.id,structuredClone(task));}};
  const ledger=new Ledger(store,limits);
  const create=(botId='research')=>ledger.create({id:randomUUID(),botId,botCreatedAt:1,title:'Compare sources',objective:'Return two checked references',criteria:['Sources exist','Claims match sources']});
  return {ledger,rows,create,fail:()=>{fail=true;}};
}
test('creation deduplicates one request and rejects changed payload',async()=>{
  const {ledger,create}=setup(),task=await create();
  assert.equal((await ledger.create({...task,criteria:task.criteria.map(c=>c.text)})).id,task.id);
  await assert.rejects(ledger.create({...task,title:'Changed',criteria:task.criteria.map(c=>c.text)}),Conflict);
  assert.equal(ledger.list().length,1);
});
test('optimistic revision prevents a stale edit',async()=>{
  const {ledger,create}=setup(),t=await create();
  await ledger.update(t.id,0,d=>{d.paused=true;});
  await assert.rejects(ledger.update(t.id,0,d=>{d.paused=false;}),Conflict);
  assert.equal(ledger.get(t.id).paused,true);
});
test('failed persistence does not publish the edited draft',async()=>{
  const s=setup(),t=await s.create();s.fail();
  await assert.rejects(s.ledger.update(t.id,0,d=>{d.objective='lost';}));
  assert.equal(s.ledger.get(t.id).objective,t.objective);
});
test('concurrent claims for one Bot admit only one run',async()=>{
  const {ledger,create}=setup(),a=await create(),b=await create();
  const outcomes=await Promise.allSettled([ledger.reserve(a.id,0,randomUUID(),2),ledger.reserve(b.id,0,randomUUID(),2)]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
});
test('global concurrency cap is checked inside the writer queue',async()=>{
  const {ledger,create}=setup(),a=await create('a'),b=await create('b');
  const results=await Promise.allSettled([ledger.reserve(a.id,0,randomUUID(),1),ledger.reserve(b.id,0,randomUUID(),1)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('a repeated start identity cannot replay a completed run',async()=>{
  const {ledger,create}=setup(),t=await create(),op=randomUUID();
  await ledger.reserve(t.id,0,op,2);
  await ledger.update(t.id,undefined,d=>{currentRun(d)!.state='submitted';});
  await ledger.reserve(t.id,0,op,2);
  assert.equal(ledger.get(t.id).runs.length,1);
});
test('submission is session-bound, checks evidence identity and never accepts',async()=>{
  const {ledger,create}=setup(),t=await create();await ledger.reserve(t.id,0,randomUUID(),2);
  await ledger.update(t.id,undefined,d=>{currentRun(d)!.sessionId='s1';currentRun(d)!.state='running';});
  await assert.rejects(ledger.submit(t.id,'wrong','call','Result',[]));
  await assert.rejects(ledger.submit(t.id,'s1','call','Result',[{criterionId:randomUUID(),note:'x',reference:'x'}]));
  const result=await ledger.submit(t.id,'s1','call','Result',[]);
  assert.equal(currentRun(result)!.state,'running');assert.equal(currentRun(result)!.review,'pending');
});
test('acceptance needs a finished result, evidence and all explicit checks',async()=>{
  const {ledger,create}=setup(),t=await create(),op=randomUUID();await ledger.reserve(t.id,0,op,2);
  await ledger.update(t.id,undefined,d=>{const r=currentRun(d)!;r.state='submitted';r.review='pending';});
  let now=ledger.get(t.id);
  await assert.rejects(ledger.review(t.id,now.revision,op,'accepted','',t.criteria.map(c=>c.id)));
  now=await ledger.update(t.id,undefined,d=>{currentRun(d)!.evidence=d.criteria.map(c=>({criterionId:c.id,note:'Checked',reference:'https://example.org/source'}));});
  await assert.rejects(ledger.review(t.id,now.revision,op,'accepted','',[]));
  const accepted=await ledger.review(t.id,now.revision,op,'accepted','Checked sources',t.criteria.map(c=>c.id));
  assert.equal(currentRun(accepted)!.review,'accepted');
});
test('recovery retains results, marks interruption and prevents replay',async()=>{
  const {ledger,create,rows}=setup(),t=await create();await ledger.reserve(t.id,0,randomUUID(),2);
  await ledger.update(t.id,undefined,d=>{const r=currentRun(d)!;r.state='running';r.summary='Partial external result';});
  const cold=new Ledger({list:()=>[...rows.values()],get:id=>rows.get(id),put:async v=>{rows.set(v.id,structuredClone(v));}},{maxTasks:20,maxRunsPerTask:10});
  await cold.recover();const restored=cold.get(t.id);assert.equal(currentRun(restored)!.state,'uncertain');
  assert.equal(currentRun(restored)!.summary,'Partial external result');
  await assert.rejects(cold.reserve(t.id,restored.revision,randomUUID(),2));
});
test('archived and paused tasks cannot run, history is bounded',async()=>{
  const {ledger,create}=setup({maxTasks:2,maxRunsPerTask:1}),t=await create();
  const paused=await ledger.update(t.id,0,d=>{d.paused=true;});await assert.rejects(ledger.reserve(t.id,paused.revision,randomUUID(),2));
  const ready=await ledger.update(t.id,paused.revision,d=>{d.paused=false;});await ledger.reserve(t.id,ready.revision,randomUUID(),2);
  const done=await ledger.update(t.id,undefined,d=>{currentRun(d)!.state='cancelled';});await assert.rejects(ledger.reserve(t.id,done.revision,randomUUID(),2));
});
test('wire parser rejects model-shaped acceptance and unknown properties',()=>{
  assert.equal(commandSchema.safeParse({action:'review',taskId:randomUUID(),revision:0,runId:randomUUID(),decision:'accepted',note:'',checkedCriteria:[],modelApproved:true}).success,false);
  assert.deepEqual(Object.keys(en).sort(),Object.keys(zh).sort());
});
test('pending acceptance cannot be overwritten by a new run',async()=>{
  const {ledger,create}=setup(),t=await create();await ledger.reserve(t.id,0,randomUUID(),2);
  const pending=await ledger.update(t.id,undefined,d=>{currentRun(d)!.state='submitted';currentRun(d)!.review='pending';});
  await assert.rejects(ledger.reserve(t.id,pending.revision,randomUUID(),2));
  assert.equal(ledger.get(t.id).runs.length,1);
});
