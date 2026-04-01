/* ============================================================
   WALL·E — AI Mental Wellness Companion
   script.js  —  All application logic
   Sections:
     1. CONSTANTS & STATE
     2. AUTH SYSTEM
     3. NAVIGATION
     4. MOOD TRACKER
     5. DASHBOARD & CHARTS
     6. AI CHAT COMPANION
     7. JOURNAL SYSTEM
     8. HABIT TRACKER
     9. RECOMMENDATIONS & AFFIRMATIONS
    10. BREATHING EXERCISE
    11. INITIALIZATION
============================================================ */

/* ============================================================
   1. CONSTANTS & STATE
============================================================ */
const STORAGE_KEYS = {
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

// Mood emoji mapping
const MOOD_EMOJIS = {
  Happy:    '😊',
  Calm:     '😌',
  Neutral:  '😐',
  Stressed: '😰',
  Sad:      '😢',
};

// Mood numeric scores for charting
const MOOD_SCORES = { Happy: 5, Calm: 4, Neutral: 3, Stressed: 2, Sad: 1 };

let currentUser    = null;   // logged-in user object
let selectedMood   = null;   // mood button currently selected
let moodTrendChart = null;   // Chart.js instance
let moodDistChart  = null;   // Chart.js instance
let habitChart     = null;   // Chart.js instance
let editingJournalId = null; // id of journal entry being edited
let breathingTimer   = null; // breathing exercise interval
let breathingActive  = false;

/* ============================================================
   2. AUTH SYSTEM
============================================================ */

/** Get all registered users from localStorage */
function getUsers() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '{}');
}

/** Save users object back to localStorage */
function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
}

/** Show login form / signup form toggle */
function toggleAuth() {
  const loginForm  = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  loginForm.classList.toggle('active');
  signupForm.classList.toggle('active');
  // clear errors
  document.getElementById('login-error').textContent  = '';
  document.getElementById('signup-error').textContent = '';
}

/** Handle user login */
function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');

  if (!username || !password) { errEl.textContent = 'Please fill in all fields.'; return; }

  const users = getUsers();
  const user  = users[username.toLowerCase()];

  if (!user || user.password !== btoa(password)) {
    errEl.textContent = 'Invalid username or password.';
    return;
  }

  // Persist session
  currentUser = { username: username.toLowerCase(), name: user.name };
  localStorage.setItem(STORAGE_KEYS.CURRENT, JSON.stringify(currentUser));
  launchApp();
  initPersonality();
  updateWellnessScore();
  renderGratitudeHistory();
  initBigAff();
}

/** Handle user signup */
function signup() {
  const name     = document.getElementById('signup-name').value.trim();
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl    = document.getElementById('signup-error');

  if (!name || !username || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
  if (username.length < 3)             { errEl.textContent = 'Username must be at least 3 characters.'; return; }
  if (password.length < 4)             { errEl.textContent = 'Password must be at least 4 characters.'; return; }

  const users = getUsers();
  if (users[username.toLowerCase()])   { errEl.textContent = 'Username already taken.'; return; }

  // Save new user
  users[username.toLowerCase()] = { name, password: btoa(password) };
  saveUsers(users);

  // Auto-login after signup
  currentUser = { username: username.toLowerCase(), name };
  localStorage.setItem(STORAGE_KEYS.CURRENT, JSON.stringify(currentUser));
  launchApp();
}

/** Logout — clear session and reload */
function logout() {
  localStorage.removeItem(STORAGE_KEYS.CURRENT);
  currentUser = null;
  // Destroy charts to prevent Canvas reuse warnings
  if (moodTrendChart) { moodTrendChart.destroy(); moodTrendChart = null; }
  if (moodDistChart)  { moodDistChart.destroy();  moodDistChart  = null; }
  if (habitChart)     { habitChart.destroy();     habitChart     = null; }
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').style.display = 'flex';
  // Reset login form
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').textContent = '';
  if (!document.getElementById('login-form').classList.contains('active')) toggleAuth();
}

/** Show the main app after successful auth */
function launchApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');

  // Set username displays
  const displayName = currentUser.name.split(' ')[0];
  document.getElementById('sidebar-username').textContent = currentUser.name;
  document.getElementById('user-avatar').textContent      = displayName[0].toUpperCase();
  document.getElementById('topbar-avatar').textContent    = displayName[0].toUpperCase();

  // Show dashboard by default
  navigate('dashboard');
  initChat();
  renderHabits();
  renderStreaks();
  renderJournalList();
  renderMoodHistory();
  setTopbarDate();
  renderAffirmation();
  renderRecommendations();
}

/* ============================================================
   3. NAVIGATION
============================================================ */

/** Switch between app sections */
function navigate(sectionId) {
  // Deactivate all sections and nav items
  document.querySelectorAll('.section').forEach(s  => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n  => n.classList.remove('active'));

  document.getElementById('section-' + sectionId).classList.add('active');
  document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');

  // Section title in topbar
  const titles = {
    dashboard:       'Dashboard',
    mood:            'Mood Tracker',
    chat:            'AI Companion',
    journal:         'Wellness Journal',
    habits:          'Habit Tracker',
    recommendations: 'Insights',
     moodboost: 'Mood Boost',
     report:    'Wellness Report',
  };
  document.getElementById('topbar-title').textContent = titles[sectionId] || 'WALL·E';

  // Build charts only when dashboard is visible (avoids hidden-canvas issues)
  if (sectionId === 'dashboard') {
    updateDashboardStats();
    setTimeout(buildCharts, 80);
    if (sectionId === 'report') setTimeout(buildReport, 100);
  }

  // Close sidebar on mobile after navigation
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

/** Toggle sidebar (mobile hamburger) */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/** Format current date for topbar */
function setTopbarDate() {
  const now  = new Date();
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  document.getElementById('topbar-date').textContent = now.toLocaleDateString('en-US', opts);
}

/* ============================================================
   4. MOOD TRACKER
============================================================ */

/** Get all mood entries for the current user */
function getMoods() {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.MOODS) || '{}');
  return all[currentUser.username] || [];
}

/** Save moods for current user */
function saveMoods(moods) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.MOODS) || '{}');
  all[currentUser.username] = moods;
  localStorage.setItem(STORAGE_KEYS.MOODS, JSON.stringify(all));
}

/** Handle mood button selection */
function selectMood(btn) {
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedMood = { label: btn.dataset.mood, score: parseInt(btn.dataset.score) };
}

/** Log today's mood entry */
function logMood() {
  const msgEl = document.getElementById('mood-saved-msg');
  if (!selectedMood) { msgEl.textContent = '⚠ Please select a mood first.'; msgEl.style.color = 'var(--coral)'; return; }

  const note  = document.getElementById('mood-note').value.trim();
  const entry = {
    id:        Date.now(),
    mood:      selectedMood.label,
    score:     selectedMood.score,
    note:      note,
    timestamp: new Date().toISOString(),
  };

  const moods = getMoods();
  moods.unshift(entry);   // newest first
  saveMoods(moods);

  // Reset UI
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('mood-note').value = '';
  selectedMood = null;

  msgEl.textContent = '✓ Mood logged successfully!';
  msgEl.style.color = 'var(--mint)';
  setTimeout(() => { msgEl.textContent = ''; }, 3000);

  renderMoodHistory();
  updateDashboardStats();
  updateWellnessScore();
}

/** Delete a mood entry */
function deleteMoodEntry(id) {
  const moods = getMoods().filter(m => m.id !== id);
  saveMoods(moods);
  renderMoodHistory();
  updateDashboardStats();
}

