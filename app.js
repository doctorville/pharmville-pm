import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, sendSignInLinkToEmail,
  isSignInWithEmailLink, signInWithEmailLink } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, deleteDoc, onSnapshot, query, orderBy,
  limit, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, APP } from "./firebase-config.js";

const PRIORITIES = [["high","높음"],["mid","보통"],["low","낮음"]];
const STATUSES = ["대기","진행","완료","보류"];
const FIELD_LABEL = {name:"프로젝트명",title:"업무명",team:"주관팀",priority:"우선순위",status:"상태",start:"시작일",due:"목표일",note:"특이사항"};
const SUPERS = APP.superAdmins.map(e=>e.toLowerCase());

const S = { projects:[], tasks:[], history:[], openId:null, filter:{q:"",team:"",status:""},
  loaded:{p:false,t:false,h:false}, err:"", unsubs:[], acct:null, isAdmin:false };

const $ = (s,el=document)=>el.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const prLabel = p => (PRIORITIES.find(x=>x[0]===p)||["","-"])[1];
const fmtTime = iso => { try{ return new Date(iso).toLocaleString("ko-KR",{year:"2-digit",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}); }catch{ return iso; } };
const isLate = x => x.status!=="완료" && x.due && x.due < today();
const statusPill = x => (isLate(x)?`<span class="pill s-지연">지연</span>`:"")+`<span class="pill s-${esc(x.status)}">${esc(x.status)}</span>`;
const lc = e => String(e||"").trim().toLowerCase();
function toast(msg){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2400); }
function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v);}catch{ return null; } }

/* ---------- Firebase ---------- */
if(firebaseConfig.apiKey.startsWith("YOUR_")){
  document.getElementById("app").innerHTML=`<div class="login"><div class="login-card"><h1>설정 필요</h1>
  <div class="alert bad">firebase-config.js에 Firebase 프로젝트 값을 입력해야 합니다. README의 설정 순서를 따라 주세요.</div></div></div>`;
  throw new Error("firebase-config.js not configured");
}
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb); auth.languageCode = "ko";
const db = getFirestore(fb);
const homeUrl = location.origin + location.pathname;

function authMsg(e){
  const c=e?.code||"";
  if(c.includes("invalid-credential")||c.includes("wrong-password")||c.includes("user-not-found")) return "메일 또는 비밀번호가 올바르지 않습니다. 처음이면 '계정 활성화'를 먼저 진행해 주세요.";
  if(c.includes("email-already-in-use")) return "이미 활성화된 계정입니다. 로그인하거나 비밀번호를 재설정해 주세요.";
  if(c.includes("weak-password")) return "비밀번호는 8자 이상으로 정해 주세요.";
  if(c.includes("too-many-requests")) return "요청이 많아 잠시 막혔습니다. 몇 분 뒤 다시 시도해 주세요.";
  if(c.includes("quota-exceeded")) return "오늘 보낼 수 있는 인증 메일 수를 넘었습니다. 관리자에게 알려 주세요.";
  if(c.includes("invalid-action-code")||c.includes("expired-action-code")) return "로그인 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.";
  if(c.includes("unauthorized-continue-uri")||c.includes("unauthorized-domain")) return "이 주소가 Firebase 승인 도메인에 없습니다. 관리자가 Firebase 콘솔에서 도메인을 추가해야 합니다.";
  if(c.includes("network")) return "네트워크 연결을 확인해 주세요.";
  return "처리하지 못했습니다. ("+c+")";
}
async function isRegistered(email){
  if(SUPERS.includes(email)) return true;
  try{ const s=await getDoc(doc(db,"registry",email)); return s.exists() && s.data().active===true; }catch{ return false; }
}

/* ---------- Login screens ---------- */
function gate(inner){
  $("#app").innerHTML=`<div class="login"><div class="login-card">
    <div class="brand"><div class="brand-mark">P</div><div><strong>팜빌 활성화 PM</strong><div class="muted" style="font-size:12px">엠서클 닥터빌 · 프로젝트 마일스톤 관리</div></div></div>
    ${inner}</div></div>`;
}
const fieldHtml=(id,label,type="text",ph="",val="")=>`<label style="display:grid;gap:4px;font-size:12px;color:var(--muted);font-weight:500">${label}
  <input class="field ${type==="email"?"mono":""}" id="${id}" type="${type}" placeholder="${ph}" value="${esc(val)}" ${type==="password"?'autocomplete="current-password"':""}></label>`;

