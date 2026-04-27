// ── History ──
const History = {
  render() {
    const body = document.getElementById('history-body');
    const history = Store.getHistory();
    if (!history.length) {
      body.innerHTML = `<div class="empty-state"><div class="empty-title">No rounds yet</div><div class="empty-sub">Complete a round to see it here.</div></div>`;
      return;
    }
    body.innerHTML = history.map(r => {
      const chips = [];
      if (r.games?.skins?.on) chips.push(`<span class="history-chip green">Skins $${r.games.skins.buyin*r.players.length}</span>`);
      if (r.games?.stableford?.on) chips.push(`<span class="history-chip green">Stableford</span>`);
      if (r.games?.quota?.on) chips.push(`<span class="history-chip">Quota</span>`);
      return `<div class="history-card">
        <div class="history-course">${r.course?.name || 'Unknown course'}</div>
        <div class="history-date">${r.date} · ${r.players?.length || 0} players · $${r.pot} pot</div>
        <div class="history-chips">${chips.join('')}</div>
      </div>`;
    }).join('');
  }
};

// ── Settings ──
const Settings = {
  render() {
    const body = document.getElementById('settings-body');
    const s = Store.getSettings();
    const players = Store.getPlayers();
    const courses = Store.getCourses();
    body.innerHTML = `
      <div class="section-label">Group</div>
      <div class="settings-section">
        <div class="settings-row"><span class="settings-label">Group name</span><span class="settings-val">${s.groupName}</span></div>
        <div class="settings-row"><span class="settings-label">Players</span><span class="settings-val">${players.length}</span></div>
        <div class="settings-row"><span class="settings-label">Saved courses</span><span class="settings-val">${courses.length}</span></div>
      </div>
      <div class="section-label">Data</div>
      <div class="settings-section">
        <div class="settings-row"><span class="settings-label">Rounds in history</span><span class="settings-val">${Store.getHistory().length}</span></div>
        <div class="settings-row" style="cursor:pointer;" onclick="Settings.clearData()"><span class="settings-label settings-danger">Clear all data</span></div>
      </div>
      <div class="section-label">About</div>
      <div class="settings-section">
        <div class="settings-row"><span class="settings-label">App</span><span class="settings-val">Mullify Game Keeper</span></div>
        <div class="settings-row"><span class="settings-label">Version</span><span class="settings-val">1.0.0</span></div>
      </div>
      <div class="note" style="margin-top:16px;">Add to your iPhone home screen: tap the Share button in Safari, then "Add to Home Screen" for the full app experience.</div>`;
  },

  clearData() {
    if (confirm('Clear ALL data including players, courses, and history? This cannot be undone.')) {
      Store.clearAll();
      App.nav('home');
      Home.render();
    }
  }
};

// ── Home ──
const Home = {
  render() {
    const now = new Date();
    document.getElementById('home-date').textContent = now.toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric'});
    const players = Store.getPlayers();
    const courses = Store.getCourses();
    const history = Store.getHistory();
    const lastRound = history[0];
    document.getElementById('home-stat-players').textContent = players.length;
    document.getElementById('home-stat-courses').textContent = courses.length;
    document.getElementById('home-stat-rounds').textContent = history.length;
    document.getElementById('home-stat-pot').textContent = lastRound ? '$' + (lastRound.pot || 0) : '$0';
    const activeRound = Store.getActiveRound();
    const activeEl = document.getElementById('home-active-round');
    if (activeRound) {
      activeEl.style.display = 'block';
      activeEl.innerHTML = `<div class="card card-pad" style="border-color:var(--green);margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:10px;height:10px;border-radius:50%;background:var(--green);flex-shrink:0;"></div>
          <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Round in progress</div><div style="font-size:12px;color:var(--text-2);margin-top:1px;">${activeRound.course?.name} · Hole ${activeRound.currentHole+1}</div></div>
          <button class="text-btn" onclick="Scorecard.load(Store.getActiveRound());App.nav('scorecard');">Resume →</button>
        </div>
      </div>`;
    } else {
      activeEl.style.display = 'none';
    }
  }
};

// ── Main App Controller ──
const App = {
  stack: ['home'],

  nav(screen) {
    const cur = document.querySelector('.screen.active');
    if (cur) cur.classList.add('slide-back');
    setTimeout(() => { if (cur) cur.classList.remove('slide-back'); }, 300);

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const next = document.getElementById('screen-' + screen);
    if (!next) return;
    next.classList.add('active');

    // Update nav bar
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navMap = {home:'home',scorecard:'scorecard',players:'players',payouts:'payouts'};
    if (navMap[screen]) {
      document.querySelectorAll('.nav-item').forEach(n => {
        if (n.getAttribute('onclick')?.includes("'"+screen+"'")) n.classList.add('active');
      });
    }

    this.stack.push(screen);
    this._onEnter(screen);
  },

  back() {
    this.stack.pop();
    const prev = this.stack[this.stack.length - 1] || 'home';
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + prev);
    if (el) el.classList.add('active');
    this._onEnter(prev);
  },

  _onEnter(screen) {
    if (screen === 'home') Home.render();
    else if (screen === 'players') Players.render();
    else if (screen === 'add-player') {
      document.getElementById('add-first').value = '';
      document.getElementById('add-last').value = '';
      document.getElementById('add-ghin').value = '';
      document.getElementById('add-hcp').value = '';
      document.getElementById('add-quota').value = '';
      document.getElementById('add-avatar-preview').textContent = '?';
      document.getElementById('add-player-btn').disabled = true;
      document.getElementById('ghin-result').style.display = 'none';
      Players.selectedTee = 'Blue';
    }
    else if (screen === 'courses') Courses.render();
    else if (screen === 'round-setup') RoundSetup.start();
    else if (screen === 'scorecard') {
      const r = Store.getActiveRound();
      if (r && !Scorecard.round) Scorecard.load(r);
      else if (Scorecard.round) Scorecard.render();
    }
    else if (screen === 'payouts') Payouts.renderView();
    else if (screen === 'quota') Quota.render();
    else if (screen === 'quota-admin') Quota.renderAdmin();
    else if (screen === 'history') History.render();
    else if (screen === 'settings') Settings.render();
  },

  init() {
    // Show splash then home
    setTimeout(() => {
      document.getElementById('screen-splash').classList.remove('active');
      this.nav('home');
    }, 1800);

    // Register service worker for PWA offline
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
