// TC build v6
'use strict';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, query, where, onSnapshot, getDocs, serverTimestamp, updateDoc, deleteDoc, orderBy, limit, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ===== Config (your Firebase project) ===== */
const firebaseConfig = {
  apiKey: "AIzaSyCAi1zcDsdprr78A5RdYiOhz6Xn8Oiz54s",
  authDomain: "timeclock-15ac7.firebaseapp.com",
  projectId: "timeclock-15ac7",
  storageBucket: "timeclock-15ac7.firebasestorage.app",
  messagingSenderId: "469697538798",
  appId: "1:469697538798:web:5f6333835de2523bdba1ff",
  measurementId: "G-RTW4RDNZHC"
};

/* ===== Init ===== */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ===== Helpers ===== */
function $(s){ return document.querySelector(s); }
function $all(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }
function pad2(n){ n=Math.round(n); return (n<10?'0':'')+n; }
function fmt2(n){ return (Math.round(n*100)/100).toFixed(2); }
function hmNoLead(d){ return String(d.getHours()) + ':' + pad2(d.getMinutes()); }
function dateKey(d){ return d.toISOString().slice(0,10); }
function mdy(d){ return d.toLocaleDateString(undefined,{ month:'short', day:'numeric', year:'numeric' }); }
function show(el, v){ el.classList.toggle('hidden', !v); }
function fullNameOf(u){ const a=[]; if(u&&u.firstName) a.push(u.firstName); if(u&&u.lastName) a.push(u.lastName); return a.join(' ').trim(); }
function todayISO(){ return new Date().toISOString().slice(0,10); }

const msg = $('#msg');

/* Desktop-only guard */
(function(){
  const ua=(navigator.userAgent||'').toLowerCase();
  const mobile=/android|iphone|ipad|ipod|iemobile|blackberry|opera mini/.test(ua);
  const touch=(navigator.maxTouchPoints||0)>0;
  const small=Math.min(screen.width,screen.height)<800;
  const iPadAsMac=(navigator.platform||'').toLowerCase().indexOf('mac')>=0 && touch;
  if (mobile || iPadAsMac || (touch && small)) {
    document.body.innerHTML = '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; background:#0f172a; color:#e5e7eb; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;"><div style="max-width:560px; background:#111827; border:1px solid #1f2937; border-radius:12px; padding:20px;"><h2 style="margin:0 0 8px;">Desktop Required</h2><p>Please use a desktop or laptop computer to access the time clock.</p></div></div>';
    throw new Error('Blocked mobile/tablet');
  }
})();

/* Clock */
const nowEl=$('#now'); setInterval(()=>{ nowEl.textContent = new Date().toLocaleString(); }, 1000);

