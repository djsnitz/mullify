// ── Mullify Auth ── (fixed loading order)
const Auth = {
  currentUser: null,
  playerProfile: null,

  async init() {
    // Firebase is loaded via CDN scripts in index.html — wait for it
    await this._waitForFirebase();
    firebase.initializeApp(FIREBASE_CONFIG);

    firebase.auth().onAuthStateChanged(async user => {
      if (user) {
        this.currentUser = user;
        const profile = await DB.getUserProfile(user.uid);
        if (profile) {
          this.playerProfile = profile;
          App.onAuthReady(true);
        } else {
          App.onAuthReady(false);
        }
      } else {
        this.currentUser = null;
        this.playerProfile = null;
        App.showLogin();
      }
    });
  },

  _waitForFirebase() {
    return new Promise(resolve => {
      const check = () => {
        if (typeof firebase !== 'undefined' && firebase.auth) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  },

  async signInGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await firebase.auth().signInWithPopup(provider);
    } catch(e) {
      this._showError(e.message);
    }
  },

  async signInEmail(email, password) {
    if (!email || !password) { this._showError('Please enter email and password.'); return; }
    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
    } catch(e) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
        try {
          await firebase.auth().createUserWithEmailAndPassword(email, password);
        } catch(e2) { this._showError(e2.message); }
      } else {
        this._showError(e.message);
      }
    }
  },

  async signOut() {
    await firebase.auth().signOut();
    this.playerProfile = null;
    this.currentUser = null;
  },

  async linkToPlayer(playerId, playerName) {
    if (!this.currentUser) return;
    const profile = {
      uid: this.currentUser.uid,
      email: this.currentUser.email || '',
      displayName: this.currentUser.displayName || playerName,
      playerId, playerName,
      linkedAt: Date.now()
    };
    await DB.saveUserProfile(this.currentUser.uid, profile);
    this.playerProfile = profile;
  },

  isAdmin() {
    return this.playerProfile?.isAdmin === true;
  },

  _showError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    console.error('Auth error:', msg);
  }
};
