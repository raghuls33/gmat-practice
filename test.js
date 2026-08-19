#!/usr/bin/env node
/*
 * dMAT Practice Suite — test suite.
 *
 * Plain node, no dependencies, no test framework. It builds a minimal DOM shim,
 * evaluates src/app.js inside it, and drives the real scoring and rendering code
 * rather than a copy of it, so the assertions below are about the shipped app.
 *
 *   node test.js        (or: npm test)
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');

/* ------------------------------------------------------------------ runner */
let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name, err });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) +
      ', got ' + JSON.stringify(actual));
  }
}

/* -------------------------------------------------------------- DOM shim */
/* Just enough of the DOM for app.js to run headless. Elements accept whatever
   the app sets on them and report empty collections back. */
function makeElement(id) {
  const el = {
    id: id || '',
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    tabIndex: 0,
    title: '',
    type: 'text',
    tagName: 'DIV',
    style: {},
    dataset: {},
    _classes: new Set(),
    _attrs: {}
  };
  el.classList = {
    add: c => el._classes.add(c),
    remove: c => el._classes.delete(c),
    contains: c => el._classes.has(c),
    toggle: (c, on) => {
      const want = on === undefined ? !el._classes.has(c) : !!on;
      if (want) el._classes.add(c); else el._classes.delete(c);
      return want;
    }
  };
  el.setAttribute = (k, v) => { el._attrs[k] = String(v); };
  el.getAttribute = k => (k in el._attrs ? el._attrs[k] : null);
  el.removeAttribute = k => { delete el._attrs[k]; };
  el.appendChild = () => {};
  el.removeChild = () => {};
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  el.focus = () => {};
  el.blur = () => {};
  el.select = () => {};
  el.scrollIntoView = () => {};
  el.click = () => {};
  el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
  el.querySelector = () => makeElement();
  el.querySelectorAll = () => [];
  return el;
}

function makeDom(storage) {
  const byId = Object.create(null);
  const document = {
    activeElement: null,
    visibilityState: 'visible',
    body: makeElement('body'),
    getElementById(id) {
      if (!byId[id]) byId[id] = makeElement(id);
      return byId[id];
    },
    createElement: tag => {
      const e = makeElement();
      e.tagName = String(tag).toUpperCase();
      return e;
    },
    querySelector: () => makeElement(),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    execCommand: () => true
  };

  const win = {
    innerWidth: 1280,
    innerHeight: 800,
    scrollY: 0,
    scrollTo: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: storage
  };
  win.window = win;
  win.document = document;
  win.navigator = { clipboard: null };
  win.alert = () => {};
  win.confirm = () => true;
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;
  win.setInterval = () => 0;      // no real clock in tests
  win.clearInterval = () => {};
  win.console = { log: () => {}, warn: () => {}, error: () => {} };
  return win;
}

function memStorage() {
  const m = Object.create(null);
  return {
    get length() { return Object.keys(m).length; },
    key: i => Object.keys(m)[i] === undefined ? null : Object.keys(m)[i],
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    clear: () => { Object.keys(m).forEach(k => delete m[k]); }
  };
}

const APP_SRC = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
/* app.js declares S with `let`, which is not a property of the global object.
   This epilogue is appended only for the tests; the shipped file is untouched. */
const EPILOGUE = '\n;globalThis.__t = { getS: () => S, setS: v => { S = v; }, SECT, Store,' +
  ' getSET: () => SET, getDATA: () => DATA };\n';

function bootApp(opts) {
  opts = opts || {};
  const sandbox = makeDom(opts.storage === undefined ? memStorage() : opts.storage);
  vm.createContext(sandbox);
  const consoleCalls = [];
  sandbox.console = {
    log: (...a) => consoleCalls.push(['log', a]),
    warn: (...a) => consoleCalls.push(['warn', a]),
    error: (...a) => consoleCalls.push(['error', a])
  };
  vm.runInContext(APP_SRC + EPILOGUE, sandbox, { filename: 'app.js' });
  sandbox.boot(DATA);
  sandbox.__consoleCalls = consoleCalls;
  return sandbox;
}

/* ------------------------------------------------------------------- data */
const DATA_TEXT = fs.readFileSync(path.join(SRC, 'data.json'), 'utf8');
const DATA = JSON.parse(DATA_TEXT);

const SUBTEST_MARKS = { fs: 40, me: 40, ls: 40, sub: 80 };
const PAPER_TOTAL = 200;

function subjectQuestions(p) {
  return p.subject.reduce((a, t) => a.concat(t.questions), []);
}