/** Render the mood history list */
function renderMoodHistory() {
  const container = document.getElementById('mood-history-list');
  const moods     = getMoods();

  if (!moods.length) {
    container.innerHTML = '<p class="empty-state">No mood entries yet. Log your first mood above!</p>';
    return;
  }

  container.innerHTML = moods.slice(0, 20).map(m => {
    const dt  = new Date(m.timestamp);
    const day = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const hr  = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="mood-entry">
        <span class="mood-entry-emoji">${MOOD_EMOJIS[m.mood]}</span>
        <div class="mood-entry-info">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="mood-entry-label">${m.mood}</span>
            <span class="mood-badge ${m.mood}">${m.mood}</span>
          </div>
          ${m.note ? `<p class="mood-entry-note">"${m.note}"</p>` : ''}
        </div>
        <span class="mood-entry-time">${day} · ${hr}</span>
        <button class="mood-entry-delete" onclick="deleteMoodEntry(${m.id})" title="Delete">✕</button>
      </div>
    `;
  }).join('');
}

/* ============================================================
   5. DASHBOARD & CHARTS
============================================================ */

/** Update the 4 stat cards on the dashboard */
function updateDashboardStats() {
  const moods   = getMoods();
  const journal = getJournalEntries();
  const habits  = getHabits();
  const todayKey = todayDateKey();

  // Today's mood
  const todayMood = moods.find(m => m.timestamp.startsWith(todayKey.slice(0, 10)));
  document.getElementById('stat-today-mood').textContent =
    todayMood ? `${MOOD_EMOJIS[todayMood.mood]} ${todayMood.mood}` : '— Not logged';

  // Journal count
  document.getElementById('stat-journal-count').textContent = journal.length;

  // Habit completion today
  const habitLog    = getHabitLog();
  const todayDone   = habits.filter(h => (habitLog[todayKey] || []).includes(h.id));
  document.getElementById('stat-habits-today').textContent =
    `${todayDone.length}/${habits.length}`;

  // Streak: consecutive days with at least 1 habit done
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dateKey(d);
    if ((habitLog[key] || []).length > 0) streak++;
    else if (i > 0) break;
  }
  document.getElementById('stat-streak').textContent = `${streak} day${streak !== 1 ? 's' : ''}`;
}

/** Build / rebuild all three Chart.js charts */
function buildCharts() {
  buildMoodTrendChart();
  buildMoodDistChart();
  buildHabitChart();
}

/** Line chart: mood score over last 7 days */
function buildMoodTrendChart() {
  const canvas = document.getElementById('moodTrendChart');
  if (!canvas) return;

  if (moodTrendChart) { moodTrendChart.destroy(); }

  const labels = [];
  const data   = [];
  const moods  = getMoods();

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key   = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    labels.push(label);

    // Average score for that day
    const dayMoods = moods.filter(m => m.timestamp.startsWith(key));
    const avg = dayMoods.length
      ? (dayMoods.reduce((s, m) => s + m.score, 0) / dayMoods.length).toFixed(1)
      : null;
    data.push(avg);
  }

  moodTrendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Mood Score',
        data,
        borderColor: '#52e3c2',
        backgroundColor: 'rgba(82,227,194,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#52e3c2',
        pointBorderColor: '#051015',
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.4,
        fill: true,
        spanGaps: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { min: 1, max: 5, ticks: { color: '#7b8cad', stepSize: 1,
          callback: v => ['','😢','😰','😐','😌','😊'][v] || v },
          grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { ticks: { color: '#7b8cad', maxRotation: 30 },
             grid: { color: 'rgba(255,255,255,0.04)' } },
      },
      plugins: { legend: { display: false },
        tooltip: { callbacks: {
          label: ctx => `Score: ${ctx.parsed.y} (${['','Sad','Stressed','Neutral','Calm','Happy'][Math.round(ctx.parsed.y)] || ''})`
        }}
      },
    }
  });
}

/** Doughnut chart: mood distribution */
function buildMoodDistChart() {
  const canvas = document.getElementById('moodDistChart');
  if (!canvas) return;
  if (moodDistChart) { moodDistChart.destroy(); }

  const moods  = getMoods();
  const counts = { Happy: 0, Calm: 0, Neutral: 0, Stressed: 0, Sad: 0 };
  moods.forEach(m => { if (counts[m.mood] !== undefined) counts[m.mood]++; });

  moodDistChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: ['rgba(251,191,36,0.75)','rgba(56,189,248,0.75)','rgba(148,163,184,0.6)','rgba(167,139,250,0.75)','rgba(251,113,133,0.75)'],
        borderColor:     ['#fbbf24','#38bdf8','#94a3b8','#a78bfa','#fb7185'],
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'right', labels: { color: '#7b8cad', padding: 14, font: { family: 'Nunito', size: 12 } } },
      }
    }
  });
}

/** Bar chart: habit completion per day (last 7 days) */
function buildHabitChart() {
  const canvas = document.getElementById('habitChart');
  if (!canvas) return;
  if (habitChart) { habitChart.destroy(); }

  const habits   = getHabits();
  const habitLog = getHabitLog();
  const labels   = [];
  const data     = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    const pct = habits.length
      ? Math.round(((habitLog[key] || []).length / habits.length) * 100)
      : 0;
    data.push(pct);
  }

  habitChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Completion %',
        data,
        backgroundColor: data.map(v => v >= 80 ? 'rgba(82,227,194,0.6)' : v >= 50 ? 'rgba(251,191,36,0.5)' : 'rgba(167,139,250,0.45)'),
        borderColor:     data.map(v => v >= 80 ? '#52e3c2' : v >= 50 ? '#fbbf24' : '#a78bfa'),
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 100, ticks: { color: '#7b8cad', callback: v => v + '%' },
             grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { ticks: { color: '#7b8cad' }, grid: { display: false } },
      },
      plugins: { legend: { display: false } }
    }
  });
}

/* ============================================================
   6. AI CHAT COMPANION
============================================================ */

/* ── Response Corpus ──────────────────────────────────────── */
// These keyword → response arrays form WALL·E's personality.
// Responses are chosen randomly from each array.

const CHAT_RESPONSES = {
  greeting: [
    "Hey there! 😊 I'm WALL·E, your mental wellness companion. How are you feeling today?",
    "Hello! It's wonderful to see you. What's on your mind today?",
    "Hi! I'm really glad you stopped by. How's your day going so far?",
    "Good to hear from you! I'm here to listen — what's up?",
  ],
  happy: [
    "That's absolutely wonderful to hear! 🌟 Happiness is precious — what's bringing you joy today?",
    "Amazing! Your positive energy is contagious 😊. What's making you feel so great?",
    "Love that! Savor these happy moments. Is there something specific that's going well?",
    "Happiness looks great on you! ✨ Would you like to journal about what's making you feel this way?",
  ],
  calm: [
    "Feeling calm is such a gift 😌. What's helping you maintain that peace?",
    "That's wonderful — calmness is the foundation of wellbeing. Have you been meditating or doing anything special?",
    "Peaceful moments are worth appreciating. Keep nurturing that inner stillness! 🌿",
  ],
  sad: [
    "I'm really sorry to hear you're feeling sad. 💙 It's okay — sadness is a natural emotion. Would you like to talk about what's going on?",
    "Sadness can feel heavy, but you don't have to carry it alone. I'm here with you. What's making you feel this way?",
    "Thank you for sharing that with me. Feeling sad is valid. Sometimes it helps to write about it in your journal — would you like to try?",
    "I hear you. 💙 Your feelings matter. Take a gentle breath with me — in through the nose, out through the mouth. Can you tell me more?",
  ],
  stressed: [
    "Stress is really tough 😔. Let's try a quick breathing exercise together — breathe in for 4 seconds, hold for 7, breathe out for 8. Better?",
    "I can feel the weight in your words. Stress is your body's signal to slow down. What's the biggest thing weighing on you right now?",
    "When we're stressed, small steps help. What's one tiny thing you could take off your plate today?",
    "You've handled every difficult day so far — 100% success rate! 💪 Let's work through this together.",
  ],
  anxious: [
    "Anxiety is so hard to sit with. 🫂 Try grounding yourself: name 5 things you can see around you right now.",
    "I hear you. Anxiety often comes from uncertainty. Let's take this one breath at a time — you're safe right now.",
    "Deep breath first 🌬️. You are not your anxiety. What's been triggering these feelings?",
  ],
  tired: [
    "Rest is genuinely productive — your mind and body need recovery time. 😴 How has your sleep been lately?",
    "Tiredness is a signal. When did you last do something purely relaxing and joyful?",
    "Try a short 10-minute nap or a walk outside. Nature + movement is a reset button for the mind. 🌿",
  ],
  lonely: [
    "Loneliness is one of the most human feelings there is. 💙 I'm here with you right now. What would help you feel more connected today?",
    "You're not alone in feeling lonely — and I mean that literally, I'm right here. 🤖 Who in your life would you love to reconnect with?",
    "Even a small act of connection — a text to a friend, a smile to a stranger — can shift loneliness. What feels manageable today?",
  ],
  angry: [
    "It's completely okay to feel angry. Your feelings are valid. 🌊 What happened?",
    "Anger often protects something we care about. What's underneath the anger for you right now?",
    "Let it out! 💨 (In a healthy way, of course.) Writing it down in your journal can be really releasing.",
  ],
  meditation: [
    "Meditation is one of the most powerful wellness tools 🧘. Even 5 minutes a day can reduce anxiety and improve focus. Try the breathing exercise in the Insights section!",
    "Great choice! Start with just 5 minutes of focused breathing. Sit comfortably, close your eyes, and follow your breath. No perfect way to do it!",
    "I love that you're thinking about meditation. Box breathing is a great start: 4 counts in, 4 hold, 4 out, 4 hold. Repeat 4 times.",
  ],
  exercise: [
    "Exercise is mental health medicine 🏃! Even a 20-minute walk significantly improves mood. What kind of movement do you enjoy?",
    "Movement releases endorphins — nature's mood boosters! 💪 Is there a form of exercise that feels joyful rather than a chore for you?",
    "Consistency over intensity! Three 10-minute walks beat one hour at the gym that leaves you exhausted. What's realistic for you?",
  ],
  sleep: [
    "Sleep is the foundation of mental wellness 😴. Aim for 7-9 hours and a consistent bedtime. Are you getting enough rest?",
    "Your brain processes emotions during sleep — poor sleep literally makes emotions harder to regulate. What's your bedtime routine like?",
    "Try the 4-7-8 breathing technique before bed: inhale 4s, hold 7s, exhale 8s. It activates your parasympathetic nervous system.",
  ],
  gratitude: [
    "Gratitude is scientifically proven to rewire the brain toward positivity 🌟. What are three things, however small, you're grateful for today?",
    "Love that energy! Gratitude journaling for just 5 minutes a day can measurably improve wellbeing within weeks.",
    "What a beautiful practice. Even the tiniest things count — warm coffee, a comfortable bed, the fact that you're here. ✨",
  ],
  help: [
    "I'm here to support your mental wellness journey 💙. You can: track your moods, write in your journal, build healthy habits, or just chat with me. What would help you most right now?",
    "Of course! WALL·E is your wellness companion. Tell me how you're feeling, log your mood in the Mood Tracker, write in your Journal, or check your Habits. What do you need?",
  ],
  default: [
    "Tell me more about that. I'm fully here for you. 💙",
    "That's really interesting. How does that make you feel?",
    "I appreciate you sharing that with me. What's been the hardest part?",
    "You're doing great by talking about this. What would feel most helpful right now?",
    "I hear you. It takes courage to open up. What's been on your mind most today?",
    "Your feelings make complete sense. What would you like to explore together?",
    "Thank you for trusting me with that. What do you think you need most right now?",
  ],
  goodbye: [
    "Take good care of yourself! 🌟 Remember: you deserve kindness — especially from yourself. See you soon!",
    "It was lovely chatting! Go be gentle with yourself today. 💙",
    "Goodbye for now! Your wellbeing matters — don't forget to log your mood and drink some water! 💧",
  ],
  journal: [
    "Journaling is one of the most powerful tools for emotional processing 📓. Head to the Journal section and write out what's on your mind — you'll feel lighter!",
    "Writing about your feelings helps your brain make sense of them. The Journal section is ready whenever you are!",
  ],
  habit: [
    "Small consistent actions compound into big change 🌱. Check out the Habit Tracker — even logging one habit today is progress!",
    "What wellness habit would you most like to build? The Habit Tracker can help you stay consistent!",
  ],
  positive: [
    "That's a beautiful perspective 🌟. Moments of clarity like this are worth holding onto.",
    "Yes! That kind of thinking is so healthy. How can we build on that momentum?",
    "Love that energy! ✨ What's been contributing to this positivity?",
  ],
  affirmation: [
    "Here's one for you: 'I am enough, exactly as I am, right now.' 💙",
    "'Every day is a new beginning. Take a deep breath and start again.' 🌿",
    "'You have survived 100% of your worst days. You are stronger than you know.' ✨",
    "'Small steps forward are still steps forward.' 🌟",
  ],
  crisis: [
    "I'm really concerned about what you've shared. Please know you're not alone. 💙 Please reach out to a crisis helpline — in India: iCall: 9152987821. You deserve real support right now.",
    "What you're feeling sounds very serious and I want to make sure you get real help. Please contact a mental health professional or a crisis line. You matter.",
  ]
};

/** Select a random response from an array */
function randomResponse(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Detect intent from user message */
function detectIntent(msg) {
  const m = msg.toLowerCase();

  // Crisis detection (highest priority)
  if (/suicid|kill myself|end my life|don't want to live|harm myself|self.?harm/.test(m)) return 'crisis';

  // Greetings
  if (/^(hi|hey|hello|good morning|good evening|good afternoon|sup|yo|howdy)\b/.test(m)) return 'greeting';

  // Goodbyes
  if (/\b(bye|goodbye|see you|take care|later|cya|goodnight|good night)\b/.test(m)) return 'goodbye';

  // Emotions
  if (/\b(happy|great|amazing|wonderful|excited|fantastic|joyful|ecstatic|good|awesome)\b/.test(m)) return 'happy';
  if (/\b(calm|peaceful|relaxed|at peace|serene|content|tranquil)\b/.test(m)) return 'calm';
  if (/\b(sad|depressed|down|unhappy|miserable|heartbroken|blue|grief|crying|cry)\b/.test(m)) return 'sad';
  if (/\b(stress|stressed|overwhelm|overload|pressure|burnout|too much)\b/.test(m)) return 'stressed';
  if (/\b(anxious|anxiety|worried|worry|nervous|panic|fear|scared|dread)\b/.test(m)) return 'anxious';
  if (/\b(tired|exhausted|fatigue|drained|worn out|sleepy|no energy)\b/.test(m)) return 'tired';
  if (/\b(lonely|alone|isolated|nobody|no one|friendless)\b/.test(m)) return 'lonely';
  if (/\b(angry|mad|furious|rage|irritated|frustrated|annoyed)\b/.test(m)) return 'angry';

  // Topics
  if (/\b(meditat|mindful|breath|breathing|zen)\b/.test(m)) return 'meditation';
  if (/\b(exercise|workout|run|walk|gym|sport|fitness|yoga|move)\b/.test(m)) return 'exercise';
  if (/\b(sleep|insomnia|rest|tired|nap|bedtime)\b/.test(m)) return 'sleep';
  if (/\b(grateful|gratitude|thankful|appreciate|blessed)\b/.test(m)) return 'gratitude';
  if (/\b(journal|write|diary|reflect)\b/.test(m)) return 'journal';
  if (/\b(habit|routine|track|consistency|daily)\b/.test(m)) return 'habit';
  if (/\b(affirmation|affirm|mantra|positive saying)\b/.test(m)) return 'affirmation';
  if (/\b(help|what can you do|how does this work|support)\b/.test(m)) return 'help';

  // Positivity signals
  if (/\b(love|life is good|doing well|feeling good|positive|optimistic)\b/.test(m)) return 'positive';

  return 'default';
}

/** Generate AI response */
function generateAIResponse(userMessage) {
    const intent = detectIntent(userMessage);
    let response = randomResponse(CHAT_RESPONSES[intent] || CHAT_RESPONSES.default);
    const moods = getMoods();
    if (moods.length && intent === 'default') {
      const last = moods[0];
      if (last.mood === 'Sad' || last.mood === 'Stressed')
        response += ' I noticed your mood log shows you\'ve been ' + last.mood.toLowerCase() + '. Would you like to explore that more?';
    }
    if (intent !== 'crisis') response = applyPersonality(response);
    return response;
   }
 

/** Get chat history from localStorage */
function getChatHistory() {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT) || '{}');
  return all[currentUser.username] || [];
}

/** Save chat history */
function saveChatHistory(history) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT) || '{}');
  all[currentUser.username] = history.slice(-80); // keep last 80 messages
  localStorage.setItem(STORAGE_KEYS.CHAT, JSON.stringify(all));
}

/** Initialise chat on app load */
function initChat() {
  const container = document.getElementById('chat-messages');
  const history   = getChatHistory();

  if (!history.length) {
    // Welcome message
    const welcome = {
      role: 'bot',
      text: `Hello ${currentUser.name.split(' ')[0]}! 👋 I'm WALL·E, your personal AI mental wellness companion. I'm here to listen, support, and guide you on your journey to emotional wellbeing. How are you feeling today?`,
      time: new Date().toISOString(),
    };
    saveChatHistory([welcome]);
    renderChatMessage(welcome, container);
  } else {
    container.innerHTML = '';
    history.forEach(msg => renderChatMessage(msg, container));
    container.scrollTop = container.scrollHeight;
  }
}

/** Render a single chat message */
function renderChatMessage(msg, container) {
  const isUser = msg.role === 'user';
  const time   = new Date(msg.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const wrapper = document.createElement('div');
  wrapper.className = `chat-msg ${isUser ? 'user' : 'bot'}`;
  wrapper.innerHTML = `
    <div class="chat-msg-avatar">${isUser ? currentUser.name[0].toUpperCase() : '🤖'}</div>
    <div>
      <div class="chat-bubble">${escapeHtml(msg.text)}</div>
      <div class="chat-msg-time">${time}</div>
    </div>
  `;
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

/** Escape HTML to prevent XSS */
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Show typing animation */
function showTypingIndicator(container) {
  const el = document.createElement('div');
  el.id = 'typing-indicator';
  el.className = 'chat-msg bot';
  el.innerHTML = `
    <div class="chat-msg-avatar">🤖</div>
    <div class="chat-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

/** Send user message */
function sendMessage() {
  const input     = document.getElementById('chat-input');
  const container = document.getElementById('chat-messages');
  const text      = input.value.trim();
  if (!text) return;

  // Render user message
  const userMsg = { role: 'user', text, time: new Date().toISOString() };
  renderChatMessage(userMsg, container);

  // Save to history
  const history = getChatHistory();
  history.push(userMsg);
  saveChatHistory(history);

  input.value = '';
  input.style.height = 'auto';

  // Show typing indicator
  showTypingIndicator(container);

  // Simulate AI response delay (700–1600ms)
  const delay = 700 + Math.random() * 900;
  setTimeout(() => {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();

    const responseText = generateAIResponse(text);
    const botMsg = { role: 'bot', text: responseText, time: new Date().toISOString() };
    renderChatMessage(botMsg, container);

    const hist = getChatHistory();
    hist.push(botMsg);
    saveChatHistory(hist);
  }, delay);
}

/** Allow Enter (without Shift) to send message */
function chatKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

/** Clear chat history */
function clearChat() {
  if (!confirm('Clear all chat history?')) return;
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT) || '{}');
  delete all[currentUser.username];
  localStorage.setItem(STORAGE_KEYS.CHAT, JSON.stringify(all));
  initChat();
}

/* ============================================================
   7. JOURNAL SYSTEM
============================================================ */

/** Get journal entries for current user */
function getJournalEntries() {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.JOURNAL) || '{}');
  return all[currentUser.username] || [];
}

