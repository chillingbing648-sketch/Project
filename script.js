/* ================================================================
   WALL·E — AI Mental Wellness Companion  v3.0
   script.js — Full modular rewrite
   ----------------------------------------------------------------
   Modules:
     AppController   — Auth, navigation, init
     MoodSystem      — Mood logging & rendering
     Analytics       — Dashboard stats, charts, wellness score
     AICompanion     — Chat, personalities, avatar
     JournalSystem   — Journal CRUD
     HabitSystem     — Habits & streaks
     BoostSystem     — Gratitude, meditation, affirmations
     AnalyticsSystem — Insights, recommendations, monthly report
================================================================ */

'use strict';

/* ══════════════════════════════════════════════════════════════
   GLOBAL STATE & CONSTANTS
══════════════════════════════════════════════════════════════ */
const KEYS = {
  USERS:       'walle_users',
  CURRENT:     'walle_current_user',
  MOODS:       'walle_moods',
  JOURNAL:     'walle_journal',
  HABITS:      'walle_habits',
  HABIT_LOG:   'walle_habit_log',
  CHAT:        'walle_chat',
  PERSONALITY: 'walle_personality',
  GRATITUDE:   'walle_gratitude',
};

const MOOD_EMOJI = { Happy:'😊', Calm:'😌', Neutral:'😐', Stressed:'😰', Sad:'😢' };
const MOOD_SCORE = { Happy:5, Calm:4, Neutral:3, Stressed:2, Sad:1 };

let _currentUser = null;
let _selectedMood = null;

/* Chart instances */
let _chartMoodTrend = null;
let _chartMoodDist  = null;
let _chartHabit     = null;
let _chartRptMood   = null;
let _chartRptHabit  = null;

/* Breathing exercise state */
let _breathActive = false;
let _breathTimer  = null;
let _breathPhase  = 0;
let _breathCycles = 0;
const BREATH_MAX  = 4;
const BREATH_PHASES = [
  { label:'Inhale',  cls:'inhale', ms:4000, hint:'Breathe in slowly through your nose… (4 seconds)' },
  { label:'Hold',    cls:'hold',   ms:7000, hint:'Hold your breath gently… (7 seconds)' },
  { label:'Exhale',  cls:'exhale', ms:8000, hint:'Breathe out completely through your mouth… (8 seconds)' },
];

/* Meditation state */
let _medActive    = false;
let _medInterval  = null;
let _medSecsLeft  = 180;
let _medSecsTotal = 180;
let _medPhaseIdx  = 0;
let _medPhaseTick = 0;
const MED_PHASES = [
  { label:'Breathe in…',  secs:4 }, { label:'Hold gently…', secs:4 },
  { label:'Breathe out…', secs:6 }, { label:'Rest…',        secs:2 },
];

/* Report state */
let _reportOffset    = 0;
let _bigAffCat       = 'all';
let _bigAffLastIdx   = -1;
let _insAffLastIdx   = -1;
let _editJournalId   = null;

/* ── helpers ── */
function _$  (id)   { return document.getElementById(id); }
function _qs (sel)  { return document.querySelector(sel); }
function _qsa(sel)  { return document.querySelectorAll(sel); }
function _setText(id, val) { const e=_$(id); if(e) e.textContent = val; }
function _setWidth(id, pct){ const e=_$(id); if(e) e.style.width = Math.min(pct,100)+'%'; }
function _esc(str)  { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _dateKey(d){ return d.toISOString().slice(0,10); }
function _todayKey(){ return _dateKey(new Date()); }
function _rand(arr) { return arr[Math.floor(Math.random()*arr.length)]; }


/* ══════════════════════════════════════════════════════════════
   APP CONTROLLER  — Auth, routing, navigation
══════════════════════════════════════════════════════════════ */
const AppController = {

  /* ── Auth helpers ─────────────────────────────────────────── */
  getUsers()       { return JSON.parse(localStorage.getItem(KEYS.USERS) || '{}'); },
  saveUsers(u)     { localStorage.setItem(KEYS.USERS, JSON.stringify(u)); },

  toggleAuth() {
    _$('login-form').classList.toggle('active');
    _$('signup-form').classList.toggle('active');
    _$('login-error').textContent = '';
    _$('signup-error').textContent = '';
  },

  login() {
    const user = _$('login-username').value.trim();
    const pass = _$('login-password').value;
    const err  = _$('login-error');
    if (!user||!pass) { err.textContent='Please fill in all fields.'; return; }
    const users = this.getUsers();
    const rec   = users[user.toLowerCase()];
    if (!rec || rec.password !== btoa(pass)) { err.textContent='Invalid username or password.'; return; }
    _currentUser = { username: user.toLowerCase(), name: rec.name };
    localStorage.setItem(KEYS.CURRENT, JSON.stringify(_currentUser));
    this._launch();
  },

  signup() {
    const name = _$('signup-name').value.trim();
    const user = _$('signup-username').value.trim();
    const pass = _$('signup-password').value;
    const err  = _$('signup-error');
    if (!name||!user||!pass) { err.textContent='Please fill in all fields.'; return; }
    if (user.length<3) { err.textContent='Username must be at least 3 characters.'; return; }
    if (pass.length<4) { err.textContent='Password must be at least 4 characters.'; return; }
    const users = this.getUsers();
    if (users[user.toLowerCase()]) { err.textContent='Username already taken.'; return; }
    users[user.toLowerCase()] = { name, password: btoa(pass) };
    this.saveUsers(users);
    _currentUser = { username: user.toLowerCase(), name };
    localStorage.setItem(KEYS.CURRENT, JSON.stringify(_currentUser));
    this._launch();
  },

  logout() {
    localStorage.removeItem(KEYS.CURRENT);
    _currentUser = null;
    [_chartMoodTrend,_chartMoodDist,_chartHabit,_chartRptMood,_chartRptHabit]
      .forEach(c=>{ if(c){c.destroy();} });
    _chartMoodTrend=_chartMoodDist=_chartHabit=_chartRptMood=_chartRptHabit=null;
    _$('app').classList.add('hidden');
    _$('auth-screen').style.display='flex';
    _$('login-username').value='';
    _$('login-password').value='';
    _$('login-error').textContent='';
    if(!_$('login-form').classList.contains('active')) this.toggleAuth();
  },

  _launch() {
    _$('auth-screen').style.display='none';
    _$('app').classList.remove('hidden');

    const first = _currentUser.name.split(' ')[0];
    _setText('sidebar-username', _currentUser.name);
    ['user-avatar','topbar-avatar'].forEach(id => _setText(id, first[0].toUpperCase()));

    /* Set topbar date */
    _setText('topbar-date', new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}));

    /* Init all modules */
    this.navigate('dashboard');
    AICompanion.init();
    AICompanion.initPersonality();
    MoodSystem.render();
    HabitSystem.renderList();
    HabitSystem.renderStreaks();
    JournalSystem.renderList();
    AnalyticsSystem.renderRecommendations();
    AnalyticsSystem.renderAffirmation();
    BoostSystem.init();
    Analytics.updateScore();
  },

  /* ── Navigation ────────────────────────────────────────────── */
  navigate(sectionId) {
    _qsa('.page-section').forEach(s=>s.classList.remove('active'));
    _qsa('.nav-link').forEach(n=>n.classList.remove('active'));

    const sec = _$('section-'+sectionId);
    const nav = _qs(`[data-section="${sectionId}"]`);
    if (sec) sec.classList.add('active');
    if (nav) nav.classList.add('active');

    const titles = {
      dashboard:'Dashboard',
       mood:'Mood Tracker',
        chat:'AI Companion',
         journal:'Wellness Journal',
       habits:'Habit Tracker',
       moodboost:'Mood Boost',
       recommendations:'Insights',
        report:'Wellness Report',
    };
    _setText('topbar-title', titles[sectionId] || 'WALL·E');

    if (sectionId==='dashboard') {
      Analytics.updateStats();
      Analytics.updateScore();
      setTimeout(()=>Analytics.buildCharts(), 80);
    }
    if (sectionId==='report') {
      setTimeout(()=>AnalyticsSystem.buildReport(), 100);
    }

    /* Close sidebar on mobile */
    if (window.innerWidth <= 768) {
      _$('sidebar').classList.remove('open');
    }
  },

  toggleSidebar() { _$('sidebar').classList.toggle('open'); },
};