function renderLogin(tab="login", msg="", email=ls("pv_email")||""){
  const tabs = APP.authMode==="password"
    ? `<div class="actions" style="justify-content:flex-start">${[["login","로그인"],["activate","계정 활성화(최초 1회)"],["reset","비밀번호 재설정"]].map(([k,l])=>`<button class="btn sm ${k===tab?"primary":""}" data-tab="${k}" type="button">${l}</button>`).join("")}</div>` : "";
  let body="";
  if(APP.authMode==="link"){
    body=`<h1>메일 인증 로그인</h1><p class="muted" style="margin:0;font-size:13px">관리자가 등록한 메일로 로그인 링크를 보내 드립니다.</p>
      ${fieldHtml("lgEmail","등록된 메일","email","name@company.com",email)}
      <button class="btn primary" id="lgGo" type="button">로그인 링크 받기</button>`;
  } else if(tab==="login"){
    body=`<h1>로그인</h1>${fieldHtml("lgEmail","등록된 메일","email","name@company.com",email)}${fieldHtml("lgPw","비밀번호","password")}
      <button class="btn primary" id="lgGo" type="button">로그인</button>`;
  } else if(tab==="activate"){
    body=`<h1>계정 활성화</h1><p class="muted" style="margin:0;font-size:13px">관리자가 등록한 메일로 비밀번호를 정하면 인증 메일을 보내 드립니다. 메일의 링크를 누르면 활성화가 끝납니다.</p>
      ${fieldHtml("lgEmail","등록된 메일","email","name@company.com",email)}${fieldHtml("lgPw","새 비밀번호 (8자 이상)","password")}${fieldHtml("lgPw2","비밀번호 확인","password")}
      <button class="btn primary" id="lgGo" type="button">인증 메일 받기</button>`;
  } else {
    body=`<h1>비밀번호 재설정</h1>${fieldHtml("lgEmail","등록된 메일","email","name@company.com",email)}
      <button class="btn primary" id="lgGo" type="button">재설정 메일 받기</button>`;
  }
  gate(`${tabs}${body}<div class="${msg.startsWith("✓")?"alert info":"err"}" id="lgMsg">${esc(msg.replace(/^✓/,""))}</div>`);
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>renderLogin(b.dataset.tab,"",lc($("#lgEmail")?.value)));
  const go=$("#lgGo"), out=$("#lgMsg");
  document.querySelectorAll("#app input").forEach(i=>i.onkeydown=e=>{ if(e.key==="Enter") go.click(); });
  const say=(t,ok)=>{ out.className=ok?"alert info":"err"; out.textContent=t; };
  go.onclick=async()=>{
    const em=lc($("#lgEmail").value);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return say("메일 주소 형식을 확인해 주세요.");
    go.disabled=true; say("");
    try{
      if(tab!=="login"||APP.authMode==="link"){
        if(!(await isRegistered(em))){ go.disabled=false; return say("등록되지 않았거나 사용 중지된 계정입니다. 관리자에게 등록을 요청해 주세요."); }
      }
      ls("pv_email",em);
      if(APP.authMode==="link"){
        await sendSignInLinkToEmail(auth, em, {url: homeUrl, handleCodeInApp:true});
        say(`${em} 로 로그인 링크를 보냈습니다. 메일의 링크를 이 브라우저에서 열어 주세요. (스팸함도 확인)`,true);
      } else if(tab==="login"){
        await signInWithEmailAndPassword(auth, em, $("#lgPw").value);
      } else if(tab==="activate"){
        const p1=$("#lgPw").value, p2=$("#lgPw2").value;
        if(p1.length<8){ go.disabled=false; return say("비밀번호는 8자 이상으로 정해 주세요."); }
        if(p1!==p2){ go.disabled=false; return say("비밀번호 확인이 일치하지 않습니다."); }
        const cred=await createUserWithEmailAndPassword(auth, em, p1);
        await sendEmailVerification(cred.user, {url: homeUrl});
        // onAuthStateChanged → 인증 대기 화면
      } else {
        await sendPasswordResetEmail(auth, em, {url: homeUrl});
        say("비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해 주세요.",true);
      }
    }catch(e){ say(authMsg(e)); }
    go.disabled=false;
  };
}

function renderVerify(user, msg=""){
  gate(`<h1>메일 인증 대기</h1>
    <div class="idbox"><span class="lbl">인증 메일을 보낸 주소</span><span class="email">${esc(user.email)}</span>
    <span class="muted" style="font-size:12px">메일의 인증 링크를 누른 뒤 아래 '인증 완료'를 눌러 주세요. 보이지 않으면 스팸함을 확인해 주세요.</span></div>
    <button class="btn primary" id="vDone" type="button">인증 완료</button>
    <div class="actions" style="justify-content:space-between"><button class="btn sm" id="vResend" type="button">인증 메일 다시 보내기</button><button class="btn sm" id="vOut" type="button">다른 계정으로</button></div>
    <div class="err" id="vMsg">${esc(msg)}</div>`);
  $("#vDone").onclick=async()=>{ await user.reload(); if(auth.currentUser.emailVerified){ await auth.currentUser.getIdToken(true); enter(auth.currentUser); } else $("#vMsg").textContent="아직 인증되지 않았습니다. 메일의 링크를 먼저 눌러 주세요."; };
  $("#vResend").onclick=async e=>{ e.target.disabled=true; try{ await sendEmailVerification(user,{url:homeUrl}); toast("인증 메일을 다시 보냈습니다."); }catch(err){ $("#vMsg").textContent=authMsg(err); } setTimeout(()=>e.target.disabled=false,60000); };
  $("#vOut").onclick=()=>signOut(auth);
}

