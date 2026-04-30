// ── Mullify Database (Firebase Realtime DB) ──
const DB = {
  db: null,

  init() {
    this.db = firebase.database();
    console.log('DB initialized:', !!this.db);
  },

  _ref(path) {
    if (!this.db) {
      this.db = firebase.database();
    }
    return this.db.ref(path);
  },

  // ── User profiles ──
  async getUserProfile(uid) {
    const snap = await this._ref(`users/${uid}`).get();
    return snap.exists() ? snap.val() : null;
  },

  async saveUserProfile(uid, data) {
    await this._ref(`users/${uid}`).set(data);
  },

  async setAdmin(uid) {
    await this._ref(`users/${uid}/isAdmin`).set(true);
  },

  async removeAdmin(uid) {
    await this._ref(`users/${uid}/isAdmin`).set(false);
  },

  // ── Players ──
  async getPlayers() {
    const snap = await this._ref('players').get();
    return snap.exists() ? Object.values(snap.val()) : [];
  },

  async savePlayer(player) {
    const id = player.id || this._ref('players').push().key;
    player.id = id;
    await this._ref(`players/${id}`).set(player);
    return player;
  },

  async updatePlayer(id, data) {
    await this._ref(`players/${id}`).update(data);
  },

  async deletePlayer(id) {
    await this._ref(`players/${id}`).remove();
  },

  onPlayersChanged(cb) {
    this._ref('players').on('value', snap => {
      cb(snap.exists() ? Object.values(snap.val()) : []);
    });
  },

  // ── Courses ──
  async getCourses() {
    const snap = await this._ref('courses').get();
    return snap.exists() ? Object.values(snap.val()) : [];
  },

  async saveCourse(course) {
    await this._ref(`courses/${course.id}`).set(course);
  },

  async deleteCourse(id) {
    await this._ref(`courses/${id}`).remove();
  },

  // ── Rounds ──
  async getPendingRounds() {
    const snap = await this._ref('rounds').get();
    if (!snap.exists()) return [];
    return Object.values(snap.val())
      .filter(r => r.status === 'pending' || r.status === 'active')
      .sort((a,b) => (a.playDate||0) - (b.playDate||0));
  },

  async createRound(round) {
    const code = this._genCode();
    round.code = code;
    round.id = code;
    round.createdAt = Date.now();
    round.status = 'active';
    await this._ref(`rounds/${code}`).set(round);
    return round;
  },

  async getRound(code) {
    const snap = await this._ref(`rounds/${code.toUpperCase()}`).get();
    return snap.exists() ? snap.val() : null;
  },

  async updateRound(code, data) {
    await this._ref(`rounds/${code}`).update(data);
  },

  async saveCTPResult(roundCode, hole, result) {
    await this._ref(`rounds/${roundCode}/ctpResults/${hole}`).set(result);
  },

  async saveScore(roundCode, playerId, hole, gross) {
    await this._ref(`rounds/${roundCode}/scores/${playerId}/${hole}`).set(gross);
    await this._ref(`rounds/${roundCode}/lastUpdated`).set(Date.now());
  },

  async saveSkinResult(roundCode, hole, result) {
    await this._ref(`rounds/${roundCode}/skinResults/${hole}`).set(result);
  },

  async saveCurrentHole(roundCode, hole) {
    await this._ref(`rounds/${roundCode}/currentHole`).set(hole);
  },

  onRoundChanged(code, cb) {
    this._ref(`rounds/${code}`).on('value', snap => {
      if (snap.exists()) cb(snap.val());
    });
  },

  offRoundChanged(code) {
    this._ref(`rounds/${code}`).off();
  },

  async adminOverrideScore(roundCode, playerId, hole, gross) {
    await this.saveScore(roundCode, playerId, hole, gross);
    await this._ref(`rounds/${roundCode}/overrides/${playerId}_${hole}`).set({
      by: Auth.currentUser?.uid,
      at: Date.now(),
      value: gross
    });
  },

  async deleteRound(code) {
    await this._ref(`rounds/${code}`).remove();
  },

  async closeRound(code, summary) {
    await this._ref(`rounds/${code}/status`).set('complete');
    await this._ref(`rounds/${code}/summary`).set(summary);
    await this._ref(`history/${code}`).set({...summary, code, completedAt: Date.now()});
  },

  async getHistory() {
    const snap = await this._ref('history').get();
    if (!snap.exists()) return [];
    return Object.values(snap.val()).sort((a,b) => b.completedAt - a.completedAt);
  },

  async getQuotaRules() {
    const snap = await this._ref('quotaRules').get();
    return snap.exists() ? snap.val() : { upThresh:3, upAmt:1, dnThresh:3, dnAmt:1, maxUp:3, maxDn:2 };
  },

  async saveQuotaRules(rules) {
    await this._ref('quotaRules').set(rules);
  },

  _genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }
};
