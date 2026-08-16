export interface MobilePageOptions {
  locale: 'en' | 'zh'
}

export function renderMobilePage({ locale }: MobilePageOptions): string {
  const zh = locale === 'zh'
  return `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#f8f8f6">
  <title>DSH Mobile</title>
  <style>
    :root{color-scheme:light;--paper:#fff;--sidebar:#f7f8fa;--ink:#18191c;--muted:#81858c;--line:#e5e7eb;--card:#fff;--hover:#f2f3f5;--brand:#4d6bfe}
    @media(prefers-color-scheme:dark){:root{color-scheme:dark;--paper:#141416;--sidebar:#19191b;--ink:#f5f5f6;--muted:#95979d;--line:#303034;--card:#1d1d20;--hover:#29292d;--brand:#6f86ff}}
    *{box-sizing:border-box}html,body{height:100%;overflow:hidden}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    button,input,textarea,select{font:inherit}.shell{max-width:760px;height:100dvh;margin:auto;padding:calc(10px + env(safe-area-inset-top)) 14px calc(10px + env(safe-area-inset-bottom));display:flex;flex-direction:column}
    header{height:52px;display:flex;flex:none;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding:0 4px}.brand{font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px}.brand img{width:35px;height:20px;object-fit:contain}.brand .dark-logo{display:none}@media(prefers-color-scheme:dark){.brand .light-logo{display:none}.brand .dark-logo{display:block}}.status{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px}.status:before{content:'';width:6px;height:6px;border-radius:50%;background:#35a867}
    .view{display:none;min-height:0}.view.active{display:flex;flex:1;flex-direction:column}.toolbar{display:flex;flex:none;gap:8px;align-items:center;padding:12px 0}.toolbar select{flex:1;min-width:0}.chat-toolbar{justify-content:space-between;border-bottom:1px solid var(--line);padding:8px 0}.back{border:none!important;padding-left:4px!important;font-weight:500}.back svg{vertical-align:-2px;margin-right:4px}
    select,button,textarea{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:10px 12px}button{cursor:pointer}button:hover{background:var(--hover)}button.primary{display:grid;place-items:center;flex:none;background:var(--brand);color:white;border-color:var(--brand);border-radius:50%;width:42px;height:42px;padding:0}button.quiet{background:transparent}
    .list{display:grid;align-content:start;gap:4px;overflow-y:auto;padding-bottom:12px}.row{width:100%;text-align:left;background:transparent;border:0;border-radius:8px;padding:10px 12px}.row:hover,.row:active{background:var(--hover)}.row strong{display:block;font-weight:500}.row small{display:block;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .empty{padding:56px 14px;text-align:center;color:var(--muted)}.messages{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:16px;padding:18px 4px}.message{max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink);line-height:1.65}.message.user{align-self:flex-end;max-width:82%;background:var(--hover);border-radius:22px;padding:9px 15px}.message.assistant{align-self:stretch;padding:0 4px}.message .role{display:none}
    .composer{flex:none;padding:10px 0 2px;background:var(--paper)}.composer-inner{display:flex;gap:8px;align-items:flex-end;border:1px solid var(--line);border-radius:20px;padding:8px 8px 8px 14px;background:var(--card);box-shadow:0 4px 16px rgba(0,0,0,.05)}.composer textarea{flex:1;min-height:42px;max-height:150px;resize:none;border:0;outline:0;border-radius:0;padding:10px 0;background:transparent}.primary.cancel{background:var(--ink);border-color:var(--ink)}.primary[hidden]{display:none}.error{color:#e34d59;font-size:13px;margin:8px 0}.loading{display:grid;gap:12px;padding:22px 4px}.skeleton{height:14px;border-radius:7px;background:var(--hover);animation:pulse 1.1s ease-in-out infinite alternate}.skeleton:nth-child(2){width:82%}.skeleton:nth-child(3){width:64%}@keyframes pulse{to{opacity:.35}}@media(prefers-reduced-motion:reduce){.skeleton{animation:none}}
  </style>
</head>
<body><main class="shell">
  <header><div class="brand"><img class="light-logo" src="/brand-logo/light" alt=""><img class="dark-logo" src="/brand-logo/dark" alt=""><span>DSH Desktop</span></div><div id="status" class="status">${zh ? '正在连接…' : 'Connecting…'}</div></header>
  <section id="sessionsView" class="view active">
    <div class="toolbar"><select id="workspace"></select><button id="newSession">＋ ${zh ? '新会话' : 'New'}</button><button id="refresh">${zh ? '刷新' : 'Refresh'}</button></div>
    <div id="sessions" class="list"></div><div id="listError" class="error"></div>
  </section>
  <section id="chatView" class="view">
    <div class="toolbar chat-toolbar"><button id="back" class="quiet back"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10.5 3L5.5 8L10.5 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>${zh ? '会话列表' : 'Sessions'}</button></div>
    <div id="messages" class="messages"></div><div id="chatError" class="error"></div>
    <div class="composer"><div class="composer-inner"><textarea id="prompt" placeholder="${zh ? '给智能体发消息' : 'Message the agent'}"></textarea><button id="send" class="primary" aria-label="${zh ? '发送' : 'Send'}"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 15V5M10 5L6 9M10 5L14 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button id="cancel" class="primary cancel" aria-label="${zh ? '停止生成' : 'Stop generating'}" hidden><svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor"/></svg></button></div></div>
  </section>
</main>
<script>
const L=${JSON.stringify({
    all: zh ? '全部工作区' : 'All workspaces',
    noSessions: zh ? '还没有会话。' : 'No sessions yet.',
    untitled: zh ? '未命名会话' : 'Untitled session',
    online: zh ? '局域网已连接' : 'Connected on local network',
    failed: zh ? '请求失败' : 'Request failed',
    chooseWorkspace: zh ? '请先选择一个工作区。' : 'Choose a workspace first.'
  })};
let activeSession=null,poll=null,workspaces=[],historyBusy=false,lastHistoryKey='';
const $=id=>document.getElementById(id);
async function rpc(method,payload={}){const r=await fetch('/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,payload})});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||L.failed);return j.value}
function textFrom(x){if(typeof x==='string')return x;if(Array.isArray(x))return x.map(textFrom).filter(Boolean).join('\\n');if(!x||typeof x!=='object')return '';if(x.type==='text'&&typeof x.text==='string')return x.text;if(typeof x.message==='string')return x.message;if(typeof x.text==='string')return x.text;if(x.message)return textFrom(x.message);if(x.content)return textFrom(x.content);return ''}
function eventMessage(entry){const e=entry.event||entry,d=e.data||{},t=String(e.type||'').toLowerCase();if(t==='user/message'){const message=d.message||d;if(message.source?.kind!=='user')return null;const text=textFrom(message.content);return text?{role:'user',text}:null}if(t==='assistant/message'){const message=d.message||{};const text=textFrom(message.content);return text?{role:'assistant',text}:null}return null}
function updateRunning(events){let running=false;for(const entry of events){const t=String((entry.event||entry).type||'').toLowerCase();if(t==='turn/start')running=true;else if(t==='turn/end')running=false}$('send').hidden=running;$('cancel').hidden=!running;$('prompt').disabled=running}
async function loadWorkspaces(){const value=await rpc('workspace.list');workspaces=value.items||[];$('workspace').innerHTML='<option value="">'+L.all+'</option>'+workspaces.map(w=>'<option value="'+esc(w.workspaceId)+'">'+esc(w.title||w.path)+'</option>').join('')}
async function loadSessions(){try{const value=await rpc('session.list',{}),wid=$('workspace').value,w=workspaces.find(x=>x.workspaceId===wid),allowed=w?new Set(w.sessionIds):null;const items=(value.items||[]).filter(s=>!allowed||allowed.has(s.sessionId)).sort((a,b)=>b.updatedAt-a.updatedAt);$('sessions').innerHTML=items.length?items.map(s=>'<button class="row" data-id="'+esc(s.sessionId)+'"><strong>'+esc(titleFor(s))+'</strong><small>'+esc(s.cwd||s.sessionId)+'</small></button>').join(''):'<div class="empty">'+L.noSessions+'</div>';document.querySelectorAll('.row').forEach(b=>b.onclick=()=>openSession(b.dataset.id))}catch(e){$('listError').textContent=e.message}}
async function createSession(){const workspaceId=$('workspace').value;if(!workspaceId){$('listError').textContent=L.chooseWorkspace;return}try{const created=await rpc('session.create',{workspaceId});await openSession(created.sessionId)}catch(e){$('listError').textContent=e.message}}
function titleFor(s){const p=s.projections&&s.projections.values||{};return p.title||p.sessionTitle||p['session.title']||L.untitled}
async function openSession(id){clearTimeout(poll);activeSession=id;lastHistoryKey='';$('sessionsView').classList.remove('active');$('chatView').classList.add('active');$('messages').innerHTML='<div class="loading"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';await loadHistory(true);schedulePoll()}
function schedulePoll(){clearTimeout(poll);if(activeSession)poll=setTimeout(async()=>{await loadHistory(false);schedulePoll()},500)}
async function loadHistory(initial){if(!activeSession||historyBusy)return;historyBusy=true;try{const value=await rpc('session.history',{sessionId:activeSession,maxMessages:100});const events=value.events||[],messages=events.map(eventMessage).filter(Boolean),key=events.length+':'+(events.at(-1)?.event?.seq??'');updateRunning(events);if(key!==lastHistoryKey){const box=$('messages'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90;box.innerHTML=messages.map(m=>'<div class="message '+m.role+'"><div class="role">'+esc(m.role)+'</div>'+esc(m.text)+'</div>').join('')||'<div class="empty">'+L.noSessions+'</div>';lastHistoryKey=key;if(initial||nearBottom)box.scrollTop=box.scrollHeight}$('chatError').textContent=''}catch(e){$('chatError').textContent=e.message}finally{historyBusy=false}}
async function send(){const text=$('prompt').value.trim();if(!text||!activeSession)return;$('send').disabled=true;$('prompt').value='';const box=$('messages');box.insertAdjacentHTML('beforeend','<div class="message user">'+esc(text)+'</div>');box.scrollTop=box.scrollHeight;try{await rpc('session.prompt',{sessionId:activeSession,mode:'steer',content:[{type:'text',text}],clientTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});lastHistoryKey='';await loadHistory(false)}catch(e){$('chatError').textContent=e.message;$('prompt').value=text}finally{$('send').disabled=false}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('workspace').onchange=loadSessions;$('newSession').onclick=createSession;$('refresh').onclick=loadSessions;$('send').onclick=send;$('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}};$('back').onclick=()=>{clearTimeout(poll);poll=null;activeSession=null;$('chatView').classList.remove('active');$('sessionsView').classList.add('active');loadSessions()};$('cancel').onclick=async()=>{if(activeSession){await rpc('session.cancel',{sessionId:activeSession});lastHistoryKey='';await loadHistory(false)}};
(async()=>{try{await loadWorkspaces();await loadSessions();$('status').textContent=L.online}catch(e){$('status').textContent=e.message}})();
</script></body></html>`
}

