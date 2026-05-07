// ── Payouts ──
const Payouts = {
  round: null,
  view: 'cashout',
  paidOut: {},

  buildFromRound(round) {
    // Always load fresh from DB to ensure scores are included
    if (round.code) {
      DB.getRound(round.code).then(fullRound => {
        if (fullRound) this.round = {...fullRound, code: round.code};
        else this.round = round;
        this.paidOut = {};
        this.view = 'cashout';
        document.getElementById('payout-pot-chip').textContent = '$' + (this.round.pot||0);
        this.renderView();
      });
    } else {
      this.round = round;
      this.paidOut = {};
      this.view = 'cashout';
      document.getElementById('payout-pot-chip').textContent = '$' + (round.pot||0);
    }
  },

  renderView() {
    const body = document.getElementById('payouts-body');
    if (!this.round) {
      body.innerHTML=`<div class="empty-state"><div class="empty-title">Loading payouts…</div></div>`;
      return;
    }
    if (this.view==='cashout')        this._renderCashout(body);
    else if (this.view==='breakdown') this._renderBreakdown(body);
    else if (this.view==='scorecard') this._renderScorecard(body);
    else                              this._renderLedger(body);
  },

  showView(v,tab) {
    this.view=v;
    document.querySelectorAll('.view-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    this.renderView();
  },

  _calcWinnings() {
    const r = this.round;
    if (!r) return [];
    const players = r.players||[];
    const winnings = players.map(()=>0);

    // Helper: calculate stableford points for a player from saved scores
    const calcPts = (p, pts) => {
      const tee = p.tee||'Blue';
      const hd = r.course?.tees?.[tee]||Object.values(r.course?.tees||{})[0];
      const holeIndexes = r.holeIndexes||Array.from({length:18},(_,i)=>i);
      let total = 0;
      holeIndexes.forEach(h => {
        const gross = r.scores?.[p.id]?.[h];
        if (gross===undefined||gross===null) return;
        // Calculate strokes given on this hole
        const hcpIdx = hd?.hcp?.[h]||1;
        let strokes = 0;
        if (r.useHandicap !== false) {
          if (p.hcp >= hcpIdx) strokes++;
          if (p.hcp >= 18 + hcpIdx) strokes++;
        }
        const net = gross - strokes;
        const par = hd?.par?.[h]||4;
        const d = net - par;
        if (d<=-2) total+=pts.eagle||4;
        else if (d===-1) total+=pts.birdie||3;
        else if (d===0)  total+=pts.par||2;
        else if (d===1)  total+=pts.bogey||1;
        else if (d===2)  total+=pts.double||0;
        else total+=pts.worse||0;
      });
      return total;
    };

    // Helper: gross total for a player
    const grossTotal = (p) =>
      Object.values(r.scores?.[p.id]||{}).reduce((a,b)=>a+(b||0),0);

    // Helper: net total for a player
    const netTotal = (p) => {
      const tee = p.tee||'Blue';
      const hd = r.course?.tees?.[tee]||Object.values(r.course?.tees||{})[0];
      const holeIndexes = r.holeIndexes||Array.from({length:18},(_,i)=>i);
      return holeIndexes.reduce((sum,h) => {
        const gross = r.scores?.[p.id]?.[h];
        if (gross===undefined||gross===null) return sum;
        const hcpIdx = hd?.hcp?.[h]||1;
        let strokes = 0;
        if (r.useHandicap !== false) {
          if (p.hcp >= hcpIdx) strokes++;
          if (p.hcp >= 18+hcpIdx) strokes++;
        }
        return sum + (gross - strokes);
      }, 0);
    };

    // ── Skins: exact decimals ──
    if (r.games?.skins?.on) {
      const skinPot = r.games.skins.buyin * players.length;
      const won = Object.values(r.skinResults||{}).filter(s=>s&&!s.tied);
      const perSkin = won.length>0 ? skinPot/won.length : 0;
      won.forEach(s=>{ if(s.winner!==undefined) winnings[s.winner]+=perSkin; });
    }

    // ── Stableford: with tie splitting ──
    if (r.games?.stableford?.on) {
      const sfPot = r.games.stableford.buyin * players.length;
      const places = r.games.stableford.places||2;
      const pts = r.games.stableford.pts||{eagle:4,birdie:3,par:2,bogey:1,double:0,worse:0};
      const scores = players.map(p=>calcPts(p,pts));
      this._distributeWithTies(winnings, scores, places, sfPot);
    }

    // ── CTP + carryover to quota ──
    let ctpCarryover = 0;
    if (r.games?.ctp?.on) {
      const ctpPot = r.games.ctp.buyin * players.length;
      const tee = players[0]?.tee||'Blue';
      const hd = r.course?.tees?.[tee]||Object.values(r.course?.tees||{})[0];
      const holeIndexes = r.holeIndexes||Array.from({length:18},(_,i)=>i);
      const par3Holes = holeIndexes.filter(h=>(hd?.par?.[h]||4)===3);
      const perHole = par3Holes.length>0 ? ctpPot/par3Holes.length : 0;
      par3Holes.forEach(h=>{
        const res = (r.ctpResults||{})[h];
        if (res?.winnerId) {
          const idx = players.findIndex(p=>p.id===res.winnerId);
          if(idx>=0) winnings[idx]+=perHole;
        } else {
          ctpCarryover+=perHole;
        }
      });
    }

    // ── Quota: rank by pts-minus-quota, with tie splitting + CTP carryover ──
    if (r.games?.quota?.on) {
      const quotaPot = (r.games.quota.buyin * players.length) + ctpCarryover;
      const places = r.games.quota.places||2;
      const is9hole = r.holes==='front9'||r.holes==='back9';
      const qpts = r.games.quota.pts||r.games.stableford?.pts||{eagle:5,birdie:4,par:3,bogey:2,double:1,worse:0};
      const diffs = players.map(p=>{
        const playerQuota = is9hole?(p.quota9||Math.round((p.quota||18)/2)):(p.quota||18);
        return calcPts(p,qpts) - playerQuota;
      });
      this._distributeWithTies(winnings, diffs, places, quotaPot);
    }

    // ── Low Gross: winner takes all ──
    if (r.games?.lowgross?.on) {
      const lgPot = r.games.lowgross.buyin * players.length;
      const scores = players.map(p=>-grossTotal(p)); // negate: lower=better
      this._distributeWithTies(winnings, scores, 1, lgPot);
    }

    // ── Net Score: lowest net wins ──
    if (r.games?.netscore?.on) {
      const nsPot = r.games.netscore.buyin * players.length;
      const places = r.games.netscore.places||2;
      const scores = players.map(p=>-netTotal(p));
      this._distributeWithTies(winnings, scores, places, nsPot);
    }

    return winnings;
  },

  // Distribute pot with proper tie splitting across positions
  _distributeWithTies(winnings, scores, places, pot) {
    const players = this.round.players||[];
    // Build payout pool for each place
    const placeAmounts = this._calcPlaceSplits(pot, places);

    // Sort unique scores descending
    const ranked = scores.map((s,i)=>({i,s})).sort((a,b)=>b.s-a.s);

    let pos = 0;
    while (pos < places && pos < ranked.length) {
      const curScore = ranked[pos].s;
      // Find all tied at this position
      const tied = ranked.filter(r=>r.s===curScore);
      // Sum up all place money for the positions they occupy
      let totalMoney = 0;
      for(let t=pos; t<Math.min(pos+tied.length, places); t++) {
        totalMoney += placeAmounts[t]||0;
      }
      const eachGets = totalMoney/tied.length;
      tied.forEach(t=>{ winnings[t.i]+=eachGets; });
      pos += tied.length;
    }
  },

  _calcPlaceSplits(pot, places) {
    // Standard splits: 1 place=100%, 2=60/40, 3=50/30/20, 4=40/30/20/10, 5=35/25/20/12/8
    const splits = {
      1: [1],
      2: [0.6,0.4],
      3: [0.5,0.3,0.2],
      4: [0.4,0.3,0.2,0.1],
      5: [0.35,0.25,0.20,0.12,0.08]
    };
    const pcts = splits[Math.min(places,5)] || splits[3];
    return pcts.map(p=>pot*p);
  },

  _fmt(n) { return Number.isInteger(n) ? '$'+n : '$'+n.toFixed(2); },

  _renderCashout(body) {
    const r = this.round;
    const players = r.players||[];
    const winnings = this._calcWinnings();
    const totalPaid = players.reduce((s,_,i)=>s+(this.paidOut[i]?winnings[i]:0),0);
    const pct = r.pot>0 ? Math.round(totalPaid/r.pot*100) : 0;
    const topIdx = winnings.indexOf(Math.max(...winnings));
    const topP = players[topIdx];

    let html = topP && winnings[topIdx]>0 ? `<div class="winner-banner">
      <div class="winner-avatar">${topP.initials}</div>
      <div><div class="winner-name">${topP.name}</div><div class="winner-sub">Round winner</div></div>
      <div class="winner-amt">${this._fmt(winnings[topIdx])}</div>
    </div>` : '';

    html += `<div class="progress-bar-wrap">
      <div class="progress-bar-track"><div class="progress-bar-fill" id="payout-progress" style="width:${pct}%;"></div></div>
      <div class="progress-bar-labels"><span id="paid-out-label">${this._fmt(totalPaid)} paid out</span><span>${this._fmt(r.pot)} total</span></div>
    </div>`;

    html += `<div class="section-label">Pay each winner from the pot</div><div class="card">`;
    players.forEach((p,i)=>{
      const amt = winnings[i];
      const paid = !!this.paidOut[i];
      if(amt<=0){
        html+=`<div class="payout-row"><div class="avatar muted">${p.initials}</div><div class="payout-info"><div class="payout-name">${p.name}</div><div class="payout-detail">No winnings</div></div><div class="payout-amt amt-zero">—</div></div>`;
      } else {
        html+=`<div class="payout-row"><div class="avatar">${p.initials}</div><div class="payout-info"><div class="payout-name">${p.name}</div><div class="payout-detail">${this._fmt(amt)} to collect</div></div><div class="payout-amt amt-win">${this._fmt(amt)}</div><button class="mark-paid-btn${paid?' paid':''}" onclick="Payouts.markPaid(${i},this)">${paid?'Paid ✓':'Mark paid'}</button></div>`;
      }
    });
    html+=`</div>`;
    const remaining = r.pot-totalPaid;
    html+=`<div class="card card-pad" style="margin-top:4px;">
      <div class="balance-row"><span class="balance-label">Collected</span><span>${this._fmt(r.pot)}</span></div>
      <div class="balance-row"><span class="balance-label">Paid out</span><span class="b-green">${this._fmt(totalPaid)}</span></div>
      <div class="balance-row"><span class="balance-label">Remaining</span><span>${Math.abs(remaining)<0.01?'<span class="b-green">$0.00 ✓</span>':this._fmt(remaining)}</span></div>
    </div>`;
    html+=`<button class="primary-btn" onclick="Payouts.closeRound()">Close round &amp; update quotas</button>`;
    html+=`<button class="ghost-btn" onclick="App.nav('scorecard')">Back to scorecard</button>`;
    body.innerHTML=html;
  },

  markPaid(idx,btn) {
    this.paidOut[idx]=!this.paidOut[idx];
    btn.classList.toggle('paid');
    btn.textContent=this.paidOut[idx]?'Paid ✓':'Mark paid';
    const winnings=this._calcWinnings();
    const r=this.round; const players=r.players||[];
    const totalPaid=players.reduce((s,_,i)=>s+(this.paidOut[i]?winnings[i]:0),0);
    const pct=r.pot>0?Math.round(totalPaid/r.pot*100):0;
    const bar=document.getElementById('payout-progress');
    const lbl=document.getElementById('paid-out-label');
    if(bar)bar.style.width=pct+'%';
    if(lbl)lbl.textContent=this._fmt(totalPaid)+' paid out';
  },

  _renderScorecard(body) {
    const r = this.round;
    const players = r.players||[];
    const holeIndexes = r.holeIndexes||Array.from({length:18},(_,i)=>i);
    const tee = players[0]?.tee||'Blue';
    const hd = r.course?.tees?.[tee]||Object.values(r.course?.tees||{})[0];

    const front = holeIndexes.slice(0, Math.min(9, holeIndexes.length));
    const back  = holeIndexes.length > 9 ? holeIndexes.slice(9) : [];

    const frontPar = front.reduce((a,h)=>a+(hd?.par?.[h]||4),0);
    const backPar  = back.reduce((a,h)=>a+(hd?.par?.[h]||4),0);
    const totalPar = frontPar + backPar;

    const buildSection = (holes, label, parTotal) => {
      let html = `<div style="overflow-x:auto;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;white-space:nowrap;">
          <thead>
            <tr style="background:var(--bg-2);">
              <th style="padding:6px 8px;text-align:left;border-bottom:0.5px solid var(--border);font-weight:600;min-width:80px;">Player</th>
              ${holes.map(h=>`<th style="padding:6px 5px;text-align:center;border-bottom:0.5px solid var(--border);font-weight:600;">H${h+1}</th>`).join('')}
              <th style="padding:6px 8px;text-align:center;border-bottom:0.5px solid var(--border);font-weight:600;">${label}</th>
            </tr>
            <tr style="background:var(--bg-2);">
              <th style="padding:4px 8px;text-align:left;border-bottom:0.5px solid var(--border);color:var(--text-2);font-weight:400;">Par</th>
              ${holes.map(h=>{
                const p=hd?.par?.[h]||4;
                return `<th style="padding:4px 5px;text-align:center;border-bottom:0.5px solid var(--border);color:${p===3?'var(--blue)':p===5?'var(--green)':'var(--text-2)'};font-weight:400;">${p}</th>`;
              }).join('')}
              <th style="padding:4px 8px;text-align:center;border-bottom:0.5px solid var(--border);color:var(--text-2);font-weight:400;">${parTotal}</th>
            </tr>
          </thead>
          <tbody>`;

      players.forEach((p,pi) => {
        const rowTotal = holes.reduce((a,h)=>a+(r.scores?.[p.id]?.[h]||0),0);
        const rowPar   = holes.reduce((a,h)=>a+(hd?.par?.[h]||4),0);
        const vsPar    = rowTotal > 0 ? rowTotal - rowPar : null;
        const bg = pi%2===0?'var(--surface)':'var(--bg-2)';
        html += `<tr style="background:${bg};">
          <td style="padding:6px 8px;border-bottom:0.5px solid var(--border);font-weight:500;">${p.name.split(' ')[0]} ${p.name.split(' ')[1]?.[0]||''}.</td>
          ${holes.map(h=>{
            const score = r.scores?.[p.id]?.[h];
            const par   = hd?.par?.[h]||4;
            const diff  = score ? score-par : null;
            let style = 'padding:6px 5px;text-align:center;border-bottom:0.5px solid var(--border);';
            if (diff !== null) {
              if (diff <= -2) style += 'color:#7c3aed;font-weight:700;'; // eagle
              else if (diff === -1) style += 'color:var(--green);font-weight:600;'; // birdie
              else if (diff === 1)  style += 'color:var(--amber);'; // bogey
              else if (diff >= 2)   style += 'color:var(--red);'; // double+
            }
            return `<td style="${style}">${score||'—'}</td>`;
          }).join('')}
          <td style="padding:6px 8px;text-align:center;border-bottom:0.5px solid var(--border);font-weight:700;">
            ${rowTotal>0?rowTotal:'—'}
            ${vsPar!==null?`<span style="font-size:10px;color:${vsPar<0?'var(--green)':vsPar>0?'var(--red)':'var(--text-2)'};">${vsPar===0?'E':vsPar>0?'+'+vsPar:vsPar}</span>`:''}
          </td>
        </tr>`;
      });

      html += `</tbody></table></div>`;
      return html;
    };

    let html = `<div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px;">${r.roundName||'Round'} · ${r.course?.name||''} · ${r.date||''}</div>`;

    if (front.length) html += buildSection(front, front.length<9?'Total':'Out', frontPar);
    if (back.length)  html += buildSection(back, 'In', backPar);

    // Final totals row
    if (back.length) {
      html += `<div class="card" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="background:var(--bg-2);">
            <th style="padding:8px;text-align:left;min-width:80px;">Player</th>
            <th style="padding:8px;text-align:center;">Out</th>
            <th style="padding:8px;text-align:center;">In</th>
            <th style="padding:8px;text-align:center;">Total</th>
            <th style="padding:8px;text-align:center;">+/−</th>
          </tr>`;
      players.forEach((p,pi) => {
        const outScore = front.reduce((a,h)=>a+(r.scores?.[p.id]?.[h]||0),0);
        const inScore  = back.reduce((a,h)=>a+(r.scores?.[p.id]?.[h]||0),0);
        const total    = outScore + inScore;
        const vsPar    = total > 0 ? total - totalPar : null;
        const bg = pi%2===0?'var(--surface)':'var(--bg-2)';
        html += `<tr style="background:${bg};">
          <td style="padding:8px;font-weight:500;">${p.name.split(' ')[0]} ${p.name.split(' ')[1]?.[0]||''}.</td>
          <td style="padding:8px;text-align:center;">${outScore||'—'}</td>
          <td style="padding:8px;text-align:center;">${inScore||'—'}</td>
          <td style="padding:8px;text-align:center;font-weight:700;">${total||'—'}</td>
          <td style="padding:8px;text-align:center;font-weight:600;color:${vsPar!==null&&vsPar<0?'var(--green)':vsPar!==null&&vsPar>0?'var(--red)':'var(--text-2)'};">
            ${vsPar===null?'—':vsPar===0?'E':vsPar>0?'+'+vsPar:vsPar}
          </td>
        </tr>`;
      });
      html += `</table></div>`;
    }

    // Score color legend
    html += `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:11px;">
      <span style="color:#7c3aed;">● Eagle or better</span>
      <span style="color:var(--green);">● Birdie</span>
      <span style="color:var(--text-2);">● Par</span>
      <span style="color:var(--amber);">● Bogey</span>
      <span style="color:var(--red);">● Double+</span>
    </div>`;

    body.innerHTML = html;
  },

  _renderBreakdown(body) {
    const r=this.round; const players=r.players||[];
    const tee=players[0]?.tee||'Blue';
    const hd=r.course?.tees?.[tee]||Object.values(r.course?.tees||{})[0];
    let html='';

    // ── Skins breakdown ──
    if(r.games?.skins?.on){
      const skinPot=r.games.skins.buyin*players.length;
      const won=Object.values(r.skinResults||{}).filter(s=>s&&!s.tied);
      const perSkin=won.length>0?skinPot/won.length:0;
      html+=`<div class="section-label">Skins — ${this._fmt(skinPot)} pot · ${this._fmt(perSkin)}/skin</div><div class="card">`;
      const holeIndexes = r.holeIndexes||Array.from({length:18},(_,i)=>i);
      holeIndexes.forEach(h=>{
        const res=(r.skinResults||{})[h]; const par=hd?.par?.[h]||4;
        if(!res)return;
        if(res.tied){html+=`<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><span class="tied-chip">Tied — no skin</span></div></div>`;}
        else{const w=players[res.winner];html+=`<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><div class="avatar sm">${w?.initials||'?'}</div><span style="font-size:12px;font-weight:500;">${w?.name?.split(' ')[0]||''}</span></div><span class="skin-amt">${this._fmt(perSkin)}</span></div>`;}
      });
      html+=`</div>`;
    }

    // ── Stableford breakdown with ties shown ──
    if(r.games?.stableford?.on){
      const sfPot=r.games.stableford.buyin*players.length;
      const places=r.games.stableford.places||2;
      const placeAmounts=this._calcPlaceSplits(sfPot,places);
      const pts=players.map((_,i)=>Scorecard._totalPts?Scorecard._totalPts(i):0);
      const ranked=pts.map((p,i)=>({i,p,player:players[i]})).sort((a,b)=>b.p-a.p);
      const labels=['1st','2nd','3rd','4th','5th'];
      html+=`<div class="section-label">Stableford — ${this._fmt(sfPot)} pot · ${places} places paid</div><div class="card">`;
      let pos=0;
      while(pos<ranked.length){
        const curPts=ranked[pos].p;
        const tied=ranked.filter(r=>r.p===curPts);
        let moneyStr='—'; let posLabel=labels[pos]||`${pos+1}th`;
        if(pos<places){
          let totalMoney=0;
          for(let t=pos;t<Math.min(pos+tied.length,places);t++) totalMoney+=placeAmounts[t]||0;
          const each=totalMoney/tied.length;
          moneyStr=this._fmt(each);
          if(tied.length>1) posLabel+=` (${tied.length}-way tie)`;
        }
        tied.forEach(item=>{
          html+=`<div class="payout-row"><div style="font-size:12px;font-weight:600;color:${pos===0?'var(--green)':'var(--text-3)'};min-width:50px;">${posLabel}</div><div class="avatar">${item.player.initials}</div><div class="payout-info"><div class="payout-name">${item.player.name}</div><div class="payout-detail">${item.p} pts</div></div><div class="payout-amt ${pos<places?'amt-win':'amt-zero'}">${moneyStr}</div></div>`;
        });
        pos+=tied.length;
      }
      html+=`</div>`;
    }

    // ── Quota breakdown with ties shown ──
    if(r.games?.quota?.on){
      const quotaPot=r.games.quota.buyin*players.length;
      const places=r.games.quota.places||2;
      const placeAmounts=this._calcPlaceSplits(quotaPot,places);
      const is9hole=r.holes==='front9'||r.holes==='back9';
      const diffs=players.map((p,i)=>{
        const pq=is9hole?(p.quota9||Math.round((p.quota||18)/2)):(p.quota||18);
        const pts=Scorecard._totalPts?Scorecard._totalPts(i):0;
        return {diff:pts-pq, pts, pq, player:p, i};
      }).sort((a,b)=>b.diff-a.diff);
      const labels=['1st','2nd','3rd','4th','5th'];
      html+=`<div class="section-label">Quota — ${this._fmt(quotaPot)} pot · ${places} places paid</div><div class="card">`;
      let pos=0;
      while(pos<diffs.length){
        const curDiff=diffs[pos].diff;
        const tied=diffs.filter(d=>d.diff===curDiff);
        let moneyStr='—'; let posLabel=labels[pos]||`${pos+1}th`;
        if(pos<places){
          let totalMoney=0;
          for(let t=pos;t<Math.min(pos+tied.length,places);t++) totalMoney+=placeAmounts[t]||0;
          const each=totalMoney/tied.length;
          moneyStr=this._fmt(each);
          if(tied.length>1) posLabel+=` (${tied.length}-way tie)`;
        }
        tied.forEach(item=>{
          const diffStr=item.diff>=0?`+${item.diff}`:item.diff;
          html+=`<div class="payout-row"><div style="font-size:12px;font-weight:600;color:${pos===0?'var(--green)':'var(--text-3)'};min-width:50px;">${posLabel}</div><div class="avatar">${item.player.initials}</div><div class="payout-info"><div class="payout-name">${item.player.name}</div><div class="payout-detail">${item.pts} pts · quota ${item.pq} · ${diffStr} vs quota</div></div><div class="payout-amt ${pos<places?'amt-win':'amt-zero'}">${moneyStr}</div></div>`;
        });
        pos+=tied.length;
      }
      html+=`</div>`;
    }

    // ── CTP breakdown ──
    if(r.games?.ctp?.on && r.ctpResults){
      const ctpPot=r.games.ctp.buyin*players.length;
      const ctpEntries=Object.entries(r.ctpResults||{});
      const ctpWinners=ctpEntries.filter(([,h])=>h.winnerId);
      const perHole=ctpWinners.length>0?ctpPot/ctpWinners.length:0;
      html+=`<div class="section-label">Closest to pin — ${this._fmt(ctpPot)} pot</div><div class="card">`;
      ctpEntries.forEach(([hole,h])=>{
        const par=hd?.par?.[parseInt(hole)]||3;
        if(h.winnerId){
          const w=players.find(p=>p.id===h.winnerId);
          html+=`<div class="skin-row"><span class="skin-hole">H${parseInt(hole)+1}·P${par}</span><div class="skin-result"><div class="avatar sm">${w?.initials||'?'}</div><span style="font-size:12px;font-weight:500;">${w?.name?.split(' ')[0]||''} · ${h.distance}</span></div><span class="skin-amt">${this._fmt(perHole)}</span></div>`;
        }
      });
      if(ctpWinners.length===0) html+=`<div style="padding:12px 0;font-size:13px;color:var(--text-3);">No CTP results recorded yet</div>`;
      html+=`</div>`;
    }

    body.innerHTML=html||`<div class="empty-state"><div class="empty-title">No game data</div></div>`;
  },

  _renderLedger(body) {
    const r=this.round; const players=r.players||[];
    const winnings=this._calcWinnings();
    let html=`<div class="section-label">Pot accounting</div><div class="card card-pad">`;
    const totalPaid=winnings.reduce((a,b)=>a+Math.round(b),0);
    html+=`<div class="balance-row"><span class="balance-label">Collected (${players.length} × $${r.buyin})</span><span class="b-green">+$${r.pot}</span></div>`;
    html+=`<div class="balance-row"><span class="balance-label">Total paid out</span><span class="b-red">−$${totalPaid}</span></div>`;
    html+=`<div class="balance-row"><span class="balance-label">Remainder</span><span class="${r.pot-totalPaid===0?'b-green':''}">$${r.pot-totalPaid}</span></div>`;
    html+=`</div><div class="section-label">Individual results</div><div class="card">`;
    players.forEach((p,i)=>{
      const net=Math.round(winnings[i])-r.buyin;
      html+=`<div class="payout-row"><div class="avatar${net<0?' muted':''}">${p.initials}</div><div class="payout-info"><div class="payout-name">${p.name}</div><div class="payout-detail">Paid $${r.buyin} · won $${Math.round(winnings[i])}</div></div><div class="payout-amt" style="color:${net>0?'var(--green)':net<0?'var(--red)':'var(--text-3)'};">${net>0?'+':''}$${net}</div></div>`;
    });
    html+=`</div>`;
    body.innerHTML=html;
  },

  async closeRound() {
    const r = this.round || Scorecard.round;
    if (!r) { alert('No round data found. Please go back to the scorecard and try again.'); return; }
    // Ensure Payouts has the round
    if (!this.round) this.round = r;
    const rules = await DB.getQuotaRules();
    const players = await DB.getPlayers();
    const is9hole = r.holes==='front9' || r.holes==='back9';

    for (const rp of r.players||[]) {
      const sp = players.find(p=>p.id===rp.id);
      if (!sp) continue;

      // Calculate points from saved scores directly — don't rely on Scorecard being in memory
      const sfPts = r.games?.stableford?.pts || r.games?.quota?.pts || {eagle:4,birdie:3,par:2,bogey:1,double:0,worse:0};
      const tee = rp.tee||'Blue';
      const hd = r.course?.tees?.[tee]||Object.values(r.course?.tees||{})[0];
      const holeIndexes = r.holeIndexes||Array.from({length:18},(_,i)=>i);
      let pts = 0;
      holeIndexes.forEach(h=>{
        const gross = r.scores?.[rp.id]?.[h];
        if(gross===undefined||gross===null) return;
        const net = gross - this._strokesOnHole(rp.hcp, hd?.hcp?.[h]||1, r.useHandicap);
        const d = net - (hd?.par?.[h]||4);
        if(d<=-2) pts+=sfPts.eagle;
        else if(d===-1) pts+=sfPts.birdie;
        else if(d===0)  pts+=sfPts.par;
        else if(d===1)  pts+=sfPts.bogey;
        else if(d===2)  pts+=sfPts.double;
        else pts+=sfPts.worse;
      });

      // Use correct quota and rules for round type
      const playerQuota = is9hole ? (sp.quota9||Math.round((sp.quota||18)/2)) : (sp.quota||18);
      const diff = pts - playerQuota;

      let adj = 0;
      if (is9hole) {
        // Use 9H-specific rules from DB
        if (diff >= rules.upThresh9)  adj = Math.min(Math.floor(diff/rules.upThresh9)*rules.upAmt9, rules.maxUp9);
        else if (diff <= -rules.dnThresh9) adj = -Math.min(Math.floor(Math.abs(diff)/rules.dnThresh9)*rules.dnAmt9, rules.maxDn9);
      } else {
        if (diff >= rules.upThresh)  adj = Math.min(Math.floor(diff/rules.upThresh)*rules.upAmt, rules.maxUp);
        else if (diff <= -rules.dnThresh) adj = -Math.min(Math.floor(Math.abs(diff)/rules.dnThresh)*rules.dnAmt, rules.maxDn);
      }

      // Update the right quota field
      const updates = {
        history: [...(sp.history||[]), {
          date: r.date,
          course: r.course?.name,
          holes: r.holes,
          quota: playerQuota,
          scored: pts,
          diff,
          adj,
          roundCode: r.code
        }].slice(-30)
      };
      if (is9hole) {
        updates.quota9 = (sp.quota9||Math.round((sp.quota||18)/2)) + adj;
      } else {
        updates.quota = sp.quota + adj;
      }
      await DB.updatePlayer(sp.id, updates);
    }

    // Calculate and save winnings for each player
    const winnings = this._calcWinnings();
    for (let i = 0; i < (r.players||[]).length; i++) {
      const rp = r.players[i];
      if (winnings[i] > 0) {
        await DB.addPlayerWinnings(rp.id, winnings[i], r.code||r.id, r.roundName||r.course?.name);
      }
    }

    // Save full round to history including player scores
    // Sanitize scores - remove any undefined/null values Firebase rejects
    const cleanScores = {};
    Object.entries(r.scores||{}).forEach(([pid, holes]) => {
      cleanScores[pid] = {};
      Object.entries(holes||{}).forEach(([h, s]) => {
        if (s !== undefined && s !== null) cleanScores[pid][h] = s;
      });
    });

    await DB.closeRound(r.code||r.id, {
      roundName: r.roundName||'',
      course: r.course?.name||'',
      date: r.date||'',
      holes: r.holes||'18',
      pot: r.pot||0,
      playerCount: r.players?.length||0,
      players: r.players?.map((rp,i)=>({
        id: rp.id||'', name: rp.name||'', initials: rp.initials||'',
        hcp: rp.hcp||0, tee: rp.tee||'Blue', group: rp.group||1,
        won: winnings[i]||0
      }))||[],
      games: Object.keys(r.games||{}).filter(k=>r.games[k].on),
      scores: cleanScores,
      skinResults: r.skinResults||{},
      ctpResults: r.ctpResults||{}
    });
    Store.clearActiveRound();
    Scorecard.round = null;
    this.round = null;
    App.nav('home');
    Home.render();
  },

  _strokesOnHole(hcp, holeHcpIdx, useHandicap) {
    if (!useHandicap) return 0;
    let s = 0;
    if (hcp >= holeHcpIdx) s++;
    if (hcp >= 18 + holeHcpIdx) s++;
    return s;
  }
};

// ── Quota ──
const Quota = {
  async render() {
    const body=document.getElementById('quota-body');
    body.innerHTML=`<div class="empty-state"><div class="empty-title">Loading…</div></div>`;
    const players=await DB.getPlayers();
    const rules=await DB.getQuotaRules();
    if(!players.length){body.innerHTML=`<div class="empty-state"><div class="empty-title">No players yet</div></div>`;return;}

    let html=`<div class="note">18H &amp; 9H rules are set independently in Quota Rules. Tap Rules to view/edit.</div>`;
    html+=`<div class="section-label">Current quotas</div><div class="card">`;
    players.forEach(p=>{
      const last=(p.history||[]).slice(-1)[0];
      const adj=last?(last.adj>0?`+${last.adj}`:last.adj<0?`${last.adj}`:'±0'):'—';
      const adjCls=last&&last.adj>0?'adj-up':last&&last.adj<0?'adj-down':'adj-same';
      const quota9=p.quota9||Math.round((p.quota||18)/2);
      html+=`<div class="quota-row">
        <div class="avatar">${p.initials}</div>
        <div class="quota-info">
          <div class="quota-name">${p.name}</div>
          <div class="quota-sub">18H: ${p.quota} · 9H: ${quota9} · ${(p.history||[]).length} rounds played</div>
        </div>
        <div class="quota-right">
          <div class="quota-target">${p.quota}</div>
          <div class="quota-adj ${adjCls}">Last: ${adj}</div>
        </div>
      </div>`;
    });
    html+=`</div>`;

    // Per-player quota history
    html+=`<div class="section-label">Round-by-round history</div>`;
    players.forEach(p=>{
      const history=(p.history||[]).slice(-8).reverse();
      if(!history.length) return;
      html+=`<div style="font-size:13px;font-weight:600;margin:10px 0 6px;">${p.name}</div>`;
      html+=`<div class="card" style="margin-bottom:10px;">`;
      history.forEach(h=>{
        const diff=h.diff>=0?`+${h.diff}`:h.diff;
        const adjStr=h.adj>0?`+${h.adj}`:h.adj<0?`${h.adj}`:'±0';
        const adjCol=h.adj>0?'var(--green)':h.adj<0?'var(--red)':'var(--text-3)';
        const is9=h.holes==='front9'||h.holes==='back9';
        html+=`<div class="balance-row">
          <span class="balance-label">${h.date} · ${is9?'9H':'18H'}</span>
          <span style="font-size:12px;">${h.scored}pts (${diff}) → <span style="color:${adjCol};font-weight:600;">${adjStr}</span> → quota ${h.quota+(h.adj||0)}</span>
        </div>`;
      });
      html+=`</div>`;
    });

    body.innerHTML=html;
  },

  async renderAdmin() {
    const body=document.getElementById('quota-admin-body');
    const rules=await DB.getQuotaRules();
    const players=await DB.getPlayers();

    const stepper=(key,label,sub)=>`<div class="toggle-row"><div><div class="toggle-label">${label}</div><div class="toggle-sub">${sub}</div></div><div class="stepper"><button class="step-btn" onclick="Quota.adjRule('${key}',-1)">−</button><span class="step-val" id="rule-${key}">${rules[key]}</span><button class="step-btn" onclick="Quota.adjRule('${key}',1)">+</button></div></div>`;

    let html = `<div class="section-label">18-hole quota rules</div>
    <div class="card card-pad" style="margin-bottom:12px;">
      ${stepper('upThresh','Beat quota by','Pts over quota to trigger increase')}
      ${stepper('upAmt','Increase by','Pts added per threshold exceeded')}
      ${stepper('dnThresh','Miss quota by','Pts under quota to trigger decrease')}
      ${stepper('dnAmt','Decrease by','Pts removed per threshold exceeded')}
      ${stepper('maxUp','Max increase/round','Cap on quota rising per round')}
      ${stepper('maxDn','Max decrease/round','Cap on quota falling per round')}
    </div>

    <div class="section-label">9-hole quota rules</div>
    <div class="note" style="margin-bottom:10px;">Same structure as 18H but applied to 9-hole rounds independently.</div>
    <div class="card card-pad" style="margin-bottom:12px;">
      ${stepper('upThresh9','Beat quota by','Pts over quota to trigger increase')}
      ${stepper('upAmt9','Increase by','Pts added per threshold exceeded')}
      ${stepper('dnThresh9','Miss quota by','Pts under quota to trigger decrease')}
      ${stepper('dnAmt9','Decrease by','Pts removed per threshold exceeded')}
      ${stepper('maxUp9','Max increase/round','Cap on quota rising per round')}
      ${stepper('maxDn9','Max decrease/round','Cap on quota falling per round')}
    </div>`;

    // Example calculator
    html += `<div class="section-label">Example — 18H rules</div><div class="card card-pad" style="margin-bottom:12px;">`;
    [{quota:20,scored:23},{quota:20,scored:17},{quota:20,scored:20}].forEach(ex=>{
      const diff=ex.scored-ex.quota;
      let adj=0;
      if(diff>=rules.upThresh) adj=Math.min(Math.floor(diff/rules.upThresh)*rules.upAmt,rules.maxUp);
      else if(diff<=-rules.dnThresh) adj=-Math.min(Math.floor(Math.abs(diff)/rules.dnThresh)*rules.dnAmt,rules.maxDn);
      const col=adj>0?'var(--green)':adj<0?'var(--red)':'var(--text-2)';
      html+=`<div style="padding:7px 0;border-bottom:0.5px solid var(--border);font-size:12px;">
        <span style="color:var(--text-2);">Quota ${ex.quota}, scored ${ex.scored} (${diff>=0?'+':''}${diff})</span>
        <span style="color:${col};font-weight:600;float:right;">${adj>=0?'+':''}${adj} → new quota ${ex.quota+adj}</span>
      </div>`;
    });
    html+=`</div>`;

    html += `<div class="section-label">Example — 9H rules</div><div class="card card-pad" style="margin-bottom:12px;">`;
    [{quota:10,scored:12},{quota:10,scored:8},{quota:10,scored:10}].forEach(ex=>{
      const diff=ex.scored-ex.quota;
      let adj=0;
      if(diff>=rules.upThresh9) adj=Math.min(Math.floor(diff/rules.upThresh9)*rules.upAmt9,rules.maxUp9);
      else if(diff<=-rules.dnThresh9) adj=-Math.min(Math.floor(Math.abs(diff)/rules.dnThresh9)*rules.dnAmt9,rules.maxDn9);
      const col=adj>0?'var(--green)':adj<0?'var(--red)':'var(--text-2)';
      html+=`<div style="padding:7px 0;border-bottom:0.5px solid var(--border);font-size:12px;">
        <span style="color:var(--text-2);">9H quota ${ex.quota}, scored ${ex.scored} (${diff>=0?'+':''}${diff})</span>
        <span style="color:${col};font-weight:600;float:right;">${adj>=0?'+':''}${adj} → new quota ${ex.quota+adj}</span>
      </div>`;
    });
    html+=`</div>`;

    if(players.length){
      html+=`<div class="section-label">Manual override</div><div class="card card-pad">
        <div class="form-group"><label class="form-label">Player</label>
        <select class="form-input" id="override-player">${players.map(p=>`<option value="${p.id}">${p.name} (18H: ${p.quota} / 9H: ${p.quota9||Math.round((p.quota||18)/2)})</option>`).join('')}</select></div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;">
          <div class="form-group" style="margin-bottom:0;"><label class="form-label">New 18H quota</label><input class="form-input" type="number" id="override-val" placeholder="e.g. 22" /></div>
          <div class="form-group" style="margin-bottom:0;"><label class="form-label">New 9H quota</label><input class="form-input" type="number" id="override-val9" placeholder="e.g. 11" /></div>
        </div>
        <button class="primary-btn" onclick="Quota.applyOverride()">Apply override</button>
      </div>`;
    }
    body.innerHTML=html;
  },

  async adjRule(key,d) {
    const rules=await DB.getQuotaRules();
    rules[key]=Math.max(1,rules[key]+d);
    await DB.saveQuotaRules(rules);
    const el=document.getElementById('rule-'+key);
    if(el)el.textContent=rules[key];
  },

  async applyOverride() {
    const id  = document.getElementById('override-player').value;
    const val = parseInt(document.getElementById('override-val').value);
    const val9 = parseInt(document.getElementById('override-val9').value);
    const updates = {};
    if (val)  updates.quota  = val;
    if (val9) updates.quota9 = val9;
    if (!Object.keys(updates).length) return;
    await DB.updatePlayer(id, updates);
    alert('Quota updated!');
    await this.renderAdmin();
  }
};

// ── Home ──
const Home = {
  async render() {
    const now=new Date();
    document.getElementById('home-date').textContent=now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
    try {
      const players=await DB.getPlayers();
      const courses=await DB.getCourses();
      const history=await DB.getHistory();
      document.getElementById('home-stat-players').textContent=players.length;
      document.getElementById('home-stat-courses').textContent=courses.length;
      document.getElementById('home-stat-rounds').textContent=history.length;
      document.getElementById('home-stat-pot').textContent=history[0]?'$'+(history[0].pot||0):'$0';
      Store.cachePlayers(players);
      Store.cacheCourses(courses);
    } catch {}

    const activeRound=Store.getActiveRound();
    const activeEl=document.getElementById('home-active-round');
    if(activeRound){
      activeEl.style.display='block';
      activeEl.innerHTML=`<div class="card card-pad" style="border-color:var(--green);margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:10px;height:10px;border-radius:50%;background:var(--green);flex-shrink:0;animation:pulse 2s infinite;"></div>
          <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Round in progress · <span style="font-family:monospace;color:var(--green);">${activeRound.code||''}</span></div><div style="font-size:12px;color:var(--text-2);margin-top:1px;">${activeRound.course?.name} · Hole ${(activeRound.currentHole||0)+1}</div></div>
          <button class="text-btn" onclick="Scorecard.load(Store.getActiveRound());App.nav('scorecard');">Resume →</button>
        </div>
      </div>`;
    } else { activeEl.style.display='none'; }
  }
};

// ── Main App Controller ──
const App = {
  stack: [],

  nav(screen) {
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const next=document.getElementById('screen-'+screen);
    if(!next)return;
    next.classList.add('active');
    this.stack.push(screen);
    this._onEnter(screen);
  },

  back() {
    this.stack.pop();
    const prev=this.stack[this.stack.length-1]||'home';
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const el=document.getElementById('screen-'+prev);
    if(el)el.classList.add('active');
    this._onEnter(prev);
  },

  _onEnter(screen) {
    if(screen==='home')          Home.render();
    else if(screen==='players')  Players.load();
    else if(screen==='add-player') Players.resetForm();
    else if(screen==='courses')       Courses.load();
    else if(screen==='round-setup')   RoundSetup.start().catch(e=>console.error(e));
    else if(screen==='scorecard') {
      const r=Store.getActiveRound();
      if(r&&r.code&&!Scorecard.round) Scorecard.loadFromDB(r.code);
      else if(Scorecard.round) Scorecard.render();
    }
    else if(screen==='payouts')       Payouts.renderView();
    else if(screen==='quota')         Quota.render();
    else if(screen==='quota-admin')   Quota.renderAdmin();
    else if(screen==='pending-rounds') this._renderPendingRounds();
    else if(screen==='round-detail')   {}
    else if(screen==='settings')      this._renderSettings();
    else if(screen==='join-round')    this._renderJoinRound();
    else if(screen==='claim-profile') this._renderClaimProfile();
    else if(screen==='season')        this._renderSeason();
    else if(screen==='season-admin')  this._renderSeasonAdmin();
    else if(screen==='history')       this._renderHistory();
  },

  async _renderPendingRounds() {
    const body = document.getElementById('pending-rounds-body');
    body.innerHTML = `<div class="empty-state"><div class="empty-title">Loading…</div></div>`;
    try {
      const rounds = await DB.getPendingRounds();
      if (!rounds.length) {
        body.innerHTML = `<div class="empty-state"><div class="empty-title">No upcoming rounds</div><div class="empty-sub">Create a new round to get started.</div></div><button class="primary-btn" onclick="App.nav('round-setup')" style="margin:0 16px;">Create a round</button>`;
        return;
      }
      let html = '';
      rounds.forEach(r => {
        const isPending = r.status === 'pending';
        const statusChip = isPending
          ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--amber-light);color:var(--amber);font-weight:500;">Upcoming</span>`
          : `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--green-light);color:var(--green-dark);font-weight:500;">Active</span>`;
        html += `<div class="card card-pad" style="margin-bottom:10px;cursor:pointer;" onclick="App._openRoundDetail('${r.code}')">
          <div class="flex-between" style="margin-bottom:8px;">
            <div style="font-size:15px;font-weight:600;">${r.roundName||'Round'}</div>
            ${statusChip}
          </div>
          <div style="font-size:13px;color:var(--text-2);">${r.course?.name||''} · ${r.playDate||r.date}</div>
          <div style="font-size:12px;color:var(--text-2);margin-top:4px;">${r.players?.length||0} players · $${r.pot||0} pot</div>
          <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-family:monospace;font-size:20px;font-weight:700;color:var(--green);letter-spacing:4px;">${r.code}</div>
            <div style="display:flex;gap:6px;">
              <button class="outline-btn" style="font-size:12px;padding:6px 10px;" onclick="event.stopPropagation();navigator.clipboard.writeText('${r.code}').then(()=>alert('Code copied!'))">Copy</button>
              ${isPending&&Auth.isAdmin()?`<button class="primary-btn" style="width:auto;padding:6px 12px;font-size:12px;margin:0;" onclick="event.stopPropagation();App._startPendingRound('${r.code}')">Start</button>`:''}
              ${!isPending?`<button class="primary-btn" style="width:auto;padding:6px 12px;font-size:12px;margin:0;" onclick="event.stopPropagation();Scorecard.loadFromDB('${r.code}');App.nav('scorecard');">Resume</button>`:''}
              ${Auth.isAdmin()?`<button class="outline-btn" style="font-size:12px;padding:6px 10px;color:var(--red);border-color:var(--red);" onclick="event.stopPropagation();App._deleteRound('${r.code}')">Delete</button>`:''}
            </div>
          </div>
        </div>`;
      });
      body.innerHTML = html;
    } catch(e) {
      body.innerHTML = `<div class="note amber">Error loading rounds: ${e.message}</div>`;
    }
  },

  async _openRoundDetail(code) {
    const round = await DB.getRound(code);
    if (!round) return;
    document.getElementById('rd-title').textContent = round.roundName||'Round';
    document.getElementById('rd-sub').textContent = round.playDate||round.date;
    const body = document.getElementById('round-detail-body');
    const isPending = round.status === 'pending';
    const isAdmin = Auth.isAdmin();

    let html = `<div class="card card-pad" style="margin-bottom:12px;">
      <div style="text-align:center;padding:8px 0;">
        <div style="font-size:12px;color:var(--text-2);margin-bottom:4px;">Round code</div>
        <div style="font-family:monospace;font-size:44px;font-weight:700;color:var(--green-dark);letter-spacing:6px;">${code}</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;">
          <button class="outline-btn" onclick="navigator.clipboard.writeText('${code}').then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy code',2000)})">Copy code</button>
          <button class="outline-btn" onclick="navigator.share&&navigator.share({title:'Join my Mullify round',text:'Join ${round.roundName}!\\nCode: ${code}\\nhttps://mullify.vercel.app'})">Share ↗</button>
        </div>
      </div>
    </div>`;

    html += `<div class="card"><div class="balance-row"><span class="balance-label">Course</span><span>${round.course?.name||'—'}</span></div><div class="balance-row"><span class="balance-label">Date</span><span>${round.playDate||round.date}</span></div><div class="balance-row"><span class="balance-label">Format</span><span>${round.holes==='18'?'18 holes':round.holes==='front9'?'Front 9':'Back 9'} · Start H${round.startHole}</span></div><div class="balance-row"><span class="balance-label">Players</span><span>${round.players?.length||0}</span></div><div class="balance-row" style="border-bottom:none;"><span class="balance-label">Pot</span><span class="b-green fw-6">$${round.pot||0}</span></div></div>`;

    html += `<div class="section-label">Players</div><div class="card">`;
    (round.players||[]).forEach(p => {
      html += `<div class="player-row"><div class="avatar">${p.initials}</div><div class="player-info"><div class="player-name">${p.name}</div><div class="player-meta">HCP ${p.hcp} · ${p.tee} · Group ${p.group||1}</div></div></div>`;
    });
    html += `</div>`;

    if (isAdmin && isPending) {
      html += `<button class="primary-btn" onclick="App._startPendingRound('${code}')">Start this round</button>`;
      html += `<button class="ghost-btn" style="margin-top:8px;color:var(--red);border-color:var(--red);" onclick="App._deleteRound('${code}')">Delete round</button>`;
    } else if (!isPending) {
      html += `<button class="primary-btn" onclick="Scorecard.loadFromDB('${code}');App.nav('scorecard');">Go to scorecard →</button>`;
      if (isAdmin) html += `<button class="ghost-btn" style="margin-top:8px;color:var(--red);border-color:var(--red);" onclick="App._deleteRound('${code}')">Delete round</button>`;
    }

    body.innerHTML = html;
    this.nav('round-detail');
  },

  async _startPendingRound(code) {
    if (!confirm('Start this round now?')) return;
    await DB.updateRound(code, {status:'active'});
    const round = await DB.getRound(code);
    Store.saveActiveRound({...round, code});
    await Scorecard.loadFromDB(code);
    this.nav('scorecard');
  },

  async _deleteRound(code) {
    if (!confirm('Delete this round permanently? This cannot be undone.')) return;
    await DB.deleteRound(code);
    // Clear active round if it was this one
    const active = Store.getActiveRound();
    if (active?.code === code) Store.clearActiveRound();
    await this._renderPendingRounds();
  },

  async _cancelRound(code) {
    if (!confirm('Cancel this round? This cannot be undone.')) return;
    await DB.updateRound(code, {status:'cancelled'});
    this.back();
    this._renderPendingRounds();
  },

  async _renderSeason() {
    const body = document.getElementById('season-body');
    body.innerHTML = `<div class="empty-state"><div class="empty-title">Loading…</div></div>`;
    const isAdmin = Auth.isAdmin();
    // Show admin button
    const adminBtn = document.getElementById('season-admin-btn');
    if (adminBtn) adminBtn.style.display = isAdmin ? 'block' : 'none';

    try {
      const [winnings, players] = await Promise.all([DB.getSeasonWinnings(), DB.getPlayers()]);
      const myPlayerId = Auth.playerProfile?.playerId;

      if (isAdmin) {
        // Admin sees full leaderboard
        const ranked = players.map(p => ({
          p, total: winnings[p.id]?.total || 0,
          rounds: winnings[p.id]?.rounds || []
        })).sort((a,b) => b.total - a.total);

        let html = `<div class="section-label">Season leaderboard</div><div class="card">`;
        ranked.forEach(({p, total, rounds}, rank) => {
          html += `<div class="player-row" style="cursor:pointer;" onclick="App._showPlayerWinnings('${p.id}')">
            <div class="lb-rank${rank===0?' first':''}" style="min-width:36px;">${rank+1}</div>
            <div class="avatar">${p.initials}</div>
            <div class="player-info">
              <div class="player-name">${p.name}</div>
              <div class="player-meta">${rounds.length} round${rounds.length!==1?'s':''} · tap for detail</div>
            </div>
            <div style="font-size:18px;font-weight:700;color:var(--green);">$${total.toFixed(2)}</div>
          </div>`;
        });
        html += `</div>`;

        // Season total
        const seasonTotal = ranked.reduce((a,r)=>a+r.total, 0);
        html += `<div class="card card-pad" style="margin-top:4px;">
          <div class="balance-row" style="border-bottom:none;">
            <span class="balance-label">Total distributed this season</span>
            <span style="font-weight:700;">$${seasonTotal.toFixed(2)}</span>
          </div>
        </div>`;
        body.innerHTML = html;
      } else {
        // Player only sees their own total
        const myWinnings = winnings[myPlayerId] || {total:0, rounds:[]};
        const myPlayer = players.find(p=>p.id===myPlayerId);
        let html = `<div style="text-align:center;padding:24px 0 16px;">
          <div style="font-size:14px;color:var(--text-2);margin-bottom:8px;">Your season winnings</div>
          <div style="font-size:52px;font-weight:700;color:var(--green);">$${myWinnings.total.toFixed(2)}</div>
          <div style="font-size:13px;color:var(--text-2);margin-top:8px;">${myWinnings.rounds.length} round${myWinnings.rounds.length!==1?'s':''} played</div>
        </div>`;
        if (myWinnings.rounds.length) {
          html += `<div class="section-label">Round breakdown</div><div class="card">`;
          [...myWinnings.rounds].reverse().forEach(r => {
            const col = r.amount >= 0 ? 'var(--green)' : 'var(--red)';
            html += `<div class="balance-row">
              <span class="balance-label">${r.date} · ${r.roundName||'Round'}</span>
              <span style="font-weight:600;color:${col};">$${r.amount.toFixed(2)}</span>
            </div>`;
          });
          html += `</div>`;
        }
        body.innerHTML = html;
      }
    } catch(e) {
      body.innerHTML = `<div class="note amber">Error loading season data: ${e.message}</div>`;
    }
  },

  _showPlayerWinnings(playerId) {
    // Show modal with player's round-by-round breakdown
    DB.getSeasonWinnings().then(winnings => {
      DB.getPlayers().then(players => {
        const p = players.find(pl=>pl.id===playerId);
        const pw = winnings[playerId] || {total:0, rounds:[]};
        let html = `<div style="font-size:17px;font-weight:600;margin-bottom:12px;">${p?.name} — $${pw.total.toFixed(2)}</div>`;
        if (pw.rounds.length) {
          html += pw.rounds.map(r => {
            const col = r.amount >= 0 ? 'var(--green)' : 'var(--red)';
            return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid var(--border);font-size:13px;">
              <span style="color:var(--text-2);">${r.date} · ${r.roundName||'Round'}</span>
              <span style="font-weight:600;color:${col};">$${r.amount.toFixed(2)}</span>
            </div>`;
          }).reverse().join('');
        } else {
          html += `<div style="color:var(--text-3);font-size:13px;">No winnings recorded yet.</div>`;
        }
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
        modal.innerHTML = `<div style="background:white;border-radius:20px;padding:24px;width:100%;max-width:360px;max-height:80vh;overflow-y:auto;">
          ${html}
          <button onclick="this.closest('.modal-overlay').remove()" style="margin-top:16px;width:100%;padding:11px;border-radius:var(--radius-sm);border:0.5px solid var(--border-2);background:none;font-size:13px;cursor:pointer;">Close</button>
        </div>`;
        modal.className = 'modal-overlay';
        modal.onclick = e => { if(e.target===modal) modal.remove(); };
        document.body.appendChild(modal);
      });
    });
  },

  async _renderSeasonAdmin() {
    const body = document.getElementById('season-admin-body');
    body.innerHTML = `<div class="empty-state"><div class="empty-title">Loading…</div></div>`;
    const [winnings, players] = await Promise.all([DB.getSeasonWinnings(), DB.getPlayers()]);
    const today = new Date().toISOString().split('T')[0];

    let html = `<div class="section-label">Reset season</div>
    <div class="card card-pad" style="margin-bottom:12px;">
      <div class="form-group"><label class="form-label">Reset date (for archive label)</label>
        <input class="form-input" type="date" id="season-reset-date" value="${today}" />
      </div>
      <button class="primary-btn" style="background:var(--red);margin-bottom:8px;" onclick="App._resetSeason()">Reset season now — archive &amp; clear all</button>
      <div class="note" style="margin-bottom:0;">This archives the current season and resets everyone to $0. Cannot be undone.</div>
    </div>`;

    // Manual adjustments
    html += `<div class="section-label">Manual adjustment</div>
    <div class="card card-pad" style="margin-bottom:12px;">
      <div class="form-group"><label class="form-label">Player</label>
        <select class="form-input" id="adj-player">
          ${players.map(p=>`<option value="${p.id}">${p.name} (currently $${(winnings[p.id]?.total||0).toFixed(2)})</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Amount (use negative to deduct)</label>
        <input class="form-input" type="number" id="adj-amount" placeholder="e.g. 25 or -10" step="0.01" />
      </div>
      <div class="form-group"><label class="form-label">Reason</label>
        <input class="form-input" type="text" id="adj-reason" placeholder="e.g. corrected payout from round 3/15" />
      </div>
      <button class="primary-btn" onclick="App._applyWinningsAdjustment()">Apply adjustment</button>
    </div>`;

    // Past seasons archive
    const archive = await DB.getSeasonArchive();
    if (archive.length) {
      html += `<div class="section-label">Past seasons</div>`;
      archive.forEach(s => {
        const total = Object.values(s.winnings||{}).reduce((a,w)=>a+(w.total||0),0);
        html += `<div class="card card-pad" style="margin-bottom:8px;">
          <div class="flex-between">
            <div style="font-size:14px;font-weight:600;">Season ending ${s.resetDate}</div>
            <div style="font-size:14px;font-weight:700;color:var(--green);">$${total.toFixed(2)}</div>
          </div>
        </div>`;
      });
    }

    body.innerHTML = html;
  },

  async _resetSeason() {
    const date = document.getElementById('season-reset-date')?.value || new Date().toLocaleDateString();
    if (!confirm(`Reset season and archive as of ${date}? This cannot be undone.`)) return;
    await DB.resetSeasonWinnings(date);
    alert('Season reset! All winnings archived and cleared.');
    this._renderSeasonAdmin();
  },

  async _applyWinningsAdjustment() {
    const playerId = document.getElementById('adj-player').value;
    const amount   = parseFloat(document.getElementById('adj-amount').value);
    const reason   = document.getElementById('adj-reason').value.trim();
    if (!amount || !reason) { alert('Please enter an amount and reason.'); return; }
    await DB.adjustPlayerWinnings(playerId, amount, reason);
    alert(`Adjustment of $${amount.toFixed(2)} applied.`);
    this._renderSeasonAdmin();
  },

  // ── Round corrections ──
  async _reopenRound(code) {
    if (!confirm('Reopen this round for score corrections? It will be removed from history and reactivated.')) return;
    await DB.reopenRound(code);
    const round = await DB.getRound(code);
    Store.saveActiveRound({...round, code});
    await Scorecard.loadFromDB(code);
    this.nav('scorecard');
  },

  async _renderHistory() {
    const body = document.getElementById('history-body');
    body.innerHTML = `<div class="empty-state"><div class="empty-title">Loading…</div></div>`;
    const isAdmin = Auth.isAdmin();
    try {
      const history = await DB.getHistory();
      if (!history.length) {
        body.innerHTML = `<div class="empty-state"><div class="empty-title">No rounds yet</div><div class="empty-sub">Complete a round to see history here.</div></div>`;
        return;
      }
      let html = '';
      history.forEach(r => {
        const games = (r.games||[]).join(' · ');
        const holesLabel = r.holes==='front9'?'Front 9':r.holes==='back9'?'Back 9':'18 holes';
        const winners = (r.players||[]).filter(p=>p.won>0).map(p=>`${p.name.split(' ')[0]} $${(p.won||0).toFixed(2)}`).join(' · ');
        html += `<div class="history-card">
          <div class="flex-between">
            <div>
              <div class="history-course">${r.roundName||r.course||'Round'}</div>
              <div class="history-date">${r.date||''} · ${holesLabel} · ${r.playerCount||r.players?.length||0} players</div>
            </div>
            <div style="font-size:16px;font-weight:700;color:var(--green);">$${r.pot||0}</div>
          </div>
          ${winners?`<div style="font-size:11px;color:var(--text-2);margin-top:4px;">Winners: ${winners}</div>`:''}
          <div class="history-chips">
            ${games?`<span class="history-chip green">${games}</span>`:''}
            ${r.course?`<span class="history-chip">${r.course}</span>`:''}
          </div>
          ${isAdmin&&r.code?`<div style="display:flex;gap:8px;margin-top:10px;">
            <button class="outline-btn" style="font-size:12px;padding:6px 10px;" onclick="App._reopenRound('${r.code}')">Reopen &amp; edit</button>
            <button class="outline-btn" style="font-size:12px;padding:6px 10px;" onclick="App._showPayoutAdjust('${r.code}')">Adjust payouts</button>
          </div>`:''}
        </div>`;
      });
      body.innerHTML = html;
    } catch(e) {
      body.innerHTML = `<div class="note amber">Error loading history: ${e.message}</div>`;
    }
  },

  async _showPayoutAdjust(roundCode) {
    const players = await DB.getPlayers();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `<div style="background:white;border-radius:20px;padding:24px;width:100%;max-width:360px;">
      <div style="font-size:17px;font-weight:600;margin-bottom:4px;">Adjust payout</div>
      <div style="font-size:12px;color:var(--text-2);margin-bottom:16px;">Add or deduct from a player's season winnings.</div>
      <div class="form-group"><label class="form-label">Player</label>
        <select class="form-input" id="padj-player">${players.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Amount (negative to deduct)</label>
        <input class="form-input" type="number" id="padj-amount" placeholder="e.g. 15 or -5" step="0.01" />
      </div>
      <div class="form-group"><label class="form-label">Reason</label>
        <input class="form-input" type="text" id="padj-reason" placeholder="e.g. corrected skins" />
      </div>
      <button class="primary-btn" onclick="App._submitPayoutAdjust()">Apply</button>
      <button onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:11px;border-radius:var(--radius-sm);border:0.5px solid var(--border-2);background:none;font-size:13px;cursor:pointer;margin-top:8px;">Cancel</button>
    </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  },

  async _submitPayoutAdjust() {
    const playerId = document.getElementById('padj-player').value;
    const amount   = parseFloat(document.getElementById('padj-amount').value);
    const reason   = document.getElementById('padj-reason').value.trim();
    if (!amount || !reason) { alert('Please fill in all fields.'); return; }
    await DB.adjustPlayerWinnings(playerId, amount, reason);
    document.querySelector('.modal-overlay')?.remove();
    alert('Adjustment applied to season winnings.');
  },

  _renderSettings() {
    const body=document.getElementById('settings-body');
    const user=Auth.currentUser;
    const profile=Auth.playerProfile;
    body.innerHTML=`
      <div class="section-label">Account</div>
      <div class="settings-section">
        <div class="settings-row"><span class="settings-label">Signed in as</span><span class="settings-val">${user?.email||user?.displayName||'—'}</span></div>
        <div class="settings-row"><span class="settings-label">Player profile</span><span class="settings-val">${profile?.playerName||'Not linked'}</span></div>
        <div class="settings-row"><span class="settings-label">Role</span><span class="settings-val">${profile?.isAdmin?'Admin':'Player'}</span></div>
      </div>
      <div class="section-label">App</div>
      <div class="settings-section">
        <div class="settings-row"><span class="settings-label">Version</span><span class="settings-val">2.0.0</span></div>
        <div class="settings-row"><span class="settings-label">Add to home screen</span><span class="settings-val">Safari → Share → Add</span></div>
      </div>
      <div class="section-label">Account actions</div>
      <div class="settings-section">
        <div class="settings-row" style="cursor:pointer;" onclick="Auth.signOut().then(()=>App.showLogin())"><span class="settings-label settings-danger">Sign out</span></div>
      </div>`;
  },

  _renderJoinRound() {
    const body=document.getElementById('join-round-body');
    body.innerHTML=`
      <div class="step-title" style="margin-bottom:8px;">Join a round</div>
      <div class="step-sub" style="margin-bottom:20px;">Enter the 6-character code your group admin shared.</div>
      <div class="form-group">
        <label class="form-label">Round code</label>
        <input class="form-input" type="text" id="join-code-input" placeholder="e.g. GOLF48" maxlength="6" style="font-size:28px;font-weight:700;text-align:center;letter-spacing:6px;text-transform:uppercase;font-family:'DM Mono',monospace;" />
      </div>
      <button class="primary-btn" onclick="App.joinRound()">Join round</button>
      <button class="ghost-btn" onclick="App.back()">Cancel</button>`;
  },

  async joinRound() {
    const code=document.getElementById('join-code-input')?.value.trim().toUpperCase();
    if(!code||code.length<4){alert('Please enter a valid round code');return;}
    const round=await DB.getRound(code);
    if(!round){alert('Round not found. Check the code and try again.');return;}
    Store.saveActiveRound({...round,code});
    await Scorecard.loadFromDB(code);
    App.nav('scorecard');
  },

  _renderClaimProfile() {
    const body=document.getElementById('claim-profile-body');
    const players=Store.getPlayers();
    if(!players.length){
      // No players yet — this must be the admin, send them to home to set up group
      body.innerHTML=`<div class="empty-state"><div class="empty-title">Welcome to Mullify!</div><div class="empty-sub">Let's set up your group. You'll be the admin.</div></div>`;
      // Mark as admin and go to home after short delay
      if(Auth.currentUser) {
        DB.setAdmin(Auth.currentUser.uid).then(()=>{
          if(Auth.playerProfile) Auth.playerProfile.isAdmin=true;
        });
      }
      setTimeout(()=>App.nav('home'), 1500);
      return;
    }
    body.innerHTML=`
      <div class="step-title" style="margin-bottom:8px;">Who are you?</div>
      <div class="step-sub" style="margin-bottom:20px;">Select your name to link your account to your player profile.</div>
      <div class="card">${players.map(p=>`
        <div class="player-row" style="cursor:pointer;" onclick="App.claimProfile('${p.id}','${p.name}')">
          <div class="avatar">${p.initials}</div>
          <div class="player-info"><div class="player-name">${p.name}</div><div class="player-meta">HCP ${p.hcp} · Quota ${p.quota}${p.linkedUid?` · <span style="color:var(--text-3);">already claimed</span>`:''}</div></div>
          <span style="color:var(--green);font-size:18px;">›</span>
        </div>`).join('')}
      </div>`;
  },

  async claimProfile(playerId, playerName) {
    await Auth.linkToPlayer(playerId, playerName);
    await DB.updatePlayer(playerId, {linkedUid: Auth.currentUser.uid});
    const players = await DB.getPlayers();
    const linked  = players.filter(p => p.linkedUid);
    if (linked.length === 1) {
      await DB.setAdmin(Auth.currentUser.uid);
      await DB.saveUserProfile(Auth.currentUser.uid, {...Auth.playerProfile, isAdmin: true, isOriginalAdmin: true});
      Auth.playerProfile.isAdmin = true;
      Auth.playerProfile.isOriginalAdmin = true;
    }
    App.nav('home');
    Home.render();
  },

  showLogin() {
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-login').classList.add('active');
  },

  onAuthReady(hasProfile) {
    if (hasProfile) {
      // Sync isAdmin and isOriginalAdmin from stored profile
      Auth.playerProfile.isAdmin = Auth.playerProfile.isAdmin || false;
      Auth.playerProfile.isOriginalAdmin = Auth.playerProfile.isOriginalAdmin || false;
      Players.list=Store.getPlayers();
      this.nav('home');
    } else {
      // New user — claim profile
      this.nav('claim-profile');
    }
  },

  init() {
    setTimeout(()=>Auth.init(),100);
    if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure all scripts are fully parsed
  setTimeout(() => {
    if (typeof Auth === 'undefined') {
      console.error('Auth not loaded — check script order');
      return;
    }
    App.init();
  }, 100);
});
