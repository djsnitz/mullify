// ── Round Setup (Firebase-backed with round codes) ──
const RoundSetup = {
  step: 1,
  config: {},

  start() {
    this.step = 1;
    this.config = {
      course: null,
      players: [],
      holes: '18',
      startHole: 1,
      shotgun: false,
      groups: [],        // [{name:'Group 1', playerIndexes:[0,1,2]}]
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

  // ── Step 1: Course + holes + shotgun ──
  _step1(body) {
    const courses = Store.getCourses();
    const totalHoles = this.config.holes === '18' ? 18 : 9;
    const maxStart = this.config.holes === '18' ? 18 : 9;

    let html = `<div class="step-title">Course &amp; format</div><div class="step-sub">Choose your course, holes, and starting hole.</div>`;
    if (!courses.length) {
      html += `<div class="note amber">No courses downloaded. Download a course first.</div>`;
      html += `<button class="ghost-btn" onclick="App.nav('courses')">Go to Courses →</button>`;
    } else {
      // Course selection
      html += courses.map(c => {
        const sel = this.config.course?.id === c.id;
        return `<div class="course-card${sel?' saved':''}" onclick="RoundSetup.selectCourse('${c.id}')" style="${sel?'border-color:var(--green);':''}">
          <div class="flex-between"><div><div class="course-card-name">${c.name}</div><div class="course-card-loc">${c.location}</div></div>${sel?'<span class="saved-chip">Selected</span>':''}</div>
          <div class="tee-chips">${Object.keys(c.tees).map(t=>{const cl=t==='Black'?'tc-black':t==='Blue'?'tc-blue':t==='White'?'tc-white':t==='Red'?'tc-red':'tc-gold';return`<span class="tee-chip ${cl}">${t}</span>`;}).join('')}</div>
        </div>`;
      }).join('');
      html += `<button class="ghost-btn" onclick="App.nav('courses')" style="margin-bottom:16px;">Download another course →</button>`;

      // Holes to play
      html += `<div class="section-label">Holes to play</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">
        ${[{val:'18',label:'18 holes',sub:'Full round'},{val:'front9',label:'Front 9',sub:'Holes 1–9'},{val:'back9',label:'Back 9',sub:'Holes 10–18'}].map(o=>`
          <div onclick="RoundSetup.selectHoles('${o.val}')" style="border:${this.config.holes===o.val?'2px solid var(--green)':'0.5px solid var(--border-2)'};border-radius:var(--radius-sm);padding:10px 8px;text-align:center;cursor:pointer;background:${this.config.holes===o.val?'var(--green-light)':'none'};">
            <div style="font-size:13px;font-weight:600;color:${this.config.holes===o.val?'var(--green-dark)':'var(--text)'};">${o.label}</div>
            <div style="font-size:11px;color:${this.config.holes===o.val?'var(--green)':'var(--text-2)'};">${o.sub}</div>
          </div>`).join('')}
      </div>`;

      // Starting hole
      html += `<div class="section-label">Starting hole</div>
      <div class="card card-pad" style="margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:500;">Start on hole</div>
            <div style="font-size:11px;color:var(--text-2);">All players start on this hole</div>
          </div>
          <div class="stepper">
            <button class="step-btn" onclick="RoundSetup.adjStartHole(-1)">−</button>
            <span class="step-val" id="start-hole-val">${this.config.startHole}</span>
            <button class="step-btn" onclick="RoundSetup.adjStartHole(1)">+</button>
          </div>
        </div>
        <div class="toggle-row" style="border:none;padding:0;">
          <div>
            <div class="toggle-label">Shotgun start</div>
            <div class="toggle-sub">Different groups start on different holes</div>
          </div>
          <div class="toggle${this.config.shotgun?' on':''}" onclick="RoundSetup.toggleShotgun(this)"><div class="toggle-knob"></div></div>
        </div>
        ${this.config.shotgun ? `<div class="note" style="margin-top:10px;margin-bottom:0;">Each group's starting hole is set in the next step when you assign players to groups.</div>` : ''}
      </div>

      ${this.config.startHole > 1 || this.config.shotgun ? `
        <div class="note" style="background:var(--blue-light);color:var(--blue);">
          ${this.config.holes==='18'
            ? `Playing 18 holes starting on hole ${this.config.startHole}. After hole 18, wraps to hole 1.`
            : `Playing 9 holes starting on hole ${this.config.startHole}. Wraps around as needed.`}
        </div>` : ''}

      <button class="primary-btn" onclick="RoundSetup.next()" ${!this.config.course?'disabled':''}>Next — players &amp; groups</button>
    `;
    }
    body.innerHTML = html;
  },

  selectCourse(id) { this.config.course = Store.getCourses().find(c=>c.id===id); this.renderStep(); },
  selectHoles(val) { this.config.holes = val; this.config.startHole = val==='back9'?10:1; this.renderStep(); },

  adjStartHole(d) {
    const min = this.config.holes==='back9' ? 10 : 1;
    const max = this.config.holes==='back9' ? 18 : this.config.holes==='front9' ? 9 : 18;
    this.config.startHole = Math.min(max, Math.max(min, this.config.startHole + d));
    const el = document.getElementById('start-hole-val');
    if (el) el.textContent = this.config.startHole;
  },

  toggleShotgun(el) { el.classList.toggle('on'); this.config.shotgun = el.classList.contains('on'); this.renderStep(); },

  // ── Step 2: Players, tees, groups, starting holes ──
  _step2(body) {
    const players = Players.list;
    if (!this.config.players.length && players.length) {
      this.config.players = players.map(p => ({player:p, tee:p.tee||'Blue', playing:true, group:1, startHole:this.config.startHole}));
    }
    // Init groups
    const activePlayers = this.config.players.filter(p=>p.playing);
    const numGroups = this.config.groups.length || Math.max(1, Math.ceil(activePlayers.length / 4));
    if (!this.config.groups.length) {
      this.config.groups = Array.from({length:numGroups},(_,i)=>({name:`Group ${i+1}`, startHole: this.config.startHole}));
    }

    const teeKeys = this.config.course ? Object.keys(this.config.course.tees) : ['Black','Blue','White','Red'];
    let html = `<div class="step-title">Players &amp; groups</div><div class="step-sub">Assign tees, groups${this.config.shotgun?' and starting holes':''}.</div>`;

    if (!players.length) {
      html += `<div class="note amber">No players in group yet.</div><button class="ghost-btn" onclick="App.nav('players')">Add players →</button>`;
    } else {

      // Group management (only if shotgun or >1 group desired)
      html += `<div class="section-label">Groups
        <button onclick="RoundSetup.addGroup()" style="float:right;font-size:12px;color:var(--green);background:none;border:none;cursor:pointer;font-weight:500;">+ Add group</button>
      </div>`;

      this.config.groups.forEach((g, gi) => {
        const groupPlayers = this.config.players.filter((pp,i) => pp.playing && pp.group === gi+1);
        html += `<div class="card card-pad" style="margin-bottom:10px;border-left:3px solid var(--green);">
          <div class="flex-between" style="margin-bottom:${this.config.shotgun?'10px':'0'};">
            <div style="font-size:14px;font-weight:600;">Group ${gi+1}</div>
            <div style="font-size:12px;color:var(--text-2);">${groupPlayers.length} player${groupPlayers.length!==1?'s':''}</div>
          </div>
          ${this.config.shotgun ? `<div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:12px;color:var(--text-2);flex:1;">Starting hole</span>
            <div class="stepper">
              <button class="step-btn" onclick="RoundSetup.adjGroupHole(${gi},-1)">−</button>
              <span class="step-val" id="g${gi}-hole">${g.startHole}</span>
              <button class="step-btn" onclick="RoundSetup.adjGroupHole(${gi},1)">+</button>
            </div>
          </div>` : ''}
        </div>`;
      });

      // Player list with group assignment
      html += `<div class="section-label">Players</div><div class="card">`;
      html += this.config.players.map((pp,i) => {
        const teeBtns = teeKeys.map(t => `<button class="tee-btn${pp.tee===t?' tee-active-'+t.toLowerCase():''}" onclick="RoundSetup.setTee(${i},'${t}')">${t}</button>`).join('');
        const groupOpts = this.config.groups.map((g,gi) => `<option value="${gi+1}" ${pp.group===gi+1?'selected':''}>Grp ${gi+1}</option>`).join('');
        return `<div class="player-row" style="flex-wrap:wrap;padding-bottom:12px;">
          <div class="avatar${pp.playing?'':' muted'}" style="cursor:pointer;" onclick="RoundSetup.togglePlayer(${i})">${pp.player.initials}</div>
          <div class="player-info" style="flex:1;">
            <div class="flex-between">
              <div class="player-name">${pp.player.name}${pp.playing?'':' <span style="color:var(--text-3);font-size:12px;">(out)</span>'}</div>
              <select style="font-size:12px;padding:3px 6px;border-radius:6px;border:0.5px solid var(--border-2);font-family:var(--font-sans);color:var(--text);background:var(--bg-2);" onchange="RoundSetup.setGroup(${i},this.value)">${groupOpts}</select>
            </div>
            <div class="player-meta">HCP ${pp.player.hcp} · Quota ${pp.player.quota}</div>
            <div class="tee-row" style="margin-top:6px;">${teeBtns}</div>
            ${!this.config.shotgun && this.config.startHole > 1 ? `
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
              <span style="font-size:11px;color:var(--text-2);">Start hole:</span>
              <div class="stepper">
                <button class="step-btn" style="width:22px;height:22px;font-size:14px;" onclick="RoundSetup.adjPlayerHole(${i},-1)">−</button>
                <span style="font-size:13px;font-weight:500;min-width:20px;text-align:center;" id="p${i}-hole">${pp.startHole}</span>
                <button class="step-btn" style="width:22px;height:22px;font-size:14px;" onclick="RoundSetup.adjPlayerHole(${i},1)">+</button>
              </div>
            </div>` : ''}
          </div>
        </div>`;
      }).join('');
      html += `</div>`;

      html += `<div class="card card-pad">
        <div class="toggle-row"><div><div class="toggle-label">Use GHIN handicaps</div><div class="toggle-sub">Apply strokes by hole handicap index</div></div><div class="toggle${this.config.useHandicap?' on':''}" onclick="RoundSetup.toggleHcp(this)"><div class="toggle-knob"></div></div></div>
        <div class="toggle-row" style="border:none;"><div><div class="toggle-label">Net scoring</div><div class="toggle-sub">Net scores determine skins &amp; results</div></div><div class="toggle${this.config.netScoring?' on':''}" onclick="RoundSetup.toggleNet(this)"><div class="toggle-knob"></div></div></div>
      </div>`;
    }

    html += `<button class="primary-btn" onclick="RoundSetup.next()">Next — configure games</button>`;
    html += `<button class="ghost-btn" onclick="RoundSetup.back()">Back</button>`;
    body.innerHTML = html;
  },

  addGroup() {
    this.config.groups.push({name:`Group ${this.config.groups.length+1}`, startHole:this.config.startHole});
    this.renderStep();
  },

  adjGroupHole(gi, d) {
    const max = this.config.holes==='18' ? 18 : 9;
    const min = this.config.holes==='back9' ? 10 : 1;
    this.config.groups[gi].startHole = Math.min(max, Math.max(min, this.config.groups[gi].startHole + d));
    const el = document.getElementById(`g${gi}-hole`);
    if (el) el.textContent = this.config.groups[gi].startHole;
  },

  adjPlayerHole(i, d) {
    const max = this.config.holes==='18' ? 18 : 9;
    const min = this.config.holes==='back9' ? 10 : 1;
    this.config.players[i].startHole = Math.min(max, Math.max(min, (this.config.players[i].startHole||this.config.startHole) + d));
    const el = document.getElementById(`p${i}-hole`);
    if (el) el.textContent = this.config.players[i].startHole;
  },

  setGroup(i, val) { this.config.players[i].group = parseInt(val); },
  togglePlayer(i)  { this.config.players[i].playing=!this.config.players[i].playing; this.renderStep(); },
  setTee(i,tee)    { this.config.players[i].tee=tee; this.renderStep(); },
  toggleHcp(el)    { el.classList.toggle('on'); this.config.useHandicap=el.classList.contains('on'); },
  toggleNet(el)    { el.classList.toggle('on'); this.config.netScoring=el.classList.contains('on'); },

  // ── Step 3: Games ──
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
    html += gameBlock('skins','Skins','Lowest net score wins · ties = no skin · across all groups');
    html += gameBlock('stableford','Stableford','Points vs net par · top scores paid',sfExtra);
    html += gameBlock('ctp','Closest to the pin','Par 3 holes · closest tee shot wins');
    html += gameBlock('quota','Quota','Beat your points target to win',quotaExtra);
    html += `<div class="card card-pad" style="background:var(--green-light);border-color:var(--green-mid);">
      <div class="flex-between"><div style="font-size:13px;color:var(--green-dark);">Total pot</div><div style="font-size:22px;font-weight:700;color:var(--green-dark);">$${totalPot}</div></div>
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

  // ── Step 4: Review ──
  _step4(body) {
    const c = this.config;
    const active = c.players.filter(p=>p.playing);
    const buyin  = ['skins','stableford','ctp','quota'].reduce((s,k)=>s+(c.games[k].on?c.games[k].buyin:0),0);
    const pot    = buyin * active.length;
    const activeGames = Object.keys(c.games).filter(k=>c.games[k].on).map(k=>k[0].toUpperCase()+k.slice(1));
    const holesLabel = c.holes==='18'?'18 holes':c.holes==='front9'?'Front 9':'Back 9';
    const startLabel = c.shotgun ? 'Shotgun (varies by group)' : `Hole ${c.startHole}`;

    body.innerHTML = `
      <div class="step-title">Review &amp; start</div>
      <div class="step-sub">A round code will be generated — share it with your group to join.</div>
      <div class="card">
        <div class="balance-row"><span class="balance-label">Course</span><span>${c.course.name}</span></div>
        <div class="balance-row"><span class="balance-label">Format</span><span>${holesLabel}</span></div>
        <div class="balance-row"><span class="balance-label">Starting hole</span><span>${startLabel}</span></div>
        <div class="balance-row"><span class="balance-label">Players</span><span>${active.length} in ${c.groups.length} group${c.groups.length!==1?'s':''}</span></div>
        <div class="balance-row"><span class="balance-label">Games</span><span>${activeGames.join(' · ')||'None'}</span></div>
        <div class="balance-row"><span class="balance-label">Buy-in each</span><span>$${buyin}</span></div>
        <div class="balance-row" style="border-bottom:none;"><span class="balance-label b-green fw-6">Total pot</span><span class="b-green fw-6">$${pot}</span></div>
      </div>

      ${c.groups.length > 1 ? `<div class="section-label">Group assignments</div><div class="card">${c.groups.map((g,gi)=>{
        const gp=active.filter(pp=>pp.group===gi+1);
        return `<div class="balance-row${gi===c.groups.length-1?'" style="border-bottom:none;"':'"'}><span class="balance-label">Group ${gi+1}${c.shotgun?' · H'+g.startHole:''}</span><span>${gp.map(pp=>pp.player.first||pp.player.name.split(' ')[0]).join(', ')||'—'}</span></div>`;
      }).join('')}</div>` : ''}

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

  // Build hole indexes based on holes selection + starting hole (with wrap)
  _buildHoleIndexes() {
    const c = this.config;
    const allHoles = c.holes === 'front9' ? [0,1,2,3,4,5,6,7,8] : c.holes === 'back9' ? [9,10,11,12,13,14,15,16,17] : Array.from({length:18},(_,i)=>i);
    const startIdx = allHoles.indexOf(c.startHole - 1);
    if (startIdx <= 0) return allHoles;
    // Wrap: start from startHole, go to end, then wrap to beginning
    return [...allHoles.slice(startIdx), ...allHoles.slice(0, startIdx)];
  },

  async startRound() {
    const btn = document.getElementById('start-round-btn');
    btn.disabled = true; btn.textContent = 'Creating round…';
    const c = this.config;
    const activePlayers = c.players.filter(p=>p.playing);
    const buyin = ['skins','stableford','ctp','quota'].reduce((s,k)=>s+(c.games[k].on?c.games[k].buyin:0),0);

    // Build per-player hole indexes (shotgun = different start per group)
    const playersWithHoles = activePlayers.map(pp => {
      let startHole;
      if (c.shotgun) {
        const group = c.groups[pp.group - 1];
        startHole = group ? group.startHole : c.startHole;
      } else {
        startHole = pp.startHole || c.startHole;
      }
      const allHoles = c.holes==='front9'?[0,1,2,3,4,5,6,7,8]:c.holes==='back9'?[9,10,11,12,13,14,15,16,17]:Array.from({length:18},(_,i)=>i);
      const startIdx = allHoles.findIndex(h => h === startHole - 1);
      const holeIndexes = startIdx > 0 ? [...allHoles.slice(startIdx), ...allHoles.slice(0, startIdx)] : allHoles;
      return {...pp.player, tee:pp.tee, group:pp.group, startHole, holeIndexes};
    });

    const sharedHoleIndexes = this._buildHoleIndexes();

    const round = {
      course: c.course,
      date: new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}),
      players: playersWithHoles,
      useHandicap: c.useHandicap,
      netScoring: c.netScoring,
      holes: c.holes,
      holeIndexes: sharedHoleIndexes,
      shotgun: c.shotgun,
      startHole: c.startHole,
      groups: c.groups,
      games: c.games,
      buyin,
      pot: buyin * activePlayers.length,
      skinResults: {},
      scores: {},
      currentHole: sharedHoleIndexes[0],
      entryMode: c.entryMode,
      adminUid: Auth.currentUser?.uid
    };

    try {
      const created = await DB.createRound(round);
      Store.saveActiveRound(created);
      this._showCode(created.code, created);
    } catch(e) {
      btn.disabled = false; btn.textContent = 'Create round & get code';
      alert('Error creating round: ' + e.message);
    }
  },

  _showCode(code, round) {
    const holesLabel = round.holes==='18'?'18 holes':round.holes==='front9'?'Front 9':'Back 9';
    document.getElementById('setup-body').innerHTML = `
      <div style="text-align:center;padding:24px 0;">
        <div style="font-size:14px;color:var(--text-2);margin-bottom:12px;">Round created! Share this code:</div>
        <div style="font-size:52px;font-weight:700;color:var(--green);letter-spacing:6px;font-family:'DM Mono',monospace;">${code}</div>
        <div style="font-size:13px;color:var(--text-2);margin-top:8px;">Players open Mullify → Join round → enter code</div>
        <button class="outline-btn" style="margin-top:16px;" onclick="navigator.share?navigator.share({title:'Join my Mullify round',text:'Join my golf round!\\nCode: ${code}\\nhttps://mullify.vercel.app'}):navigator.clipboard.writeText('${code}').then(()=>alert('Code copied!'))">Share code</button>
      </div>
      <div class="card card-pad" style="margin-top:8px;">
        <div class="balance-row"><span class="balance-label">Course</span><span>${round.course.name}</span></div>
        <div class="balance-row"><span class="balance-label">Format</span><span>${holesLabel} · Start H${round.startHole}</span></div>
        <div class="balance-row"><span class="balance-label">Players</span><span>${round.players.length}</span></div>
        <div class="balance-row" style="border-bottom:none;"><span class="balance-label">Pot</span><span class="b-green fw-6">$${round.pot}</span></div>
      </div>
      <button class="primary-btn" onclick="Scorecard.loadFromDB('${code}');App.nav('scorecard');">Go to scorecard →</button>`;
  },

  next() { if(this.step<4){this.step++;this.renderStep();} },
  back() { if(this.step>1){this.step--;this.renderStep();}else App.back(); }
};
