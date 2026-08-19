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
function newSession(pid){
  const p = DATA.find(x=>x.id===pid);
  return {p:p, tab:0, submitted:false, review:false,
          ans:{fs:{}, me:{}, ls:{}, sub:{}},
          left:SECT.map(s=>s.mins*60), started:Date.now()};
}
function esc(t){return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');}

/* ================= home ================= */
function goHome(){
  clearInterval(tick); tick=null;
  document.getElementById('tabs').classList.add('hide');
  document.getElementById('foot').classList.add('hide');
  document.getElementById('timer').classList.add('hide');
  const cards = DATA.map(p=>{
    const off = p.id<=2 ? '<span class="tag off">contains official samples</span>' : '';
    return `<div class="pcard" onclick="startPaper(${p.id})">
      <h3>Paper ${p.id}</h3>
      <div class="st">100 questions &middot; 200 marks &middot; 180 min</div>
      <div style="margin-top:9px">${off}</div></div>`;
  }).join('');
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
   <p><strong>Note:</strong> progress lives in this browser tab only. Reloading clears it, so finish a
   paper in one sitting.</p>
  </div>
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
  pass mark; these bands are a practice target only.</p>`;
  window.scrollTo(0,0);
}

function startPaper(pid){
  S = newSession(pid);
  document.getElementById('tabs').classList.remove('hide');
  document.getElementById('foot').classList.remove('hide');
  document.getElementById('timer').classList.remove('hide');
  startTimer();
  render();
}

/* ================= timer ================= */
function startTimer(){
  clearInterval(tick);
  tick = setInterval(()=>{
    if(!S || S.submitted) return;
    if(S.left[S.tab] > 0) S.left[S.tab]--;
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
function setTab(i){ S.tab=i; render(); window.scrollTo(0,0); }
function nextTab(){ if(S.tab<3) setTab(S.tab+1); }
function prevTab(){ if(S.tab>0) setTab(S.tab-1); }

/* ================= answering ================= */
function pick(sec, key, val){
  if(S.submitted) return;
  S.ans[sec][key] = val;
  render(true);
}
function setEq(i, v, el){
  if(S.submitted) return;
  const cur = S.ans.me[i] || {};
  cur[v] = el.value.trim();
  const filled = Object.values(cur).filter(x=>x!=='').length;
  if(filled===0) delete S.ans.me[i]; else S.ans.me[i]=cur;
  paintFoot(); paintTabs();
}
function pickFs(i, which, opt){
  if(S.submitted) return;
  const cur = S.ans.fs[i] || {};
  cur[which] = opt;
  S.ans.fs[i] = cur;
  render(true);
}

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
      return `<div class="fscol"><h4>${which==='a1'?'Image 1 (Matrix 5)':'Image 2 (Matrix 6)'}</h4>
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
    h += `<div class="card"><div class="qh"><span class="qn">${it.n}.</span>
      <span><span class="tag ${it.lvl}">${it.lvl}</span>${note}</span></div>
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
    h += `<div class="card"><div class="qh"><span class="qn">${it.n}.</span>
      <span><span class="tag ${it.lvl}">${it.lvl}</span>${note}</span></div>
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
    h += `<div class="card"><div class="qh"><span class="qn">${it.n}.</span>
      <span><span class="tag ${it.lvl}">${it.lvl}</span>${note}</span></div>
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
      h += `<div class="q"><div class="qh"><span class="qn">${q.n}.</span><div>${q.stem}</div></div>
        <div class="opts">${opts}</div>${solved}</div>`;
    });
    h += '</div>';
  });
  return h;
}

/* ================= scoring ================= */
function score(){
  const p = S.p, out = {fs:0, me:0, ls:0, sub:0, byLvl:{low:[0,0],medium:[0,0],high:[0,0]}, byTestlet:[]};
  p.fs.forEach(it=>{
    const a = S.ans.fs[it.n]||{};
    let m = 0;
    if(a.a1===it.a1) m++;
    if(a.a2===it.a2) m++;
    out.fs += m; out.byLvl[it.lvl][0]+=m; out.byLvl[it.lvl][1]+=2;
  });
  p.me.forEach(it=>{
    const a = S.ans.me[it.n]||{};
    const ok = it.vars.every(v=>String(a[v])===String(it.sol[v]));
    const m = ok?2:0;
    out.me += m; out.byLvl[it.lvl][0]+=m; out.byLvl[it.lvl][1]+=2;
  });
  p.ls.forEach(it=>{
    const m = (S.ans.ls[it.n]===it.ans)?2:0;
    out.ls += m; out.byLvl[it.lvl][0]+=m; out.byLvl[it.lvl][1]+=2;
  });
  p.subject.forEach(t=>{
    let got=0, tot=0;
    t.questions.forEach(q=>{ tot+=2; if(S.ans.sub[q.n]===q.ans){got+=2; out.sub+=2;} });
    out.byTestlet.push({name:t.title, got:got, tot:tot});
  });
  out.core = out.fs+out.me+out.ls;
  out.total = out.core+out.sub;
  return out;
}

function finish(){
  const answered = SECT.reduce((n,s)=>n+Object.keys(S.ans[s.k]).length,0);
  if(!S.submitted && answered<100){
    if(!confirm(`You have answered ${answered} of 100 questions. Submit anyway?\n\n`+
      `There is no negative marking, so unanswered questions are a pure loss.`)) return;
  }
  S.submitted = true;
  clearInterval(tick); tick=null;
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
