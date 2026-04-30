// ── Payouts ──
const Payouts = {
  round: null,
  view: 'cashout',
  paidOut: {},

  buildFromRound(round) {
    this.round = round;
    this.paidOut = {};
    this.view = 'cashout';
    document.getElementById('payout-pot-chip').textContent = '$' + (round.pot||0);
  },

  renderView() {
    const body = document.getElementById('payouts-body');
    if (!this.round) { body.innerHTML=`<div class="empty-state"><div class="empty-title">No round data</div><div class="empty-sub">Complete a round to see payouts.</div></div>`; return; }
    if (this.view==='cashout')   this._renderCashout(body);
    else if (this.view==='breakdown') this._renderBreakdown(body);
    else                         this._renderLedger(body);
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

    // ── Skins: no rounding, exact decimals ──
    if (r.games?.skins?.on) {
      const skinPot = r.games.skins.buyin * players.length;
      const won = Object.values(r.skinResults||{}).filter(s=>s&&!s.tied);
      const perSkin = won.length>0 ? skinPot/won.length : 0; // no rounding
      won.forEach(s=>{ if(s.winner!==undefined) winnings[s.winner]+=perSkin; });
    }

    // ── Stableford: with tie splitting ──
    if (r.games?.stableford?.on) {
      const sfPot = r.games.stableford.buyin * players.length;
      const places = r.games.stableford.places||2;
      const pts = players.map((_,i)=>Scorecard._totalPts?Scorecard._totalPts(i):0);
      this._distributeWithTies(winnings, pts, places, sfPot);
    }

    // ── Quota: rank by (scored - quota), with tie splitting ──
    if (r.games?.quota?.on) {
      const quotaPot = r.games.quota.buyin * players.length;
      const places = r.games.quota.places||2;
      const is9hole = r.holes==='front9'||r.holes==='back9';
      const diffs = players.map((p,i)=>{
        const playerQuota = is9hole?(p.quota9||Math.round((p.quota||18)/2)):(p.quota||18);
        const pts = Scorecard._totalPts?Scorecard._totalPts(i):0;
        return pts - playerQuota;
      });
      this._distributeWithTies(winnings, diffs, places, quotaPot);
    }

    // ── CTP: one winner per par 3 hole, shortest distance on green ──
    if (r.games?.ctp?.on && r.ctpResults) {
      const ctpPot = r.games.ctp.buyin * players.length;
      const ctpHoles = Object.values(r.ctpResults||{}).filter(h=>h.winnerId);
      const perHole = ctpHoles.length>0 ? ctpPot/ctpHoles.length : 0;
      ctpHoles.forEach(h=>{
        const idx = players.findIndex(p=>p.id===h.winnerId);
        if(idx>=0) winnings[idx]+=perHole;
      });
    }

    // ── Low Gross: lowest total gross score wins (winner takes all, ties split) ──
    if (r.games?.lowgross?.on) {
      const lgPot = r.games.lowgross.buyin * players.length;
      const grossScores = players.map((p)=>
        -Object.values(r.scores?.[p.id]||{}).reduce((a,b)=>a+(b||0),0)
      );
      this._distributeWithTies(winnings, grossScores, 1, lgPot); // 1 place = winner takes all
    }

    // ── Net Score: lowest total net score wins ──
    if (r.games?.netscore?.on) {
      const nsPot = r.games.netscore.buyin * players.length;
      const places = r.games.netscore.places||2;
      const netScores = players.map((p,i)=>{
        const tee = p.tee||'Blue';
        const hd = r.course?.tees?.[tee]||Object.values(r.course?.tees||{})[0];
        const total = (r.holeIndexes||Array.from({length:18},(_,i)=>i)).reduce((sum,h)=>{
          const gross = r.scores?.[p.id]?.[h];
          if(gross===undefined||gross===null) return sum;
          return sum + (Scorecard._net?Scorecard._net(gross,p.hcp,hd?.hcp?.[h]||1):gross);
        },0);
        return -total; // negate: lower net = better
      });
      this._distributeWithTies(winnings, netScores, places, nsPot);
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
    const r=this.round;
    const rules=await DB.getQuotaRules();
    const players=await DB.getPlayers();
    // Update quotas
    for(const rp of r.players||[]){
      const sp=players.find(p=>p.id===rp.id);
      if(!sp)continue;
      const pts=Scorecard._totalPts?Scorecard._totalPts(r.players.indexOf(rp)):0;
      const diff=pts-sp.quota;
      let adj=0;
      if(diff>=rules.upThresh)adj=Math.min(Math.floor(diff/rules.upThresh)*rules.upAmt,rules.maxUp);
      else if(diff<=-rules.dnThresh)adj=-Math.min(Math.floor(Math.abs(diff)/rules.dnThresh)*rules.dnAmt,rules.maxDn);
      await DB.updatePlayer(sp.id,{quota:sp.quota+adj,history:[...(sp.history||[]),({date:r.date,course:r.course?.name,quota:sp.quota,scored:pts,adj})].slice(-20)});
    }
    await DB.closeRound(r.code||r.id,{course:r.course?.name,date:r.date,pot:r.pot,players:r.players?.length});
    Store.clearActiveRound();
    Scorecard.round=null;
    this.round=null;
    App.nav('home');
    Home.render();
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
    let html=`<div class="note">Beat quota by ${rules.upThresh}+ pts → +${rules.upAmt} quota. Miss by ${rules.dnThresh}+ → −${rules.dnAmt} quota.</div><div class="card">`;
    players.forEach(p=>{
      const last=(p.history||[]).slice(-1)[0];
      const adj=last?(last.adj>0?`+${last.adj}`:last.adj<0?`${last.adj}`:'±0'):'—';
      const adjCls=last&&last.adj>0?'adj-up':last&&last.adj<0?'adj-down':'adj-same';
      html+=`<div class="quota-row"><div class="avatar">${p.initials}</div><div class="quota-info"><div class="quota-name">${p.name}</div><div class="quota-sub">HCP ${p.hcp} · ${(p.history||[]).length} rounds${last?' · Last: '+last.scored+' pts':''}</div></div><div class="quota-right"><div class="quota-target">${p.quota}</div><div class="quota-adj ${adjCls}">Last: ${adj}</div></div></div>`;
    });
    html+=`</div>`;
    body.innerHTML=html;
  },

  async renderAdmin() {
    const body=document.getElementById('quota-admin-body');
    const rules=await DB.getQuotaRules();
    const players=await DB.getPlayers();
    const stepper=(key,label,sub)=>`<div class="toggle-row"><div><div class="toggle-label">${label}</div><div class="toggle-sub">${sub}</div></div><div class="stepper"><button class="step-btn" onclick="Quota.adjRule('${key}',-1)">−</button><span class="step-val" id="rule-${key}">${rules[key]}</span><button class="step-btn" onclick="Quota.adjRule('${key}',1)">+</button></div></div>`;
    let html=`<div class="section-label">Adjustment rules</div><div class="card card-pad">${stepper('upThresh','Beat quota by','Pts over to trigger increase')}${stepper('upAmt','Increase by','Pts added per threshold')}${stepper('dnThresh','Miss quota by','Pts under to trigger decrease')}${stepper('dnAmt','Decrease by','Pts removed per threshold')}${stepper('maxUp','Max increase/round','Cap on quota rising')}${stepper('maxDn','Max decrease/round','Cap on quota falling')}</div>`;
    if(players.length){
      html+=`<div class="section-label">Manual override</div><div class="card card-pad"><div class="form-group"><label class="form-label">Player</label><select class="form-input" id="override-player">${players.map(p=>`<option value="${p.id}">${p.name} (${p.quota})</option>`).join('')}</select></div><div class="form-group"><label class="form-label">New quota</label><input class="form-input" type="number" id="override-val" placeholder="e.g. 22" /></div><button class="primary-btn" onclick="Quota.applyOverride()">Apply override</button></div>`;
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
    const id=document.getElementById('override-player').value;
    const val=parseInt(document.getElementById('override-val').value);
    if(!val)return;
    await DB.updatePlayer(id,{quota:val});
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
    else if(screen==='round-detail')   {} // rendered by _openRoundDetail
    else if(screen==='settings')      this._renderSettings();
    else if(screen==='join-round')    this._renderJoinRound();
    else if(screen==='claim-profile') this._renderClaimProfile();
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

  async _renderHistory() {
    const body=document.getElementById('history-body');
    body.innerHTML=`<div class="empty-state"><div class="empty-title">Loading…</div></div>`;
    const history=await DB.getHistory();
    if(!history.length){body.innerHTML=`<div class="empty-state"><div class="empty-title">No rounds yet</div><div class="empty-sub">Complete a round to see it here.</div></div>`;return;}
    body.innerHTML=history.map(r=>`<div class="history-card"><div class="history-course">${r.course||'Unknown'}</div><div class="history-date">${r.date||''} · ${r.players||0} players · $${r.pot||0}</div></div>`).join('');
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
