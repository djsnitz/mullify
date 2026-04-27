// ── Payouts ──
const Payouts = {
  round: null,
  view: 'cashout',
  paidOut: [],

  buildFromRound(round) {
    this.round = round;
    this.paidOut = round.players.map(() => false);
    this.view = 'cashout';
    document.getElementById('payout-pot-chip').textContent = '$' + round.pot;
  },

  renderView() {
    const body = document.getElementById('payouts-body');
    if (!this.round) {
      body.innerHTML = `<div class="empty-state"><div class="empty-title">No round data</div><div class="empty-sub">Complete a round to see payouts.</div></div>`;
      return;
    }
    if (this.view === 'cashout') this._renderCashout(body);
    else if (this.view === 'breakdown') this._renderBreakdown(body);
    else this._renderLedger(body);
  },

  showView(v, tab) {
    this.view = v;
    document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    this.renderView();
  },

  _calcWinnings() {
    const r = this.round;
    if (!r) return [];
    const skinGame = r.games.skins;
    const sfGame = r.games.stableford;
    const winnings = r.players.map(() => 0);

    // Skins
    if (skinGame.on) {
      const skinPot = skinGame.buyin * r.players.length;
      const skinsWon = r.skinResults.filter(s => s && !s.tied).length;
      const perSkin = skinsWon > 0 ? skinPot / skinsWon : 0;
      r.skinResults.forEach(s => {
        if (s && !s.tied) winnings[s.winner] += perSkin;
      });
    }

    // Stableford
    if (sfGame.on) {
      const sfPot = sfGame.buyin * r.players.length;
      const pts = r.players.map((_, i) => {
        let total = 0;
        r.players[i].scores.forEach((score, h) => {
          if (score === null) return;
          const tee = r.players[i].tee || 'Blue';
          const hd = r.course.tees[tee] || Object.values(r.course.tees)[0];
          const net = score - (Scorecard._getStrokes ? Scorecard._getStrokes(r.players[i].hcp, hd.hcp[h]) : 0);
          const d = net - hd.par[h];
          const ptTable = sfGame.pts;
          if (d <= -2) total += ptTable.eagle;
          else if (d === -1) total += ptTable.birdie;
          else if (d === 0) total += ptTable.par;
          else if (d === 1) total += ptTable.bogey;
          else if (d === 2) total += ptTable.double;
          else total += ptTable.worse;
        });
        return total;
      });
      const ranked = pts.map((p, i) => ({i, p})).sort((a,b) => b.p - a.p);
      const places = Math.min(sfGame.places || 2, ranked.length);
      const splits = places === 1 ? [1] : places === 2 ? [0.6, 0.4] : [0.5, 0.3, 0.2];
      splits.forEach((pct, rank) => { if (ranked[rank]) winnings[ranked[rank].i] += Math.round(sfPot * pct); });
    }
    return winnings;
  },

  _renderCashout(body) {
    const r = this.round;
    const winnings = this._calcWinnings();
    const totalPaid = r.players.reduce((s, _, i) => s + (this.paidOut[i] ? winnings[i] : 0), 0);
    const pct = r.pot > 0 ? Math.round(totalPaid / r.pot * 100) : 0;

    // Find top winner for banner
    const topIdx = winnings.indexOf(Math.max(...winnings));
    const topP = r.players[topIdx];
    const skinsWon = r.skinResults.filter(s => s && !s.tied && s.winner === topIdx).length;

    let html = `<div class="winner-banner">
      <div class="winner-avatar">${topP.initials}</div>
      <div><div class="winner-name">${topP.name}</div><div class="winner-sub">${skinsWon} skin${skinsWon!==1?'s':''} · top stableford</div></div>
      <div class="winner-amt">$${Math.round(winnings[topIdx])}</div>
    </div>`;

    html += `<div class="progress-bar-wrap">
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>
      <div class="progress-bar-labels"><span>$${Math.round(totalPaid)} paid out</span><span>$${r.pot} total</span></div>
    </div>`;

    html += `<div class="section-label">Pay each winner from the pot</div><div class="card">`;
    r.players.forEach((p, i) => {
      const amt = Math.round(winnings[i]);
      const paid = this.paidOut[i];
      if (amt <= 0) {
        html += `<div class="payout-row"><div class="avatar muted">${p.initials}</div><div class="payout-info"><div class="payout-name">${p.name}</div><div class="payout-detail">No winnings this round</div></div><div class="payout-amt amt-zero">—</div></div>`;
      } else {
        html += `<div class="payout-row">
          <div class="avatar">${p.initials}</div>
          <div class="payout-info"><div class="payout-name">${p.name}</div><div class="payout-detail">${this._winDetail(i, winnings)}</div></div>
          <div class="payout-amt amt-win">$${amt}</div>
          <button class="mark-paid-btn${paid?' paid':''}" onclick="Payouts.markPaid(${i},this)">${paid?'Paid ✓':'Mark paid'}</button>
        </div>`;
      }
    });
    html += `</div>`;

    html += `<div class="card card-pad" style="margin-top:4px;">
      <div class="balance-row"><span class="balance-label">Total collected</span><span>$${r.pot}</span></div>
      <div class="balance-row"><span class="balance-label">Paid out</span><span class="b-green">$${Math.round(totalPaid)}</span></div>
      <div class="balance-row"><span class="balance-label">Remaining in pot</span><span>${r.pot - Math.round(totalPaid) === 0 ? '<span class="b-green">$0 ✓</span>' : '$' + (r.pot - Math.round(totalPaid))}</span></div>
    </div>`;

    html += `<button class="primary-btn" onclick="Payouts.closeRound()">Close round &amp; update quotas</button>`;
    html += `<button class="ghost-btn" onclick="App.nav('scorecard')">Back to scorecard</button>`;
    body.innerHTML = html;
  },

  _winDetail(idx, winnings) {
    const r = this.round;
    const skins = r.skinResults.filter(s => s && !s.tied && s.winner === idx).length;
    const parts = [];
    if (skins) parts.push(`${skins} skin${skins!==1?'s':''}`);
    return parts.join(' · ') || 'Winnings';
  },

  markPaid(idx, btn) {
    this.paidOut[idx] = !this.paidOut[idx];
    btn.classList.toggle('paid');
    btn.textContent = this.paidOut[idx] ? 'Paid ✓' : 'Mark paid';
    // Update totals live
    const r = this.round;
    const winnings = this._calcWinnings();
    const totalPaid = r.players.reduce((s,_,i) => s + (this.paidOut[i] ? Math.round(winnings[i]) : 0), 0);
    const pct = r.pot > 0 ? Math.round(totalPaid / r.pot * 100) : 0;
    const bar = document.querySelector('.progress-bar-fill');
    const lbl = document.querySelector('.progress-bar-labels span');
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = '$' + totalPaid + ' paid out';
  },

  _renderBreakdown(body) {
    const r = this.round;
    const tee = r.players[0]?.tee || 'Blue';
    const hd = r.course.tees[tee] || Object.values(r.course.tees)[0];

    let html = '';
    if (r.games.skins.on) {
      const skinPot = r.games.skins.buyin * r.players.length;
      const skinsWon = r.skinResults.filter(s => s && !s.tied).length;
      const perSkin = skinsWon > 0 ? Math.round(skinPot / skinsWon) : 0;
      html += `<div class="section-label">Skins — $${skinPot} pot ($${perSkin}/skin)</div><div class="card">`;
      for (let h = 0; h < 18; h++) {
        const res = r.skinResults[h];
        const par = hd?.par[h] || 4;
        if (!res) continue;
        if (res.tied) {
          html += `<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><span class="tied-chip">Tied — no skin</span></div></div>`;
        } else {
          const w = r.players[res.winner];
          html += `<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><div class="avatar sm">${w.initials}</div><span style="font-size:12px;font-weight:500;">${w.name.split(' ')[0]}</span></div><span class="skin-amt">$${perSkin}</span></div>`;
        }
      }
      html += `</div>`;
    }

    if (r.games.stableford.on) {
      const sfPot = r.games.stableford.buyin * r.players.length;
      const places = r.games.stableford.places || 2;
      const splits = places === 1 ? [1] : places === 2 ? [0.6, 0.4] : [0.5, 0.3, 0.2];
      const ranked = r.players.map((p,i) => ({p,i,pts:0}));
      // calc pts
      ranked.forEach(item => {
        item.p.scores.forEach((score,h) => {
          if (score===null) return;
          const th = r.course.tees[item.p.tee]||Object.values(r.course.tees)[0];
          const d = score - th.par[h];
          const pt = r.games.stableford.pts;
          if (d<=-2) item.pts+=pt.eagle; else if(d===-1) item.pts+=pt.birdie; else if(d===0) item.pts+=pt.par; else if(d===1) item.pts+=pt.bogey; else if(d===2) item.pts+=pt.double; else item.pts+=pt.worse;
        });
      });
      ranked.sort((a,b) => b.pts - a.pts);
      const labels = ['1st','2nd','3rd'];
      html += `<div class="section-label">Stableford — $${sfPot} pot (${splits.map((s,i) => `${labels[i]} ${Math.round(s*100)}%`).join(' · ')})</div><div class="card">`;
      ranked.forEach((item, rank) => {
        const payout = rank < splits.length ? Math.round(sfPot * splits[rank]) : 0;
        html += `<div class="payout-row">
          <div style="font-size:13px;font-weight:600;color:${rank===0?'var(--green)':rank===1?'var(--green-mid)':'var(--text-3)'};min-width:30px;">${labels[rank]||''}</div>
          <div class="avatar">${item.p.initials}</div>
          <div class="payout-info"><div class="payout-name">${item.p.name}</div><div class="payout-detail">${item.pts} pts</div></div>
          <div class="payout-amt ${payout>0?'amt-win':'amt-zero'}">${payout>0?'$'+payout:'—'}</div>
        </div>`;
      });
      html += `</div>`;
    }
    body.innerHTML = html || `<div class="empty-state"><div class="empty-title">No games active</div></div>`;
  },

  _renderLedger(body) {
    const r = this.round;
    const winnings = this._calcWinnings();
    let html = `<div class="section-label">Pot accounting</div><div class="card card-pad">`;
    html += `<div class="balance-row"><span class="balance-label">Collected (${r.players.length} × $${r.buyin})</span><span class="b-green">+$${r.pot}</span></div>`;
    const totalPaid = winnings.reduce((a,b) => a + Math.round(b), 0);
    html += `<div class="balance-row"><span class="balance-label">Total paid out</span><span class="b-red">−$${totalPaid}</span></div>`;
    html += `<div class="balance-row"><span class="balance-label">Remainder</span><span class="${r.pot-totalPaid===0?'b-green':''}">$${r.pot-totalPaid}</span></div>`;
    html += `</div>`;
    html += `<div class="section-label">Individual results</div><div class="card">`;
    r.players.forEach((p,i) => {
      const net = Math.round(winnings[i]) - r.buyin;
      html += `<div class="payout-row">
        <div class="avatar${net<0?' muted':''}">${p.initials}</div>
        <div class="payout-info"><div class="payout-name">${p.name}</div><div class="payout-detail">Paid $${r.buyin} · won $${Math.round(winnings[i])}</div></div>
        <div class="payout-amt" style="color:${net>0?'var(--green)':net<0?'var(--red)':'var(--text-3)'};">${net>0?'+':''}$${net}</div>
      </div>`;
    });
    html += `</div>`;
    body.innerHTML = html;
  },

  closeRound() {
    const r = this.round;
    // Update quotas
    const rules = Store.getQuotaRules();
    const players = Store.getPlayers();
    if (r.games.quota.on || r.games.stableford.on) {
      r.players.forEach(rp => {
        const sp = players.find(p => p.id === rp.id);
        if (!sp) return;
        let pts = 0;
        rp.scores.forEach((score,h) => {
          if (score===null) return;
          const tee=rp.tee||'Blue'; const hd=r.course.tees[tee]||Object.values(r.course.tees)[0];
          const d=score-hd.par[h];
          const pt=r.games.quota.on?r.games.quota.pts:r.games.stableford.pts;
          if(d<=-2)pts+=pt.eagle; else if(d===-1)pts+=pt.birdie; else if(d===0)pts+=pt.par; else if(d===1)pts+=pt.bogey; else if(d===2)pts+=pt.double; else pts+=pt.worse;
        });
        const diff = pts - sp.quota;
        let adj = 0;
        if (diff >= rules.upThresh) adj = Math.min(Math.floor(diff/rules.upThresh)*rules.upAmt, rules.maxUp);
        else if (diff <= -rules.dnThresh) adj = -Math.min(Math.floor(Math.abs(diff)/rules.dnThresh)*rules.dnAmt, rules.maxDn);
        Store.updatePlayer(sp.id, {
          quota: sp.quota + adj,
          history: [...(sp.history||[]), {date:r.date,course:r.course.name,quota:sp.quota,scored:pts,adj}].slice(-20)
        });
      });
    }
    Store.addRoundToHistory(r);
    Store.clearActiveRound();
    this.round = null;
    App.nav('home');
    Home.render();
  }
};
