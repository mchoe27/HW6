const METRIC_DEFS = [
  {key:'productivity',    label:'Productivity',      good:true,
   desc:'Total output per unit of input. Both automation and augmentation raise this — but it tells you nothing about who captures the gains.'},
  {key:'profits',         label:'Company Profit',    good:null,
   desc:'Revenue retained by the firm after costs. High profits aren\'t inherently bad, but watch whether they come at the expense of wages.'},
  {key:'wages',           label:'Worker Wages',      good:true,
   desc:'The share of economic value flowing to workers as pay. Higher means workers are seen as contributors, not just costs to cut.'},
  {key:'jobs',            label:'Jobs Available',    good:true,
   desc:'The volume of roles that still require humans. Automation shrinks this fastest, but even broad training can\'t fully stop the fall.'},
  {key:'bargainingPower', label:'Bargaining Power',  good:true,
   desc:'Workers\' ability to negotiate pay and conditions. Falls when AI makes them replaceable; rises when their AI skills are scarce.'},
  {key:'inequality',      label:'Inequality',        good:false,
   desc:'How unevenly income and wealth are distributed. Lower is better. High inequality signals gains concentrating at the top.'},
  {key:'newTaskCreation', label:'New Task Creation', good:true,
   desc:'The rate at which AI opens entirely new roles. Higher means the economy is expanding, not just substituting old tasks.'},
  {key:'turingTrapRisk',  label:'Turing Trap Risk',  good:false,
   desc:'The risk of a world where humans are sidelined economically and politically. Lower is better. Above 70 triggers the worst ending.'},
];

const EFFECTS = {
  replace: {productivity:8,  profits:10, wages:-5, jobs:-8, bargainingPower:-7, inequality:8,  newTaskCreation:1, turingTrapRisk:9 },
  augment: {productivity:7,  profits:6,  wages:3,  jobs:-3, bargainingPower:1,  inequality:4,  newTaskCreation:5, turingTrapRisk:2 },
  train:   {productivity:5,  profits:-2, wages:5,  jobs:-2, bargainingPower:6,  inequality:-4, newTaskCreation:8, turingTrapRisk:-6},
};

const FORCED_FX = {productivity:6, profits:8, wages:-6, jobs:-7, bargainingPower:-8, inequality:7, newTaskCreation:0, turingTrapRisk:10};

const INTERP = {
  replace: 'AI is raising productivity by substituting for people. Output rises, but workers become less necessary to value creation. Profits concentrate at the top.',
  augment: 'AI is making some workers dramatically more productive, but those without access or training begin to lose leverage. A two-tier workforce is emerging.',
  train:   'Broad training is lifting workers across the board — but it costs the company short-term. Jobs still fall because more productive workers means fewer are needed for the same output. Watch the profit margin.',
  forced:  'Investor pressure has forced an emergency automation round. Training programs are suspended. Wages and jobs take an immediate hit.',
};

const CARD_LABELS = {
  replace: '🤖 Replace',
  augment: '⚡ Augment Skilled',
  train:   '🌱 Train & Augment',
  forced:  '⚠️ Forced Automation',
};

const PROFIT_WARN   = 45;
const PROFIT_CRISIS = 35;
const CRISIS_STREAK = 2;

let state = {};

function freshState() {
  return {
    metrics: {
      productivity:50, profits:50, wages:50, jobs:80,
      bargainingPower:60, inequality:40, newTaskCreation:20, turingTrapRisk:35
    },
    year: 1,
    history: [],
    gameOver: false,
    profitStreak: 0,
    forcedCount: 0,
    endTimer: null,
  };
}

function clamp(v) { return Math.max(0, Math.min(100, v)); }

function applyFx(fx) {
  const deltas = {};
  Object.keys(fx).forEach(k => {
    deltas[k] = fx[k];
    state.metrics[k] = clamp(state.metrics[k] + fx[k]);
  });
  return deltas;
}

// ── BUILD METRIC CARDS ──────────────────────────────────────────────────────

function buildMetricCards() {
  const grid = document.getElementById('metricsGrid');
  grid.innerHTML = '';
  METRIC_DEFS.forEach(m => {
    const goalCls = m.good === true ? 'goal-high' : m.good === false ? 'goal-low' : 'goal-neutral';
    const goalTxt = m.good === true ? '↑ Higher is better' : m.good === false ? '↓ Lower is better' : '~ Informational';
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.innerHTML =
      `<div class="metric-name">
         <span>${m.label}</span>
         <span class="metric-goal ${goalCls}">${goalTxt}</span>
       </div>
       <div class="metric-value" id="mv-${m.key}">—</div>
       <div class="metric-track"><div class="metric-fill" id="mf-${m.key}"></div></div>
       <div class="metric-delta" id="md-${m.key}"></div>
       <div class="metric-desc">${m.desc}</div>`;
    grid.appendChild(card);
  });
}

