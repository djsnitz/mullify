// ── Local Store (cache + offline support) ──
const Store = {
  _get(key, def) {
    try { const v = localStorage.getItem('mullify_' + key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  _set(key, val) {
    try { localStorage.setItem('mullify_' + key, JSON.stringify(val)); } catch {}
  },

  // Cache active round locally for offline
  getActiveRound() { return this._get('active_round', null); },
  saveActiveRound(r) { this._set('active_round', r); },
  clearActiveRound() { localStorage.removeItem('mullify_active_round'); },

  // Cache players locally
  getPlayers() { return this._get('players_cache', []); },
  cachePlayers(p) { this._set('players_cache', p); },

  // Cache courses locally
  getCourses() { return this._get('courses_cache', []); },
  cacheCourses(c) { this._set('courses_cache', c); },

  // Pending score writes when offline
  getPendingWrites() { return this._get('pending_writes', []); },
  addPendingWrite(write) {
    const pending = this.getPendingWrites();
    pending.push({...write, ts: Date.now()});
    this._set('pending_writes', pending);
  },
  clearPendingWrites() { localStorage.removeItem('mullify_pending_writes'); },

  // Settings
  getSettings() { return this._get('settings', { groupName: 'Fairway Group' }); },
  saveSettings(s) { this._set('settings', s); }
};
