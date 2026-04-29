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
    const sc = new Proxy(Scorecard,{});

    // Skins
    if (r.games?.skins?.on) {
      const skinPot = r.games.skins.buyin * players.length;
      const won = Object.values(r.skinResults||{}).filter(s=>s&&!s.tied);
      const perSkin = won.length>0 ? skinPot/won.length : 0;
      won.forEach(s=>{ if(s.winner!==undefined) winnings[s.winner]+=perSkin; });
    }

    // Stableford
    if (r.games?.stableford?.on) {
      const sfPot = r.games.stableford.buyin * players.length;
      const pts = players.map((_,i)=>Scorecard._totalPts?Scorecard._totalPts(i):0);
      const ranked = pts.map((p,i)=>({i,p})).sort((a,b)=>b.p-a.p);
      const places = Math.min(r.games.stableford.places||2, ranked.length);
      const splits = places===1?[1]:places===2?[0.6,0.4]:[0.5,0.3,0.2];
      splits.forEach((pct,rank)=>{ if(ranked[rank]) winnings[ranked[rank].i]+=Math.round(sfPot*pct); });
    }
    return winnings;
  },

  _renderCashout(body) {
    const r = this.round;
    const players = r.players||[];
    const winnings = this._calcWinnings();
    const totalPaid = players.reduce((s,_,i)=>s+(this.paidOut[i]?Math.round(winnings[i]):0),0);
    const pct = r.pot>0 ? Math.round(totalPaid/r.pot*100) : 0;
    const topIdx = winnings.indexOf(Math.max(...winnings));
    const topP = players[topIdx];

    let html = topP ? `<div class="winner-banner">
      <div class="winner-avatar">${topP.initials}</div>
      <div><div class="winner-name">${topP.name}</div><div class="winner-sub">Round winner</div></div>
      <div class="winner-amt">$${Math.round(winnings[topIdx])}</div>
    </div>` : '';

    html += `<div class="progress-bar-wrap">
      <div class="progress-bar-track"><div class="progress-bar-fill" id="payout-progress" style="width:${pct}%;"></div></div>
      <div class="progress-bar-labels"><span id="paid-out-label">$${totalPaid} paid out</span><span>$${r.pot} total</span></div>
    </div>`;

    html += `<div class="section-label">Pay each winner from the pot</div><div class="card">`;
    players.forEach((p,i)=>{
      const amt=Math.round(winnings[i]);
      const paid=!!this.paidOut[i];
      if(amt<=0){
        html+=`<div class="payout-row"><div class="avatar muted">${p.initials}</div><div class="payout-info"><div class="payout-name">${p.name}</div><div class="payout-detail">No winnings</div></div><div class="payout-amt amt-zero">—</div></div>`;
      } else {
        html+=`<div class="payout-row"><div class="avatar">${p.initials}</div><div class="payout-info"><div class="payout-name">${p.name}</div><div class="payout-detail">$${amt} to collect</div></div><div class="payout-amt amt-win">$${amt}</div><button class="mark-paid-btn${paid?' paid':''}" onclick="Payouts.markPaid(${i},this)">${paid?'Paid ✓':'Mark paid'}</button></div>`;
      }
    });
    html+=`</div>`;
    html+=`<div class="card card-pad" style="margin-top:4px;">
      <div class="balance-row"><span class="balance-label">Collected</span><span>$${r.pot}</span></div>
      <div class="balance-row"><span class="balance-label">Paid out</span><span class="b-green">$${totalPaid}</span></div>
      <div class="balance-row"><span class="balance-label">Remaining</span><span>${r.pot-totalPaid===0?'<span class="b-green">$0 ✓</span>':'$'+(r.pot-totalPaid)}</span></div>
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
    const totalPaid=players.reduce((s,_,i)=>s+(this.paidOut[i]?Math.round(winnings[i]):0),0);
    const pct=r.pot>0?Math.round(totalPaid/r.pot*100):0;
    const bar=document.getElementById('payout-progress');
    const lbl=document.getElementById('paid-out-label');
    if(bar)bar.style.width=pct+'%';
    if(lbl)lbl.textContent='$'+totalPaid+' paid out';
  },

  _renderBreakdown(body) {
    const r=this.round; const players=r.players||[];
    const tee=players[0]?.tee||'Blue';
    const hd=r.course?.tees?.[tee]||Object.values(r.course?.tees||{})[0];
    let html='';
    if(r.games?.skins?.on){
      const skinPot=r.games.skins.buyin*players.length;
      const won=Object.values(r.skinResults||{}).filter(s=>s&&!s.tied);
      const perSkin=won.length>0?Math.round(skinPot/won.length):0;
      html+=`<div class="section-label">Skins — $${skinPot} pot</div><div class="card">`;
      for(let h=0;h<18;h++){
        const res=(r.skinResults||{})[h]; const par=hd?.par?.[h]||4;
        if(!res)continue;
        if(res.tied){html+=`<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><span class="tied-chip">Tied — no skin</span></div></div>`;}
        else{const w=players[res.winner];html+=`<div class="skin-row"><span class="skin-hole">H${h+1}·P${par}</span><div class="skin-result"><div class="avatar sm">${w?.initials||'?'}</div><span style="font-size:12px;font-weight:500;">${w?.name?.split(' ')[0]||''}</span></div><span class="skin-amt">$${perSkin}</span></div>`;}
      }
      html+=`</div>`;
    }
    if(r.games?.stableford?.on){
      const sfPot=r.games.stableford.buyin*players.length;
      const places=r.games.stableford.places||2;
      const splits=places===1?[1]:places===2?[0.6,0.4]:[0.5,0.3,0.2];
      const pts=players.map((_,i)=>Scorecard._totalPts?Scorecard._totalPts(i):0);
      const ranked=pts.map((p,i)=>({i,p,player:players[i]})).sort((a,b)=>b.p-a.p);
      const labels=['1st','2nd','3rd'];
      html+=`<div class="section-label">Stableford — $${sfPot} pot</div><div class="card">`;
      ranked.forEach((item,rank)=>{
        const payout=rank<splits.length?Math.round(sfPot*splits[rank]):0;
        html+=`<div class="payout-row"><div style="font-size:13px;font-weight:600;color:${rank===0?'var(--green)':'var(--text-3)'};min-width:30px;">${labels[rank]||''}</div><div class="avatar">${item.player.initials}</div><div class="payout-info"><div class="payout-name">${item.player.name}</div><div class="payout-detail">${item.p} pts</div></div><div class="payout-amt ${payout>0?'amt-win':'amt-zero'}">${payout>0?'$'+payout:'—'}</div></div>`;
      });
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
    else if(screen==='round-setup')   RoundSetup.start();
    else if(screen==='scorecard') {
      const r=Store.getActiveRound();
      if(r&&r.code&&!Scorecard.round) Scorecard.loadFromDB(r.code);
      else if(Scorecard.round) Scorecard.render();
    }
    else if(screen==='payouts')       Payouts.renderView();
    else if(screen==='quota')         Quota.render();
    else if(screen==='quota-admin')   Quota.renderAdmin();
    else if(screen==='history')       this._renderHistory();
    else if(screen==='settings')      this._renderSettings();
    else if(screen==='join-round')    this._renderJoinRound();
    else if(screen==='claim-profile') this._renderClaimProfile();
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