/* Fill a session's answers. `mode` is 'correct' or 'wrong'. */
function fillAnswers(app, mode) {
  const S = app.__t.getS();
  const p = S.p;
  const correct = mode === 'correct';

  p.fs.forEach(it => {
    const other = a => [1, 2, 3].find(x => x !== a);
    S.ans.fs[it.n] = correct
      ? { a1: it.a1, a2: it.a2 }
      : { a1: other(it.a1), a2: other(it.a2) };
  });

  p.me.forEach(it => {
    const o = {};
    it.vars.forEach(v => {
      const sol = it.sol[v];
      o[v] = String(correct ? sol : (sol === 20 ? 19 : sol + 1));
    });
    S.ans.me[it.n] = o;
  });

  p.ls.forEach(it => {
    const letters = 'ABCDE'.split('');
    S.ans.ls[it.n] = correct ? it.ans : letters.find(L => L !== it.ans);
  });

  subjectQuestions(p).forEach(q => {
    S.ans.sub[q.n] = correct ? q.ans : (q.ans + 1) % 4;
  });
}

/* ============================ 1. mark scheme ============================ */
DATA.forEach(p => {
  check('paper ' + p.id + ' totals exactly ' + PAPER_TOTAL + ' marks', () => {
    const core = (p.fs.length + p.me.length + p.ls.length) * 2;
    const sub = subjectQuestions(p).length * 2;
    eq(p.fs.length * 2, SUBTEST_MARKS.fs, 'figure sequences');
    eq(p.me.length * 2, SUBTEST_MARKS.me, 'mathematical equations');
    eq(p.ls.length * 2, SUBTEST_MARKS.ls, 'latin squares');
    eq(sub, SUBTEST_MARKS.sub, 'subject module');
    eq(core, 120, 'core module');
    eq(core + sub, PAPER_TOTAL, 'paper total');
  });
});

check('there are exactly 5 papers with unique ids', () => {
  eq(DATA.length, 5);
  eq(new Set(DATA.map(p => p.id)).size, 5);
});

/* ===================== 2 & 3. all-correct / all-wrong ==================== */
DATA.forEach(p => {
  check('paper ' + p.id + ': all-correct scores ' + PAPER_TOTAL, () => {
    const app = bootApp();
    app.startPaper(p.id, 'practice');
    fillAnswers(app, 'correct');
    const r = app.score();
    eq(r.fs, SUBTEST_MARKS.fs, 'fs');
    eq(r.me, SUBTEST_MARKS.me, 'me');
    eq(r.ls, SUBTEST_MARKS.ls, 'ls');
    eq(r.sub, SUBTEST_MARKS.sub, 'sub');
    eq(r.core, 120, 'core');
    eq(r.total, PAPER_TOTAL, 'total');
    eq(r.wrong.length, 0, 'wrong list');
  });

  check('paper ' + p.id + ': all-wrong scores 0', () => {
    const app = bootApp();
    app.startPaper(p.id, 'practice');
    fillAnswers(app, 'wrong');
    const r = app.score();
    eq(r.fs, 0, 'fs');
    eq(r.me, 0, 'me');
    eq(r.ls, 0, 'ls');
    eq(r.sub, 0, 'sub');
    eq(r.total, 0, 'total');
    eq(r.wrong.length, 100, 'every question recorded wrong');
  });
});

check('an unanswered paper scores 0', () => {
  const app = bootApp();
  app.startPaper(1, 'practice');
  eq(app.score().total, 0);
});

check('figure sequences award 1 mark for one correct image', () => {
  const app = bootApp();
  app.startPaper(1, 'practice');
  const S = app.__t.getS();
  const it = S.p.fs[0];
  S.ans.fs[it.n] = { a1: it.a1, a2: [1, 2, 3].find(x => x !== it.a2) };
  eq(app.score().fs, 1);
});

check('equation systems award no partial credit', () => {
  const app = bootApp();
  app.startPaper(1, 'practice');
  const S = app.__t.getS();
  const it = S.p.me.find(x => x.vars.length > 1);
  assert(it, 'expected a system with more than one variable');
  const o = {};
  it.vars.forEach((v, i) => { o[v] = String(i === 0 ? it.sol[v] : it.sol[v] + 1); });
  S.ans.me[it.n] = o;
  eq(app.score().me, 0);
});

