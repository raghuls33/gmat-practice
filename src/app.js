/* dMAT Practice Suite — application code.
   DATA is treated as read-only input and is never mutated. */
let DATA = [];

const SECT = [
  {k:'fs', name:'Figure Sequences', n:20, marks:40, mins:25},
  {k:'me', name:'Mathematical Equations', n:20, marks:40, mins:25},
  {k:'ls', name:'Latin Squares', n:20, marks:40, mins:25},
  {k:'sub', name:'Subject Module', n:40, marks:80, mins:90}
];
const COLNAMES = ['\u03b1','\u03b2','\u03b3','\u03b4','\u03b5'];
const PAL = {black:'#1a1a1a', red:'#D0021B', green:'#1E8A3C', blue:'#1656C8',
             orange:'#E8720C', magenta:'#B4137E', '':'#1a1a1a'};

let S = null;          // active session
let tick = null;

/* ================= safe storage =================
   Every localStorage call is wrapped. The first failure (disabled, private
   mode, quota exhausted) flips the module to an in-memory map for the rest of
   the session. Nothing is ever logged, nothing ever throws out of here. */
const Store = (function(){
  const NS = 'dmat.v1.';
  let live = false, mem = Object.create(null);
  try {
    const probe = NS + '__probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    live = true;
  } catch (e) { live = false; }

  function demote(){ live = false; }

  function getRaw(k){
    if (live) { try { return window.localStorage.getItem(NS + k); } catch (e) { demote(); } }
    return k in mem ? mem[k] : null;
  }
  function setRaw(k, v){
    mem[k] = v;                       // memory always mirrors, so a later
    if (live) {                       // quota failure never loses the value
      try { window.localStorage.setItem(NS + k, v); return true; }
      catch (e) { demote(); }
    }
    return false;
  }
  function delRaw(k){
    delete mem[k];
    if (live) { try { window.localStorage.removeItem(NS + k); } catch (e) { demote(); } }
  }
  function allKeys(){
    const out = [];
    if (live) {
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.indexOf(NS) === 0) out.push(k.slice(NS.length));
        }
      } catch (e) { demote(); }
    }
    for (const k in mem) if (out.indexOf(k) < 0) out.push(k);
    return out;
  }

  return {
    get(k, fallback){
      const raw = getRaw(k);
      if (raw === null || raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (e) { delRaw(k); return fallback; }
    },
    set(k, val){
      try { return setRaw(k, JSON.stringify(val)); }
      catch (e) { return false; }     // circular / unserialisable: give up quietly
    },
    del: delRaw,
    keys: allKeys,
    persistent(){ return live; }
  };
})();

const K_HISTORY  = 'history';
const K_SETTINGS = 'settings';
const kProgress  = pid => 'progress.' + pid;

let SET = Store.get(K_SETTINGS, {cb:false});
function saveSettings(){ Store.set(K_SETTINGS, SET); }

/* ================= progress persistence ================= */
let saveTimer = null;

function snapshot(){
  return {
    v: 1, pid: S.pid, tab: S.tab, mode: S.mode,
    ans: S.ans, flags: S.flags,
    left: S.left, spent: S.spent, locked: S.locked,
    started: S.started, saved: Date.now()
  };
}

function writeProgress(){
  saveTimer = null;
  if (!S || S.kind !== 'paper' || S.submitted) return;
  Store.set(kProgress(S.pid), snapshot());
}

/* Debounced: typing four digits into an equation writes once, not four times. */
function saveProgress(immediate){
  if (!S || S.kind !== 'paper' || S.submitted) return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (immediate) writeProgress();
  else saveTimer = setTimeout(writeProgress, 400);
}

function clearProgress(pid){ Store.del(kProgress(pid)); }

function listProgress(){
  const out = [];
  DATA.forEach(p => {
    const s = Store.get(kProgress(p.id), null);
    if (s && s.ans) out.push(s);
  });
  return out;
}

function countAnswered(ans){
  return SECT.reduce((n, sec) => n + Object.keys(ans[sec.k] || {}).length, 0);
}

function getHistory(){
  const h = Store.get(K_HISTORY, []);
  return Array.isArray(h) ? h : [];
}
function pushHistory(rec){
  const h = getHistory();
  h.push(rec);
  while (h.length > 200) h.shift();          // keep the store bounded
  Store.set(K_HISTORY, h);
}

function clearAllData(){
  if (!confirm('Delete all saved dMAT data in this browser?\n\n' +
               'This removes every in-progress paper and your whole attempt ' +
               'history. It cannot be undone.')) return;
  Store.keys().forEach(k => Store.del(k));
  SET = {cb:false};
  alert('Saved data cleared.');
  goHome();
}

