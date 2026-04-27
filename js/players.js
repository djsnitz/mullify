// ── Players ──
const Players = {
  selectedTee: 'Blue',

  render() {
    const body = document.getElementById('players-list-body');
    const players = Store.getPlayers();
    if (!players.length) {
      body.innerHTML = `<div class="empty-state"><div class="empty-title">No players yet</div><div class="empty-sub">Add your golf group members to get started.</div></div><button class="primary-btn" onclick="App.nav('add-player')" style="margin:0 16px;">Add first player</button>`;
      return;
    }
    body.innerHTML = `<div class="card">${players.map(p => `
      <div class="player-row">
        <div class="avatar">${p.initials}</div>
        <div class="player-info">
          <div class="player-name">${p.name}</div>
          <div class="player-meta">HCP ${p.hcp} · Quota ${p.quota} · ${p.tee} tee</div>
        </div>
        <button class="text-btn" style="color:var(--red);font-size:13px;" onclick="Players.remove(${p.id})">Remove</button>
      </div>`).join('')}</div>`;
  },

  updatePreview() {
    const f = document.getElementById('add-first').value.trim();
    const l = document.getElementById('add-last').value.trim();
    document.getElementById('add-avatar-preview').textContent = (f[0]||'') + (l[0]||'') || '?';
    document.getElementById('add-player-btn').disabled = !(f && l);
  },

  selectTee(btn) {
    document.querySelectorAll('#add-tee-row .tee-btn').forEach(b => {
      b.className = 'tee-btn';
    });
    this.selectedTee = btn.dataset.tee;
    btn.classList.add('tee-active-' + btn.dataset.tee.toLowerCase());
  },

  lookupGHIN() {
    const num = document.getElementById('add-ghin').value.trim();
    if (!num) return;
    // Simulate GHIN lookup — in production replace with real USGA API call
    const el = document.getElementById('ghin-result');
    el.style.display = 'block';
    el.textContent = 'Looking up…';
    setTimeout(() => {
      const mockHcp = (Math.random() * 28).toFixed(1);
      el.textContent = `GHIN ${num} · Handicap Index: ${mockHcp}`;
      document.getElementById('add-hcp').value = mockHcp;
    }, 1000);
  },

  save() {
    const first = document.getElementById('add-first').value.trim();
    const last = document.getElementById('add-last').value.trim();
    const hcp = parseFloat(document.getElementById('add-hcp').value) || 18;
    const quotaInput = document.getElementById('add-quota').value;
    const quota = quotaInput ? parseInt(quotaInput) : Math.round(36 - Math.round(hcp));
    Store.addPlayer({
      name: first + ' ' + last,
      first, last,
      initials: first[0] + last[0],
      hcp,
      quota,
      tee: this.selectedTee,
      ghin: document.getElementById('add-ghin').value.trim(),
      history: []
    });
    App.back();
    Players.render();
  },

  remove(id) {
    if (!confirm('Remove this player?')) return;
    Store.savePlayers(Store.getPlayers().filter(p => p.id !== id));
    Players.render();
  }
};
