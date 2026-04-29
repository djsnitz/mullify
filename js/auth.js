// ── Mullify Auth ──
const Auth = {
  currentUser: null,
  playerProfile: null,

  async init() {
    await this._waitForFirebase();
    // Initialize Firebase app first
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    // Initialize DB immediately after Firebase app
    DB.init();

    firebase.auth().onAuthStateChanged(async user => {
      if (user) {
        this.currentUser = user;
        try {
          const profile = await DB.getUserProfile(user.uid);
          if (profile) {
            this.playerProfile = profile;
            App.onAuthReady(true);
          } else {
            App.onAuthReady(false);
          }
        } catch(e) {
          console.error('Profile fetch error:', e);
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
    const el = document.getElementById('auth-error');
    if (el) el.style.display = 'none';
    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
    } catch(e) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/invalid-login-credentials') {
        this._showError('No account found with that email. Use "Create new account" to sign up.');
      } else if (e.code === 'auth/wrong-password') {
        this._showError('Incorrect password. Please try again.');
      } else {
        this._showError(e.message);
      }
    }
  },

  async createEmail(email, password) {
    if (!email || !password) { this._showError('Please enter email and password.'); return; }
    if (password.length < 6) { this._showError('Password must be at least 6 characters.'); return; }
    const el = document.getElementById('auth-error');
    if (el) el.style.display = 'none';
    try {
      await firebase.auth().createUserWithEmailAndPassword(email, password);
    } catch(e) {
      if (e.code === 'auth/email-already-in-use') {
        this._showError('An account with that email already exists. Use "Sign in" instead.');
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