/* ================= SVG matrix rendering ================= */
function symSvg(s, cell){
  const cx = s.c*cell + cell/2, cy = s.r*cell + cell/2, r = cell*0.30;
  const col = PAL[s.k] || '#1a1a1a';
  const A = `fill="${col}" stroke="${col}" stroke-width="1"`;
  const H = `fill="#fff" stroke="${col}" stroke-width="1.3"`;
  if(s.g==='\u25c6') return `<polygon points="${cx},${cy-r} ${cx+r},${cy} ${cx},${cy+r} ${cx-r},${cy}" ${A}/>`;
  if(s.g==='\u25a0') return `<rect x="${cx-r}" y="${cy-r}" width="${2*r}" height="${2*r}" ${A}/>`;
  if(s.g==='\u25cb') return `<circle cx="${cx}" cy="${cy}" r="${r}" ${H}/>`;
  if(s.g==='\u25b3') return `<polygon points="${cx},${cy-r*1.15} ${cx+r},${cy+r*0.75} ${cx-r},${cy+r*0.75}" ${H}/>`;
  if(s.g==='A'){
    const ang=[0,90,180,270][s.o%4], a=r*1.15, b=r*0.42;
    const pts=[[a,0],[a-r*0.9,b*1.55],[a-r*0.9,b*0.55],[-a,b*0.55],[-a,-b*0.55],
               [a-r*0.9,-b*0.55],[a-r*0.9,-b*1.55]].map(p=>p.join(',')).join(' ');
    return `<g transform="translate(${cx},${cy}) rotate(${ang-90})"><polygon points="${pts}" ${A}/></g>`;
  }
  if(s.g==='K'){
    const ang=[0,90,180,270][s.o%4];
    return `<g transform="translate(${cx},${cy}) rotate(${ang})">`+
      `<polyline points="${-r},${r} ${-r},${-r} ${r},${-r}" fill="none" stroke="${col}" `+
      `stroke-width="1.9" stroke-linecap="square"/></g>`;
  }
  return '';
}
function matSvg(state, cell){
  cell = cell || 15;
  const W = cell*5;
  let g = '';
  for(let i=0;i<=5;i++){
    g += `<line x1="0" y1="${i*cell}" x2="${W}" y2="${i*cell}" stroke="#6a6a6a" stroke-width=".7"/>`;
    g += `<line x1="${i*cell}" y1="0" x2="${i*cell}" y2="${W}" stroke="#6a6a6a" stroke-width=".7"/>`;
  }
  const sy = (state||[]).map(s=>symSvg(s,cell)).join('');
  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${g}${sy}</svg>`;
}
function qBox(cell){
  cell = cell || 15; const W = cell*5;
  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">`+
    `<rect x=".5" y=".5" width="${W-1}" height="${W-1}" fill="#fff" stroke="#6a6a6a" stroke-width="1"/>`+
    `<text x="${W/2}" y="${W/2+W*0.17}" text-anchor="middle" font-size="${W*0.5}" `+
    `font-weight="700" fill="#8a8a8a">?</text></svg>`;
}

/* ================= session ================= */
function newSession(pid, mode){
  const p = DATA.find(x=>x.id===pid);
  return {kind:'paper', p:p, pid:pid, mode:(mode==='exam'?'exam':'practice'),
          tab:0, submitted:false, review:false,
          ans:{fs:{}, me:{}, ls:{}, sub:{}},
          flags:{fs:{}, me:{}, ls:{}, sub:{}},
          left:SECT.map(s=>s.mins*60),
          spent:SECT.map(()=>0),
          locked:SECT.map(()=>false),
          cur:0, slot:0,
          started:Date.now()};
}

/* Rebuild a live session from a stored snapshot. Anything missing or of the
   wrong shape falls back to the fresh-session default, so an old or truncated
   record can never wedge the app. */
