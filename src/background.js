// PrimeTrack background (MV3 / ESM)

const IDLE_SECONDS = 60;
chrome.idle.setDetectionInterval(IDLE_SECONDS);

const DEFAULT_TASKS = ["Typing&BOX", "Char ID", "AG", "Double Check"];

const K = { PROJECTS:'projects', TASKS:'tasks', SESSIONS:'sessions', STATE:'state' };
const now = () => Date.now();

async function get(key, fallback){ const o=await chrome.storage.local.get(key); return o[key] ?? fallback; }
async function set(key, value){ await chrome.storage.local.set({[key]:value}); }
async function push(key, item){ const arr=await get(key,[]); arr.push(item); await set(key,arr); return arr; }
function uuid(){ return (now().toString(36)+Math.random().toString(36).slice(2,8)).toUpperCase(); }
function clampMs(ms){ return Math.max(0, Math.floor(ms||0)); }

let stateCache=null;
async function loadState(){ if(!stateCache) stateCache=await get(K.STATE,{}); return stateCache; }
async function saveState(s){ stateCache=s; await set(K.STATE,s); }

/* Icon & badge */
function setBadge(running){
  try{
    if(running){ chrome.action.setBadgeText({text:'REC'}); chrome.action.setBadgeBackgroundColor({color:'#ef4444'}); }
    else{ chrome.action.setBadgeText({text:''}); }
  }catch(_){}
}
async function updateIcon(running){
  const p=(rel)=>chrome.runtime.getURL(rel);
  const path = running
    ? {16:p('assets/icon16_active.png'),48:p('assets/icon48_active.png'),128:p('assets/icon128_active.png')}
    : {16:p('assets/icon16.png'),        48:p('assets/icon48.png'),        128:p('assets/icon128.png')};
  try { const r=chrome.action.setIcon({path}); if(r && typeof r.then==='function') await r; }
  catch(e){ console.warn('setIcon failed (ignored):', e); }
  setBadge(running);
}

/* Timer */
async function startTimer(projectId, taskId){
  const s=await loadState(); if(s.active) return {ok:false,error:'already_running'};
  const active={projectId,taskId,startedAt:now(),carriedMs:0};
  await saveState({...s,active,lastSelectedProjectId:projectId});
  try{ await updateIcon(true);}catch(_){}
  return {ok:true};
}
async function stopTimer(reason='manual'){
  const s=await loadState(); if(!s.active) return {ok:false,error:'not_running'};
  const a=s.active; const elapsed=clampMs(a.carriedMs + (now()-a.startedAt));
  if(elapsed<2000){ delete s.active; await saveState(s); try{await updateIcon(false);}catch(_){}
    return {ok:true,elapsedMs:0,skipped:true}; }
  await push(K.SESSIONS,{id:uuid(),projectId:a.projectId,taskId:a.taskId,startAt:a.startedAt,endAt:now(),elapsedMs:elapsed,reason});
  const tasks=await get(K.TASKS,[]); const idx=tasks.findIndex(t=>t.id===a.taskId);
  if(idx>=0) tasks[idx].totalMs=clampMs((tasks[idx].totalMs||0)+elapsed); await set(K.TASKS,tasks);
  delete s.active; await saveState(s); try{await updateIcon(false);}catch(_){}
  return {ok:true,elapsedMs:elapsed};
}
async function resetTimer(){
  const s=await loadState(); if(!s.active) return {ok:false,error:'not_running'};
  s.active={...s.active,carriedMs:0,startedAt:now()}; await saveState(s); return {ok:true};
}

/* CRUD & adjust */
async function createProject(name){
  const proj={id:uuid(),name,createdAt:now(),archived:false}; await push(K.PROJECTS,proj);
  for(const tName of DEFAULT_TASKS){ await push(K.TASKS,{id:uuid(),projectId:proj.id,name:tName,totalMs:0}); }
  return proj;
}
async function createTask(projectId,name){ const task={id:uuid(),projectId,name,totalMs:0}; await push(K.TASKS,task); return task; }

