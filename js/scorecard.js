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

    document.getElementById('sc-course-name').textContent = r.roundName || r.course?.name || 'Round';
    document.getElementById('sc-course-sub').textContent = `${r.course?.name||''} · ${players.length} players${this.isAdmin?' · Admin':''} · Code: ${this.roundCode||''}`;
    document.getElementById('sc-hole-display').textContent = `H${h+1}`;

    // Hole nav — use shared holeIndexes or first player's indexes
    const holeIndexes = r.holeIndexes || Array.from({length:18},(_,i)=>i);
    document.getElementById('sc-hole-nav').innerHTML = holeIndexes.map(i => {
      const done = r.players.some(p => r.scores?.[p.id]?.[i] !== undefined);
      const skin = (r.skinResults||{})[i];
      const skinWon = skin && !skin.tied;
      return `<button class="hole-pill${i===h?' active':''}${done?' done':''}${skinWon?' skin-won':''}" onclick="Scorecard.goHole(${i})">${i+1}</button>`;
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
    else if (this.view==='groups')      this._renderGroups(body);
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
    const me = this.round?.players?.find(p => p.id === this.myPlayerId);
    const target = this.round?.players?.[playerIdx];
    if (!me || !target) return false;
    // Same group can enter scores for each other
    return me.group === target.group;
  },

  _renderEntry(body) {
    const r = this.round;
    const h = r.currentHole || 0;
    const players = r.players || [];
    const me = players.find(p => p.id === this.myPlayerId);
    const myGroup = me?.group || null;

    // Sort: my group first, then other groups
    const sortedPlayers = [...players].sort((a,b) => {
      if (myGroup) {
        if (a.group===myGroup && b.group!==myGroup) return -1;
        if (b.group===myGroup && a.group!==myGroup) return 1;
      }
      return (a.group||1) - (b.group||1);
    });

    let html = '';
    let lastGroup = null;

    sortedPlayers.forEach((p) => {
      const i = players.indexOf(p);
      // Group divider
      if (p.group && p.group !== lastGroup) {
        const isMyGroup = p.group === myGroup;
        html += `<div style="font-size:11px;font-weight:600;color:${isMyGroup?'var(--green)':'var(--text-2)'};padding:8px 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Group ${p.group}${isMyGroup?' · Your group':''}</div>`;
        lastGroup = p.group;
      }
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
            <div class="sec-name">${p.name}${isMe?' <span style="font-size:10px;color:var(--green);">(you)</span>':''}${p.group?' <span style="font-size:10px;background:var(--bg-2);color:var(--text-2);padding:1px 6px;border-radius:10px;">Grp '+p.group+'</span>':''}</div>
            <div class="sec-meta">${tee} tee · HCP ${p.hcp} · ${strokes} stroke${strokes!==1?'s':''} H${h+1}${p.startHole&&p.startHole>1?' · Start H'+p.startHole:''}</div>
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
      html += `<button class="ghost-btn" style="margin-top:6px;border-color:var(--red);color:var(--red);" onclick="Scorecard.confirmEndRound()">End round &amp; go to payouts</button>`;
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
    const holeIndexes = r.holeIndexes || Array.from({length:18},(_,i)=>i);
    const currentIdx = holeIndexes.indexOf(h);
    const isLastHole = currentIdx === holeIndexes.length - 1;

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

    if (!isLastHole) {
      const nextHole = holeIndexes[currentIdx + 1];
      await DB.saveCurrentHole(this.roundCode, nextHole);
    } else {
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
      i, name:p.name, initials:p.initials, group:p.group||null,
      pts: this._totalPts(i),
      skins: Object.values(r.skinResults||{}).filter(s=>s&&!s.tied&&s.winnerId===p.id).length,
      played: Object.keys(r.scores?.[p.id]||{}).length
    })).sort((a,b)=>b.pts-a.pts);

    body.innerHTML = `<div class="card">${ranked.map((p,rank)=>`
      <div class="lb-row">
        <div class="lb-rank${rank===0?' first':''}">${['1st','2nd','3rd','4th','5th','6th'][rank]||rank+1+'th'}</div>
        <div class="avatar sm">${p.initials}</div>
        <div class="lb-info"><div class="lb-name">${p.name}${p.group?' <span style="font-size:10px;color:var(--text-3);">Grp '+p.group+'</span>':''}</div><div class="lb-sub">Thru ${p.played} holes</div></div>
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

  _renderGroups(body) {
    const r = this.round;
    const players = r.players || [];
    const groups = r.groups || [{name:'Group 1', startHole:1}];
    const isAdmin = this.isAdmin;

    let html = `<div class="section-label">Group assignments${isAdmin?' <span style="font-size:11px;color:var(--text-3);">· Admin can move players</span>':''}</div>`;

    groups.forEach((g, gi) => {
      const groupPlayers = players.filter(p => p.group === gi+1);
      html += `<div class="card" style="margin-bottom:10px;">
        <div class="card-section">Group ${gi+1}${r.shotgun?' · Start hole '+g.startHole:''}</div>
        ${groupPlayers.map((p, pi) => {
          const globalIdx = players.indexOf(p);
          return `<div class="player-row">
            <div class="avatar">${p.initials}</div>
            <div class="player-info">
              <div class="player-name">${p.name}</div>
              <div class="player-meta">HCP ${p.hcp} · ${p.tee} tee${p.startHole?' · Start H'+p.startHole:''}</div>
            </div>
            ${isAdmin ? `<select style="font-size:12px;padding:4px 6px;border-radius:6px;border:0.5px solid var(--border-2);font-family:var(--font-sans);" onchange="Scorecard.moveToGroup(${globalIdx},this.value)">
              ${groups.map((_,i)=>`<option value="${i+1}" ${p.group===i+1?'selected':''}>Grp ${i+1}</option>`).join('')}
            </select>` : ''}
          </div>`;
        }).join('')}
        ${groupPlayers.length === 0 ? '<div style="padding:12px 0;font-size:13px;color:var(--text-3);">No players in this group</div>' : ''}
      </div>`;
    });

    if (!isAdmin) {
      html += `<div class="note">Only the admin can move players between groups.</div>`;
    }

    body.innerHTML = html;
  },

  async confirmEndRound() {
    const r = this.round;
    const h = r.currentHole || 0;
    const holeIndexes = r.holeIndexes || Array.from({length:18},(_,i)=>i);
    const holesPlayed = holeIndexes.filter(i => r.players.some(p => r.scores?.[p.id]?.[i] !== undefined)).length;
    const msg = holesPlayed === 0
      ? 'No scores entered yet. End the round anyway?'
      : `End round after ${holesPlayed} hole${holesPlayed!==1?'s':''}? Payouts will be calculated on scores entered so far.`;
    if (!confirm(msg)) return;
    await DB.updateRound(this.roundCode, {status:'complete'});
    Payouts.buildFromRound({...r, code:this.roundCode});
    App.nav('payouts');
  },

  async moveToGroup(playerIdx, newGroup) {
    const r = this.round;
    if (!r || !this.isAdmin) return;
    r.players[playerIdx].group = parseInt(newGroup);
    // Save updated players to Firebase
    await DB.updateRound(this.roundCode, { players: r.players });
    this._renderGroups(document.getElementById('sc-body'));
  },

  _renderQuota(body) {
    const r = this.round;
    const is9hole = r.holes === 'front9' || r.holes === 'back9';
    let html = `<div class="card">`;
    (r.players||[]).forEach((p,i) => {
      const playerQuota = is9hole ? (p.quota9||Math.round((p.quota||18)/2)) : (p.quota||18);
      const scored = Object.keys(r.scores?.[p.id]||{}).length;
      const currentPts = this._totalPts(i);
      const totalHoles = (r.holeIndexes||[]).length||18;
      const pct = Math.min(100,Math.round(currentPts/playerQuota*100));
      const paceTarget = Math.round(playerQuota/totalHoles*scored);
      const diff = currentPts - paceTarget;
      const fillColor = pct>=100?'var(--green)':pct>=70?'var(--amber)':'var(--red)';
      html+=`<div class="quota-row">
        <div class="avatar">${p.initials}</div>
        <div class="quota-info">
          <div class="quota-name">${p.name}</div>
          <div class="quota-sub">${currentPts} pts · ${is9hole?'9H ':''}quota ${playerQuota} · thru ${scored}</div>
          <div class="mini-bar"><div class="mini-fill" style="width:${pct}%;background:${fillColor};"></div></div>
        </div>
        <div class="quota-right">
          <div class="quota-target">${currentPts}/${playerQuota}</div>
          <div class="quota-adj ${diff>=0?'adj-up':'adj-down'}">${diff>=0?'+':''}${diff} vs pace</div>
        </div>
      </div>`;
    });
    html += `</div>`;
    body.innerHTML = html;
  }
};