/** Save journal entries */
function saveJournalEntries(entries) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.JOURNAL) || '{}');
  all[currentUser.username] = entries;
  localStorage.setItem(STORAGE_KEYS.JOURNAL, JSON.stringify(all));
}

/** Save a new or edited journal entry */
function saveJournalEntry() {
  const title   = document.getElementById('journal-title').value.trim();
  const body    = document.getElementById('journal-body').value.trim();
  const msgEl   = document.getElementById('journal-saved-msg');

  if (!title) { msgEl.textContent = '⚠ Please add a title.'; msgEl.style.color = 'var(--coral)'; return; }
  if (!body)  { msgEl.textContent = '⚠ Please write something.'; msgEl.style.color = 'var(--coral)'; return; }

  const entries = getJournalEntries();

  if (editingJournalId) {
    // Update existing
    const idx = entries.findIndex(e => e.id === editingJournalId);
    if (idx !== -1) { entries[idx].title = title; entries[idx].body = body; entries[idx].edited = new Date().toISOString(); }
    clearJournalForm();
  } else {
    // New entry
    entries.unshift({ id: Date.now(), title, body, timestamp: new Date().toISOString() });
  }

  saveJournalEntries(entries);
  clearJournalForm();
  renderJournalList();
  updateDashboardStats();
  updateWellnessScore();

  msgEl.textContent = '✓ Entry saved!';
  msgEl.style.color = 'var(--mint)';
  setTimeout(() => { msgEl.textContent = ''; }, 2500);
}

