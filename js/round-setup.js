// ── Round Setup ──
const RoundSetup = {
  step: 1,
  config: {
    course: null,
    players: [],  // [{player, tee, useGHIN}]
    useHandicap: true,
    netScoring: true,
    games: {
      skins:      { on: true,  buyin: 5,  pctPot: 50 },
      stableford: { on: true,  buyin: 10, pctPot: 40, places: 2, pts: {eagle:4,birdie:3,par:2,bogey:1,double:0,worse:0} },
      ctp:        { on: false, buyin: 5,  pctPot: 10, holes: [] },
      quota:      { on: false, buyin: 10, pctPot: 0,  pts: {eagle:5,birdie:4,par:3,bogey:2,double:1,worse:0} }
    }
  },

  start() {
    this.step = 1;
    this.config = {
      course: null,
      players: [],
      useHandicap: true,
      netScoring: true,
      games: {
        skins:      { on: true,  buyin: 5,  pctPot: 50 },
        stableford: { on: true,  buyin: 10, pctPot: 40, places: 2, pts: {eagle:4,birdie:3,par:2,bogey:1,double:0,worse:0} },
        ctp:        { on: false, buyin: 5,  pctPot: 10, holes: [] },
        quota:      { on: false, buyin: 10, pctPot: 0,  pts: {eagle:5,birdie:4,par:3,bogey:2,double:1,worse:0} }
      }
    };
    this.renderStep();
  },

  renderStep() {
    document.getElementById('setup-step-label').textContent = `Step ${this.step} of 4`;
    const dots = document.getElementById('setup-dots');
    dots.innerHTML = [1,2,3,4].map(i =>
      `<div class="step-dot ${i < this.step ? 'done' : i === this.step ? 'active' : ''}"></div>`
    ).join('');
    const body = document.getElementById('setup-body');
    if (this.step === 1) this._step1(body);
    else if (this.step === 2) this._step2(body);
    else if (this.step === 3) this._step3(body);
    else this._step4(body);
  },

  _step1(body) {
    const courses = Store.getCourses();
    let html = `<div class="step-title">Choose course</div><div class="step-sub">Select from your downloaded courses or search for a new one.</div>`;
    if (!courses.length) {
      html += `<div class="note amber">No courses downloaded yet. Go to Courses to search and download one first.</div>`;
      html += `<button class="ghost-btn" onclick="App.nav('courses')">Go to Courses →</button>`;
    } else {
      html += courses.map(c => {
        const sel = this.config.course && this.config.course.id === c.id;
        return `<div class="course-card${sel ? ' saved' : ''}" onclick="RoundSetup.selectCourse('${c.id}')" style="${sel ? 'border-color:var(--green);' : ''}">
          <div class="flex-between"><div><div class="course-card-name">${c.name}</div><div class="course-card-loc">${c.location}</div></div>${sel ? '<span class="saved-chip">Selected</span>' : ''}</div>
          <div class="tee-chips">${Object.keys(c.tees).map(t => {const cls=t==='Black'?'tc-black':t==='Blue'?'tc-blue':t==='White'?'tc-white':t==='Red'?'tc-red':'tc-gold';return `<span class="tee-chip ${cls}">${t} ${c.tees[t].rating}/${c.tees[t].slope}</span>`;}).join('')}</div>
        </div>`;
      }).join('');
      html += `<button class="ghost-btn" onclick="App.nav('courses')">Download another course →</button>`;
      html += `<button class="primary-btn" onclick="RoundSetup.next()" ${!this.config.course?'disabled':''} id="step1-next">Next — select players</button>`;
    }
    body.innerHTML = html;
  },

  selectCourse(id) {
    this.config.course = Store.getCourses().find(c => c.id === id);
    this.renderStep();
  },

  _step2(body) {
    const players = Store.getPlayers();
    // Init player selections
    if (!this.config.players.length && players.length) {
      this.config.players = players.map(p => ({ player: p, tee: p.tee || 'Blue', playing: true }));
    }
    let html = `<div class="step-title">Players &amp; tees</div><div class="step-sub">Select who's playing and set their tee box. Tee selections are saved per player.</div>`;
    const teeKeys = Object.keys(this.config.course.tees);
    if (!players.length) {
      html += `<div class="note amber">No players in group. Add players first.</div><button class="ghost-btn" onclick="App.nav('add-player')">Add players →</button>`;
    } else {
      html += `<div class="card">`;
      html += this.config.players.map((pp, i) => {
        const teeBtns = teeKeys.map(t => {
          const active = pp.tee === t;
          const cls = active ? `tee-btn tee-active-${t.toLowerCase()}` : 'tee-btn';
          return `<button class="${cls}" onclick="RoundSetup.setTee(${i},'${t}')">${t}</button>`;
        }).join('');
        return `<div class="player-row">
          <div class="avatar ${pp.playing?'':'muted'}" style="cursor:pointer;" onclick="RoundSetup.togglePlayer(${i})">${pp.player.initials}</div>
          <div class="player-info">
            <div class="player-name">${pp.player.name}</div>
            <div class="player-meta">HCP ${pp.player.hcp} · Quota ${pp.player.quota}</div>
            <div class="tee-row" style="margin-top:6px;">${teeBtns}</div>
          </div>
        </div>`;
      }).join('');
      html += `</div>`;
      html += `<div class="card card-pad"><div class="toggle-row"><div><div class="toggle-label">Use GHIN handicaps</div><div class="toggle-sub">Apply handicap strokes by hole index</div></div><div class="toggle${this.config.useHandicap?' on':''}" onclick="RoundSetup.toggleHcp(this)"><div class="toggle-knob"></div></div></div><div class="toggle-row"><div><div class="toggle-label">Net scoring</div><div class="toggle-sub">Net scores determine skins &amp; stableford</div></div><div class="toggle${this.config.netScoring?' on':''}" onclick="RoundSetup.toggleNet(this)"><div class="toggle-knob"></div></div></div></div>`;
    }
    html += `<button class="primary-btn" onclick="RoundSetup.next()">Next — configure games</button>`;
    html += `<button class="ghost-btn" onclick="RoundSetup.back()">Back</button>`;
    body.innerHTML = html;
  },

  togglePlayer(i) { this.config.players[i].playing = !this.config.players[i].playing; this.renderStep(); },
  setTee(i, tee) { this.config.players[i].tee = tee; this.renderStep(); },
  toggleHcp(el) { el.classList.toggle('on'); this.config.useHandicap = el.classList.contains('on'); },
  toggleNet(el) { el.classList.toggle('on'); this.config.netScoring = el.classList.contains('on'); },

  _step3(body) {
    const g = this.config.games;
    const activePlayers = this.config.players.filter(p => p.playing).length;
    const totalBuyin = ['skins','stableford','ctp','quota'].reduce((s, k) => s + (g[k].on ? g[k].buyin : 0), 0);
    const totalPot = totalBuyin * activePlayers;

    const gameBlock = (key, title, desc, extra='') => {
      const gm = g[key];
      return `<div class="card card-pad" style="margin-bottom:10px;${gm.on?'border-color:var(--green);':''}">
        <div class="flex-between" style="margin-bottom:${gm.on?'12px':'0'};">
          <div><div class="toggle-label">${title}</div><div class="toggle-sub">${desc}</div></div>
          <div class="toggle${gm.on?' on':''}" onclick="RoundSetup.toggleGame('${key}',this)"><div class="toggle-knob"></div></div>
        </div>
        ${gm.on ? `<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;"><label style="font-size:12px;color:var(--text-2);flex:1;">Buy-in per player</label><span style="color:var(--text-2);">$</span><input class="form-input" type="number" value="${gm.buyin}" min="0" style="width:70px;" oninput="RoundSetup.setBuyin('${key}',this.value)" /></div>${extra}` : ''}
      </div>`;
    };

    const ptsStepper = (gameKey, label, scoreKey) => {
      const val = g[gameKey].pts[scoreKey];
      return `<div class="pts-item"><div style="font-size:11px;color:var(--text-2);">${label}</div><div class="stepper" style="margin-top:4px;"><button class="step-btn" onclick="RoundSetup.adjPts('${gameKey}','${scoreKey}',-1)">−</button><span class="step-val">${val}</span><button class="step-btn" onclick="RoundSetup.adjPts('${gameKey}','${scoreKey}',1)">+</button></div></div>`;
    };

    const sfPts = `<div class="pts-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px;">${['eagle','birdie','par','bogey','double','worse'].map(k => ptsStepper('stableford', k.charAt(0).toUpperCase()+k.slice(1), k)).join('')}</div><div style="display:flex;gap:10px;align-items:center;"><label style="font-size:12px;color:var(--text-2);flex:1;">Top finishers paid</label><select class="form-input" style="width:auto;" onchange="RoundSetup.setPlaces(this.value)"><option ${g.stableford.places===1?'selected':''}>1</option><option ${g.stableford.places===2?'selected':''}>2</option><option ${g.stableford.places===3?'selected':''}>3</option></select></div>`;
    const quotaPts = `<div class="pts-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${['eagle','birdie','par','bogey','double','worse'].map(k => ptsStepper('quota', k.charAt(0).toUpperCase()+k.slice(1), k)).join('')}</div>`;

    let html = `<div class="step-title">Games &amp; payouts</div><div class="step-sub">Configure each game, set buy-ins and point values.</div>`;
    html += gameBlock('skins', 'Skins', 'Lowest net score wins · ties = no skin');
    html += gameBlock('stableford', 'Stableford', 'Points vs net par · top scores paid', sfPts);
    html += gameBlock('ctp', 'Closest to the pin', 'Par 3 holes · closest tee shot wins');
    html += gameBlock('quota', 'Quota / custom stableford', 'Beat your points target to win', quotaPts);
    html += `<div class="card card-pad" style="background:var(--green-light);border-color:var(--green-mid);">
      <div class="flex-between"><div style="font-size:13px;color:var(--green-dark);">Total pot</div><div style="font-size:22px;font-weight:700;color:var(--green-dark);">$${totalPot}</div></div>
      <div style="font-size:12px;color:var(--green);margin-top:2px;">${activePlayers} players · $${totalBuyin} each</div>
    </div>`;
    html += `<button class="primary-btn" onclick="RoundSetup.next()">Next — review &amp; start</button>`;
    html += `<button class="ghost-btn" onclick="RoundSetup.back()">Back</button>`;
    body.innerHTML = html;
  },

  toggleGame(key, el) {
    el.classList.toggle('on');
    this.config.games[key].on = el.classList.contains('on');
    this.renderStep();
  },

  setBuyin(key, val) { this.config.games[key].buyin = parseFloat(val) || 0; },
  setPlaces(v) { this.config.games.stableford.places = parseInt(v); },
  adjPts(gameKey, scoreKey, d) {
    this.config.games[gameKey].pts[scoreKey] = Math.max(0, (this.config.games[gameKey].pts[scoreKey] || 0) + d);
    this.renderStep();
  },

  _step4(body) {
    const c = this.config;
    const activePlayers = c.players.filter(p => p.playing);
    const buyin = ['skins','stableford','ctp','quota'].reduce((s,k) => s + (c.games[k].on ? c.games[k].buyin : 0), 0);
    const pot = buyin * activePlayers.length;
    const activeGames = ['Skins','Stableford','CTP','Quota'].filter((_,i) => c.games[['skins','stableford','ctp','quota'][i]].on);
    let html = `<div class="step-title">Review &amp; start</div><div class="step-sub">Confirm everything looks right then tee it up.</div>`;
    html += `<div class="card"><div class="balance-row"><span class="balance-label">Course</span><span>${c.course.name}</span></div><div class="balance-row"><span class="balance-label">Players</span><span>${activePlayers.length} playing</span></div><div class="balance-row"><span class="balance-label">Games</span><span>${activeGames.join(' · ') || 'None'}</span></div><div class="balance-row"><span class="balance-label">Buy-in each</span><span>$${buyin}</span></div><div class="balance-row" style="border-bottom:none;"><span class="balance-label b-green fw-6">Total pot</span><span class="b-green fw-6">$${pot}</span></div></div>`;
    html += `<div class="section-label">Score entry mode</div>`;
    html += `<div class="card"><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:14px 0;">
      <div id="mode-admin" onclick="RoundSetup.setMode('admin')" style="border:2px solid var(--green);border-radius:var(--radius-sm);padding:12px;cursor:pointer;background:var(--green-light);">
        <div style="font-size:13px;font-weight:600;color:var(--green-dark);">Admin only</div>
        <div style="font-size:11px;color:var(--green);margin-top:3px;">One person enters all scores</div>
      </div>
      <div id="mode-open" onclick="RoundSetup.setMode('open')" style="border:0.5px solid var(--border-2);border-radius:var(--radius-sm);padding:12px;cursor:pointer;">
        <div style="font-size:13px;font-weight:600;">Open entry</div>
        <div style="font-size:11px;color:var(--text-2);margin-top:3px;">Each player enters own score</div>
      </div>
    </div></div>`;
    html += `<button class="primary-btn" onclick="RoundSetup.startRound()">Tee it up — start round!</button>`;
    html += `<button class="ghost-btn" onclick="RoundSetup.back()">Back</button>`;
    body.innerHTML = html;
    this.config.entryMode = 'admin';
  },

  setMode(m) {
    this.config.entryMode = m;
    const admin = document.getElementById('mode-admin');
    const open = document.getElementById('mode-open');
    if (m === 'admin') {
      admin.style.cssText = 'border:2px solid var(--green);border-radius:var(--radius-sm);padding:12px;cursor:pointer;background:var(--green-light);';
      open.style.cssText = 'border:0.5px solid var(--border-2);border-radius:var(--radius-sm);padding:12px;cursor:pointer;';
    } else {
      open.style.cssText = 'border:2px solid var(--green);border-radius:var(--radius-sm);padding:12px;cursor:pointer;background:var(--green-light);';
      admin.style.cssText = 'border:0.5px solid var(--border-2);border-radius:var(--radius-sm);padding:12px;cursor:pointer;';
    }
  },

  next() {
    if (this.step < 4) { this.step++; this.renderStep(); }
  },
  back() {
    if (this.step > 1) { this.step--; this.renderStep(); } else App.back();
  },

  startRound() {
    const c = this.config;
    const activePlayers = c.players.filter(p => p.playing);
    const buyin = ['skins','stableford','ctp','quota'].reduce((s,k) => s + (c.games[k].on ? c.games[k].buyin : 0), 0);
    const round = {
      id: Date.now(),
      course: c.course,
      date: new Date().toLocaleDateString('en-US', {weekday:'short',month:'short',day:'numeric',year:'numeric'}),
      players: activePlayers.map(pp => ({
        ...pp.player,
        tee: pp.tee,
        scores: Array(18).fill(null),
        stablefordPts: 0,
        quotaPts: 0
      })),
      useHandicap: c.useHandicap,
      netScoring: c.netScoring,
      games: c.games,
      buyin,
      pot: buyin * activePlayers.length,
      skinResults: Array(18).fill(null),
      currentHole: 0,
      entryMode: c.entryMode,
      curScores: activePlayers.map(pp => c.course.tees[pp.tee]?.par[0] || 4)
    };
    Store.saveActiveRound(round);
    Scorecard.load(round);
    App.nav('scorecard');
  }
};