async function adjustTaskTime(taskId, deltaMs){
  const tasks=await get(K.TASKS,[]); const t=tasks.find(x=>x.id===taskId); if(!t) return {ok:false,error:'task_not_found'};
  t.totalMs=clampMs((t.totalMs||0)+deltaMs); await set(K.TASKS,tasks);
  const sessions=await get(K.SESSIONS,[]); const last=[...sessions].reverse().find(s=>s.taskId===taskId);
  if(last){ last.manualAdjustedMs=clampMs((last.manualAdjustedMs||0)+deltaMs); await set(K.SESSIONS,sessions); }
  return {ok:true,totalMs:t.totalMs};
}
async function renameProject(projectId,newName){
  const projects=await get(K.PROJECTS,[]); const p=projects.find(x=>x.id===projectId);
  if(!p) return {ok:false,error:'project_not_found'}; p.name=newName; await set(K.PROJECTS,projects); return {ok:true};
}
async function archiveProject(projectId,archived=true){
  const projects=await get(K.PROJECTS,[]); const p=projects.find(x=>x.id===projectId);
  if(!p) return {ok:false,error:'project_not_found'}; p.archived=!!archived; await set(K.PROJECTS,projects); return {ok:true};
}

/* Totals (ms only; copy는 popup에서 수행) */
async function getTotalMs({taskId,projectId}){
  const tasks=await get(K.TASKS,[]);
  if(taskId){ const t=tasks.find(x=>x.id===taskId); return clampMs(t?.totalMs||0); }
  if(projectId){ return clampMs(tasks.filter(t=>t.projectId===projectId).reduce((a,t)=>a+(t.totalMs||0),0)); }
  return 0;
}

/* hooks */
chrome.idle.onStateChanged.addListener(async (st)=>{ if(st==='locked' || st==='idle'){ const s=await loadState(); if(s.active) await stopTimer('auto'); }});
chrome.runtime.onSuspend.addListener(async ()=>{ const s=await loadState(); await saveState(s); });
(async()=>{ const st=await loadState(); try{await updateIcon(!!st.active);}catch(_){}})();
chrome.runtime.onStartup.addListener(async()=>{ const st=await loadState(); try{await updateIcon(!!st.active);}catch(_){}} );
chrome.runtime.onInstalled.addListener(async()=>{ const st=await loadState(); try{await updateIcon(!!st.active);}catch(_){}} );

/* API */
chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  (async()=>{
    try{
      const {action,payload}=msg||{};
      switch(action){
        case 'project:create': sendResponse({ok:true,project:await createProject(payload.name)}); return;
        case 'task:create':    sendResponse({ok:true,task:await createTask(payload.projectId,payload.name)}); return;
        case 'project:rename': sendResponse(await renameProject(payload.projectId,payload.newName)); return;
        case 'project:archive':sendResponse(await archiveProject(payload.projectId,payload.archived)); return;
        case 'timer:start':    sendResponse(await startTimer(payload.projectId,payload.taskId)); return;
        case 'timer:stop':     sendResponse(await stopTimer('manual')); return;
        case 'timer:reset':    sendResponse(await resetTimer()); return;
        case 'task:adjust':    sendResponse(await adjustTaskTime(payload.taskId, clampMs(payload.deltaMs))); return;
        case 'total:get':      sendResponse({ok:true,totalMs:await getTotalMs(payload||{})}); return;
        case 'get:snapshot': {
          const [projects,tasks,sessions,state]=await Promise.all([get(K.PROJECTS,[]),get(K.TASKS,[]),get(K.SESSIONS,[]),loadState()]);
          sendResponse({ok:true,projects,tasks,sessions,state}); return;
        }
        default: sendResponse({ok:false,error:'unknown_action'});
      }
    }catch(e){ console.error(e); sendResponse({ok:false,error:String(e?.message||e)}); }
  })();
  return true;
});

/* seed */
async function ensureDemo(){ const projects=await get(K.PROJECTS,[]); if(projects.length===0){ await createProject('test_1'); } }
ensureDemo();
