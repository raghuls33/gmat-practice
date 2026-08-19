/* GMAT Practice Suite — application code.
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
  // Namespace deliberately keeps the original 'dmat.v1.' prefix. The app was
  // renamed, but changing this key would orphan every attempt already saved in
  // a user's browser. It is internal and never shown in the UI.
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
  if (!confirm('Delete all saved GMAT data in this browser?\n\n' +
               'This removes every in-progress paper and your whole attempt ' +
               'history. It cannot be undone.')) return;
  Store.keys().forEach(k => Store.del(k));
  SET = {cb:false};
  alert('Saved data cleared.');
  goHome();
}


/* ================= describing a matrix in words =================
   Built from the same state objects the SVG is drawn from, so the screen-reader
   text and the picture can never drift apart. */
const GLYPH_NAME = {
  '\u25c6': 'filled diamond',
  '\u25a0': 'filled square',
  '\u25cb': 'open circle',
  '\u25b3': 'open triangle',
  'A': 'arrow',
  'K': 'right angle'
};
/* symSvg rotates the arrow by (ang - 90) and the angle by ang, with
   ang = [0,90,180,270][o % 4]. */
const ARROW_DIR = ['pointing up', 'pointing right', 'pointing down', 'pointing left'];
const ANGLE_DIR = ['opening to the bottom right', 'opening to the bottom left',
                   'opening to the top left', 'opening to the top right'];
const COLOUR_NAME = {black:'black', red:'red', green:'green', blue:'blue',
                     orange:'orange', magenta:'magenta', '':'black'};
/* One-letter tag used by the colour-blind-safe mode. */
const COLOUR_TAG = {black:'K', red:'R', green:'G', blue:'B', orange:'O', magenta:'M', '':'K'};

function figureDesc(sym){
  const name = GLYPH_NAME[sym.g] || 'figure';
  let dir = '';
  if (sym.g === 'A') dir = ' ' + ARROW_DIR[(sym.o || 0) % 4];
  if (sym.g === 'K') dir = ' ' + ANGLE_DIR[(sym.o || 0) % 4];
  return (COLOUR_NAME[sym.k] || 'black') + ' ' + name + dir +
         ' at column ' + COLNAMES[sym.c] + ', row ' + (sym.r + 1);
}

function matDesc(state){
  const st = state || [];
  if (!st.length) return 'Empty 5 by 5 grid.';
  return '5 by 5 grid, ' + st.length + ' figure' + (st.length === 1 ? '' : 's') + ': ' +
         st.map(figureDesc).join('; ') + '.';
}

