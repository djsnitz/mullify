// ── Scorecard (Firebase real-time) ──
const Scorecard = {
  round: null,
  view: 'entry',
  roundCode: null,
  isAdmin: false,
  myPlayerId: null,
  overrideMode: false,
  _viewingHole: null,
  _cardShowAll: true,

  async loadFromDB(code) {
    this.roundCode = code.toUpperCase();
    this.view = 'entry';
    this._viewingHole = null;
    this._cardShowAll = true;
    const round = await DB.getRound(this.roundCode);
    if (!round) { alert('Round not found'); return; }
    this.round = round;
    this.isAdmin = Auth.currentUser?.uid === round.adminUid;
    this.myPlayerId = Auth.playerProfile?.playerId || null;
    // Set viewing hole to player's next unscored hole
    this._viewingHole = this._myNextHole();
    Store.saveActiveRound({...round, code: this.roundCode});
    DB.onRoundChanged(this.roundCode, r => {
      this.round = r;
      Store.saveActiveRound({...r, code: this.roundCode});
      // Only update viewing hole if not set yet
      if (this._viewingHole === null) this._viewingHole = this._myNextHole();
      this.render();
    });
    this.render();
  },

  load(round) {
    this.round = round;
    this.roundCode = round.code || round.id;
    this.view = 'entry';
    this._viewingHole = null;
    this._cardShowAll = true;
    this.isAdmin = Auth.currentUser?.uid === round.adminUid;
    this.myPlayerId = Auth.playerProfile?.playerId || null;
    this._viewingHole = this._myNextHole();
    if (this.roundCode) {
      DB.onRoundChanged(this.roundCode, r => {
        this.round = r;
        this.render();
      });
    }
    this.render();
  },

  // Find the first hole this player hasn't scored yet
  _myNextHole() {
    const r = this.round;
    if (!r) return 0;
    const holeIndexes = r.holeIndexes || Array.from({length:18},(_,i)=>i);
    if (this.isAdmin) return r.currentHole || holeIndexes[0];
    const myScores = r.scores?.[this.myPlayerId] || {};
    // Find first unscored hole in order
    const nextUnscored = holeIndexes.find(h => myScores[h] === undefined || myScores[h] === null);
    return nextUnscored !== undefined ? nextUnscored : holeIndexes[holeIndexes.length - 1];
  },

  render() {
    if (!this.round) return;
    const r = this.round;
    // Use viewing hole if set, otherwise use official current hole
    const h = (this._viewingHole !== undefined && this._viewingHole !== null)
      ? this._viewingHole
      : (r.currentHole || 0);
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
      const isActive = i === h;
      return `<button class="hole-pill${isActive?' active':''}${done?' done':''}${skinWon?' skin-won':''}" onclick="Scorecard.viewHole(${i})">${i+1}</button>`;
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
    else if (this.view==='card')        this._renderCard(body);
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
    const holeIndexes = r.holeIndexes || Array.from({length:18},(_,i)=>i);
    let total = 0;
    holeIndexes.forEach(h => {
      const gross = r.scores?.[p.id]?.[h];
      if (gross === undefined || gross === null) return;
      const net = this._net(gross, p.hcp, hd.hcp[h]);
      total += this._sfPts(net, hd.par[h], pts);
    });
    return total;
  },

  _canEdit(playerIdx) {
    if (this.isAdmin) return true;
    if (this.round?.entryMode === 'admin') return false;
    const me = this.round?.players?.find(p => p.id === this.myPlayerId);
    const target = this.round?.players?.[playerIdx];
    if (!me || !target) return false;
    if (me.group !== target.group) return false; // different group — no

    // Check score keeper mode for this group
    const groupKeeper = (this.round?.scoreKeepers||{})[me.group];
    if (!groupKeeper) return me.id === target.id; // no keeper set — individual only
    return groupKeeper === this.myPlayerId; // keeper can score whole group
  },

  // Is this player the score keeper for their group?
  _isKeeper(playerId) {
    const p = this.round?.players?.find(pl=>pl.id===playerId);
    if (!p) return false;
    return (this.round?.scoreKeepers||{})[p.group] === playerId;
  },

  async volunteerAsKeeper() {
    const me = this.round?.players?.find(p=>p.id===this.myPlayerId);
    if (!me) return;
    const keepers = {...(this.round?.scoreKeepers||{})};
    if (keepers[me.group] === this.myPlayerId) {
      // Step down
      delete keepers[me.group];
    } else {
      // Volunteer
      keepers[me.group] = this.myPlayerId;
    }
    await DB.updateRound(this.roundCode, {scoreKeepers: keepers});
  },

  async adminSetKeeper(group, playerId) {
    const keepers = {...(this.round?.scoreKeepers||{})};
    if (playerId === 'none') delete keepers[group];
    else keepers[group] = playerId;
    await DB.updateRound(this.roundCode, {scoreKeepers: keepers});
  },

  _renderEntry(body) {
    const r = this.round;
    const h = (this._viewingHole !== undefined && this._viewingHole !== null)
      ? this._viewingHole
      : (r.currentHole || 0);
    const players = r.players || [];
    const me = players.find(p => p.id === this.myPlayerId);
    const myGroup = me?.group || null;
    const scoreKeepers = r.scoreKeepers || {};
    const myKeeper = myGroup ? scoreKeepers[myGroup] : null;
    const iAmKeeper = myKeeper === this.myPlayerId;
    const keeperName = myKeeper ? players.find(p=>p.id===myKeeper)?.name?.split(' ')[0] : null;

    // Score keeper status banner for my group
    let keeperBanner = '';
    if (!this.isAdmin && myGroup) {
      if (iAmKeeper) {
        keeperBanner = `<div style="background:var(--green-light);border:1px solid var(--green-mid);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;color:var(--green-dark);font-weight:500;">✓ You are the score keeper for Group ${myGroup}</span>
          <button onclick="Scorecard.volunteerAsKeeper()" style="font-size:11px;color:var(--red);background:none;border:none;cursor:pointer;">Step down</button>
        </div>`;
      } else if (myKeeper) {
        keeperBanner = `<div style="background:var(--bg-2);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:10px;">
          <span style="font-size:13px;color:var(--text-2);">Score keeper: <strong>${keeperName}</strong> · </span>
          <button onclick="Scorecard.volunteerAsKeeper()" style="font-size:12px;color:var(--green);background:none;border:none;cursor:pointer;font-weight:500;">Take over</button>
        </div>`;
      } else {
        keeperBanner = `<div style="background:var(--amber-light);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;color:var(--amber);">Individual scoring · each player scores themselves</span>
          <button onclick="Scorecard.volunteerAsKeeper()" style="font-size:12px;color:var(--green);background:none;border:none;cursor:pointer;font-weight:500;">Be score keeper</button>
        </div>`;
      }
    }

    // Sort: my group first, then other groups
    const sortedPlayers = [...players].sort((a,b) => {
      if (myGroup) {
        if (a.group===myGroup && b.group!==myGroup) return -1;
        if (b.group===myGroup && a.group!==myGroup) return 1;
      }
      return (a.group||1) - (b.group||1);
    });

    let html = keeperBanner;
    let lastGroup = null;

    sortedPlayers.forEach((p) => {
      const i = players.findIndex(pl => pl.id === p.id);
      if (i === -1) return;
      // Group divider with keeper info
      if (p.group && p.group !== lastGroup) {
        const isMyGroup = p.group === myGroup;
        const gk = scoreKeepers[p.group];
        const gkName = gk ? players.find(pl=>pl.id===gk)?.name?.split(' ')[0] : null;
        const keeperInfo = gkName ? ` · 📝 ${gkName}` : ' · Individual';
        html += `<div style="font-size:11px;font-weight:600;color:${isMyGroup?'var(--green)':'var(--text-2)'};padding:8px 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Group ${p.group}${isMyGroup?' · Your group':''}${keeperInfo}</div>`;
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
      const grossTotal = Object.values(r.scores?.[p.id]||{}).reduce((a,b)=>a+(b||0),0);
      const canEdit  = this._canEdit(i);
      const isMe = p.id === this.myPlayerId;

      html += `<div class="score-entry-card" style="${isMe?'border-color:var(--green);':''}">
        <div class="sec-top">
          <div class="avatar${isMe?'':''}">${p.initials}</div>
          <div class="sec-info">
            <div class="sec-name">${p.name}${isMe?' <span style="font-size:10px;color:var(--green);">(you)</span>':''}${p.group?' <span style="font-size:10px;background:var(--bg-2);color:var(--text-2);padding:1px 6px;border-radius:10px;">Grp '+p.group+'</span>':''}</div>
            <div class="sec-meta">${tee} tee · HCP ${p.hcp} · ${strokes} stroke${strokes!==1?'s':''} H${h+1}${p.startHole&&p.startHole>1?' · Start H'+p.startHole:''}</div>
          </div>
          <div class="sec-pts" style="text-align:right;">
            ${r.games?.stableford?.on ? `<div style="font-size:13px;font-weight:600;color:var(--green);">${totalPts} pts</div>` : ''}
            <div style="font-size:11px;color:var(--text-2);">${grossTotal>0?'Total: '+grossTotal:''}</div>
          </div>
        </div>
        <div class="sec-ctrl">
          ${canEdit ? `<button class="sc-minus" onclick="Scorecard.adj('${p.id}',${i},-1)">−</button>` : `<div style="width:38px;"></div>`}
          <div class="sc-display">
            <div class="sc-num" id="score-${i}">${gross}</div>
            <div class="sc-desc ${sl.cls}" id="desc-${i}">${sl.lbl} · net ${net}</div>
          </div>
          ${canEdit ? `<button class="sc-plus" onclick="Scorecard.adj('${p.id}',${i},1)">+</button>` : `<div style="width:38px;"></div>`}
        </div>
        ${!canEdit && !this.isAdmin ? `<div style="padding:6px 14px;font-size:11px;color:var(--text-3);text-align:center;">${scoreKeepers[p.group] ? `${keeperName} is entering scores` : 'You can view only'}</div>` : ''}
      </div>`;
    });

    // Get par for current hole (use first player's tee as reference)
    const firstP = players[0];
    const firstTee2 = firstP?.tee || 'Blue';
    const firstHd = r.course?.tees?.[firstTee2] || Object.values(r.course?.tees||{})[0];
    const currentPar = firstHd?.par?.[h] || 4;

    // CTP entry on par 3 holes
    if (r.games?.ctp?.on && currentPar === 3) {
      const existing = r.ctpResults?.[h] || {};
      html += `<div class="card card-pad" style="margin-top:10px;border-color:var(--blue);">
        <div style="font-size:13px;font-weight:600;color:var(--blue);margin-bottom:10px;">⛳ Closest to the pin — H${h+1} Par 3</div>
        ${(r.players||[]).map((p,i) => {
          const entry = existing[p.id] || {};
          return `<div class="player-row">
            <div class="avatar sm">${p.initials}</div>
            <div class="player-info" style="flex:1;">
              <div class="player-name" style="font-size:13px;">${p.name}</div>
              <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
                <input type="number" placeholder="Feet" min="0" value="${entry.feet||''}" id="ctp-feet-${i}" style="width:60px;padding:5px 8px;border-radius:6px;border:0.5px solid var(--border-2);font-size:13px;" />
                <span style="font-size:13px;">ft</span>
                <input type="number" placeholder="In" min="0" max="11" value="${entry.inches||''}" id="ctp-inches-${i}" style="width:50px;padding:5px 8px;border-radius:6px;border:0.5px solid var(--border-2);font-size:13px;" />
                <span style="font-size:13px;">in</span>
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--red);">
                  <input type="checkbox" id="ctp-og-${i}" ${entry.og?'checked':''} /> OG
                </label>
              </div>
            </div>
          </div>`;
        }).join('')}
        <button class="primary-btn" style="margin-top:10px;" onclick="Scorecard.saveCTP(${h})">Save CTP results</button>
      </div>`;
    }

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

    const holeIndexes = r.holeIndexes || Array.from({length:18},(_,i)=>i);
    const currentIdx = holeIndexes.indexOf(h);
    const isLastHole = currentIdx === holeIndexes.length - 1;
    const isFirstHole = currentIdx === 0;
    const nextHole = !isLastHole ? holeIndexes[currentIdx + 1] : null;
    const prevHole = !isFirstHole ? holeIndexes[currentIdx - 1] : null;

    // Score keeper or admin — can save & advance the official current hole
    const canSaveHole = this.isAdmin || (iAmKeeper && !isLastHole) || (iAmKeeper && isLastHole);
    const myGroupPlayers = players.filter(p => p.group === myGroup);
    const iAmKeeperForGroup = iAmKeeper && myGroup;

    if (this.isAdmin) {
      html += `<button class="primary-btn" onclick="Scorecard.saveHole()" style="margin-top:12px;">Save hole ${h+1}${!isLastHole?' & next →':' — finish round'}</button>`;
      html += `<button class="ghost-btn" style="margin-top:6px;border-color:var(--red);color:var(--red);" onclick="Scorecard.confirmEndRound()">End round &amp; go to payouts</button>`;
    } else if (iAmKeeper) {
      // Score keeper gets save & advance for their group's hole
      html += `<button class="primary-btn" onclick="Scorecard.saveMyGroupHole()" style="margin-top:12px;">Save scores & next hole →</button>`;
    } else {
      // Regular player — hole nav arrows at bottom
      const holeIndexes2 = r.holeIndexes || Array.from({length:18},(_,i)=>i);
      const idx2 = holeIndexes2.indexOf(h);
      const nextH = idx2 < holeIndexes2.length - 1 ? holeIndexes2[idx2 + 1] : null;
      const prevH = idx2 > 0 ? holeIndexes2[idx2 - 1] : null;
      html += `<div style="display:flex;gap:8px;margin-top:12px;">
        ${prevH !== null ? `<button class="ghost-btn" style="flex:1;" onclick="Scorecard.viewHole(${prevH})">← H${prevH+1}</button>` : '<div style="flex:1;"></div>'}
        ${nextH !== null ? `<button class="primary-btn" style="flex:2;" onclick="Scorecard.viewHole(${nextH})">Next: H${nextH+1} →</button>` : `<button class="ghost-btn" style="flex:2;" disabled>All holes scored ✓</button>`}
      </div>`;
    }

    body.innerHTML = html;
  },

  // Navigate to a different hole for viewing (doesn't change official currentHole in DB)
  viewHole(holeIdx) {
    if (!this.round) return;
    this._viewingHole = holeIdx;
    this.renderView();
  },

  async adj(playerId, playerIdx, delta) {
    const r = this.round;
    const h = (this._viewingHole !== undefined && this._viewingHole !== null)
      ? this._viewingHole
      : (r.currentHole || 0);
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

  // Score keeper saves their group's scores and advances their local view
  async saveMyGroupHole() {
    const r = this.round;
    const h = (this._viewingHole !== undefined && this._viewingHole !== null) ? this._viewingHole : (r.currentHole || 0);
    const holeIndexes = r.holeIndexes || Array.from({length:18},(_,i)=>i);
    const currentIdx = holeIndexes.indexOf(h);
    const me = r.players?.find(p=>p.id===this.myPlayerId);
    const myGroup = me?.group;

    // Save par for any unscored player in my group
    const groupPlayers = (r.players||[]).filter(p=>p.group===myGroup);
    for (const p of groupPlayers) {
      const tee = p.tee||'Blue';
      const hd = r.course.tees[tee]||Object.values(r.course.tees)[0];
      if (r.scores?.[p.id]?.[h] === undefined || r.scores?.[p.id]?.[h] === null) {
        await DB.saveScore(this.roundCode, p.id, h, hd.par[h]||4);
      }
    }

    // Move viewing hole to next
    if (currentIdx < holeIndexes.length - 1) {
      this._viewingHole = holeIndexes[currentIdx + 1];
    } else {
      alert('Your group has finished! Waiting for admin to close the round.');
    }
    this.renderView();
  },

  async saveHole() {
    const r = this.round;
    const h = r.currentHole || 0;
    const players = r.players || [];
    const holeIndexes = r.holeIndexes || Array.from({length:18},(_,i)=>i);
    const currentIdx = holeIndexes.indexOf(h);
    const isLastHole = currentIdx === holeIndexes.length - 1;

    // Issue 1 fix: Save par for any player whose score wasn't manually adjusted
    for (const p of players) {
      const tee = p.tee||'Blue';
      const hd = r.course.tees[tee]||Object.values(r.course.tees)[0];
      const existingScore = r.scores?.[p.id]?.[h];
      if (existingScore === undefined || existingScore === null) {
        const parScore = hd.par[h] || 4;
        await DB.saveScore(this.roundCode, p.id, h, parScore);
        if (!r.scores) r.scores = {};
        if (!r.scores[p.id]) r.scores[p.id] = {};
        r.scores[p.id][h] = parScore;
      }
    }

    // Determine skin result using saved scores
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
    const ranked = (r.players||[]).map((p,i) => {
      const tee = p.tee||'Blue';
      const hd = r.course?.tees?.[tee]||Object.values(r.course?.tees||{})[0];
      // Gross total
      const grossTotal = Object.values(r.scores?.[p.id]||{}).reduce((a,b)=>a+(b||0),0);
      // Net total (gross minus all strokes given)
      const netTotal = (r.holeIndexes||Array.from({length:18},(_,i)=>i)).reduce((sum,h)=>{
        const gross = r.scores?.[p.id]?.[h];
        if(gross===undefined||gross===null) return sum;
        return sum + this._net(gross, p.hcp, hd?.hcp?.[h]||1);
      },0);
      // Course par for holes played
      const holesPlayed = Object.keys(r.scores?.[p.id]||{});
      const parTotal = holesPlayed.reduce((sum,h)=>sum+(hd?.par?.[parseInt(h)]||4),0);
      const grossVsPar = grossTotal - parTotal;
      return {
        i, name:p.name, initials:p.initials, group:p.group||null,
        pts: this._totalPts(i),
        skins: Object.values(r.skinResults||{}).filter(s=>s&&!s.tied&&s.winnerId===p.id).length,
        played: holesPlayed.length,
        grossTotal, netTotal, parTotal,
        grossVsPar
      };
    }).sort((a,b)=>b.pts-a.pts);

    const fmt = (n) => n===0?'E':n>0?`+${n}`:String(n);

    body.innerHTML = `<div class="card">${ranked.map((p,rank)=>`
      <div class="lb-row">
        <div class="lb-rank${rank===0?' first':''}">${['1st','2nd','3rd','4th','5th','6th'][rank]||rank+1+'th'}</div>
        <div class="avatar sm">${p.initials}</div>
        <div class="lb-info">
          <div class="lb-name">${p.name}${p.group?' <span style="font-size:10px;color:var(--text-3);">Grp '+p.group+'</span>':''}</div>
          <div class="lb-sub">Thru ${p.played} · Gross ${p.grossTotal>0?p.grossTotal:'—'} (${p.grossTotal>0?fmt(p.grossVsPar):'—'}) · Net ${p.netTotal>0?p.netTotal:'—'}</div>
        </div>
        <div class="lb-right">
          <div class="lb-pts">${p.pts} pts</div>
          <div class="lb-skins">${p.skins} skin${p.skins!==1?'s':''}</div>
        </div>
      </div>`).join('')}</div>`;
  },

  _renderSkins(body) {
    const r = this.round;
    const tee = r.players?.[0]?.tee || 'Blue';
    const hd  = r.course.tees[tee] || Object.values(r.course.tees)[0];
    const skinPot = (r.games?.skins?.buyin||0) * (r.players?.length||0);
    const skinResults = r.skinResults || {};
    const skinsWon = Object.values(skinResults).filter(s=>s&&!s.tied).length;
    const perSkin  = skinsWon > 0 ? Math.round(skinPot/skinsWon) : 0;

    // Build per-player skin summary
    const playerSkins = {};
    Object.entries(skinResults).forEach(([h, res]) => {
      if (res && !res.tied && res.winnerId) {
        if (!playerSkins[res.winnerId]) playerSkins[res.winnerId] = [];
        playerSkins[res.winnerId].push(parseInt(h));
      }
    });

    let html = `<div class="stat-grid" style="margin-bottom:12px;">
      <div class="stat-card"><div class="stat-label">Skins won</div><div class="stat-value">${skinsWon}</div><div class="stat-sub">$${perSkin} each</div></div>
      <div class="stat-card"><div class="stat-label">Pot</div><div class="stat-value">$${skinPot}</div><div class="stat-sub">${r.players?.length||0} players</div></div>
    </div>`;

    // Player skin summary — who has what
    html += `<div class="section-label">Player skins summary</div><div class="card" style="margin-bottom:12px;">`;
    (r.players||[]).forEach(p => {
      const holes = playerSkins[p.id] || [];
      const total = holes.length * perSkin;
      html += `<div class="player-row">
        <div class="avatar${holes.length?'':' muted'}">${p.initials}</div>
        <div class="player-info">
          <div class="player-name">${p.name}</div>
          <div class="player-meta">${holes.length>0
            ? `Holes: ${holes.map(h=>'H'+(h+1)).join(', ')}`
            : 'No skins yet'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:15px;font-weight:700;color:${holes.length?'var(--green)':'var(--text-3)'};">${holes.length>0?'+$'+total:'—'}</div>
          <div style="font-size:11px;color:var(--text-2);">${holes.length} skin${holes.length!==1?'s':''}</div>
        </div>
      </div>`;
    });
    html += `</div>`;

    // Hole-by-hole detail
    html += `<div class="section-label">Hole-by-hole</div><div class="card">`;
    const holeIndexes = r.holeIndexes || Array.from({length:18},(_,i)=>i);
    const curH = r.currentHole || 0;
    holeIndexes.forEach(h => {
      if (h > curH) return;
      const res = skinResults[h];
      const par = hd?.par?.[h] || 4;
      if (!res) {
        html += `<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result" style="color:var(--text-3);">—</div></div>`;
      } else if (res.tied) {
        html += `<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><span class="tied-chip">Tied — no skin</span></div></div>`;
      } else {
        const w = r.players?.[res.winner];
        html += `<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><div class="avatar sm">${w?.initials||'?'}</div><span style="font-size:12px;font-weight:500;">${w?.name?.split(' ')[0]||''}</span></div><span class="skin-amt">+$${perSkin}</span></div>`;
      }
    });
    html += `</div>`;
    body.innerHTML = html;
  },

  _renderCard(body) {
    const r = this.round;
    const players = r.players||[];
    const holeIndexes = r.holeIndexes||Array.from({length:18},(_,i)=>i);
    const tee = players[0]?.tee||'Blue';
    const hd = r.course?.tees?.[tee]||Object.values(r.course?.tees||{})[0];
    const me = players.find(p=>p.id===this.myPlayerId);
    const myGroup = me?.group||null;

    // Group filter toggle
    const showAll = this._cardShowAll !== false;
    const filteredPlayers = showAll ? players : players.filter(p=>p.group===myGroup);

    let html = '';

    // Toggle if multiple groups
    const groups = [...new Set(players.map(p=>p.group||1))];
    if (groups.length > 1) {
      html += `<div style="display:flex;gap:8px;margin-bottom:10px;">
        <button onclick="Scorecard._cardShowAll=true;Scorecard._renderCard(document.getElementById('sc-body'))" style="flex:1;padding:8px;border-radius:var(--radius-sm);border:${showAll?'2px solid var(--green)':'0.5px solid var(--border-2)'};background:${showAll?'var(--green-light)':'none'};font-size:13px;font-weight:${showAll?'600':'400'};color:${showAll?'var(--green-dark)':'var(--text)'};cursor:pointer;">All players</button>
        <button onclick="Scorecard._cardShowAll=false;Scorecard._renderCard(document.getElementById('sc-body'))" style="flex:1;padding:8px;border-radius:var(--radius-sm);border:${!showAll?'2px solid var(--green)':'0.5px solid var(--border-2)'};background:${!showAll?'var(--green-light)':'none'};font-size:13px;font-weight:${!showAll?'600':'400'};color:${!showAll?'var(--green-dark)':'var(--text)'};cursor:pointer;">My group (${myGroup})</button>
      </div>`;
    }

    // Split into front/back
    const front = holeIndexes.slice(0, Math.min(9, holeIndexes.length));
    const back  = holeIndexes.length > 9 ? holeIndexes.slice(9) : [];

    const buildSection = (holes, label) => {
      const parTotal = holes.reduce((a,h)=>a+(hd?.par?.[h]||4),0);
      let t = `<div style="overflow-x:auto;margin-bottom:12px;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;white-space:nowrap;min-width:${holes.length*32+120}px;">
          <thead>
            <tr style="background:var(--bg-2);">
              <th style="padding:5px 8px;text-align:left;border-bottom:0.5px solid var(--border);min-width:80px;">Player</th>
              ${holes.map(h=>`<th style="padding:5px 4px;text-align:center;border-bottom:0.5px solid var(--border);width:28px;">${h+1}</th>`).join('')}
              <th style="padding:5px 8px;text-align:center;border-bottom:0.5px solid var(--border);">${label}</th>
            </tr>
            <tr style="background:var(--bg-2);">
              <th style="padding:3px 8px;text-align:left;color:var(--text-2);font-weight:400;font-size:10px;">Par</th>
              ${holes.map(h=>{const p=hd?.par?.[h]||4;return`<th style="padding:3px 4px;text-align:center;color:${p===3?'var(--blue)':p===5?'var(--green)':'var(--text-2)'};font-weight:400;font-size:10px;">${p}</th>`;}).join('')}
              <th style="padding:3px 8px;text-align:center;color:var(--text-2);font-weight:400;font-size:10px;">${parTotal}</th>
            </tr>
          </thead>
          <tbody>`;

      filteredPlayers.forEach((p,pi) => {
        const rowTotal = holes.reduce((a,h)=>a+(r.scores?.[p.id]?.[h]||0),0);
        const rowPar   = holes.reduce((a,h)=>a+(hd?.par?.[h]||4),0);
        const vsPar    = rowTotal > 0 ? rowTotal - rowPar : null;
        const isMe     = p.id === this.myPlayerId;
        const bg = isMe?'rgba(34,197,94,0.06)':pi%2===0?'var(--surface)':'var(--bg-2)';
        t += `<tr style="background:${bg};">
          <td style="padding:5px 8px;border-bottom:0.5px solid var(--border);font-weight:${isMe?'600':'400'};font-size:11px;">${p.name.split(' ')[0]} ${p.name.split(' ')[1]?.[0]||''}.</td>
          ${holes.map(h=>{
            const score=r.scores?.[p.id]?.[h];
            const par=hd?.par?.[h]||4;
            const d=score?score-par:null;
            let bg2='';
            if(d!==null){if(d<=-2)bg2='background:#7c3aed;color:white;border-radius:50%;';else if(d===-1)bg2='background:var(--green);color:white;border-radius:50%;';else if(d===1)bg2='color:var(--amber);font-weight:600;';else if(d>=2)bg2='color:var(--red);font-weight:600;';}
            return `<td style="padding:2px 2px;text-align:center;border-bottom:0.5px solid var(--border);"><span style="${bg2}padding:2px 3px;font-size:11px;">${score||'—'}</span></td>`;
          }).join('')}
          <td style="padding:5px 8px;text-align:center;border-bottom:0.5px solid var(--border);font-weight:700;font-size:12px;">
            ${rowTotal>0?rowTotal:'—'}${vsPar!==null?`<span style="font-size:9px;display:block;color:${vsPar<0?'var(--green)':vsPar>0?'var(--red)':'var(--text-2)'};">${vsPar===0?'E':vsPar>0?'+'+vsPar:vsPar}</span>`:''}
          </td>
        </tr>`;
      });
      t += `</tbody></table></div>`;
      return t;
    };

    if (front.length) html += buildSection(front, front.length<9?'Tot':'Out');
    if (back.length)  html += buildSection(back, 'In');

    // Totals row if 18 holes
    if (back.length && filteredPlayers.length > 1) {
      const frontPar = front.reduce((a,h)=>a+(hd?.par?.[h]||4),0);
      const backPar  = back.reduce((a,h)=>a+(hd?.par?.[h]||4),0);
      html += `<div class="card" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="background:var(--bg-2);">
            <th style="padding:8px;text-align:left;">Player</th>
            <th style="padding:8px;text-align:center;">Out</th>
            <th style="padding:8px;text-align:center;">In</th>
            <th style="padding:8px;text-align:center;">Total</th>
            <th style="padding:8px;text-align:center;">+/−</th>
          </tr>`;
      filteredPlayers.forEach((p,pi)=>{
        const out=front.reduce((a,h)=>a+(r.scores?.[p.id]?.[h]||0),0);
        const inp=back.reduce((a,h)=>a+(r.scores?.[p.id]?.[h]||0),0);
        const tot=out+inp; const par=frontPar+backPar;
        const vs=tot>0?tot-par:null;
        const isMe=p.id===this.myPlayerId;
        html+=`<tr style="background:${isMe?'rgba(34,197,94,0.06)':pi%2===0?'var(--surface)':'var(--bg-2)'};">
          <td style="padding:7px 8px;font-weight:${isMe?'600':'400'};">${p.name.split(' ')[0]}</td>
          <td style="padding:7px 8px;text-align:center;">${out||'—'}</td>
          <td style="padding:7px 8px;text-align:center;">${inp||'—'}</td>
          <td style="padding:7px 8px;text-align:center;font-weight:700;">${tot||'—'}</td>
          <td style="padding:7px 8px;text-align:center;font-weight:600;color:${vs!==null&&vs<0?'var(--green)':vs!==null&&vs>0?'var(--red)':'var(--text-2)'};">${vs===null?'—':vs===0?'E':vs>0?'+'+vs:vs}</td>
        </tr>`;
      });
      html+=`</table></div>`;
    }

    // Legend
    html += `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:10px;padding:0 2px;">
      <span style="background:#7c3aed;color:white;border-radius:50%;padding:1px 4px;">E</span> Eagle+
      <span style="background:var(--green);color:white;border-radius:50%;padding:1px 4px;">B</span> Birdie
      <span style="color:var(--amber);font-weight:600;">Par+1</span> Bogey
      <span style="color:var(--red);font-weight:600;">Par+2</span> Double+
    </div>`;

    body.innerHTML = html;
  },

  _renderGroups(body) {
    const r = this.round;
    const players = r.players || [];
    const groups = r.groups || [{name:'Group 1', startHole:1}];
    const isAdmin = this.isAdmin;
    const scoreKeepers = r.scoreKeepers || {};

    let html = `<div class="section-label">Group assignments${isAdmin?' <span style="font-size:11px;color:var(--text-3);">· Admin can move players &amp; assign score keepers</span>':''}</div>`;

    groups.forEach((g, gi) => {
      const groupNum = gi + 1;
      const groupPlayers = players.filter(p => p.group === groupNum);
      const keeperId = scoreKeepers[groupNum];
      const keeperName = keeperId ? players.find(p=>p.id===keeperId)?.name?.split(' ')[0] : null;

      html += `<div class="card" style="margin-bottom:10px;">
        <div class="card-section" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Group ${groupNum}${r.shotgun?' · H'+(g.startHole||1):''}</span>
          <span style="font-size:11px;color:${keeperName?'var(--green)':'var(--text-3)'};">${keeperName?'📝 '+keeperName:'Individual'}</span>
        </div>`;

      if (isAdmin) {
        html += `<div style="padding:8px 0 6px;border-bottom:0.5px solid var(--border);">
          <label style="font-size:11px;color:var(--text-2);">Score keeper:</label>
          <select style="margin-left:8px;font-size:12px;padding:3px 6px;border-radius:6px;border:0.5px solid var(--border-2);" onchange="Scorecard.adminSetKeeper(${groupNum},this.value)">
            <option value="none" ${!keeperId?'selected':''}>Individual (no keeper)</option>
            ${groupPlayers.map(p=>`<option value="${p.id}" ${p.id===keeperId?'selected':''}>${p.name.split(' ')[0]}</option>`).join('')}
          </select>
        </div>`;
      }

      groupPlayers.forEach((p) => {
        const globalIdx = players.findIndex(pl=>pl.id===p.id);
        const isKeeper = p.id === keeperId;
        html += `<div class="player-row">
          <div class="avatar">${p.initials}</div>
          <div class="player-info">
            <div class="player-name">${p.name}${isKeeper?' <span style="font-size:10px;background:var(--green-light);color:var(--green-dark);padding:1px 6px;border-radius:8px;">Score keeper</span>':''}</div>
            <div class="player-meta">HCP ${p.hcp} · ${p.tee} tee${p.startHole?' · Start H'+p.startHole:''}</div>
          </div>
          ${isAdmin ? `<select style="font-size:12px;padding:4px 6px;border-radius:6px;border:0.5px solid var(--border-2);" onchange="Scorecard.moveToGroup(${globalIdx},this.value)">
            ${groups.map((_,i)=>`<option value="${i+1}" ${p.group===i+1?'selected':''}>Grp ${i+1}</option>`).join('')}
          </select>` : ''}
        </div>`;
      });

      if (groupPlayers.length === 0) html += '<div style="padding:12px 0;font-size:13px;color:var(--text-3);">No players in this group</div>';
      html += `</div>`;
    });

    if (!isAdmin) html += `<div class="note">Tap "Be score keeper" on the Score entry tab to volunteer for your group.</div>`;
    body.innerHTML = html;
  },

  async saveCTP(hole) {
    const r = this.round;
    const players = r.players||[];
    const results = {};
    let winnerId = null;
    let winnerTotalInches = Infinity;

    players.forEach((p, i) => {
      const feet   = parseInt(document.getElementById(`ctp-feet-${i}`)?.value)||0;
      const inches = parseInt(document.getElementById(`ctp-inches-${i}`)?.value)||0;
      const og     = document.getElementById(`ctp-og-${i}`)?.checked||false;
      if (feet===0 && inches===0) return; // not entered
      const totalInches = feet*12 + inches;
      results[p.id] = { feet, inches, og, distance:`${feet}'${inches}"`, totalInches };
      if (!og && totalInches < winnerTotalInches) {
        winnerTotalInches = totalInches;
        winnerId = p.id;
      }
    });

    // Add winner to each result
    const finalResult = { ...results };
    if (winnerId) {
      Object.values(finalResult).forEach(r => { r.isWinner = r === finalResult[winnerId]; });
      finalResult.winnerId = winnerId;
      finalResult.winnerDistance = results[winnerId]?.distance;
    }

    await DB.saveCTPResult(this.roundCode, hole, finalResult);
    // Update local
    if (!r.ctpResults) r.ctpResults = {};
    r.ctpResults[hole] = finalResult;

    const winnerName = players.find(p=>p.id===winnerId)?.name;
    alert(`CTP H${hole+1} saved!${winnerId?' Winner: '+winnerName+' ('+finalResult[winnerId]?.distance+')':' No on-green shots recorded.'}`);
  },

  async confirmEndRound() {
    const r = this.round;
    const holeIndexes = r.holeIndexes || Array.from({length:18},(_,i)=>i);
    const holesPlayed = holeIndexes.filter(i => r.players.some(p => r.scores?.[p.id]?.[i] !== undefined)).length;

    // Show options modal
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `<div style="background:white;border-radius:20px;padding:24px;width:100%;max-width:340px;">
      <div style="font-size:17px;font-weight:600;margin-bottom:6px;">End round</div>
      <div style="font-size:13px;color:var(--text-2);margin-bottom:20px;">${holesPlayed} hole${holesPlayed!==1?'s':''} scored. How would you like to end?</div>
      <button class="primary-btn" style="margin-bottom:10px;" onclick="Scorecard._endRoundWithSave();this.closest('div[style]').remove();">
        Save to history &amp; go to payouts
      </button>
      <button class="ghost-btn" style="margin-bottom:10px;color:var(--amber);border-color:var(--amber);" onclick="Scorecard._endRoundNoHistory();this.closest('div[style]').remove();">
        End &amp; go to payouts (no history saved)
      </button>
      <button class="ghost-btn" style="color:var(--red);border-color:var(--red);margin-bottom:10px;" onclick="Scorecard._deleteRound();this.closest('div[style]').remove();">
        Delete round entirely
      </button>
      <button class="ghost-btn" onclick="this.closest('div[style]').remove();">Cancel</button>
    </div>`;
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  },

  async _endRoundWithSave() {
    const r = this.round;
    await DB.updateRound(this.roundCode, {status:'complete'});
    Payouts.buildFromRound({...r, code:this.roundCode});
    App.nav('payouts');
  },

  async _endRoundNoHistory() {
    const r = this.round;
    await DB.updateRound(this.roundCode, {status:'complete'});
    // Build payouts but skip history save in closeRound
    Payouts.buildFromRound({...r, code:this.roundCode, skipHistory:true});
    App.nav('payouts');
  },

  async _deleteRound() {
    if (!confirm('Delete this round completely? No scores or payouts will be saved.')) return;
    await DB.deleteRound(this.roundCode);
    Store.clearActiveRound();
    this.round = null;
    App.nav('home');
    Home.render();
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
    const totalHoles = (r.holeIndexes||[]).length || 18;

    // Summary stats
    const playerData = (r.players||[]).map((p,i) => {
      const playerQuota = is9hole ? (p.quota9||Math.round((p.quota||18)/2)) : (p.quota||18);
      const currentPts  = this._totalPts(i);
      const scored      = Object.keys(r.scores?.[p.id]||{}).length;
      const diff        = currentPts - playerQuota;
      return {p, i, playerQuota, currentPts, scored, diff};
    }).sort((a,b) => b.diff - a.diff); // Best vs quota first

    let html = `<div class="section-label">Quota standings</div><div class="card">`;
    playerData.forEach(({p, i, playerQuota, currentPts, scored, diff}) => {
      const pct = Math.min(100, Math.round(currentPts/playerQuota*100));
      const fillColor = pct>=100?'var(--green)':pct>=70?'var(--amber)':'var(--red)';
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
      const diffCol = diff >= 0 ? 'var(--green)' : 'var(--red)';
      const mySkinsHoles = Object.entries(r.skinResults||{})
        .filter(([,s])=>s&&!s.tied&&s.winnerId===p.id)
        .map(([h])=>'H'+(parseInt(h)+1)).join(', ');

      html += `<div class="quota-row" style="flex-wrap:wrap;">
        <div class="avatar">${p.initials}</div>
        <div class="quota-info" style="flex:1;">
          <div class="quota-name">${p.name}</div>
          <div style="display:flex;justify-content:space-between;margin-top:3px;">
            <span style="font-size:12px;color:var(--text-2);">Quota ${playerQuota} · ${scored} holes played</span>
            <span style="font-size:13px;font-weight:700;color:${diffCol};">${diffStr} pts</span>
          </div>
          <div class="mini-bar" style="margin-top:5px;"><div class="mini-fill" style="width:${pct}%;background:${fillColor};"></div></div>
          <div style="display:flex;justify-content:space-between;margin-top:3px;">
            <span style="font-size:11px;color:var(--text-2);">Scored ${currentPts} / need ${playerQuota}</span>
            <span style="font-size:11px;color:${diff>=0?'var(--green)':'var(--red)'};">${diff>=0?'Beating quota ✓':'Behind quota'}</span>
          </div>
        </div>
      </div>`;
    });
    html += `</div>`;
    body.innerHTML = html;
  },
};
