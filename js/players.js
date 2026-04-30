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
    const isAdmin = Auth.isAdmin();
    if (!this.list.length) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">No players yet</div>
          <div class="empty-sub">Add your golf group members to get started.</div>
        </div>
        <button class="primary-btn" onclick="App.nav('add-player')" style="margin:0 16px;">Add first player</button>`;
      return;
    }
    body.innerHTML = `<div class="card">${this.list.map(p => `
      <div class="player-row" style="flex-wrap:wrap;">
        <div class="avatar">${p.initials}</div>
        <div class="player-info" style="flex:1;">
          <div class="player-name">${p.name} ${p.isAdmin?'<span style="font-size:10px;background:var(--amber-light);color:var(--amber);padding:2px 6px;border-radius:10px;font-weight:500;">Admin</span>':''}</div>
          <div class="player-meta">
            HCP ${p.hcp} · 18H Quota ${p.quota} · 9H Quota ${p.quota9||Math.round((p.quota||18)/2)} · ${p.tee} tee
            ${p.email?' · '+p.email:''} ${p.phone?' · '+p.phone:''} ${p.ghin?' · GHIN: '+p.ghin:''}
          </div>
          <div style="font-size:11px;margin-top:3px;">
            ${p.linkedUid?'<span style="color:var(--green);">✓ Account linked</span>':'<span style="color:var(--text-3);">Not linked yet</span>'}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
          <button class="text-btn" style="font-size:12px;" onclick="Players.showEdit('${p.id}')">Edit</button>
          ${isAdmin?`<button class="text-btn" style="color:var(--red);font-size:12px;" onclick="Players.remove('${p.id}')">Remove</button>`:''}
          ${isAdmin&&!p.isAdmin?`<button class="text-btn" style="font-size:11px;color:var(--amber);" onclick="Players.makeAdmin('${p.id}')">Make admin</button>`:''}
          ${isAdmin&&p.isAdmin&&p.linkedUid!==Auth.currentUser?.uid?`<button class="text-btn" style="font-size:11px;color:var(--text-2);" onclick="Players.removeAdmin('${p.id}')">Remove admin</button>`:''}
        </div>
      </div>`).join('')}</div>
      <div class="note" style="margin-top:12px;">✓ linked = player has signed in and claimed their profile.</div>`;
  },

  showEdit(id) {
    const p = this.list.find(x=>x.id===id);
    if (!p) return;
    const isAdmin = Auth.isAdmin();
    const isMe = p.linkedUid === Auth.currentUser?.uid;
    if (!isAdmin && !isMe) { alert('You can only edit your own profile.'); return; }
    let modal = document.getElementById('edit-player-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'edit-player-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto;';
      document.body.appendChild(modal);
    }
    const quota9 = p.quota9 || Math.round((p.quota||18)/2);
    modal.innerHTML = `
      <div style="background:white;border-radius:20px;padding:24px;width:100%;max-width:360px;margin:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div style="font-size:17px;font-weight:600;">Edit player</div>
          <button onclick="Players.closeEdit()" style="background:none;border:none;font-size:24px;color:var(--text-2);cursor:pointer;">×</button>
        </div>
        <form onsubmit="return false;">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;">
          <div class="form-group" style="margin-bottom:0;"><label class="form-label">First name</label><input class="form-input" type="text" id="edit-first" value="${p.first||''}" /></div>
          <div class="form-group" style="margin-bottom:0;"><label class="form-label">Last name</label><input class="form-input" type="text" id="edit-last" value="${p.last||''}" /></div>
        </div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="edit-email" value="${p.email||''}" /></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" type="tel" id="edit-phone" value="${p.phone||''}" /></div>
        <div class="form-group"><label class="form-label">GHIN number</label><input class="form-input" type="text" id="edit-ghin" value="${p.ghin||''}" /></div>
        <div class="form-group"><label class="form-label">Handicap index</label><input class="form-input" type="number" id="edit-hcp" value="${p.hcp||18}" step="0.1" min="0" max="54" /></div>
        ${isAdmin ? `
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">18H Quota <span style="font-size:10px;color:var(--amber);background:var(--amber-light);padding:2px 5px;border-radius:8px;">Admin</span></label>
            <input class="form-input" type="number" id="edit-quota" value="${p.quota||18}" step="1" min="0" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">9H Quota <span style="font-size:10px;color:var(--amber);background:var(--amber-light);padding:2px 5px;border-radius:8px;">Admin</span></label>
            <input class="form-input" type="number" id="edit-quota9" value="${quota9}" step="1" min="0" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Preferred tee <span style="font-size:10px;color:var(--amber);background:var(--amber-light);padding:2px 5px;border-radius:8px;">Admin</span></label>
          <div class="tee-row" id="edit-tee-row">
            ${['Black','Gold','Blue','White','Red'].map(t=>`<button type="button" class="tee-btn${p.tee===t?' tee-active-'+t.toLowerCase():''}" data-tee="${t}" onclick="Players.editSelectTee(this)">${t}</button>`).join('')}
          </div>
        </div>` : `
        <div class="form-group"><label class="form-label">18H Quota</label><div class="form-input" style="background:var(--bg-2);color:var(--text-2);">${p.quota} <span style="font-size:11px;">(set by admin)</span></div></div>
        <div class="form-group"><label class="form-label">9H Quota</label><div class="form-input" style="background:var(--bg-2);color:var(--text-2);">${quota9} <span style="font-size:11px;">(set by admin)</span></div></div>`}
        <button class="primary-btn" onclick="Players.saveEdit('${p.id}')">Save changes</button>
        <button type="button" onclick="Players.closeEdit()" style="width:100%;padding:11px;border-radius:var(--radius-sm);border:0.5px solid var(--border-2);background:none;font-size:13px;cursor:pointer;margin-top:8px;">Cancel</button>
        </form>
      </div>`;
    modal.style.display = 'flex';
    this._editTee = p.tee || 'Blue';
  },

  _editTee: 'Blue',
  editSelectTee(btn) {
    document.querySelectorAll('#edit-tee-row .tee-btn').forEach(b=>b.className='tee-btn');
    this._editTee = btn.dataset.tee;
    btn.classList.add('tee-active-'+btn.dataset.tee.toLowerCase());
  },

  async saveEdit(id) {
    const p = this.list.find(x=>x.id===id);
    const isAdmin = Auth.isAdmin();
    const updates = {
      first: document.getElementById('edit-first')?.value.trim()||p.first,
      last:  document.getElementById('edit-last')?.value.trim()||p.last,
      email: document.getElementById('edit-email')?.value.trim()||'',
      phone: document.getElementById('edit-phone')?.value.trim()||'',
      ghin:  document.getElementById('edit-ghin')?.value.trim()||'',
      hcp:   parseFloat(document.getElementById('edit-hcp')?.value)||p.hcp,
    };
    updates.name = updates.first + ' ' + updates.last;
    updates.initials = (updates.first[0]+updates.last[0]).toUpperCase();
    if (isAdmin) {
      updates.quota  = parseInt(document.getElementById('edit-quota')?.value)||p.quota;
      updates.quota9 = parseInt(document.getElementById('edit-quota9')?.value)||Math.round(updates.quota/2);
      updates.tee    = this._editTee;
    }
    await DB.updatePlayer(id, updates);
    this.closeEdit();
    await this.load();
  },

  closeEdit() { const m=document.getElementById('edit-player-modal'); if(m) m.style.display='none'; },

  async makeAdmin(id) {
    if (!confirm('Make this player an admin?')) return;
    await DB.updatePlayer(id,{isAdmin:true});
    const p=this.list.find(x=>x.id===id);
    if (p?.linkedUid) await DB.setAdmin(p.linkedUid);
    await this.load();
  },

  async removeAdmin(id) {
    if (!confirm('Remove admin access?')) return;
    await DB.updatePlayer(id,{isAdmin:false});
    const p=this.list.find(x=>x.id===id);
    if (p?.linkedUid) await DB.removeAdmin(p.linkedUid);
    await this.load();
  },

  updatePreview() {
    const f=document.getElementById('add-first').value.trim();
    const l=document.getElementById('add-last').value.trim();
    document.getElementById('add-avatar-preview').textContent=(f[0]||'')+(l[0]||'')||'?';
    document.getElementById('add-player-btn').disabled=!(f&&l);
  },

  selectTee(btn) {
    document.querySelectorAll('#add-tee-row .tee-btn').forEach(b=>b.className='tee-btn');
    this.selectedTee=btn.dataset.tee;
    btn.classList.add('tee-active-'+btn.dataset.tee.toLowerCase());
  },

  async lookupGHIN() {
    const num=document.getElementById('add-ghin').value.trim();
    if (!num) return;
    const el=document.getElementById('ghin-result');
    el.style.display='block'; el.textContent='Looking up…';
    setTimeout(()=>{
      const mockHcp=(Math.random()*28).toFixed(1);
      el.textContent=`GHIN ${num} · Handicap Index: ${mockHcp}`;
      document.getElementById('add-hcp').value=mockHcp;
    },1000);
  },

  async save() {
    const first=document.getElementById('add-first').value.trim();
    const last=document.getElementById('add-last').value.trim();
    const email=document.getElementById('add-email').value.trim();
    const phone=document.getElementById('add-phone').value.trim();
    const ghin=document.getElementById('add-ghin').value.trim();
    const hcp=parseFloat(document.getElementById('add-hcp').value)||18;
    const quotaInput=document.getElementById('add-quota').value;
    const quota9Input=document.getElementById('add-quota9').value;
    const quota=quotaInput?parseInt(quotaInput):Math.round(36-Math.round(hcp));
    const quota9=quota9Input?parseInt(quota9Input):Math.round(quota/2);
    const btn=document.getElementById('add-player-btn');
    btn.textContent='Saving…'; btn.disabled=true;
    const player={
      name:first+' '+last, first, last,
      initials:(first[0]+last[0]).toUpperCase(),
      email, phone, ghin, hcp, quota, quota9,
      tee:this.selectedTee,
      history:[], linkedUid:null, isAdmin:false, createdAt:Date.now()
    };
    try {
      await DB.savePlayer(player);
      App.back();
      await this.load();
    } catch(e) {
      alert('Error saving player: '+e.message);
      btn.textContent='Add to group'; btn.disabled=false;
    }
  },

  async remove(id) {
    if (!confirm('Remove this player from the group?')) return;
    await DB.deletePlayer(id);
    await this.load();
  },

  resetForm() {
    ['add-first','add-last','add-email','add-phone','add-ghin','add-hcp','add-quota','add-quota9'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
    const av=document.getElementById('add-avatar-preview'); if(av) av.textContent='?';
    const btn=document.getElementById('add-player-btn'); if(btn) btn.disabled=true;
    const gr=document.getElementById('ghin-result'); if(gr) gr.style.display='none';
    this.selectedTee='Blue';
    document.querySelectorAll('#add-tee-row .tee-btn').forEach(b=>b.className='tee-btn');
    const blueBtn=document.querySelector('#add-tee-row [data-tee="Blue"]');
    if(blueBtn) blueBtn.classList.add('tee-active-blue');
  }
};