/* Strip markup so option text can be used as an accessible name. */
function plain(html){
  return String(html === undefined || html === null ? '' : html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '\u2014').replace(/&middot;/g, '\u00b7')
    .replace(/\s+/g, ' ').trim();
}
function attr(t){ return String(t === undefined || t === null ? '' : t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

/* ================= colour-blind-safe tags ================= */
function cbOn(){ return !!(SET && SET.cb); }

function toggleCb(v){
  SET.cb = (v === undefined) ? !cbOn() : !!v;
  saveSettings();
  if (S && S.p) render(true);
  else if (document.querySelector('.pcard')) goHome();
  document.querySelectorAll('.cbtoggle input').forEach(i => { i.checked = cbOn(); });
}

function cbToggleHtml(id){
  return '<label class="cbtoggle"><input type="checkbox" ' + (cbOn() ? 'checked' : '') +
    ' id="' + id + '" onchange="toggleCb(this.checked)"> ' +
    '<span>Colour-blind safe tags</span></label>';
}

/* ================= radiogroup keyboard =================
   Standard radio behaviour inside the group; stopPropagation keeps the global
   j/k question navigation from also firing. */
function radioKey(ev){
  const k = ev.key;
  if (['ArrowRight','ArrowDown','ArrowLeft','ArrowUp',' ','Spacebar','Enter'].indexOf(k) < 0) return;
  const group = ev.currentTarget;
  const radios = [].slice.call(group.querySelectorAll('[role="radio"]'))
                   .filter(r => !r.disabled);
  if (!radios.length) return;
  let i = radios.indexOf(document.activeElement);
  ev.stopPropagation();
  ev.preventDefault();
  if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
    if (i >= 0) radios[i].click();
    return;
  }
  if (i < 0) i = 0;
  else i = (k === 'ArrowRight' || k === 'ArrowDown')
    ? (i + 1) % radios.length
    : (i - 1 + radios.length) % radios.length;
  radios[i].focus();
  radios[i].click();
}

/* ================= SVG matrix rendering ================= */
/* The one-letter colour tag drawn in the cell corner when colour-blind-safe
   mode is on. Painted stroke-first so it stays readable over a filled figure. */
function cbTag(s, cell){
  if (!cbOn()) return '';
  const t = COLOUR_TAG[s.k] || 'K';
  const x = s.c*cell + cell*0.17, y = s.r*cell + cell*0.31;
  return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${(cell*0.36).toFixed(2)}"
    font-weight="700" text-anchor="middle" fill="${PAL[s.k] || '#1a1a1a'}"
    stroke="#fff" stroke-width="${(cell*0.09).toFixed(2)}" paint-order="stroke"
    font-family="Helvetica,Arial,sans-serif">${t}</text>`;
}

function symSvg(s, cell){
  const cx = s.c*cell + cell/2, cy = s.r*cell + cell/2, r = cell*0.30;
  const col = PAL[s.k] || '#1a1a1a';
  const A = `fill="${col}" stroke="${col}" stroke-width="1"`;
  const H = `fill="#fff" stroke="${col}" stroke-width="1.3"`;
  if(s.g==='\u25c6') return `<polygon points="${cx},${cy-r} ${cx+r},${cy} ${cx},${cy+r} ${cx-r},${cy}" ${A}/>` + cbTag(s, cell);
  if(s.g==='\u25a0') return `<rect x="${cx-r}" y="${cy-r}" width="${2*r}" height="${2*r}" ${A}/>` + cbTag(s, cell);
  if(s.g==='\u25cb') return `<circle cx="${cx}" cy="${cy}" r="${r}" ${H}/>` + cbTag(s, cell);
  if(s.g==='\u25b3') return `<polygon points="${cx},${cy-r*1.15} ${cx+r},${cy+r*0.75} ${cx-r},${cy+r*0.75}" ${H}/>` + cbTag(s, cell);
  if(s.g==='A'){
    const ang=[0,90,180,270][s.o%4], a=r*1.15, b=r*0.42;
    const pts=[[a,0],[a-r*0.9,b*1.55],[a-r*0.9,b*0.55],[-a,b*0.55],[-a,-b*0.55],
               [a-r*0.9,-b*0.55],[a-r*0.9,-b*1.55]].map(p=>p.join(',')).join(' ');
    return `<g transform="translate(${cx},${cy}) rotate(${ang-90})"><polygon points="${pts}" ${A}/></g>` + cbTag(s, cell);
  }
  if(s.g==='K'){
    const ang=[0,90,180,270][s.o%4];
    return `<g transform="translate(${cx},${cy}) rotate(${ang})">`+
      `<polyline points="${-r},${r} ${-r},${-r} ${r},${-r}" fill="none" stroke="${col}" `+
      `stroke-width="1.9" stroke-linecap="square"/></g>` + cbTag(s, cell);
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
  const d = matDesc(state);
  return `<svg class="mx" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"
    role="img" aria-label="${attr(d)}"><title>${esc(d)}</title>${g}${sy}</svg>`;
}
function qBox(cell){
  cell = cell || 15; const W = cell*5;
  return `<svg class="mx" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" role="img"`+
    ` aria-label="Unknown matrix, to be worked out"><title>Unknown matrix, to be worked out</title>`+
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

  const hist = getHistory();
  const pool = weakPool();
  const best = hist.length ? Math.max.apply(null, hist.map(a=>a.total)) : 0;
  const histBanner = hist.length ? `
    <div class="note">
      <p><strong>${hist.length} attempt${hist.length>1?'s':''} recorded.</strong>
      Best total so far: <strong>${best}/200</strong>.</p>
      <div class="resrow">
        <button class="btn sm pri" onclick="showHistory()">Attempt history &amp; trends</button>
        <button class="btn sm" onclick="startDrill()" ${pool.count?'':'disabled'}>Drill my weak areas
          ${pool.count?`(${pool.count})`:''}</button>
      </div>
    </div>` : '';

  const storageNote = Store.persistent() ? '' : `
    <div class="note warnbox"><p><strong>Storage unavailable.</strong> This browser is blocking
    local storage, so progress and history are kept in memory for this tab only and will be
    lost on reload. Everything else works normally.</p></div>`;
  document.getElementById('app').innerHTML = `
  <h1>GMAT Practice Suite &mdash; Data Science</h1>
  <p class="muted" style="margin-top:0">Five full-length papers &mdash; figure sequences, equation systems,
  Latin squares and a Data Science subject module. Answer, submit, score, then revise with worked solutions.</p>
  <p class="muted" style="margin-top:6px;font-size:12.5px"><strong>Format note:</strong> the task types follow the
  official g.a.s.t. / TestDaF-Institut preparatory materials. They are not the question formats used by the
  real GMAT.</p>
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
  ${histBanner}
  <h2>Choose a paper</h2>
  <div class="grid2">${cards}</div>
  <h2>Self-assessment bands</h2>
  <table><thead><tr><th>Band</th><th>Core (120)</th><th>Subject (80)</th><th>Total (200)</th></tr></thead>
  <tbody>
  <tr><td>Competitive for selective programmes</td><td>90+</td><td>60+</td><td><strong>150+</strong></td></tr>
  <tr><td>Solid</td><td>72&ndash;89</td><td>48&ndash;59</td><td>120&ndash;149</td></tr>
  <tr><td>Needs more preparation</td><td>&lt;72</td><td>&lt;48</td><td>&lt;120</td></tr>
  </tbody></table>
  <p class="muted" style="font-size:12.5px">The 200-mark scheme above follows the g.a.s.t. / TestDaF-Institut
  format rather than any scaled score reported by the real GMAT; these bands are a practice target only.</p>
  <h2>Saved data</h2>
  <p class="muted" style="font-size:13px">Your answers, flags, timings and attempt history are stored
  only in this browser and are never uploaded. The one exception is the optional sign-up form under
  <em>About this material</em>, which sends the details you type there to the server &mdash; nothing else
  on this page leaves your device.</p>
  <div style="display:flex;gap:9px;flex-wrap:wrap">
    <button class="btn" onclick="clearAllData()">Clear all saved data</button>
  </div>
  <h2>Display</h2>
  <div class="card" style="margin-top:8px">
    ${cbToggleHtml('cbHome')}
    <p class="muted" style="font-size:12.8px;margin:8px 0 0">Adds a one-letter tag
    (<strong>K</strong> black, <strong>R</strong> red, <strong>G</strong> green,
    <strong>B</strong> blue, <strong>O</strong> orange) to every coloured figure, so the
    figure sequences can be read without relying on hue. The tags also appear in the
    printed paper.</p>
  </div>
  <h2>About this material</h2>
  <div class="card about">
    <p style="margin-top:0"><strong>Maintained by</strong> raghuls33 &middot;
    <a href="https://github.com/raghuls33/gmat-practice" rel="noopener noreferrer">source on GitHub</a></p>
    <p class="muted" style="font-size:12.8px">Spotted a wrong answer, a figure sequence that does not
    follow, or a Latin square that does not solve uniquely? Corrections are welcome &mdash; please quote
    the paper number and the question number.</p>
    <p id="contact" class="contact"><span class="muted" style="font-size:12.8px">Loading contact&hellip;</span></p>
    <div id="signupWrap" class="signup hide">
      <h3 class="signupH">Keep in touch</h3>
      <p class="muted" style="font-size:12.8px;margin-top:2px">To be told when papers or corrections are
      added, leave your details. This is the only part of the site that sends anything to a server.</p>
      <form id="signupForm" novalidate>
        <label class="fld" for="suName"><span>Name</span></label>
        <input id="suName" type="text" maxlength="80" autocomplete="name" aria-describedby="suNameErr">
        <span class="err" id="suNameErr" role="alert"></span>

        <label class="fld" for="suEmail"><span>Email</span></label>
        <input id="suEmail" type="email" maxlength="254" autocomplete="email" aria-describedby="suEmailErr">
        <span class="err" id="suEmailErr" role="alert"></span>

        <label class="fld" for="suNote"><span>Message <span class="muted">(optional)</span></span></label>
        <textarea id="suNote" maxlength="500" rows="2" aria-describedby="suNoteErr"></textarea>
        <span class="err" id="suNoteErr" role="alert"></span>

        <div class="hpot" aria-hidden="true">
          <label for="suWebsite">Website</label>
          <input id="suWebsite" type="text" tabindex="-1" autocomplete="off">
        </div>

        <label class="consent">
          <input id="suConsent" type="checkbox" aria-describedby="suConsentErr">
          <span>I agree to my name and email being stored so I can be contacted about this
          practice material.</span>
        </label>
        <span class="err" id="suConsentErr" role="alert"></span>

        <div class="suRow">
          <button class="btn pri" type="submit" id="suBtn">Send</button>
          <span id="suStatus" class="sustatus" role="status"></span>
        </div>
      </form>
      <p class="muted" style="font-size:12px;margin-bottom:0"><strong>What is stored:</strong> your name,
      your email, any message, the country the request came from, and the time. <strong>Not stored:</strong>
      your IP address or your browser details. Nothing is shared with anyone else. To have your entry
      removed, email the address above and it will be deleted.</p>
    </div>
    <p class="muted" style="font-size:12px;margin-bottom:0"><strong>Unofficial.</strong> Independent practice
    material. The task types follow the g.a.s.t. / TestDaF-Institut preparatory materials for the dMAT, not
    the question formats used by the real GMAT. Not produced, endorsed or reviewed by GMAC, g.a.s.t., the
    TestDaF-Institut, or any university.</p>
  </div>`;
  paintContact();
  initSignup();
  window.scrollTo(0,0);
}

/* The address is assembled at runtime from fragments instead of sitting in the
   page source as plain text. That defeats the simplest address harvesters only;
   anyone who runs the page can still read it. It is a speed bump, not privacy. */
const MAIL_PARTS = ["ragulsoct04", "gmail", "com"];
function paintContact(){
  const el = document.getElementById("contact");
  if (!el) return;
  const addr = MAIL_PARTS[0] + String.fromCharCode(64) + MAIL_PARTS[1] + "." + MAIL_PARTS[2];
  const a = document.createElement("a");
  a.href = "mailto:" + addr + "?subject=" +
           encodeURIComponent("GMAT Practice Suite — content report");
  a.textContent = addr;
  a.setAttribute("aria-label", "Email " + addr + " to report a problem with the question content");
  el.textContent = "";
  const lab = document.createElement("strong");
  lab.textContent = "Content queries: ";
  el.appendChild(lab);
  el.appendChild(a);
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
  else chooseMode(pid);
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


/* ================= exam / practice mode =================
   Practice: the clock is advisory and simply counts down.
   Exam: when a subtest clock reaches zero that subtest locks, its answers
   become read-only and the app moves on to the next unlocked subtest. When the
   last one locks the paper is submitted automatically. */

function isExam(){ return !!S && S.mode === 'exam'; }
function tabLocked(i){ return !!(S && S.locked && S.locked[i]); }
/* Read-only: after submitting, or inside a subtest whose clock has run out. */
function readOnly(){ return !S || S.submitted || tabLocked(S.tab); }

function fmtClock(sec){
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60), r = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}
function fmtSpent(sec){
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60), r = sec % 60;
  return m ? (m + ' min ' + r + ' s') : (r + ' s');
}