/** Clear the journal form */
function clearJournalForm() {
  document.getElementById('journal-title').value = '';
  document.getElementById('journal-body').value  = '';
  document.getElementById('journal-form-title').textContent = 'New Entry';
  document.getElementById('journal-cancel-btn').style.display = 'none';
  editingJournalId = null;
}

/** Load a journal entry into the edit form */
function editJournalEntry(id) {
  const entry = getJournalEntries().find(e => e.id === id);
  if (!entry) return;
  document.getElementById('journal-title').value = entry.title;
  document.getElementById('journal-body').value  = entry.body;
  document.getElementById('journal-form-title').textContent = 'Edit Entry';
  document.getElementById('journal-cancel-btn').style.display = 'inline-block';
  editingJournalId = id;
  // Scroll form into view on mobile
  document.querySelector('.journal-write-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Delete a journal entry */
function deleteJournalEntry(id) {
  if (!confirm('Delete this journal entry?')) return;
  saveJournalEntries(getJournalEntries().filter(e => e.id !== id));
  renderJournalList();
  updateDashboardStats();
}

/** Render journal entries list */
function renderJournalList() {
  const container = document.getElementById('journal-entries-list');
  const entries   = getJournalEntries();

  if (!entries.length) {
    container.innerHTML = '<p class="empty-state">No journal entries yet. Write your first reflection!</p>';
    return;
  }

  container.innerHTML = entries.map(e => {
    const dt      = new Date(e.timestamp);
    const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const preview = e.body.length > 100 ? e.body.slice(0, 100) + '…' : e.body;
    return `
      <div class="journal-entry">
        <div class="journal-entry-header">
          <span class="journal-entry-title">${escapeHtml(e.title)}</span>
          <span class="journal-entry-date">${dateStr}</span>
        </div>
        <p class="journal-entry-preview">${escapeHtml(preview)}</p>
        <div class="journal-entry-actions">
          <button class="btn-tiny edit" onclick="editJournalEntry(${e.id})">✎ Edit</button>
          <button class="btn-tiny del"  onclick="deleteJournalEntry(${e.id})">✕ Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ============================================================
   8. HABIT TRACKER
============================================================ */

/** Get all habits for current user */
function getHabits() {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.HABITS) || '{}');
  return all[currentUser.username] || [];
}

/** Save habits */
function saveHabits(habits) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.HABITS) || '{}');
  all[currentUser.username] = habits;
  localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(all));
}

/** Get habit completion log { dateKey: [habitId, ...] } */
function getHabitLog() {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.HABIT_LOG) || '{}');
  return all[currentUser.username] || {};
}

/** Save habit log */
function saveHabitLog(log) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.HABIT_LOG) || '{}');
  all[currentUser.username] = log;
  localStorage.setItem(STORAGE_KEYS.HABIT_LOG, JSON.stringify(all));
}

/** Date key in YYYY-MM-DD format */
function dateKey(d) { return d.toISOString().slice(0, 10); }
function todayDateKey() { return dateKey(new Date()); }

/** Add a new habit */
function addHabit() {
  const input  = document.getElementById('new-habit-input');
  const icon   = document.getElementById('new-habit-icon').value;
  const name   = input.value.trim();
  if (!name) { input.focus(); return; }

  const habits = getHabits();
  habits.push({ id: Date.now(), name, icon });
  saveHabits(habits);
  input.value = '';
  renderHabits();
  renderStreaks();
  updateDashboardStats();
  updateWellnessScore();
}

/** Toggle habit completion for today */
function toggleHabit(id) {
  const log     = getHabitLog();
  const key     = todayDateKey();
  const todayLog = log[key] || [];

  if (todayLog.includes(id)) {
    log[key] = todayLog.filter(i => i !== id);
  } else {
    log[key] = [...todayLog, id];
  }
  saveHabitLog(log);
  renderHabits();
  renderStreaks();
  updateDashboardStats();
  updateWellnessScore();
}

/** Delete a habit */
function deleteHabit(id) {
  saveHabits(getHabits().filter(h => h.id !== id));
  renderHabits();
  renderStreaks();
  updateDashboardStats();
}

/** Render the habits list */
function renderHabits() {
  const container = document.getElementById('habits-list');
  const habits    = getHabits();
  const log       = getHabitLog();
  const todayDone = log[todayDateKey()] || [];

  if (!habits.length) {
    container.innerHTML = '<p class="empty-state">No habits yet. Add your first wellness habit above!</p>';
    return;
  }

  container.innerHTML = habits.map(h => {
    const done = todayDone.includes(h.id);
    return `
      <div class="habit-item ${done ? 'done' : ''}">
        <div class="habit-checkbox" onclick="toggleHabit(${h.id})">${done ? '✓' : ''}</div>
        <span class="habit-icon">${h.icon}</span>
        <span class="habit-name">${escapeHtml(h.name)}</span>
        <button class="habit-delete" onclick="deleteHabit(${h.id})" title="Delete habit">✕</button>
      </div>
    `;
  }).join('');
}

/** Calculate streak for a habit */
function calcHabitStreak(habitId) {
  const log = getHabitLog();
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dateKey(d);
    if ((log[key] || []).includes(habitId)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

/** Render the streaks panel */
function renderStreaks() {
  const container = document.getElementById('streaks-list');
  const habits    = getHabits();

  const withStreaks = habits
    .map(h => ({ ...h, streak: calcHabitStreak(h.id) }))
    .filter(h => h.streak > 0)
    .sort((a, b) => b.streak - a.streak);

  if (!withStreaks.length) {
    container.innerHTML = '<p class="empty-state">Complete habits to build your streak!</p>';
    return;
  }

  container.innerHTML = withStreaks.map(h => `
    <div class="streak-card">
      <span class="streak-icon">${h.icon}</span>
      <div>
        <div class="streak-name">${escapeHtml(h.name)}</div>
        <div class="streak-count">🔥 ${h.streak} day${h.streak !== 1 ? 's' : ''}</div>
      </div>
    </div>
  `).join('');
}

/* ============================================================
   9. RECOMMENDATIONS & AFFIRMATIONS
============================================================ */

const RECOMMENDATIONS = {
  Happy: [
    { icon: '📓', title: 'Capture this moment', desc: 'Write in your journal while you\'re feeling this way — positive memories are powerful anchors for harder days.', type: 'boost' },
    { icon: '🤝', title: 'Spread the good vibes', desc: 'Share your happiness with someone. Call a friend, send a kind message, or pay a compliment.', type: 'boost' },
    { icon: '🏆', title: 'Set an ambitious goal', desc: 'Positive moods boost creative thinking. Use this energy to plan something exciting!', type: 'boost' },
  ],
  Calm: [
    { icon: '🧘', title: 'Deepen your stillness', desc: 'Your calm state is perfect for meditation. Try 10 minutes of mindful breathing to anchor this peace.', type: 'calm' },
    { icon: '📚', title: 'Read something enriching', desc: 'A calm mind absorbs learning beautifully. Pick up that book you\'ve been meaning to start.', type: 'calm' },
    { icon: '🌿', title: 'Connect with nature', desc: 'A gentle walk outside in your calm state can deepen your sense of groundedness.', type: 'calm' },
  ],
  Neutral: [
    { icon: '🎯', title: 'Set a small intention', desc: 'Neutral days are perfect for gentle progress. Pick one small task and complete it with full attention.', type: 'boost' },
    { icon: '💧', title: 'Hydrate & nourish', desc: 'Sometimes a neutral mood is our body asking for basic care. Drink water, eat well, move a little.', type: 'calm' },
    { icon: '😊', title: 'Do something pleasurable', desc: 'A neutral mood can tip either way — nudge it positive with something you genuinely enjoy.', type: 'boost' },
  ],
  Stressed: [
    { icon: '🌬️', title: '4-7-8 Breathing', desc: 'Inhale for 4 seconds, hold for 7, exhale for 8. This activates your parasympathetic nervous system and reduces stress hormones.', type: 'stress' },
    { icon: '✅', title: 'Brain dump your tasks', desc: 'Write down everything stressing you. The act of externalising thoughts reduces the mental load significantly.', type: 'stress' },
    { icon: '🎵', title: 'Listen to calming music', desc: 'Music with 60 BPM synchronises with your brainwaves to induce calm. Try ambient or classical music.', type: 'stress' },
    { icon: '🚶', title: 'Take a 10-minute walk', desc: 'Physical movement is the fastest way to metabolise stress hormones. Even a brief walk resets your nervous system.', type: 'stress' },
  ],
  Sad: [
    { icon: '💙', title: 'Be gentle with yourself', desc: 'Sadness is not weakness — it\'s the heart\'s way of processing. You don\'t need to fix it; just be with it.', type: 'sad' },
    { icon: '🤗', title: 'Reach out to someone', desc: 'A trusted friend, family member, or counsellor can hold space for you. You don\'t have to carry this alone.', type: 'sad' },
    { icon: '📓', title: 'Write out your feelings', desc: 'Journaling sadness helps your brain process and release it. Start with "Today I feel..." and let it flow.', type: 'sad' },
    { icon: '☀️', title: 'Get some sunlight', desc: 'Sunlight triggers serotonin production. Even 10 minutes outside can gently lift your mood.', type: 'sad' },
  ],
};

/** Display mood-based recommendations */
function renderRecommendations() {
  const container = document.getElementById('recommendations-container');
  const moods     = getMoods();

  // Determine dominant mood from last 3 entries
  let dominantMood = 'Neutral';
  if (moods.length) {
    const recent = moods.slice(0, 3);
    const freq   = {};
    recent.forEach(m => { freq[m.mood] = (freq[m.mood] || 0) + 1; });
    dominantMood = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
  }

  const recs = RECOMMENDATIONS[dominantMood] || RECOMMENDATIONS.Neutral;

  const moodLabel = `<div style="margin-bottom:16px;">
    <span style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">
      Recommendations based on your recent mood:
    </span>
    <span class="mood-badge ${dominantMood}" style="margin-left:8px;">${MOOD_EMOJIS[dominantMood]} ${dominantMood}</span>
  </div>`;

  container.innerHTML = moodLabel + recs.map(r => `
    <div class="rec-card type-${r.type}">
      <div class="rec-card-icon">${r.icon}</div>
      <div class="rec-card-title">${r.title}</div>
      <div class="rec-card-desc">${r.desc}</div>
    </div>
  `).join('');
}

const AFFIRMATIONS = [
  '"I am enough, exactly as I am, right now."',
  '"Every storm runs out of rain. This too shall pass."',
  '"I have survived 100% of my hardest days. I am stronger than I know."',
  '"Small steps forward are still steps forward."',
  '"I deserve rest, joy, and kindness — especially from myself."',
  '"My feelings are valid. My experience matters."',
  '"I am not my thoughts. I am the one who observes them."',
  '"Today I choose progress over perfection."',
  '"I am worthy of love and belonging, always."',
  '"Growth is not linear, and that is perfectly okay."',
  '"I release what I cannot control and focus on what I can."',
  '"Each breath is a fresh start."',
  '"I am doing the best I can with what I have, and that is enough."',
  '"Vulnerability is not weakness — it is the birthplace of connection."',
  '"My mental health is worth every effort I put into it."',
];

let lastAffirmationIndex = -1;

/** Render a random affirmation (no repeats back-to-back) */
function renderAffirmation() {
  let idx;
  do { idx = Math.floor(Math.random() * AFFIRMATIONS.length); } while (idx === lastAffirmationIndex);
  lastAffirmationIndex = idx;
  document.getElementById('affirmation-text').textContent = AFFIRMATIONS[idx];
}

function newAffirmation() { renderAffirmation(); }

/* ============================================================
   10. BREATHING EXERCISE (4-7-8 Technique)
============================================================ */

const BREATH_PHASES = [
  { label: 'Inhale',  class: 'inhale', duration: 4000, desc: 'Breathe in slowly through your nose... (4 seconds)' },
  { label: 'Hold',    class: 'hold',   duration: 7000, desc: 'Hold your breath gently... (7 seconds)' },
  { label: 'Exhale',  class: 'exhale', duration: 8000, desc: 'Breathe out completely through your mouth... (8 seconds)' },
];

let breathPhaseIndex = 0;
let breathCycles     = 0;
const MAX_CYCLES     = 4;

document.addEventListener('DOMContentLoaded', () => {
  const circle = document.getElementById('breathing-circle');
  if (circle) circle.addEventListener('click', toggleBreathing);
});

function toggleBreathing() {
  if (breathingActive) {
    stopBreathing();
  } else {
    startBreathing();
  }
}

function startBreathing() {
  breathingActive  = true;
  breathPhaseIndex = 0;
  breathCycles     = 0;
  runBreathPhase();
}

function runBreathPhase() {
  if (!breathingActive) return;
  if (breathCycles >= MAX_CYCLES) { stopBreathing(); return; }

  const phase  = BREATH_PHASES[breathPhaseIndex];
  const circle = document.getElementById('breathing-circle');
  const label  = document.getElementById('breathing-label');
  const instr  = document.getElementById('breathing-instruction');

  // Update classes
  circle.className = `breathing-circle ${phase.class}`;
  label.textContent  = phase.label;
  instr.textContent  = phase.desc;

  breathingTimer = setTimeout(() => {
    breathPhaseIndex = (breathPhaseIndex + 1) % BREATH_PHASES.length;
    if (breathPhaseIndex === 0) breathCycles++;
    runBreathPhase();
  }, phase.duration);
}

function stopBreathing() {
  clearTimeout(breathingTimer);
  breathingActive = false;
  const circle = document.getElementById('breathing-circle');
  const label  = document.getElementById('breathing-label');
  const instr  = document.getElementById('breathing-instruction');
  circle.className      = 'breathing-circle';
  label.textContent     = 'Tap to Start';
  instr.textContent     = breathCycles >= MAX_CYCLES
    ? '✓ Session complete! Great job. You should feel calmer now.'
    : 'Click the circle to begin a guided breathing session.';
}

/* ============================================================
   11. INITIALIZATION
============================================================ */

/** Check for existing session on page load */
function init() {
  const saved = localStorage.getItem(STORAGE_KEYS.CURRENT);
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      launchApp();
    } catch {
      localStorage.removeItem(STORAGE_KEYS.CURRENT);
    }
  }
  // Seed demo account if no users exist
  const users = getUsers();
  if (!Object.keys(users).length) {
    users['demo'] = { name: 'Demo User', password: btoa('demo1234') };
    saveUsers(users);
  }
}
function updateWellnessScore() {
   const score = calcWellnessScore();

   const scoreEl = document.getElementById('wellnessScore');

   if(scoreEl){
       scoreEl.textContent = score + "%";
   }
}
const PERSONALITY_CONFIG = {
  friend: {
    name:  'Friend Mode', icon: '😊', color: 'var(--mint)',
    prefixes: ['Hey! ', 'Aw, ', 'Oh friend — ', 'Honestly? ', 'You know what? '],
    suffixes: [' You\'ve got this! 💙', ' I\'m always right here for you.', ' Sending you good vibes! ✨', ' You\'re not alone.', ''],
    avatarFace: '🤗', avatarGlow: 'rgba(82,227,194,0.35)', avatarLabel: 'Your supportive friend',
  },
  therapist: {
    name:  'Therapist Mode', icon: '🧠', color: 'var(--violet)',
    prefixes: ['I hear you. ', 'That\'s meaningful. ', 'Let\'s sit with that — ', 'I appreciate you sharing. ', 'I notice '],
    suffixes: [' What comes up for you around that?', ' How long have you felt this way?', ' What do you think that means for you?', ' I wonder what that experience is like.', ''],
    avatarFace: '🧘', avatarGlow: 'rgba(167,139,250,0.35)', avatarLabel: 'Your reflective therapist',
  },
  motivator: {
    name:  'Motivator Mode', icon: '🚀', color: 'var(--amber)',
    prefixes: ['YES! ', 'LISTEN — ', 'This is your moment! ', 'Champions do this: ', 'No limits! '],
    suffixes: [' Now GO! 💪', ' You have everything it takes!', ' The world needs your energy!', ' Every setback is a setup for a comeback!', ''],
    avatarFace: '🔥', avatarGlow: 'rgba(251,191,36,0.4)', avatarLabel: 'Your personal motivator',
  },
};
 
/** Get stored personality mode */
function getPersonality() {
  const all = JSON.parse(localStorage.getItem('walle_personality') || '{}');
  return all[currentUser?.username] || 'friend';
}
 
/** Save personality mode */
function savePersonality(mode) {
  const all = JSON.parse(localStorage.getItem('walle_personality') || '{}');
  all[currentUser.username] = mode;
  localStorage.setItem('walle_personality', JSON.stringify(all));
}
 
/** Apply personality prefix/suffix to a base response */
function applyPersonality(text) {
  const mode = getPersonality();
  const cfg  = PERSONALITY_CONFIG[mode];
  if (!cfg) return text;
  const pre = cfg.prefixes[Math.floor(Math.random() * cfg.prefixes.length)];
  const suf = cfg.suffixes[Math.floor(Math.random() * cfg.suffixes.length)];
  return pre + text + (suf ? ' ' + suf : '');
}
 
/** Set personality from UI — updates buttons, chip, avatar */
function setPersonality(mode) {
  savePersonality(mode);
 
  // Update personality buttons
  document.querySelectorAll('.pbar-btn').forEach(b => {
    b.classList.remove('active', 'mode-friend', 'mode-therapist', 'mode-motivator');
    if (b.dataset.mode === mode) b.classList.add('active', 'mode-' + mode);
  });
 
  // Update chip
  const cfg  = PERSONALITY_CONFIG[mode];
  const chip = document.getElementById('pchip');
  if (chip) {
    chip.textContent = cfg.icon + ' ' + cfg.name;
    chip.style.background   = cfg.color + '18';
    chip.style.borderColor  = cfg.color + '55';
    chip.style.color        = cfg.color;
  }
 
  // Update avatar
  const face = document.getElementById('avatar-face');
  const glow = document.getElementById('avatar-glow');
  const lbl  = document.getElementById('avatar-mood-txt');
  const r1   = document.getElementById('avatar-r1');
  const r2   = document.getElementById('avatar-r2');
  if (face) face.textContent = cfg.avatarFace;
  if (glow) glow.style.background = `radial-gradient(circle, ${cfg.avatarGlow}, transparent 70%)`;
  if (lbl)  lbl.textContent = cfg.avatarLabel;
  if (r1)   r1.style.borderColor = cfg.color + '30';
  if (r2)   r2.style.borderColor = cfg.color + '18';
}
 
/** Initialise personality on login */
function initPersonality() {
  const mode = getPersonality();
  setPersonality(mode);
}
 
/** Update avatar face based on recent mood */
function updateAvatarForMood() {
  const moods = getMoods();
  if (!moods.length) return;
  const latest = moods[0].mood;
  const reactions = {
    Happy:    { face: '🥰', glow: 'rgba(251,191,36,0.4)',  label: 'Sharing your joy!' },
    Calm:     { face: '😌', glow: 'rgba(56,189,248,0.3)',  label: 'At peace with you' },
    Neutral:  { face: '🤖', glow: 'rgba(82,227,194,0.25)', label: 'Ready to listen' },
    Stressed: { face: '😟', glow: 'rgba(167,139,250,0.4)', label: 'Here to help you calm down' },
    Sad:      { face: '🥺', glow: 'rgba(251,113,133,0.35)',label: 'Sending you a hug 💙' },
  };
  const r   = reactions[latest] || reactions.Neutral;
  const face = document.getElementById('avatar-face');
  const glow = document.getElementById('avatar-glow');
  const lbl  = document.getElementById('avatar-mood-txt');
  if (face) face.textContent = r.face;
  if (glow) glow.style.background = `radial-gradient(circle, ${r.glow}, transparent 70%)`;
  if (lbl)  lbl.textContent = r.label;
}/* ─────────────────────────────────────────────────────────
   MODULE 2: WELLNESS SCORE ENGINE
   Formula: Mood×40% + Habits×30% + Journal×20% + Chat×10%
─────────────────────────────────────────────────────────── */
 
function calcWellnessScore() {
  const moods    = getMoods();
  const habits   = getHabits();
  const habitLog = getHabitLog();
  const journal  = getJournalEntries();
  const chat     = getChatHistory();
 
  // Mood: last 7 days avg (1–5 → 0–100%)
  const recentMoods = moods.filter(m => {
    return (Date.now() - new Date(m.timestamp).getTime()) / 86400000 <= 7;
  });
  const moodAvg = recentMoods.length
    ? recentMoods.reduce((s, m) => s + m.score, 0) / recentMoods.length
    : 3;
  const moodPct = Math.round(((moodAvg - 1) / 4) * 100);
 
  // Habits: avg daily completion last 7 days
  let habitSum = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dateKey(d);
    habitSum += habits.length ? ((habitLog[k] || []).length / habits.length) * 100 : 0;
  }
  const habitPct = Math.round(habitSum / 7);
 
  // Journal: entries in last 7 days capped at 7 (1 per day = 100%)
  const journalRecent = journal.filter(e => {
    return (Date.now() - new Date(e.timestamp).getTime()) / 86400000 <= 7;
  });
  const journalPct = Math.min(Math.round((journalRecent.length / 7) * 100), 100);
 
  // Chat: % of last 20 user messages without negative keywords
  const userMsgs = chat.filter(m => m.role === 'user').slice(-20);
  const negKw    = /\b(sad|cry|depress|stress|anxious|angry|lonely|hate|hopeless|worthless|suicid|harm)\b/i;
  const posCount = userMsgs.filter(m => !negKw.test(m.text)).length;
  const chatPct  = userMsgs.length ? Math.round((posCount / userMsgs.length) * 100) : 70;
 
  const total = Math.round(moodPct * 0.4 + habitPct * 0.3 + journalPct * 0.2 + chatPct * 0.1);
  return { total, moodPct, habitPct, journalPct, chatPct };
}
 
function scoreLabel(score) {
  if (score >= 80) return { label: 'Excellent',      emoji: '🌟', color: 'var(--mint)'   };
  if (score >= 60) return { label: 'Balanced',        emoji: '🌤', color: 'var(--sky)'    };
  if (score >= 40) return { label: 'Needs Attention', emoji: '🌥', color: 'var(--amber)'  };
  return                   { label: 'Critical Care',  emoji: '⚠',  color: 'var(--coral)'  };
}
 
function setEl(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
function setW(id, pct)  { const e = document.getElementById(id); if (e) e.style.width = Math.min(pct,100)+'%'; }
 
function updateWellnessScore() {
  const { total, moodPct, habitPct, journalPct, chatPct } = calcWellnessScore();
  const { label, emoji, color } = scoreLabel(total);
 
  // SVG ring (circumference 314 = 2π×50)
  const ring = document.getElementById('ws-ring-fill');
  if (ring) ring.style.strokeDashoffset = 314 - (314 * total / 100);
 
  setEl('ws-score-num', total);
 
  const badge = document.getElementById('ws-status-badge');
  if (badge) {
    badge.textContent       = emoji + ' ' + label;
    badge.style.color       = color;
    badge.style.borderColor = color + '55';
    badge.style.background  = color + '18';
  }
 
  // Breakdown bars
  setW('wb-mood',    moodPct);    setEl('wb-mood-val',    moodPct    + '%');
  setW('wb-habit',   habitPct);   setEl('wb-habit-val',   habitPct   + '%');
  setW('wb-journal', journalPct); setEl('wb-journal-val', journalPct + '%');
  setW('wb-chat',    chatPct);    setEl('wb-chat-val',    chatPct    + '%');
 
  // Tip — highlight the weakest dimension
  const dims = { mood: moodPct, habit: habitPct, journal: journalPct, chat: chatPct };
  const weak = Object.entries(dims).sort((a,b) => a[1]-b[1])[0][0];
  const tips = {
    mood:    '💡 Log your mood daily to boost your score.',
    habit:   '💡 Complete at least one habit per day.',
    journal: '💡 Write a quick journal entry tonight.',
    chat:    '💡 Chat with WALL·E when you need support.',
  };
  setEl('ws-tip', tips[weak] || '');
 
  // Sidebar mini-widget
  setEl('sidebar-ws-val', total + '%');
  const wsBar = document.getElementById('sidebar-ws-bar');
  if (wsBar) wsBar.style.width = total + '%';
  setEl('sidebar-ws-status', emoji + ' ' + label);
 
  // Topbar pill
  setEl('ws-topbar-val', '⬡ ' + total + '%');
 
  return { total, moodPct, habitPct, journalPct, chatPct };
}
/* ─────────────────────────────────────────────────────────
   MODULE 3: GRATITUDE EXERCISE
─────────────────────────────────────────────────────────── */
 
function getGratitude() {
  const all = JSON.parse(localStorage.getItem('walle_gratitude') || '{}');
  return all[currentUser.username] || [];
}
 
function saveGratitudeData(list) {
  const all = JSON.parse(localStorage.getItem('walle_gratitude') || '{}');
  all[currentUser.username] = list;
  localStorage.setItem('walle_gratitude', JSON.stringify(all));
}
 
function saveGratitude() {
  const g1 = document.getElementById('grat-1').value.trim();
  const g2 = document.getElementById('grat-2').value.trim();
  const g3 = document.getElementById('grat-3').value.trim();
  const msg = document.getElementById('grat-msg');
  if (!g1 || !g2 || !g3) { msg.textContent = '⚠ Please fill all 3 items.'; msg.style.color = 'var(--coral)'; return; }
 
  const entry = { id: Date.now(), items: [g1, g2, g3], timestamp: new Date().toISOString() };
  const list  = getGratitude();
  list.unshift(entry);
  saveGratitudeData(list.slice(0, 30));
 
  ['grat-1','grat-2','grat-3'].forEach(id => { document.getElementById(id).value = ''; });
  msg.textContent = '✓ Gratitude saved! 🧠 Your brain thanks you.'; msg.style.color = 'var(--mint)';
  setTimeout(() => { msg.textContent = ''; }, 3000);
  renderGratitudeHistory();
}
 
function renderGratitudeHistory() {
  const container = document.getElementById('grat-history');
  if (!container) return;
  const list = getGratitude().slice(0, 3);
  if (!list.length) { container.innerHTML = ''; return; }
  container.innerHTML =
    '<p style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;font-weight:700;">Recent</p>' +
    list.map(e => {
      const d = new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<div class="grat-entry"><div class="grat-entry-date">${d}</div>${e.items.map(i => `<div>✦ ${escapeHtml(i)}</div>`).join('')}</div>`;
    }).join('');
}
/* ─────────────────────────────────────────────────────────
   MODULE 4: MEDITATION TIMER
─────────────────────────────────────────────────────────── */
 
let medActive      = false;
let medInterval    = null;
let medSecsLeft    = 180;
let medSecsTotal   = 180;
let medPhaseIdx    = 0;
let medPhaseTick   = 0;
 
const MED_PHASES = [
  { label: 'Breathe in…',  secs: 4 },
  { label: 'Hold gently…', secs: 4 },
  { label: 'Breathe out…', secs: 6 },
  { label: 'Rest…',        secs: 2 },
];
 
function pickMedDur(btn, mins) {
  document.querySelectorAll('.med-dur-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (medActive) resetMed();
  medSecsTotal = mins * 60;
  medSecsLeft  = medSecsTotal;
  refreshMedDisplay();
}
 
function refreshMedDisplay() {
  const m = Math.floor(medSecsLeft / 60);
  const s = medSecsLeft % 60;
  setEl('med-time', `${m}:${String(s).padStart(2,'0')}`);
  const prog = document.getElementById('med-prog');
  if (prog) {
    const offset = 314 * (1 - medSecsLeft / medSecsTotal);
    prog.style.strokeDashoffset = offset;
  }
}
 
function toggleMed() {
  medActive ? pauseMed() : startMed();
}
 
function startMed() {
  medActive = true;
  document.getElementById('med-btn').textContent = '⏸ Pause';
  medInterval = setInterval(() => {
    medSecsLeft--;
    medPhaseTick++;
    const phase = MED_PHASES[medPhaseIdx % MED_PHASES.length];
    if (medPhaseTick >= phase.secs) { medPhaseTick = 0; medPhaseIdx++; }
    setEl('med-phase', MED_PHASES[medPhaseIdx % MED_PHASES.length].label);
    refreshMedDisplay();
    if (medSecsLeft <= 0) finishMed();
  }, 1000);
}
 
function pauseMed() {
  medActive = false;
  clearInterval(medInterval);
  document.getElementById('med-btn').textContent = '▶ Resume';
  setEl('med-phase', 'Paused — press Resume when ready');
}
 
function finishMed() {
  clearInterval(medInterval);
  medActive = false;
  document.getElementById('med-btn').textContent = '▶ Start';
  setEl('med-phase', '🎉 Session complete! Sit quietly for a moment.');
  const prog = document.getElementById('med-prog');
  if (prog) prog.style.strokeDashoffset = 0;
}
 
function resetMed() {
  clearInterval(medInterval);
  medActive = false; medPhaseIdx = 0; medPhaseTick = 0;
  const activeBtn = document.querySelector('.med-dur-btn.active');
  medSecsTotal = activeBtn ? parseInt(activeBtn.dataset.min) * 60 : 180;
  medSecsLeft  = medSecsTotal;
  document.getElementById('med-btn').textContent = '▶ Start';
  setEl('med-phase', 'Press Start to begin your session');
  refreshMedDisplay();
}
/* ─────────────────────────────────────────────────────────
   MODULE 5: CATEGORISED AFFIRMATION GENERATOR
─────────────────────────────────────────────────────────── */
 
const AFF_BANK = {
  strength: [
    '"I have survived 100% of my hardest days. I am stronger than I know."',
    '"Challenges are invitations to grow stronger. I accept them."',
    '"I am resilient, resourceful, and ready."',
    '"Every hard moment has built the person I am today."',
    '"I am more powerful than any fear or doubt I carry."',
  ],
  peace: [
    '"I release what I cannot control and breathe into what I can."',
    '"In this moment I am safe, grounded, and enough."',
    '"Peace is not the absence of chaos — it is my response to it."',
    '"Each exhale releases tension. Each inhale brings calm."',
    '"I am allowed to rest. I am allowed to be still."',
  ],
  growth: [
    '"Growth is not linear, and that is perfectly okay."',
    '"I am a work in progress, and that is something to celebrate."',
    '"Every small step I take matters."',
    '"I am becoming who I am meant to be."',
    '"Learning and growing are signs of life."',
  ],
  all: [
    '"I am enough, exactly as I am, right now."',
    '"Today I choose progress over perfection."',
    '"I deserve rest, joy, and kindness — especially from myself."',
    '"My feelings are valid. My experience matters."',
    '"I am not my thoughts. I am the one who observes them."',
    '"I am worthy of love and belonging, always."',
    '"Each breath is a fresh start."',
    '"Small steps forward are still steps forward."',
    '"My mental health is worth every effort I put into it."',
    '"Vulnerability is not weakness — it is strength."',
  ],
};
 
let currentAffCat  = 'all';
let lastBigAffIdx  = -1;
 
function initBigAff() { nextBigAff(); }
 
function setAffCat(cat, btn) {
  currentAffCat = cat;
  document.querySelectorAll('.aff-cat').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  lastBigAffIdx = -1;
  nextBigAff();
}
 
function nextBigAff() {
  const pool = AFF_BANK[currentAffCat] || AFF_BANK.all;
  let idx;
  do { idx = Math.floor(Math.random() * pool.length); }
  while (idx === lastBigAffIdx && pool.length > 1);
  lastBigAffIdx = idx;
 
  const el = document.getElementById('big-aff-text');
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth; // reflow to re-trigger
  el.style.animation = '';
  el.textContent = pool[idx];
}
/* ─────────────────────────────────────────────────────────
   MODULE 6: MONTHLY WELLNESS REPORT
─────────────────────────────────────────────────────────── */
 
let reportOffset     = 0;  // 0 = this month, -1 = last month
let reportMoodChart  = null;
let reportHabitChart = null;
 
function getReportPeriod() {
  const d = new Date();
  d.setMonth(d.getMonth() + reportOffset);
  return { year: d.getFullYear(), month: d.getMonth() };
}
 
function reportPrev() { reportOffset--; buildReport(); }
function reportNext() { if (reportOffset < 0) { reportOffset++; buildReport(); } }
 
function buildReport() {
  const { year, month } = getReportPeriod();
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  setEl('report-month-lbl', monthName);
 
  // Filter data for the month
  const allMoods   = getMoods().filter(m    => matchMonth(m.timestamp, year, month));
  const allJournal = getJournalEntries().filter(e => matchMonth(e.timestamp, year, month));
  const habits     = getHabits();
  const habitLog   = getHabitLog();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
 
  // Habit stats per day
  let habitDone = 0, habitPossible = 0;
  const weekTotals   = [0, 0, 0, 0];
  const weekPossible = [0, 0, 0, 0];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const done = (habitLog[key] || []).length;
    habitDone     += done;
    habitPossible += habits.length;
    const w = Math.min(Math.floor((d - 1) / 7), 3);
    weekTotals[w]   += done;
    weekPossible[w] += habits.length;
  }
  const habitCons = habitPossible ? Math.round((habitDone / habitPossible) * 100) : 0;
 
  // Mood distribution
  const moodCounts = { Happy: 0, Calm: 0, Neutral: 0, Stressed: 0, Sad: 0 };
  allMoods.forEach(m => { if (moodCounts[m.mood] !== undefined) moodCounts[m.mood]++; });
  const avgMood = allMoods.length
    ? (allMoods.reduce((s, m) => s + m.score, 0) / allMoods.length).toFixed(1)
    : '—';
  const dominant = allMoods.length
    ? Object.entries(moodCounts).sort((a,b) => b[1]-a[1])[0][0]
    : '—';
 
  // Current wellness score
  const ws = updateWellnessScore();
 
  // Render Summary
  const summaryEl = document.getElementById('report-summary');
  if (summaryEl) {
    summaryEl.innerHTML = [
      { lbl: 'Mood Entries',        val: allMoods.length },
      { lbl: 'Average Mood',        val: avgMood + '/5' },
      { lbl: 'Dominant Mood',       val: dominant !== '—' ? MOOD_EMOJIS[dominant] + ' ' + dominant : '—' },
      { lbl: 'Journal Entries',     val: allJournal.length },
      { lbl: 'Habit Consistency',   val: habitCons + '%' },
      { lbl: 'Wellness Score',      val: ws.total + '%' },
    ].map(r => `
      <div class="report-stat-row">
        <span class="report-stat-lbl">${r.lbl}</span>
        <span class="report-stat-val">${r.val}</span>
      </div>`).join('');
  }
 
  // Mood insight text
  const moodInsightEl = document.getElementById('report-mood-insight');
  if (moodInsightEl) {
    const insight = +avgMood >= 4 ? 'Excellent month emotionally! Your positivity has been consistent.' :
                    +avgMood >= 3 ? 'A generally balanced month with some highs and lows.' :
                    +avgMood >= 2 ? 'A challenging month mood-wise. Extra self-care is recommended.' :
                                    'This has been a tough month. Please consider speaking to someone you trust.';
    moodInsightEl.textContent = insight;
  }
 
  // Habit insight
  const habitInsightEl = document.getElementById('report-habit-insight');
  if (habitInsightEl) {
    habitInsightEl.textContent = habitCons >= 80 ? 'Outstanding consistency! Habits are deeply embedded.' :
                                 habitCons >= 50 ? 'Good progress — more than half completion. Keep building!' :
                                                   'Room to grow. Try starting with just one non-negotiable daily habit.';
  }
 
  // Notable days (stressed/sad)
  const notableEl = document.getElementById('report-notable');
  if (notableEl) {
    const notable = allMoods.filter(m => m.mood === 'Stressed' || m.mood === 'Sad').slice(0, 5);
    notableEl.innerHTML = notable.length
      ? notable.map(m => `
          <div class="notable-item">
            <div class="notable-emoji">${MOOD_EMOJIS[m.mood]}</div>
            <div>
              <div class="notable-date">${new Date(m.timestamp).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>
              <div class="notable-label">${m.mood}${m.note ? ` — "${escapeHtml(m.note)}"` : ''}</div>
            </div>
          </div>`).join('')
      : '<p class="empty-state">No stressful days this month! 🌟</p>';
  }
 
  // Journal frequency bars (by week)
  const jBarsEl = document.getElementById('report-journal-bars');
  if (jBarsEl) {
    const wk = ['W1', 'W2', 'W3', 'W4'];
    const wc  = [0, 0, 0, 0];
    allJournal.forEach(e => {
      const day = new Date(e.timestamp).getDate();
      wc[Math.min(Math.floor((day - 1) / 7), 3)]++;
    });
    const maxWc = Math.max(...wc, 1);
    jBarsEl.innerHTML = '<p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;">Entries per week</p>' +
      wk.map((w, i) => `
        <div class="jbar-row">
          <span class="jbar-lbl">${w}</span>
          <div class="jbar-track"><div class="jbar-fill" style="width:${(wc[i]/maxWc)*100}%"></div></div>
          <span class="jbar-count">${wc[i]}</span>
        </div>`).join('');
  }
 
  // AI Insights
  buildReportAIInsights(+avgMood, habitCons, allJournal.length, allMoods);
 
  // Charts
  buildReportMoodChart(moodCounts);
  buildReportHabitChart(weekTotals, weekPossible);
}
 
function matchMonth(iso, year, month) {
  const d = new Date(iso);
  return d.getFullYear() === year && d.getMonth() === month;
}
 
function buildReportAIInsights(avgMood, habitCons, journalCount, allMoods) {
  const el = document.getElementById('report-ai-list');
  if (!el) return;
  const insights = [];
 
  if (avgMood >= 4)    insights.push({ icon:'🌟', title:'Excellent mood!', body:`Your average of ${avgMood}/5 is outstanding. You're thriving emotionally.` });
  else if (avgMood <= 2) insights.push({ icon:'💙', title:'Tough month',    body:`Average mood ${avgMood}/5. Be compassionate with yourself and seek support if needed.` });
  else                 insights.push({ icon:'📊', title:'Mood overview',  body:`Average mood ${avgMood}/5 — balanced with room for growth.` });
 
  if (habitCons >= 80) insights.push({ icon:'🔥', title:'Habit champion!', body:`${habitCons}% completion! Your consistency is building powerful routines.` });
  else if (habitCons < 30) insights.push({ icon:'🌱', title:'Habit opportunity', body:`Only ${habitCons}% completion. One daily non-negotiable habit can transform your wellbeing.` });
 
  if (journalCount === 0) insights.push({ icon:'📓', title:'Start journaling', body:'No entries this month. Even 5 min/week of reflection has proven mental health benefits.' });
  else if (journalCount >= 8) insights.push({ icon:'✍️', title:'Reflective writer', body:`${journalCount} entries! Regular journaling is processing your emotions and building self-awareness.` });
 
  const stressCount = allMoods.filter(m => m.mood === 'Stressed').length;
  if (stressCount > 4) insights.push({ icon:'⚠️', title:'Stress detected', body:`You logged stress ${stressCount} times. Consider daily breathing exercises and identifying key stressors.` });
 
  if (!insights.length) insights.push({ icon:'✨', title:'Keep going', body:'Every data point makes your wellness picture clearer. Consistency is the key!' });
 
  el.innerHTML = insights.map(i => `
    <div class="report-ai-item">
      <div class="report-ai-icon">${i.icon}</div>
      <div class="report-ai-body"><strong>${i.title}</strong>${i.body}</div>
    </div>`).join('');
}
 
function buildReportMoodChart(moodCounts) {
  const canvas = document.getElementById('reportMoodChart');
  if (!canvas) return;
  if (reportMoodChart) reportMoodChart.destroy();
  reportMoodChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: Object.keys(moodCounts),
      datasets: [{
        data: Object.values(moodCounts),
        backgroundColor: ['rgba(251,191,36,.75)','rgba(56,189,248,.75)','rgba(148,163,184,.6)','rgba(167,139,250,.75)','rgba(251,113,133,.75)'],
        borderColor:     ['#fbbf24','#38bdf8','#94a3b8','#a78bfa','#fb7185'],
        borderWidth: 2, hoverOffset: 8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: { legend: { position: 'right', labels: { color: '#7b8cad', padding: 10, font: { family: 'Nunito', size: 11 } } } }
    }
  });
}
 
function buildReportHabitChart(weekTotals, weekPossible) {
  const canvas = document.getElementById('reportHabitChart');
  if (!canvas) return;
  if (reportHabitChart) reportHabitChart.destroy();
  const pcts = weekTotals.map((t, i) => weekPossible[i] ? Math.round((t / weekPossible[i]) * 100) : 0);
  reportHabitChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      datasets: [{
        label: '%',
        data:  pcts,
        backgroundColor: pcts.map(v => v >= 80 ? 'rgba(82,227,194,.65)' : v >= 50 ? 'rgba(251,191,36,.55)' : 'rgba(167,139,250,.5)'),
        borderColor:     pcts.map(v => v >= 80 ? '#52e3c2' : v >= 50 ? '#fbbf24' : '#a78bfa'),
        borderWidth: 1.5, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 100, ticks: { color: '#7b8cad', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { ticks: { color: '#7b8cad' }, grid: { display: false } },
      },
      plugins: { legend: { display: false } }
    }
  });
}
 