/* ======================== 4. subject questions ========================== */
DATA.forEach(p => {
  check('paper ' + p.id + ': every subject question has 4 options and ans in 0..3', () => {
    const qs = subjectQuestions(p);
    eq(qs.length, 40, 'question count');
    qs.forEach(q => {
      assert(Array.isArray(q.options), 'Q' + q.n + ' options must be an array');
      eq(q.options.length, 4, 'Q' + q.n + ' option count');
      q.options.forEach((o, i) => {
        assert(typeof o === 'string' && o.trim() !== '',
          'Q' + q.n + ' option ' + i + ' must be a non-empty string');
      });
      assert(Number.isInteger(q.ans) && q.ans >= 0 && q.ans <= 3,
        'Q' + q.n + ' ans out of range: ' + q.ans);
      assert(typeof q.stem === 'string' && q.stem.trim() !== '', 'Q' + q.n + ' needs a stem');
      assert(typeof q.expl === 'string' && q.expl.trim() !== '', 'Q' + q.n + ' needs an explanation');
    });
    eq(new Set(qs.map(q => q.n)).size, 40, 'question numbers must be unique');
  });
});

/* ==================== 5. figure-sequence option triples ================== */
DATA.forEach(p => {
  check('paper ' + p.id + ': each figure-sequence item has three distinct options per image', () => {
    p.fs.forEach(it => {
      eq(it.given.length, 4, 'item ' + it.n + ' given matrices');
      ['o1', 'o2'].forEach(key => {
        const opts = it[key];
        eq(opts.length, 3, 'item ' + it.n + ' ' + key + ' option count');
        const seen = opts.map(o => JSON.stringify(o));
        eq(new Set(seen).size, 3,
          'item ' + it.n + ' ' + key + ' has duplicate options');
      });
      assert([1, 2, 3].includes(it.a1), 'item ' + it.n + ' a1 out of range');
      assert([1, 2, 3].includes(it.a2), 'item ' + it.n + ' a2 out of range');
    });
  });
});

/* ========================= 6. Latin squares ============================= */
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

DATA.forEach(p => {
  check('paper ' + p.id + ': every Latin square answer matches its completed grid', () => {
    p.ls.forEach(it => {
      const [tr, tc] = it.t;
      eq(it.full.length, 5, 'item ' + it.n + ' row count');
      it.full.forEach(row => eq(row.length, 5, 'item ' + it.n + ' column count'));

      eq(it.full[tr][tc], it.ans,
        'item ' + it.n + ': stated answer does not match the completed grid');

      for (let r = 0; r < 5; r++) {
        eq(new Set(it.full[r]).size, 5, 'item ' + it.n + ' row ' + (r + 1) + ' repeats a letter');
        it.full[r].forEach(v => assert(LETTERS.includes(v),
          'item ' + it.n + ' contains an unexpected letter: ' + v));
      }
      for (let c = 0; c < 5; c++) {
        eq(new Set(it.full.map(row => row[c])).size, 5,
          'item ' + it.n + ' column ' + (c + 1) + ' repeats a letter');
      }
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (it.grid[r][c]) {
            eq(it.grid[r][c], it.full[r][c],
              'item ' + it.n + ' clue at ' + (r + 1) + ',' + (c + 1) + ' contradicts the solution');
          }
        }
      }
      eq(it.grid[tr][tc], '', 'item ' + it.n + ' target cell must start empty');
    });
  });
});

/* ===================== extra: storage degrades safely ==================== */
check('a localStorage that throws degrades to memory with no console output', () => {
  const hostile = {
    get length() { throw new Error('nope'); },
    key() { throw new Error('nope'); },
    getItem() { throw new Error('nope'); },
    setItem() { throw new Error('nope'); },
    removeItem() { throw new Error('nope'); },
    clear() { throw new Error('nope'); }
  };
  const app = bootApp({ storage: hostile });
  eq(app.__t.Store.persistent(), false, 'storage must report itself unavailable');
  app.startPaper(1, 'practice');
  app.pick('ls', 1, 'A');
  app.saveProgress(true);
  app.toggleFlag('ls', 1);
  app.finish(true);
  assert(app.getHistory().length >= 1, 'history must still work in memory');
  eq(app.__consoleCalls.length, 0, 'nothing may be logged to the console');
});