function sessionFrom(snap){
  const p = DATA.find(x=>x.id===snap.pid);
  if (!p) return null;
  const S2 = newSession(snap.pid, snap.mode);
  const nums = (a, def) => (Array.isArray(a) && a.length === SECT.length) ? a.slice() : def;
  SECT.forEach(sec => {
    if (snap.ans   && snap.ans[sec.k]   && typeof snap.ans[sec.k]   === 'object') S2.ans[sec.k]   = snap.ans[sec.k];
    if (snap.flags && snap.flags[sec.k] && typeof snap.flags[sec.k] === 'object') S2.flags[sec.k] = snap.flags[sec.k];
  });
  S2.left   = nums(snap.left,   S2.left);
  S2.spent  = nums(snap.spent,  S2.spent);
  S2.locked = nums(snap.locked, S2.locked);
  S2.tab     = (snap.tab >= 0 && snap.tab < SECT.length) ? snap.tab : 0;
  S2.started = snap.started || Date.now();
  return S2;
}
function esc(t){return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');}

function relTime(ts){
  if(!ts) return 'recently';
  const d = Math.max(0, Math.round((Date.now()-ts)/1000));
  if(d < 60) return 'just now';
  if(d < 3600) return Math.round(d/60) + ' min ago';
  if(d < 86400) return Math.round(d/3600) + ' h ago';
  return Math.round(d/86400) + ' d ago';
}

/* ================= home ================= */
function goHome(){
  clearInterval(tick); tick=null;
  document.getElementById('tabs').classList.add('hide');
  document.getElementById('foot').classList.add('hide');
  document.getElementById('timer').classList.add('hide');
  const saved = {};
  listProgress().forEach(sn => { saved[sn.pid] = sn; });

  const cards = DATA.map(p=>{
    const off = p.id<=2 ? '<span class="tag off">contains official samples</span>' : '';
    const sn = saved[p.id];
    const badge = sn ? `<span class="tag warn">in progress</span>` : '';
    const st = sn
      ? `${countAnswered(sn.ans)}/100 answered &middot; ${sn.mode==='exam'?'exam':'practice'} mode`
      : '100 questions &middot; 200 marks &middot; 180 min';
    return `<div class="pcard" onclick="openPaper(${p.id})">
      <h3>Paper ${p.id}</h3>
      <div class="st">${st}</div>
      <div style="margin-top:9px">${badge}${off}</div></div>`;
  }).join('');

  const resumeBanner = Object.keys(saved).length ? `
    <div class="note resume">
      <p><strong>Unfinished attempt${Object.keys(saved).length>1?'s':''} found.</strong></p>
      ${Object.keys(saved).map(pid=>{
        const sn = saved[pid];
        return `<div class="resrow">
          <span>Paper ${pid} &mdash; ${countAnswered(sn.ans)}/100 answered,
            saved ${relTime(sn.saved)}</span>
          <span class="spacer"></span>
          <button class="btn sm pri" onclick="resumePaper(${pid})">Resume paper ${pid}</button>
          <button class="btn sm" onclick="restartPaper(${pid})">Start over</button>
        </div>`;
      }).join('')}
    </div>` : '';

  const storageNote = Store.persistent() ? '' : `
    <div class="note warnbox"><p><strong>Storage unavailable.</strong> This browser is blocking
    local storage, so progress and history are kept in memory for this tab only and will be
    lost on reload. Everything else works normally.</p></div>`;
  document.getElementById('app').innerHTML = `
  <h1>dMAT Practice Suite &mdash; Data Science</h1>
  <p class="muted" style="margin-top:0">Five full-length papers built to the structure of the official
  g.a.s.t. / TestDaF-Institut preparatory materials. Answer, submit, score, then revise with worked solutions.</p>
  <div class="note">
   <p><strong>Each paper:</strong> Core Module (Figure Sequences 20, Mathematical Equations 20,
   Latin Squares 20 &mdash; 2 marks each, 25 min per subtest) + Subject Module Data Science
   (40 questions, 2 marks each, 90 min). Total <strong>200 marks</strong>.</p>
   <p><strong>Exam rules:</strong> no notes, no calculator, no negative marking &mdash; always guess.
   Papers 1 and 2 embed the eighteen official worked examples at Q1 / Q8 / Q15 of every Core subtest.</p>
   <p><strong>Note:</strong> your answers, flags and remaining time are saved in this browser as
   you go, so a reload or a closed tab will not lose a paper. Submitted attempts are kept as
   history for tracking and drilling.</p>
  </div>
  ${storageNote}
  ${resumeBanner}
  <h2>Choose a paper</h2>
  <div class="grid2">${cards}</div>
  <h2>Self-assessment bands</h2>
  <table><thead><tr><th>Band</th><th>Core (120)</th><th>Subject (80)</th><th>Total (200)</th></tr></thead>
  <tbody>
  <tr><td>Competitive for selective programmes</td><td>90+</td><td>60+</td><td><strong>150+</strong></td></tr>
  <tr><td>Solid</td><td>72&ndash;89</td><td>48&ndash;59</td><td>120&ndash;149</td></tr>
  <tr><td>Needs more preparation</td><td>&lt;72</td><td>&lt;48</td><td>&lt;120</td></tr>
  </tbody></table>
  <p class="muted" style="font-size:12.5px">The real dMAT reports standardised scores rather than a
  pass mark; these bands are a practice target only.</p>
  <h2>Saved data</h2>
  <p class="muted" style="font-size:13px">Everything is stored locally in this browser. Nothing is
  uploaded anywhere.</p>
  <div style="display:flex;gap:9px;flex-wrap:wrap">
    <button class="btn" onclick="clearAllData()">Clear all saved data</button>
  </div>`;
  window.scrollTo(0,0);
}

function enterSession(){
  document.getElementById('tabs').classList.remove('hide');
  document.getElementById('foot').classList.remove('hide');
  document.getElementById('timer').classList.remove('hide');
  const pri = document.getElementById('foot').querySelector('.btn.pri');
  pri.textContent = 'Submit paper';
  pri.onclick = finish;
  startTimer();
  render();
}

/* Entry point from a paper card: resume if there is a saved attempt. */
function openPaper(pid){
  if(Store.get(kProgress(pid), null)) resumePaper(pid);
  else startPaper(pid, 'practice');
}

function startPaper(pid, mode){
  S = newSession(pid, mode);
  clearProgress(pid);
  saveProgress(true);
  enterSession();
}

function resumePaper(pid){
  const snap = Store.get(kProgress(pid), null);
  const S2 = snap ? sessionFrom(snap) : null;
  if (!S2) { startPaper(pid, 'practice'); return; }
  S = S2;
  enterSession();
}

function restartPaper(pid){
  if (!confirm('Discard the saved progress on Paper ' + pid + ' and start over?')) return;
  clearProgress(pid);
  goHome();
}

/* ================= timer ================= */
function startTimer(){
  clearInterval(tick);
  tick = setInterval(()=>{
    if(!S || S.submitted) return;
    if(S.left[S.tab] > 0) S.left[S.tab]--;
    S.spent[S.tab]++;
    if(S.spent[S.tab] % 10 === 0) saveProgress(true);
    paintTimer();
  },1000);
  paintTimer();
}
function paintTimer(){
  const el = document.getElementById('timer');
  if(!S){el.classList.add('hide');return;}
  const t = S.left[S.tab];
  const m = String(Math.floor(t/60)).padStart(2,'0'), s = String(t%60).padStart(2,'0');
  el.textContent = t>0 ? `${m}:${s}` : 'TIME UP';
  el.className = 'timer' + (t<=120 ? ' low' : '');
}

/* ================= tabs ================= */
function tabsHtml(){
  return SECT.map((s,i)=>{
    const done = Object.keys(S.ans[s.k]).length;
    return `<button class="tab ${i===S.tab?'on':''}" onclick="setTab(${i})">${s.name}
      <span class="cnt">${done}/${s.n}</span></button>`;
  }).join('');
}
function setTab(i){ S.tab=i; S.cur=0; S.slot=0; saveProgress(true); render(); window.scrollTo(0,0); }
function nextTab(){ if(S.tab<3) setTab(S.tab+1); }
function prevTab(){ if(S.tab>0) setTab(S.tab-1); }

/* ================= answering ================= */
function pick(sec, key, val){
  if(S.submitted) return;
  S.ans[sec][key] = val;
  afterAnswer(sec, key);
}
function setEq(i, v, el){
  if(S.submitted) return;
  const cur = S.ans.me[i] || {};
  cur[v] = el.value.trim();
  const filled = Object.values(cur).filter(x=>x!=='').length;
  if(filled===0) delete S.ans.me[i]; else S.ans.me[i]=cur;
  saveProgress();
  paintFoot(); paintTabs(); paintChips();
}
function pickFs(i, which, opt){
  if(S.submitted) return;
  const cur = S.ans.fs[i] || {};
  cur[which] = opt;
  S.ans.fs[i] = cur;
  afterAnswer('fs', i);
}


/* ================= flags, navigator, keyboard =================
   The figure-sequence tab renders ~290 KB of HTML, so moving the cursor or
   picking an option patches the existing DOM instead of rebuilding it. */

function secKey(i){ return SECT[i].k; }
function curSec(){ return secKey(S.tab); }

/* Question numbers of the active subtest, in display order. */
function qNums(){
  const k = curSec();
  if (k === 'sub') return S.p.subject.reduce((a,t)=>a.concat(t.questions.map(q=>q.n)), []);
  return S.p[k].map(it => it.n);
}

function isFlagged(sec, n){ return !!(S.flags[sec] && S.flags[sec][n]); }

/* 'none' | 'part' | 'done' — 'part' only exists where a question carries more
   than one answer: figure sequences (two images) and equation systems. */
function answerState(sec, n){
  const a = S.ans[sec][n];
  if (a === undefined || a === null) return 'none';
  if (sec === 'fs') {
    const one = a.a1 !== undefined, two = a.a2 !== undefined;
    if (one && two) return 'done';
    return (one || two) ? 'part' : 'none';
  }
  if (sec === 'me') {
    const it = S.p.me.find(x => x.n === n);
    if (!it) return 'none';
    const filled = it.vars.filter(v => a[v] !== undefined && a[v] !== '').length;
    if (filled === 0) return 'none';
    return filled === it.vars.length ? 'done' : 'part';
  }
  return 'done';
}

function toggleFlag(sec, n){
  if (!S) return;
  if (!S.flags[sec]) S.flags[sec] = {};
  if (S.flags[sec][n]) delete S.flags[sec][n];
  else S.flags[sec][n] = true;
  saveProgress();
  const b = document.querySelector('[data-flag="' + sec + '-' + n + '"]');
  if (b) {
    const on = isFlagged(sec, n);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  paintChips();
}

function flagBtn(sec, n){
  const on = isFlagged(sec, n);
  return '<button class="flagbtn' + (on ? ' on' : '') + '" data-flag="' + sec + '-' + n + '"' +
    ' type="button" aria-pressed="' + (on ? 'true' : 'false') + '"' +
    ' aria-label="Flag question ' + n + ' for review"' +
    ' title="Flag for review (f)" onclick="toggleFlag(&quot;' + sec + '&quot;,' + n + ')">\u2691</button>';
}

/* ---------- navigator panel ---------- */
function toggleNav(){
  const el = document.getElementById('navpanel');
  const open = el.classList.contains('hide');
  el.classList.toggle('hide', !open);
  document.getElementById('navBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) paintChips();
}

function paintChips(){
  const box = document.getElementById('chips');
  if (!box || !S || !S.p) return;
  const sec = curSec(), nums = qNums();
  const t = document.getElementById('npTitle');
  if (t) t.textContent = SECT[S.tab].name;
  box.innerHTML = nums.map((n, i) => {
    const st = answerState(sec, n);
    const cls = ['chip', st === 'done' ? 'done' : (st === 'part' ? 'part' : 'todo')];
    if (isFlagged(sec, n)) cls.push('flag');
    if (i === S.cur) cls.push('cur');
    const lbl = 'Question ' + n + ', ' + (st === 'done' ? 'answered' : st === 'part' ? 'partly answered' : 'unanswered') +
      (isFlagged(sec, n) ? ', flagged' : '');
    return '<button class="' + cls.join(' ') + '" type="button" onclick="gotoQ(' + i + ')"' +
      ' aria-label="' + lbl + '">' + n + '</button>';
  }).join('');
}

function qEl(i){
  const nums = qNums();
  if (i < 0 || i >= nums.length) return null;
  return document.getElementById('q-' + curSec() + '-' + nums[i]);
}

function paintCur(){
  document.querySelectorAll('.card.cur, .q.cur').forEach(e => e.classList.remove('cur'));
  const el = qEl(S.cur);
  if (el) el.classList.add('cur');
  paintChips();
}

function setCur(i, scroll){
  const nums = qNums();
  if (!nums.length) return;
  S.cur = Math.max(0, Math.min(nums.length - 1, i));
  S.slot = 0;
  paintCur();
  if (scroll !== false) {
    const el = qEl(S.cur);
    if (el && el.scrollIntoView) el.scrollIntoView({block: 'start', behavior: 'smooth'});
  }
}

function gotoQ(i){
  setCur(i, true);
  if (typeof window !== 'undefined' && window.innerWidth < 700) toggleNav();
}

/* ---------- in-place answer painting ---------- */
function afterAnswer(sec, n){
  saveProgress();
  paintTabs(); paintFoot(); paintChips();
  const el = document.getElementById('q-' + sec + '-' + n);
  if (!el) { render(true); return; }
  if (sec === 'ls') {
    const a = S.ans.ls[n];
    el.querySelectorAll('.lbtn').forEach(b => {
      const on = b.textContent.trim() === a;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  } else if (sec === 'sub') {
    const a = S.ans.sub[n];
    el.querySelectorAll('.opt').forEach((o, i) => {
      const on = i === a;
      o.classList.toggle('sel', on);
      o.setAttribute('aria-checked', on ? 'true' : 'false');
      o.tabIndex = on ? 0 : -1;
    });
  } else if (sec === 'fs') {
    const a = S.ans.fs[n] || {};
    el.querySelectorAll('.fscol').forEach(col => {
      const which = col.getAttribute('data-slot');
      col.querySelectorAll('.fsopt').forEach((o, i) => {
        const on = a[which] === i + 1;
        o.classList.toggle('sel', on);
        o.setAttribute('aria-checked', on ? 'true' : 'false');
        o.tabIndex = on ? 0 : -1;
      });
    });
  }
}

/* ---------- keyboard ---------- */
function typingInField(){
  const a = document.activeElement;
  if (!a) return false;
  const tag = (a.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || a.isContentEditable === true;
}

function optionCount(){
  const k = curSec();
  if (k === 'ls') return 5;
  if (k === 'sub') return 4;
  if (k === 'fs') return 3;
  return 0;
}

function chooseOption(idx){
  const k = curSec(), n = qNums()[S.cur];
  if (n === undefined) return;
  if (k === 'ls')  { if (idx < 5) pick('ls', n, 'ABCDE'[idx]); return; }
  if (k === 'sub') { if (idx < 4) pick('sub', n, idx); return; }
  if (k === 'fs')  { if (idx < 3) pickFs(n, S.slot ? 'a2' : 'a1', idx + 1); return; }
}

function setSlot(v){
  if (curSec() !== 'fs') return;
  S.slot = v ? 1 : 0;
  const el = qEl(S.cur);
  if (el) el.querySelectorAll('.fscol').forEach(c =>
    c.classList.toggle('active', (c.getAttribute('data-slot') === 'a2') === !!S.slot));
}

function focusFirstInput(){
  const el = qEl(S.cur);
  const inp = el && el.querySelector('input');
  if (inp) inp.focus();
}

function onKey(e){
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const help = document.getElementById('help');

  if (e.key === 'Escape') {
    if (help && !help.classList.contains('hide')) { toggleHelp(); e.preventDefault(); return; }
    if (typingInField() && document.activeElement.blur) { document.activeElement.blur(); e.preventDefault(); }
    return;
  }
  if (e.key === '?' && !typingInField()) { toggleHelp(); e.preventDefault(); return; }
  if (typingInField()) return;               // never hijack a number input
  if (!S || !S.p) return;
  const nums = qNums();
  if (!nums.length) return;
  if (!document.getElementById('q-' + curSec() + '-' + nums[0])) return;  // not on a subtest

  const k = e.key;
  if (k === 'j' || k === 'ArrowDown') { setCur(S.cur + 1); e.preventDefault(); return; }
  if (k === 'k' || k === 'ArrowUp')   { setCur(S.cur - 1); e.preventDefault(); return; }
  if (k === 'ArrowRight') { if (curSec() === 'fs') { setSlot(1); e.preventDefault(); } return; }
  if (k === 'ArrowLeft')  { if (curSec() === 'fs') { setSlot(0); e.preventDefault(); } return; }
  if (k === 'f' || k === 'F') { toggleFlag(curSec(), nums[S.cur]); e.preventDefault(); return; }
  if (k === 'n' || k === 'N') { toggleNav(); e.preventDefault(); return; }
  if (k === 'Enter') {
    if (curSec() === 'me') { focusFirstInput(); e.preventDefault(); return; }
    if (curSec() === 'fs' && !S.slot) { setSlot(1); e.preventDefault(); return; }
    setCur(S.cur + 1); e.preventDefault(); return;
  }

  const max = optionCount();
  if (!max) return;
  if (k >= '1' && k <= '9') {
    const i = Number(k) - 1;
    if (i < max) { chooseOption(i); e.preventDefault(); }
    return;
  }
  const li = 'abcde'.indexOf(k.toLowerCase());
  if (li >= 0 && li < max) { chooseOption(li); e.preventDefault(); }
}

/* ---------- shortcuts overlay ---------- */
const HELP_ROWS = [
  ['j / \u2193', 'Next question'],
  ['k / \u2191', 'Previous question'],
  ['1 \u2013 4 or a \u2013 d', 'Select an option. Latin Squares use 1\u20135 / a\u2013e, Figure Sequences 1\u20133 / a\u2013c.'],
  ['\u2190 / \u2192', 'Figure Sequences: switch between Image 1 and Image 2'],
  ['Enter', 'Advance: Image 1 \u2192 Image 2, otherwise on to the next question. On an equation system, jump into the first box.'],
  ['f', 'Flag the current question for review'],
  ['n', 'Open or close the question navigator'],
  ['?', 'Show or hide this list'],
  ['Esc', 'Close this list, or step out of a number box']
];

function toggleHelp(){
  const el = document.getElementById('help');
  if (!el) return;
  const opening = el.classList.contains('hide');
  if (opening) {
    document.getElementById('helpBody').innerHTML =
      '<table><tbody>' + HELP_ROWS.map(r =>
        '<tr><td style="white-space:nowrap"><kbd>' + r[0] + '</kbd></td><td>' + r[1] + '</td></tr>').join('') +
      '</tbody></table><p class="muted" style="font-size:12.5px;margin:10px 0 0">' +
      'Shortcuts are ignored while the cursor is in a number box, so typing an equation answer ' +
      'never triggers one.</p>';
  }
  el.classList.toggle('hide', !opening);
}

if (typeof document !== 'undefined') document.addEventListener('keydown', onKey);

/* ================= rendering ================= */
function paintTabs(){ document.getElementById('tabsIn').innerHTML = tabsHtml(); }
function paintFoot(){
  const s = SECT[S.tab], done = Object.keys(S.ans[s.k]).length;
  document.getElementById('fstat').textContent = `${done}/${s.n} answered`;
  document.getElementById('fprog').style.width = (done/s.n*100)+'%';
}
function render(keepScroll){
  const y = window.scrollY;
  paintTabs(); paintFoot(); paintTimer();
  const s = SECT[S.tab];
  let h = '';
  if(s.k==='fs') h = renderFs();
  else if(s.k==='me') h = renderMe();
  else if(s.k==='ls') h = renderLs();
  else h = renderSub();
  document.getElementById('app').innerHTML = h;
  if (S.cur === undefined) S.cur = 0;
  paintCur();
  if(keepScroll) window.scrollTo(0,y);
}

function head(title, sub, intro){
  return `<div style="margin-top:14px">
    <div class="bar">${title}</div><div class="bar2">${sub}</div></div>
    <div class="note">${intro}</div>`;
}

function renderFs(){
  const rev = S.submitted;
  let h = head('Core Module &mdash; Subtest 1',
    'Figure Sequences &middot; 20 items &middot; 2 marks each &middot; 40 marks &middot; 25 minutes',
    `<p>Each item shows four 5&times;5 matrices. The figures change <strong>position</strong>,
     <strong>colour</strong> and/or <strong>orientation</strong> from one matrix to the next.
     Work out what <strong>Matrix 5 (Image 1)</strong> and <strong>Matrix 6 (Image 2)</strong> look like
     and pick one of the three candidates under each.</p>
     <p>Figures may change colour, rotate about their own axis, move vertically, horizontally or
     diagonally, change step size by x + 1, bounce off a boundary or travel along it.
     Figures never disappear and never overlap. 1 mark per image.</p>`);
  S.p.fs.forEach(it=>{
    const a = S.ans.fs[it.n] || {};
    const note = it.note ? ` <span class="muted">&mdash; ${esc(it.note)}</span>` : '';
    let series = '';
    it.given.forEach((g,i)=>{
      series += `<div class="mcell"><div class="cap">Matrix ${i+1}</div>${matSvg(g,15)}</div>`;
    });
    series += `<div class="mcell"><div class="cap">Image 1</div>${qBox(15)}</div>`;
    series += `<div class="mcell"><div class="cap">Image 2</div>${qBox(15)}</div>`;
    function col(which, opts, correct){
      const inner = opts.map((o,k)=>{
        const n = k+1;
        let cls = 'fsopt' + (a[which]===n ? ' sel' : '');
        if(rev){
          if(n===correct) cls = 'fsopt correct';
          else if(a[which]===n) cls = 'fsopt wrong';
          else cls = 'fsopt';
        }
        return `<div class="${cls}" onclick="pickFs(${it.n},'${which}',${n})">
          <div class="cap">Matrix ${n}</div>${matSvg(o,15)}</div>`;
      }).join('');
      return `<div class="fscol" data-slot="${which}"><h4>${which==='a1'?'Image 1 (Matrix 5)':'Image 2 (Matrix 6)'}</h4>
        <div class="fsstack">${inner}</div></div>`;
    }
    let solved = '';
    if(rev){
      const g1 = a.a1===it.a1, g2 = a.a2===it.a2;
      const got = (g1?1:0)+(g2?1:0);
      solved = `<div class="expl"><strong>Answer:</strong> Image 1 = Matrix ${it.a1},
        Image 2 = Matrix ${it.a2} &mdash; you scored <strong>${got}/2</strong>.<br>
        ${it.rules.map(r=>esc(r)).join('<br>')}</div>`;
    }
    h += `<div class="card" id="q-fs-${it.n}" data-sec="fs" data-n="${it.n}">
      <div class="qh"><span class="qn">${it.n}.</span>
      <span><span class="tag ${it.lvl}">${it.lvl}</span>${note}</span>
      <span class="spacer"></span>${flagBtn('fs',it.n)}</div>
      <div class="fsrow">${series}</div>
      <div class="fscols">${col('a1',it.o1,it.a1)}${col('a2',it.o2,it.a2)}</div>
      ${solved}</div>`;
  });
  return h;
}

function renderMe(){
  const rev = S.submitted;
  let h = head('Core Module &mdash; Subtest 2',
    'Mathematical Equations &middot; 20 systems &middot; 2 marks each &middot; 40 marks &middot; 25 minutes',
    `<p>Solve each system so that <strong>all</strong> its equations hold at the same time.
     Every letter is an <strong>integer between 1 and 20</strong> and each system has exactly one
     solution. 2 marks only if every letter is correct &mdash; no partial credit.</p>`);
  S.p.me.forEach(it=>{
    const a = S.ans.me[it.n] || {};
    const note = it.note ? ` <span class="muted">&mdash; ${esc(it.note)}</span>` : '';
    const inputs = it.vars.map(v=>{
      let cls = 'vin';
      if(rev) cls += (String(a[v])===String(it.sol[v]) ? ' ok' : ' no');
      return `<span class="${cls}">${v} =
        <input type="number" min="1" max="20" value="${a[v]!==undefined?a[v]:''}"
        ${rev?'disabled':''} oninput="setEq(${it.n},'${v}',this)"></span>`;
    }).join('');
    let solved = '';
    if(rev){
      const ok = it.vars.every(v=>String(a[v])===String(it.sol[v]));
      solved = `<div class="expl"><strong>Solution:</strong> ${
        it.vars.map(v=>`${v} = ${it.sol[v]}`).join(', ')} &mdash;
        <strong>${ok?'2/2 marks':'0/2 marks'}</strong></div>`;
    }
    h += `<div class="card" id="q-me-${it.n}" data-sec="me" data-n="${it.n}">
      <div class="qh"><span class="qn">${it.n}.</span>
      <span><span class="tag ${it.lvl}">${it.lvl}</span>${note}</span>
      <span class="spacer"></span>${flagBtn('me',it.n)}</div>
      <div class="eqbox">${it.eqs.map(e=>esc(e)).join('<br>')}</div>
      <div class="vars">${inputs}</div>${solved}</div>`;
  });
  return h;
}

function latinTable(it, reveal){
  let h = '<table class="ltab"><tr><td class="hdr"></td>';
  COLNAMES.forEach(c=>h+=`<td class="hdr">${c}</td>`); h+='</tr>';
  for(let r=0;r<5;r++){
    h += `<tr><td class="rowh">${r+1}</td>`;
    for(let c=0;c<5;c++){
      const tgt = (r===it.t[0] && c===it.t[1]);
      const val = reveal ? it.full[r][c] : (tgt ? '?' : (it.grid[r][c]||''));
      h += `<td class="${tgt?('tgt'+(reveal?' rev':'')):''}">${val}</td>`;
    }
    h += '</tr>';
  }
  return h+'</table>';
}

function renderLs(){
  const rev = S.submitted;
  let h = head('Core Module &mdash; Subtest 3',
    'Latin Squares &middot; 20 items &middot; 2 marks each &middot; 40 marks &middot; 25 minutes',
    `<p>Each 5&times;5 grid may contain the letters A, B, C, D and E only. Every letter appears
     exactly <strong>once in each row and once in each column</strong>. Decide which letter belongs
     in the shaded cell marked <strong>?</strong>. Columns are labelled &alpha; &beta; &gamma;
     &delta; &epsilon;, rows 1&ndash;5.</p>`);
  S.p.ls.forEach(it=>{
    const a = S.ans.ls[it.n];
    const note = it.note ? ` <span class="muted">&mdash; ${esc(it.note)}</span>` : '';
    const btns = 'ABCDE'.split('').map(L=>{
      let cls='lbtn'+(a===L?' sel':'');
      if(rev){ cls='lbtn'+(L===it.ans?' correct':(a===L?' wrong':'')); }
      return `<button class="${cls}" onclick="pick('ls',${it.n},'${L}')">${L}</button>`;
    }).join('');
    let solved='';
    if(rev){
      const ok = a===it.ans;
      solved = `<div class="expl"><strong>Answer:</strong> ${COLNAMES[it.t[1]]}${it.t[0]+1} =
        <strong>${it.ans}</strong> &mdash; <strong>${ok?'2/2':'0/2'} marks</strong>.
        The completed grid is shown.</div>`;
    }
    h += `<div class="card" id="q-ls-${it.n}" data-sec="ls" data-n="${it.n}">
      <div class="qh"><span class="qn">${it.n}.</span>
      <span><span class="tag ${it.lvl}">${it.lvl}</span>${note}</span>
      <span class="spacer"></span>${flagBtn('ls',it.n)}</div>
      ${latinTable(it, rev)}<div class="letters">${btns}</div>${solved}</div>`;
  });
  return h;
}

function renderSub(){
  const rev = S.submitted;
  let h = head('Subject Module', 'Data Science &middot; 40 questions &middot; 2 marks each &middot; 80 marks &middot; 90 minutes',
    `<p>Each testlet begins with a short input text. Answer the single-choice questions that follow;
     each has 4 options and exactly one correct answer. The questions test
     <strong>subject knowledge and application</strong>, not memorised facts.</p>`);
  S.p.subject.forEach(t=>{
    h += `<div class="card"><h2 style="margin-top:0">${t.title}</h2>
      ${t.area?`<p class="muted" style="margin-top:-4px;font-size:13px"><em>${t.area}</em></p>`:''}
      ${t.stimulus}`;
    t.questions.forEach(q=>{
      const a = S.ans.sub[q.n];
      const opts = q.options.map((o,i)=>{
        let cls='opt'+(a===i?' sel':'');
        if(rev){ cls='opt dis'+(i===q.ans?' correct':(a===i?' wrong':'')); }
        return `<div class="${cls}" onclick="pick('sub',${q.n},${i})">
          <span class="k">${'abcd'[i]})</span><span>${o}</span></div>`;
      }).join('');
      let solved='';
      if(rev){
        const ok = a===q.ans;
        solved = `<div class="expl"><strong>${'abcd'[q.ans]})</strong> &mdash; ${q.expl}
          <br><strong>${ok?'2/2':'0/2'} marks</strong></div>`;
      }
      h += `<div class="q" id="q-sub-${q.n}" data-sec="sub" data-n="${q.n}">
        <div class="qh"><span class="qn">${q.n}.</span><div>${q.stem}</div>
        <span class="spacer"></span>${flagBtn('sub',q.n)}</div>
        <div class="opts">${opts}</div>${solved}</div>`;
    });
    h += '</div>';
  });
  return h;
}

/* ================= scoring ================= */
function score(){
  const p = S.p, out = {fs:0, me:0, ls:0, sub:0, byLvl:{low:[0,0],medium:[0,0],high:[0,0]},
                        byTestlet:[], wrong:[]};
  p.fs.forEach(it=>{
    const a = S.ans.fs[it.n]||{};
    let m = 0;
    if(a.a1===it.a1) m++;
    if(a.a2===it.a2) m++;
    out.fs += m; out.byLvl[it.lvl][0]+=m; out.byLvl[it.lvl][1]+=2;
    if(m<2) out.wrong.push({sec:'fs', n:it.n});
  });
  p.me.forEach(it=>{
    const a = S.ans.me[it.n]||{};
    const ok = it.vars.every(v=>String(a[v])===String(it.sol[v]));
    const m = ok?2:0;
    out.me += m; out.byLvl[it.lvl][0]+=m; out.byLvl[it.lvl][1]+=2;
    if(m<2) out.wrong.push({sec:'me', n:it.n});
  });
  p.ls.forEach(it=>{
    const m = (S.ans.ls[it.n]===it.ans)?2:0;
    out.ls += m; out.byLvl[it.lvl][0]+=m; out.byLvl[it.lvl][1]+=2;
    if(m<2) out.wrong.push({sec:'ls', n:it.n});
  });
  p.subject.forEach(t=>{
    let got=0, tot=0;
    t.questions.forEach(q=>{
      tot+=2;
      if(S.ans.sub[q.n]===q.ans){ got+=2; out.sub+=2; }
      else out.wrong.push({sec:'sub', n:q.n});
    });
    out.byTestlet.push({name:t.title, got:got, tot:tot});
  });
  out.core = out.fs+out.me+out.ls;
  out.total = out.core+out.sub;
  return out;
}

function flagList(){
  const out = [];
  SECT.forEach(sec => Object.keys(S.flags[sec.k] || {}).forEach(n => {
    if (S.flags[sec.k][n]) out.push({sec: sec.k, n: Number(n)});
  }));
  return out;
}

function recordAttempt(){
  const r = score();
  pushHistory({
    id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    pid: S.pid,
    date: new Date().toISOString(),
    mode: S.mode,
    total: r.total, core: r.core,
    sect: {fs: r.fs, me: r.me, ls: r.ls, sub: r.sub},
    byLvl: r.byLvl,
    byTestlet: r.byTestlet,
    spent: S.spent.slice(),
    wrong: r.wrong,
    flagged: flagList()
  });
}

function finish(){
  const answered = SECT.reduce((n,s)=>n+Object.keys(S.ans[s.k]).length,0);
  if(!S.submitted && answered<100){
    if(!confirm(`You have answered ${answered} of 100 questions. Submit anyway?\n\n`+
      `There is no negative marking, so unanswered questions are a pure loss.`)) return;
  }
  S.submitted = true;
  clearInterval(tick); tick=null;
  if(S.kind === 'paper'){ recordAttempt(); clearProgress(S.pid); }
  document.getElementById('timer').classList.add('hide');
  document.getElementById('tabs').classList.add('hide');
  document.getElementById('foot').classList.add('hide');
  showResults();
}

function bar(label, got, tot){
  const pct = tot? Math.round(got/tot*100):0;
  return `<div class="brow"><span class="lbl">${label}</span>
    <span class="btrack"><i class="bfill" style="width:${pct}%"></i></span>
    <span class="val">${got}/${tot}</span></div>`;
}

function showResults(){
  const r = score();
  let band, bcol;
  if(r.total>=150){band='Competitive for selective programmes'; bcol='var(--ok)';}
  else if(r.total>=120){band='Solid'; bcol='var(--warn)';}
  else {band='Needs more preparation'; bcol='var(--bad)';}
  const weakest = [...r.byTestlet].sort((a,b)=>(a.got/a.tot)-(b.got/b.tot))[0];
  let h = `<h1>Paper ${S.p.id} &mdash; Result</h1>
  <div class="card">
    <div class="score"><div class="big">${r.total}<span style="font-size:20px;color:var(--muted)">/200</span></div>
      <div><div style="font-weight:700;color:${bcol}">${band}</div>
      <div class="muted" style="font-size:13px">${Math.round(r.total/2)}% overall</div></div></div>
    <h3>By subtest</h3><div class="bars">
      ${bar('Figure Sequences', r.fs, 40)}
      ${bar('Mathematical Equations', r.me, 40)}
      ${bar('Latin Squares', r.ls, 40)}
      ${bar('<strong>Core Module</strong>', r.core, 120)}
      ${bar('Subject Module', r.sub, 80)}
    </div>
    <h3>Core Module by difficulty</h3><div class="bars">
      ${bar('Low difficulty', r.byLvl.low[0], r.byLvl.low[1])}
      ${bar('Medium difficulty', r.byLvl.medium[0], r.byLvl.medium[1])}
      ${bar('High difficulty', r.byLvl.high[0], r.byLvl.high[1])}
    </div>
    <h3>Subject Module by testlet</h3><div class="bars">
      ${r.byTestlet.map(t=>bar(t.name.replace(/^Testlet \d+ &mdash; /,'').replace(/^Testlet \d+ — /,''), t.got, t.tot)).join('')}
    </div>
    <div class="note"><p><strong>Weakest area:</strong> ${weakest.name} (${weakest.got}/${weakest.tot}).
    Start your revision there.</p></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px">
      <button class="btn pri" onclick="review()">Revise with solutions</button>
      <button class="btn" onclick="retake()">Retake this paper</button>
      <button class="btn" onclick="goHome()">All papers</button>
    </div>
  </div>`;
  document.getElementById('app').innerHTML = h;
  window.scrollTo(0,0);
}

function review(){
  S.tab = 0;
  document.getElementById('tabs').classList.remove('hide');
  document.getElementById('foot').classList.remove('hide');
  document.getElementById('foot').querySelector('.btn.pri').textContent = 'Back to result';
  document.getElementById('foot').querySelector('.btn.pri').onclick = showResults;
  render(); window.scrollTo(0,0);
}
function retake(){
  const id = S.p.id;
  document.getElementById('foot').querySelector('.btn.pri').textContent = 'Submit paper';
  document.getElementById('foot').querySelector('.btn.pri').onclick = finish;
  startPaper(id);
}

/* Flush before the tab goes away; pagehide is the reliable one on mobile. */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => saveProgress(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveProgress(true);
  });
}

/* ================= boot ================= */
function boot(data){ DATA = data; goHome(); }

if (typeof document !== 'undefined') {
  const el = document.getElementById('dmat-data');
  let inline = null;
  try { inline = el ? JSON.parse(el.textContent) : null; } catch(e){ inline = null; }
  if (Array.isArray(inline) && inline.length) {
    boot(inline);
  } else if (typeof fetch === 'function') {
    // dev fallback: src/ served over http. dist/ always has the data inlined above.
    fetch('data.json').then(r=>r.json()).then(boot).catch(()=>{
      document.getElementById('app').innerHTML =
        '<div class="note"><p>Could not load <code>data.json</code>. '+
        'Run <code>sh build.sh</code> and open <code>dist/dMAT_Practice_Suite.html</code>.</p></div>';
    });
  }
}