async function handleEmailLink(){
  if(!isSignInWithEmailLink(auth, location.href)) return false;
  let em=ls("pv_email");
  const finish=async(address)=>{
    try{ await signInWithEmailLink(auth, address, location.href); ls("pv_email",address); history.replaceState(null,"",homeUrl); }
    catch(e){ history.replaceState(null,"",homeUrl); renderLogin("login",authMsg(e)); }
  };
  if(em){ await finish(em); return true; }
  gate(`<h1>메일 확인</h1><p class="muted" style="margin:0;font-size:13px">다른 브라우저에서 링크를 열었습니다. 로그인 링크를 받은 메일을 한 번 더 입력해 주세요.</p>
    ${fieldHtml("lkEmail","등록된 메일","email")}<button class="btn primary" id="lkGo" type="button">로그인</button>`);
  $("#lkGo").onclick=()=>finish(lc($("#lkEmail").value));
  return true;
}

async function enter(user){
  const em=lc(user.email);
  let acct=null;
  try{ const s=await getDoc(doc(db,"accounts",em)); if(s.exists()) acct=s.data(); }catch{}
  const sup=SUPERS.includes(em);
  if(!sup && (!acct || acct.active!==true)){
    await signOut(auth);
    return renderLogin("login","등록되지 않았거나 사용 중지된 계정입니다. 관리자에게 문의해 주세요.");
  }
  S.acct={ email:em, uid:user.uid, name:acct?.name||em.split("@")[0], team:acct?.team||"", role:sup?"super":(acct?.role||"member") };
  S.isAdmin = sup || acct?.role==="admin";
  startApp();
}

onAuthStateChanged(auth, async user=>{
  stopApp();
  if(!user){ if(await handleEmailLink()) return; return renderLogin(); }
  if(!user.emailVerified) return renderVerify(user);
  enter(user);
});

/* ---------- Data ---------- */
function stopApp(){ S.unsubs.forEach(u=>u()); S.unsubs=[]; S.projects=[]; S.tasks=[]; S.history=[]; S.openId=null; S.loaded={p:false,t:false,h:false}; $("#layer").innerHTML=""; }
function startApp(){
  renderShell();
  const onErr=e=>{ S.err = e?.code==="permission-denied" ? "데이터 접근 권한이 없습니다. 계정 상태를 관리자에게 확인해 주세요." : "데이터를 불러오지 못했습니다. 네트워크를 확인해 주세요."; render(); };
  const sub=(q,key,setter)=>onSnapshot(q,s=>{ setter(s.docs.map(d=>({id:d.id,...d.data()}))); S.loaded[key]=true; S.err=""; render(); },onErr);
  S.unsubs=[
    sub(collection(db,"projects"),"p",v=>S.projects=v),
    sub(collection(db,"tasks"),"t",v=>S.tasks=v),
    sub(query(collection(db,"history"),orderBy("at","desc"),limit(1000)),"h",v=>S.history=v),
  ];
}
function teamsList(){ const set=new Set(APP.defaultTeams); S.projects.forEach(p=>p.team&&set.add(p.team)); S.tasks.forEach(t=>t.team&&set.add(t.team)); return [...set]; }
const histEntry=(o)=>({...o, by:S.acct.uid, byName:S.acct.name, byEmail:S.acct.email, at:new Date().toISOString()});