export function renderDesktopPairingPage(options: {
  qrSvg: string
  pairingUrl: string
  expiresAt: number
}): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Phone</title><style>
  body{margin:0;background:#f8f8f6;color:#171716;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:520px;margin:auto;padding:30px;text-align:center}h1{font:600 30px Georgia,serif;margin:0 0 8px}p{color:#6f6a63}.qr{display:inline-flex;background:white;padding:12px;border:1px solid #dedbd5;border-radius:18px;margin:12px}.qr svg{width:230px;height:230px}.url{font:12px ui-monospace,monospace;overflow-wrap:anywhere;background:white;border:1px solid #dedbd5;border-radius:10px;padding:10px;text-align:left}.note{font-size:12px}.expires{color:#a04d36}.request{display:none;margin-top:14px;padding:14px;border:1px solid #171716;border-radius:12px;background:white;text-align:left}.request.show{display:block}.actions{display:flex;gap:8px;margin-top:10px}.actions button{flex:1;border:1px solid #d7d3cc;border-radius:9px;background:white;padding:9px}.actions .allow{background:#171716;color:white;border-color:#171716}</style></head><body><div class="wrap"><h1>Connect your phone</h1><p>Scan this QR code while your phone and DSH Desktop are on the same trusted Wi-Fi.</p><div class="qr">${options.qrSvg}</div><div class="url">${escapeHtml(options.pairingUrl)}</div><p class="note">Keep this window open and approve the device below.</p><p id="expires" class="expires"></p><div id="request" class="request"><strong>Phone waiting for approval</strong><div id="address"></div><div class="actions"><button onclick="decide(false)">Decline</button><button class="allow" onclick="decide(true)">Allow</button></div></div></div><script>const end=${options.expiresAt};let pendingId=null;async function poll(){const r=await fetch('/desktop/pending');if(r.ok){const j=await r.json();pendingId=j.id||null;document.getElementById('address').textContent=j.remoteAddress?'Device address: '+j.remoteAddress:'';document.getElementById('request').classList.toggle('show',!!pendingId)}}async function decide(approved){if(!pendingId)return;await fetch('/desktop/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:pendingId,approved})});pendingId=null;poll()}setInterval(()=>{const n=Math.max(0,Math.ceil((end-Date.now())/1000));document.getElementById('expires').textContent=n?'QR expires in '+n+' seconds':'QR expired. Close and reopen this window to refresh.'},1000);setInterval(poll,800);poll()</script></body></html>`
}

export function renderPairingWaitPage(pairingId: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pairing DSH</title><style>body{margin:0;background:#f8f8f6;color:#171716;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;min-height:100vh;place-items:center}.card{max-width:360px;padding:28px;text-align:center}h1{font:600 28px Georgia,serif}.dot{width:10px;height:10px;border-radius:50%;background:#d97757;margin:20px auto;animation:p 1.2s infinite alternate}@keyframes p{to{opacity:.25}}</style></head><body><div class="card"><div class="dot"></div><h1>Approve on DSH Desktop</h1><p id="status">Your phone is waiting for permission.</p></div><script>const id=${JSON.stringify(pairingId)};const timer=setInterval(async()=>{const r=await fetch('/pair/status?id='+encodeURIComponent(id));const j=await r.json();if(j.approved){clearInterval(timer);location.href='/'}else if(j.denied||j.expired){clearInterval(timer);document.getElementById('status').textContent=j.denied?'Pairing was declined.':'Pairing expired. Scan a new QR code.'}},900)</script></body></html>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return replacements[character]!
  })
}
