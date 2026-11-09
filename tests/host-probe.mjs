import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';

export const name='workbench-host-probe';
export const inject=['llm','loader','botWorkbench','sessionController','agents','sessions','webServer','schedule'];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export function apply(ctx,config){
  let calls=0,approvalCount=0,finished=false;
  class Adapter extends LlmAdapter{
    async listModels(provider){return [{provider,id:'fixture',name:'Scripted test model (not DeepSeek)'}];}
    async *stream(options){
      calls++;
      const text=JSON.stringify(options.messages), snap=await ctx.botWorkbench.snapshot();
      const task=snap.tasks.find(t=>text.includes(t.id));
      const run=task?.runs.at(-1);
      if(task?.objective==='CRASH_PROBE'){
        yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'Partial scripted output before forced process loss.'};
        await new Promise((_resolve,reject)=>{const abort=()=>reject(options.signal.reason??new Error('aborted'));if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});});return;
      }
      if(task?.schedule&&text.includes('workbench_schedule_receive')){
        const scheduled=ctx.agents.get(SessionId(task.schedule.sessionId));
        const source=scheduled?.session.snapshotEvents().findLast(e=>e.type==='user/message'&&e.data.source.kind==='schedule');
        if(source&&run?.requestId!==source.data.id){
          const id=ToolCallId(`receive-${source.data.id}`),args=JSON.stringify({taskId:task.id});
          yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name:'workbench_schedule_receive',argumentsDelta:args};
          yield {type:'block-end',index:0,block:{type:'tool-call',id,name:'workbench_schedule_receive',arguments:args}};yield {type:'finish',reason:{kind:'tool-calls'}};return;
        }
      }
      if(task&&run&&!run.submissionKey){
        const id=ToolCallId(`result-${run.id}`),args=JSON.stringify({summary:'SCRIPTED_RESULT: source comparison complete.',evidence:task.criteria.map(c=>({criterionId:c.id,note:'Scripted fixture evidence; not a real source check.',reference:'fixture://source-check'}))});
        yield {type:'block-start',index:0,blockType:'tool-call'};
        yield {type:'tool-call-delta',index:0,id,name:'workbench_submit',argumentsDelta:args};
        yield {type:'block-end',index:0,block:{type:'tool-call',id,name:'workbench_submit',arguments:args}};
        yield {type:'finish',reason:{kind:'tool-calls'}};return;
      }
      const reply=task?'Submitted for user review.':text.includes('WB_MEMORY_PROBE_SHORT')?'MEMORY_VISIBLE':'NO_MEMORY';
      yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:reply};
      yield {type:'block-end',index:0,block:{type:'text',text:reply}};yield {type:'finish',reason:{kind:'stop'}};
    }
  }
  ctx.effect(()=>ctx.llm.registerAdapter(['workbench-fixture'],new Adapter()),'fixture: scripted model');
  ctx.effect(()=>ctx.on('agent/created',async({agent})=>{
    agent.ctx.effect(()=>agent.ctx.on('tools/pre-execute',async(exec,next)=>{
      const decision=await next();if(exec.name!=='workbench_submit'||['deny','cancel'].includes(decision.kind))return decision;
      return {kind:'ask',reason:'Fixture: confirm result submission'};
    },{prepend:true}),'fixture: require native approval');
    agent.ctx.effect(()=>agent.ctx.on('approval/request',async(req,next)=>{
      if(req.toolName!=='workbench_submit')return next();approvalCount++;return 'allowed-once';
    },{prepend:true}),'fixture: answer only the synthetic result approval');
  }),'fixture: approval probe');
  const outcome=(async()=>{
    await ctx.loader.await();
    let snapshot=await ctx.botWorkbench.snapshot();
    if(config.crash){
      const bot=snapshot.bots[0],taskId=randomUUID();assert.ok(bot);
      await ctx.botWorkbench.command({action:'create',operationId:taskId,botId:bot.id,title:'强制中断恢复验证',objective:'CRASH_PROBE',criteria:['不自动重放不确定操作']});
      const t=(await ctx.botWorkbench.snapshot()).tasks.find(t=>t.id===taskId);
      await ctx.botWorkbench.command({action:'start',taskId,revision:t.revision,operationId:randomUUID()});
      for(let i=0;i<400;i++){
        snapshot=await ctx.botWorkbench.snapshot();const task=snapshot.tasks.find(t=>t.id===taskId),r=task.runs.at(-1);
        if(calls>0&&r?.sessionId&&r.steps>0){const agent=ctx.agents.get(SessionId(r.sessionId));assert.ok(await ctx.sessions.flush(agent.session));await writeFile(config.output,JSON.stringify({status:'CRASH_READY',pid:process.pid,taskId,sessionId:r.sessionId,calls,realModelRequests:0},null,2));console.log('WORKBENCH_CRASH_READY');return;}
        await pause(25);
      }throw new Error('Crash probe did not reach a live model stream');
    }
    if(config.cold){
      assert.ok(snapshot.tasks.length>0);assert.ok(snapshot.bots.length>0);assert.ok(snapshot.memories.some(m=>m.content==='WB_MEMORY_PROBE_SHORT'));
      assert.equal(snapshot.active,0);
      if(config.crashTaskId){const t=snapshot.tasks.find(t=>t.id===config.crashTaskId);assert.equal(t.runs.at(-1).state,'uncertain');assert.equal(calls,0);}
      await writeFile(config.output,JSON.stringify({status:'PASS',phase:'cold',tasks:snapshot.tasks.length,bots:snapshot.bots.length,calls,realModelRequests:0},null,2));
      console.log('WORKBENCH_PROBE_DONE');finished=true;return;
    }
    await ctx.botWorkbench.command({action:'createBot',name:'验证研究助手',persona:'Only process the test assignment.',cwd:config.workspace});
    snapshot=await ctx.botWorkbench.snapshot();const bot=snapshot.bots.at(-1);
    await ctx.botWorkbench.command({action:'memoryAdd',botId:bot.id,content:'WB_MEMORY_PROBE_SHORT'});
    await ctx.botWorkbench.command({action:'chatBot',botId:bot.id});
    snapshot=await ctx.botWorkbench.snapshot();const main=snapshot.bots.find(b=>b.id===bot.id).mainSessionId;
    await ctx.sessionController.prompt({sessionId:main,requestId:randomUUID(),mode:'queue',content:[{type:'text',text:'Check your saved preference.'}]},new AbortController().signal);
    await ctx.agents.get(SessionId(main)).whenIdle();
    assert.ok(JSON.stringify(ctx.agents.get(SessionId(main)).session.snapshotEvents()).includes('MEMORY_VISIBLE'));
    const taskId=randomUUID();
    await ctx.botWorkbench.command({action:'create',operationId:taskId,botId:bot.id,title:'核对两条资料（脚本化验收样例）',objective:'Compare two fixture sources and record evidence.',criteria:['列出资料出处','说明对照结论']});
    let task=(await ctx.botWorkbench.snapshot()).tasks.find(t=>t.id===taskId);
    await ctx.botWorkbench.command({action:'start',taskId,revision:task.revision,operationId:randomUUID()});
    for(let i=0;i<400;i++){
      snapshot=await ctx.botWorkbench.snapshot();task=snapshot.tasks.find(t=>t.id===taskId);
      if(['submitted','failed','uncertain'].includes(task.runs.at(-1)?.state))break;await pause(25);
    }
    const run=task.runs.at(-1);assert.equal(run.state,'submitted');assert.equal(run.review,'pending');assert.equal(run.evidence.length,2);
    assert.ok(approvalCount>0,'Native approval was not exercised');
    const agent=ctx.agents.get(SessionId(run.sessionId)),events=agent.session.snapshotEvents();
    assert.ok(events.some(e=>e.type==='approval/asked'));assert.ok(events.some(e=>e.type==='approval/decided'&&e.data.outcome==='allowed-once'));
    await assert.rejects(ctx.botWorkbench.command({action:'review',taskId,revision:task.revision,runId:run.id,decision:'accepted',note:'',checkedCriteria:[]}));
    snapshot=await ctx.botWorkbench.command({action:'review',taskId,revision:task.revision,runId:run.id,decision:'accepted',note:'Scripted test only; not real-model verification.',checkedCriteria:task.criteria.map(c=>c.id)});
    task=snapshot.tasks.find(t=>t.id===taskId);assert.equal(task.runs.at(-1).review,'accepted');
    assert.ok(await ctx.sessions.flush(agent.session));
    await ctx.botWorkbench.command({action:'schedule',taskId,revision:task.revision,kind:'every',everySeconds:3600});
    task=(await ctx.botWorkbench.snapshot()).tasks.find(t=>t.id===taskId);assert.ok(task.schedule);
    const scheduleId=task.schedule.id;await ctx.schedule.run({id:scheduleId});
    for(let i=0;i<400;i++){
      task=(await ctx.botWorkbench.snapshot()).tasks.find(t=>t.id===taskId);
      if(task.runs.length===2&&task.runs.at(-1).state==='submitted')break;await pause(25);
    }
    assert.equal(task.runs.length,2,'Native schedule did not claim a second run');assert.equal(task.runs.at(-1).state,'submitted');
    await ctx.botWorkbench.command({action:'review',taskId,revision:task.revision,runId:task.runs.at(-1).id,decision:'accepted',note:'Scripted scheduled result.',checkedCriteria:task.criteria.map(c=>c.id)});
    task=(await ctx.botWorkbench.snapshot()).tasks.find(t=>t.id===taskId);
    await ctx.botWorkbench.command({action:'pause',taskId,revision:task.revision,paused:true});
    assert.equal((await ctx.schedule.view({id:scheduleId})).status,'paused');
    task=(await ctx.botWorkbench.snapshot()).tasks.find(t=>t.id===taskId);await ctx.botWorkbench.command({action:'pause',taskId,revision:task.revision,paused:false});
    assert.equal((await ctx.schedule.view({id:scheduleId})).status,'active');
    task=(await ctx.botWorkbench.snapshot()).tasks.find(t=>t.id===taskId);await ctx.botWorkbench.command({action:'unschedule',taskId,revision:task.revision});
    await writeFile(config.output,JSON.stringify({status:'PASS',phase:'hot',hostVersion:snapshot.hostVersion,taskId,sessionId:run.sessionId,approvalCount,calls,realModelRequests:0,memoryInjection:true,acceptanceSeparated:true,nativeSchedule:true,pauseResume:true},null,2));
    console.log('WORKBENCH_PROBE_DONE');finished=true;
  })().catch(async(error)=>{await writeFile(config.output,JSON.stringify({status:'FAIL',error:String(error),stack:error.stack,calls,approvalCount,realModelRequests:0},null,2));console.error('WORKBENCH_PROBE_FAILED',error);finished=true;});
  ctx.effect(()=>()=>outcome,'fixture: result settlement');
}
