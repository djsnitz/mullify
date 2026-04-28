// ── Players (Firebase-backed) ──
const Players = {
  selectedTee: 'Blue',
  list: [],

  async load() {
    try {
      this.list = await DB.getPlayers();
      Store.cachePlayers(this.list);
    } catch {
      this.list = Store.getPlayers();
    }
    this.render();
  },

  render() {
    const body = document.getElementById('players-list-body');
    if (!body) return;
    if (!this.list.length) {
      body.innerHTML = `<div class="empty-state"><div class="empty-title">No players yet</div><div class="empty-sub">Add your golf group members to get started.</div></div><button class="primary-btn" onclick="App.nav('add-player')" style="margin:0 16px;">Add first player</button>`;
      return;
    }
    body.innerHTML = `<div class="card">${this.list.map(p => `
      <div class="player-row">
        <div class="avatar">${p.initials}</div>
        <div class="player-info">
          <div class="player-name">${p.name}</div>
          <div class="player-meta">HCP ${p.hcp} · Quota ${p.quota} · ${p.tee} tee${p.linkedUid ? ' · <span style="color:var(--green);">✓ linked</span>' : ' · <span style="color:var(--text-3);">not linked</span>'}</div>
        </div>
        <button class="text-btn" style="color:var(--red);font-size:13px;" onclick="Players.remove('${p.id}')">Remove</button>
      </div>`).join('')}</div>
      <div class="note" style="margin-top:12px;">✓ linked = player has signed in and claimed their profile.</div>`;
  },

  updatePreview() {
    const f = document.getElementById('add-first').value.trim();
    const l = document.getElementById('add-last').value.trim();
    document.getElementById('add-avatar-preview').textContent = (f[0]||'') + (l[0]||'') || '?';
    document.getElementById('add-player-btn').disabled = !(f && l);
  },

  selectTee(btn) {
    document.querySelectorAll('#add-tee-row .tee-btn').forEach(b => b.className = 'tee-btn');
    this.selectedTee = btn.dataset.tee;
    btn.classList.add('tee-active-' + btn.dataset.tee.toLowerCase());
  },

  async lookupGHIN() {
    const num = document.getElementById('add-ghin').value.trim();
    if (!num) return;
    const el = document.getElementById('ghin-result');
    el.style.display = 'block';
    el.textContent = 'Looking up…';
    // Simulated — replace with real USGA GHIN API call
    setTimeout(() => {
      const mockHcp = (Math.random() * 28).toFixed(1);
      el.textContent = `GHIN ${num} · Handicap Index: ${mockHcp}`;
      document.getElementById('add-hcp').value = mockHcp;
    }, 1000);
  },

  async save() {
    const first = document.getElementById('add-first').value.trim();
    const last  = document.getElementById('add-last').value.trim();
    const hcp   = parseFloat(document.getElementById('add-hcp').value) || 18;
    const quotaInput = document.getElementById('add-quota').value;
    const quota = quotaInput ? parseInt(quotaInput) : Math.round(36 - Math.round(hcp));
    const player = {
      name: first + ' ' + last,
      first, last,
      initials: (first[0] + last[0]).toUpperCase(),
      hcp, quota,
      tee: this.selectedTee,
      ghin: document.getElementById('add-ghin').value.trim(),
      history: [],
      linkedUid: null,
      createdAt: Date.now()
    };
    await DB.savePlayer(player);
    App.back();
    await this.load();
  },

  async remove(id) {
    if (!confirm('Remove this player from the group?')) return;
    await DB.deletePlayer(id);
    await this.load();
  }
};
