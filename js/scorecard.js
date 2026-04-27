// ── Scorecard ──
const Scorecard = {
  round: null,
  view: 'entry',

  load(round) {
    this.round = round;
    this.view = 'entry';
    this.render();
  },

  render() {
    if (!this.round) {
      const saved = Store.getActiveRound();
      if (saved) { this.round = saved; } else return;
    }
    const r = this.round;
    const h = r.currentHole;
    const course = r.course;
    const tee = r.players[0]?.tee || 'Blue';
    const holeData = course.tees[tee];

    document.getElementById('sc-course-name').textContent = course.name;
    document.getElementById('sc-course-sub').textContent = `${r.players.length} players · ${r.date}`;
    document.getElementById('sc-hole-display').textContent = `H${h+1}`;

    // Hole nav
    const nav = document.getElementById('sc-hole-nav');
    nav.innerHTML = r.players.length ? Array.from({length:18},(_,i) => {
      const done = r.players[0].scores[i] !== null;
      const skin = r.skinResults[i];
      const skinWon = skin && !skin.tied;
      return `<button class="hole-pill${i===h?' active':''}${done?' done':''}${skinWon?' skin-won':''}" onclick="Scorecard.goHole(${i})">${i+1}</button>`;
    }).join('') : '';

    // Hole info
    const par = holeData?.par[h] || 4;
    const yds = holeData?.yds[h] || 0;
    const hcp = holeData?.hcp[h] || 1;
    document.getElementById('sc-hole-info').innerHTML = `
      <div class="hole-info-cell"><div class="hic-label">Par</div><div class="hic-val">${par}</div></div>
      <div class="hole-info-cell"><div class="hic-label">Yards</div><div class="hic-val">${yds}</div></div>
      <div class="hole-info-cell"><div class="hic-label">Hcp idx</div><div class="hic-val">${hcp}</div></div>
      <div class="hole-info-cell"><div class="hic-label">Hole</div><div class="hic-val" style="color:var(--green);">${h+1}/18</div></div>`;

    this.renderView();
  },

  renderView() {
    const body = document.getElementById('sc-body');
    if (this.view === 'entry') this._renderEntry(body);
    else if (this.view === 'leaderboard') this._renderLeaderboard(body);
    else if (this.view === 'skins') this._renderSkins(body);
    else this._renderQuota(body);
  },

  showView(v, tab) {
    this.view = v;
    document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    this.renderView();
  },

  _getStrokes(playerHcp, holeHcpIdx) {
    if (!this.round.useHandicap) return 0;
    let s = 0;
    if (playerHcp >= holeHcpIdx) s++;
    if (playerHcp >= 18 + holeHcpIdx) s++;
    return s;
  },

  _getNetScore(gross, playerHcp, holeHcpIdx) {
    return gross - this._getStrokes(playerHcp, holeHcpIdx);
  },

  _scoreLabel(net, par) {
    const d = net - par;
    if (d <= -2) return { lbl: 'Eagle', cls: 'sc-eagle' };
    if (d === -1) return { lbl: 'Birdie', cls: 'sc-birdie' };
    if (d === 0)  return { lbl: 'Par',    cls: 'sc-par'    };
    if (d === 1)  return { lbl: 'Bogey',  cls: 'sc-bogey'  };
    if (d === 2)  return { lbl: 'Double', cls: 'sc-double' };
    return { lbl: `+${d}`, cls: 'sc-worse' };
  },

  _stablefordPts(net, par, ptTable) {
    const d = net - par;
    if (d <= -2) return ptTable.eagle;
    if (d === -1) return ptTable.birdie;
    if (d === 0)  return ptTable.par;
    if (d === 1)  return ptTable.bogey;
    if (d === 2)  return ptTable.double;
    return ptTable.worse;
  },

  _getTotalPts(playerIdx) {
    const r = this.round;
    const pts = r.games.stableford.pts;
    let total = 0;
    r.players[playerIdx].scores.forEach((score, h) => {
      if (score === null) return;
      const tee = r.players[playerIdx].tee;
      const holeData = r.course.tees[tee];
      const net = this._getNetScore(score, r.players[playerIdx].hcp, holeData.hcp[h]);
      total += this._stablefordPts(net, holeData.par[h], pts);
    });
    return total;
  },

  _renderEntry(body) {
    const r = this.round;
    const h = r.currentHole;
    if (!r.players.length) { body.innerHTML = `<div class="empty-state"><div class="empty-title">No players in round</div></div>`; return; }

    let html = '';
    r.players.forEach((p, i) => {
      const tee = p.tee || 'Blue';
      const holeData = r.course.tees[tee] || Object.values(r.course.tees)[0];
      const par = holeData.par[h];
      const hcpIdx = holeData.hcp[h];
      const strokes = this._getStrokes(p.hcp, hcpIdx);
      const gross = r.curScores[i] !== undefined ? r.curScores[i] : par;
      const net = this._getNetScore(gross, p.hcp, hcpIdx);
      const sl = this._scoreLabel(net, par);
      const totalPts = this._getTotalPts(i);
      const holesPlayed = p.scores.filter(s => s !== null).length;

      html += `<div class="score-entry-card">
        <div class="sec-top">
          <div class="avatar">${p.initials}</div>
          <div class="sec-info">
            <div class="sec-name">${p.name}</div>
            <div class="sec-meta">HCP ${p.hcp} · ${tee} · ${strokes} stroke${strokes!==1?'s':''} H${h+1}</div>
          </div>
          <div class="sec-pts">${r.games.stableford.on ? totalPts + ' pts' : holesPlayed + ' holes'}</div>
        </div>
        <div class="sec-ctrl">
          <button class="sc-minus" onclick="Scorecard.adj(${i},-1)">−</button>
          <div class="sc-display">
            <div class="sc-num" id="score-${i}">${gross}</div>
            <div class="sc-desc ${sl.cls}" id="desc-${i}">${sl.lbl} · net ${net}</div>
          </div>
          <button class="sc-plus" onclick="Scorecard.adj(${i},1)">+</button>
        </div>
      </div>`;
    });

    // Skin preview
    const skinGame = r.games.skins;
    if (skinGame.on) {
      const netScores = r.players.map((p, i) => {
        const tee = p.tee || 'Blue';
        const hd = r.course.tees[tee] || Object.values(r.course.tees)[0];
        return this._getNetScore(r.curScores[i] || hd.par[h], p.hcp, hd.hcp[h]);
      });
      const min = Math.min(...netScores);
      const winners = netScores.reduce((a,s,i) => s===min?[...a,i]:a, []);
      if (winners.length === 1) {
        html += `<div class="sec-skin-result skr-won">Skin: ${r.players[winners[0]].name} leads this hole</div>`;
      } else {
        html += `<div class="sec-skin-result skr-tied">Tied — no skin will be awarded</div>`;
      }
    }

    html += `<button class="primary-btn" onclick="Scorecard.saveHole()" style="margin-top:12px;">Save hole ${h+1}${h<17?' &amp; next →':' — finish round'}</button>`;
    body.innerHTML = html;
  },

  adj(playerIdx, delta) {
    const r = this.round;
    const h = r.currentHole;
    const tee = r.players[playerIdx].tee || 'Blue';
    const hd = r.course.tees[tee] || Object.values(r.course.tees)[0];
    r.curScores[playerIdx] = Math.max(1, (r.curScores[playerIdx] || hd.par[h]) + delta);
    const gross = r.curScores[playerIdx];
    const net = this._getNetScore(gross, r.players[playerIdx].hcp, hd.hcp[h]);
    const sl = this._scoreLabel(net, hd.par[h]);
    const el = document.getElementById('score-' + playerIdx);
    const dl = document.getElementById('desc-' + playerIdx);
    if (el) el.textContent = gross;
    if (dl) { dl.textContent = sl.lbl + ' · net ' + net; dl.className = 'sc-desc ' + sl.cls; }
    // Update skin preview
    this._updateSkinPreview();
  },

  _updateSkinPreview() {
    const r = this.round;
    const h = r.currentHole;
    if (!r.games.skins.on) return;
    const netScores = r.players.map((p, i) => {
      const tee = p.tee || 'Blue';
      const hd = r.course.tees[tee] || Object.values(r.course.tees)[0];
      return this._getNetScore(r.curScores[i] || hd.par[h], p.hcp, hd.hcp[h]);
    });
    const min = Math.min(...netScores);
    const winners = netScores.reduce((a,s,i) => s===min?[...a,i]:a, []);
    const el = document.querySelector('.sec-skin-result');
    if (!el) return;
    if (winners.length === 1) {
      el.className = 'sec-skin-result skr-won';
      el.textContent = `Skin: ${r.players[winners[0]].name} leads this hole`;
    } else {
      el.className = 'sec-skin-result skr-tied';
      el.textContent = 'Tied — no skin will be awarded';
    }
  },

  saveHole() {
    const r = this.round;
    const h = r.currentHole;
    // Save scores
    r.players.forEach((p, i) => {
      const tee = p.tee || 'Blue';
      const hd = r.course.tees[tee] || Object.values(r.course.tees)[0];
      p.scores[h] = r.curScores[i] || hd.par[h];
    });
    // Determine skin
    const netScores = r.players.map((p, i) => {
      const tee = p.tee || 'Blue';
      const hd = r.course.tees[tee] || Object.values(r.course.tees)[0];
      return this._getNetScore(p.scores[h], p.hcp, hd.hcp[h]);
    });
    const min = Math.min(...netScores);
    const winners = netScores.reduce((a,s,i) => s===min?[...a,i]:a, []);
    r.skinResults[h] = winners.length === 1 ? {winner: winners[0], tied: false} : {tied: true};

    if (h < 17) {
      r.currentHole = h + 1;
      const nextPar = r.players.map((p, i) => {
        const tee = p.tee || 'Blue';
        const hd = r.course.tees[tee] || Object.values(r.course.tees)[0];
        return hd.par[h+1] || 4;
      });
      r.curScores = nextPar;
      Store.saveActiveRound(r);
      this.render();
    } else {
      Store.saveActiveRound(r);
      this.render();
      Payouts.buildFromRound(r);
      setTimeout(() => App.nav('payouts'), 300);
    }
  },

  goHole(idx) {
    const r = this.round;
    r.currentHole = idx;
    // Load existing scores or default to par
    r.curScores = r.players.map((p, i) => {
      const tee = p.tee || 'Blue';
      const hd = r.course.tees[tee] || Object.values(r.course.tees)[0];
      return p.scores[idx] !== null ? p.scores[idx] : hd.par[idx] || 4;
    });
    Store.saveActiveRound(r);
    this.render();
  },

  _renderLeaderboard(body) {
    const r = this.round;
    const ranked = r.players.map((p, i) => ({
      i, name: p.name, initials: p.initials,
      pts: this._getTotalPts(i),
      skins: r.skinResults.filter(s => s && !s.tied && s.winner === i).length,
      played: p.scores.filter(s => s !== null).length
    })).sort((a,b) => b.pts - a.pts);

    let html = `<div class="card">` + ranked.map((p, rank) => `
      <div class="lb-row">
        <div class="lb-rank${rank===0?' first':''}">${['1st','2nd','3rd','4th','5th','6th','7th','8th'][rank]||rank+1+'th'}</div>
        <div class="avatar sm">${p.initials}</div>
        <div class="lb-info"><div class="lb-name">${p.name}</div><div class="lb-sub">Thru ${p.played} holes</div></div>
        <div class="lb-right"><div class="lb-pts">${p.pts} pts</div><div class="lb-skins">${p.skins} skin${p.skins!==1?'s':''}</div></div>
      </div>`).join('') + `</div>`;
    body.innerHTML = html;
  },

  _renderSkins(body) {
    const r = this.round;
    const tee = r.players[0]?.tee || 'Blue';
    const hd = r.course.tees[tee] || Object.values(r.course.tees)[0];
    const skinVal = r.games.skins.on ? (r.games.skins.buyin * r.players.length / 18).toFixed(2) : 0;
    const awarded = r.skinResults.filter(s => s && !s.tied).length;
    const tied = r.skinResults.filter(s => s && s.tied).length;

    let html = `<div class="stat-grid" style="margin-bottom:14px;">
      <div class="stat-card"><div class="stat-label">Skins won</div><div class="stat-value">${awarded}</div><div class="stat-sub">of ${r.currentHole} holes</div></div>
      <div class="stat-card"><div class="stat-label">Tied holes</div><div class="stat-value">${tied}</div><div class="stat-sub">no skin awarded</div></div>
    </div><div class="card">`;

    for (let h = 0; h <= r.currentHole; h++) {
      const res = r.skinResults[h];
      const par = hd?.par[h] || 4;
      if (!res) { html += `<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result" style="color:var(--text-3);">Not yet played</div></div>`; continue; }
      if (res.tied) {
        html += `<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><span class="tied-chip">Tied — no skin</span></div></div>`;
      } else {
        const w = r.players[res.winner];
        html += `<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><div class="avatar sm">${w.initials}</div><span style="font-size:12px;font-weight:500;">${w.name.split(' ')[0]}</span></div><span class="skin-amt">+$${parseFloat(skinVal).toFixed(0)}</span></div>`;
      }
    }
    html += `</div>`;
    body.innerHTML = html;
  },

  _renderQuota(body) {
    const r = this.round;
    if (!r.games.quota.on && !r.games.stableford.on) {
      body.innerHTML = `<div class="empty-state"><div class="empty-title">Quota not enabled</div><div class="empty-sub">Enable quota in game settings.</div></div>`;
      return;
    }
    const pts = r.games.quota.on ? r.games.quota.pts : r.games.stableford.pts;
    let html = `<div class="card">`;
    r.players.forEach((p, i) => {
      const scored = p.scores.filter(s => s !== null).length;
      const currentPts = this._getTotalPts(i);
      const pct = Math.min(100, Math.round(currentPts / p.quota * 100));
      const paceTarget = Math.round(p.quota / 18 * scored);
      const diff = currentPts - paceTarget;
      const fillColor = pct >= 100 ? 'var(--green)' : pct >= 70 ? 'var(--amber)' : 'var(--red)';
      html += `<div class="quota-row">
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
