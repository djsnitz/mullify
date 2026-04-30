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

  async forgotPassword(email) {
    if (!email) {
      this._showError('Enter your email above then tap Forgot password.');
      return;
    }
    try {
      await firebase.auth().sendPasswordResetEmail(email);
      const el = document.getElementById('auth-error');
      if (el) {
        el.style.display = 'block';
        el.style.background = 'var(--green-light)';
        el.style.color = 'var(--green-dark)';
        el.textContent = 'Password reset email sent! Check your inbox.';
      }
    } catch(e) {
      this._showError(e.message);
    }
  },

  showCreateModal() {
    const modal = document.getElementById('create-account-modal');
    if (modal) { modal.style.display = 'flex'; }
    const err = document.getElementById('create-error');
    if (err) err.style.display = 'none';
    ['create-first','create-last','create-phone','create-ghin','create-email','create-password','create-password-confirm'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const btn = document.getElementById('create-btn');
    if (btn) { btn.textContent = 'Create account'; btn.disabled = false; }
  },

  hideCreateModal() {
    const modal = document.getElementById('create-account-modal');
    if (modal) modal.style.display = 'none';
  },

  async submitCreate() {
    const first    = document.getElementById('create-first')?.value.trim();
    const last     = document.getElementById('create-last')?.value.trim();
    const phone    = document.getElementById('create-phone')?.value.trim();
    const ghin     = document.getElementById('create-ghin')?.value.trim();
    const email    = document.getElementById('create-email')?.value.trim();
    const password = document.getElementById('create-password')?.value;
    const confirm  = document.getElementById('create-password-confirm')?.value;
    const btn      = document.getElementById('create-btn');

    if (!first || !last)       { this._showCreateError('Please enter your first and last name.'); return; }
    if (!email || !password)   { this._showCreateError('Please enter email and password.'); return; }
    if (password.length < 6)   { this._showCreateError('Password must be at least 6 characters.'); return; }
    if (password !== confirm)  { this._showCreateError('Passwords do not match.'); return; }

    btn.textContent = 'Creating account…';
    btn.disabled = true;

    try {
      // Create Firebase auth account
      const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
      const uid  = cred.user.uid;

      // Auto-create player profile in DB
      const hcp   = 18;
      const quota = 18;
      const player = {
        name: first + ' ' + last,
        first, last,
        initials: (first[0] + last[0]).toUpperCase(),
        email, phone: phone||'', ghin: ghin||'',
        hcp, quota,
        tee: 'Blue',
        history: [],
        linkedUid: uid,
        createdAt: Date.now()
      };
      const saved = await DB.savePlayer(player);

      // Link auth profile to player
      const profile = {
        uid, email,
        displayName: first + ' ' + last,
        playerId: saved.id,
        playerName: first + ' ' + last,
        linkedAt: Date.now()
      };
      await DB.saveUserProfile(uid, profile);
      this.playerProfile = profile;

      this.hideCreateModal();
    } catch(e) {
      if (e.code === 'auth/email-already-in-use') {
        this._showCreateError('An account with that email already exists. Sign in instead.');
      } else {
        this._showCreateError(e.message);
      }
      btn.textContent = 'Create account';
      btn.disabled = false;
    }
  },

  _showCreateError(msg) {
    const el = document.getElementById('create-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
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