/* Auth tabs */
$all('.tab[data-tab]').forEach(b=>{
  b.addEventListener('click',()=>{
    $all('.tab[data-tab]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    show($('#signin'), b.getAttribute('data-tab')==='signin');
    show($('#signup'), b.getAttribute('data-tab')==='signup');
  });
});

/* Admin tabs */
$all('.tab[data-admin-tab]').forEach(b=>{
  b.addEventListener('click',()=>{
    $all('.tab[data-admin-tab]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    show($('#admin-staff'), b.getAttribute('data-admin-tab')==='staff');
    show($('#admin-reports'), b.getAttribute('data-admin-tab')==='reports');
    if (b.getAttribute('data-admin-tab')==='reports'){ loadLatestReport(); loadAllReports(); }
  });
});

/* UI refs */
const siEmail=$('#siEmail'), siPass=$('#siPass'), siMsg=$('#siMsg');
const suFirst=$('#suFirst'), suLast=$('#suLast'), suUsername=$('#suUsername'), suEmail=$('#suEmail'), suPass=$('#suPass'), suMsg=$('#suMsg');
const btnSignIn=$('#btnSignIn'), btnReset=$('#btnReset'), btnSignUp=$('#btnSignUp');
const btnSignOut=$('#btnSignOut'), btnExport=$('#btnExport');
const welcome=$('#welcome'), roleBadge=$('#roleBadge'), activeBadge=$('#activeBadge');
const statusEl=$('#status'), sinceEl=$('#since');
const btnIn=$('#btnIn'), btnOut=$('#btnOut');
const periodLbl=$('#periodLbl'), btnPrevPeriod=$('#btnPrevPeriod'), btnNextPeriod=$('#btnNextPeriod']);
const entryRows=$('#entryRows'); const nameTabs=$('#nameTabs'); const btnShowAddEntry=$('#btnShowAddEntry');
const addEntryCard=$('#addEntryCard'), aeUser=$('#aeUser'), aeDate=$('#aeDate'), aeIn=$('#aeIn'), aeOut=$('#aeOut'), aeDay=$('#aeDay'), aeSave=$('#aeSave'), aeCancel=$('#aeCancel');
const adminSection=$('#admin'), staffRows=$('#staffRows');
const reportRows=$('#reportRows'), reportRange=$('#reportRange'), btnLoadLatest=$('#btnLoadLatest'), btnGenerateNow=$('#btnGenerateNow'), btnExportTotals=$('#btnExportTotals'), reportList=$('#reportList');

/* State */
const state = { user:null, isAdmin:false, me:null, users:new Map(), currentStatus:'out', filterUid:null, period:null, periodOffset:0, liveUnsub:null, earliestPunch:null };

/* Auth helpers */
function validUsername(u){ return /^[a-z0-9_]{3,20}$/.test(u||''); }
async function resolveLoginIdentifier(idOrUsername){
  if(!idOrUsername) throw new Error('Enter email or username.');
  if(idOrUsername.indexOf('@')>=0) return idOrUsername.trim().toLowerCase();
  const uname=idOrUsername.trim().toLowerCase();
  const s=await getDoc(doc(db,'usernames', uname)); if(!s.exists()) throw new Error('Username not found.');
  const data=s.data(); if(!data.email) throw new Error('Username has no email.');
  return String(data.email).toLowerCase();
}

/* Sign-in/up */
btnSignIn.addEventListener('click', async ()=>{
  siMsg.textContent='';
  try{
    const email=await resolveLoginIdentifier(siEmail.value);
    await signInWithEmailAndPassword(auth,email,siPass.value);
  }catch(e){ siMsg.textContent='Sign-in failed: '+e.message; alert('Sign-in failed: '+e.message); }
});
btnReset.addEventListener('click', async ()=>{
  siMsg.textContent='';
  try{
    const email=await resolveLoginIdentifier(siEmail.value);
    await sendPasswordResetEmail(auth,email);
    siMsg.textContent='Reset email sent if the account exists.';
  }catch(e){ siMsg.textContent='Password reset failed: '+e.message; alert('Password reset failed: '+e.message); }
});
btnSignUp.addEventListener('click', async ()=>{
  suMsg.textContent='';
  try{
    const firstName=suFirst.value.trim(), lastName=suLast.value.trim();
    if(!firstName||!lastName) throw new Error('Enter first and last name.');
    const username=suUsername.value.trim().toLowerCase();
    if(!validUsername(username)) throw new Error('Username must be 3–20 letters/numbers/_');
    const email=suEmail.value.trim().toLowerCase();
    const pass=suPass.value; if(pass.length<8) throw new Error('Password must be at least 8 characters.');
    const exists=await getDoc(doc(db,'usernames',username)); if(exists.exists()) throw new Error('Username is taken.');
    const cred=await createUserWithEmailAndPassword(auth,email,pass);
    await updateProfile(cred.user,{displayName:username});
    await setDoc(doc(db,'users',cred.user.uid),{ username,email,firstName,lastName,role:'staff',active:false,createdAt:serverTimestamp() });
    await setDoc(doc(db,'usernames',username),{ uid:cred.user.uid, email });
    suMsg.textContent='Account created. Admin must activate your account.';
  }catch(e){ suMsg.textContent='Sign-up failed: '+e.message; alert('Sign-up failed: '+e.message); }
});
btnSignOut.addEventListener('click', async ()=>{ await signOut(auth); });

/* Roles */
async function isAdmin(uid){ const s=await getDoc(doc(db,'admins',uid)); return s.exists(); }
async function ensureUserDoc(user){
  const ref=doc(db,'users', user.uid), s=await getDoc(ref);
  if(!s.exists()) await setDoc(ref, { username:user.displayName||'', email:user.email, role:'staff', active:false, createdAt:serverTimestamp() });
  const data=(await getDoc(ref)).data(); state.users.set(user.uid,data); return data;
}

/* Period helpers (biweekly Mon–Sat x2) */
function lastSaturdayEnd(d){ if(!d) d=new Date(); const dow=d.getDay(); const days=(dow-6+7)%7; const x=new Date(d); x.setDate(x.getDate()-days); x.setHours(23,59,59,999); return x; }
function startFromEndSat(end){ const x=new Date(end); x.setDate(x.getDate()-12); x.setHours(0,0,0,0); return x; }
function periodByOffset(offset){ const end0=lastSaturdayEnd(new Date()); const end=new Date(end0); end.setDate(end.getDate()+offset*14); const start=startFromEndSat(end); return {start,end}; }
async function earliestPunchDate(){ if(state.earliestPunch) return state.earliestPunch; const s=await getDocs(query(collection(db,'punches'), orderBy('ts','asc'), limit(1))); state.earliestPunch = s.empty? null : s.docs[0].data().ts.toDate(); return state.earliestPunch; }
async function updatePeriodNav(){
  btnNextPeriod.disabled = state.periodOffset >= 0;
  const ep = await earliestPunchDate(); if(!ep){ btnPrevPeriod.disabled = true; return; }
  const earliestStart = startFromEndSat(lastSaturdayEnd(ep));
  btnPrevPeriod.disabled = state.period.start <= earliestStart;
}

function renderAuth(signed){
  show($('#auth'),!signed); show($('#app'),!!signed); show(btnSignOut,!!signed);
  show(btnExport, signed && state.isAdmin);
}

onAuthStateChanged(auth, async (user)=>{
  state.user=user||null; if(!user){ if(state.liveUnsub) state.liveUnsub(); renderAuth(false); return; }
  state.isAdmin = await isAdmin(user.uid);
  state.me = await ensureUserDoc(user);
  const nm = fullNameOf(state.me) || (state.me && (state.me.username||'')) || user.email;
  welcome.textContent = 'Welcome, ' + nm;
  show(roleBadge, state.isAdmin); show(activeBadge, !(state.me&&state.me.active));
  show(adminSection, state.isAdmin);
  renderAuth(true);

  show(nameTabs, state.isAdmin);
  show(btnShowAddEntry, state.isAdmin);
  show(addEntryCard, false);

  state.periodOffset = 0;
  state.period = periodByOffset(0);
  periodLbl.textContent = 'Period: ' + mdy(state.period.start) + ' – ' + mdy(state.period.end);
  await updatePeriodNav();

  state.filterUid = state.isAdmin ? null : user.uid;
  if (state.isAdmin) { wireNameTabs(); loadStaff(); loadUsersForAddEntry(); }
  subscribeEntries();
  recomputeStatus();
});

/* Strict IN→OUT */
async function lastPunch(uid){
  const q1=query(collection(db,'punches'), where('uid','==',uid), orderBy('ts','desc'), limit(1));
  const s=await getDocs(q1); return s.empty?null:{ id:s.docs[0].id, data:s.docs[0].data() };
}
async function recomputeStatus(){
  const last=await lastPunch(state.user.uid);
  if(!last || last.data.type==='out'){
    state.currentStatus='out'; statusEl.textContent='Not clocked in'; btnIn.disabled=!(state.isAdmin||(state.me&&state.me.active)); btnOut.disabled=true; sinceEl.textContent='—';
  } else {
    state.currentStatus='in'; statusEl.textContent='Clocked in'; btnIn.disabled=true; btnOut.disabled=false; const t=(last.data.ts&&last.data.ts.toDate)?last.data.ts.toDate():new Date(); sinceEl.textContent=t.toLocaleString();
  }
}
async function doPunch(type){
  msg.textContent='';
  try{
    const last=await lastPunch(state.user.uid);
    if(type==='in'){ if (last && last.data.type==='in') throw new Error('Already clocked in. Please clock out first.'); }
    else { if (!last || last.data.type!=='in') throw new Error('You are not clocked in.'); }
    const me=state.me||{};
    await addDoc(collection(db,'punches'),{
      uid:state.user.uid, username:me.username||state.user.email, fullName:fullNameOf(me)||'', type,
      ts:serverTimestamp(), dayType:'Work Day', source:'desktop',
      ua:navigator.userAgent||'', screen:{w:screen.width,h:screen.height}
    });
    msg.textContent='Recorded ✓'; await recomputeStatus();
  }catch(e){ msg.textContent='Error: '+e.message; alert('Punch failed: '+e.message); }
}
$('#btnIn').addEventListener('click', ()=>doPunch('in'));
$('#btnOut').addEventListener('click', ()=>doPunch('out'));

/* Entries */
function wireNameTabs(){
  nameTabs.innerHTML='';
  function make(id,label){
    const b=document.createElement('button');
    b.className='tab' + (state.filterUid===id?' active':'');
    b.textContent=label;
    b.addEventListener('click',()=>{ state.filterUid=id; wireNameTabs(); buildEntries(); });
    nameTabs.appendChild(b);
  }
  make(null,'All');
  getDocs(collection(db,'users')).then(s=>{
    const arr=[]; s.forEach(d=>{ const x=d.data(); x.id=d.id; arr.push(x); });
    arr.sort((a,b)=>{ const na=(fullNameOf(a)||a.username||'').toLowerCase(); const nb=(fullNameOf(b)||b.username||'').toLowerCase(); return na<nb?-1:na>nb?1:0; });
    arr.forEach(u=> make(u.id, fullNameOf(u)||u.username||u.email));
  });
}

btnPrevPeriod.addEventListener('click', async ()=>{
  state.periodOffset -= 1;
  state.period = periodByOffset(state.periodOffset);
  periodLbl.textContent = 'Period: ' + mdy(state.period.start) + ' – ' + mdy(state.period.end);
  await updatePeriodNav(); buildEntries();
});
btnNextPeriod.addEventListener('click', async ()=>{
  if(state.periodOffset>=0) return;
  state.periodOffset += 1;
  state.period = periodByOffset(state.periodOffset);
  periodLbl.textContent = 'Period: ' + mdy(state.period.start) + ' – ' + mdy(state.period.end);
  await updatePeriodNav(); buildEntries();
});

function subscribeEntries(){
  if(state.liveUnsub) state.liveUnsub();
  const q1=query(collection(db,'punches'), orderBy('ts','asc'));
  state.liveUnsub = onSnapshot(q1, ()=> buildEntries());
  buildEntries();
}

function cellEditableAttr(kind, uid, dk){
  return ' data-k="'+kind+'" data-key="'+uid+'|'+dk+'" contenteditable="true"';
}

async function buildEntries(){
  const start=state.period.start, end=state.period.end;
  const snaps = await getDocs(query(collection(db,'punches'), orderBy('ts','asc')));

  const userMap = new Map();
  const us = await getDocs(collection(db,'users'));
  us.forEach(d=>{ const v=d.data(); userMap.set(d.id,{username:v.username||'', full: fullNameOf(v)||''}); });

  const byDay = new Map();
  const lastInPerUid = new Map();

  snaps.forEach(docu=>{
    const p=docu.data(); if(!p.ts||!p.ts.toDate) return;
    const when=p.ts.toDate(); if(when<start || when>end) return;
    if(!state.isAdmin && p.uid!==state.user.uid) return;
    if(state.filterUid && p.uid!==state.filterUid) return;

    const k=p.uid+'|'+dateKey(when);
    const rec=byDay.get(k) || { uid:p.uid, dateKey:dateKey(when), firstIn:null, lastOut:null, totalMins:0, dayType:p.dayType||'Work Day', docs:[] };
    rec.docs.push({ id:docu.id, type:p.type, ts:when });
    if(p.type==='in'){ if(!rec.firstIn || when<rec.firstIn) rec.firstIn=when; lastInPerUid.set(p.uid, {when, k}); }
    if(p.type==='out'){
      const li = lastInPerUid.get(p.uid);
      if(li && li.k===k){ rec.totalMins += (when - li.when)/60000; lastInPerUid.delete(p.uid); }
      if(!rec.lastOut || when>rec.lastOut) rec.lastOut=when;
    }
    byDay.set(k, rec);
  });

  const rows = Array.from(byDay.values()).sort((a,b)=>{
    let an = (userMap.get(a.uid)&&userMap.get(a.uid).full) || (userMap.get(a.uid)&&userMap.get(a.uid).username) || a.uid;
    let bn = (userMap.get(b.uid)&&userMap.get(b.uid).full) || (userMap.get(b.uid)&&userMap.get(b.uid).username) || b.uid;
    an=an.toLowerCase(); bn=bn.toLowerCase();
    if(an!==bn) return an<bn?-1:1;
    return a.dateKey<b.dateKey?-1:1;
  });

  entryRows.innerHTML = '';
  if (rows.length===0){
    const tr0=document.createElement('tr'); tr0.innerHTML='<td colspan="6" class="hint">No entries in this period.</td>'; entryRows.appendChild(tr0); return;
  }

  rows.forEach(r=>{
    const nm = (userMap.get(r.uid)&&userMap.get(r.uid).full) || (userMap.get(r.uid)&&userMap.get(r.uid).username) || r.uid.slice(0,6);
    const d = new Date(r.dateKey+'T00:00:00');
    const tr=document.createElement('tr');

    let tdIn = '<td>' + (r.firstIn?hmNoLead(r.firstIn):'') + '</td>';
    let tdOut = '<td>' + (r.lastOut?hmNoLead(r.lastOut):'') + '</td>';
    let tdDay = '<td>' + (r.dayType||'Work Day') + '</td>';

    if(state.isAdmin){
      tdIn  = '<td'+cellEditableAttr('in', r.uid, r.dateKey)+'>' + (r.firstIn?hmNoLead(r.firstIn):'') + '</td>';
      tdOut = '<td'+cellEditableAttr('out', r.uid, r.dateKey)+'>' + (r.lastOut?hmNoLead(r.lastOut):'') + '</td>';
      tdDay = '<td'+cellEditableAttr('daytype', r.uid, r.dateKey)+'>' + (r.dayType||'Work Day') + '</td>';
    }

    const delBtn = state.isAdmin ? '<button class="btn-danger" data-del="'+r.uid+'|'+r.dateKey+'" style="height:32px;">Delete Day</button>' : '';
    tr.innerHTML =
      '<td>'+nm+'</td>' +
      '<td>'+mdy(d)+'</td>' +
      tdIn + tdOut + tdDay +
      '<td class="right">'+delBtn+'</td>';

    tr.dataset.docs = JSON.stringify(r.docs.map(x=>({id:x.id,type:x.type,ts:x.ts})));
    entryRows.appendChild(tr);
  });

  /* Totals for single user (staff view or admin filtered) */
  const singleUser = !state.isAdmin || !!state.filterUid;
  if(singleUser){
    let minsWeek1=0, minsWeek2=0;
    const w1End=new Date(start); w1End.setDate(start.getDate()+5); w1End.setHours(23,59,59,999);
    rows.forEach(r=>{ const m=r.totalMins||0; const d=new Date(r.dateKey+'T00:00:00'); if(d<=w1End) minsWeek1+=m; else minsWeek2+=m; });
    const periodMins = minsWeek1+minsWeek2;
    function addRow(label,hrs){ const tr=document.createElement('tr'); tr.innerHTML='<td><strong>'+label+'</strong></td><td></td><td></td><td></td><td class="right"><strong>'+fmt2(hrs/60)+'</strong></td><td></td>'; entryRows.appendChild(tr); }
    addRow('Week Total (Mon–Sat, week 1)', minsWeek1);
    addRow('Week Total (Mon–Sat, week 2)', minsWeek2);
    addRow('Period Total', periodMins);
  }

  if(state.isAdmin){
    entryRows.querySelectorAll('[data-k="in"],[data-k="out"]').forEach(cell=>{
      cell.addEventListener('keydown', async e=>{
        if(e.key!=='Enter') return; e.preventDefault(); cell.blur();
        const kind=cell.getAttribute('data-k'); const tr=cell.closest('tr'); const docs=JSON.parse(tr.dataset.docs);
        const val=cell.textContent.trim(); if(!/^\d{1,2}:\d{2}$/.test(val)) return alert('Use H:MM (24h)');
        let target=null;
        if(kind==='in'){ let min=1e15; docs.forEach(d=>{ if(d.type==='in' && d.ts<min){ min=d.ts; target=d; } }); }
        else { let max=0; docs.forEach(d=>{ if(d.type==='out' && d.ts>max){ max=d.ts; target=d; } }); }
        if(!target) return alert('No '+(kind==='in'?'IN':'OUT')+' punch to edit.');
        const base=new Date(target.ts); const parts=val.split(':'); const h=Number(parts[0]); const m=Number(parts[1]); const t=new Date(dateKey(base)+'T'+pad2(h)+':'+pad2(m)+':00');
        await updateDoc(doc(db,'punches', target.id), { ts: Timestamp.fromDate(t) });
        msg.textContent=(kind==='in'?'Clock in':'Clock out')+' updated ✓';
      });
    });
    entryRows.querySelectorAll('[data-k="daytype"]').forEach(cell=>{
      cell.addEventListener('keydown', async e=>{
        if(e.key!=='Enter') return; e.preventDefault(); cell.blur();
        const val=cell.textContent.trim()||'Work Day'; const tr=cell.closest('tr'); const docs=JSON.parse(tr.dataset.docs);
        for(let i=0;i<docs.length;i++){ await updateDoc(doc(db,'punches', docs[i].id), { dayType: val }); }
        msg.textContent='Day type updated ✓';
      });
    });
    entryRows.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if(!confirm('Delete ALL punches for this day?')) return;
        const row=btn.closest('tr'); const docs=JSON.parse(row.dataset.docs);
        for(let i=0;i<docs.length;i++){ await deleteDoc(doc(db,'punches', docs[i].id)); }
      });
    });
  }
}

