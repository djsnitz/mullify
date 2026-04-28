// ── Mullify Database (Firebase Realtime DB) ──
const DB = {
  db: null,

  init() {
    this.db = firebase.database();
  },

  // ── User profiles ──
  async getUserProfile(uid) {
    const snap = await this.db.ref(`users/${uid}`).get();
    return snap.exists() ? snap.val() : null;
  },

  async saveUserProfile(uid, data) {
    await this.db.ref(`users/${uid}`).set(data);
  },

  async setAdmin(uid) {
    await this.db.ref(`users/${uid}/isAdmin`).set(true);
  },

  // ── Players (group roster) ──
  async getPlayers() {
    const snap = await this.db.ref('players').get();
    return snap.exists() ? Object.values(snap.val()) : [];
  },

  async savePlayer(player) {
    const id = player.id || this.db.ref('players').push().key;
    player.id = id;
    await this.db.ref(`players/${id}`).set(player);
    return player;
  },

  async updatePlayer(id, data) {
    await this.db.ref(`players/${id}`).update(data);
  },

  async deletePlayer(id) {
    await this.db.ref(`players/${id}`).remove();
  },

  onPlayersChanged(cb) {
    this.db.ref('players').on('value', snap => {
      cb(snap.exists() ? Object.values(snap.val()) : []);
    });
  },

  // ── Courses ──
  async getCourses() {
    const snap = await this.db.ref('courses').get();
    return snap.exists() ? Object.values(snap.val()) : [];
  },

  async saveCourse(course) {
    await this.db.ref(`courses/${course.id}`).set(course);
  },

  async deleteCourse(id) {
    await this.db.ref(`courses/${id}`).remove();
  },

  // ── Rounds ──
  async createRound(round) {
    const code = this._genCode();
    round.code = code;
    round.id = code;
    round.createdAt = Date.now();
    round.status = 'active';
    await this.db.ref(`rounds/${code}`).set(round);
    return round;
  },

  async getRound(code) {
    const snap = await this.db.ref(`rounds/${code.toUpperCase()}`).get();
    return snap.exists() ? snap.val() : null;
  },

  async updateRound(code, data) {
    await this.db.ref(`rounds/${code}`).update(data);
  },

  // Live score for a specific player+hole
  async saveScore(roundCode, playerId, hole, gross) {
    await this.db.ref(`rounds/${roundCode}/scores/${playerId}/${hole}`).set(gross);
    await this.db.ref(`rounds/${roundCode}/lastUpdated`).set(Date.now());
  },

  async saveSkinResult(roundCode, hole, result) {
    await this.db.ref(`rounds/${roundCode}/skinResults/${hole}`).set(result);
  },

  async saveCurrentHole(roundCode, hole) {
    await this.db.ref(`rounds/${roundCode}/currentHole`).set(hole);
  },

  // Listen for live score updates
  onRoundChanged(code, cb) {
    this.db.ref(`rounds/${code}`).on('value', snap => {
      if (snap.exists()) cb(snap.val());
    });
  },

  offRoundChanged(code) {
    this.db.ref(`rounds/${code}`).off();
  },

  // Admin override a score
  async adminOverrideScore(roundCode, playerId, hole, gross) {
    await this.saveScore(roundCode, playerId, hole, gross);
    await this.db.ref(`rounds/${roundCode}/overrides/${playerId}_${hole}`).set({
      by: Auth.currentUser?.uid,
      at: Date.now(),
      value: gross
    });
  },

  // Close out a round
  async closeRound(code, summary) {
    await this.db.ref(`rounds/${code}/status`).set('complete');
    await this.db.ref(`rounds/${code}/summary`).set(summary);
    // Archive to history
    await this.db.ref(`history/${code}`).set({...summary, code, completedAt: Date.now()});
  },

  async getHistory() {
    const snap = await this.db.ref('history').get();
    if (!snap.exists()) return [];
    return Object.values(snap.val()).sort((a,b) => b.completedAt - a.completedAt);
  },

  // Quota rules (shared across group)
  async getQuotaRules() {
    const snap = await this.db.ref('quotaRules').get();
    return snap.exists() ? snap.val() : { upThresh:3, upAmt:1, dnThresh:3, dnAmt:1, maxUp:3, maxDn:2 };
  },

  async saveQuotaRules(rules) {
    await this.db.ref('quotaRules').set(rules);
  },

  _genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }
};
