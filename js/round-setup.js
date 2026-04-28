// ── Round Setup (Firebase-backed with round codes) ──
const RoundSetup = {
  step: 1,
  config: {},

  start() {
    this.step = 1;
    this.config = {
      course: null,
      players: [],
      useHandicap: true,
      netScoring: true,
      entryMode: 'both',
      games: {
        skins:      { on:true,  buyin:5,  pctPot:50 },
        stableford: { on:true,  buyin:10, pctPot:40, places:2, pts:{eagle:4,birdie:3,par:2,bogey:1,double:0,worse:0} },
        ctp:        { on:false, buyin:5,  pctPot:10, holes:[] },
        quota:      { on:false, buyin:10, pctPot:0,  pts:{eagle:5,birdie:4,par:3,bogey:2,double:1,worse:0} }
      }
    };
    this.renderStep();
  },

  renderStep() {
    document.getElementById('setup-step-label').textContent = `Step ${this.step} of 4`;
    document.getElementById('setup-dots').innerHTML = [1,2,3,4].map(i =>
      `<div class="step-dot ${i<this.step?'done':i===this.step?'active':''}"></div>`
    ).join('');
    const body = document.getElementById('setup-body');
    if      (this.step===1) this._step1(body);
    else if (this.step===2) this._step2(body);
    else if (this.step===3) this._step3(body);
    else                    this._step4(body);
  },

  _step1(body) {
    const courses = Store.getCourses();
    let html = `<div class="step-title">Choose course</div><div class="step-sub">Select from your downloaded courses.</div>`;
    if (!courses.length) {
      html += `<div class="note amber">No courses downloaded. Download a course first.</div>`;
      html += `<button class="ghost-btn" onclick="App.nav('courses')">Go to Courses →</button>`;
    } else {
      html += courses.map(c => {
        const sel = this.config.course?.id === c.id;
        return `<div class="course-card${sel?' saved':''}" onclick="RoundSetup.selectCourse('${c.id}')" style="${sel?'border-color:var(--green);':''}">
          <div class="flex-between"><div><div class="course-card-name">${c.name}</div><div class="course-card-loc">${c.location}</div></div>${sel?'<span class="saved-chip">Selected</span>':''}</div>
          <div class="tee-chips">${Object.keys(c.tees).map(t=>{const cl=t==='Black'?'tc-black':t==='Blue'?'tc-blue':t==='White'?'tc-white':t==='Red'?'tc-red':'tc-gold';return`<span class="tee-chip ${cl}">${t}</span>`;}).join('')}</div>
        </div>`;
      }).join('');
      html += `<button class="primary-btn" onclick="RoundSetup.next()" ${!this.config.course?'disabled':''}>Next — select players</button>`;
    }
    body.innerHTML = html;
  },

  selectCourse(id) {
    this.config.course = Store.getCourses().find(c=>c.id===id);
    this.renderStep();
  },

  _step2(body) {
    const players = Players.list;
    if (!this.config.players.length && players.length) {
      this.config.players = players.map(p => ({player:p, tee:p.tee||'Blue', playing:true}));
    }
    const teeKeys = this.config.course ? Object.keys(this.config.course.tees) : ['Black','Blue','White','Red'];
    let html = `<div class="step-title">Players &amp; tees</div><div class="step-sub">Select who's playing and assign tee boxes. Saved per player.</div>`;
    if (!players.length) {
      html += `<div class="note amber">No players in group yet.</div><button class="ghost-btn" onclick="App.nav('players')">Add players →</button>`;
    } else {
      html += `<div class="card">` + this.config.players.map((pp,i) => {
        const teeBtns = teeKeys.map(t => `<button class="tee-btn${pp.tee===t?' tee-active-'+t.toLowerCase():''}" onclick="RoundSetup.setTee(${i},'${t}')">${t}</button>`).join('');
        return `<div class="player-row" style="flex-wrap:wrap;">
          <div class="avatar${pp.playing?'':' muted'}" style="cursor:pointer;" onclick="RoundSetup.togglePlayer(${i})">${pp.player.initials}</div>
          <div class="player-info">
            <div class="player-name">${pp.player.name} ${pp.playing?'':'<span style="color:var(--text-3);font-weight:400;">(sitting out)</span>'}</div>
            <div class="player-meta">HCP ${pp.player.hcp} · Quota ${pp.player.quota}</div>
            <div class="tee-row" style="margin-top:6px;">${teeBtns}</div>
          </div>
        </div>`;
      }).join('') + `</div>`;
      html += `<div class="card card-pad">
        <div class="toggle-row"><div><div class="toggle-label">Use GHIN handicaps</div><div class="toggle-sub">Apply strokes by hole handicap index</div></div><div class="toggle${this.config.useHandicap?' on':''}" onclick="RoundSetup.toggleHcp(this)"><div class="toggle-knob"></div></div></div>
        <div class="toggle-row"><div><div class="toggle-label">Net scoring</div><div class="toggle-sub">Net scores determine skins &amp; results</div></div><div class="toggle${this.config.netScoring?' on':''}" onclick="RoundSetup.toggleNet(this)"><div class="toggle-knob"></div></div></div>
      </div>`;
    }
    html += `<button class="primary-btn" onclick="RoundSetup.next()">Next — configure games</button>`;
    html += `<button class="ghost-btn" onclick="RoundSetup.back()">Back</button>`;
    body.innerHTML = html;
  },

  togglePlayer(i) { this.config.players[i].playing=!this.config.players[i].playing; this.renderStep(); },
  setTee(i,tee)   { this.config.players[i].tee=tee; this.renderStep(); },
  toggleHcp(el)   { el.classList.toggle('on'); this.config.useHandicap=el.classList.contains('on'); },
  toggleNet(el)   { el.classList.toggle('on'); this.config.netScoring=el.classList.contains('on'); },

  _step3(body) {
    const g = this.config.games;
    const activePlayers = this.config.players.filter(p=>p.playing).length;
    const totalBuyin = ['skins','stableford','ctp','quota'].reduce((s,k)=>s+(g[k].on?g[k].buyin:0),0);
    const totalPot = totalBuyin * activePlayers;

    const ptsStepper = (gameKey, label, scoreKey) => {
      const val = g[gameKey].pts[scoreKey];
      return `<div style="background:var(--bg-2);border-radius:var(--radius-sm);padding:8px 10px;">
        <div style="font-size:11px;color:var(--text-2);">${label}</div>
        <div class="stepper" style="margin-top:4px;">
          <button class="step-btn" onclick="RoundSetup.adjPts('${gameKey}','${scoreKey}',-1)">−</button>
          <span class="step-val" id="pts-${gameKey}-${scoreKey}">${val}</span>
          <button class="step-btn" onclick="RoundSetup.adjPts('${gameKey}','${scoreKey}',1)">+</button>
        </div>
      </div>`;
    };

    const gameBlock = (key, title, desc, extra='') => {
      const gm = g[key];
      return `<div class="card card-pad" style="margin-bottom:10px;${gm.on?'border-color:var(--green);':''}">
        <div class="flex-between" style="margin-bottom:${gm.on?'12px':'0'};">
          <div><div class="toggle-label">${title}</div><div class="toggle-sub">${desc}</div></div>
          <div class="toggle${gm.on?' on':''}" onclick="RoundSetup.toggleGame('${key}',this)"><div class="toggle-knob"></div></div>
        </div>
        ${gm.on?`<div style="display:flex;gap:10px;align-items:center;margin-bottom:${extra?'12px':'0'};">
          <label style="font-size:12px;color:var(--text-2);flex:1;">Buy-in per player</label>
          <span style="color:var(--text-2);">$</span>
          <input class="form-input" type="number" value="${gm.buyin}" min="0" style="width:70px;" oninput="RoundSetup.setBuyin('${key}',this.value)" />
        </div>${extra}`:''}
      </div>`;
    };

    const sfExtra = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px;">${['eagle','birdie','par','bogey','double','worse'].map(k=>ptsStepper('stableford',k[0].toUpperCase()+k.slice(1),k)).join('')}</div>
      <div style="display:flex;gap:10px;align-items:center;"><label style="font-size:12px;color:var(--text-2);flex:1;">Top places paid</label><select class="form-input" style="width:auto;" onchange="RoundSetup.setPlaces(this.value)"><option ${g.stableford.places===1?'selected':''} value="1">1st only</option><option ${g.stableford.places===2?'selected':''} value="2">Top 2</option><option ${g.stableford.places===3?'selected':''} value="3">Top 3</option></select></div>`;
    const quotaExtra = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${['eagle','birdie','par','bogey','double','worse'].map(k=>ptsStepper('quota',k[0].toUpperCase()+k.slice(1),k)).join('')}</div>`;

    let html = `<div class="step-title">Games &amp; payouts</div><div class="step-sub">Toggle games on/off and set point values.</div>`;
    html += gameBlock('skins','Skins','Lowest net score wins · ties = no skin');
    html += gameBlock('stableford','Stableford','Points vs net par · top scores paid',sfExtra);
    html += gameBlock('ctp','Closest to the pin','Par 3 holes · closest tee shot wins');
    html += gameBlock('quota','Quota','Beat your points target to win',quotaExtra);
    html += `<div class="card card-pad" style="background:var(--green-light);border-color:var(--green-mid);">
      <div class="flex-between"><div style="font-size:13px;color:var(--green-dark);">Total pot</div><div style="font-size:22px;font-weight:700;color:var(--green-dark);" id="pot-display">$${totalPot}</div></div>
      <div style="font-size:12px;color:var(--green);">${activePlayers} players · $${totalBuyin} each</div>
    </div>`;
    html += `<button class="primary-btn" onclick="RoundSetup.next()">Next — review &amp; start</button>`;
    html += `<button class="ghost-btn" onclick="RoundSetup.back()">Back</button>`;
    body.innerHTML = html;
  },

  toggleGame(key,el) { el.classList.toggle('on'); this.config.games[key].on=el.classList.contains('on'); this.renderStep(); },
  setBuyin(key,val)  { this.config.games[key].buyin=parseFloat(val)||0; },
  setPlaces(v)       { this.config.games.stableford.places=parseInt(v); },
  adjPts(gk,sk,d)    { this.config.games[gk].pts[sk]=Math.max(0,(this.config.games[gk].pts[sk]||0)+d); this.renderStep(); },

  _step4(body) {
    const c = this.config;
    const active = c.players.filter(p=>p.playing);
    const buyin  = ['skins','stableford','ctp','quota'].reduce((s,k)=>s+(c.games[k].on?c.games[k].buyin:0),0);
    const pot    = buyin * active.length;
    const activeGames = Object.keys(c.games).filter(k=>c.games[k].on).map(k=>k[0].toUpperCase()+k.slice(1));
    body.innerHTML = `
      <div class="step-title">Review &amp; start</div>
      <div class="step-sub">A round code will be generated — share it with your group to join.</div>
      <div class="card">
        <div class="balance-row"><span class="balance-label">Course</span><span>${c.course.name}</span></div>
        <div class="balance-row"><span class="balance-label">Players</span><span>${active.length} playing</span></div>
        <div class="balance-row"><span class="balance-label">Games</span><span>${activeGames.join(' · ')||'None'}</span></div>
        <div class="balance-row"><span class="balance-label">Buy-in each</span><span>$${buyin}</span></div>
        <div class="balance-row" style="border-bottom:none;"><span class="balance-label b-green fw-6">Total pot</span><span class="b-green fw-6">$${pot}</span></div>
      </div>
      <div class="section-label">Score entry</div>
      <div class="card card-pad">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
          <div id="mode-admin" onclick="RoundSetup.setMode('admin')" style="border:0.5px solid var(--border-2);border-radius:var(--radius-sm);padding:12px;cursor:pointer;">
            <div style="font-size:13px;font-weight:600;">Admin only</div>
            <div style="font-size:11px;color:var(--text-2);margin-top:3px;">One person enters all</div>
          </div>
          <div id="mode-both" onclick="RoundSetup.setMode('both')" style="border:2px solid var(--green);border-radius:var(--radius-sm);padding:12px;cursor:pointer;background:var(--green-light);">
            <div style="font-size:13px;font-weight:600;color:var(--green-dark);">Open + admin override</div>
            <div style="font-size:11px;color:var(--green);margin-top:3px;">Players enter, admin can edit</div>
          </div>
        </div>
      </div>
      <button class="primary-btn" id="start-round-btn" onclick="RoundSetup.startRound()">Create round &amp; get code</button>
      <button class="ghost-btn" onclick="RoundSetup.back()">Back</button>`;
    this.config.entryMode = 'both';
  },

  setMode(m) {
    this.config.entryMode = m;
    ['admin','both'].forEach(id => {
      const el = document.getElementById('mode-'+id);
      if (!el) return;
      if (id===m) { el.style.cssText='border:2px solid var(--green);border-radius:var(--radius-sm);padding:12px;cursor:pointer;background:var(--green-light);'; el.querySelector('div').style.color='var(--green-dark)'; }
      else        { el.style.cssText='border:0.5px solid var(--border-2);border-radius:var(--radius-sm);padding:12px;cursor:pointer;'; el.querySelector('div').style.color='var(--text)'; }
    });
  },

  async startRound() {
    const btn = document.getElementById('start-round-btn');
    btn.disabled = true;
    btn.textContent = 'Creating round…';
    const c = this.config;
    const activePlayers = c.players.filter(p=>p.playing);
    const buyin = ['skins','stableford','ctp','quota'].reduce((s,k)=>s+(c.games[k].on?c.games[k].buyin:0),0);
    const round = {
      course: c.course,
      date: new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}),
      players: activePlayers.map(pp => ({...pp.player, tee:pp.tee})),
      useHandicap: c.useHandicap,
      netScoring: c.netScoring,
      games: c.games,
      buyin,
      pot: buyin * activePlayers.length,
      skinResults: {},
      scores: {},
      currentHole: 0,
      entryMode: c.entryMode,
      adminUid: Auth.currentUser?.uid
    };
    try {
      const created = await DB.createRound(round);
      Store.saveActiveRound(created);
      // Show the round code
      this._showCode(created.code, created);
    } catch(e) {
      btn.disabled = false;
      btn.textContent = 'Create round & get code';
      alert('Error creating round: ' + e.message);
    }
  },

  _showCode(code, round) {
    document.getElementById('setup-body').innerHTML = `
      <div style="text-align:center;padding:24px 0;">
        <div style="font-size:14px;color:var(--text-2);margin-bottom:12px;">Round created! Share this code with your group:</div>
        <div style="font-size:52px;font-weight:700;color:var(--green);letter-spacing:6px;font-family:'DM Mono',monospace;">${code}</div>
        <div style="font-size:13px;color:var(--text-2);margin-top:8px;">Players open Mullify → Join round → enter this code</div>
        <button class="outline-btn" style="margin-top:16px;" onclick="navigator.share?navigator.share({title:'Join my Mullify round',text:'Join my golf round! Code: ${code}\\n\\nhttps://mullify.vercel.app'}):navigator.clipboard.writeText('${code}').then(()=>alert('Code copied!'))">Share code</button>
      </div>
      <div class="card card-pad" style="margin-top:8px;">
        <div class="balance-row"><span class="balance-label">Course</span><span>${round.course.name}</span></div>
        <div class="balance-row"><span class="balance-label">Players</span><span>${round.players.length}</span></div>
        <div class="balance-row" style="border-bottom:none;"><span class="balance-label">Pot</span><span class="b-green fw-6">$${round.pot}</span></div>
      </div>
      <button class="primary-btn" onclick="Scorecard.loadFromDB('${code}');App.nav('scorecard');">Go to scorecard →</button>`;
  },

  next() { if(this.step<4){this.step++;this.renderStep();} },
  back() { if(this.step>1){this.step--;this.renderStep();}else App.back(); }
};