/* Add Entry form (admin) */
function loadUsersForAddEntry(){
  aeUser.innerHTML='';
  getDocs(collection(db,'users')).then(s=>{
    const arr=[]; s.forEach(d=>{ const x=d.data(); x.id=d.id; arr.push(x); });
    arr.sort((a,b)=>{ const na=(fullNameOf(a)||a.username||'').toLowerCase(); const nb=(fullNameOf(b)||b.username||'').toLowerCase(); return na<nb?-1:na>nb?1:0; });
    arr.forEach(u=>{ const op=document.createElement('option'); op.value=u.id; op.textContent=fullNameOf(u)||u.username||u.email; aeUser.appendChild(op); });
  });
  aeDate.value = todayISO();
}
btnShowAddEntry.addEventListener('click', ()=>{ show(addEntryCard, true); });
aeCancel.addEventListener('click', ()=>{ show(addEntryCard, false); });
aeSave.addEventListener('click', async ()=>{
  if(!state.isAdmin) return;
  const uid=aeUser.value; if(!uid) return alert('Pick a user');
  const s=await getDoc(doc(db,'users', uid)); if(!s.exists()) return alert('User not found');
  const u=s.data(); const d=aeDate.value; const tIn=aeIn.value; const tOut=aeOut.value; const day=aeDay.value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return alert('Date required');
  if(!/^\d{2}:\d{2}$/.test(tIn)||!/^\d{2}:\d{2}$/.test(tOut)) return alert('Times must be HH:MM');
  const inDt=new Date(d+'T'+tIn+':00'); const outDt=new Date(d+'T'+tOut+':00'); if(outDt<=inDt) return alert('Out must be after In');
  await addDoc(collection(db,'punches'), { uid, username:u.username||u.email, fullName:fullNameOf(u)||'', type:'in',  ts:Timestamp.fromDate(inDt),  dayType:day, source:'manual' });
  await addDoc(collection(db,'punches'), { uid, username:u.username||u.email, fullName:fullNameOf(u)||'', type:'out', ts:Timestamp.fromDate(outDt), dayType:day, source:'manual' });
  alert('Entry added'); show(addEntryCard,false);
});

