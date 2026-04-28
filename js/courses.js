// ── Courses (Golf Course API via Vercel serverless proxy) ──
const GOLF_API_BASE = '/api/courses';

const Courses = {
  previewCourse: null,
  previewTee: null,
  list: [],
  downloading: false,

  async load() {
    try {
      this.list = await DB.getCourses();
      Store.cacheCourses(this.list);
    } catch {
      this.list = Store.getCourses();
    }
    this.render();
  },

  render() {
    const body = document.getElementById('courses-body');
    if (!body) return;
    let html = '';
    if (this.list.length) {
      html += `<div class="section-label">Saved courses (${this.list.length})</div>`;
      html += this.list.map(c => this._courseCard(c, true)).join('');
    } else {
      html += `<div class="note">Search for any course by name. Downloaded courses work fully offline on the course.</div>`;
    }
    body.innerHTML = html;
  },

  _courseCard(c, saved) {
    const teeKeys = Object.keys(c.tees || {});
    const chips = teeKeys.map(t => {
      const cls = t==='Black'?'tc-black':t==='Blue'?'tc-blue':t==='White'?'tc-white':t==='Red'?'tc-red':'tc-gold';
      const td = c.tees[t];
      return `<span class="tee-chip ${cls}">${t}${td&&td.rating?' '+td.rating+'/'+td.slope:''}</span>`;
    }).join('');
    return `<div class="course-card${saved?' saved':''}" onclick="Courses.openPreview('${c.id}')">
      <div class="flex-between">
        <div><div class="course-card-name">${c.name}</div><div class="course-card-loc">${c.location||''}</div></div>
        ${saved?'<span class="saved-chip">Saved ✓</span>':'<span style="font-size:12px;color:var(--green);">Preview ›</span>'}
      </div>
      <div class="course-card-meta"><span class="meta-chip">Par <strong>${c.par||72}</strong></span><span class="meta-chip">18 holes</span></div>
      <div class="tee-chips">${chips}</div>
    </div>`;
  },

  async search() {
    const q = document.getElementById('course-search-input').value.trim();
    if (!q) return;
    const body = document.getElementById('courses-body');
    body.innerHTML = `<div class="empty-state"><div class="empty-title">Searching…</div><div class="empty-sub">${q}</div></div>`;
    try {
      const res = await fetch(`${GOLF_API_BASE}/search?search_query=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const courses = data.courses || [];

      if (!courses.length) {
        body.innerHTML = `<div class="note">No courses found for "${q}". Try searching by course name only (e.g. "Twin Creeks" not "Allen TX").</div>`;
        this._appendSaved(body);
        return;
      }

      let html = `<div class="section-label">${courses.length} results for "${q}"</div>`;
      html += courses.slice(0, 25).map(c => {
        const id = c.id + '';
        const name = c.club_name || c.course_name || 'Unknown';
        const loc = [c.location?.city, c.location?.state, c.location?.country].filter(Boolean).join(', ');
        const saved = !!this.list.find(s => s.sourceId === id);
        // Normalize the course right from search results — no second API call needed
        const normalized = this._normalizeAPIResponse(c);
        const teeKeys = Object.keys(normalized.tees);
        const chips = teeKeys.map(t => {
          const cls = t==='Black'?'tc-black':t==='Blue'?'tc-blue':t==='White'?'tc-white':t==='Red'?'tc-red':'tc-gold';
          return `<span class="tee-chip ${cls}">${t} ${normalized.tees[t].rating}/${normalized.tees[t].slope}</span>`;
        }).join('');
        return `<div class="course-card${saved?' saved':''}" onclick="Courses.openFromData(${c.id})">
          <div class="flex-between">
            <div><div class="course-card-name">${name}</div><div class="course-card-loc">${loc}</div></div>
            ${saved?'<span class="saved-chip">Saved ✓</span>':'<span style="font-size:12px;color:var(--green);">Preview ›</span>'}
          </div>
          <div class="course-card-meta">
            <span class="meta-chip">Par <strong>${normalized.par}</strong></span>
            <span class="meta-chip">${teeKeys.length} tee${teeKeys.length!==1?'s':''}</span>
          </div>
          <div class="tee-chips">${chips}</div>
        </div>`;
      }).join('');
      body.innerHTML = html;
      this._appendSaved(body);
      // Cache search results for preview
      this._searchCache = {};
      courses.forEach(c => { this._searchCache[c.id] = c; });

    } catch(e) {
      console.error('Search error:', e);
      const qL = q.toLowerCase();
      const fb = SAMPLE_COURSES.filter(c => c.name.toLowerCase().includes(qL) || c.location.toLowerCase().includes(qL));
      body.innerHTML = `<div class="note amber">Search unavailable. Showing offline results.</div>` +
        (fb.length ? fb.map(c => this._courseCard(c, !!this.list.find(s=>s.id===c.id))).join('') : `<div class="note">No offline results for "${q}".</div>`);
      this._appendSaved(body);
    }
  },

  _appendSaved(body) {
    if (!this.list.length) return;
    const div = document.createElement('div');
    div.innerHTML = `<div class="section-label" style="margin-top:20px;">Your saved courses</div>${this.list.map(c=>this._courseCard(c,true)).join('')}`;
    body.appendChild(div);
  },

  // Open from cached search result — no second API call needed
  openFromData(apiId) {
    const saved = this.list.find(c => c.sourceId === apiId+'');
    if (saved) { this.openPreview(saved.id); return; }
    const raw = this._searchCache?.[apiId];
    if (!raw) { this.search(); return; }
    const course = this._normalizeAPIResponse(raw);
    this.previewCourse = course;
    this._showPreview(course);
  },

  // Normalize API response to our internal format
  _normalizeAPIResponse(data) {
    const tees = {};
    // API has male and female tees — we use male tees primarily
    const maleTees   = data.tees?.male   || [];
    const femaleTees = data.tees?.female || [];
    const allTees    = maleTees.length ? maleTees : femaleTees;

    allTees.forEach(t => {
      const color = this._teeColor(t.tee_name || 'Blue');
      const holes  = t.holes || [];
      if (!holes.length) return;
      tees[color] = {
        rating: parseFloat(t.course_rating || 72),
        slope:  parseInt(t.slope_rating   || 113),
        yds: holes.map(h => parseInt(h.yardage || 0)),
        par: holes.map(h => parseInt(h.par    || 4)),
        hcp: holes.map(h => parseInt(h.handicap || 1))
      };
    });

    if (!Object.keys(tees).length) tees['Blue'] = this._genericTee(72, 113);

    const firstTee = Object.values(tees)[0];
    const totalPar = firstTee.par.reduce((a,b)=>a+b, 0);
    const loc = [data.location?.city, data.location?.state].filter(Boolean).join(', ') || data.location?.address || '';

    return {
      id: 'api-' + data.id,
      sourceId: data.id + '',
      name: data.club_name || data.course_name || 'Unknown Course',
      location: loc,
      par: totalPar,
      holes: 18,
      tees
    };
  },

  _teeColor(raw) {
    const r = (raw || '').toUpperCase();
    if (r.includes('BLACK') || r.includes('TOURNAMENT')) return 'Black';
    if (r.includes('GOLD')  || r.includes('MASTER'))     return 'Gold';
    if (r.includes('BLUE')  || r.includes('CHAMPION'))   return 'Blue';
    if (r.includes('WHITE') || r.includes('MEMBER'))     return 'White';
    if (r.includes('RED')   || r.includes('FORWARD'))    return 'Red';
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  },

  _genericTee(rating, slope) {
    return { rating, slope,
      par: [4,4,3,5,4,4,5,3,4,4,4,3,5,4,4,5,3,4],
      yds: [380,370,175,520,395,385,510,165,420,400,390,185,530,385,375,515,160,415],
      hcp: [7,11,17,3,9,13,1,15,5,6,12,18,2,8,14,4,16,10]
    };
  },

  openPreview(id) {
    const course = this.list.find(c=>c.id===id) || SAMPLE_COURSES.find(c=>c.id===id);
    if (!course) return;
    this.previewCourse = course;
    this._showPreview(course);
  },

  _showPreview(course) {
    document.getElementById('preview-course-name').textContent = course.name;
    document.getElementById('preview-course-loc').textContent = course.location || '';
    const teeKeys = Object.keys(course.tees || {});
    this.previewTee = teeKeys[Math.min(1, teeKeys.length-1)] || teeKeys[0];
    this._buildTeeBar(teeKeys);
    this._buildRating();
    this._buildScorecard();
    const alreadySaved = !!this.list.find(c => c.id===course.id || c.sourceId===course.sourceId);
    const dlBtn = document.getElementById('preview-dl-btn');
    dlBtn.textContent = alreadySaved ? 'Already saved ✓' : 'Download for offline use';
    dlBtn.disabled = alreadySaved;
    document.getElementById('dl-bar-wrap').style.display = 'none';
    document.querySelector('.offline-note').textContent = 'Works without cell signal on the course';
    App.nav('course-preview');
  },

  _buildTeeBar(teeKeys) {
    document.getElementById('preview-tee-bar').innerHTML = teeKeys.map(t =>
      `<button class="tee-sel-btn${t===this.previewTee?' tee-active-'+t.toLowerCase():''}" onclick="Courses.selectTee('${t}')">${t}</button>`
    ).join('');
  },

  selectTee(tee) {
    this.previewTee = tee;
    this._buildTeeBar(Object.keys(this.previewCourse.tees));
    this._buildRating();
    this._buildScorecard();
  },

  _buildRating() {
    const t = this.previewCourse.tees[this.previewTee];
    if (!t) return;
    const totalYds = (t.yds||[]).reduce((a,b)=>a+b,0);
    const f9 = (t.yds||[]).slice(0,9).reduce((a,b)=>a+b,0);
    const b9 = (t.yds||[]).slice(9).reduce((a,b)=>a+b,0);
    document.getElementById('preview-rating-strip').innerHTML = `
      <div class="rating-item"><div class="rating-lbl">Rating</div><div class="rating-val">${t.rating||'—'}</div></div>
      <div class="rating-item"><div class="rating-lbl">Slope</div><div class="rating-val">${t.slope||'—'}</div></div>
      <div class="rating-item"><div class="rating-lbl">Yards</div><div class="rating-val">${totalYds.toLocaleString()}</div></div>
      <div class="rating-item"><div class="rating-lbl">F9/B9</div><div class="rating-val" style="font-size:13px;">${f9}/${b9}</div></div>`;
  },

  _buildScorecard() {
    const t = this.previewCourse.tees[this.previewTee];
    if (!t||!t.par) { document.getElementById('preview-scorecard').innerHTML='<tr><td colspan="10" style="padding:20px;text-align:center;color:var(--text-2);">Scorecard loading…</td></tr>'; return; }
    const mkRows = (holes, label) => {
      const tp = holes.reduce((a,i)=>a+(t.par[i]||4),0);
      const ty = holes.reduce((a,i)=>a+(t.yds?.[i]||0),0);
      return `<tr><th>Hole</th>${holes.map(i=>`<th>${i+1}</th>`).join('')}<th>${label}</th></tr>
        <tr><td>Yds</td>${holes.map(i=>`<td>${t.yds?.[i]||'—'}</td>`).join('')}<td>${ty}</td></tr>
        <tr><td>Par</td>${holes.map(i=>`<td class="${t.par[i]===3?'par3':t.par[i]===5?'par5':''}">${t.par[i]||4}</td>`).join('')}<td>${tp}</td></tr>
        <tr><td>Hcp</td>${holes.map(i=>`<td>${t.hcp?.[i]||'—'}</td>`).join('')}<td>—</td></tr>`;
    };
    const front=Array.from({length:9},(_,i)=>i);
    const back=Array.from({length:9},(_,i)=>i+9);
    document.getElementById('preview-scorecard').innerHTML=
      `<thead>${mkRows(front,'Out')}</thead><tbody>${mkRows(back,'In')}<tr><td>Total</td><td colspan="9" style="text-align:center;font-size:11px;color:var(--text-2);">${(t.yds||[]).reduce((a,b)=>a+b,0)} yds</td><td>${(t.par||[]).reduce((a,b)=>a+b,0)}</td></tr></tbody>`;
  },

  async download() {
    if (this.downloading) return;
    this.downloading = true;
    const wrap=document.getElementById('dl-bar-wrap');
    const fill=document.getElementById('dl-bar-fill');
    const btn=document.getElementById('preview-dl-btn');
    wrap.style.display='block'; btn.disabled=true; btn.textContent='Saving…';
    let pct=0;
    const iv=setInterval(async()=>{
      pct=Math.min(100,pct+Math.round(Math.random()*18+8));
      fill.style.width=pct+'%';
      if(pct>=100){
        clearInterval(iv);
        await DB.saveCourse(this.previewCourse);
        await this.load();
        btn.textContent='Saved ✓';
        this.downloading=false;
        document.querySelector('.offline-note').textContent='Saved — works offline on the course';
      }
    },120);
  }
};
