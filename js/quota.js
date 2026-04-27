// ── Quota ──
const Quota = {
  render() {
    const body = document.getElementById('quota-body');
    const players = Store.getPlayers();
    if (!players.length) {
      body.innerHTML = `<div class="empty-state"><div class="empty-title">No players yet</div><div class="empty-sub">Add players to track quota standings.</div></div>`;
      return;
    }
    const rules = Store.getQuotaRules();
    let html = `<div class="note">Quota adjusts automatically after each round. Beat by ${rules.upThresh}+ = +${rules.upAmt}pt. Miss by ${rules.dnThresh}+ = −${rules.dnAmt}pt.</div>`;
    html += `<div class="card">`;
    players.forEach(p => {
      const history = p.history || [];
      const lastRound = history[history.length - 1];
      const lastAdj = lastRound ? (lastRound.adj > 0 ? `+${lastRound.adj}` : lastRound.adj < 0 ? `${lastRound.adj}` : '±0') : '—';
      const adjCls = lastRound && lastRound.adj > 0 ? 'adj-up' : lastRound && lastRound.adj < 0 ? 'adj-down' : 'adj-same';
      html += `<div class="quota-row">
        <div class="avatar">${p.initials}</div>
        <div class="quota-info">
          <div class="quota-name">${p.name}</div>
          <div class="quota-sub">HCP ${p.hcp} · ${history.length} rounds played${lastRound ? ' · Last: ' + lastRound.scored + ' pts' : ''}</div>
        </div>
        <div class="quota-right">
          <div class="quota-target">${p.quota}</div>
          <div class="quota-adj ${adjCls}">Last adj: ${lastAdj}</div>
        </div>
      </div>`;
    });
    html += `</div>`;

    // History for first player
    if (players[0]?.history?.length) {
      html += `<div class="section-label">Recent rounds — ${players[0].name}</div><div class="card">`;
      players[0].history.slice(-5).reverse().forEach(h => {
        const diff = h.scored - h.quota;
        const adjStr = h.adj > 0 ? `+${h.adj}` : h.adj < 0 ? `${h.adj}` : '±0';
        const adjCls = h.adj > 0 ? 'adj-up' : h.adj < 0 ? 'adj-down' : 'adj-same';
        html += `<div class="balance-row">
          <span class="balance-label">${h.date} · ${h.course}</span>
          <span>${h.scored} pts (${diff>=0?'+':''}${diff}) <span class="${adjCls}">${adjStr}</span></span>
        </div>`;
      });
      html += `</div>`;
    }
    body.innerHTML = html;
  },

  renderAdmin() {
    const body = document.getElementById('quota-admin-body');
    const rules = Store.getQuotaRules();
    const players = Store.getPlayers();

    const stepper = (key, label, sub) => `
      <div class="toggle-row">
        <div><div class="toggle-label">${label}</div><div class="toggle-sub">${sub}</div></div>
        <div class="stepper">
          <button class="step-btn" onclick="Quota.adjRule('${key}',-1)">−</button>
          <span class="step-val" id="rule-${key}">${rules[key]}</span>
          <button class="step-btn" onclick="Quota.adjRule('${key}',1)">+</button>
        </div>
      </div>`;

    let html = `<div class="section-label">Adjustment thresholds</div>
    <div class="card card-pad">
      ${stepper('upThresh','Beat quota by','Points over quota to trigger increase')}
      ${stepper('upAmt','Increase quota by','Points added per threshold exceeded')}
      ${stepper('dnThresh','Miss quota by','Points under quota to trigger decrease')}
      ${stepper('dnAmt','Decrease quota by','Points removed per threshold exceeded')}
      ${stepper('maxUp','Max increase per round','Cap on quota rising in one round')}
      ${stepper('maxDn','Max decrease per round','Cap on quota falling in one round')}
    </div>`;

    // Example
    html += `<div class="section-label">Example with current rules</div><div class="card card-pad">`;
    const examples = [{name:'Player · quota 8, scores 14',quota:8,scored:14},{name:'Player · quota 20, scores 17',quota:20,scored:17},{name:'Player · quota 15, scores 15',quota:15,scored:15}];
    examples.forEach(ex => {
      const diff = ex.scored - ex.quota;
      let adj = 0;
      if (diff >= rules.upThresh) adj = Math.min(Math.floor(diff/rules.upThresh)*rules.upAmt, rules.maxUp);
      else if (diff <= -rules.dnThresh) adj = -Math.min(Math.floor(Math.abs(diff)/rules.dnThresh)*rules.dnAmt, rules.maxDn);
      const col = adj > 0 ? 'var(--green)' : adj < 0 ? 'var(--red)' : 'var(--text-2)';
      html += `<div style="padding:8px 0;border-bottom:0.5px solid var(--border);">
        <div style="font-size:13px;font-weight:500;">${ex.name}</div>
        <div style="font-size:12px;color:var(--text-2);margin-top:3px;">${diff>=0?'+':''}${diff} vs quota → <span style="color:${col};font-weight:500;">${adj>=0?'+':''}${adj} (new quota ${ex.quota+adj})</span></div>
      </div>`;
    });
    html += `</div>`;

    // Manual override
    if (players.length) {
      html += `<div class="section-label">Manual quota override</div><div class="card card-pad">
        <div class="form-group"><label class="form-label">Player</label><select class="form-input" id="override-player">${players.map(p=>`<option value="${p.id}">${p.name} (current: ${p.quota})</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Set quota to</label><input class="form-input" type="number" id="override-val" placeholder="e.g. 22" /></div>
        <button class="primary-btn" onclick="Quota.applyOverride()">Apply override</button>
      </div>`;
    }

    html += `<button class="primary-btn" onclick="Quota.saveRules()">Save rules</button>`;
    body.innerHTML = html;
  },

  adjRule(key, d) {
    const rules = Store.getQuotaRules();
    rules[key] = Math.max(1, rules[key] + d);
    Store.saveQuotaRules(rules);
    const el = document.getElementById('rule-' + key);
    if (el) el.textContent = rules[key];
    // Refresh example
    this.renderAdmin();
  },

  saveRules() {
    App.back();
  },

  applyOverride() {
    const id = parseInt(document.getElementById('override-player').value);
    const val = parseInt(document.getElementById('override-val').value);
    if (!val) return;
    Store.updatePlayer(id, {quota: val});
    alert('Quota updated!');
    this.renderAdmin();
  }
};