function nextOpenTab(from){
  for (let i = from + 1; i < SECT.length; i++) if (!tabLocked(i)) return i;
  for (let i = 0; i < SECT.length; i++) if (!tabLocked(i)) return i;
  return -1;
}

function lockSubtest(i){
  if (tabLocked(i)) return;
  S.locked[i] = true;
  saveProgress(true);
  const nxt = nextOpenTab(i);
  if (nxt < 0) {                       // every subtest is out of time
    alert('Time is up on the final subtest. Your paper has been submitted.');
    finish(true);
    return;
  }
  alert('Time is up on ' + SECT[i].name + '.\n\nThat subtest is now locked. ' +
        'Moving on to ' + SECT[nxt].name + '.');
  setTab(nxt);
}

/* ---------- mode chooser ---------- */
function closeDlg(){
  const el = document.getElementById('dlg');
  if (el) el.classList.add('hide');
}

function chooseMode(pid){
  const el = document.getElementById('dlg');
  document.getElementById('dlgBox').innerHTML =
    '<div class="mhead"><strong id="dlgTitle">Paper ' + pid + '</strong><span class="spacer"></span>' +
    '<button class="btn sm" onclick="closeDlg()">Cancel</button></div>' +
    '<div class="mbody">' +
      '<p class="muted" style="margin-top:0">How do you want to sit this paper? ' +
      'The questions and the mark scheme are identical either way.</p>' +
      '<div class="modepick">' +
        '<button class="modecard" onclick="closeDlg();startPaper(' + pid + ',&quot;exam&quot;)">' +
          '<strong>Exam mode</strong>' +
          '<span>Each subtest locks the moment its clock hits zero. Answers become ' +
          'read-only and you are moved to the next subtest. 25 / 25 / 25 / 90 minutes.</span></button>' +
        '<button class="modecard" onclick="closeDlg();startPaper(' + pid + ',&quot;practice&quot;)">' +
          '<strong>Practice mode</strong>' +
          '<span>The clock still runs and time spent is still recorded, but nothing ever ' +
          'locks. Work at your own pace.</span></button>' +
      '</div></div>';
  el.classList.remove('hide');
}

/* ================= timer ================= */
function startTimer(){
  clearInterval(tick);
  tick = setInterval(()=>{
    if(!S || S.submitted) return;
    const i = S.tab;
    if(tabLocked(i)) { paintTimer(); return; }   // a locked subtest burns no clock
    if(S.left[i] > 0) S.left[i]--;
    S.spent[i]++;
    if(S.spent[i] % 10 === 0) saveProgress(true);
    paintTimer();
    if(S.left[i] === 0 && isExam()) lockSubtest(i);
  },1000);
  paintTimer();
}
function paintTimer(){
  const el = document.getElementById('timer');
  if(!S || S.untimed){el.classList.add('hide');return;}   // a drill has no clock
  el.classList.remove('hide');
  const t = S.left[S.tab];
  if(tabLocked(S.tab)){
    el.textContent = 'LOCKED';
    el.className = 'timer low';
    el.title = SECT[S.tab].name + ' is locked: its time ran out.';
    return;
  }
  el.textContent = t>0 ? fmtClock(t) : 'TIME UP';
  el.className = 'timer' + (t<=120 ? ' low' : '') + (isExam() ? ' exam' : '');
  el.title = (isExam() ? 'Exam mode' : 'Practice mode') + ' \u2014 ' + SECT[S.tab].name +
             ', ' + fmtSpent(S.spent[S.tab]) + ' spent';
}

/* ================= tabs ================= */
function tabsHtml(){
  return SECT.map((s,i)=>{
    const done = Object.keys(S.ans[s.k]).length, tot = secCount(i);
    const lk = tabLocked(i) ? ' <span class="lockmark" title="Locked: time ran out">&#128274;</span>' : '';
    return `<button class="tab ${i===S.tab?'on':''}${tabLocked(i)?' locked':''}" onclick="setTab(${i})">${s.name}
      <span class="cnt">${done}/${tot}</span>${lk}</button>`;
  }).join('');
}
function setTab(i){ S.tab=i; S.cur=0; S.slot=0; saveProgress(true); render(); window.scrollTo(0,0); }
function nextTab(){ if(S.tab<3) setTab(S.tab+1); }
function prevTab(){ if(S.tab>0) setTab(S.tab-1); }