/* ---------- Shell ---------- */
function renderShell(){
  const a=S.acct;
  $("#app").innerHTML=`
  <header class="top">
    <div><h1>팜빌 활성화 프로젝트</h1><div class="muted" style="font-size:13px">마일스톤 기반 프로젝트·세부업무 관리</div></div>
    <div class="who"><div class="avatar">${esc((a.name||"?").slice(0,1))}</div><div><div>${esc(a.name)}${a.team?` <span class="pill">${esc(a.team)}</span>`:""}${S.isAdmin?` <span class="pill p-low">${a.role==="super"?"최고 관리자":"관리자"}</span>`:""}</div><div class="email">${esc(a.email)}</div></div>
    ${S.isAdmin?`<button class="btn sm" id="acctBtn" type="button">계정 관리</button>`:""}<button class="btn sm" id="logoutBtn" type="button">로그아웃</button></div>
  </header>
  <div id="banner"></div>
  <section class="stats" id="stats"></section>
  <div class="toolbar">
    <input class="field grow" id="q" placeholder="프로젝트·세부업무 검색" value="${esc(S.filter.q)}">
    <select class="field" id="fTeam" style="width:auto"></select>
    <select class="field" id="fStatus" style="width:auto"><option value="">전체 상태</option>${STATUSES.map(s=>`<option>${s}</option>`).join("")}<option value="지연">지연</option></select>
    <button class="btn primary" id="addProject" type="button">+ 프로젝트 추가</button>
  </div>
  <section class="board" id="board"></section>
  <div class="legend"><span><i class="bar" style="position:static;transform:none;width:22px;display:inline-block"></i>프로젝트 기간</span><span><i class="ms"></i>세부업무 목표일</span><span><i class="ms done"></i>완료</span><span><i class="ms late"></i>지연</span><span><i class="today"></i>오늘</span></div>`;
  $("#logoutBtn").onclick=()=>signOut(auth);
  if($("#acctBtn")) $("#acctBtn").onclick=openAccounts;
  $("#q").oninput=e=>{S.filter.q=e.target.value;renderBoard();};
  $("#fTeam").onchange=e=>{S.filter.team=e.target.value;renderBoard();};
  $("#fStatus").onchange=e=>{S.filter.status=e.target.value;renderBoard();};
  $("#addProject").onclick=()=>openForm("project");
  render();
}
function render(){
  if(!$("#board")) return;
  $("#teams").innerHTML=teamsList().map(t=>`<option value="${esc(t)}">`).join("");
  const cur=S.filter.team;
  $("#fTeam").innerHTML=`<option value="">전체 주관팀</option>`+teamsList().map(t=>`<option ${t===cur?"selected":""}>${esc(t)}</option>`).join("");
  $("#fStatus").value=S.filter.status;
  $("#banner").innerHTML = S.err ? `<div class="alert bad banner">${esc(S.err)}</div>` : "";
  renderStats(); renderBoard(); renderDrawer();
}
function renderStats(){
  const t=today(), wk=new Date(); wk.setDate(wk.getDate()+7); const wks=wk.toISOString().slice(0,10);
  const s=[["전체 프로젝트",S.projects.length,""],["진행 중",S.projects.filter(p=>p.status==="진행").length,""],
    ["지연 (프로젝트+업무)",[...S.projects,...S.tasks].filter(isLate).length,"bad"],
    ["7일 내 마감 세부업무",S.tasks.filter(x=>x.status!=="완료"&&x.due>=t&&x.due<=wks).length,"warn"]];
  $("#stats").innerHTML=s.map(([k,v,c])=>`<div class="stat ${c}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
}
function progress(pid){ const ts=S.tasks.filter(t=>t.projectId===pid); if(!ts.length) return null; return Math.round(ts.filter(t=>t.status==="완료").length/ts.length*100); }
function range(){
  const ds=[]; S.projects.forEach(p=>{p.start&&ds.push(p.start);p.due&&ds.push(p.due);}); ds.push(today());
  ds.sort(); const a=new Date(ds[0]+"T00:00:00"), b=new Date(ds[ds.length-1]+"T00:00:00");
  a.setDate(1); b.setMonth(b.getMonth()+1,1);
  if((b-a)/864e5<90){ b.setTime(a.getTime()); b.setMonth(a.getMonth()+3); }
  return [a,b];
}
function renderBoard(){
  const f=S.filter, q=f.q.trim().toLowerCase();
  let list=S.projects.filter(p=>{
    if(f.team&&p.team!==f.team) return false;
    if(f.status==="지연"&&!isLate(p)) return false;
    if(f.status&&f.status!=="지연"&&p.status!==f.status) return false;
    if(q){ const hay=[p.name,p.team,p.note,...S.tasks.filter(t=>t.projectId===p.id).map(t=>t.title)].join(" ").toLowerCase(); if(!hay.includes(q)) return false; }
    return true; });
  const po={high:0,mid:1,low:2}; list.sort((a,b)=>(a.due||"").localeCompare(b.due||"")||(po[a.priority]-po[b.priority]));
  const el=$("#board");
  if(!S.projects.length){ el.innerHTML=`<div class="empty">${S.loaded.p?`아직 등록된 프로젝트가 없습니다.<br>상단의 <b>+ 프로젝트 추가</b>로 첫 프로젝트를 만들어 보세요.`:"프로젝트를 불러오는 중…"}</div>`; return; }
  const [a,b]=range(), span=b-a, pos=d=>((new Date(d+"T00:00:00")-a)/span*100);
  const ticks=[]; const m=new Date(a); while(m<b){ ticks.push(new Date(m)); m.setMonth(m.getMonth()+1); }
  const tickHtml=(lbl)=>ticks.map(d=>{const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; return lbl?`<span class="tick" style="left:${pos(iso)}%">${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,"0")}</span>`:`<i class="gridline" style="left:${pos(iso)}%"></i>`;}).join("");
  const td=pos(today());
  el.innerHTML=`<div class="axis"><div class="lh">프로젝트</div><div class="track">${tickHtml(true)}</div></div>`+
   (list.length?list.map(p=>{
    const pr=progress(p.id), ts=S.tasks.filter(t=>t.projectId===p.id);
    const l=p.start?pos(p.start):0, r=p.due?pos(p.due):l;
    const cls=p.status==="완료"?"done":isLate(p)?"late":"";
    return `<div class="row" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)} 상세">
      <div class="info"><div class="name">${esc(p.name)}</div>
        <div class="meta"><span class="pill p-${esc(p.priority)}">우선 ${prLabel(p.priority)}</span>${statusPill(p)}<span class="pill">${esc(p.team||"-")}</span></div>
        <div class="meta muted"><span class="mono">${esc(p.start||"?")} → ${esc(p.due||"?")}</span><span>· 세부업무 ${ts.length}건${pr!==null?` · ${pr}%`:""}</span></div>
        ${pr!==null?`<div class="prog"><i style="width:${pr}%"></i></div>`:""}</div>
      <div class="track">${tickHtml(false)}<i class="today" style="left:${td}%"></i>
        <i class="bar ${cls}" style="left:${l}%;width:${Math.max(r-l,.6)}%" title="${esc(p.start)} ~ ${esc(p.due)}"></i>
        ${ts.filter(t=>t.due).map(t=>`<i class="ms ${t.status==="완료"?"done":isLate(t)?"late":""}" style="left:${pos(t.due)}%" title="${esc(t.title)} · ${esc(t.due)}"></i>`).join("")}
      </div></div>`; }).join("") : `<div class="empty">조건에 맞는 프로젝트가 없습니다.</div>`);
  el.querySelectorAll(".row").forEach(r=>{ const o=()=>{S.openId=r.dataset.id;renderDrawer();}; r.onclick=o; r.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();o();}}; });
}

/* ---------- Drawer ---------- */
function renderDrawer(){
  const layer=$("#layer"); const keep=[...layer.querySelectorAll(".modal-scrim,.modal")];
  let d=$("#drawerWrap");
  const p=S.projects.find(x=>x.id===S.openId);
  if(!p){ d?.remove(); return; }
  if(!d){ d=document.createElement("div"); d.id="drawerWrap"; layer.prepend(d); }
  const ts=S.tasks.filter(t=>t.projectId===p.id).sort((a,b)=>(a.due||"").localeCompare(b.due||""));
  const hs=S.history.filter(h=>h.projectId===p.id);
  d.innerHTML=`<div class="scrim" id="dScrim"></div><aside class="drawer" role="dialog" aria-label="프로젝트 상세">
    <div class="dh"><div><div class="meta" style="margin-bottom:6px"><span class="pill p-${esc(p.priority)}">우선 ${prLabel(p.priority)}</span>${statusPill(p)}</div><h2>${esc(p.name)}</h2></div>
      <button class="btn sm" id="dClose" type="button">닫기</button></div>
    <div class="card"><h3>프로젝트 정보<span style="display:flex;gap:6px"><button class="btn sm" id="pEdit">수정</button><button class="btn sm danger" id="pDel">삭제</button></span></h3>
      <dl class="kv"><dt>주관팀</dt><dd>${esc(p.team||"-")}</dd><dt>목표일정</dt><dd class="mono">${esc(p.start)} ~ ${esc(p.due)}</dd>
      <dt>진행률</dt><dd>${progress(p.id)??0}% (${ts.filter(t=>t.status==="완료").length}/${ts.length})</dd><dt>특이사항</dt><dd>${esc(p.note||"-")}</dd></dl></div>
    <div class="card"><h3>세부 업무 <span class="muted" style="font-weight:400">${ts.length}건</span><button class="btn sm primary" id="tAdd">+ 세부업무</button></h3>
      ${ts.length?ts.map(t=>`<div class="task"><div><div class="t">${esc(t.title)}</div>
        <div class="meta" style="margin-top:4px"><span class="pill p-${esc(t.priority)}">${prLabel(t.priority)}</span>${statusPill(t)}<span class="pill">${esc(t.team||"-")}</span><span class="mono muted">${esc(t.start||"")}${t.start?" → ":""}${esc(t.due)}</span></div></div>
        <div style="display:flex;gap:6px;align-items:start"><button class="btn sm" data-edit="${esc(t.id)}">수정</button><button class="btn sm danger" data-del="${esc(t.id)}">삭제</button></div>
        ${t.note?`<div class="note">${esc(t.note)}</div>`:""}</div>`).join(""):`<p class="muted" style="margin:0">아직 세부업무가 없습니다. 목표일은 프로젝트 기간(${esc(p.start)} ~ ${esc(p.due)}) 안에서 선택합니다.</p>`}
    </div>
    <div class="card"><h3>수정 이력 <span class="muted" style="font-weight:400">${hs.length}건</span></h3>
      <div class="hist">${hs.length?hs.map(h=>`<div class="h-item"><div class="h-head"><span class="pill">${{create:"등록",update:"수정",delete:"삭제"}[h.action]||esc(h.action)}</span><span>${h.targetType==="task"?"세부업무":"프로젝트"} · ${esc(h.targetName)}</span><span class="mono">${esc(fmtTime(h.at))}</span><span>${esc(h.byName||h.byEmail||"")}</span></div>
        ${h.reason?`<div class="h-reason"><b>사유</b> ${esc(h.reason)}</div>`:""}
        ${(h.changes||[]).length?`<div class="h-diff">${h.changes.map(c=>`<div><b>${esc(FIELD_LABEL[c.field]||c.field)}</b>: <s>${esc(c.field==="priority"?prLabel(c.from):c.from||"없음")}</s> → ${esc(c.field==="priority"?prLabel(c.to):c.to||"없음")}</div>`).join("")}</div>`:""}</div>`).join(""):`<p class="muted" style="margin:0">이력이 없습니다.</p>`}</div></div>
  </aside>`;
  $("#dScrim").onclick=$("#dClose").onclick=()=>{S.openId=null;renderDrawer();};
  $("#pEdit").onclick=()=>openForm("project",p);
  $("#pDel").onclick=()=>openDelete("project",p);
  $("#tAdd").onclick=()=>openForm("task",null,p);
  d.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openForm("task",S.tasks.find(t=>t.id===b.dataset.edit),p));
  d.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>openDelete("task",S.tasks.find(t=>t.id===b.dataset.del),p));
  keep.forEach(n=>layer.appendChild(n));
}

/* ---------- Modals ---------- */
function closeModal(){ $("#layer").querySelectorAll(".modal,.modal-scrim").forEach(e=>e.remove()); S.acUnsub?.(); S.acUnsub=null; }
function modal(html){ closeModal(); const l=$("#layer"); l.insertAdjacentHTML("beforeend",`<div class="scrim modal-scrim"></div><div class="modal" role="dialog">${html}</div>`); l.querySelector(".modal-scrim").onclick=closeModal; return l.querySelector(".modal"); }
const fbErr=e=>e?.code==="permission-denied"?"권한이 없거나 입력값이 규칙에 맞지 않습니다. (세부업무 날짜는 프로젝트 기간 안이어야 합니다)":"저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

function openForm(type, item, parent){
  const isP=type==="project", editing=!!item;
  const v=item||{priority:"mid",status:"대기",team:isP?(S.acct.team||APP.defaultTeams[0]):(parent?.team||""),start:isP?today():"",due:""};
  const minD=isP?"":parent.start, maxD=isP?"":parent.due;
  const m=modal(`<h2 style="font-size:18px">${isP?"프로젝트":"세부업무"} ${editing?"수정":"추가"}</h2>
    ${!isP?`<div class="hint">상위 프로젝트: <b>${esc(parent.name)}</b> · 선택 가능 기간 <span class="mono">${esc(parent.start)} ~ ${esc(parent.due)}</span></div>`:""}
    <form class="form" novalidate>
      <label class="full">${isP?"프로젝트명":"업무명"} *<input class="field" id="f_name" value="${esc(isP?v.name:v.title)}" maxlength="120"></label>
      <label>우선순위<select class="field" id="f_priority">${PRIORITIES.map(([k,l])=>`<option value="${k}" ${v.priority===k?"selected":""}>${l}</option>`).join("")}</select></label>
      <label>업무 주관팀 *<input class="field" id="f_team" list="teams" value="${esc(v.team)}" placeholder="선택 또는 직접 입력"></label>
      <label>시작일${isP?" *":""}<input class="field mono" type="date" id="f_start" value="${esc(v.start)}" ${minD?`min="${minD}" max="${maxD}"`:""}></label>
      <label>목표일 *<input class="field mono" type="date" id="f_due" value="${esc(v.due)}" ${minD?`min="${minD}" max="${maxD}"`:""}></label>
      <label>상태<select class="field" id="f_status">${STATUSES.map(s=>`<option ${v.status===s?"selected":""}>${s}</option>`).join("")}</select></label>
      <label class="full">특이사항<textarea class="field" id="f_note" maxlength="2000">${esc(v.note)}</textarea></label>
      ${editing?`<div class="reason-box full"><label for="f_reason">수정 사유 * (이력에 기록됩니다)</label><textarea class="field" id="f_reason" maxlength="1000" placeholder="예: 협력사 일정 변경 요청(유선 협의, 메일로 확인 예정)"></textarea></div>`:""}
    </form>
    <div class="err" id="fErr"></div>
    <div class="actions"><button class="btn" id="fCancel" type="button">취소</button><button class="btn primary" id="fSave" type="button">${editing?"수정 저장":"추가"}</button></div>`);
  $("#fCancel",m).onclick=closeModal; $("#f_name",m).focus();
  $("#fSave",m).onclick=async()=>{
    const g=id=>$("#f_"+id,m).value.trim(), err=t=>{$("#fErr",m).textContent=t;};
    const data={priority:g("priority"),team:g("team"),start:g("start"),due:g("due"),status:g("status"),note:g("note")};
    data[isP?"name":"title"]=g("name");
    if(!g("name")) return err(`${isP?"프로젝트명":"업무명"}을 입력해 주세요.`);
    if(!data.team) return err("업무 주관팀을 선택하거나 입력해 주세요.");
    if(isP&&!data.start) return err("시작일을 입력해 주세요.");
    if(!data.due) return err("목표일을 입력해 주세요.");
    if(data.start&&data.start>data.due) return err("시작일이 목표일보다 늦습니다.");
    if(!isP){
      if(data.due<parent.start||data.due>parent.due) return err(`목표일은 프로젝트 기간(${parent.start} ~ ${parent.due}) 안에서 선택해 주세요.`);
      if(data.start&&(data.start<parent.start||data.start>parent.due)) return err(`시작일은 프로젝트 기간(${parent.start} ~ ${parent.due}) 안이어야 합니다.`);
    } else if(editing){
      const out=S.tasks.filter(t=>t.projectId===item.id&&((t.due&&(t.due<data.start||t.due>data.due))||(t.start&&(t.start<data.start||t.start>data.due))));
      if(out.length) return err(`세부업무 ${out.length}건(${out.slice(0,3).map(t=>t.title).join(", ")}${out.length>3?" 외":""})의 일정이 새 기간을 벗어납니다. 세부업무 일정을 먼저 조정해 주세요.`);
    }
    let changes=[], reason="";
    if(editing){
      changes=Object.keys(data).filter(k=>(item[k]||"")!==(data[k]||"")).map(k=>({field:k,from:item[k]||"",to:data[k]||""}));
      if(!changes.length) return err("변경된 내용이 없습니다.");
      reason=g("reason"); if(!reason){ $("#f_reason",m).focus(); return err("수정 사유를 입력해 주세요."); }
    }
    const btn=$("#fSave",m); btn.disabled=true;
    const now=new Date().toISOString(), col=isP?"projects":"tasks";
    try{
      const ref = editing ? doc(db,col,item.id) : doc(collection(db,col));
      const pid = isP ? ref.id : parent.id;
      const b=writeBatch(db);
      if(editing) b.update(ref,{...data,updatedAt:now,updatedBy:S.acct.uid});
      else b.set(ref,{...data,...(isP?{}:{projectId:parent.id}),createdAt:now,createdBy:S.acct.uid,updatedAt:now,updatedBy:S.acct.uid});
      b.set(doc(collection(db,"history")), histEntry({projectId:pid,targetType:type,targetId:ref.id,targetName:data[isP?"name":"title"],action:editing?"update":"create",reason,changes}));
      await b.commit();
      closeModal(); toast(editing?"수정 내용과 사유를 저장했습니다.":`${isP?"프로젝트":"세부업무"}를 추가했습니다.`);
      if(isP&&!editing){ S.openId=ref.id; renderDrawer(); }
    }catch(e){ btn.disabled=false; err(fbErr(e)); }
  };
}

function openDelete(type,item,parent){
  const isP=type==="project", kids=isP?S.tasks.filter(t=>t.projectId===item.id):[];
  const m=modal(`<h2 style="font-size:18px">${isP?"프로젝트":"세부업무"} 삭제</h2>
    <p style="margin:0"><b>${esc(isP?item.name:item.title)}</b>을(를) 삭제합니다.${kids.length?` 하위 세부업무 ${kids.length}건도 함께 삭제됩니다.`:""}</p>
    <div class="reason-box"><label for="d_reason">삭제 사유 *</label><textarea class="field" id="d_reason" maxlength="1000"></textarea></div>
    <div class="err" id="dErr"></div>
    <div class="actions"><button class="btn" id="dCancel" type="button">취소</button><button class="btn danger" id="dOk" type="button">삭제</button></div>`);
  $("#dCancel",m).onclick=closeModal; $("#d_reason",m).focus();
  $("#dOk",m).onclick=async()=>{
    const reason=$("#d_reason",m).value.trim(); if(!reason) return $("#dErr",m).textContent="삭제 사유를 입력해 주세요.";
    $("#dOk",m).disabled=true;
    try{
      for(const t of kids) await deleteDoc(doc(db,"tasks",t.id));
      const b=writeBatch(db);
      b.delete(doc(db,isP?"projects":"tasks",item.id));
      b.set(doc(collection(db,"history")), histEntry({projectId:isP?item.id:parent.id,targetType:type,targetId:item.id,targetName:isP?item.name:item.title,action:"delete",reason,changes:[]}));
      await b.commit();
      if(isP) S.openId=null;
      closeModal(); toast("삭제했습니다. 사유는 이력에 남았습니다.");
    }catch(e){ $("#dOk",m).disabled=false; $("#dErr",m).textContent=fbErr(e); }
  };
}

/* ---------- 관리자: 계정 관리 ---------- */
function openAccounts(){
  if(!S.isAdmin) return;
  const m=modal(`<div class="dh"><h2 style="font-size:18px">계정 관리</h2><button class="btn sm" id="acClose" type="button">닫기</button></div>
    <p class="hint" style="margin:0">등록되고 '사용' 상태인 계정만 로그인할 수 있습니다. 메일 도메인 제한은 없습니다.</p>
    <form class="form" novalidate>
      <label class="full">메일 *<input class="field mono" id="ac_email" type="email" placeholder="name@company.com"></label>
      <label>이름 *<input class="field" id="ac_name" maxlength="40"></label>
      <label>소속팀<input class="field" id="ac_team" list="teams" maxlength="40"></label>
      <label>권한<select class="field" id="ac_role"><option value="member">일반</option><option value="admin">관리자</option></select></label>
      <label>메모<input class="field" id="ac_note" maxlength="200" placeholder="예: 협력사 담당자"></label>
    </form>
    <div class="err" id="acErr"></div>
    <div class="actions"><button class="btn primary" id="acAdd" type="button">계정 등록</button></div>
    <div class="card" style="padding:10px 14px"><h3>등록 계정 <span class="muted" id="acCount" style="font-weight:400"></span></h3><div id="acList" class="hist"><p class="muted" style="margin:0">불러오는 중…</p></div></div>`);
  $("#acClose",m).onclick=closeModal;
  const err=t=>{$("#acErr",m).textContent=t;};
  const save=async(a,patch)=>{ const b=writeBatch(db); const n={...a,...patch}; delete n.id;
    b.set(doc(db,"accounts",a.id),{...n,updatedAt:new Date().toISOString(),updatedBy:S.acct.email});
    b.set(doc(db,"registry",a.id),{active:n.active===true}); await b.commit(); };
  const draw=list=>{
    $("#acCount",m).textContent=`${list.length}명`;
    $("#acList",m).innerHTML=list.length?list.map(a=>{ const sup=SUPERS.includes(a.id); return `<div class="h-item"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
      <div style="min-width:0"><b>${esc(a.name)}</b> <span class="pill">${esc(a.team||"-")}</span> ${sup?`<span class="pill p-low">최고 관리자</span>`:a.role==="admin"?`<span class="pill p-low">관리자</span>`:""} ${a.active?`<span class="pill s-완료">사용</span>`:`<span class="pill s-보류">중지</span>`}
      <div class="mono muted" style="font-size:12px;word-break:break-all">${esc(a.id)}</div>${a.note?`<div class="muted" style="font-size:12px">${esc(a.note)}</div>`:""}</div>
      ${sup?"":`<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-role="${esc(a.id)}">${a.role==="admin"?"관리자 해제":"관리자 지정"}</button><button class="btn sm" data-tog="${esc(a.id)}">${a.active?"사용 중지":"다시 사용"}</button><button class="btn sm danger" data-rm="${esc(a.id)}">삭제</button></div>`}</div></div>`; }).join("")
      :`<p class="muted" style="margin:0">아직 등록된 계정이 없습니다.</p>`;
    const find=id=>list.find(x=>x.id===id);
    m.querySelectorAll("[data-tog]").forEach(b=>b.onclick=async()=>{ const a=find(b.dataset.tog); b.disabled=true; try{ await save(a,{active:!a.active}); toast(a.active?"사용을 중지했습니다.":"다시 사용하도록 바꿨습니다."); }catch(e){ b.disabled=false; err(fbErr(e)); } });
    m.querySelectorAll("[data-role]").forEach(b=>b.onclick=async()=>{ const a=find(b.dataset.role); b.disabled=true; try{ await save(a,{role:a.role==="admin"?"member":"admin"}); toast("권한을 바꿨습니다."); }catch(e){ b.disabled=false; err(fbErr(e)); } });
    m.querySelectorAll("[data-rm]").forEach(b=>b.onclick=async()=>{ const a=find(b.dataset.rm);
      if(b.dataset.confirm!=="1"){ b.dataset.confirm="1"; b.textContent="한 번 더 누르면 삭제"; return; }
      b.disabled=true;
      try{ const bt=writeBatch(db); bt.delete(doc(db,"accounts",a.id)); bt.delete(doc(db,"registry",a.id)); await bt.commit(); toast("계정을 삭제했습니다."); }
      catch(e){ b.disabled=false; err(fbErr(e)); } });
  };
  S.acUnsub=onSnapshot(collection(db,"accounts"),
    s=>draw(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.name||"").localeCompare(b.name||"","ko"))),
    ()=>{ $("#acList",m).innerHTML=`<p class="err" style="margin:0">계정 목록을 불러오지 못했습니다.</p>`; });
  $("#acAdd",m).onclick=async()=>{
    const g=id=>$("#ac_"+id,m).value.trim(), email=lc(g("email"));
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("메일 주소 형식을 확인해 주세요.");
    if(!g("name")) return err("이름을 입력해 주세요.");
    const btn=$("#acAdd",m); btn.disabled=true; err("");
    try{
      const ex=await getDoc(doc(db,"accounts",email));
      if(ex.exists()){ btn.disabled=false; return err("이미 등록된 메일입니다."); }
      const now=new Date().toISOString(), b=writeBatch(db);
      b.set(doc(db,"accounts",email),{name:g("name"),team:g("team"),note:g("note"),role:g("role"),active:true,createdAt:now,createdBy:S.acct.email});
      b.set(doc(db,"registry",email),{active:true});
      await b.commit();
      ["email","name","team","note"].forEach(k=>$("#ac_"+k,m).value=""); toast("계정을 등록했습니다.");
    }catch(e){ err(fbErr(e)); }
    btn.disabled=false;
  };
}
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ if($(".modal")) closeModal(); else if(S.openId){S.openId=null;renderDrawer();} } });
