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
    :root{color-scheme:light;--paper:#f8f8f6;--ink:#171716;--muted:#77736d;--line:#dedbd5;--card:#fff;--accent:#d97757}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    button,input,textarea,select{font:inherit}.shell{max-width:760px;margin:auto;min-height:100vh;padding:calc(20px + env(safe-area-inset-top)) 18px calc(24px + env(safe-area-inset-bottom))}
    header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:14px}.brand{font:600 21px Georgia,serif}.status{font-size:12px;color:var(--muted)}
    .view{display:none}.view.active{display:block}.toolbar{display:flex;gap:8px;align-items:center;margin:18px 0}.toolbar select{flex:1}
    select,button,textarea{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:10px 12px}button{cursor:pointer}button.primary{background:var(--ink);color:white;border-color:var(--ink)}button.quiet{background:transparent}
    .list{display:grid;gap:10px}.row{width:100%;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}.row strong{display:block}.row small{display:block;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .empty{padding:56px 14px;text-align:center;color:var(--muted)}.messages{display:grid;gap:12px;padding:6px 0 142px}.message{border-left:2px solid var(--line);padding:2px 0 2px 12px;white-space:pre-wrap;overflow-wrap:anywhere}.message.user{border-color:var(--accent)}.message .role{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px}
    .composer{position:fixed;left:0;right:0;bottom:0;padding:10px 18px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--paper) 14%)}.composer-inner{max-width:724px;margin:auto;display:flex;gap:8px;align-items:flex-end}.composer textarea{flex:1;min-height:48px;max-height:150px;resize:vertical}.error{color:#a23b28;font-size:13px;margin-top:10px}
  </style>
</head>
<body><main class="shell">
  <header><div class="brand">DSH Mobile</div><div id="status" class="status">${zh ? '正在连接…' : 'Connecting…'}</div></header>
  <section id="sessionsView" class="view active">
    <div class="toolbar"><select id="workspace"></select><button id="newSession">＋ ${zh ? '新会话' : 'New'}</button><button id="refresh">${zh ? '刷新' : 'Refresh'}</button></div>
    <div id="sessions" class="list"></div><div id="listError" class="error"></div>
  </section>
  <section id="chatView" class="view">
    <div class="toolbar"><button id="back" class="quiet">← ${zh ? '会话' : 'Sessions'}</button><button id="stop">${zh ? '停止' : 'Stop'}</button></div>
    <div id="messages" class="messages"></div><div id="chatError" class="error"></div>
    <div class="composer"><div class="composer-inner"><textarea id="prompt" placeholder="${zh ? '给 DSH 发消息' : 'Message DSH'}"></textarea><button id="send" class="primary">${zh ? '发送' : 'Send'}</button></div></div>
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
let activeSession=null,poll=null,workspaces=[];
const $=id=>document.getElementById(id);
async function rpc(method,payload={}){const r=await fetch('/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,payload})});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||L.failed);return j.value}
function textFrom(x){if(typeof x==='string')return x;if(Array.isArray(x))return x.map(textFrom).filter(Boolean).join('\n');if(!x||typeof x!=='object')return '';if(x.type==='text'&&typeof x.text==='string')return x.text;if(typeof x.message==='string')return x.message;if(typeof x.text==='string')return x.text;if(x.message)return textFrom(x.message);if(x.content)return textFrom(x.content);return ''}
function eventMessage(entry){const e=entry.event||entry,d=e.data||{},message=d.message||{};const t=String(e.type||'').toLowerCase(),declaredRole=d.role||message.role;let role='';if(t.includes('user')||declaredRole==='user')role='user';else if(t.includes('assistant')||declaredRole==='assistant')role='assistant';else return null;const text=textFrom(d);return text?{role,text}:null}
async function loadWorkspaces(){const value=await rpc('workspace.list');workspaces=value.items||[];$('workspace').innerHTML='<option value="">'+L.all+'</option>'+workspaces.map(w=>'<option value="'+esc(w.workspaceId)+'">'+esc(w.title||w.path)+'</option>').join('')}
async function loadSessions(){try{const value=await rpc('session.list',{}),wid=$('workspace').value,w=workspaces.find(x=>x.workspaceId===wid),allowed=w?new Set(w.sessionIds):null;const items=(value.items||[]).filter(s=>!allowed||allowed.has(s.sessionId)).sort((a,b)=>b.updatedAt-a.updatedAt);$('sessions').innerHTML=items.length?items.map(s=>'<button class="row" data-id="'+esc(s.sessionId)+'"><strong>'+esc(titleFor(s))+'</strong><small>'+esc(s.cwd||s.sessionId)+'</small></button>').join(''):'<div class="empty">'+L.noSessions+'</div>';document.querySelectorAll('.row').forEach(b=>b.onclick=()=>openSession(b.dataset.id))}catch(e){$('listError').textContent=e.message}}
async function createSession(){const workspaceId=$('workspace').value;if(!workspaceId){$('listError').textContent=L.chooseWorkspace;return}try{const created=await rpc('session.create',{workspaceId});await openSession(created.sessionId)}catch(e){$('listError').textContent=e.message}}
function titleFor(s){const p=s.projections&&s.projections.values||{};return p.title||p.sessionTitle||p['session.title']||L.untitled}
async function openSession(id){activeSession=id;$('sessionsView').classList.remove('active');$('chatView').classList.add('active');await loadHistory();poll=setInterval(loadHistory,1600)}
async function loadHistory(){if(!activeSession)return;try{const value=await rpc('session.history',{sessionId:activeSession,maxMessages:100});const messages=(value.events||[]).map(eventMessage).filter(Boolean);$('messages').innerHTML=messages.map(m=>'<div class="message '+m.role+'"><div class="role">'+esc(m.role)+'</div>'+esc(m.text)+'</div>').join('');$('chatError').textContent='';window.scrollTo(0,document.body.scrollHeight)}catch(e){$('chatError').textContent=e.message}}
async function send(){const text=$('prompt').value.trim();if(!text||!activeSession)return;$('send').disabled=true;try{await rpc('session.prompt',{sessionId:activeSession,mode:'steer',content:[{type:'text',text}],clientTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});$('prompt').value='';await loadHistory()}catch(e){$('chatError').textContent=e.message}finally{$('send').disabled=false}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('workspace').onchange=loadSessions;$('newSession').onclick=createSession;$('refresh').onclick=loadSessions;$('send').onclick=send;$('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}};$('back').onclick=()=>{clearInterval(poll);poll=null;activeSession=null;$('chatView').classList.remove('active');$('sessionsView').classList.add('active')};$('stop').onclick=async()=>{if(activeSession)await rpc('session.cancel',{sessionId:activeSession})};
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