function downloadReport() {
  const { year, month } = getReportPeriod();
  const monthName  = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const allMoods   = getMoods().filter(m    => matchMonth(m.timestamp, year, month));
  const allJournal = getJournalEntries().filter(e => matchMonth(e.timestamp, year, month));
  const habits     = getHabits();
  const ws         = calcWellnessScore();
  const avgMood    = allMoods.length ? (allMoods.reduce((s,m)=>s+m.score,0)/allMoods.length).toFixed(1) : 'N/A';
  const moodDist   = Object.entries(
    allMoods.reduce((a,m)=>{a[m.mood]=(a[m.mood]||0)+1;return a;},{})
  ).map(([k,v])=>`  ${k}: ${v}`).join('\n') || '  No data';
 
  const txt = `
WALL·E MONTHLY WELLNESS REPORT
================================
User   : ${currentUser.name}
Period : ${monthName}
Created: ${new Date().toLocaleDateString()}
 
WELLNESS SCORE
--------------
Overall    : ${ws.total}%
Mood       : ${ws.moodPct}%
Habits     : ${ws.habitPct}%
Journal    : ${ws.journalPct}%
Positivity : ${ws.chatPct}%
 
MOOD SUMMARY
------------
Total entries : ${allMoods.length}
Average score : ${avgMood}/5
Distribution:
${moodDist}
 
HABITS
------
${habits.map(h=>h.icon+' '+h.name).join('\n')||'  No habits set'}
 
JOURNAL
-------
Entries this month: ${allJournal.length}
 
Generated by WALL·E — AI Mental Wellness Companion
`.trim();
 
  const blob = new Blob([txt], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `WALLE_Report_${monthName.replace(' ','_')}.txt` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
// Run init on DOM ready
document.addEventListener('DOMContentLoaded', init);