check('a localStorage that fills up mid-session degrades quietly', () => {
  /* Passes the probe, then starts throwing the way a full quota does. This is
     the path that actually runs demote(), which the always-hostile store above
     never reaches. */
  const inner = memStorage();
  let live = true;
  const flaky = {
    get length() { if (!live) throw new Error('QuotaExceededError'); return inner.length; },
    key: i => { if (!live) throw new Error('QuotaExceededError'); return inner.key(i); },
    getItem: k => { if (!live) throw new Error('QuotaExceededError'); return inner.getItem(k); },
    setItem: (k, v) => { if (!live) throw new Error('QuotaExceededError'); inner.setItem(k, v); },
    removeItem: k => { if (!live) throw new Error('QuotaExceededError'); inner.removeItem(k); },
    clear: () => { if (!live) throw new Error('QuotaExceededError'); inner.clear(); }
  };
  const app = bootApp({ storage: flaky });
  eq(app.__t.Store.persistent(), true, 'should start out persistent');
  app.startPaper(5, 'practice');
  app.pick('ls', 2, 'D');
  app.saveProgress(true);

  live = false;                       // the disk fills up
  app.pick('ls', 3, 'E');
  app.saveProgress(true);
  app.toggleFlag('ls', 3);
  app.finish(true);

  eq(app.__t.Store.persistent(), false, 'should have demoted to memory');
  const S = app.__t.getS();
  eq(S.ans.ls[3], 'E', 'answers taken after the failure must survive in memory');
  assert(app.getHistory().length >= 1, 'history must still be readable from memory');
  eq(app.__consoleCalls.length, 0, 'nothing may be logged to the console');
});

check('a missing localStorage entirely is survivable', () => {
  const app = bootApp({ storage: undefined });
  app.startPaper(2, 'practice');
  app.saveProgress(true);
  eq(app.__consoleCalls.length, 0);
});

check('a corrupt saved snapshot does not wedge the app', () => {
  const store = memStorage();
  const app = bootApp({ storage: store });
  store.setItem('dmat.v1.progress.1', '{not json at all');
  app.goHome();
  store.setItem('dmat.v1.progress.1', JSON.stringify({ pid: 1, tab: 99, ans: null, left: 'nope' }));
  app.resumePaper(1);
  const S = app.__t.getS();
  eq(S.tab, 0, 'out-of-range tab falls back to 0');
  eq(S.left.length, 4, 'bad clock falls back to the default');
  eq(app.__consoleCalls.length, 0);
});

/* ======================= extra: persistence round-trip =================== */
check('progress survives a save and reload', () => {
  const store = memStorage();
  const a = bootApp({ storage: store });
  a.startPaper(3, 'exam');
  a.pick('sub', 5, 2);
  a.pick('ls', 8, 'C');
  a.toggleFlag('sub', 5);
  a.saveProgress(true);

  const b = bootApp({ storage: store });
  b.resumePaper(3);
  const S = b.__t.getS();
  eq(S.pid, 3);
  eq(S.mode, 'exam');
  eq(S.ans.sub[5], 2);
  eq(S.ans.ls[8], 'C');
  eq(S.flags.sub[5], true);
});

check('submitting records an attempt and clears the in-progress save', () => {
  const store = memStorage();
  const app = bootApp({ storage: store });
  app.startPaper(4, 'practice');
  fillAnswers(app, 'correct');
  app.finish(true);
  const hist = app.getHistory();
  eq(hist.length, 1);
  eq(hist[0].pid, 4);
  eq(hist[0].total, PAPER_TOTAL);
  eq(store.getItem('dmat.v1.progress.4'), null, 'progress must be cleared on submit');
});

/* ========================= extra: DATA is read-only ===================== */
check('building a drill does not mutate DATA', () => {
  const before = JSON.stringify(DATA);
  const app = bootApp();
  app.startPaper(1, 'practice');
  fillAnswers(app, 'wrong');
  app.finish(true);
  app.startDrill();
  const S = app.__t.getS();
  eq(S.kind, 'drill');
  assert(S.p.fs.length > 0, 'drill should contain the wrong figure sequences');
  eq(JSON.stringify(app.__t.getDATA()), before, 'DATA was mutated');
  eq(JSON.stringify(DATA), before, 'DATA was mutated');
});

check('a drill renumbers items from 1 and records their source', () => {
  const app = bootApp();
  app.startPaper(1, 'practice');
  fillAnswers(app, 'wrong');
  app.finish(true);
  app.startDrill();
  const S = app.__t.getS();
  eq(S.p.fs.map(i => i.n).join(','), S.p.fs.map((_, i) => i + 1).join(','));
  S.p.fs.forEach(it => {
    assert(it._src && it._src.pid === 1, 'each drilled item must name its source paper');
  });
  const subNums = S.p.subject.reduce((a, t) => a.concat(t.questions.map(q => q.n)), []);
  eq(new Set(subNums).size, subNums.length, 'drilled subject numbers must be unique');
  S.p.subject.forEach(t => assert(t.stimulus, 'a drilled testlet must keep its stimulus'));
});

check('a drill scores full marks when answered correctly', () => {
  const app = bootApp();
  app.startPaper(2, 'practice');
  fillAnswers(app, 'wrong');
  app.finish(true);
  app.startDrill();
  fillAnswers(app, 'correct');
  eq(app.score().total, app.totalItems() * 2);
});

