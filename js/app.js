/* Singh family vanshavali — tree engine.
   Data lives in data/family.json; this file only lays it out and animates it. */
(async function () {
  const data = await fetch('data/family.json').then(r => r.json());

  const STR = {
    hi: {
      origin: data.meta.origin_hi, source: `${data.meta.source_hi} · ${data.meta.year}`,
      search: 'नाम खोजें…', fit: 'पूरा वृक्ष', expand: 'सब खोलें', collapse: 'सब समेटें',
      tree: 'वृक्ष', list: 'सूची', original: 'मूल चार्ट', all: 'सभी शाखाएँ',
      hint: 'खींचकर घुमाएँ · चुटकी से ज़ूम · नाम पर टैप करें', gen: 'पीढ़ी', father: 'पिता', children: 'संतान',
      lineage: 'वंश-क्रम', members: 'पुत्र', none: 'कोई अभिलेख नहीं', uncertain: 'अस्पष्ट / अनुमानित',
      childless: 'नावल्द · निःसंतान', lineEnded: 'वंश समाप्त', confirm: 'पुष्टि अपेक्षित',
      matches: n => `${n} मिले`, branch: 'शाखा',
      timeline: 'समय-रेखा', era: 'उस समय का भारत', bornAbout: 'जन्म लगभग', active: 'दौर',
      inGen: 'इस पीढ़ी में', more: 'पूरी समय-रेखा देखें', estimated: 'अनुमानित',
    },
    en: {
      origin: data.meta.origin_en, source: `${data.meta.source_en} · ${data.meta.year}`,
      search: 'Search a name…', fit: 'Fit tree', expand: 'Expand all', collapse: 'Collapse all',
      tree: 'Tree', list: 'List', original: 'Original chart', all: 'All branches',
      hint: 'Drag to pan · pinch to zoom · tap a name', gen: 'Generation', father: 'Father', children: 'Children',
      lineage: 'Lineage', members: 'Sons', none: 'No record', uncertain: 'Unclear / inferred',
      childless: 'Without issue', lineEnded: 'Line ended', confirm: 'Needs confirmation',
      matches: n => `${n} found`, branch: 'Branch',
      timeline: 'Timeline', era: 'India in their time', bornAbout: 'born c.', active: 'active',
      inGen: 'In this generation', more: 'See the full timeline', estimated: 'estimated',
    },
  };
  const eraOf = gen => data.eras.find(e => e.gen === gen);

  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const byId = new Map(data.people.map(p => [p.id, p]));
  const color = b => data.branches[b].color;

  const state = {
    lang: localStorage.getItem('vanshavali.lang') || 'hi',
    branch: null, selected: null, query: '', view: 'tree',
    collapsed: new Set(), first: true,
  };

  // ---------- DOM ----------
  const $ = s => document.querySelector(s);
  const viewport = $('#viewport'), world = $('#world'), nodesEl = $('#nodes');
  const svg = d3.select('#links'), edgesG = svg.select('.edges'), bandsG = svg.select('.bands');
  const panel = $('#panel'), panelBody = $('#panelBody'), listview = $('#listview'), timeline = $('#timeline');

  // ---------- i18n ----------
  function t(k) { return STR[state.lang][k]; }
  function applyLang() {
    document.body.classList.toggle('lang-en', state.lang === 'en');
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
    document.querySelectorAll('[data-i18n-title]').forEach(el => el.title = t(el.dataset.i18nTitle));
    $('#search').placeholder = t('search');
    document.querySelectorAll('#langToggle .seg').forEach(b => b.classList.toggle('active', b.dataset.lang === state.lang));
    renderBranchNav(); renderLegend();
    if (state.selected) showPanel(state.selected);
    refreshView();
  }
  // re-render whichever non-tree view is showing (after a language or branch change)
  function refreshView() {
    if (state.view === 'list') renderList();
    if (state.view === 'timeline') renderTimeline();
  }

  function renderBranchNav() {
    const nav = $('#branchNav'); nav.innerHTML = '';
    const mk = (key, label, short, c) => {
      const b = document.createElement('button');
      b.className = 'branch-chip' + (key ? '' : ' all') + ((state.branch || null) === key ? ' active' : '');
      b.style.setProperty('--c', c);
      b.innerHTML = `<span class="long">${esc(label)}</span><span class="short">${esc(short)}</span>`;
      b.onclick = () => { state.branch = key; renderBranchNav(); update(); refreshView(); setTimeout(fit, 50); };
      nav.appendChild(b);
    };
    mk(null, t('all'), t('all'), '#5B5A6B');
    for (const k of ['bochaha', 'bamaura', 'third', 'sahitgarhi']) {
      const br = data.branches[k];
      const shortHi = br.hi.replace(' शाखा', '').replace(' (मुख्य)', ''), shortEn = br.en.replace(' (main)', '').replace(' branch', '');
      mk(k, state.lang === 'hi' ? `${br.hi} · ${br.en}` : `${br.en} · ${br.hi}`, state.lang === 'hi' ? shortHi : shortEn, br.color);
    }
  }
  function renderLegend() {
    const L = data.legend, l = state.lang;
    $('#legend').innerHTML = `
      <span><i class="swatch"></i>${L['clear_' + l]}</span>
      <span><i class="swatch dashed"></i>${L['uncertain_' + l]}</span>
      <span><i class="swatch confirm"></i>${L['confirm_' + l]}</span>
      <span>${L['childless_' + l]}</span>`;
  }

  // ---------- hierarchy ----------
  function buildRoot() {
    const people = data.people.filter(p => !state.branch || p.branch === 'root' || p.branch === state.branch);
    const root = d3.stratify().id(d => d.id).parentId(d => d.parent)(people);
    root.each(n => { if (state.collapsed.has(n.id) && n.children) { n._children = n.children; n.children = null; } });
    return root;
  }
  const nodeW = d => d.data.group ? cssPx('--group-w') : cssPx('--node-w');
  function cssPx(v) { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(v)); }
  const GAP = () => isMobile() ? 16 : 22;
  const LEVEL = () => isMobile() ? 150 : 165;

  const layout = () => d3.tree().nodeSize([1, LEVEL()])
    .separation((a, b) => (nodeW(a) + nodeW(b)) / 2 + GAP() * (a.parent === b.parent ? 1 : 2.2));

  const heights = new Map();
  const prevPos = new Map();

  // ---------- render ----------
  function update() {
    const root = buildRoot();
    layout()(root);
    const nodes = root.descendants(), links = root.links();
    const T = reduced ? 0 : 600;

    // nodes (HTML)
    const sel = d3.select(nodesEl).selectAll('.node').data(nodes, d => d.id);
    const enter = sel.enter().append('div')
      .attr('class', d => nodeClass(d))
      .attr('data-id', d => d.id)
      .style('--c', d => color(d.data.branch))
      .html(d => cardHTML(d))
      .classed('enter', true)
      .each(function (d) {
        const from = d.parent && prevPos.get(d.parent.id) || { x: d.x, y: d.y };
        this.style.setProperty('--x', `${from.x - nodeW(d) / 2}px`);
        this.style.setProperty('--y', `${from.y}px`);
      });
    enter.each(function (d) { heights.set(d.id, this.offsetHeight); });
    const all = enter.merge(sel);
    all.attr('class', d => nodeClass(d)).select('.toggle').remove();
    all.each(function (d) {
      if (d.children || d._children) {
        const b = document.createElement('button');
        b.className = 'toggle' + (d._children ? ' closed' : '');
        b.textContent = d._children ? '+' : '−';
        b.setAttribute('aria-label', d._children ? 'expand' : 'collapse');
        b.onclick = e => { e.stopPropagation(); toggle(d.id); };
        this.querySelector('.card').appendChild(b);
      }
    });
    // force style flush so the enter transition runs from the parent position
    void nodesEl.offsetWidth;
    all.each(function (d, i) {
      const delay = state.first && !reduced ? d.depth * 180 + (i % 5) * 40 : 0;
      this.style.transitionDelay = `${delay}ms`;
      this.style.setProperty('--x', `${d.x - nodeW(d) / 2}px`);
      this.style.setProperty('--y', `${d.y}px`);
      this.classList.remove('enter');
      prevPos.set(d.id, { x: d.x, y: d.y });
    });
    sel.exit().each(function (d) {
      const to = d.parent && prevPos.get(d.parent.id) || { x: d.x, y: d.y };
      this.style.transitionDelay = '0ms';
      this.style.setProperty('--x', `${to.x - nodeW(d) / 2}px`);
      this.style.setProperty('--y', `${to.y}px`);
      this.classList.add('enter');
      setTimeout(() => this.remove(), T);
      prevPos.delete(d.id);
    });
    all.on('click', (e, d) => select(d.id));

    // bands
    const depths = d3.max(nodes, d => d.depth);
    const band = bandsG.selectAll('rect').data(d3.range(depths + 1));
    band.enter().append('rect').merge(band)
      .attr('x', -20000).attr('width', 40000)
      .attr('y', d => d * LEVEL() - 22).attr('height', LEVEL())
      .style('opacity', d => d % 2 ? 1 : 0);
    band.exit().remove();

    // links (SVG)
    const path = l => {
      const x0 = l.source.x, y0 = l.source.y + (heights.get(l.source.id) || 70);
      const x1 = l.target.x, y1 = l.target.y, m = (y0 + y1) / 2;
      return `M${x0},${y0}C${x0},${m} ${x1},${m} ${x1},${y1}`;
    };
    const collapsedPath = (l, pos) => `M${pos.x},${pos.y}C${pos.x},${pos.y} ${pos.x},${pos.y} ${pos.x},${pos.y}`;
    const ls = edgesG.selectAll('path').data(links, l => l.target.id);
    const lEnter = ls.enter().append('path')
      .attr('class', l => 'edge' + (l.target.data.uncertainLink ? ' dashed' : ''))
      .style('--c', l => color(l.target.data.branch))
      .attr('d', l => collapsedPath(l, prevPosOf(l.source)))
      .style('opacity', 0);
    lEnter.merge(ls).transition().duration(T)
      .delay(l => state.first && !reduced ? l.target.depth * 180 : 0)
      .attr('d', path).style('opacity', 1);
    ls.exit().transition().duration(T).attr('d', l => collapsedPath(l, prevPosOf(l.source))).style('opacity', 0).remove();

    state.first = false;
    applyHighlights();
  }
  function prevPosOf(n) { return prevPos.get(n.id) || { x: n.x, y: n.y }; }

  function nodeClass(d) {
    const p = d.data;
    return ['node', p.group && 'group', p.uncertain && 'uncertain', p.confirm && 'confirm',
      (p.childless || p.lineEnded) && 'flag', state.selected === d.id && 'selected'].filter(Boolean).join(' ');
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const q = p => p.uncertain ? '<span class="q">?</span>' : '';
  function membersHTML(p) {
    return `<div class="members">${p.members.map(m =>
      `<span class="member${m.highlight ? ' highlight' : ''}${m.childless ? ' childless' : ''}">${esc(state.lang === 'hi' ? m.hi : m.en)}${m.uncertain ? '<span class="q">?</span>' : ''}${m.childless ? ' ✗' : ''}${m.highlight ? ' ⭐' : ''}</span>`).join('')}</div>`;
  }
  function cardHTML(d) {
    const p = d.data, l = state.lang;
    let h = `<div class="card"><span class="gen-no">${t('gen')} ${p.gen} · ≈${eraOf(p.gen).born}</span>
      <div class="name-hi">${esc(p.hi)}${q(p)}</div><div class="name-en">${esc(p.en)}${q(p)}</div>`;
    if (p.tag_hi) h += `<span class="tag">${esc(l === 'hi' ? p.tag_hi : p.tag_en)}</span>`;
    if (p.note_hi && !p.group) h += `<span class="note">${esc(l === 'hi' ? p.note_hi : p.note_en)}</span>`;
    if (p.group) h += membersHTML(p) + `<span class="note">${esc(l === 'hi' ? p.note_hi : p.note_en)}</span>`;
    return h + '</div>';
  }

  // ---------- interactions ----------
  function toggle(id) {
    const opening = state.collapsed.has(id);
    opening ? state.collapsed.delete(id) : state.collapsed.add(id);
    update();
    // keep the person you tapped in view, with room below for the children that just appeared
    if (opening) setTimeout(() => centerOn(id, 0.28, true), 30);
  }
  function expandAll() { state.collapsed.clear(); update(); setTimeout(fit, 50); }
  function collapseAll() {
    state.collapsed = new Set(data.people.filter(p => p.gen >= 2 && data.people.some(c => c.parent === p.id)).map(p => p.id));
    update(); setTimeout(fit, 50);
  }
  function revealPathTo(id) {
    let p = byId.get(id);
    while (p && p.parent) { state.collapsed.delete(p.parent); p = byId.get(p.parent); }
  }
  function select(id) {
    state.selected = id;
    if (!document.querySelector(`.node[data-id="${id}"]`)) { revealPathTo(id); update(); }
    nodesEl.querySelectorAll('.node').forEach(n => n.classList.toggle('selected', n.dataset.id === id));
    applyHighlights(); showPanel(id);
    setTimeout(() => centerOn(id), 30);
  }
  function applyHighlights() {
    const anc = new Set();
    if (state.selected) { let p = byId.get(state.selected); while (p) { anc.add(p.id); p = p.parent ? byId.get(p.parent) : null; } }
    edgesG.selectAll('path')
      .classed('lit', l => anc.has(l.target.id))
      .classed('dim', l => (anc.size && !anc.has(l.target.id)) || (state.query && !matches(l.target.data) && !anc.has(l.target.id)));
    nodesEl.querySelectorAll('.node').forEach(n => {
      const p = byId.get(n.dataset.id), m = state.query ? matches(p) : false;
      n.classList.toggle('match', !!m);
      n.classList.toggle('dim', !!state.query && !m);
    });
  }
  function matches(p) {
    if (!state.query) return false;
    const s = state.query.toLowerCase();
    const text = [p.hi, p.en, ...(p.members || []).flatMap(m => [m.hi, m.en])].join(' ').toLowerCase();
    return text.includes(s);
  }

  // ---------- panel ----------
  function showPanel(id) {
    const p = byId.get(id), l = state.lang, br = data.branches[p.branch];
    const father = p.parent ? byId.get(p.parent) : null;
    const kids = data.people.filter(c => c.parent === id);
    const lineage = []; let a = father; while (a) { lineage.unshift(a); a = a.parent ? byId.get(a.parent) : null; }
    const nm = x => esc(l === 'hi' ? x.hi : x.en), nm2 = x => esc(l === 'hi' ? x.en : x.hi);
    const btn = x => `<button data-go="${x.id}">${nm(x)}${x.uncertain ? '<span class="q">?</span>' : ''}</button>`;
    const pills = [];
    if (p.tag_hi) pills.push(`<span class="pill">${esc(l === 'hi' ? p.tag_hi : p.tag_en)}</span>`);
    if (p.uncertain) pills.push(`<span class="pill">${t('uncertain')}</span>`);
    if (p.childless) pills.push(`<span class="pill">✗ ${t('childless')}</span>`);
    if (p.lineEnded) pills.push(`<span class="pill">✗ ${t('lineEnded')}</span>`);
    if (p.confirm) pills.push(`<span class="pill warn">${t('confirm')}</span>`);
    const era = eraOf(p.gen);
    panelBody.style.setProperty('--c', br.color);
    panelBody.innerHTML = `
      <div class="eyebrow">${t('gen')} ${p.gen} · ${esc(l === 'hi' ? br.hi : br.en)}</div>
      <h2>${nm(p)}${p.uncertain ? '<span class="q">?</span>' : ''}</h2>
      <div class="sub">${nm2(p)}</div>
      ${pills.length ? `<div class="row">${pills.join('')}</div>` : ''}
      ${p.note_hi ? `<p class="text">${esc(l === 'hi' ? p.note_hi : p.note_en)}</p>` : ''}
      ${p.members ? `<h3>${t('members')} · ${p.members.length}</h3>${membersHTML(p)}` : ''}
      <h3>${t('era')}</h3>
      <div class="era-mini">
        <svg><use href="#ic-${era.icon}"/></svg>
        <div>
          <div class="era-when">${t('bornAbout')} ${era.born} · ${t('active')} ${esc(era['span_' + l])} <span class="est">(${t('estimated')})</span></div>
          <strong>${esc(era['title_' + l])}</strong>
          <p class="text">${esc(era['events_' + l][0])}</p>
          <button class="linkish" data-era="${era.gen}">${t('more')} ›</button>
        </div>
      </div>
      <h3>${t('lineage')}</h3>
      <div class="lineage">${lineage.length ? lineage.map(btn).join('<span class="sep">›</span>') + '<span class="sep">›</span>' : ''}<strong style="font-family:inherit">${nm(p)}</strong></div>
      ${father ? `<h3>${t('father')}</h3><div class="kin">${btn(father)}</div>` : ''}
      <h3>${t('children')}${kids.length ? ` · ${kids.length}` : ''}</h3>
      <div class="kin">${kids.length ? kids.map(btn).join('') : `<span class="text" style="color:var(--ink-soft)">${p.members ? '—' : t('none')}</span>`}</div>`;
    panelBody.querySelectorAll('[data-go]').forEach(b => b.onclick = () => select(b.dataset.go));
    panelBody.querySelector('[data-era]').onclick = e => goEra(+e.target.dataset.era);
    panel.hidden = false;
  }
  function closePanel() {
    panel.hidden = true; state.selected = null;
    nodesEl.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
    applyHighlights();
  }

  // ---------- zoom ----------
  const zoom = d3.zoom().scaleExtent([0.15, 2.5]).on('zoom', e => {
    world.style.transform = `translate(${e.transform.x}px, ${e.transform.y}px) scale(${e.transform.k})`;
  });
  d3.select(viewport).call(zoom).on('dblclick.zoom', null);
  function bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodesEl.querySelectorAll('.node:not(.enter)').forEach(n => {
      const d = prevPos.get(n.dataset.id); if (!d) return;
      const w = n.offsetWidth, h = n.offsetHeight;
      x0 = Math.min(x0, d.x - w / 2); x1 = Math.max(x1, d.x + w / 2);
      y0 = Math.min(y0, d.y); y1 = Math.max(y1, d.y + h);
    });
    return { x0, y0, x1, y1 };
  }
  function fit(animate = true) {
    const b = bounds(); if (!isFinite(b.x0)) return;
    const W = viewport.clientWidth, H = viewport.clientHeight, pad = isMobile() ? 16 : 48;
    const k = Math.min((W - pad * 2) / (b.x1 - b.x0), (H - pad * 2) / (b.y1 - b.y0), isMobile() ? 1 : 1.1);
    const tx = (W - k * (b.x0 + b.x1)) / 2, ty = pad + 10 - k * b.y0;
    const tr = d3.zoomIdentity.translate(tx, ty).scale(Math.max(k, 0.15));
    const s = d3.select(viewport); (animate && !reduced ? s.transition().duration(700).ease(d3.easeCubicOut) : s).call(zoom.transform, tr);
  }
  function centerOn(id, vy = 0.5, keepZoom = false) {
    const n = nodesEl.querySelector(`.node[data-id="${id}"]`), d = prevPos.get(id); if (!n || !d) return;
    const cur = d3.zoomTransform(viewport), k = keepZoom ? cur.k : Math.max(cur.k, isMobile() ? 0.9 : 1);
    const W = viewport.clientWidth - (isMobile() || panel.hidden ? 0 : 380), H = viewport.clientHeight * (isMobile() && !panel.hidden ? 0.38 : 1);
    const tr = d3.zoomIdentity.translate(W / 2 - k * d.x, H * vy - k * (d.y + n.offsetHeight / 2)).scale(k);
    d3.select(viewport).transition().duration(reduced ? 0 : 600).ease(d3.easeCubicOut).call(zoom.transform, tr);
  }

  // ---------- list view ----------
  function renderList() {
    const root = d3.stratify().id(d => d.id).parentId(d => d.parent)(data.people.filter(p => !state.branch || p.branch === 'root' || p.branch === state.branch));
    const l = state.lang;
    const item = n => {
      const p = n.data, kids = n.children || [];
      return `<details ${n.depth < 3 ? 'open' : ''} class="${kids.length ? '' : 'leaf'}" style="--c:${color(p.branch)}">
        <summary><span class="l-hi">${esc(p.hi)}${q(p)}</span><span class="l-en">${esc(p.en)}</span>
          ${p.tag_hi ? `<span class="l-note">· ${esc(l === 'hi' ? p.tag_hi : p.tag_en)}</span>` : ''}
          ${p.note_hi && !p.group ? `<span class="l-note">· ${esc(l === 'hi' ? p.note_hi : p.note_en)}</span>` : ''}
          <button class="l-info" data-go="${p.id}">ⓘ</button>
          <span class="l-gen">${t('gen')} ${p.gen}</span></summary>
        ${p.members ? membersHTML(p) + `<div class="l-note" style="padding:0 8px 8px">${esc(l === 'hi' ? p.note_hi : p.note_en)}</div>` : ''}
        ${kids.map(item).join('')}
      </details>`;
    };
    listview.innerHTML = `<p class="origin-list">${esc(t('origin'))}</p>` + item(root);
    listview.querySelectorAll('[data-go]').forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); state.selected = b.dataset.go; showPanel(b.dataset.go); });
  }
  // ---------- timeline view: what India looked like in each generation ----------
  function renderTimeline() {
    const l = state.lang;
    const people = data.people.filter(p => !state.branch || p.branch === 'root' || p.branch === state.branch);
    const nm = x => esc(l === 'hi' ? x.hi : x.en);
    timeline.innerHTML = `<p class="era-note">${esc(data['eras_note_' + l])}</p>` + data.eras.map((e, i) => {
      const gen = people.filter(p => p.gen === e.gen);
      return `<article class="era" id="era-${e.gen}" style="--i:${i}">
        <div class="era-art"><svg><use href="#ic-${e.icon}"/></svg></div>
        <div class="era-body">
          <div class="era-when">${t('gen')} ${e.gen} · ${t('bornAbout')} ${e.born} · ${t('active')} ${esc(e['span_' + l])}</div>
          <h2>${esc(e['title_' + l])}</h2>
          <ul>${e['events_' + l].map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="era-people"><span>${t('inGen')}:</span>${gen.map(p =>
            `<button data-go="${p.id}" style="--c:${color(p.branch)}">${nm(p)}${p.uncertain ? '<span class="q">?</span>' : ''}</button>`).join('')}</div>
        </div>
      </article>`;
    }).join('');
    timeline.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { state.selected = b.dataset.go; showPanel(b.dataset.go); });
  }
  function goEra(gen) {
    if (isMobile()) closePanel();
    setView('timeline');
    const el = $(`#era-${gen}`); if (!el) return;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  function setView(v) {
    state.view = v;
    document.body.classList.remove('view-tree', 'view-list', 'view-timeline');
    document.body.classList.add('view-' + v);
    document.querySelectorAll('#viewToggle .seg').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    viewport.hidden = v !== 'tree'; listview.hidden = v !== 'list'; timeline.hidden = v !== 'timeline';
    $('#hint').hidden = v !== 'tree';
    refreshView();
    if (v === 'tree') setTimeout(() => fit(false), 0);
  }

  // ---------- wire up ----------
  $('#btnFit').onclick = () => fit();
  $('#btnExpand').onclick = expandAll;
  $('#btnCollapse').onclick = collapseAll;
  $('#zoomIn').onclick = () => d3.select(viewport).transition().duration(250).call(zoom.scaleBy, 1.3);
  $('#zoomOut').onclick = () => d3.select(viewport).transition().duration(250).call(zoom.scaleBy, 1 / 1.3);
  $('#panelClose').onclick = closePanel;
  document.querySelectorAll('#viewToggle .seg').forEach(b => b.onclick = () => setView(b.dataset.view));
  document.querySelectorAll('#langToggle .seg').forEach(b => b.onclick = () => {
    state.lang = b.dataset.lang; localStorage.setItem('vanshavali.lang', state.lang);
    applyLang(); nodesEl.innerHTML = ''; heights.clear(); update(); setTimeout(() => fit(false), 0);
  });
  let searchTimer;
  $('#search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = e.target.value.trim();
      const hits = state.query ? data.people.filter(matches) : [];
      $('#searchCount').textContent = state.query ? t('matches')(hits.length) : '';
      if (hits.length) { hits.forEach(h => revealPathTo(h.id)); update(); setTimeout(() => centerOn(hits[0].id), 30); }
      else applyHighlights();
    }, 160);
  });
  $('#search').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const h = data.people.find(matches); if (h) select(h.id); }
    if (e.key === 'Escape') { e.target.value = ''; e.target.dispatchEvent(new Event('input')); }
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') closePanel();
    if (e.key === '+' || e.key === '=') $('#zoomIn').click();
    if (e.key === '-') $('#zoomOut').click();
    if (e.key === 'f') fit();
  });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { update(); fit(false); }, 200); });

  // ---------- boot ----------
  if (isMobile()) {
    // phones start with the trunk visible and each branch folded one level down
    data.people.filter(p => p.gen >= 4 && data.people.some(c => c.parent === p.id)).forEach(p => state.collapsed.add(p.id));
  }
  document.body.classList.add('view-tree');
  applyLang();
  update();
  requestAnimationFrame(() => fit(false));
  await document.fonts?.ready; heights.clear(); update(); fit(false);
})();