/* ══════════════════════════════════════════════════════════════
   MOOD SYSTEM
══════════════════════════════════════════════════════════════ */
const MoodSystem = {
  get()       { const a=JSON.parse(localStorage.getItem(KEYS.MOODS)||'{}'); return a[_currentUser.username]||[]; },
  save(moods) { const a=JSON.parse(localStorage.getItem(KEYS.MOODS)||'{}'); a[_currentUser.username]=moods; localStorage.setItem(KEYS.MOODS,JSON.stringify(a)); },

  select(btn) {
    _qsa('.mood-tile').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    _selectedMood = { label: btn.dataset.mood, score: parseInt(btn.dataset.score) };
  },

  log() {
    const msgEl = _$('mood-saved-msg');
    if (!_selectedMood) { msgEl.textContent='⚠ Please select a mood first.'; msgEl.style.color='var(--c-rose)'; return; }
    const note  = _$('mood-note').value.trim();
    const entry = { id:Date.now(), mood:_selectedMood.label, score:_selectedMood.score, note, timestamp:new Date().toISOString() };
    const moods = this.get();
    moods.unshift(entry);
    this.save(moods);
    _qsa('.mood-tile').forEach(b=>b.classList.remove('selected'));
    _$('mood-note').value = '';
    _selectedMood = null;
    msgEl.textContent='✓ Mood logged!'; msgEl.style.color='var(--c-emerald)';
    setTimeout(()=>{ msgEl.textContent=''; }, 3000);
    this.render();
    Analytics.updateStats();
    Analytics.updateScore();
    AICompanion.updateAvatar();
  },

  delete(id) {
    this.save(this.get().filter(m=>m.id!==id));
    this.render();
    Analytics.updateStats();
    Analytics.updateScore();
  },

  render() {
    const el    = _$('mood-history-list');
    const moods = this.get();
    if (!moods.length) { el.innerHTML='<p class="empty-state">No mood entries yet. Log your first mood above!</p>'; return; }
    el.innerHTML = moods.slice(0,20).map(m=>{
      const dt  = new Date(m.timestamp);
      const day = dt.toLocaleDateString('en-US',{month:'short',day:'numeric'});
      const hr  = dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      return `
        <div class="mood-log-entry">
          <span class="mood-log-emoji">${MOOD_EMOJI[m.mood]}</span>
          <div class="mood-log-info">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="mood-log-label">${m.mood}</span>
              <span class="mood-chip ${m.mood}">${m.mood}</span>
            </div>
            ${m.note?`<p class="mood-log-note">"${_esc(m.note)}"</p>`:''}
          </div>
          <span class="mood-log-time">${day} · ${hr}</span>
          <button class="mood-log-del" onclick="MoodSystem.delete(${m.id})" title="Delete">✕</button>
        </div>`;
    }).join('');
  },
};


/* ══════════════════════════════════════════════════════════════
   ANALYTICS  — Stats, Charts, Wellness Score
══════════════════════════════════════════════════════════════ */
const Analytics = {

  /* ── Stats Cards ─────────────────────────────────────────── */
  updateStats() {
    const moods    = MoodSystem.get();
    const journal  = JournalSystem.get();
    const habits   = HabitSystem.get();
    const habitLog = HabitSystem.getLog();
    const today    = _todayKey();

    const todayMood = moods.find(m=>m.timestamp.startsWith(today));
    _setText('stat-today-mood', todayMood ? `${MOOD_EMOJI[todayMood.mood]} ${todayMood.mood}` : '— Not logged');
    _setText('stat-journal-count', journal.length);

    const todayDone = habits.filter(h=>(habitLog[today]||[]).includes(h.id));
    _setText('stat-habits-today', `${todayDone.length}/${habits.length}`);

    let streak=0;
    for(let i=0;i<30;i++){
      const d=new Date(); d.setDate(d.getDate()-i);
      const k=_dateKey(d);
      if((habitLog[k]||[]).length>0) streak++;
      else if(i>0) break;
    }
    _setText('stat-streak', `${streak} day${streak!==1?'s':''}`);

    /* Dashboard greeting */
    const hr   = new Date().getHours();
    const tod  = hr<12?'Morning':hr<17?'Afternoon':'Evening';
    const ws   = this.calcScore();
    const { emoji, label } = this.scoreLabel(ws.total);
    const el = _$('dashboard-greeting');
    if (el) el.textContent = `Good ${tod}, ${_currentUser.name.split(' ')[0]}! — ${emoji} ${label}`;
  },

  /* ── Wellness Score ──────────────────────────────────────── */
  calcScore() {
    const moods    = MoodSystem.get();
    const habits   = HabitSystem.get();
    const habitLog = HabitSystem.getLog();
    const journal  = JournalSystem.get();
    const chat     = AICompanion.getHistory();

    /* Mood: last 7 days avg (1–5 → 0–100%) */
    const rMoods  = moods.filter(m=>(Date.now()-new Date(m.timestamp).getTime())/86400000<=7);
    const moodAvg = rMoods.length ? rMoods.reduce((s,m)=>s+m.score,0)/rMoods.length : 3;
    const moodPct = Math.round(((moodAvg-1)/4)*100);

    /* Habits: avg daily completion last 7 days */
    let hSum=0;
    for(let i=0;i<7;i++){
      const d=new Date(); d.setDate(d.getDate()-i);
      hSum += habits.length ? ((habitLog[_dateKey(d)]||[]).length/habits.length)*100 : 0;
    }
    const habitPct = Math.round(hSum/7);

    /* Journal: entries in last 7 days, capped at 7 */
    const rJournal  = journal.filter(e=>(Date.now()-new Date(e.timestamp).getTime())/86400000<=7);
    const journalPct = Math.min(Math.round((rJournal.length/7)*100),100);

    /* Chat positivity: last 20 user messages */
    const uMsgs  = chat.filter(m=>m.role==='user').slice(-20);
    const negKw  = /\b(sad|cry|depress|stress|anxious|angry|lonely|hate|hopeless|worthless|suicid|harm)\b/i;
    const posCnt = uMsgs.filter(m=>!negKw.test(m.text)).length;
    const chatPct = uMsgs.length ? Math.round((posCnt/uMsgs.length)*100) : 70;

    const total = Math.round(moodPct*0.4 + habitPct*0.3 + journalPct*0.2 + chatPct*0.1);
    return { total, moodPct, habitPct, journalPct, chatPct };
  },

  scoreLabel(score) {
    if(score>=80) return { label:'Excellent',      emoji:'🌟', color:'var(--c-emerald)' };
    if(score>=60) return { label:'Balanced',        emoji:'🌤', color:'var(--c-sky)'    };
    if(score>=40) return { label:'Needs Attention', emoji:'🌥', color:'var(--c-amber)'  };
    return                { label:'Critical Care',  emoji:'⚠',  color:'var(--c-rose)'  };
  },

  updateScore() {
    const { total, moodPct, habitPct, journalPct, chatPct } = this.calcScore();
    const { label, emoji, color } = this.scoreLabel(total);

    /* SVG ring (314 = 2π×50) */
    const ring = _$('ws-ring-fill');
    if (ring) ring.style.strokeDashoffset = (314 - 314*(total/100));

    _setText('ws-score-num', total);

    const badge = _$('ws-status-badge');
    if(badge){ badge.textContent=`${emoji} ${label}`; badge.style.color=color; badge.style.borderColor=color+'55'; badge.style.background=color+'18'; }

    /* Breakdown bars */
    _setWidth('wb-mood',    moodPct);    _setText('wb-mood-val',    moodPct+'%');
    _setWidth('wb-habit',   habitPct);   _setText('wb-habit-val',   habitPct+'%');
    _setWidth('wb-journal', journalPct); _setText('wb-journal-val', journalPct+'%');
    _setWidth('wb-chat',    chatPct);    _setText('wb-chat-val',    chatPct+'%');

    /* Tip: weakest dimension */
    const tips = {
      mood:   '💡 Log your mood daily to improve your score.',
      habit:  '💡 Complete at least one habit every day.',
      journal:'💡 Write a journal entry tonight.',
      chat:   '💡 Chat with WALL·E for emotional support.',
    };
    const dims = { mood:moodPct, habit:habitPct, journal:journalPct, chat:chatPct };
    const weak = Object.entries(dims).sort((a,b)=>a[1]-b[1])[0][0];
    _setText('ws-tip', tips[weak]||'');

    /* Sidebar score block */
    _setWidth('sidebar-ws-bar', total);
    _setText('sidebar-ws-val', total+'%');
    _setText('sidebar-ws-status', `${emoji} ${label}`);

    /* Topbar pill */
    _setText('ws-topbar-val', `⬡ ${total}%`);

    return { total, moodPct, habitPct, journalPct, chatPct };
  },

  /* ── Charts ─────────────────────────────────────────────── */
  buildCharts() {
    this.buildMoodTrend();
    this.buildMoodDist();
    this.buildHabitChart();
  },

  buildMoodTrend() {
    const canvas = _$('moodTrendChart'); if(!canvas) return;
    if(_chartMoodTrend) _chartMoodTrend.destroy();
    const labels=[], data=[], moods=MoodSystem.get();
    for(let i=6;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i);
      const key=d.toISOString().slice(0,10);
      labels.push(d.toLocaleDateString('en-US',{weekday:'short'}));
      const dayM=moods.filter(m=>m.timestamp.startsWith(key));
      data.push(dayM.length ? +(dayM.reduce((s,m)=>s+m.score,0)/dayM.length).toFixed(1) : null);
    }
    /* Trend badge */
    const valid=data.filter(v=>v!==null);
    if(valid.length>=2){
      const diff=valid[valid.length-1]-valid[0];
      const b=_$('mood-trend-badge');
      if(b){ b.textContent=diff>0?'↑ Improving':diff<0?'↓ Declining':'→ Stable'; b.style.color=diff>0?'var(--c-emerald)':diff<0?'var(--c-rose)':'var(--text-2)'; b.style.borderColor=diff>0?'rgba(52,211,153,0.4)':diff<0?'rgba(251,113,133,0.4)':'var(--border)'; }
    }
    _chartMoodTrend=new Chart(canvas,{
      type:'line',
      data:{ labels, datasets:[{ data, borderColor:'#34d399', backgroundColor:'rgba(52,211,153,0.08)', borderWidth:2.5, pointBackgroundColor:'#34d399', pointBorderColor:'#041810', pointRadius:5, pointHoverRadius:7, tension:0.4, fill:true, spanGaps:true }] },
      options:{ responsive:true,maintainAspectRatio:false, scales:{ y:{min:1,max:5,ticks:{color:'#7b8cad',stepSize:1,callback:v=>['','😢','😰','😐','😌','😊'][v]||v},grid:{color:'rgba(255,255,255,0.04)'}}, x:{ticks:{color:'#7b8cad'},grid:{color:'rgba(255,255,255,0.03)'}} }, plugins:{legend:{display:false}} }
    });
  },

  buildMoodDist() {
    const canvas=_$('moodDistChart'); if(!canvas) return;
    if(_chartMoodDist) _chartMoodDist.destroy();
    const counts={Happy:0,Calm:0,Neutral:0,Stressed:0,Sad:0};
    MoodSystem.get().forEach(m=>{if(counts[m.mood]!==undefined)counts[m.mood]++;});
    _chartMoodDist=new Chart(canvas,{
      type:'doughnut',
      data:{ labels:Object.keys(counts), datasets:[{ data:Object.values(counts), backgroundColor:['rgba(251,191,36,.75)','rgba(56,189,248,.75)','rgba(148,163,184,.6)','rgba(129,140,248,.75)','rgba(251,113,133,.75)'], borderColor:['#fbbf24','#38bdf8','#94a3b8','#818cf8','#fb7185'], borderWidth:2,hoverOffset:8 }] },
      options:{ responsive:true,maintainAspectRatio:false,cutout:'68%', plugins:{legend:{position:'right',labels:{color:'#7b8cad',padding:12,font:{family:'Plus Jakarta Sans',size:11}}}} }
    });
  },

  buildHabitChart() {
    const canvas=_$('habitChart'); if(!canvas) return;
    if(_chartHabit) _chartHabit.destroy();
    const habits=HabitSystem.get(), habitLog=HabitSystem.getLog();
    const labels=[], data=[];
    for(let i=6;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i); const k=_dateKey(d);
      labels.push(d.toLocaleDateString('en-US',{weekday:'short'}));
      data.push(habits.length?Math.round(((habitLog[k]||[]).length/habits.length)*100):0);
    }
    _chartHabit=new Chart(canvas,{
      type:'bar',
      data:{ labels, datasets:[{ data, backgroundColor:data.map(v=>v>=80?'rgba(52,211,153,.6)':v>=50?'rgba(251,191,36,.5)':'rgba(129,140,248,.45)'), borderColor:data.map(v=>v>=80?'#34d399':v>=50?'#fbbf24':'#818cf8'), borderWidth:1.5, borderRadius:7 }] },
      options:{ responsive:true,maintainAspectRatio:false, scales:{ y:{min:0,max:100,ticks:{color:'#7b8cad',callback:v=>v+'%'},grid:{color:'rgba(255,255,255,0.04)'}}, x:{ticks:{color:'#7b8cad'},grid:{display:false}} }, plugins:{legend:{display:false}} }
    });
  },
};


