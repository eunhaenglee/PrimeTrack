# PrimeTrack (Background-only Starter)

## 설치
1) `chrome://extensions` → Developer mode ON  
2) "Load unpacked" → 이 폴더(primetrack) 선택  
3) Service Worker 콘솔로 이동해 동작 확인

## 빠른 테스트 (UI 없이)
Service Worker 콘솔에서:

```js
// 스냅샷
chrome.runtime.sendMessage({ action: 'get:snapshot' }, console.log);

// 프로젝트/태스크
chrome.runtime.sendMessage({ action: 'project:create', payload: { name: 'PV Ops' } }, console.log);
// <PROJECT_ID>로 바꿔주세요
chrome.runtime.sendMessage({ action: 'task:create', payload: { projectId: '<PROJECT_ID>', name: 'Prescripting' } }, console.log);

// 시작/리셋/정지
chrome.runtime.sendMessage({ action: 'timer:start', payload: { projectId: '<PROJECT_ID>', taskId: '<TASK_ID>' } }, console.log);
chrome.runtime.sendMessage({ action: 'timer:reset' }, console.log);
chrome.runtime.sendMessage({ action: 'timer:stop' }, console.log);

// 수동 시간 조정 (+10분)
chrome.runtime.sendMessage({ action: 'task:adjust', payload: { taskId: '<TASK_ID>', deltaMs: 10*60*1000 } }, console.log);

// 총합 복사 (Task 또는 Project)
chrome.runtime.sendMessage({ action: 'total:copy', payload: { taskId: '<TASK_ID>' } }, console.log);
chrome.runtime.sendMessage({ action: 'total:copy', payload: { projectId: '<PROJECT_ID>' } }, console.log);
