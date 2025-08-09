// Popup UI (MV3 / ESM)

const $ = (id) => document.getElementById(id);

const el = {
  status: $('statusBadge'),
  btnStart: $('btnStart'),
  btnStop: $('btnStop'),
  btnReset: $('btnReset'),
  selProject: $('selProject'),
  selTask: $('selTask'),
  btnNewProject: $('btnNewProject'),
  btnRenameProject: $('btnRenameProject'),
  btnArchiveProject: $('btnArchiveProject'),
  btnNewTask: $('btnNewTask'),
  btnEditTaskTime: $('btnEditTaskTime'),
  activeLabel: $('activeLabel'),
  taskTotal: $('taskTotal'),
  projectTotal: $('projectTotal'),
  copyTaskMini: $('btnCopyTaskMini'),
  copyProjectMini: $('btnCopyProjectMini'),
  recentBox: $('recentProjectBox'),
  dlgEdit: $('dlgEdit'),
  inpHMS: $('inpHMS'),
  btnEditCancel: $('btnEditCancel'),
  btnEditSave: $('btnEditSave'),
  bigTimer: $('bigTimer'),
  btnExport: $('btnExport'),
};

let snapshot = { projects: [], tasks: [], sessions: [], state: {} };
let selectedProjectId = null;
let selectedTaskId = null;
let tickHandle = null;

init();

async function init() {
  await refreshSnapshot();
  bindEvents();
  renderAll();
  startTicking();
  document.addEventListener('keydown', onHotkeys);
}

function bindEvents() {
  el.btnStart.addEventListener('click', onStart);
  el.btnStop.addEventListener('click', onStop);
  el.btnReset.addEventListener('click', onReset);

  el.selProject.addEventListener('change', onProjectChange);
  el.selTask.addEventListener('change', onTaskChange);

  el.btnNewProject.addEventListener('click', onNewProject);
  el.btnRenameProject.addEventListener('click', onRenameProject);
  el.btnArchiveProject.addEventListener('click', onArchiveProject);

  el.btnNewTask.addEventListener('click', onNewTask);
  el.btnEditTaskTime.addEventListener('click', openEditDialog);

  el.copyTaskMini.addEventListener('click', () => copyTotalMinutes({ taskId: selectedTaskId }));
  el.copyProjectMini.addEventListener('click', () => copyTotalMinutes({ projectId: selectedProjectId }));

  el.btnEditCancel.addEventListener('click', () => el.dlgEdit.close());
  el.btnEditSave.addEventListener('click', onApplyEditTime);

  // ★ Export CSV
  el.btnExport.addEventListener('click', onExportCsv);
}

/* messaging */
function send(action, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, payload }, (res) => resolve(res || { ok: false, error: 'no_response' }));
  });
}
async function refreshSnapshot() {
  const res = await send('get:snapshot'); if (res.ok) snapshot = res;
  const active = snapshot.state?.active; const lastProj = snapshot.state?.lastSelectedProjectId;
  selectedProjectId = selectedProjectId || active?.projectId || lastProj || (snapshot.projects[0]?.id || null);
  selectedTaskId = selectedTaskId || active?.taskId || firstTaskOf(selectedProjectId);
}
function firstTaskOf(projectId) { const t = snapshot.tasks.find(x => x.projectId === projectId); return t?.id || null; }

/* actions */
async function onStart(){ if(!selectedProjectId||!selectedTaskId) return;
  const res=await send('timer:start',{projectId:selectedProjectId,taskId:selectedTaskId});
  if(!res.ok && res.error!=='already_running') alert('Failed to start: '+(res.error||'unknown'));
  await refreshSnapshot(); renderAll();
}
async function onStop(){ const res=await send('timer:stop');
  if(!res.ok && res.error!=='not_running') alert('Failed to stop: '+(res.error||'unknown'));
  await refreshSnapshot(); renderAll();
}
async function onReset(){ const res=await send('timer:reset');
  if(!res.ok){ alert('Failed to reset: '+(res.error||'unknown')); return; }
  await refreshSnapshot(); if(snapshot.state?.active) snapshot.state.active.startedAt=Date.now(); renderAll();
}

