// ── Scorecard (Firebase real-time) ──
const Scorecard = {
  round: null,
  view: 'entry',
  roundCode: null,
  isAdmin: false,
  myPlayerId: null,
  overrideMode: false,

  async loadFromDB(code) {
    this.roundCode = code.toUpperCase();
    this.view = 'entry';
    const round = await DB.getRound(this.roundCode);
    if (!round) { alert('Round not found'); return; }
    this.round = round;
    this.isAdmin = Auth.currentUser?.uid === round.adminUid;
    this.myPlayerId = Auth.playerProfile?.playerId || null;
    Store.saveActiveRound({...round, code: this.roundCode});
    // Subscribe to live updates
    DB.onRoundChanged(this.roundCode, r => {
      this.round = r;
      Store.saveActiveRound({...r, code: this.roundCode});
      this.render();
    });
    this.render();
  },

  load(round) {
    this.round = round;
    this.roundCode = round.code || round.id;
    this.view = 'entry';
    this.isAdmin = Auth.currentUser?.uid === round.adminUid;
    this.myPlayerId = Auth.playerProfile?.playerId || null;
    if (this.roundCode) {
      DB.onRoundChanged(this.roundCode, r => {
        this.round = r;
        this.render();
      });
    }
    this.render();
  },

  render() {
    if (!this.round) return;
    const r = this.round;
    const h = r.currentHole || 0;
    const players = r.players || [];
    const firstTee = players[0]?.tee || 'Blue';
    const holeData = r.course?.tees?.[firstTee] || Object.values(r.course?.tees||{})[0];

    document.getElementById('sc-course-name').textContent = r.course?.name || 'Round';
    document.getElementById('sc-course-sub').textContent = `${players.length} players · ${r.date}${this.isAdmin?' · Admin':''}`;
    document.getElementById('sc-hole-display').textContent = `H${h+1}`;

    // Hole nav pills
    document.getElementById('sc-hole-nav').innerHTML = Array.from({length:18},(_,i) => {
      const scores = r.scores || {};
      const anyScore = players.some(p => scores[p.id]?.[i] !== undefined);
      const skin = (r.skinResults||{})[i];
      const skinWon = skin && !skin.tied;
      return `<button class="hole-pill${i===h?' active':''}${anyScore?' done':''}${skinWon?' skin-won':''}" onclick="Scorecard.goHole(${i})">${i+1}</button>`;
    }).join('');

    // Hole info
    const par     = holeData?.par?.[h] || 4;
    const yds     = holeData?.yds?.[h] || 0;
    const hcpIdx  = holeData?.hcp?.[h] || 1;
    document.getElementById('sc-hole-info').innerHTML = `
      <div class="hole-info-cell"><div class="hic-label">Par</div><div class="hic-val">${par}</div></div>
      <div class="hole-info-cell"><div class="hic-label">Yards</div><div class="hic-val">${yds}</div></div>
      <div class="hole-info-cell"><div class="hic-label">Hcp idx</div><div class="hic-val">${hcpIdx}</div></div>
      <div class="hole-info-cell"><div class="hic-label">Hole</div><div class="hic-val" style="color:var(--green);">${h+1}/18</div></div>`;

    this.renderView();
  },

  renderView() {
    const body = document.getElementById('sc-body');
    if      (this.view==='entry')       this._renderEntry(body);
    else if (this.view==='leaderboard') this._renderLeaderboard(body);
    else if (this.view==='skins')       this._renderSkins(body);
    else                                this._renderQuota(body);
  },

  showView(v, tab) {
    this.view = v;
    document.querySelectorAll('.view-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    this.renderView();
  },

  _strokes(playerHcp, holeHcpIdx) {
    if (!this.round?.useHandicap) return 0;
    let s = 0;
    if (playerHcp >= holeHcpIdx) s++;
    if (playerHcp >= 18 + holeHcpIdx) s++;
    return s;
  },

  _net(gross, playerHcp, holeHcpIdx) {
    return gross - this._strokes(playerHcp, holeHcpIdx);
  },

  _scoreLabel(net, par) {
    const d = net - par;
    if (d<=-2) return {lbl:'Eagle', cls:'sc-eagle'};
    if (d===-1) return {lbl:'Birdie',cls:'sc-birdie'};
    if (d===0)  return {lbl:'Par',   cls:'sc-par'};
    if (d===1)  return {lbl:'Bogey', cls:'sc-bogey'};
    if (d===2)  return {lbl:'Double',cls:'sc-double'};
    return {lbl:`+${d}`,cls:'sc-worse'};
  },

  _sfPts(net, par, ptTable) {
    const d = net - par;
    if (d<=-2) return ptTable.eagle;
    if (d===-1) return ptTable.birdie;
    if (d===0)  return ptTable.par;
    if (d===1)  return ptTable.bogey;
    if (d===2)  return ptTable.double;
    return ptTable.worse;
  },

  _totalPts(playerIdx) {
    const r = this.round;
    const p = r.players[playerIdx];
    const pts = r.games?.stableford?.pts || {eagle:4,birdie:3,par:2,bogey:1,double:0,worse:0};
    const tee = p.tee || 'Blue';
    const hd = r.course.tees[tee] || Object.values(r.course.tees)[0];
    let total = 0;
    for (let h = 0; h < 18; h++) {
      const gross = (r.scores?.[p.id]?.[h]);
      if (gross === undefined || gross === null) continue;
      const net = this._net(gross, p.hcp, hd.hcp[h]);
      total += this._sfPts(net, hd.par[h], pts);
    }
    return total;
  },

  _canEdit(playerIdx) {
    if (this.isAdmin) return true;
    if (this.round?.entryMode === 'admin') return false;
    return this.round?.players?.[playerIdx]?.id === this.myPlayerId;
  },

  _renderEntry(body) {
    const r = this.round;
    const h = r.currentHole || 0;
    const players = r.players || [];
    let html = '';

    players.forEach((p, i) => {
      const tee = p.tee || 'Blue';
      const hd  = r.course.tees[tee] || Object.values(r.course.tees)[0];
      const par = hd.par[h];
      const hcpIdx = hd.hcp[h];
      const strokes = this._strokes(p.hcp, hcpIdx);
      const gross = r.scores?.[p.id]?.[h] ?? par;
      const net = this._net(gross, p.hcp, hcpIdx);
      const sl  = this._scoreLabel(net, par);
      const totalPts = this._totalPts(i);
      const canEdit  = this._canEdit(i);
      const isMe = p.id === this.myPlayerId;

      html += `<div class="score-entry-card" style="${isMe?'border-color:var(--green);':''}">
        <div class="sec-top">
          <div class="avatar${isMe?'':''}">${p.initials}</div>
          <div class="sec-info">
            <div class="sec-name">${p.name}${isMe?' <span style="font-size:10px;color:var(--green);">(you)</span>':''}</div>
            <div class="sec-meta">${tee} tee · HCP ${p.hcp} · ${strokes} stroke${strokes!==1?'s':''} H${h+1}</div>
          </div>
          <div class="sec-pts">${r.games?.stableford?.on ? totalPts+' pts' : ''}</div>
        </div>
        <div class="sec-ctrl">
          ${canEdit ? `<button class="sc-minus" onclick="Scorecard.adj('${p.id}',${i},-1)">−</button>` : `<div style="width:38px;"></div>`}
          <div class="sc-display">
            <div class="sc-num" id="score-${i}">${gross}</div>
            <div class="sc-desc ${sl.cls}" id="desc-${i}">${sl.lbl} · net ${net}</div>
          </div>
          ${canEdit ? `<button class="sc-plus" onclick="Scorecard.adj('${p.id}',${i},1)">+</button>` : `<div style="width:38px;"></div>`}
        </div>
        ${!canEdit && !this.isAdmin ? `<div style="padding:6px 14px;font-size:11px;color:var(--text-3);text-align:center;">Score entered by admin</div>` : ''}
      </div>`;
    });

    // Skin preview
    if (r.games?.skins?.on) {
      const netScores = players.map((p,i) => {
        const tee=p.tee||'Blue'; const hd=r.course.tees[tee]||Object.values(r.course.tees)[0];
        const gross=r.scores?.[p.id]?.[h]??hd.par[h];
        return this._net(gross,p.hcp,hd.hcp[h]);
      });
      const min = Math.min(...netScores);
      const winners = netScores.reduce((a,s,i)=>s===min?[...a,i]:a,[]);
      html += `<div class="sec-skin-result ${winners.length===1?'skr-won':'skr-tied'}">${winners.length===1?`Skin: ${players[winners[0]].name} leads this hole`:'Tied — no skin will be awarded'}</div>`;
    }

    if (this.isAdmin) {
      html += `<button class="primary-btn" onclick="Scorecard.saveHole()" style="margin-top:12px;">Save hole ${h+1}${h<17?' & next →':' — finish round'}</button>`;
    }

    body.innerHTML = html;
  },

  async adj(playerId, playerIdx, delta) {
    const r = this.round;
    const h = r.currentHole || 0;
    const p = r.players[playerIdx];
    const tee = p.tee || 'Blue';
    const hd  = r.course.tees[tee] || Object.values(r.course.tees)[0];
    const cur = r.scores?.[playerId]?.[h] ?? hd.par[h];
    const newScore = Math.max(1, cur + delta);

    // Update local immediately for responsiveness
    if (!r.scores) r.scores = {};
    if (!r.scores[playerId]) r.scores[playerId] = {};
    r.scores[playerId][h] = newScore;

    // Update UI
    const el = document.getElementById('score-' + playerIdx);
    const dl = document.getElementById('desc-' + playerIdx);
    if (el) el.textContent = newScore;
    const net = this._net(newScore, p.hcp, hd.hcp[h]);
    const sl = this._scoreLabel(net, hd.par[h]);
    if (dl) { dl.textContent = sl.lbl + ' · net ' + net; dl.className = 'sc-desc ' + sl.cls; }

    // Persist to Firebase
    try {
      if (this.isAdmin) {
        await DB.adminOverrideScore(this.roundCode, playerId, h, newScore);
      } else {
        await DB.saveScore(this.roundCode, playerId, h, newScore);
      }
    } catch {
      Store.addPendingWrite({type:'score', roundCode:this.roundCode, playerId, hole:h, value:newScore});
    }
  },

  async saveHole() {
    const r = this.round;
    const h = r.currentHole || 0;
    const players = r.players || [];

    // Determine skin result
    const netScores = players.map((p) => {
      const tee=p.tee||'Blue'; const hd=r.course.tees[tee]||Object.values(r.course.tees)[0];
      const gross=r.scores?.[p.id]?.[h]??hd.par[h];
      return this._net(gross,p.hcp,hd.hcp[h]);
    });
    const min = Math.min(...netScores);
    const winners = netScores.reduce((a,s,i)=>s===min?[...a,i]:a,[]);
    const skinResult = winners.length===1 ? {winner:winners[0],winnerId:players[winners[0]].id,tied:false} : {tied:true};

    await DB.saveSkinResult(this.roundCode, h, skinResult);

    if (h < 17) {
      await DB.saveCurrentHole(this.roundCode, h + 1);
    } else {
      // Round complete — go to payouts
      await DB.updateRound(this.roundCode, {status:'complete'});
      Payouts.buildFromRound({...r, code:this.roundCode});
      App.nav('payouts');
    }
  },

  async goHole(idx) {
    if (this.isAdmin) await DB.saveCurrentHole(this.roundCode, idx);
    else {
      if (this.round) this.round.currentHole = idx;
      this.render();
    }
  },

  _renderLeaderboard(body) {
    const r = this.round;
    const ranked = (r.players||[]).map((p,i) => ({
      i, name:p.name, initials:p.initials,
      pts: this._totalPts(i),
      skins: Object.values(r.skinResults||{}).filter(s=>s&&!s.tied&&s.winnerId===p.id).length,
      played: Object.keys(r.scores?.[p.id]||{}).length
    })).sort((a,b)=>b.pts-a.pts);

    body.innerHTML = `<div class="card">${ranked.map((p,rank)=>`
      <div class="lb-row">
        <div class="lb-rank${rank===0?' first':''}">${['1st','2nd','3rd','4th','5th','6th'][rank]||rank+1+'th'}</div>
        <div class="avatar sm">${p.initials}</div>
        <div class="lb-info"><div class="lb-name">${p.name}</div><div class="lb-sub">Thru ${p.played} holes</div></div>
        <div class="lb-right"><div class="lb-pts">${p.pts} pts</div><div class="lb-skins">${p.skins} skin${p.skins!==1?'s':''}</div></div>
      </div>`).join('')}</div>`;
  },

  _renderSkins(body) {
    const r = this.round;
    const tee = r.players?.[0]?.tee || 'Blue';
    const hd  = r.course.tees[tee] || Object.values(r.course.tees)[0];
    const skinPot = (r.games?.skins?.buyin||0) * (r.players?.length||0);
    const skinsWon = Object.values(r.skinResults||{}).filter(s=>s&&!s.tied).length;
    const perSkin  = skinsWon > 0 ? Math.round(skinPot/skinsWon) : 0;

    let html = `<div class="stat-grid" style="margin-bottom:14px;">
      <div class="stat-card"><div class="stat-label">Skins won</div><div class="stat-value">${skinsWon}</div><div class="stat-sub">$${perSkin} each</div></div>
      <div class="stat-card"><div class="stat-label">Pot</div><div class="stat-value">$${skinPot}</div><div class="stat-sub">${r.players?.length||0} players</div></div>
    </div><div class="card">`;

    const curH = r.currentHole||0;
    for (let h=0; h<=curH; h++) {
      const res = (r.skinResults||{})[h];
      const par = hd?.par?.[h]||4;
      if (!res) { html+=`<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result" style="color:var(--text-3);">—</div></div>`; continue; }
      if (res.tied) {
        html+=`<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><span class="tied-chip">Tied — no skin</span></div></div>`;
      } else {
        const w = r.players?.[res.winner];
        html+=`<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><div class="avatar sm">${w?.initials||'?'}</div><span style="font-size:12px;font-weight:500;">${w?.name?.split(' ')[0]||''}</span></div><span class="skin-amt">$${perSkin}</span></div>`;
      }
    }
    html += `</div>`;
    body.innerHTML = html;
  },

  _renderQuota(body) {
    const r = this.round;
    const pts = r.games?.quota?.pts || r.games?.stableford?.pts || {eagle:4,birdie:3,par:2,bogey:1,double:0,worse:0};
    let html = `<div class="card">`;
    (r.players||[]).forEach((p,i) => {
      const scored = Object.keys(r.scores?.[p.id]||{}).length;
      const currentPts = this._totalPts(i);
      const pct = Math.min(100,Math.round(currentPts/p.quota*100));
      const paceTarget = Math.round(p.quota/18*scored);
      const diff = currentPts - paceTarget;
      const fillColor = pct>=100?'var(--green)':pct>=70?'var(--amber)':'var(--red)';
      html+=`<div class="quota-row">
        <div class="avatar">${p.initials}</div>
        <div class="quota-info">
          <div class="quota-name">${p.name}</div>
          <div class="quota-sub">${currentPts} pts · quota ${p.quota} · thru ${scored}</div>
          <div class="mini-bar"><div class="mini-fill" style="width:${pct}%;background:${fillColor};"></div></div>
        </div>
        <div class="quota-right">
          <div class="quota-target">${currentPts}/${p.quota}</div>
          <div class="quota-adj ${diff>=0?'adj-up':'adj-down'}">${diff>=0?'+':''}${diff} vs pace</div>
        </div>
      </div>`;
    });
    html += `</div>`;
    body.innerHTML = html;
  }
};