/* ================= answering ================= */
function pick(sec, key, val){
  if(readOnly()) return;
  S.ans[sec][key] = val;
  afterAnswer(sec, key);
}
function setEq(i, v, el){
  if(readOnly()) return;
  const cur = S.ans.me[i] || {};
  cur[v] = el.value.trim();
  const filled = Object.values(cur).filter(x=>x!=='').length;
  if(filled===0) delete S.ans.me[i]; else S.ans.me[i]=cur;
  saveProgress();
  paintFoot(); paintTabs(); paintChips();
}
function pickFs(i, which, opt){
  if(readOnly()) return;
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
  const cbSlot = document.getElementById('npCb');
  if (cbSlot) cbSlot.innerHTML = cbToggleHtml('cbNav');
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
  if (tag === 'textarea' || tag === 'select') return true;
  if (a.isContentEditable === true) return true;
  if (tag !== 'input') return false;
  /* A checkbox is not a typing target, so shortcuts stay live next to the
     colour-blind toggle; number and text boxes swallow everything. */
  const t = (a.type || 'text').toLowerCase();
  return ['checkbox', 'radio', 'button', 'submit', 'reset'].indexOf(t) < 0;
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
    const dlg = document.getElementById('dlg');
    if (dlg && !dlg.classList.contains('hide')) { closeDlg(); e.preventDefault(); return; }
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
  const s = SECT[S.tab], done = Object.keys(S.ans[s.k]).length, tot = secCount(S.tab);
  document.getElementById('fstat').textContent = `${done}/${tot} answered`;
  document.getElementById('fprog').style.width = (tot ? done/tot*100 : 0)+'%';
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
  const locked = (S && !S.submitted && tabLocked(S.tab)) ? `
    <div class="note warnbox"><p><strong>${SECT[S.tab].name} is locked.</strong>
    Its ${SECT[S.tab].mins}-minute clock ran out, so these answers are read-only.
    You spent ${fmtSpent(S.spent[S.tab])} here.</p></div>` : '';
  return `<div style="margin-top:14px">
    <div class="bar">${title}</div><div class="bar2">${sub}</div></div>
    ${locked}${filterBar()}<div class="note">${intro}</div>`;
}