/* Staff list (admin) */
function loadStaff(){
  onSnapshot(collection(db,'users'), s=>{
    staffRows.innerHTML='';
    s.forEach(d=>{
      const u=d.data(); u.id=d.id;
      const tr=document.createElement('tr');
      tr.innerHTML =
        '<td>'+(u.firstName||'')+'</td>'+
        '<td>'+(u.lastName||'')+'</td>'+
        '<td>'+(u.username||'')+'</td>'+
        '<td>'+(u.email||'')+'</td>'+
        '<td>'+(u.active?'Active':'Inactive')+'</td>'+
        '<td class="right">'+
          '<button class="btn-ghost" data-edit="'+u.id+'" style="height:32px;">Edit</button> '+
          '<button class="btn-ghost" data-act="'+u.id+'" style="height:32px;">'+(u.active?'Disable':'Activate')+'</button> '+
          '<button class="btn-danger" data-del="'+u.id+'" style="height:32px;">Delete</button>'+
        '</td>';
      staffRows.appendChild(tr);
    });

    staffRows.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click', async ()=>{
      const id=b.getAttribute('data-act'); const s=await getDoc(doc(db,'users', id)); if(!s.exists()) return;
      await updateDoc(doc(db,'users', id), { active: !s.data().active });
    }));
    staffRows.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', async ()=>{
      const id=b.getAttribute('data-del'); if(!confirm('Delete this user profile? (Auth login remains)')) return; await deleteDoc(doc(db,'users', id));
    }));
    staffRows.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', async ()=>{
      const id=b.getAttribute('data-edit'); const s=await getDoc(doc(db,'users', id)); if(!s.exists()) return; const uu=s.data();
      let first=prompt('First name:', uu.firstName||''); if(first===null) return;
      let last =prompt('Last name:',  uu.lastName||''); if(last===null) return;
      let uname=prompt('Username (3–20 letters/numbers/_):', uu.username||''); if(uname===null) return; uname=uname.trim().toLowerCase(); if(!/^[a-z0-9_]{3,20}$/.test(uname)) return alert('Invalid username');
      if(uname !== (uu.username||'')){
        const exists=await getDoc(doc(db,'usernames', uname)); if(exists.exists()) return alert('Username is taken.');
        const old=uu.username?uu.username.toLowerCase():''; if(old){ const oldDoc=await getDoc(doc(db,'usernames', old)); if(oldDoc.exists() && oldDoc.data().uid===id){ await deleteDoc(doc(db,'usernames', old)); } }
        await setDoc(doc(db,'usernames', uname), { uid:id, email: uu.email });
      }
      await updateDoc(doc(db,'users', id), { firstName:first, lastName:last, username:uname });
      alert('Updated.'); wireNameTabs();
    }));
  });
}