function metricColor(value, good) {
  if (good === null) return '#4f7fff';
  const t = good ? value / 100 : 1 - value / 100;
  if (t > 0.65) return '#2ec4a0';
  if (t > 0.4)  return '#f5c842';
  return '#e8533a';
}

// ── RENDER UI ───────────────────────────────────────────────────────────────

function renderMetrics(deltas) {
  METRIC_DEFS.forEach(m => {
    const v = state.metrics[m.key];
    document.getElementById('mv-' + m.key).textContent = Math.round(v);
    document.getElementById('mv-' + m.key).style.color = metricColor(v, m.good);
    const fill = document.getElementById('mf-' + m.key);
    fill.style.width = v + '%';
    fill.style.background = metricColor(v, m.good);
    const dEl = document.getElementById('md-' + m.key);
    if (deltas && deltas[m.key] !== undefined) {
      const d = deltas[m.key];
      dEl.textContent = d > 0 ? '+' + d : d === 0 ? '—' : d;
      dEl.className = 'metric-delta ' + (d > 0 ? 'delta-up' : d < 0 ? 'delta-down' : 'delta-neutral');
    } else {
      dEl.textContent = '';
      dEl.className = 'metric-delta';
    }
  });

  const m = state.metrics;
  const workerPct = Math.round(Math.min(90, Math.max(10,
    40 + (m.wages - 50) * 0.3 + (m.bargainingPower - 50) * 0.25 - (m.inequality - 40) * 0.2
  )));
  const dw = document.getElementById('distWorkers');
  dw.style.width = workerPct + '%';
  dw.textContent = workerPct + '% Workers';
  document.getElementById('distOwners').textContent = (100 - workerPct) + '% Owners';

  const pips = document.getElementById('yearPips');
  pips.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const p = document.createElement('div');
    p.className = 'pip' + (i < state.year ? ' done' : i === state.year ? ' current' : '');
    pips.appendChild(p);
  }
  document.getElementById('yearNum').textContent = state.year > 10 ? 10 : state.year;
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (!state.history.length) {
    list.innerHTML = '<span class="history-empty">No decisions yet.</span>';
    return;
  }
  let yr = 0;
  list.innerHTML = state.history.map(h => {
    if (h !== 'forced') yr++;
    const lbl = h === 'forced' ? '&nbsp;&nbsp;↳ Forced' : 'Yr ' + yr;
    return `<span class="history-item hi-${h}">${lbl}: ${CARD_LABELS[h]}</span>`;
  }).join('');
}

function showBanner(html, cls) {
  const el = document.getElementById('eventBanner');
  el.className = 'banner ' + cls;
  el.innerHTML = html;
}

function hideBanner() {
  const el = document.getElementById('eventBanner');
  el.className = 'hidden';
  el.innerHTML = '';
}

// ── CHOOSE ──────────────────────────────────────────────────────────────────

function choose(type) {
  if (state.gameOver || state.year > 10) return;

  const deltas = applyFx(EFFECTS[type]);
  state.history.push(type);

  if (state.metrics.profits < PROFIT_CRISIS) {
    state.profitStreak++;
  } else {
    state.profitStreak = 0;
  }

  const box = document.getElementById('interpBox');
  box.textContent = INTERP[type];
  box.className = 'interp-box ' + type;
  box.classList.add('flash');
  setTimeout(() => box.classList.remove('flash'), 400);

  const willForce = state.profitStreak >= CRISIS_STREAK && state.year < 10;
  if (willForce) {
    state.profitStreak = 0;
    state.forcedCount++;
    const fd = applyFx(FORCED_FX);
    state.history.push('forced');
    Object.keys(fd).forEach(k => { deltas[k] = (deltas[k] || 0) + fd[k]; });
    showBanner(
      `<strong>⚠️ Board Intervention — Forced Automation</strong><br>
       Profits have been critically low for ${CRISIS_STREAK} years in a row. Investors demanded an emergency automation round. Training programs are suspended.`,
      'banner-crisis'
    );
    box.textContent = INTERP['forced'];
    box.className = 'interp-box replace';
  } else if (state.metrics.profits < PROFIT_WARN && state.year < 10) {
    showBanner(
      `<strong>📉 Investor Warning</strong> — Profits are thinning (${Math.round(state.metrics.profits)}).
       If they stay this low, the board may force an automation round.`,
      'banner-warn'
    );
  } else {
    hideBanner();
  }

  renderMetrics(deltas);
  renderHistory();

  if (state.year === 10) {
    state.gameOver = true;
    state.year = 11;
    state.endTimer = setTimeout(showResults, 700);
  } else {
    state.year++;
  }
}