function renderFs(){
  const rev = S.submitted, ro = readOnly();
  let h = head('Core Module &mdash; Subtest 1',
    'Figure Sequences &middot; 20 items &middot; 2 marks each &middot; 40 marks &middot; 25 minutes',
    `<p>Each item shows four 5&times;5 matrices. The figures change <strong>position</strong>,
     <strong>colour</strong> and/or <strong>orientation</strong> from one matrix to the next.
     Work out what <strong>Matrix 5 (Image 1)</strong> and <strong>Matrix 6 (Image 2)</strong> look like
     and pick one of the three candidates under each.</p>
     <p>Figures may change colour, rotate about their own axis, move vertically, horizontally or
     diagonally, change step size by x + 1, bounce off a boundary or travel along it.
     Figures never disappear and never overlap. 1 mark per image.</p>`);
  let shown = 0;
  S.p.fs.forEach(it=>{
    if(!passFilter('fs', it.n)) return;
    shown++;
    const a = S.ans.fs[it.n] || {};
    const note = it.note ? ` <span class="muted">&mdash; ${esc(it.note)}</span>` : '';
    let series = '';
    it.given.forEach((g,i)=>{
      series += `<div class="mcell"><div class="cap">Matrix ${i+1}</div>${matSvg(g,15)}</div>`;
    });
    series += `<div class="mcell"><div class="cap">Image 1</div>${qBox(15)}</div>`;
    series += `<div class="mcell"><div class="cap">Image 2</div>${qBox(15)}</div>`;
    function col(which, opts, correct){
      const label = which==='a1' ? 'Image 1 (Matrix 5)' : 'Image 2 (Matrix 6)';
      const gid = `fsg-${it.n}-${which}`;
      const inner = opts.map((o,k)=>{
        const n = k+1;
        let cls = 'fsopt' + (a[which]===n ? ' sel' : '') + (ro ? ' dis' : '');
        if(rev){
          if(n===correct) cls = 'fsopt correct';
          else if(a[which]===n) cls = 'fsopt wrong';
          else cls = 'fsopt';
        }
        const chosen = a[which]===n;
        const tab = chosen || (a[which]===undefined && n===1) ? 0 : -1;
        const al = `${label}, candidate ${n} of 3. ${matDesc(o)}`;
        return `<div class="${cls}" role="radio" tabindex="${tab}"
          aria-checked="${chosen?'true':'false'}" aria-label="${attr(al)}"
          onclick="pickFs(${it.n},'${which}',${n})">
          <div class="cap" aria-hidden="true">Matrix ${n}</div>${matSvg(o,15)}</div>`;
      }).join('');
      return `<div class="fscol" data-slot="${which}"><h4 id="${gid}">${label}</h4>
        <div class="fsstack" role="radiogroup" aria-labelledby="${gid}"
          onkeydown="radioKey(event)">${inner}</div></div>`;
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
  if(!shown) h += emptyFilterNote();
  return h;
}

function renderMe(){
  const rev = S.submitted, ro = readOnly();
  let h = head('Core Module &mdash; Subtest 2',
    'Mathematical Equations &middot; 20 systems &middot; 2 marks each &middot; 40 marks &middot; 25 minutes',
    `<p>Solve each system so that <strong>all</strong> its equations hold at the same time.
     Every letter is an <strong>integer between 1 and 20</strong> and each system has exactly one
     solution. 2 marks only if every letter is correct &mdash; no partial credit.</p>`);
  let shown = 0;
  S.p.me.forEach(it=>{
    if(!passFilter('me', it.n)) return;
    shown++;
    const a = S.ans.me[it.n] || {};
    const note = it.note ? ` <span class="muted">&mdash; ${esc(it.note)}</span>` : '';
    const inputs = it.vars.map(v=>{
      let cls = 'vin';
      if(rev) cls += (String(a[v])===String(it.sol[v]) ? ' ok' : ' no');
      return `<span class="${cls}">${v} =
        <input type="number" min="1" max="20" value="${a[v]!==undefined?a[v]:''}"
        ${ro?'disabled':''} oninput="setEq(${it.n},'${v}',this)"></span>`;
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
  if(!shown) h += emptyFilterNote();
  return h;
}

function latinTable(it, reveal){
  const cap = 'Latin square ' + it.n + '. The shaded cell is column ' +
              COLNAMES[it.t[1]] + ', row ' + (it.t[0]+1) + '.';
  let h = '<table class="ltab"><caption class="sr-only">' + esc(cap) + '</caption><tr><td class="hdr"></td>';
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
  const rev = S.submitted, ro = readOnly();
  let h = head('Core Module &mdash; Subtest 3',
    'Latin Squares &middot; 20 items &middot; 2 marks each &middot; 40 marks &middot; 25 minutes',
    `<p>Each 5&times;5 grid may contain the letters A, B, C, D and E only. Every letter appears
     exactly <strong>once in each row and once in each column</strong>. Decide which letter belongs
     in the shaded cell marked <strong>?</strong>. Columns are labelled &alpha; &beta; &gamma;
     &delta; &epsilon;, rows 1&ndash;5.</p>`);
  let shown = 0;
  S.p.ls.forEach(it=>{
    if(!passFilter('ls', it.n)) return;
    shown++;
    const a = S.ans.ls[it.n];
    const note = it.note ? ` <span class="muted">&mdash; ${esc(it.note)}</span>` : '';
    const btns = 'ABCDE'.split('').map((L,li)=>{
      let cls='lbtn'+(a===L?' sel':'');
      if(rev){ cls='lbtn'+(L===it.ans?' correct':(a===L?' wrong':'')); }
      const chosen = a===L;
      const tab = chosen || (a===undefined && li===0) ? 0 : -1;
      return `<button class="${cls}" type="button" role="radio" tabindex="${tab}"
        aria-checked="${chosen?'true':'false'}"
        aria-label="Letter ${L} for question ${it.n}"
        ${ro?'disabled':''} onclick="pick('ls',${it.n},'${L}')">${L}</button>`;
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
      ${latinTable(it, rev)}
      <div class="letters" role="radiogroup" onkeydown="radioKey(event)"
        aria-label="Answer for question ${it.n}: which letter belongs in the shaded cell">${btns}</div>${solved}</div>`;
  });
  if(!shown) h += emptyFilterNote();
  return h;
}

function renderSub(){
  const rev = S.submitted, ro = readOnly();
  let h = head('Subject Module', 'Data Science &middot; 40 questions &middot; 2 marks each &middot; 80 marks &middot; 90 minutes',
    `<p>Each testlet begins with a short input text. Answer the single-choice questions that follow;
     each has 4 options and exactly one correct answer. The questions test
     <strong>subject knowledge and application</strong>, not memorised facts.</p>`);
  let shown = 0;
  S.p.subject.forEach(t=>{
    const vis = t.questions.filter(q=>passFilter('sub', q.n));
    if(!vis.length) return;
    shown += vis.length;
    h += `<div class="card"><h2 style="margin-top:0">${t.title}</h2>
      ${t.area?`<p class="muted" style="margin-top:-4px;font-size:13px"><em>${t.area}</em></p>`:''}
      ${t.stimulus}`;
    vis.forEach(q=>{
      const a = S.ans.sub[q.n];
      const opts = q.options.map((o,i)=>{
        let cls='opt'+(a===i?' sel':'')+(ro?' dis':'');
        if(rev){ cls='opt dis'+(i===q.ans?' correct':(a===i?' wrong':'')); }
        const chosen = a===i;
        const tab = chosen || (a===undefined && i===0) ? 0 : -1;
        return `<div class="${cls}" role="radio" tabindex="${tab}"
          aria-checked="${chosen?'true':'false'}"
          aria-label="${attr('Option ' + 'abcd'[i] + ': ' + plain(o))}"
          onclick="pick('sub',${q.n},${i})">
          <span class="k" aria-hidden="true">${'abcd'[i]})</span><span>${o}</span></div>`;
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
        <div class="opts" role="radiogroup" onkeydown="radioKey(event)"
          aria-label="${attr('Answer options for question ' + q.n)}">${opts}</div>${solved}</div>`;
    });
    h += '</div>';
  });
  if(!shown) h += emptyFilterNote();
  return h;
}


/* ================= dynamic subtest sizes =================
   A drill session is a synthetic paper whose subtests are whatever you got
   wrong, so the fixed 20/20/20/40 counts in SECT no longer apply. */
function secItems(k){
  if (!S || !S.p) return [];
  if (k === 'sub') return S.p.subject.reduce((a,t)=>a.concat(t.questions), []);
  return S.p[k] || [];
}
function secCount(i){ return secItems(SECT[i].k).length; }
function totalItems(){ return SECT.reduce((n,_,i)=>n+secCount(i), 0); }

/* ================= review filters ================= */
function isWrong(sec, n){
  if (!S || !S.p) return false;
  if (sec === 'fs') {
    const it = S.p.fs.find(x=>x.n===n), a = S.ans.fs[n] || {};
    return !!it && !(a.a1 === it.a1 && a.a2 === it.a2);
  }
  if (sec === 'me') {
    const it = S.p.me.find(x=>x.n===n), a = S.ans.me[n] || {};
    return !!it && !it.vars.every(v => String(a[v]) === String(it.sol[v]));
  }
  if (sec === 'ls') {
    const it = S.p.ls.find(x=>x.n===n);
    return !!it && S.ans.ls[n] !== it.ans;
  }
  const q = secItems('sub').find(x=>x.n===n);
  return !!q && S.ans.sub[n] !== q.ans;
}

function passFilter(sec, n){
  const f = S.filter || 'all';
  if (!S.submitted || f === 'all') return true;
  if (f === 'wrong')   return isWrong(sec, n);
  if (f === 'flagged') return isFlagged(sec, n);
  return true;
}

function setFilter(f){ S.filter = f; render(); window.scrollTo(0,0); }

function filterBar(){
  if (!S.submitted) return '';
  const f = S.filter || 'all';
  const b = (k, label) =>
    `<button class="btn sm${f===k?' pri':''}" onclick="setFilter('${k}')">${label}</button>`;
  return `<div class="filterbar"><span class="muted">Show:</span>
    ${b('all','All')}${b('wrong','Wrong only')}${b('flagged','Flagged only')}</div>`;
}

function emptyFilterNote(){
  const f = S.filter || 'all';
  return `<div class="note"><p>Nothing in this subtest matches
    <strong>${f === 'wrong' ? 'wrong only' : 'flagged only'}</strong>.</p></div>`;
}

/* ================= hand-rolled SVG charts ================= */
function chartColors(){ return ['#A5195B', '#1656C8', '#1E8A3C', '#E8720C']; }

/* cfg: {series:[{name,color,dash,pts:[num|null]}], xLabels:[], yMax, yUnit, h} */
function lineChart(cfg){
  const W = 640, H = cfg.h || 220;
  const L = 44, R = 12, T = 14, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const n = cfg.xLabels.length;
  if (!n) return '<p class="muted">No attempts yet.</p>';
  const xAt = i => n === 1 ? L + iw / 2 : L + (i * iw) / (n - 1);
  const yAt = v => T + ih - (Math.max(0, Math.min(cfg.yMax, v)) / cfg.yMax) * ih;

  let g = '';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = (cfg.yMax / steps) * i, y = yAt(v);
    g += `<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="#e2e2e6" stroke-width="1"/>`;
    g += `<text x="${L-7}" y="${y+4}" text-anchor="end" font-size="10.5" fill="#6b6b70">${Math.round(v)}${cfg.yUnit||''}</text>`;
  }
  cfg.xLabels.forEach((lb, i) => {
    g += `<text x="${xAt(i)}" y="${H-13}" text-anchor="middle" font-size="10.5" fill="#6b6b70">${esc(lb)}</text>`;
  });

  let lines = '';
  cfg.series.forEach(se => {
    const pts = se.pts.map((v, i) => v === null || v === undefined ? null : [xAt(i), yAt(v)]);
    const run = pts.filter(Boolean);
    if (run.length > 1) {
      lines += `<polyline points="${run.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}"
        fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round"
        stroke-linecap="round"${se.dash?` stroke-dasharray="${se.dash}"`:''}/>`;
    }
    run.forEach(p => {
      lines += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4"
        fill="#fff" stroke="${se.color}" stroke-width="2"/>`;
    });
  });

  const desc = cfg.series.map(se => {
    const vals = se.pts.filter(v => v !== null && v !== undefined);
    return se.name + ': ' + (vals.length ? vals.join(', ') : 'no data');
  }).join('. ');

  const legend = cfg.series.length > 1
    ? `<div class="chartlegend">${cfg.series.map(se=>
        `<span><i style="background:${se.color}"></i>${esc(se.name)}</span>`).join('')}</div>`
    : '';

  return `<div class="chartbox">
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img"
      aria-label="${esc(cfg.title||'Chart')}. ${esc(desc)}">
      <title>${esc(cfg.title||'Chart')}</title><desc>${esc(desc)}</desc>
      ${g}
      <line x1="${L}" y1="${T}" x2="${L}" y2="${T+ih}" stroke="#9a9aa0" stroke-width="1"/>
      <line x1="${L}" y1="${T+ih}" x2="${W-R}" y2="${T+ih}" stroke="#9a9aa0" stroke-width="1"/>
      ${lines}
    </svg>${legend}</div>`;
}

/* ================= attempt history ================= */
function attemptLabel(a){
  const d = new Date(a.date);
  const p = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
  return p;
}

function showHistory(){
  clearInterval(tick); tick = null;
  S = null;
  document.getElementById('tabs').classList.add('hide');
  document.getElementById('foot').classList.add('hide');
  document.getElementById('timer').classList.add('hide');
  document.getElementById('navpanel').classList.add('hide');

  const hist = getHistory().slice().sort((a,b)=> new Date(a.date) - new Date(b.date));
  const app = document.getElementById('app');

  if (!hist.length) {
    app.innerHTML = `<h1>Attempt history</h1>
      <div class="note"><p>No submitted attempts yet. Finish a paper and it will appear here,
      with a score trend and a drill built from what you got wrong.</p></div>
      <button class="btn pri" onclick="goHome()">All papers</button>`;
    window.scrollTo(0,0);
    return;
  }

  const labels = hist.map(attemptLabel);
  const C = chartColors();

  const totalChart = lineChart({
    title: 'Total score over time', yMax: 200, xLabels: labels,
    series: [{name:'Total (of 200)', color:C[0], pts: hist.map(a=>a.total)}]
  });

  const trendChart = lineChart({
    title: 'Per-subtest trend, percent of that subtest', yMax: 100, yUnit: '%',
    xLabels: labels, h: 250,
    series: [
      {name:'Figure Sequences',      color:C[0], pts: hist.map(a=>Math.round(a.sect.fs/40*100))},
      {name:'Mathematical Equations',color:C[1], dash:'6 3', pts: hist.map(a=>Math.round(a.sect.me/40*100))},
      {name:'Latin Squares',         color:C[2], dash:'2 3', pts: hist.map(a=>Math.round(a.sect.ls/40*100))},
      {name:'Subject Module',        color:C[3], dash:'9 3 2 3', pts: hist.map(a=>Math.round(a.sect.sub/80*100))}
    ]
  });

  const rows = hist.slice().reverse().map(a => `<tr>
      <td>${new Date(a.date).toLocaleDateString()} <span class="muted">${new Date(a.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></td>
      <td>Paper ${a.pid}</td>
      <td>${a.mode === 'exam' ? 'Exam' : 'Practice'}</td>
      <td><strong>${a.total}</strong>/200</td>
      <td>${a.sect.fs}/${a.sect.me}/${a.sect.ls}</td>
      <td>${a.sect.sub}/80</td>
      <td>${fmtSpent((a.spent||[]).reduce((x,y)=>x+y,0))}</td>
      <td><button class="btn sm" onclick="exportAttempt('${a.id}')">Copy</button></td>
    </tr>`).join('');

  const pool = weakPool();

  document.getElementById('app').innerHTML = `<h1>Attempt history</h1>
    <div class="card">
      <h3 style="margin-top:0">Total score over time</h3>
      ${totalChart}
      <h3>Per-subtest trend</h3>
      <p class="muted" style="font-size:12.5px;margin-top:-2px">Shown as a percentage of each
      subtest so the 80-mark Subject Module is comparable with the 40-mark Core subtests.</p>
      ${trendChart}
    </div>

    <div class="card">
      <h3 style="margin-top:0">Drill my weak areas</h3>
      <p class="muted" style="font-size:13.2px">Builds an ad-hoc set from every question you have
      answered wrong across all five papers. Scored, but untimed.</p>
      <p><strong>${pool.count}</strong> question${pool.count===1?'':'s'} in the pool
        <span class="muted">(${pool.by.fs} figure sequences, ${pool.by.me} equation systems,
        ${pool.by.ls} Latin squares, ${pool.by.sub} subject questions)</span></p>
      <button class="btn pri" onclick="startDrill()" ${pool.count?'':'disabled'}>
        ${pool.count ? 'Start drill' : 'Nothing to drill yet'}</button>
    </div>

    <div class="card">
      <h3 style="margin-top:0">Attempts</h3>
      <div style="overflow-x:auto">
      <table><thead><tr><th>When</th><th>Paper</th><th>Mode</th><th>Total</th>
        <th>Core fs/me/ls</th><th>Subject</th><th>Time</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>

    <div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="btn" onclick="goHome()">All papers</button>
      <button class="btn" onclick="clearAllData()">Clear all saved data</button>
    </div>`;
  window.scrollTo(0,0);
}

/* ================= export one attempt ================= */
function attemptMarkdown(a){
  const L = [];
  const d = new Date(a.date);
  L.push('# GMAT practice — Paper ' + a.pid);
  L.push('');
  L.push('- Date: ' + d.toLocaleString());
  L.push('- Mode: ' + (a.mode === 'exam' ? 'Exam' : 'Practice'));
  L.push('- **Total: ' + a.total + ' / 200** (' + Math.round(a.total / 2) + '%)');
  L.push('- Core: ' + a.core + ' / 120 — Subject: ' + a.sect.sub + ' / 80');
  L.push('');
  L.push('## By subtest');
  L.push('');
  L.push('| Subtest | Score | Time spent |');
  L.push('|---|---|---|');
  const keys = ['fs', 'me', 'ls', 'sub'];
  SECT.forEach((sec, i) => {
    L.push('| ' + sec.name + ' | ' + a.sect[keys[i]] + ' / ' + sec.marks +
           ' | ' + fmtSpent((a.spent || [])[i]) + ' |');
  });
  L.push('');
  if (a.byLvl) {
    L.push('## Core Module by difficulty');
    L.push('');
    L.push('| Difficulty | Score |');
    L.push('|---|---|');
    ['low', 'medium', 'high'].forEach(k => {
      const v = a.byLvl[k] || [0, 0];
      L.push('| ' + k.charAt(0).toUpperCase() + k.slice(1) + ' | ' + v[0] + ' / ' + v[1] + ' |');
    });
    L.push('');
  }
  if (a.byTestlet && a.byTestlet.length) {
    L.push('## Subject Module by testlet');
    L.push('');
    L.push('| Testlet | Score |');
    L.push('|---|---|');
    a.byTestlet.forEach(t => L.push('| ' + String(t.name).replace(/\s*&mdash;\s*|\s*—\s*/, ' — ') +
                                    ' | ' + t.got + ' / ' + t.tot + ' |'));
    L.push('');
  }
  const nm = {fs: 'Figure Sequences', me: 'Mathematical Equations', ls: 'Latin Squares', sub: 'Subject Module'};
  const group = which => {
    const out = {};
    (a[which] || []).forEach(w => { (out[w.sec] = out[w.sec] || []).push(w.n); });
    return keys.filter(k => out[k] && out[k].length)
               .map(k => '- ' + nm[k] + ': ' + out[k].sort((x, y) => x - y).join(', '));
  };
  const wrong = group('wrong'), flagged = group('flagged');
  L.push('## Answered wrong');
  L.push('');
  L.push(wrong.length ? wrong.join('\n') : '- None — full marks.');
  L.push('');
  L.push('## Flagged for review');
  L.push('');
  L.push(flagged.length ? flagged.join('\n') : '- None flagged.');
  L.push('');
  return L.join('\n');
}

function copyText(text, label){
  const done = () => alert((label || 'Summary') + ' copied to the clipboard.');
  const manual = () => {
    document.getElementById('dlgBox').innerHTML =
      '<div class="mhead"><strong id="dlgTitle">Copy this summary</strong><span class="spacer"></span>' +
      '<button class="btn sm" onclick="closeDlg()">Close</button></div>' +
      '<div class="mbody"><p class="muted" style="margin-top:0">This browser would not let the page ' +
      'write to the clipboard. Select all and copy.</p>' +
      '<textarea class="copybox" readonly rows="16"></textarea></div>';
    document.getElementById('dlgBox').querySelector('.copybox').value = text;
    document.getElementById('dlg').classList.remove('hide');
    const ta = document.getElementById('dlgBox').querySelector('.copybox');
    ta.focus(); ta.select();
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, manual);
      return;
    }
  } catch (e) { /* fall through */ }
  try {                                    // file:// often blocks the async API
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) { done(); return; }
  } catch (e) { /* fall through */ }
  manual();
}

function exportAttempt(id){
  const a = getHistory().find(x => x.id === id);
  if (!a) return;
  copyText(attemptMarkdown(a), 'Attempt summary');
}

function exportCurrent(){
  if (!S || !S.submitted || S.kind !== 'paper') return;
  const r = score();
  copyText(attemptMarkdown({
    pid: S.pid, date: new Date().toISOString(), mode: S.mode,
    total: r.total, core: r.core, sect: {fs:r.fs, me:r.me, ls:r.ls, sub:r.sub},
    byLvl: r.byLvl, byTestlet: r.byTestlet, spent: S.spent, wrong: r.wrong, flagged: flagList()
  }), 'Attempt summary');
}

/* ================= drill =================
   A drill is a synthetic paper assembled from items you got wrong. Items are
   shallow-cloned only to renumber them (originals collide across papers); the
   clone shares every nested value with DATA and nothing is mutated. */
function weakPool(){
  const seen = Object.create(null);
  const by = {fs: 0, me: 0, ls: 0, sub: 0};
  const list = [];
  getHistory().forEach(a => (a.wrong || []).forEach(w => {
    const key = a.pid + ':' + w.sec + ':' + w.n;
    if (seen[key]) return;
    seen[key] = true;
    list.push({pid: a.pid, sec: w.sec, n: w.n});
    if (by[w.sec] !== undefined) by[w.sec]++;
  }));
  return {list: list, count: list.length, by: by};
}

function buildDrillPaper(){
  const pool = weakPool();
  const paper = {id: 'drill', fs: [], me: [], ls: [], subject: []};
  const counters = {fs: 0, me: 0, ls: 0, sub: 0};
  const testlets = Object.create(null);

  pool.list.forEach(ref => {
    const src = DATA.find(p => p.id === ref.pid);
    if (!src) return;
    if (ref.sec === 'sub') {
      let found = null, tIdx = -1;
      src.subject.forEach((t, i) => t.questions.forEach(q => {
        if (q.n === ref.n) { found = q; tIdx = i; }
      }));
      if (!found) return;
      const key = ref.pid + ':' + tIdx;
      if (!testlets[key]) {
        const t = src.subject[tIdx];
        testlets[key] = {title: 'Paper ' + ref.pid + ' \u2014 ' + t.title,
                         area: t.area, stimulus: t.stimulus, questions: []};
        paper.subject.push(testlets[key]);
      }
      counters.sub++;
      testlets[key].questions.push(Object.assign({}, found,
        {n: counters.sub, _src: {pid: ref.pid, n: found.n}}));
      return;
    }
    const it = (src[ref.sec] || []).find(x => x.n === ref.n);
    if (!it) return;
    counters[ref.sec]++;
    paper[ref.sec].push(Object.assign({}, it, {
      n: counters[ref.sec],
      note: 'Paper ' + ref.pid + ', question ' + it.n + (it.note ? ' \u2014 ' + it.note : ''),
      _src: {pid: ref.pid, n: it.n}
    }));
  });
  return paper;
}

function startDrill(){
  const paper = buildDrillPaper();
  const total = paper.fs.length + paper.me.length + paper.ls.length +
                paper.subject.reduce((a, t) => a + t.questions.length, 0);
  if (!total) { alert('Nothing to drill yet — submit a paper first.'); return; }

  S = {kind: 'drill', p: paper, pid: 'drill', mode: 'practice', untimed: true,
       tab: 0, submitted: false, review: false, filter: 'all',
       ans: {fs: {}, me: {}, ls: {}, sub: {}},
       flags: {fs: {}, me: {}, ls: {}, sub: {}},
       left: SECT.map(() => 0), spent: SECT.map(() => 0),
       locked: SECT.map(() => false), cur: 0, slot: 0, started: Date.now()};

  for (let i = 0; i < SECT.length; i++) { if (secCount(i)) { S.tab = i; break; } }

  document.getElementById('tabs').classList.remove('hide');
  document.getElementById('foot').classList.remove('hide');
  document.getElementById('timer').classList.add('hide');     // untimed
  const pri = document.getElementById('foot').querySelector('.btn.pri');
  pri.textContent = 'Submit drill';
  pri.onclick = finish;
  render();
  window.scrollTo(0, 0);
}

function srcNote(it){
  return it && it._src ? ` <span class="muted">&mdash; Paper ${it._src.pid}, Q${it._src.n}</span>` : '';
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

function finish(force){
  const answered = SECT.reduce((n,s)=>n+Object.keys(S.ans[s.k]).length,0);
  const total = totalItems();
  if(!force && !S.submitted && answered<total){
    if(!confirm(`You have answered ${answered} of ${total} questions. Submit anyway?\n\n`+
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

function showDrillResults(){
  const r = score();
  const max = totalItems() * 2;
  const pct = max ? Math.round(r.total / max * 100) : 0;
  document.getElementById('app').innerHTML = `<h1>Drill &mdash; Result</h1>
  <div class="card">
    <div class="score"><div class="big">${r.total}<span style="font-size:20px;color:var(--muted)">/${max}</span></div>
      <div><div style="font-weight:700">${pct}% of your weak-area pool</div>
      <div class="muted" style="font-size:13px">Untimed drill &middot; ${totalItems()} questions</div></div></div>
    <h3>By subtest</h3><div class="bars">
      ${SECT.map((sec,i)=>{
        const key = ['fs','me','ls','sub'][i], tot = secCount(i)*2;
        return tot ? bar(sec.name, r[key], tot) : '';
      }).join('')}
    </div>
    <div class="note"><p>Questions you get right here stay in the pool until you get them right
    in a full paper &mdash; the pool is built from submitted papers only.</p></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px">
      <button class="btn pri" onclick="review()">Revise with solutions</button>
      <button class="btn" onclick="startDrill()">Restart drill</button>
      <button class="btn" onclick="showHistory()">Attempt history</button>
      <button class="btn" onclick="goHome()">All papers</button>
    </div>
  </div>`;
  window.scrollTo(0,0);
}

function showResults(){
  if (S.kind === 'drill') { showDrillResults(); return; }
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
      <div class="muted" style="font-size:13px">${Math.round(r.total/2)}% overall &middot;
      ${S.mode==='exam'?'exam':'practice'} mode &middot;
      ${fmtSpent(S.spent.reduce((a,b)=>a+b,0))} spent</div></div></div>
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
    <h3>Time spent</h3>
    <table><thead><tr><th>Subtest</th><th>Allowed</th><th>Spent</th></tr></thead><tbody>
      ${SECT.map((sec,i)=>`<tr><td>${sec.name}</td><td>${sec.mins} min</td>
        <td>${fmtSpent(S.spent[i])}</td></tr>`).join('')}
      <tr><td><strong>Whole paper</strong></td><td>180 min</td>
        <td><strong>${fmtSpent(S.spent.reduce((a,b)=>a+b,0))}</strong></td></tr>
    </tbody></table>
    <h3>Subject Module by testlet</h3><div class="bars">
      ${r.byTestlet.map(t=>bar(t.name.replace(/^Testlet \d+ &mdash; /,'').replace(/^Testlet \d+ — /,''), t.got, t.tot)).join('')}
    </div>
    <div class="note"><p><strong>Weakest area:</strong> ${weakest.name} (${weakest.got}/${weakest.tot}).
    Start your revision there.</p></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px">
      <button class="btn pri" onclick="review()">Revise with solutions</button>
      <button class="btn" onclick="exportCurrent()">Copy summary</button>
      <button class="btn" onclick="showHistory()">Attempt history</button>
      <button class="btn" onclick="retake()">Retake this paper</button>
      <button class="btn" onclick="goHome()">All papers</button>
    </div>
  </div>`;
  document.getElementById('app').innerHTML = h;
  window.scrollTo(0,0);
}

function review(){
  S.filter = S.filter || 'all';
  S.tab = 0;
  for (let i = 0; i < SECT.length; i++) { if (secCount(i)) { S.tab = i; break; } }
  document.getElementById('tabs').classList.remove('hide');
  document.getElementById('foot').classList.remove('hide');
  document.getElementById('foot').querySelector('.btn.pri').textContent = 'Back to result';
  document.getElementById('foot').querySelector('.btn.pri').onclick = showResults;
  render(); window.scrollTo(0,0);
}
function retake(){
  const id = S.p.id;
  clearProgress(id);
  chooseMode(id);
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
  const el = document.getElementById('gmat-data');
  let inline = null;
  try { inline = el ? JSON.parse(el.textContent) : null; } catch(e){ inline = null; }
  if (Array.isArray(inline) && inline.length) {
    boot(inline);
  } else if (typeof fetch === 'function') {
    // dev fallback: src/ served over http. dist/ always has the data inlined above.
    fetch('data.json').then(r=>r.json()).then(boot).catch(()=>{
      document.getElementById('app').innerHTML =
        '<div class="note"><p>Could not load <code>data.json</code>. '+
        'Run <code>sh build.sh</code> and open <code>dist/GMAT_Practice_Suite.html</code>.</p></div>';
    });
  }
}

/*
 * Sign-up form.
 *
 * The same built file is served three ways: from the Cloudflare Worker, from
 * GitHub Pages, and straight off the filesystem. Only the first has an API, so
 * the form asks before it shows itself and simply stays hidden elsewhere —
 * that keeps the offline single-file build honest rather than showing a
 * control that cannot work.
 */
const SIGNUP_FIELDS = ['name', 'email', 'note', 'consent'];

function suEl(id) { return document.getElementById(id); }

function clearSignupErrors() {
  SIGNUP_FIELDS.forEach(f => {
    const el = suEl('su' + f.charAt(0).toUpperCase() + f.slice(1) + 'Err');
    if (el) el.textContent = '';
  });
}

function showSignupErrors(errors) {
  Object.keys(errors || {}).forEach(f => {
    const el = suEl('su' + f.charAt(0).toUpperCase() + f.slice(1) + 'Err');
    if (el) el.textContent = errors[f];
  });
  const first = Object.keys(errors || {})[0];
  const input = first && suEl('su' + first.charAt(0).toUpperCase() + first.slice(1));
  if (input && input.focus) input.focus();
}

async function initSignup() {
  const wrap = suEl('signupWrap');
  if (!wrap || typeof fetch !== 'function') return;
  try {
    const res = await fetch('/api/signup', { method: 'GET' });
    if (!res.ok) return;
    const body = await res.json();
    if (!body || body.ready !== true) return;
    wrap.classList.remove('hide');
    suEl('signupForm').addEventListener('submit', submitSignup);
  } catch (err) {
    /* No API on this host. Leaving the form hidden is the whole point. */
  }
}

async function submitSignup(ev) {
  ev.preventDefault();
  const btn = suEl('suBtn');
  const status = suEl('suStatus');
  clearSignupErrors();
  status.textContent = '';
  status.className = 'sustatus';
  btn.disabled = true;

  const payload = {
    name: suEl('suName').value,
    email: suEl('suEmail').value,
    note: suEl('suNote').value,
    website: suEl('suWebsite').value,
    consent: suEl('suConsent').checked
  };

  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) {
      suEl('signupForm').reset();
      status.textContent = 'Thank you — your details were saved.';
      status.className = 'sustatus good';
    } else if (res.status === 422 && body.errors) {
      showSignupErrors(body.errors);
      status.textContent = '';
    } else {
      status.textContent = body.error || 'That did not go through. Please try again later.';
      status.className = 'sustatus bad';
    }
  } catch (err) {
    status.textContent = 'Could not reach the server. Please try again later.';
    status.className = 'sustatus bad';
  } finally {
    btn.disabled = false;
  }
}