/* Reports */
async function computeDailyRows(start,end){
  const usersSnap = await getDocs(collection(db,'users'));
  const nameByUid = new Map(); usersSnap.forEach(u=>{ const d=u.data(); nameByUid.set(u.id,{full: fullNameOf(d)||'', username:d.username||''}); });

  const snaps = await getDocs(query(collection(db,'punches'), orderBy('ts','asc')));
  const perDay = new Map(); const lastIn = new Map();
  snaps.forEach(d=>{
    const x=d.data(); if(!x.ts||!x.ts.toDate) return; const t=x.ts.toDate();
    if(t<start || t>end) return;
    const k=x.uid+'|'+dateKey(t);
    const item = perDay.get(k) || { uid:x.uid, date:new Date(dateKey(t)+'T00:00:00'), firstIn:null, lastOut:null, mins:0 };
    if(x.type==='in'){ if(!item.firstIn || t<item.firstIn) item.firstIn=t; lastIn.set(k,t); }
    if(x.type==='out'){ const li=lastIn.get(k); if(li){ item.mins += (t-li)/60000; lastIn.delete(k);} if(!item.lastOut || t>item.lastOut) item.lastOut=t; }
    perDay.set(k,item);
  });

  const rows = Array.from(perDay.values()).map(v=>{
    const nm=(nameByUid.get(v.uid)&&nameByUid.get(v.uid).full) || (nameByUid.get(v.uid)&&nameByUid.get(v.uid).username) || v.uid.slice(0,6);
    return { uid:v.uid, name:nm, date:v.date, in:v.firstIn?hmNoLead(v.firstIn):'', out:v.lastOut?hmNoLead(v.lastOut):'', mins:v.mins };
  }).sort((a,b)=>{ const c=a.name.localeCompare(b.name); return c || (a.date - b.date); });
  return rows;
}