/* ══════════════════════════════════════════════════════════════
   AI COMPANION  — Chat, personality, avatar
══════════════════════════════════════════════════════════════ */
const AICompanion = {

  /* ── Personality ─────────────────────────────────────────── */
  PERSONALITIES: {
    friend: {
      name:'Friend Mode', icon:'😊', color:'var(--c-emerald)',
      pre:['Hey! ','Aw, ','Oh friend — ','Honestly? ','You know what? '],
      suf:[' You\'ve got this! 💙',' I\'m right here for you.',' Sending good vibes! ✨',' You\'re not alone.',''],
      face:'🤗', glow:'rgba(52,211,153,0.35)', label:'Your supportive friend',
    },
    therapist: {
      name:'Therapist Mode', icon:'🧠', color:'var(--c-violet)',
      pre:['I hear you. ','That\'s meaningful. ','Let\'s sit with that — ','I appreciate you sharing. ','I notice '],
      suf:[' What comes up for you around that?',' How long have you felt this way?',' What does that mean for you?',' I wonder what that\'s like for you.',''],
      face:'🧘', glow:'rgba(129,140,248,0.35)', label:'Your reflective therapist',
    },
    motivator: {
      name:'Motivator Mode', icon:'🚀', color:'var(--c-amber)',
      pre:['YES! ','LISTEN — ','This is your moment! ','Champions do this: ','No limits! '],
      suf:[' Now GO! 💪',' You have everything it takes!',' The world needs your energy!',' Every setback is a comeback setup!',''],
      face:'🔥', glow:'rgba(251,191,36,0.4)', label:'Your personal motivator',
    },
  },

  getPersonality() {
    const a=JSON.parse(localStorage.getItem(KEYS.PERSONALITY)||'{}');
    return a[_currentUser?.username]||'friend';
  },
  savePersonality(mode) {
    const a=JSON.parse(localStorage.getItem(KEYS.PERSONALITY)||'{}');
    a[_currentUser.username]=mode;
    localStorage.setItem(KEYS.PERSONALITY,JSON.stringify(a));
  },
  applyPersonality(text) {
    const mode=this.getPersonality();
    const cfg=this.PERSONALITIES[mode]; if(!cfg) return text;
    return _rand(cfg.pre)+text+' '+_rand(cfg.suf);
  },

  initPersonality() {
    const mode=this.getPersonality();
    this.setPersonality(mode);
  },

  setPersonality(mode) {
    this.savePersonality(mode);
    _qsa('.pbar-btn').forEach(b=>{
      b.classList.remove('active','mode-friend','mode-therapist','mode-motivator');
      if(b.dataset.mode===mode) b.classList.add('active','mode-'+mode);
    });
    const cfg=this.PERSONALITIES[mode];
    const chip=_$('pchip');
    if(chip){ chip.textContent=cfg.icon+' '+cfg.name; chip.style.background=cfg.color+'18'; chip.style.borderColor=cfg.color+'55'; chip.style.color=cfg.color; }
    const face=_$('avatar-face'), glow=_$('avatar-glow'), lbl=_$('avatar-mood-txt');
    const r1=_$('avatar-r1'), r2=_$('avatar-r2');
    if(face) face.textContent=cfg.face;
    if(glow) glow.style.background=`radial-gradient(circle,${cfg.glow},transparent 70%)`;
    if(lbl)  lbl.textContent=cfg.label;
    if(r1)   r1.style.borderColor=cfg.color+'30';
    if(r2)   r2.style.borderColor=cfg.color+'18';
  },

  updateAvatar() {
    const moods=MoodSystem.get(); if(!moods.length) return;
    const latest=moods[0].mood;
    const map={ Happy:{face:'🥰',glow:'rgba(251,191,36,0.42)',lbl:'Sharing your joy!'}, Calm:{face:'😌',glow:'rgba(56,189,248,0.32)',lbl:'At peace with you'}, Neutral:{face:'🤖',glow:'rgba(52,211,153,0.28)',lbl:'Ready to listen'}, Stressed:{face:'😟',glow:'rgba(129,140,248,0.42)',lbl:'Here to help you calm down'}, Sad:{face:'🥺',glow:'rgba(251,113,133,0.38)',lbl:'Sending you a hug 💙'} };
    const r=map[latest]||map.Neutral;
    const face=_$('avatar-face'), glow=_$('avatar-glow'), lbl=_$('avatar-mood-txt');
    if(face) face.textContent=r.face;
    if(glow) glow.style.background=`radial-gradient(circle,${r.glow},transparent 70%)`;
    if(lbl)  lbl.textContent=r.lbl;
  },

  /* ── Chat responses corpus ─────────────────────────────── */
  RESPONSES: {
    greeting: ["Hey there! 😊 I'm WALL·E, your mental wellness companion. How are you feeling today?","Hello! It's wonderful to see you. What's on your mind today?","Hi! I'm really glad you stopped by. How's your day going so far?","Good to hear from you! I'm here to listen — what's up?"],
    happy:    ["That's absolutely wonderful to hear! 🌟 What's bringing you joy today?","Amazing! Your positive energy is contagious 😊. What's making you feel so great?","Love that! Savor these happy moments. What's going well for you?","Happiness looks great on you! ✨ Would you like to journal about this?"],
    calm:     ["Feeling calm is such a gift 😌. What's helping you maintain that peace?","Calmness is the foundation of wellbeing. Have you been meditating?","Peaceful moments are worth appreciating. Keep nurturing that inner stillness! 🌿"],
    sad:      ["I'm really sorry you're feeling sad.Would you like to talk about it? 💙 Sadness is valid. Want to talk about what's going on?","Sadness can feel heavy, but you don't carry it alone. What's making you feel this way?","Thank you for sharing that. It sometimes helps to write about it in your journal — would you like to try?","Your feelings matter. Take a gentle breath with me. Can you tell me more? 💙"],
    stressed: ["Stress is really tough 😔. Let's try breathing — in 4s, hold 7s, out 8s. What's weighing on you?","I can feel the weight in your words. What's the biggest thing stressing you right now?","When stressed, small steps help. What's one thing you could take off your plate today?","You've handled every difficult day so far — 100% success rate! 💪"],
    anxious:  ["Anxiety is so hard. 🫂 Try grounding: name 5 things you can see right now.","Anxiety often comes from uncertainty. Let's take this one breath at a time — you're safe right now.","Deep breath first 🌬️. You are not your anxiety. What's been triggering these feelings?"],
    tired:    ["Rest is genuinely productive 😴. How has your sleep been lately?","Tiredness is a signal. When did you last do something purely relaxing and joyful?","Try a 10-minute walk or nap. Nature + movement resets the mind. 🌿"],
    lonely:   ["Loneliness is one of the most human feelings. 💙 I'm here with you. What would help you feel more connected?","You're not alone in feeling lonely — I'm literally right here! 🤖 Who would you love to reconnect with?","A small act of connection — a text to a friend — can shift loneliness. What feels manageable today?"],
    angry:    ["It's okay to feel angry. Your feelings are valid. 🌊 What happened?","Anger often protects something we care about. What's underneath that for you?","Writing it in your journal can really help release it. 💨"],
    meditation:["Meditation is so powerful 🧘. Even 5 minutes reduces anxiety. Try the Mood Boost section!","Start with 5 minutes of focused breathing. Close your eyes and follow your breath. No perfect way!","Box breathing: 4 in, 4 hold, 4 out, 4 hold. Repeat 4 times. Very calming."],
    exercise:  ["Exercise is mental health medicine 🏃! Even a 20-minute walk improves mood significantly.","Movement releases endorphins — nature's mood boosters! 💪 What kind of movement do you enjoy?","Consistency over intensity! Three 10-minute walks beat one exhausting hour at the gym."],
    sleep:     ["Sleep is the foundation of mental wellness 😴. Aim for 7-9 hours. What's your bedtime routine?","Poor sleep makes emotions literally harder to regulate. Try 4-7-8 breathing before bed.","A consistent bedtime is one of the most impactful wellness habits you can build."],
    gratitude: ["Gratitude rewires the brain toward positivity 🌟. What are 3 things you're grateful for today?","Gratitude journaling for 5 minutes daily can measurably improve wellbeing within weeks.","Even tiny things count — warm coffee, a comfortable bed, the fact that you're here. ✨"],
    help:      ["I'm here for your mental wellness journey 💙. You can track moods, journal, build habits, or just chat.","Tell me how you're feeling, log a mood, or write in your journal. What would help most right now?"],
    default:   ["Tell me more about that. I'm fully here for you. 💙","That's really interesting. How does that make you feel?","I appreciate you sharing that. What's been the hardest part?","You're doing great by talking about this. What would feel most helpful right now?","Your feelings make complete sense. What would you like to explore together?"],
    goodbye:   ["Take good care of yourself! 🌟 Remember: you deserve kindness — especially from yourself.","It was lovely chatting! Go be gentle with yourself today. 💙","Goodbye for now! Don't forget to log your mood! 💧"],
    journal:   ["Journaling is powerful for emotional processing 📓. Head to the Journal section and write it out!","Writing about your feelings helps your brain make sense of them. The Journal section is ready!"],
    habit:     ["Small consistent actions compound into big change 🌱. Check out the Habit Tracker!","What wellness habit would you most like to build? The Habit Tracker can help you stay consistent!"],
    positive:  ["That's a beautiful perspective 🌟. Moments of clarity like this are worth holding onto.","Yes! That kind of thinking is so healthy. How can we build on that momentum?","Love that energy! ✨ What's been contributing to this positivity?"],
    affirmation:["Here's one: 'I am enough, exactly as I am, right now.' 💙","'Every day is a new beginning. Take a deep breath and start again.' 🌿","'You have survived 100% of your worst days. You are stronger than you know.' ✨"],
    crisis:    ["I'm really concerned about what you've shared. Please know you're not alone. 💙 Please reach out to a crisis helpline — in India: iCall: 9152987821. You deserve real support right now.","What you're feeling sounds very serious. Please contact a mental health professional or crisis line. You matter."],
  },

  detectIntent(msg) {
    const m=msg.toLowerCase();
    if(/suicid|kill myself|end my life|don't want to live|harm myself|self.?harm/.test(m)) return 'crisis';
    if(/^(hi|hey|hello|good morning|good evening|good afternoon|sup|howdy)\b/.test(m)) return 'greeting';
    if(/\b(bye|goodbye|see you|take care|later|goodnight)\b/.test(m)) return 'goodbye';
    if(/\b(happy|great|amazing|wonderful|excited|fantastic|joyful|awesome)\b/.test(m)) return 'happy';
    if(/\b(calm|peaceful|relaxed|serene|content|tranquil)\b/.test(m)) return 'calm';
    if(/\b(sad|depressed|down|unhappy|miserable|heartbroken|grief|crying|cry)\b/.test(m)) return 'sad';
    if(/\b(stress|stressed|overwhelm|overload|pressure|burnout|too much)\b/.test(m)) return 'stressed';
    if(/\b(anxious|anxiety|worried|worry|nervous|panic|fear|scared)\b/.test(m)) return 'anxious';
    if(/\b(tired|exhausted|fatigue|drained|worn out|sleepy)\b/.test(m)) return 'tired';
    if(/\b(lonely|alone|isolated|nobody|no one|friendless)\b/.test(m)) return 'lonely';
    if(/\b(angry|mad|furious|rage|irritated|frustrated|annoyed)\b/.test(m)) return 'angry';
    if(/\b(meditat|mindful|breath|breathing|zen)\b/.test(m)) return 'meditation';
    if(/\b(exercise|workout|run|walk|gym|sport|fitness|yoga)\b/.test(m)) return 'exercise';
    if(/\b(sleep|insomnia|rest|nap|bedtime)\b/.test(m)) return 'sleep';
    if(/\b(grateful|gratitude|thankful|appreciate|blessed)\b/.test(m)) return 'gratitude';
    if(/\b(journal|write|diary|reflect)\b/.test(m)) return 'journal';
    if(/\b(habit|routine|track|consistency|daily)\b/.test(m)) return 'habit';
    if(/\b(affirmation|affirm|mantra)\b/.test(m)) return 'affirmation';
    if(/\b(help|what can you do|how does this work|support)\b/.test(m)) return 'help';
    if(/\b(love|life is good|doing well|feeling good|positive|optimistic)\b/.test(m)) return 'positive';
    return 'default';
  },

  generateResponse(text) {
    const intent=this.detectIntent(text);
    let base=_rand(this.RESPONSES[intent]||this.RESPONSES.default);
    /* Context-aware add-on */
    const moods=MoodSystem.get();
    if(moods.length && intent==='default'){
      const last=moods[0];
      if(last.mood==='Sad'||last.mood==='Stressed')
        base += ` I noticed your recent mood was ${last.mood.toLowerCase()}. Would you like to explore that more?`;
    }
    return intent!=='crisis' ? this.applyPersonality(base) : base;
  },

  /* ── Chat persistence ─────────────────────────────────── */
  getHistory() { const a=JSON.parse(localStorage.getItem(KEYS.CHAT)||'{}'); return a[_currentUser.username]||[]; },
  saveHistory(h){ const a=JSON.parse(localStorage.getItem(KEYS.CHAT)||'{}'); a[_currentUser.username]=h.slice(-80); localStorage.setItem(KEYS.CHAT,JSON.stringify(a)); },

  /* ── Chat render ──────────────────────────────────────── */
  init() {
    const container=_$('chat-messages');
    const history=this.getHistory();
    if(!history.length){
      const welcome={ role:'bot', text:`Hello ${_currentUser.name.split(' ')[0]}! 👋 I'm WALL·E, your personal AI mental wellness companion. I'm here to listen, support, and guide you. How are you feeling today?`, time:new Date().toISOString() };
      this.saveHistory([welcome]);
      this._renderMsg(welcome, container);
    } else {
      container.innerHTML='';
      history.forEach(msg=>this._renderMsg(msg, container));
      container.scrollTop=container.scrollHeight;
    }
    this.updateAvatar();
    /* Attach breathing circle listener for insights page */
    const bc2=_$('breathing-circle-2');
    if(bc2) bc2.addEventListener('click', ()=>BreathingSystem.toggle('breathing-circle-2','breathing-label-2','breathing-instruction-2'));
  },

  _renderMsg(msg, container) {
    const isUser=msg.role==='user';
    const time=new Date(msg.time).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    const div=document.createElement('div');
    div.className=`chat-msg ${isUser?'user':'bot'}`;
    div.innerHTML=`
      <div class="chat-msg-avatar">${isUser?_currentUser.name[0].toUpperCase():'🤖'}</div>
      <div>
        <div class="chat-bubble">${_esc(msg.text)}</div>
        <div class="chat-msg-time">${time}</div>
      </div>`;
    container.appendChild(div);
    container.scrollTop=container.scrollHeight;
  },

  _showTyping(container) {
    const el=document.createElement('div');
    el.id='typing-indicator'; el.className='chat-msg bot';
    el.innerHTML=`<div class="chat-msg-avatar">🤖</div><div class="chat-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    container.appendChild(el); container.scrollTop=container.scrollHeight;
  },

  send() {
    const input=_$('chat-input'), container=_$('chat-messages');
    const text=input.value.trim(); if(!text) return;
    const userMsg={ role:'user', text, time:new Date().toISOString() };
    this._renderMsg(userMsg, container);
    const h=this.getHistory(); h.push(userMsg); this.saveHistory(h);
    input.value='';
    this._showTyping(container);
    setTimeout(()=>{
      const ind=_$('typing-indicator'); if(ind) ind.remove();
      const botMsg={ role:'bot', text:this.generateResponse(text), time:new Date().toISOString() };
      this._renderMsg(botMsg, container);
      const h2=this.getHistory(); h2.push(botMsg); this.saveHistory(h2);
      Analytics.updateScore();
    }, 700+Math.random()*900);
  },

  handleKey(e) { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); this.send(); } },

  clearChat() {
    if(!confirm('Clear all chat history?')) return;
    const a=JSON.parse(localStorage.getItem(KEYS.CHAT)||'{}');
    delete a[_currentUser.username];
    localStorage.setItem(KEYS.CHAT,JSON.stringify(a));
    this.init();
  },
};


/* ══════════════════════════════════════════════════════════════
   JOURNAL SYSTEM
══════════════════════════════════════════════════════════════ */
const JournalSystem = {
  get()       { const a=JSON.parse(localStorage.getItem(KEYS.JOURNAL)||'{}'); return a[_currentUser.username]||[]; },
  save(e)     { const a=JSON.parse(localStorage.getItem(KEYS.JOURNAL)||'{}'); a[_currentUser.username]=e; localStorage.setItem(KEYS.JOURNAL,JSON.stringify(a)); },

  save_entry() { /* alias kept for HTML compat – renamed below */ this.saveEntry(); },

  saveEntry() {
    const title=_$('journal-title').value.trim();
    const body=_$('journal-body').value.trim();
    const msgEl=_$('journal-saved-msg');
    if(!title){ msgEl.textContent='⚠ Please add a title.'; msgEl.style.color='var(--c-rose)'; return; }
    if(!body) { msgEl.textContent='⚠ Please write something.'; msgEl.style.color='var(--c-rose)'; return; }
    const entries=this.get();
    if(_editJournalId){
      const idx=entries.findIndex(e=>e.id===_editJournalId);
      if(idx!==-1){ entries[idx].title=title; entries[idx].body=body; entries[idx].edited=new Date().toISOString(); }
      _editJournalId=null;
    } else {
      entries.unshift({ id:Date.now(), title, body, timestamp:new Date().toISOString() });
    }
    this.save(entries);
    this.clearForm();
    this.renderList();
    Analytics.updateStats();
    Analytics.updateScore();
    msgEl.textContent='✓ Entry saved!'; msgEl.style.color='var(--c-emerald)';
    setTimeout(()=>{ msgEl.textContent=''; }, 2500);
  },

  clearForm() {
    _$('journal-title').value=''; _$('journal-body').value='';
    _$('journal-form-title').textContent='New Entry';
    _$('journal-cancel-btn').style.display='none';
    _editJournalId=null;
  },

  edit(id) {
    const e=this.get().find(e=>e.id===id); if(!e) return;
    _$('journal-title').value=e.title; _$('journal-body').value=e.body;
    _$('journal-form-title').textContent='Edit Entry';
    _$('journal-cancel-btn').style.display='inline-flex';
    _editJournalId=id;
    _qs('.journal-write-panel').scrollIntoView({behavior:'smooth',block:'start'});
  },

  delete(id) {
    if(!confirm('Delete this entry?')) return;
    this.save(this.get().filter(e=>e.id!==id));
    this.renderList(); Analytics.updateStats(); Analytics.updateScore();
  },

  renderList() {
    const el=_$('journal-entries-list'), entries=this.get();
    if(!entries.length){ el.innerHTML='<p class="empty-state">No journal entries yet. Write your first reflection!</p>'; return; }
    el.innerHTML=entries.map(e=>{
      const dt=new Date(e.timestamp);
      const ds=dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      const preview=e.body.length>100?e.body.slice(0,100)+'…':e.body;
      return `
        <div class="journal-entry">
          <div class="journal-entry-head">
            <span class="journal-entry-title">${_esc(e.title)}</span>
            <span class="journal-entry-date">${ds}</span>
          </div>
          <p class="journal-entry-preview">${_esc(preview)}</p>
          <div class="journal-entry-actions">
            <button class="btn-tiny edit" onclick="JournalSystem.edit(${e.id})">✎ Edit</button>
            <button class="btn-tiny del"  onclick="JournalSystem.delete(${e.id})">✕ Delete</button>
          </div>
        </div>`;
    }).join('');
  },
};

/* HTML button aliases */
function saveJournalEntry() { JournalSystem.saveEntry(); }
function clearJournalForm()  { JournalSystem.clearForm(); }


/* ══════════════════════════════════════════════════════════════
   HABIT SYSTEM
══════════════════════════════════════════════════════════════ */
const HabitSystem = {
  get()       { const a=JSON.parse(localStorage.getItem(KEYS.HABITS)||'{}'); return a[_currentUser.username]||[]; },
  save(h)     { const a=JSON.parse(localStorage.getItem(KEYS.HABITS)||'{}'); a[_currentUser.username]=h; localStorage.setItem(KEYS.HABITS,JSON.stringify(a)); },
  getLog()    { const a=JSON.parse(localStorage.getItem(KEYS.HABIT_LOG)||'{}'); return a[_currentUser.username]||{}; },
  saveLog(l)  { const a=JSON.parse(localStorage.getItem(KEYS.HABIT_LOG)||'{}'); a[_currentUser.username]=l; localStorage.setItem(KEYS.HABIT_LOG,JSON.stringify(a)); },

  add() {
    const input=_$('new-habit-input'); const icon=_$('new-habit-icon').value; const name=input.value.trim();
    if(!name){ input.focus(); return; }
    const habits=this.get(); habits.push({id:Date.now(),name,icon}); this.save(habits);
    input.value=''; this.renderList(); this.renderStreaks(); Analytics.updateStats(); Analytics.updateScore();
  },

  toggle(id) {
    const log=this.getLog(); const key=_todayKey(); const today=log[key]||[];
    log[key]=today.includes(id)?today.filter(i=>i!==id):[...today,id];
    this.saveLog(log); this.renderList(); this.renderStreaks(); Analytics.updateStats(); Analytics.updateScore();
  },

  delete(id) {
    this.save(this.get().filter(h=>h.id!==id)); this.renderList(); this.renderStreaks(); Analytics.updateStats(); Analytics.updateScore();
  },

  calcStreak(id) {
    const log=this.getLog(); let streak=0; const today=new Date();
    for(let i=0;i<365;i++){
      const d=new Date(today); d.setDate(today.getDate()-i); const k=_dateKey(d);
      if((log[k]||[]).includes(id)) streak++; else if(i>0) break;
    }
    return streak;
  },

  renderList() {
    const el=_$('habits-list'), habits=this.get(), log=this.getLog(), today=log[_todayKey()]||[];
    if(!habits.length){ el.innerHTML='<p class="empty-state">No habits yet. Add your first wellness habit above!</p>'; return; }
    el.innerHTML=habits.map(h=>{
      const done=today.includes(h.id);
      return `
        <div class="habit-row ${done?'done':''}">
          <div class="habit-checkbox" onclick="HabitSystem.toggle(${h.id})">${done?'✓':''}</div>
          <span class="habit-icon">${h.icon}</span>
          <span class="habit-name">${_esc(h.name)}</span>
          <button class="habit-del" onclick="HabitSystem.delete(${h.id})" title="Delete">✕</button>
        </div>`;
    }).join('');
  },

  renderStreaks() {
    const el=_$('streaks-list');
    const ws=this.get().map(h=>({...h,streak:this.calcStreak(h.id)})).filter(h=>h.streak>0).sort((a,b)=>b.streak-a.streak);
    if(!ws.length){ el.innerHTML='<p class="empty-state">Complete habits to build your streak!</p>'; return; }
    el.innerHTML=ws.map(h=>`
      <div class="streak-tile">
        <span class="streak-tile-icon">${h.icon}</span>
        <div>
          <div class="streak-tile-name">${_esc(h.name)}</div>
          <div class="streak-tile-count">🔥 ${h.streak} day${h.streak!==1?'s':''}</div>
        </div>
      </div>`).join('');
  },
};


/* ══════════════════════════════════════════════════════════════
   BREATHING SYSTEM  (handles multiple circles)
══════════════════════════════════════════════════════════════ */
const BreathingSystem = {
  _activeId: null,

  toggle(circleId='breathing-circle', labelId='breathing-label', instructionId='breathing-instruction') {
    if(_breathActive && this._activeId===circleId) {
      this._stop(circleId, labelId, instructionId);
    } else {
      if(_breathActive) this._stop(this._circleId, this._labelId, this._instrId);
      this._start(circleId, labelId, instructionId);
    }
  },

  _start(cid, lid, iid) {
    _breathActive=true; _breathPhase=0; _breathCycles=0;
    this._activeId=cid; this._circleId=cid; this._labelId=lid; this._instrId=iid;
    this._run(cid, lid, iid);
  },

  _run(cid, lid, iid) {
    if(!_breathActive) return;
    if(_breathCycles>=BREATH_MAX){ this._stop(cid,lid,iid); return; }
    const phase=BREATH_PHASES[_breathPhase];
    const circle=_$(cid), label=_$(lid), instr=_$(iid);
    if(circle) circle.className=`breathing-circle ${phase.cls}`;
    if(label)  label.textContent=phase.label;
    if(instr)  instr.textContent=phase.hint;
    _breathTimer=setTimeout(()=>{
      _breathPhase=(_breathPhase+1)%BREATH_PHASES.length;
      if(_breathPhase===0) _breathCycles++;
      this._run(cid, lid, iid);
    }, phase.ms);
  },

  _stop(cid, lid, iid) {
    clearTimeout(_breathTimer); _breathActive=false; this._activeId=null;
    const circle=_$(cid), label=_$(lid), instr=_$(iid);
    if(circle) circle.className='breathing-circle';
    if(label)  label.textContent='Tap to Start';
    if(instr)  instr.textContent = _breathCycles>=BREATH_MAX
      ? '✓ Session complete! Great job.'
      : 'Click the circle to begin a guided breathing session.';
  },
};


/* ══════════════════════════════════════════════════════════════
   BOOST SYSTEM  — Gratitude, Meditation, Affirmation
══════════════════════════════════════════════════════════════ */
const BoostSystem = {

  init() {
    /* Attach breathing circle */
    const bc=_$('breathing-circle');
    if(bc) bc.addEventListener('click', ()=>BreathingSystem.toggle());
    /* Init affirmation */
    this._nextBigAffImpl();
    /* Render gratitude history */
    this._renderGratHistory();
    /* Init meditation display */
    this._refreshMed();
  },

  /* ── Gratitude ─────────────────────────────────────────── */
  _getGrat()       { const a=JSON.parse(localStorage.getItem(KEYS.GRATITUDE)||'{}'); return a[_currentUser.username]||[]; },
  _saveGrat(list)  { const a=JSON.parse(localStorage.getItem(KEYS.GRATITUDE)||'{}'); a[_currentUser.username]=list.slice(0,30); localStorage.setItem(KEYS.GRATITUDE,JSON.stringify(a)); },

  saveGratitude() {
    const g1=_$('grat-1').value.trim(), g2=_$('grat-2').value.trim(), g3=_$('grat-3').value.trim();
    const msg=_$('grat-msg');
    if(!g1||!g2||!g3){ msg.textContent='⚠ Please fill in all 3 items.'; msg.style.color='var(--c-rose)'; return; }
    const entry={ id:Date.now(), items:[g1,g2,g3], timestamp:new Date().toISOString() };
    const list=this._getGrat(); list.unshift(entry); this._saveGrat(list);
    ['grat-1','grat-2','grat-3'].forEach(id=>_$(id).value='');
    msg.textContent='✓ Gratitude saved! 🧠 Your brain thanks you.'; msg.style.color='var(--c-emerald)';
    setTimeout(()=>{ msg.textContent=''; }, 3000);
    this._renderGratHistory();
  },

  _renderGratHistory() {
    const el=_$('grat-history'); if(!el) return;
    const list=this._getGrat().slice(0,3);
    if(!list.length){ el.innerHTML=''; return; }
    el.innerHTML='<p style="font-size:0.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.07em;font-weight:700;margin-bottom:6px">Recent</p>' +
      list.map(e=>`
        <div class="grat-history-item">
          <div class="grat-history-date">${new Date(e.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
          ${e.items.map(i=>`<div>✦ ${_esc(i)}</div>`).join('')}
        </div>`).join('');
  },

  /* ── Meditation Timer ───────────────────────────────────── */
  pickMedDur(btn, mins) {
    _qsa('.dur-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    if(_medActive) this.resetMed();
    _medSecsTotal=mins*60; _medSecsLeft=_medSecsTotal;
    this._refreshMed();
  },

  _refreshMed() {
    const m=Math.floor(_medSecsLeft/60), s=_medSecsLeft%60;
    _setText('med-time', `${m}:${String(s).padStart(2,'0')}`);
    const prog=_$('med-prog');
    if(prog) prog.style.strokeDashoffset = 314*(1-_medSecsLeft/_medSecsTotal);
  },

  toggleMed() { _medActive ? this._pauseMed() : this._startMed(); },

  _startMed() {
    _medActive=true; _$('med-btn').textContent='⏸ Pause';
    _medInterval=setInterval(()=>{
      _medSecsLeft--;
      _medPhaseTick++;
      const phase=MED_PHASES[_medPhaseIdx%MED_PHASES.length];
      if(_medPhaseTick>=phase.secs){ _medPhaseTick=0; _medPhaseIdx++; }
      _setText('med-phase', MED_PHASES[_medPhaseIdx%MED_PHASES.length].label);
      this._refreshMed();
      if(_medSecsLeft<=0) this._finishMed();
    }, 1000);
  },

  _pauseMed() {
    _medActive=false; clearInterval(_medInterval);
    _$('med-btn').textContent='▶ Resume';
    _setText('med-phase', 'Paused — press Resume when ready');
  },

  _finishMed() {
    clearInterval(_medInterval); _medActive=false;
    _$('med-btn').textContent='▶ Start';
    _setText('med-phase', '🎉 Session complete! Take a moment in the stillness.');
    const prog=_$('med-prog'); if(prog) prog.style.strokeDashoffset=0;
  },

  resetMed() {
    clearInterval(_medInterval); _medActive=false; _medPhaseIdx=0; _medPhaseTick=0;
    const active=_qs('.dur-btn.active');
    _medSecsTotal=(active?parseInt(active.dataset.min):3)*60; _medSecsLeft=_medSecsTotal;
    _$('med-btn').textContent='▶ Start';
    _setText('med-phase', 'Press Start to begin your session');
    this._refreshMed();
  },

  /* ── Affirmation Generator ─────────────────────────────── */
  AFF_BANK: {
    strength:[ '"I have survived 100% of my hardest days. I am stronger than I know."', '"Challenges are invitations to grow stronger. I accept them."', '"I am resilient, resourceful, and ready."', '"Every hard moment has built the person I am today."', '"I am more powerful than any fear or doubt I carry."', '"Every experience teaches me something valuable."',
      '"I am constantly evolving into a stronger version of myself."',
      '"Mistakes are opportunities for growth and learning."',
      '"Progress, no matter how small, is meaningful."',
      '"I welcome growth even when it feels uncomfortable."'],
    peace:   [ '"I release what I cannot control and breathe into what I can."', '"In this moment I am safe, grounded, and enough."', '"Peace is not the absence of chaos — it is my response to it."', '"Each exhale releases tension. Each inhale brings calm."', '"I am allowed to rest. I am allowed to be still."','"I allow calm to flow through my mind and body."',
         '"I choose peace over worry in this moment."',
         '"My breath brings me back to a place of calm."',
         '"I let go of tension and welcome stillness."',
         '"Peace begins with the way I choose to think."' ],
    growth:  [ '"Growth is not linear, and that is perfectly okay."', '"I am a work in progress, and that is something to celebrate."', '"Every small step I take matters."', '"I am becoming who I am meant to be."', '"Learning and growing are signs of life."','"Every experience teaches me something valuable."',
        '"I am constantly evolving into a stronger version of myself."',
        '"Mistakes are opportunities for growth and learning."',
        '"Progress, no matter how small, is meaningful."',
        '"I welcome growth even when it feels uncomfortable."' ],
    all:     [ '"I am enough, exactly as I am, right now."', '"Today I choose progress over perfection."', '"I deserve rest, joy, and kindness — especially from myself."', '"My feelings are valid. My experience matters."', '"I am not my thoughts. I am the one who observes them."', '"I am worthy of love and belonging, always."', '"Each breath is a fresh start."', '"Small steps forward are still steps forward."','"I am capable, calm, and confident in my journey."',
      '"Each new day gives me a fresh chance to grow."',
      '"I honor my feelings and care for my well-being."',
      '"I trust myself to handle whatever comes my way."',
      '"I deserve kindness, patience, and understanding."',
      '"My journey is unique and meaningful."',
      '"I am learning, growing, and becoming stronger."',
      '"I choose compassion toward myself today."' ],
  },

  setAffCat(cat, btn) {
    _bigAffCat=cat; _bigAffLastIdx=-1;
    _qsa('.aff-cat-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    this._nextBigAffImpl();
  },

  nextBigAff() { this._nextBigAffImpl(); },

  _nextBigAffImpl() {
    const pool=this.AFF_BANK[_bigAffCat]||this.AFF_BANK.all;
    let idx; do{ idx=Math.floor(Math.random()*pool.length); } while(idx===_bigAffLastIdx && pool.length>1);
    _bigAffLastIdx=idx;
    const el=_$('big-aff-text'); if(!el) return;
    el.style.animation='none'; void el.offsetWidth; el.style.animation='';
    el.textContent=pool[idx];
  },
};


/* ══════════════════════════════════════════════════════════════
   ANALYTICS SYSTEM  — Insights, Recommendations, Report
══════════════════════════════════════════════════════════════ */
const AnalyticsSystem = {

  /* ── Recommendations ────────────────────────────────────── */
  RECS: {
    Happy:   [{ icon:'📓',title:'Capture this moment',    desc:'Write in your journal while happy — positive memories anchor you on harder days.',type:'boost'},{ icon:'🤝',title:'Spread the good vibes',   desc:'Share your happiness. Call a friend, send a kind message, or pay a compliment.',type:'boost'},{ icon:'🏆',title:'Set an ambitious goal',    desc:'Positive moods boost creative thinking. Use this energy to plan something exciting!',type:'boost'}],
    Calm:    [{ icon:'🧘',title:'Deepen your stillness',  desc:'Your calm state is perfect for meditation. Try 10 minutes of mindful breathing.',type:'calm'},{ icon:'📚',title:'Read something enriching', desc:'A calm mind absorbs learning beautifully. Pick up that book you\'ve been saving.',type:'calm'},{ icon:'🌿',title:'Connect with nature',       desc:'A gentle walk outside deepens your sense of groundedness.',type:'calm'}],
    Neutral: [{ icon:'🎯',title:'Set a small intention',  desc:'Neutral days are perfect for gentle progress. Pick one task and complete it.',type:'boost'},{ icon:'💧',title:'Hydrate & nourish',        desc:'Your body may be asking for basic care. Drink water, eat well, move a little.',type:'calm'},{ icon:'😊',title:'Do something pleasurable',  desc:'Nudge it positive with something you genuinely enjoy.',type:'boost'}],
    Stressed:[{ icon:'🌬️',title:'4-7-8 Breathing',        desc:'Inhale 4s, hold 7s, exhale 8s. Activates your parasympathetic nervous system.',type:'stress'},{ icon:'✅',title:'Brain dump your tasks',   desc:'Write down everything stressing you. Externalising reduces the mental load.',type:'stress'},{ icon:'🎵',title:'Listen to calming music',    desc:'60 BPM music synchronises brainwaves to induce calm.',type:'stress'},{ icon:'🚶',title:'Take a 10-minute walk',    desc:'Physical movement metabolises stress hormones faster than almost anything else.',type:'stress'}],
    Sad:     [{ icon:'💙',title:'Be gentle with yourself', desc:'Sadness is not weakness — it\'s the heart\'s way of processing. Just be with it.',type:'sad'},{ icon:'🤗',title:'Reach out to someone',    desc:'A trusted person can hold space for you. You don\'t carry this alone.',type:'sad'},{ icon:'📓',title:'Write out your feelings',    desc:'Start with "Today I feel…" and let it flow. Journaling releases emotional weight.',type:'sad'},{ icon:'☀️',title:'Get some sunlight',          desc:'Sunlight triggers serotonin. Even 10 minutes outside can gently lift your mood.',type:'sad'}],
  },

  renderRecommendations() {
    const el=_$('recommendations-container'), moods=MoodSystem.get();
    let dominant='Neutral';
    if(moods.length){
      const recent=moods.slice(0,3), freq={};
      recent.forEach(m=>{ freq[m.mood]=(freq[m.mood]||0)+1; });
      dominant=Object.keys(freq).sort((a,b)=>freq[b]-freq[a])[0];
    }
    const recs=this.RECS[dominant]||this.RECS.Neutral;
    const label=`<div style="margin-bottom:14px;"><span style="font-size:0.72rem;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Based on your recent mood:</span><span class="mood-chip ${dominant}" style="margin-left:8px;">${MOOD_EMOJI[dominant]} ${dominant}</span></div>`;
    el.innerHTML=label+recs.map(r=>`<div class="rec-card type-${r.type}"><div class="rec-card-icon">${r.icon}</div><div class="rec-card-title">${r.title}</div><div class="rec-card-desc">${r.desc}</div></div>`).join('');
  },

  /* ── Affirmations (Insights page) ─────────────────────── */
  ALL_AFFS: ['"I am enough, exactly as I am, right now."','"Every storm runs out of rain. This too shall pass."','"I have survived 100% of my hardest days. I am stronger than I know."','"Small steps forward are still steps forward."','"I deserve rest, joy, and kindness — especially from myself."','"My feelings are valid. My experience matters."','"I am not my thoughts. I am the one who observes them."','"Today I choose progress over perfection."','"I am worthy of love and belonging, always."','"Growth is not linear, and that is perfectly okay."','"I release what I cannot control and focus on what I can."','"Each breath is a fresh start."'],

  renderAffirmation() {
    let idx; do{ idx=Math.floor(Math.random()*this.ALL_AFFS.length); } while(idx===_insAffLastIdx && this.ALL_AFFS.length>1);
    _insAffLastIdx=idx;
    _setText('affirmation-text', this.ALL_AFFS[idx]);
  },
  newAffirmation() { this.renderAffirmation(); },

  /* ── Monthly Report ─────────────────────────────────────── */
  _getReportPeriod() {
    const d=new Date(); d.setMonth(d.getMonth()+_reportOffset);
    return { year:d.getFullYear(), month:d.getMonth() };
  },
  reportPrev() { _reportOffset--; this.buildReport(); },
  reportNext() { if(_reportOffset<0){ _reportOffset++; this.buildReport(); } },

  _matchMonth(iso, year, month) { const d=new Date(iso); return d.getFullYear()===year && d.getMonth()===month; },

  buildReport() {
    const { year, month }=this._getReportPeriod();
    const mName=new Date(year,month,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    _setText('report-month-lbl', mName);

    const allMoods=MoodSystem.get().filter(m=>this._matchMonth(m.timestamp,year,month));
    const allJournal=JournalSystem.get().filter(e=>this._matchMonth(e.timestamp,year,month));
    const habits=HabitSystem.get(), habitLog=HabitSystem.getLog();
    const daysInMonth=new Date(year,month+1,0).getDate();

    /* Habit stats */
    let hDone=0, hPoss=0; const wkTotals=[0,0,0,0], wkPoss=[0,0,0,0];
    for(let d=1;d<=daysInMonth;d++){
      const key=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const done=(habitLog[key]||[]).length;
      hDone+=done; hPoss+=habits.length;
      const w=Math.min(Math.floor((d-1)/7),3);
      wkTotals[w]+=done; wkPoss[w]+=habits.length;
    }
    const habitCons=hPoss ? Math.round((hDone/hPoss)*100) : 0;

    /* Mood distribution */
    const moodCounts={Happy:0,Calm:0,Neutral:0,Stressed:0,Sad:0};
    allMoods.forEach(m=>{ if(moodCounts[m.mood]!==undefined) moodCounts[m.mood]++; });
    const avgMood=allMoods.length ? (allMoods.reduce((s,m)=>s+m.score,0)/allMoods.length).toFixed(1) : '—';
    const dominant=allMoods.length ? Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0][0] : '—';
    const ws=Analytics.updateScore();

    /* Summary */
    const sumEl=_$('report-summary');
    if(sumEl) sumEl.innerHTML=[
      {l:'Mood Entries',val:allMoods.length},{l:'Avg Mood',val:avgMood+'/5'},
      {l:'Dominant Mood',val:dominant!=='—'?MOOD_EMOJI[dominant]+' '+dominant:'—'},
      {l:'Journal Entries',val:allJournal.length},{l:'Habit Consistency',val:habitCons+'%'},
      {l:'Wellness Score',val:(ws?.total||'—')+'%'},
    ].map(r=>`<div class="report-stat-row"><span class="report-stat-lbl">${r.l}</span><span class="report-stat-val">${r.val}</span></div>`).join('');

    /* Insights */
    const moodIns=+avgMood>=4?'Your mood this month has been excellent! Keep up your positive habits.':+avgMood>=3?'A generally positive month with some highs and lows.':+avgMood>=2?'A challenging month mood-wise. Consider extra self-care.':'A very tough month emotionally. Please consider speaking with someone you trust.';
    _setText('report-mood-insight', moodIns);
    _setText('report-habit-insight', habitCons>=80?'Outstanding consistency! Habits are deeply embedded.':habitCons>=50?'Good progress — more than half completion. Keep building!':'Room to grow. Start with one non-negotiable daily habit.');

    /* Notable days */
    const notEl=_$('report-notable');
    if(notEl){
      const notable=allMoods.filter(m=>m.mood==='Stressed'||m.mood==='Sad').slice(0,5);
      notEl.innerHTML=notable.length
        ? notable.map(m=>`<div class="notable-item"><div class="notable-emoji">${MOOD_EMOJI[m.mood]}</div><div><div class="notable-date">${new Date(m.timestamp).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div><div class="notable-label">${m.mood}${m.note?` — "${_esc(m.note)}"`:''}</div></div></div>`).join('')
        : '<p class="empty-state">No stressful days this month! 🌟</p>';
    }

    /* Journal bars */
    const jEl=_$('report-journal-bars');
    if(jEl){
      const wk=['W1','W2','W3','W4'], wc=[0,0,0,0];
      allJournal.forEach(e=>{ const day=new Date(e.timestamp).getDate(); wc[Math.min(Math.floor((day-1)/7),3)]++; });
      const mx=Math.max(...wc,1);
      jEl.innerHTML='<p style="font-size:0.76rem;color:var(--text-2);margin-bottom:9px;">Entries per week</p>' +
        wk.map((w,i)=>`<div class="jbar-row"><span class="jbar-lbl">${w}</span><div class="jbar-track"><div class="jbar-fill" style="width:${(wc[i]/mx)*100}%"></div></div><span class="jbar-count">${wc[i]}</span></div>`).join('');
    }

    /* AI Insights */
    this._buildAIInsights(+avgMood, habitCons, allJournal.length, allMoods);

    /* Charts */
    this._buildRptMoodChart(moodCounts);
    this._buildRptHabitChart(wkTotals, wkPoss);
  },

  _buildAIInsights(avgMood, habitCons, journalCount, allMoods) {
    const el=_$('report-ai-list'); if(!el) return;
    const items=[];
    if(avgMood>=4)    items.push({icon:'🌟',title:'Excellent mood!',body:`Your avg of ${avgMood}/5 is outstanding. You're thriving emotionally.`});
    else if(avgMood<=2)items.push({icon:'💙',title:'Tough month',body:`Avg mood ${avgMood}/5. Be compassionate with yourself and seek support if needed.`});
    else              items.push({icon:'📊',title:'Mood overview',body:`Avg mood ${avgMood}/5 — balanced with room for growth.`});
    if(habitCons>=80)  items.push({icon:'🔥',title:'Habit champion!',body:`${habitCons}% completion! Your consistency is building powerful routines.`});
    else if(habitCons<30)items.push({icon:'🌱',title:'Habit opportunity',body:`Only ${habitCons}% completion. One daily non-negotiable habit can transform your wellbeing.`});
    if(journalCount===0) items.push({icon:'📓',title:'Start journaling',body:'No entries this month. Even 5 min/week of reflection has proven mental health benefits.'});
    else if(journalCount>=8) items.push({icon:'✍️',title:'Reflective writer',body:`${journalCount} entries! Regular journaling builds self-awareness.`});
    const stress=allMoods.filter(m=>m.mood==='Stressed').length;
    if(stress>4) items.push({icon:'⚠️',title:'Stress pattern',body:`Stress logged ${stress} times. Consider daily breathing exercises.`});
    if(!items.length) items.push({icon:'✨',title:'Keep going',body:'Every data point makes your wellness picture clearer. Consistency is key!'});
    el.innerHTML=items.map(i=>`<div class="report-ai-item"><div class="report-ai-icon">${i.icon}</div><div class="report-ai-body"><strong>${i.title}</strong>${i.body}</div></div>`).join('');
  },

  _buildRptMoodChart(moodCounts) {
    const canvas=_$('reportMoodChart'); if(!canvas) return;
    if(_chartRptMood) _chartRptMood.destroy();
    _chartRptMood=new Chart(canvas,{ type:'doughnut', data:{ labels:Object.keys(moodCounts), datasets:[{ data:Object.values(moodCounts), backgroundColor:['rgba(251,191,36,.75)','rgba(56,189,248,.75)','rgba(148,163,184,.6)','rgba(129,140,248,.75)','rgba(251,113,133,.75)'], borderColor:['#fbbf24','#38bdf8','#94a3b8','#818cf8','#fb7185'], borderWidth:2,hoverOffset:8 }] }, options:{ responsive:true,maintainAspectRatio:false,cutout:'65%', plugins:{legend:{position:'right',labels:{color:'#7b8cad',padding:10,font:{family:'Plus Jakarta Sans',size:11}}}} } });
  },

  _buildRptHabitChart(wkTotals, wkPoss) {
    const canvas=_$('reportHabitChart'); if(!canvas) return;
    if(_chartRptHabit) _chartRptHabit.destroy();
    const pcts=wkTotals.map((t,i)=>wkPoss[i]?Math.round((t/wkPoss[i])*100):0);
    _chartRptHabit=new Chart(canvas,{ type:'bar', data:{ labels:['Week 1','Week 2','Week 3','Week 4'], datasets:[{ data:pcts, backgroundColor:pcts.map(v=>v>=80?'rgba(52,211,153,.65)':v>=50?'rgba(251,191,36,.55)':'rgba(129,140,248,.5)'), borderColor:pcts.map(v=>v>=80?'#34d399':v>=50?'#fbbf24':'#818cf8'), borderWidth:1.5,borderRadius:7 }] }, options:{ responsive:true,maintainAspectRatio:false, scales:{ y:{min:0,max:100,ticks:{color:'#7b8cad',callback:v=>v+'%'},grid:{color:'rgba(255,255,255,0.04)'}}, x:{ticks:{color:'#7b8cad'},grid:{display:false}} }, plugins:{legend:{display:false}} } });
  },

  downloadReport() {
    const { year, month }=this._getReportPeriod();
    const mName=new Date(year,month,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    const allMoods=MoodSystem.get().filter(m=>this._matchMonth(m.timestamp,year,month));
    const allJournal=JournalSystem.get().filter(e=>this._matchMonth(e.timestamp,year,month));
    const habits=HabitSystem.get();
    const ws=Analytics.calcScore();
    const avgMood=allMoods.length?(allMoods.reduce((s,m)=>s+m.score,0)/allMoods.length).toFixed(1):'N/A';
    const moodDist=Object.entries(allMoods.reduce((a,m)=>{a[m.mood]=(a[m.mood]||0)+1;return a;},{})).map(([k,v])=>`  ${k}: ${v}`).join('\n')||'  No data';
    const txt=`WALL·E MONTHLY WELLNESS REPORT\n================================\nUser   : ${_currentUser.name}\nPeriod : ${mName}\nCreated: ${new Date().toLocaleDateString()}\n\nWELLNESS SCORE\n--------------\nOverall    : ${ws.total}%\nMood       : ${ws.moodPct}%\nHabits     : ${ws.habitPct}%\nJournal    : ${ws.journalPct}%\nPositivity : ${ws.chatPct}%\n\nMOOD SUMMARY\n------------\nTotal entries : ${allMoods.length}\nAverage score : ${avgMood}/5\nDistribution:\n${moodDist}\n\nHABITS\n------\n${habits.map(h=>h.icon+' '+h.name).join('\n')||'  No habits set'}\n\nJOURNAL\n-------\nEntries this month: ${allJournal.length}\n\nGenerated by WALL·E — AI Mental Wellness Companion`.trim();
    const blob=new Blob([txt],{type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=Object.assign(document.createElement('a'),{href:url,download:`WALLE_Report_${mName.replace(' ','_')}.txt`});
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
/* ======================================== 
   ZEN STATION: SOUND CONTROLLER
   ======================================== */
const SoundSystem = {
  activeSounds: {},
  
  // High-quality CDN assets
  library: {
    rain: "Rain.mp3",
    ocean: "Ocean.wav",
    forest: "Forest.mp3",
    fire: "Fireplace.m4a",
    binaural: "Binaural.m4a",
    delta: "Delta Waves.mp3",
    white: "White Noise.mp3"
  },

  toggle(id) {
    // Using your _qs and _$ helpers
    const card = _qs(`[onclick*="toggle('${id}')"]`);
    const btn = _$( `btn-${id}`);

    if (this.activeSounds[id]) {
      // If currently playing: Stop it
      this.activeSounds[id].pause();
      delete this.activeSounds[id];
      if(card) card.classList.remove('active');
      if(btn) btn.textContent = "▶";
    } else {
      // If not playing: Start it
      const audio = new Audio(this.library[id]);
      audio.loop = true;
      
      // Look for the volume slider inside this card
      const slider = card ? card.querySelector('.volume-slider') : null;
      audio.volume = slider ? parseFloat(slider.value) : 0.5;
      
      audio.play().catch(e => console.log("Audio play blocked until user interaction."));
      
      this.activeSounds[id] = audio;
      if(card) card.classList.add('active');
      if(btn) btn.textContent = "⏸";
    }
  },

  setVolume(id, val) {
    if (this.activeSounds[id]) {
      this.activeSounds[id].volume = parseFloat(val);
    }
  },

  stopAll() {
    Object.keys(this.activeSounds).forEach(id => {
      this.activeSounds[id].pause();
      const card = _qs(`[onclick*="toggle('${id}')"]`);
      const btn = _$( `btn-${id}`);
      if(card) card.classList.remove('active');
      if(btn) btn.textContent = "▶";
    });
    this.activeSounds = {};
  }
};

/* ══════════════════════════════════════════════════════════════
   INITIALIZATION
══════════════════════════════════════════════════════════════ */
function init() {
  /* Seed demo account */
  const users=AppController.getUsers();
  if(!Object.keys(users).length){
    users['demo']={ name:'Demo User', password:btoa('demo1234') };
    AppController.saveUsers(users);
  }

  /* Restore session */
  const saved=localStorage.getItem(KEYS.CURRENT);
  if(saved){
    try { _currentUser=JSON.parse(saved); AppController._launch(); }
    catch { localStorage.removeItem(KEYS.CURRENT); }
  }
}

document.addEventListener('DOMContentLoaded', init);