async function onNewProject(){
  const name=prompt('New project name?'); if(!name) return;
  const res=await send('project:create',{name}); if(!res.ok) return alert('Failed: '+res.error);
  await refreshSnapshot(); selectedProjectId=res.project.id; selectedTaskId=firstTaskOf(selectedProjectId); renderAll();
}
async function onRenameProject(){
  if(!selectedProjectId) return; const p=snapshot.projects.find(x=>x.id===selectedProjectId);
  const name=prompt('Rename project', p?.name||''); if(!name) return;
  const res=await send('project:rename',{projectId:selectedProjectId,newName:name});
  if(!res.ok) return alert('Failed: '+res.error); await refreshSnapshot(); renderAll();
}
async function onArchiveProject(){
  if(!selectedProjectId) return; const yes=confirm('Archive this project? It will be hidden from lists.'); if(!yes) return;
  const res=await send('project:archive',{projectId:selectedProjectId,archived:true});
  if(!res.ok) return alert('Failed: '+res.error);
  await refreshSnapshot(); selectedProjectId=snapshot.projects.find(p=>!p.archived)?.id||null; selectedTaskId=firstTaskOf(selectedProjectId); renderAll();
}
async function onNewTask(){
  if(!selectedProjectId) return; const name=prompt('New task name?'); if(!name) return;
  const res=await send('task:create',{projectId:selectedProjectId,name}); if(!res.ok) return alert('Failed: '+res.error);
  await refreshSnapshot(); selectedTaskId=res.task.id; renderAll();
}
function onProjectChange(){ selectedProjectId=el.selProject.value||null; selectedTaskId=firstTaskOf(selectedProjectId); renderAll(); }
function onTaskChange(){ selectedTaskId=el.selTask.value||null; renderAll(); }

/* format helpers */
function msToHMS(ms){
  ms=Math.max(0,Math.floor(ms||0)); const s=Math.floor(ms/1000);
  const h=String(Math.floor(s/3600)).padStart(2,'0');
  const m=String(Math.floor((s%3600)/60)).padStart(2,'0');
  const sec=String(s%60).padStart(2,'0'); return `${h}:${m}:${sec}`;
}
function msToMinutes(ms){ return Math.floor((ms||0)/60000); }
function minutesLabel(ms){ return `${msToMinutes(ms)} min`; }
function minutesWithHoursLabel(ms){
  const mins = msToMinutes(ms);
  const hours = (mins/60).toFixed(1);
  return `${mins} min (${hours} h)`;
}