async function generateAndSaveCurrentBiweekly(){
  const end = lastSaturdayEnd(new Date());
  const start = startFromEndSat(end);
  const rows = await computeDailyRows(start,end);
  await addDoc(collection(db,'reports'), { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end), rows, generatedAt: serverTimestamp() });
  await loadLatestReport(); await loadAllReports();
}
btnGenerateNow.addEventListener('click', generateAndSaveCurrentBiweekly);

async function loadLatestReport(){
  const s = await getDocs(query(collection(db,'reports'), orderBy('end','desc'), limit(1)));
  if(s.empty){ reportRows.innerHTML=''; reportRange.textContent='No saved report yet. Click "Generate Now".'; return; }
  await renderReportDoc(s.docs[0]);
}

/* Fixed renderer: proper dates + one Week Total per week + PERIOD TOTAL */
async function renderReportDoc(docu){
  const data = docu.data();
  const start = (data.start && data.start.toDate) ? data.start.toDate() : new Date(data.start);
  const end   = (data.end   && data.end.toDate)   ? data.end.toDate()   : new Date(data.end);
  const gen   = (data.generatedAt && data.generatedAt.toDate) ? data.generatedAt.toDate() : new Date();

  reportRange.textContent = 'Period: ' + mdy(start) + ' – ' + mdy(end) + ' (generated ' + gen.toLocaleString() + ')';

  const rows = (data.rows || []).map(r=>{
    const d = (r.date && r.date.toDate) ? r.date.toDate() : (typeof r.date === 'string' ? new Date(r.date) : new Date(r.date));
    return { name:r.name, date:d, in:r.in||'', out:r.out||'', mins:r.mins||0 };
  }).filter(r=>!isNaN(r.date.getTime()))
    .sort((a,b)=>{ const c=a.name.localeCompare(b.name); return c || (a.date - b.date); });

  reportRows.innerHTML='';

  let curName=null, weekKey=null, weekMins=0, periodMins=0, weekIdx=0;
  function mondayKey(d){ const dow=d.getDay(); const m=new Date(d); m.setHours(0,0,0,0); m.setDate(d.getDate() - (dow===0 ? 6 : (dow-1))); return m.toISOString().slice(0,10); }
  function ordinal(n){ if(n===1) return '1st'; if(n===2) return '2nd'; if(n===3) return '3rd'; return n+'th'; }
  function flushWeekTotal(){ if(weekKey===null) return; const tr=document.createElement('tr'); tr.innerHTML='<td>'+curName+'</td><td><strong>'+ordinal(weekIdx)+' Week Total</strong></td><td></td><td></td><td class="right"><strong>'+fmt2(weekMins/60)+'</strong></td>'; reportRows.appendChild(tr); weekKey=null; weekMins=0; }
  function flushPeriodTotal(){ const tr=document.createElement('tr'); tr.innerHTML='<td>'+curName+'</td><td><strong>PERIOD TOTAL</strong></td><td></td><td></td><td class="right"><strong>'+fmt2(periodMins/60)+'</strong></td>'; reportRows.appendChild(tr); periodMins=0; weekIdx=0; }

  rows.forEach(r=>{
    if(r.name !== curName){
      if(curName){ flushWeekTotal(); flushPeriodTotal(); const sep=document.createElement('tr'); sep.innerHTML='<td colspan="5" class="hint">—</td>'; reportRows.appendChild(sep); }
      curName=r.name; periodMins=0; weekIdx=0; weekKey=null;
    }
    const wk = mondayKey(r.date);
    if(weekKey===null){ weekKey=wk; weekIdx+=1; }
    if(wk!==weekKey){ flushWeekTotal(); weekKey=wk; weekIdx+=1; }

    weekMins += r.mins; periodMins += r.mins;
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+r.name+'</td><td>'+mdy(r.date)+'</td><td>'+r.in+'</td><td>'+r.out+'</td><td class="right">'+fmt2(r.mins/60)+'</td>';
    reportRows.appendChild(tr);
  });

  if(curName){ flushWeekTotal(); flushPeriodTotal(); }
}