// ── RESULTS ─────────────────────────────────────────────────────────────────

function showResults() {
  document.getElementById('game').classList.add('hidden');
  document.getElementById('results').classList.remove('hidden');

  const m = state.metrics;
  let ending;

  if (state.forcedCount >= 2) {
    ending = {cls:'ending-capture', icon:'🏦', title:'Corporate Capture',
      body:'Good intentions couldn\'t survive the profit imperative. Investors intervened repeatedly, overriding training programs with forced automation rounds. The company\'s social goals were gradually replaced by the same logic they tried to escape.'};
  } else if (m.turingTrapRisk > 70 || m.inequality > 75) {
    ending = {cls:'ending-trap', icon:'⛓️', title:'The Turing Trap',
      body:'AI made the economy more productive, but most workers lost bargaining power. Wealth and decision-making became concentrated among those who controlled the technology. The trap closed slowly — and almost no one noticed until it was too late.'};
  } else if (m.productivity > 70 && m.inequality > 55) {
    ending = {cls:'ending-uneven', icon:'⚖️', title:'Uneven Augmentation',
      body:'AI created new value, but the gains mostly went to workers and firms already positioned to use it. Humans with AI outcompeted humans without AI. A productivity boom masked a widening social fracture.'};
  } else if (m.bargainingPower > 65 && m.inequality < 55) {
    ending = {cls:'ending-broad', icon:'🌱', title:'Broad Augmentation',
      body:'AI increased productivity while keeping humans central to value creation. Workers adapted, new tasks appeared, and the benefits were more broadly shared. The economy grew — and so did human agency within it.'};
  } else {
    ending = {cls:'ending-mixed', icon:'🔀', title:'Mixed Transition',
      body:'AI increased productivity, but the social outcome remained unstable. The economy avoided total replacement, but did not fully solve the problem of unequal access and bargaining power. The future remains contested.'};
  }

  document.getElementById('resultsCard').className = 'results-card ' + ending.cls;
  document.getElementById('resultsIcon').textContent = ending.icon;
  document.getElementById('resultsTitle').textContent = ending.title;
  document.getElementById('resultsBody').textContent = ending.body;

  const stats = [
    {label:'Productivity', val:m.productivity,    good:true},
    {label:'Worker Wages', val:m.wages,            good:true},
    {label:'Inequality',   val:m.inequality,       good:false},
    {label:'Trap Risk',    val:m.turingTrapRisk,   good:false},
  ];
  document.getElementById('resultsStats').innerHTML = stats.map(s =>
    `<div class="rs-card"><div class="rs-val" style="color:${metricColor(s.val, s.good)}">${Math.round(s.val)}</div><div class="rs-name">${s.label}</div></div>`
  ).join('');

  let yr = 0;
  document.getElementById('resultsHistory').innerHTML = state.history.map(h => {
    if (h !== 'forced') yr++;
    const lbl = h === 'forced' ? '&nbsp;&nbsp;↳ Forced' : 'Yr ' + yr;
    return `<span class="history-item hi-${h}">${lbl}: ${CARD_LABELS[h]}</span>`;
  }).join('');
}

// ── NAVIGATION ───────────────────────────────────────────────────────────────

function startGame() {
  document.getElementById('intro').classList.add('hidden');
  document.getElementById('gameShell').classList.remove('hidden');
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function restart() {
  if (state.endTimer) clearTimeout(state.endTimer);
  state = freshState();

  document.getElementById('results').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');

  hideBanner();
  const box = document.getElementById('interpBox');
  box.textContent = 'Make your first decision above to begin the simulation.';
  box.className = 'interp-box';

  buildMetricCards();
  renderMetrics(null);
  renderHistory();

  document.getElementById('gameShell').classList.add('hidden');
  document.getElementById('intro').classList.remove('hidden');
  window.scrollTo({top: 0, behavior: 'smooth'});
}

// ── INIT ─────────────────────────────────────────────────────────────────────

state = freshState();
buildMetricCards();
renderMetrics(null);
renderHistory();