/* copy minutes in popup */
async function copyTotalMinutes({taskId, projectId}){
  const res = await send('total:get', {taskId, projectId});
  if(!res.ok){ alert('Copy failed: '+res.error); return; }
  const txt = String(msToMinutes(res.totalMs)); // 숫자만
  try{ await navigator.clipboard.writeText(txt); toast('Copied: ' + txt); }
  catch(e){ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied: ' + txt); }
}

/* edit time modal */
function openEditDialog(){
  if(!selectedTaskId) return;
  const cur = currentTaskTotalMs(selectedTaskId);
  el.inpHMS.value = msToHMS(cur);
  el.dlgEdit.showModal();
}
function parseHMS(str){
  const m=String(str||'').trim().match(/^([+-])?(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  if(!m) return null;
  const sign = m[1]==='-'?-1: (m[1]==='+'?1:null);
  const h=parseInt(m[2],10), mm=parseInt(m[3],10), ss=parseInt(m[4],10);
  const ms=((h*3600)+(mm*60)+ss)*1000;
  return {sign, ms};
}
function currentTaskTotalMs(taskId){ const t=snapshot.tasks.find(x=>x.id===taskId); return t?.totalMs||0; }
async function onApplyEditTime(){
  const parsed=parseHMS(el.inpHMS.value);
  if(!parsed){ alert('Format must be HH:MM:SS (allow absolute or +/-delta).'); return; }
  const cur=currentTaskTotalMs(selectedTaskId);
  const delta = (parsed.sign===null) ? (parsed.ms - cur) : (parsed.sign * parsed.ms);
  const res=await send('task:adjust',{taskId:selectedTaskId,deltaMs:Math.floor(delta)});
  if(!res.ok) return alert('Failed: '+res.error);
  el.dlgEdit.close(); await refreshSnapshot(); renderAll();
}

/* render */
function renderAll(){
  const active=snapshot.state?.active;
  el.status.textContent = active ? 'Running' : 'Idle';

  el.btnStart.disabled=!!active || !selectedProjectId || !selectedTaskId;
  el.btnStop.disabled=!active; el.btnReset.disabled=!active;

  const projects=snapshot.projects.filter(p=>!p.archived);
  renderSelect(el.selProject, projects.map(p=>[p.id,p.name]), selectedProjectId);

  const tasks=snapshot.tasks.filter(t=>t.projectId===selectedProjectId);
  renderSelect(el.selTask, tasks.map(t=>[t.id,t.name]), selectedTaskId);

  el.activeLabel.textContent = active ? `${nameOfProject(active.projectId)} / ${nameOfTask(active.taskId)}` : '—';

  const tTotalMs = tasks.find(t=>t.id===selectedTaskId)?.totalMs || 0;
  el.taskTotal.textContent = minutesLabel(tTotalMs);

  const pTotalMs = snapshot.tasks.filter(t=>t.projectId===selectedProjectId).reduce((acc,t)=>acc+(t.totalMs||0),0);
  el.projectTotal.textContent = minutesLabel(pTotalMs);

  renderRecent();
  renderBigTimer();
}

function renderSelect(sel,pairs,selected){
  sel.innerHTML=''; for(const [val,label] of pairs){ const o=document.createElement('option'); o.value=val; o.textContent=label; if(val===selected) o.selected=true; sel.appendChild(o); }
  if(!pairs.length){ const o=document.createElement('option'); o.textContent='—'; sel.appendChild(o); }
}
function nameOfProject(id){ return snapshot.projects.find(p=>p.id===id)?.name || '(unknown)'; }
function nameOfTask(id){ return snapshot.tasks.find(t=>t.id===id)?.name || '(unknown)'; }

/* Recent: task별 분표시 + Total(분 + (시간)) */
function renderRecent(){
  const lastId=snapshot.state?.lastSelectedProjectId;
  el.recentBox.innerHTML='';
  if(!lastId){ el.recentBox.innerHTML='<div class="dim">No recent project yet.</div>'; return; }

  const pHeader=document.createElement('div'); pHeader.style.fontWeight='700'; pHeader.style.marginBottom='6px'; pHeader.textContent=nameOfProject(lastId);
  el.recentBox.appendChild(pHeader);

  const tasks=snapshot.tasks.filter(t=>t.projectId===lastId);
  const ul=document.createElement('div');

  let sum=0;
  for(const t of tasks){
    const row=document.createElement('div'); row.style.fontSize='12px'; row.style.display='flex'; row.style.justifyContent='space-between';
    const ms=t.totalMs||0; sum+=ms;
    row.innerHTML=`<span>- ${t.name}</span><span>${minutesLabel(ms)}</span>`;
    ul.appendChild(row);
  }
  const totalRow=document.createElement('div'); totalRow.style.fontSize='12px'; totalRow.style.display='flex'; totalRow.style.justifyContent='space-between'; totalRow.style.marginTop='6px';
  totalRow.innerHTML=`<strong>Total</strong><strong>${minutesWithHoursLabel(sum)}</strong>`;
  ul.appendChild(totalRow);

  el.recentBox.appendChild(ul);
}

/* big timer */
function startTicking(){ if(tickHandle) clearInterval(tickHandle); tickHandle=setInterval(renderBigTimer,500); }
function renderBigTimer(){ const a=snapshot.state?.active; if(!a){ el.bigTimer.textContent='00:00:00'; return; }
  const elapsed=(a.carriedMs||0)+(Date.now()-a.startedAt); el.bigTimer.textContent=msToHMS(elapsed); }

/* hotkeys (Windows) */
function onHotkeys(e){
  const mod=e.ctrlKey;
  if(mod && e.shiftKey && e.code==='KeyS'){ e.preventDefault(); if(el.btnStart.disabled) onStop(); else onStart(); }
  else if(mod && e.code==='KeyR'){ e.preventDefault(); if(!el.btnReset.disabled) onReset(); }
}

/* CSV Export: A~F = Last Work Date, Title, Typing&BOX, AG, Double Check, Total */
function formatDateYMD(ts){
  if(!ts) return '';
  const d=new Date(ts); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function sumTaskMinutes(projectId, taskName){
  const task = snapshot.tasks.find(t=>t.projectId===projectId && t.name===taskName);
  return task ? msToMinutes(task.totalMs||0) : 0;
}
function lastWorkDateForProject(projectId){
  const s = snapshot.sessions.filter(x=>x.projectId===projectId && x.endAt);
  if(!s.length) return '';
  const latest = Math.max(...s.map(x=>x.endAt));
  return formatDateYMD(latest);
}
function onExportCsv(){
  // 헤더
  const rows = [['Last Work Date','Title','Typing&BOX','AG','Double Check','Total']];
  const projects = snapshot.projects.filter(p=>!p.archived);

  for(const p of projects){
    const tBox = sumTaskMinutes(p.id, 'Typing&BOX');
    const ag   = sumTaskMinutes(p.id, 'AG');
    const dc   = sumTaskMinutes(p.id, 'Double Check');
    const total = snapshot.tasks.filter(t=>t.projectId===p.id).reduce((acc,t)=>acc+msToMinutes(t.totalMs||0),0);

    rows.push([ lastWorkDateForProject(p.id), p.name, tBox, ag, dc, total ]);
  }

  // CSV 문자열 (UTF-8 BOM 포함, Excel 호환)
  const csv = '\ufeff' + rows.map(r=>r.map(cell=>{
    const s=String(cell??'');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',')).join('\n');

  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date(); const y=today.getFullYear(); const m=String(today.getMonth()+1).padStart(2,'0'); const d=String(today.getDate()).padStart(2,'0');
  a.href = url; a.download = `PrimeTrack_export_${y}${m}${d}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('CSV exported');
}

/* toast */
function toast(text){
  const t=document.createElement('div'); t.textContent=text; t.style.position='fixed'; t.style.left='50%'; t.style.top='10px'; t.style.transform='translateX(-50%)';
  t.style.background='#111827'; t.style.border='1px solid #1f2937'; t.style.padding='6px 10px'; t.style.borderRadius='999px'; t.style.fontSize='12px'; t.style.zIndex=9999;
  document.body.appendChild(t); setTimeout(()=>t.remove(),1400);
}