async function loadAllReports(){
  const s=await getDocs(query(collection(db,'reports'), orderBy('end','desc')));
  reportList.innerHTML=''; s.forEach(d=>{
    const data=d.data(); const st=data.start&&data.start.toDate?data.start.toDate():new Date(data.start); const en=data.end&&data.end.toDate?data.end.toDate():new Date(data.end); const gen=data.generatedAt&&data.generatedAt.toDate?data.generatedAt.toDate():null;
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+mdy(st)+'</td><td>'+mdy(en)+'</td><td>'+(gen?gen.toLocaleString():'—')+'</td><td class="right"><button class="btn-danger" data-delreport="'+d.id+'" style="height:32px;">Delete</button></td>';
    reportList.appendChild(tr);
  });
  reportList.querySelectorAll('[data-delreport]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('Delete this report?')) return; await deleteDoc(doc(db,'reports', b.getAttribute('data-delreport'))); await loadAllReports(); await loadLatestReport();
  }));
}
btnLoadLatest.addEventListener('click', loadLatestReport);

/* Export CSV (report view) */
btnExportTotals.addEventListener('click', ()=>{
  const lines=[]; lines.push(['Name','Date','Clock In','Clock Out','Daily Hours'].join(','));
  const trs=[...reportRows.querySelectorAll('tr')];
  trs.forEach(tr=>{
    const t=[...tr.querySelectorAll('td')].map(x=>x.textContent.trim());
    if(t.length===5){ lines.push(t.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')); }
  });
  const blob=new Blob([lines.join('\n')],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='biweekly_detailed.csv'; a.click();
});

/* Export CSV (Entries) — admin only */
btnExport.addEventListener('click', ()=>{
  const headers=['Name','Date','Clock In','Clock Out','Day']; const lines=[headers.join(',')];
  entryRows.querySelectorAll('tr').forEach(tr=>{
    const t=[...tr.querySelectorAll('td')].slice(0,5).map(td=>td.textContent.trim());
    if(t.length===5) lines.push(t.map(v=>'"'+v.replace(/"/g,'""')+'"').join(','));
  });
  const blob=new Blob([lines.join('\n')],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='entries_current_period.csv'; a.click();
});
