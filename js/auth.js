// ── Mullify Auth ──
const Auth = {
  firebase: null,
  auth: null,
  currentUser: null,
  playerProfile: null,

  async init() {
    // Load Firebase from CDN
    await this._loadScripts();
    this.firebase = firebase;
    this.auth = firebase.auth();

    // Auth state listener
    this.auth.onAuthStateChanged(async user => {
      if (user) {
        this.currentUser = user;
        // Check if user has a linked player profile
        const profile = await DB.getUserProfile(user.uid);
        if (profile) {
          this.playerProfile = profile;
          App.onAuthReady(true);
        } else {
          // New user — need to claim a player profile
          App.onAuthReady(false);
        }
      } else {
        this.currentUser = null;
        this.playerProfile = null;
        App.showLogin();
      }
    });
  },

  _loadScripts() {
    return new Promise((resolve) => {
      if (typeof firebase !== 'undefined') { resolve(); return; }
      const scripts = [
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
      ];
      let loaded = 0;
      scripts.forEach(src => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => { if (++loaded === scripts.length) { firebase.initializeApp(FIREBASE_CONFIG); resolve(); } };
        document.head.appendChild(s);
      });
    });
  },

  async signInGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await this.auth.signInWithPopup(provider);
    } catch (e) {
      this._showError(e.message);
    }
  },

  async signInEmail(email, password) {
    try {
      await this.auth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      // Try creating account if not found
      if (e.code === 'auth/user-not-found') {
        try {
          await this.auth.createUserWithEmailAndPassword(email, password);
        } catch (e2) { this._showError(e2.message); }
      } else {
        this._showError(e.message);
      }
    }
  },

  async signOut() {
    await this.auth.signOut();
    this.playerProfile = null;
  },

  async linkToPlayer(playerId, playerName) {
    if (!this.currentUser) return;
    const profile = {
      uid: this.currentUser.uid,
      email: this.currentUser.email,
      displayName: this.currentUser.displayName || playerName,
      playerId,
      playerName,
      linkedAt: Date.now()
    };
    await DB.saveUserProfile(this.currentUser.uid, profile);
    this.playerProfile = profile;
  },

  isAdmin() {
    // First user or users marked as admin in DB
    return this.playerProfile?.isAdmin === true;
  },

  _showError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
};
