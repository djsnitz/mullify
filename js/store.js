// ── Mullify Store ── persistent localStorage state
const Store = {
  _get(key, def) {
    try { const v = localStorage.getItem('mullify_' + key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  _set(key, val) {
    try { localStorage.setItem('mullify_' + key, JSON.stringify(val)); } catch {}
  },

  // Players
  getPlayers() { return this._get('players', []); },
  savePlayers(p) { this._set('players', p); },
  addPlayer(p) { const all = this.getPlayers(); all.push({...p, id: Date.now()}); this.savePlayers(all); },
  updatePlayer(id, data) { const all = this.getPlayers().map(p => p.id === id ? {...p, ...data} : p); this.savePlayers(all); },

  // Courses
  getCourses() { return this._get('courses', []); },
  saveCourses(c) { this._set('courses', c); },
  addCourse(c) { const all = this.getCourses(); if (!all.find(x => x.id === c.id)) { all.push(c); this.saveCourses(all); } },
  removeCourse(id) { this.saveCourses(this.getCourses().filter(c => c.id !== id)); },

  // Active round
  getActiveRound() { return this._get('active_round', null); },
  saveActiveRound(r) { this._set('active_round', r); },
  clearActiveRound() { localStorage.removeItem('mullify_active_round'); },

  // Round history
  getHistory() { return this._get('history', []); },
  addRoundToHistory(r) { const h = this.getHistory(); h.unshift({...r, savedAt: Date.now()}); this._set('history', h.slice(0, 50)); },

  // Quota rules
  getQuotaRules() {
    return this._get('quota_rules', { upThresh: 3, upAmt: 1, dnThresh: 3, dnAmt: 1, maxUp: 3, maxDn: 2 });
  },
  saveQuotaRules(r) { this._set('quota_rules', r); },

  // Settings
  getSettings() {
    return this._get('settings', { groupName: 'My Golf Group', adminName: '', currency: '$' });
  },
  saveSettings(s) { this._set('settings', s); },

  // Clear all
  clearAll() {
    ['players','courses','active_round','history','quota_rules','settings'].forEach(k => {
      localStorage.removeItem('mullify_' + k);
    });
  }
};