/* ===================== extra: renderers produce output =================== */
check('every subtest renders without throwing', () => {
  const app = bootApp();
  app.startPaper(1, 'practice');
  const S = app.__t.getS();
  const lens = [];
  for (let t = 0; t < 4; t++) {
    S.tab = t;
    app.render();
    lens.push(app.document.getElementById('app').innerHTML.length);
  }
  lens.forEach((n, i) => assert(n > 500, 'subtest ' + i + ' rendered only ' + n + ' chars'));
  eq(app.__consoleCalls.length, 0);
});

check('results and review render for a submitted paper', () => {
  const app = bootApp();
  app.startPaper(1, 'practice');
  fillAnswers(app, 'wrong');
  app.finish(true);
  assert(app.document.getElementById('app').innerHTML.includes('Result'), 'results screen');
  app.review();
  app.setFilter('wrong');
  const S = app.__t.getS();
  eq(S.filter, 'wrong');
  app.setFilter('flagged');
  app.setFilter('all');
  eq(app.__consoleCalls.length, 0);
});

check('the history view renders charts from recorded attempts', () => {
  const store = memStorage();
  const app = bootApp({ storage: store });
  app.startPaper(1, 'practice');
  fillAnswers(app, 'correct');
  app.finish(true);
  app.startPaper(2, 'practice');
  fillAnswers(app, 'wrong');
  app.finish(true);
  app.showHistory();
  const html = app.document.getElementById('app').innerHTML;
  assert(html.includes('<svg'), 'history must contain inline SVG');
  assert(html.includes('polyline'), 'history must plot a line');
  assert(html.includes('Total score over time'), 'total chart title');
  eq(app.__consoleCalls.length, 0);
});

/* ================ extra: matrix descriptions and colour tags ============= */
check('every matrix description names each figure it draws', () => {
  const app = bootApp();
  let checked = 0;
  DATA.forEach(p => p.fs.forEach(it => {
    [].concat(it.given, it.o1, it.o2).forEach(m => {
      const d = app.matDesc(m);
      assert(d.startsWith('5 by 5 grid'), 'unexpected description: ' + d);
      assert(d.indexOf('undefined') < 0, 'description has a hole: ' + d);
      m.forEach(sym => {
        assert(d.includes('row ' + (sym.r + 1)), 'missing row in: ' + d);
      });
      checked++;
    });
  }));
  assert(checked === 5 * 20 * 10, 'expected 1000 matrices, described ' + checked);
});

check('colour-blind mode adds a letter tag to every figure', () => {
  const app = bootApp();
  const sample = DATA[0].fs.find(it => it.given.some(m => m.some(s => s.k)));
  assert(sample, 'expected at least one coloured figure in paper 1');
  const m = sample.given.find(mm => mm.some(s => s.k));
  app.__t.getSET().cb = false;
  const off = app.matSvg(m, 15);
  app.__t.getSET().cb = true;
  const on = app.matSvg(m, 15);
  app.__t.getSET().cb = false;
  assert(on.length > off.length, 'tags should add markup');
  eq((on.match(/<text/g) || []).length, m.length, 'one tag per figure');
});

/* ===================== extra: build output integrity ==================== */
check('src/data.json is valid JSON and parses to 5 papers', () => {
  eq(JSON.parse(DATA_TEXT).length, 5);
});

check('the built file embeds src/data.json byte for byte', () => {
  const built = path.join(ROOT, 'dist', 'dMAT_Practice_Suite.html');
  if (!fs.existsSync(built)) {
    // build.sh has not run yet; nothing to compare against.
    return;
  }
  const html = fs.readFileSync(built, 'utf8');
  const open = '<script id="dmat-data" type="application/json">';
  const i = html.indexOf(open);
  assert(i >= 0, 'built file has no data block');
  const j = html.indexOf('</script>', i);
  const embedded = html.slice(i + open.length, j);
  eq(embedded, DATA_TEXT, 'the embedded DATA differs from src/data.json');
  assert(!/<(link|script)[^>]+(src|href)=["']?https?:/i.test(html),
    'the built file must not reference anything external');
});

/* ------------------------------------------------------------------ report */
const total = passed + failures.length;
if (failures.length) {
  console.error('\n' + failures.length + ' of ' + total + ' checks FAILED\n');
  failures.forEach(f => {
    console.error('  x ' + f.name);
    console.error('    ' + f.err.message);
  });
  console.error('');
  process.exit(1);
}
console.log('all ' + total + ' checks passed');
