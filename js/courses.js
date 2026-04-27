// ── Courses ──
const Courses = {
  previewCourse: null,
  previewTee: null,
  downloading: false,

  render() {
    const body = document.getElementById('courses-body');
    const saved = Store.getCourses();
    let html = '';
    if (saved.length) {
      html += `<div class="section-label">Downloaded courses</div>`;
      html += saved.map(c => this._courseCard(c, true)).join('');
    }
    html += `<div class="section-label" style="margin-top:${saved.length?'20px':'0'};">Search for a course above</div>`;
    html += `<div class="note">Type a course name or city and tap Search. Downloaded courses work offline — no signal needed on the course.</div>`;
    body.innerHTML = html;
  },

  _courseCard(c, saved) {
    const teeKeys = Object.keys(c.tees);
    const chips = teeKeys.map(t => {
      const cls = t === 'Black' ? 'tc-black' : t === 'Blue' ? 'tc-blue' : t === 'White' ? 'tc-white' : t === 'Red' ? 'tc-red' : 'tc-gold';
      return `<span class="tee-chip ${cls}">${t} ${c.tees[t].rating}/${c.tees[t].slope}</span>`;
    }).join('');
    return `<div class="course-card${saved?' saved':''}" onclick="Courses.openPreview('${c.id}')">
      <div class="flex-between">
        <div><div class="course-card-name">${c.name}</div><div class="course-card-loc">${c.location}</div></div>
        ${saved ? '<span class="saved-chip">Saved</span>' : ''}
      </div>
      <div class="course-card-meta">
        <span class="meta-chip">Par <strong>${c.par}</strong></span>
        <span class="meta-chip">Holes <strong>${c.holes}</strong></span>
      </div>
      <div class="tee-chips">${chips}</div>
    </div>`;
  },

  search() {
    const q = document.getElementById('course-search-input').value.trim().toLowerCase();
    const body = document.getElementById('courses-body');
    const saved = Store.getCourses();
    const results = SAMPLE_COURSES.filter(c =>
      c.name.toLowerCase().includes(q) || c.location.toLowerCase().includes(q)
    );
    let html = `<div class="section-label">Results for "${q}"</div>`;
    if (!results.length) {
      html += `<div class="note">No courses found. Try a different name or city.</div>`;
    } else {
      html += results.map(c => {
        const isSaved = saved.find(s => s.id === c.id);
        return this._courseCard(c, !!isSaved);
      }).join('');
    }
    if (saved.length) {
      html += `<div class="section-label" style="margin-top:20px;">Your saved courses</div>`;
      html += saved.map(c => this._courseCard(c, true)).join('');
    }
    body.innerHTML = html;
  },

  openPreview(id) {
    const saved = Store.getCourses().find(c => c.id === id);
    const course = saved || SAMPLE_COURSES.find(c => c.id === id);
    if (!course) return;
    this.previewCourse = course;
    const teeKeys = Object.keys(course.tees);
    this.previewTee = teeKeys[Math.min(1, teeKeys.length - 1)];
    document.getElementById('preview-course-name').textContent = course.name;
    document.getElementById('preview-course-loc').textContent = course.location;
    this._buildTeeBar(teeKeys);
    this._buildRating();
    this._buildScorecard();
    const dlBtn = document.getElementById('preview-dl-btn');
    const alreadySaved = !!Store.getCourses().find(c => c.id === id);
    dlBtn.textContent = alreadySaved ? 'Already saved ✓' : 'Download for offline use';
    dlBtn.disabled = alreadySaved;
    document.getElementById('dl-bar-wrap').style.display = 'none';
    App.nav('course-preview');
  },

  _buildTeeBar(teeKeys) {
    const bar = document.getElementById('preview-tee-bar');
    bar.innerHTML = teeKeys.map(t => {
      const cls = t === this.previewTee ? 'tee-sel-btn tee-active-' + t.toLowerCase() : 'tee-sel-btn';
      return `<button class="${cls}" onclick="Courses.selectTee('${t}')">${t}</button>`;
    }).join('');
  },

  selectTee(tee) {
    this.previewTee = tee;
    const teeKeys = Object.keys(this.previewCourse.tees);
    this._buildTeeBar(teeKeys);
    this._buildRating();
    this._buildScorecard();
  },

  _buildRating() {
    const t = this.previewCourse.tees[this.previewTee];
    const totalYds = t.yds.reduce((a, b) => a + b, 0);
    const f9 = t.yds.slice(0, 9).reduce((a, b) => a + b, 0);
    const b9 = t.yds.slice(9).reduce((a, b) => a + b, 0);
    document.getElementById('preview-rating-strip').innerHTML = `
      <div class="rating-item"><div class="rating-lbl">Rating</div><div class="rating-val">${t.rating}</div></div>
      <div class="rating-item"><div class="rating-lbl">Slope</div><div class="rating-val">${t.slope}</div></div>
      <div class="rating-item"><div class="rating-lbl">Yards</div><div class="rating-val">${totalYds.toLocaleString()}</div></div>
      <div class="rating-item"><div class="rating-lbl">F9/B9</div><div class="rating-val" style="font-size:13px;">${f9}/${b9}</div></div>`;
  },

  _buildScorecard() {
    const t = this.previewCourse.tees[this.previewTee];
    const tbl = document.getElementById('preview-scorecard');
    const mkRows = (holes, label) => {
      const totalPar = holes.reduce((a, i) => a + t.par[i], 0);
      const totalYds = holes.reduce((a, i) => a + t.yds[i], 0);
      return `
        <tr><th>Hole</th>${holes.map(i => `<th>${i+1}</th>`).join('')}<th>${label}</th></tr>
        <tr><td>Yds</td>${holes.map(i => `<td>${t.yds[i]}</td>`).join('')}<td>${totalYds}</td></tr>
        <tr><td>Par</td>${holes.map(i => `<td class="${t.par[i]===3?'par3':t.par[i]===5?'par5':''}">${t.par[i]}</td>`).join('')}<td>${totalPar}</td></tr>
        <tr><td>Hcp</td>${holes.map(i => `<td>${t.hcp[i]}</td>`).join('')}<td>—</td></tr>`;
    };
    const front = Array.from({length:9},(_,i)=>i);
    const back  = Array.from({length:9},(_,i)=>i+9);
    tbl.innerHTML = `<thead>${mkRows(front,'Out')}</thead><tbody>${mkRows(back,'In')}<tr><td>Total</td><td colspan="9" style="text-align:center;font-size:11px;color:var(--text-2);">${t.yds.reduce((a,b)=>a+b,0)} yds</td><td>${t.par.reduce((a,b)=>a+b,0)}</td></tr></tbody>`;
  },

  download() {
    if (this.downloading) return;
    this.downloading = true;
    const wrap = document.getElementById('dl-bar-wrap');
    const fill = document.getElementById('dl-bar-fill');
    const btn = document.getElementById('preview-dl-btn');
    wrap.style.display = 'block';
    btn.disabled = true;
    btn.textContent = 'Downloading…';
    let pct = 0;
    const iv = setInterval(() => {
      pct = Math.min(100, pct + Math.round(Math.random() * 18 + 8));
      fill.style.width = pct + '%';
      if (pct >= 100) {
        clearInterval(iv);
        Store.addCourse(this.previewCourse);
        btn.textContent = 'Saved ✓';
        this.downloading = false;
        document.querySelector('.offline-note').textContent = 'Saved — works offline on the course';
      }
    }, 150);
  }
};
