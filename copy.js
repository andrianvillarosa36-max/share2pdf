/* Share2PDF - Copy tab
   Pile up text in pieces, split it into parts that fit your clipboard,
   and copy part by part with a floating button.
   Loaded by index.html with:  <script src="copy.js"></script>  (just above </body>) */
(function () {
  'use strict';
  if (window.__s2pCopy) return;
  window.__s2pCopy = {};

  const D = document;
  const $ = (s) => D.querySelector(s);
  const $$ = (s) => Array.from(D.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n).toLocaleString();
  const say = (m) => { try { if (typeof toast === 'function') toast(m); } catch (e) {} };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const norm = (s) => String(s).replace(/\r\n?/g, '\n');

  /* ---------- options ---------- */
  const KEY = 's2p.copy', DKEY = 's2p.copy.draft';
  const OPT = Object.assign({ size: 4000, labels: false, auto: true, vibrate: true, bubble: true, verify: false, autoadd: false, join: 'blank', bx: null, by: null }, lsGet(KEY, {}));
  const JOIN = { blank: '\n\n', line: '\n', none: '' };
  function fixOpt() {
    OPT.size = Math.max(200, Math.min(1000000, parseInt(OPT.size, 10) || 4000));
    if (!JOIN.hasOwnProperty(OPT.join)) OPT.join = 'blank';
  }
  fixOpt();
  const saveOpt = () => lsSet(KEY, OPT);

  /* ---------- splitting ---------- */
  // Cut at paragraph breaks first, then lines, then sentences, then words, then anywhere.
  // Every level keeps the whitespace it cut at, so nothing is lost.
  const LEVELS = [/(?<=\n{2,})(?=[^\n])/, /(?<=\n)/, /(?<=[.!?\u3002\uff01\uff1f]\s+)(?=\S)/, /(?<=\s)(?=\S)/];
  function splitText(text, size) {
    function rec(t, lv) {
      if (t.length <= size) return [t];
      if (lv >= LEVELS.length) {
        const o = [];
        let i = 0;
        while (i < t.length) {
          let e = Math.min(i + size, t.length);
          if (e < t.length) { const c = t.charCodeAt(e); if (c >= 0xdc00 && c <= 0xdfff) e--; } // do not cut an emoji in half
          o.push(t.slice(i, e));
          i = e;
        }
        return o;
      }
      const out = [];
      let cur = '';
      for (const p of t.split(LEVELS[lv])) {
        if (p.length > size) {
          if (cur) { out.push(cur); cur = ''; }
          for (const x of rec(p, lv + 1)) out.push(x);
          continue;
        }
        if (cur.length + p.length <= size) cur += p;
        else { out.push(cur); cur = p; }
      }
      if (cur) out.push(cur);
      return out;
    }
    return rec(String(text), 0).map((s) => s.replace(/^\n+|\n+$/g, '')).filter((s) => s.trim());
  }
  function toUnits(text) {
    const t = norm(text).trim();
    if (!t) return { list: [], sep: '\n\n' };
    let list = t.split(/\n[ \t]*\n+/), sep = '\n\n';
    if (list.length < 3 && t.split('\n').length >= 3) { list = t.split('\n'); sep = '\n'; }
    list = list.map((s) => s.replace(/^\n+|\n+$/g, '')).filter((s) => s.trim());
    return { list, sep };
  }
  window.__s2pCopy.splitText = splitText;
  window.__s2pCopy.toUnits = toUnits;

  /* ---------- state ---------- */
  let units = [], unitSep = '\n\n', sel = [], deselected = new Set();
  let parts = [], ptr = 0, done = new Set(), shown = 100, unitsShown = 100;
  let pieces = 0, lastPiece = '', lastOut = '', lastSeen = '', copying = false;
  const ukey = (u) => u.slice(0, 120) + '|' + u.length;

  /* ---------- page pieces ---------- */
  const CSS = [
    'nav button{padding:16px 1px;font-size:11px;letter-spacing:.3px}',
    '#cp-text{min-height:180px}',
    '.chips{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}',
    '.chips button{flex:1;min-width:52px}',
    '.chips button.on{background:var(--btn);color:var(--btnfg);border-color:var(--btn)}',
    '.unit{cursor:pointer}',
    '.unit.off{opacity:.35;text-decoration:line-through}',
    '.item.next{border:2px solid var(--fg)}',
    '.item.done{opacity:.55}',
    '.item:not(.done) .ck{display:none}',
    '#cp-msg.bad,#cp-testout.bad{color:var(--fg);font-weight:700}',
    '#cp-bubble{position:fixed;z-index:20;display:flex;align-items:stretch;background:var(--btn);color:var(--btnfg);',
    'border:2px solid var(--bg);border-radius:99px;box-shadow:0 0 0 1.5px var(--fg),0 8px 24px rgba(0,0,0,.55);',
    'overflow:hidden;user-select:none;-webkit-user-select:none}',
    '#cp-bubble button{background:transparent;color:inherit;border:0;border-radius:0;padding:0 12px;min-width:46px;height:54px;font-size:22px;font-weight:700;line-height:1}',
    '#cp-bubble #cp-bmain{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 14px;min-width:84px;font-size:14px;letter-spacing:1px}',
    '#cp-bubble #cp-bmain small{font-size:11px;opacity:.7;margin-top:3px;letter-spacing:0}',
    '#cp-bubble.flash{background:var(--bg);color:var(--fg)}',
    '#cp-grip{width:26px;touch-action:none;cursor:grab;opacity:.5;',
    'background-image:radial-gradient(currentColor 1.6px,transparent 2.2px);background-size:8px 8px;background-position:center;margin:6px 0 6px 6px}'
  ].join('');

  function build() {
    const st = D.createElement('style');
    st.textContent = CSS;
    D.head.appendChild(st);

    // nav button
    const navRow = $('nav div');
    const nb = D.createElement('button');
    nb.dataset.v = 'copy';
    nb.textContent = 'Copy';
    nb.onclick = () => go('copy');
    navRow.insertBefore(nb, navRow.children[1] || null);

    // view
    const v = D.createElement('section');
    v.id = 'v-copy';
    v.className = 'view';
    v.innerHTML =
      '<div class="card"><h2>1. Your text</h2>' +
      '<p class="small-t mut">Paste as many pieces as you like. Each one is added to the end, so you can copy a little, come back, and add the next bit.</p>' +
      '<textarea id="cp-text" spellcheck="false" placeholder="Long text goes here"></textarea>' +
      '<div class="row" style="margin-top:10px"><button id="cp-add">Add from clipboard</button><button id="cp-file" class="ghost">Open file</button></div>' +
      '<input id="cp-filein" type="file" class="hide" accept=".txt,.md,.json,.csv,.log,.html,text/*">' +
      '<div id="cp-stats" class="mut small-t" style="margin-top:10px"></div>' +
      '<div id="cp-boxmsg" class="small-t" style="margin-top:4px"></div>' +
      '<label for="cp-join">Between pieces</label>' +
      '<select id="cp-join"><option value="blank">Blank line</option><option value="line">New line</option><option value="none">Nothing (join directly)</option></select>' +
      '<div class="toggle"><span>Add by itself when I come back here <span class="mut">(experimental)</span></span><input id="cp-autoadd" type="checkbox"></div>' +
      '<div class="row" style="margin-top:8px"><button id="cp-clear" class="ghost small">Clear</button><button id="cp-convert" class="ghost small">Send to Convert</button></div>' +
      '</div>' +

      '<div id="cp-pickcard" class="card hide"><details id="cp-pick"><summary id="cp-picksum">Choose paragraphs</summary>' +
      '<p class="small-t mut" style="margin-top:8px">Tap a paragraph to leave it out or put it back. Only the ones that are on get copied.</p>' +
      '<div class="row"><button id="cp-sall" class="ghost small">All</button><button id="cp-snone" class="ghost small">None</button><button id="cp-sinv" class="ghost small">Flip</button></div>' +
      '<div class="row" style="margin-top:8px;align-items:center"><input id="cp-rfrom" type="number" inputmode="numeric" min="1" placeholder="From #"><input id="cp-rto" type="number" inputmode="numeric" min="1" placeholder="To #"><button id="cp-srange" class="ghost small">Only these</button></div>' +
      '<div id="cp-units" class="msgs"></div>' +
      '<button id="cp-moreu" class="ghost small hide" style="width:100%">Show more</button>' +
      '</details></div>' +

      '<div id="cp-splitcard" class="card hide"><h2>2. Copy in parts</h2>' +
      '<label for="cp-size" style="margin-top:0">Characters per part</label>' +
      '<input id="cp-size" type="number" inputmode="numeric" min="200" max="1000000">' +
      '<div class="chips" id="cp-chips"><button class="ghost small" data-n="1000">1k</button><button class="ghost small" data-n="2000">2k</button><button class="ghost small" data-n="5000">5k</button><button class="ghost small" data-n="10000">10k</button><button class="ghost small" data-n="20000">20k</button><button class="ghost small" data-n="50000">50k</button></div>' +
      '<button id="cp-test" class="ghost small" style="width:100%">Find my clipboard limit</button>' +
      '<div id="cp-testout" class="small-t mut" style="margin-top:6px">Copies test text and reads it back, so it replaces what is on your clipboard. Other apps may have their own limit.</div>' +
      '<div class="toggle"><span>Add "Part 2/7" at the top of each part</span><input id="cp-o-labels" type="checkbox"></div>' +
      '<div class="toggle"><span>Move to the next part after each copy</span><input id="cp-o-auto" type="checkbox"></div>' +
      '<div class="toggle"><span>Vibrate when copied</span><input id="cp-o-vibrate" type="checkbox"></div>' +
      '<div class="toggle"><span>Floating copy button</span><input id="cp-o-bubble" type="checkbox"></div>' +
      '<div class="toggle"><span>Check every copy went through <span class="mut">(asks to read clipboard)</span></span><input id="cp-o-verify" type="checkbox"></div>' +
      '<div id="cp-info" class="small-t mut" style="margin-top:12px"></div>' +
      '<button id="cp-next" style="width:100%;margin-top:8px"></button>' +
      '<div id="cp-msg" class="small-t mut" style="margin-top:8px"></div>' +
      '<textarea id="cp-manual" class="hide" readonly style="min-height:90px;margin-top:8px"></textarea>' +
      '<div class="row" style="margin-top:10px"><button id="cp-reset" class="ghost small">Start over</button></div>' +
      '<div id="cp-parts" class="hist" style="margin-top:12px"></div>' +
      '<button id="cp-more" class="ghost small hide" style="width:100%;margin-top:10px">Show more</button>' +
      '</div>';
    $('main').appendChild(v);

    // floating button
    const b = D.createElement('div');
    b.id = 'cp-bubble';
    b.className = 'hide';
    b.setAttribute('role', 'group');
    b.setAttribute('aria-label', 'Floating copy button');
    b.innerHTML = '<span id="cp-grip" aria-label="Drag to move"></span><button id="cp-bprev" aria-label="Previous part">\u2039</button>' +
      '<button id="cp-bmain"><span id="cp-blabel">COPY</span><small id="cp-bcount"></small></button>' +
      '<button id="cp-bnext" aria-label="Skip this part">\u203a</button>';
    D.body.appendChild(b);

    // shortcut on the finished-file card
    const again = $('#btnAgain');
    if (again) {
      const rb = D.createElement('button');
      rb.id = 'cp-fromresult';
      rb.className = 'ghost';
      rb.style.cssText = 'width:100%;margin-top:10px';
      rb.textContent = 'Copy the text in parts';
      again.parentNode.insertBefore(rb, again);
      rb.onclick = () => {
        let c = null;
        try { c = typeof current !== 'undefined' ? current : null; } catch (e) {}
        if (!c) return say('Nothing to copy yet');
        replaceBox(buildMarkdown(c));
        go('copy');
      };
    }
  }

  // shortcut on the video transcript card (only if the Video tab exists)
  function addVideoShortcut() {
    const ex = $('#vt_export');
    if (!ex || $('#cp-fromvideo')) return;
    const vb = D.createElement('button');
    vb.id = 'cp-fromvideo';
    vb.className = 'ghost';
    vb.style.cssText = 'width:100%;margin-top:10px';
    vb.textContent = 'Copy the transcript in parts';
    ex.parentNode.insertBefore(vb, ex);
    vb.onclick = () => {
      const t = ($('#vt_out') || {}).value || '';
      if (!t.trim()) return say('No transcript yet');
      replaceBox(t);
      go('copy');
    };
  }

  /* ---------- clipboard ---------- */
  function legacyCopy(t) {
    const ta = D.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    D.body.appendChild(ta);
    ta.select();
    try { ta.setSelectionRange(0, t.length); } catch (e) {}
    let ok = false;
    try { ok = D.execCommand('copy'); } catch (e) {}
    ta.remove();
    return ok;
  }
  async function copyText(t) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return { ok: true }; }
    } catch (e) {}
    return { ok: legacyCopy(t) };
  }
  function boxInfo(m) { $('#cp-boxmsg').textContent = m; say(m); }
  function copyInfo(m, bad) { const e = $('#cp-msg'); e.textContent = m; e.classList.toggle('bad', !!bad); say(m); }

  async function verifyCopy(text) {
    if (!navigator.clipboard || !navigator.clipboard.readText) return copyInfo('Cannot check: this browser cannot read the clipboard.');
    try {
      const back = norm(await navigator.clipboard.readText()), want = norm(text);
      if (back.trim() === want.trim()) return copyInfo('Copied and checked. The whole part is on the clipboard.');
      copyInfo('The clipboard kept only ' + num(back.length) + ' of ' + num(want.length) + ' characters. Use smaller parts.', true);
    } catch (e) {
      copyInfo('Copied, but could not check it (clipboard reading is blocked).');
    }
  }

  /* ---------- the text box ---------- */
  function counts() {
    const t = $('#cp-text').value;
    const words = (t.match(/\S+/g) || []).length;
    $('#cp-stats').textContent = t ? num(t.length) + ' characters \u00b7 ' + num(words) + ' words' + (pieces ? ' \u00b7 ' + pieces + ' piece' + (pieces > 1 ? 's' : '') + ' added' : '') : 'Empty';
  }
  let draftT;
  function saveDraft() {
    clearTimeout(draftT);
    draftT = setTimeout(() => {
      const ok = lsSet(DKEY, { text: $('#cp-text').value, pieces });
      if (!ok && $('#cp-text').value) $('#cp-boxmsg').textContent = 'Too big to keep a backup in this browser. Do not close the app.';
    }, 400);
  }
  function addPiece(t, auto) {
    t = norm(t || '');
    if (!t.trim()) { if (!auto) boxInfo('The clipboard is empty.'); return false; }
    const ta = $('#cp-text');
    if (t === lastPiece || t === lastOut || (t.length >= 40 && ta.value.includes(t))) {
      if (!auto) boxInfo('That is already in the box, so it was skipped.');
      return false;
    }
    const cur = ta.value;
    ta.value = cur ? cur.replace(/\s+$/, '') + JOIN[OPT.join] + t : t;
    pieces++;
    lastPiece = t;
    boxInfo((auto ? 'Added automatically: ' : 'Added ') + num(t.length) + ' characters.');
    onTextChanged();
    ta.scrollTop = ta.scrollHeight;
    return true;
  }
  function replaceBox(t) {
    const ta = $('#cp-text');
    if (ta.value.trim() && ta.value !== t && !confirm('Replace the text in the Copy tab?')) return;
    ta.value = t;
    pieces = 0; lastPiece = '';
    onTextChanged();
  }
  let reT;
  function onTextChanged() { counts(); saveDraft(); clearTimeout(reT); reT = setTimeout(reparse, 250); }

  async function addFromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return boxInfo('This browser cannot read the clipboard. Press and hold in the box and choose Paste.');
    try {
      const t = await navigator.clipboard.readText();
      lastSeen = t;
      addPiece(t, false);
    } catch (e) {
      boxInfo('Clipboard access was blocked. Press and hold in the box and choose Paste instead.');
    }
  }
  async function autoAdd() {
    if (!OPT.autoadd || D.visibilityState !== 'visible') return;
    const v = $('#v-copy');
    if (!v || !v.classList.contains('on') || !navigator.clipboard || !navigator.clipboard.readText) return;
    try {
      const t = await navigator.clipboard.readText();
      if (t && t !== lastSeen) { lastSeen = t; addPiece(t, true); }
    } catch (e) { /* the page may not be focused yet; the focus event tries again */ }
  }

  /* ---------- paragraphs ---------- */
  function renderUnits() {
    const n = Math.min(units.length, unitsShown);
    let h = '';
    for (let i = 0; i < n; i++) {
      const u = units[i];
      h += '<div class="msg unit ' + (sel[i] ? 'on' : 'off') + '" data-u="' + i + '"><span class="tag ' + (sel[i] ? 'u' : '') + '">' + (i + 1) + '</span>' +
        esc(u.slice(0, 140).replace(/\s+/g, ' ')) + (u.length > 140 ? '\u2026' : '') + '</div>';
    }
    $('#cp-units').innerHTML = h;
    $('#cp-moreu').classList.toggle('hide', n >= units.length);
  }
  function syncDeselected() { deselected = new Set(units.filter((x, i) => !sel[i]).map(ukey)); }
  let rbT;
  function selChanged(full) {
    syncDeselected();
    if (full) renderUnits();
    updateSummary();
    clearTimeout(rbT);
    rbT = setTimeout(rebuild, 150);
  }

  /* ---------- parts ---------- */
  function partText(i) { return OPT.labels ? '[Part ' + (i + 1) + '/' + parts.length + ']\n' + parts[i] : parts[i]; }
  function renderParts() {
    const n = Math.min(parts.length, shown);
    let h = '';
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      h += '<div class="item" data-i="' + i + '"><div class="t"><span class="fmt ck">\u2713</span>Part ' + (i + 1) + ' <span class="mut small-t">' + num(p.length) + ' characters</span></div>' +
        '<div class="m">' + esc(p.slice(0, 80).replace(/\s+/g, ' ')) + (p.length > 80 ? '\u2026' : '') + '</div>' +
        '<div class="acts"><button class="small" data-c="' + i + '">Copy</button></div></div>';
    }
    $('#cp-parts').innerHTML = h;
    $('#cp-more').classList.toggle('hide', n >= parts.length);
  }
  function updateSummary() {
    const c = sel.filter(Boolean).length;
    $('#cp-picksum').textContent = 'Choose paragraphs: ' + c + ' of ' + units.length + ' on';
    const total = parts.reduce((a, p) => a + p.length, 0);
    $('#cp-info').textContent = parts.length
      ? num(total) + ' characters in ' + parts.length + ' part' + (parts.length > 1 ? 's' : '') + '.'
      : (units.length ? 'Nothing is selected.' : '');
  }
  function paint() {
    const n = parts.length, fin = n > 0 && ptr >= n;
    const nx = $('#cp-next');
    nx.classList.toggle('hide', !n);
    nx.textContent = fin ? 'All copied. Tap to start over' : 'Copy part ' + (ptr + 1) + ' of ' + n;
    $('#cp-blabel').textContent = fin ? 'AGAIN' : 'COPY';
    $('#cp-bcount').textContent = n ? (fin ? n + '/' + n : (ptr + 1) + '/' + n) : '';
    $('#cp-reset').classList.toggle('hide', !n);
    $$('#cp-parts .item').forEach((el) => {
      const i = +el.dataset.i;
      el.classList.toggle('done', done.has(i));
      el.classList.toggle('next', i === ptr);
    });
  }
  function rebuild() {
    const text = units.filter((x, i) => sel[i]).join(unitSep);
    parts = splitText(text, OPT.size - (OPT.labels ? 24 : 0));
    ptr = 0; done.clear(); shown = 100;
    $('#cp-manual').classList.add('hide');
    copyInfo('');
    renderParts(); updateSummary(); paint(); updateBubble();
  }
  function reparse() {
    const u = toUnits($('#cp-text').value);
    units = u.list; unitSep = u.sep;
    sel = units.map((x) => !deselected.has(ukey(x)));
    const has = units.length > 0;
    $('#cp-pickcard').classList.toggle('hide', !has);
    $('#cp-splitcard').classList.toggle('hide', !has);
    renderUnits();
    rebuild();
  }

  /* ---------- copying a part ---------- */
  function buzz() { if (OPT.vibrate && navigator.vibrate) { try { navigator.vibrate(25); } catch (e) {} } }
  let flashT;
  function flash() {
    const b = $('#cp-bubble');
    $('#cp-blabel').textContent = 'COPIED';
    b.classList.add('flash');
    clearTimeout(flashT);
    flashT = setTimeout(() => { b.classList.remove('flash'); paint(); }, 650);
  }
  async function copyPart(i) {
    if (copying || i < 0 || i >= parts.length) return;
    copying = true;
    try {
      const text = partText(i);
      const r = await copyText(text);
      if (!r.ok) {
        const m = $('#cp-manual');
        m.classList.remove('hide');
        m.value = text;
        m.focus(); m.select();
        copyInfo('Copy was blocked. Press and hold in the box below and choose Copy.', true);
        return;
      }
      $('#cp-manual').classList.add('hide');
      lastOut = text;
      done.add(i);
      ptr = OPT.auto ? i + 1 : i;
      buzz(); paint(); flash();
      copyInfo('Copied part ' + (i + 1) + ' of ' + parts.length + ' (' + num(text.length) + ' characters).');
      if (OPT.verify) await verifyCopy(text);
    } finally { copying = false; }
  }
  function tapMain() {
    if (!parts.length) return;
    if (ptr >= parts.length) { ptr = 0; done.clear(); paint(); return; }
    copyPart(ptr);
  }

  /* ---------- floating button ---------- */
  function placeBubble() {
    const b = $('#cp-bubble');
    const w = b.offsetWidth, h = b.offsetHeight;
    let x = OPT.bx, y = OPT.by;
    if (x == null || y == null) { x = innerWidth - w - 14; y = innerHeight - h - 110; }
    x = Math.max(6, Math.min(innerWidth - w - 6, x));
    y = Math.max(6, Math.min(innerHeight - h - 6, y));
    b.style.left = x + 'px';
    b.style.top = y + 'px';
  }
  function updateBubble() {
    const v = $('#v-copy'), b = $('#cp-bubble');
    const on = !!(OPT.bubble && parts.length && v && v.classList.contains('on'));
    b.classList.toggle('hide', !on);
    if (on) placeBubble();
  }
  function wireBubble() {
    const b = $('#cp-bubble'), g = $('#cp-grip');
    let drag = null;
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { g.setPointerCapture(e.pointerId); } catch (x) {}
      const r = b.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    });
    g.addEventListener('pointermove', (e) => {
      if (!drag) return;
      OPT.bx = e.clientX - drag.dx;
      OPT.by = e.clientY - drag.dy;
      placeBubble();
    });
    const end = () => { if (drag) { drag = null; saveOpt(); } };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
    $('#cp-bmain').onclick = tapMain;
    $('#cp-bprev').onclick = () => { if (!parts.length) return; ptr = Math.max(0, ptr - 1); paint(); };
    $('#cp-bnext').onclick = () => { if (!parts.length) return; ptr = Math.min(parts.length, ptr + 1); paint(); };
    addEventListener('resize', () => { if (!b.classList.contains('hide')) placeBubble(); });
    new MutationObserver(updateBubble).observe($('#v-copy'), { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- find the clipboard limit ---------- */
  function setSize(n) {
    OPT.size = n; fixOpt(); saveOpt();
    $('#cp-size').value = OPT.size;
    syncChips();
    rebuild();
  }
  async function findLimit() {
    const out = $('#cp-testout'), btn = $('#cp-test');
    out.classList.remove('bad');
    if (!navigator.clipboard || !navigator.clipboard.readText || !navigator.clipboard.writeText) { out.textContent = 'This browser cannot test the clipboard.'; return; }
    btn.disabled = true;
    const unit = 'The quick brown fox jumps over the lazy dog 0123456789.\n';
    const sample = (n) => { let s = ''; while (s.length < n) s += unit; return s.slice(0, n); };
    const works = async (n) => {
      const s = sample(n);
      await navigator.clipboard.writeText(s);
      return norm(await navigator.clipboard.readText()).length === s.length;
    };
    try {
      let lo = 0, hi = 0;
      for (const n of [1000, 4000, 16000, 64000, 256000, 1000000]) {
        out.textContent = 'Testing ' + num(n) + ' characters...';
        if (await works(n)) lo = n; else { hi = n; break; }
      }
      if (!hi) { out.textContent = 'No limit found up to 1,000,000 characters. Big parts are fine on this clipboard.'; return; }
      for (let k = 0; k < 7 && hi - lo > 100; k++) {
        const mid = Math.floor((lo + hi) / 2);
        out.textContent = 'Narrowing it down... ' + num(mid);
        if (await works(mid)) lo = mid; else hi = mid;
      }
      const safe = Math.max(200, Math.floor(lo * 0.9 / 100) * 100);
      setSize(safe);
      out.textContent = (lo < 200 ? 'Your clipboard keeps fewer than 200 characters.' : 'Your clipboard keeps about ' + num(lo) + ' characters.') + ' Part size set to ' + num(OPT.size) + '.';
    } catch (e) {
      out.classList.add('bad');
      out.textContent = e && e.name === 'NotAllowedError' ? 'Could not test: clipboard permission was denied.' : 'Could not test: the browser blocked the clipboard.';
    } finally { btn.disabled = false; }
  }

  /* ---------- wiring ---------- */
  function syncChips() { $$('#cp-chips button').forEach((x) => x.classList.toggle('on', +x.dataset.n === OPT.size)); }
  function wire() {
    const ta = $('#cp-text');
    ta.addEventListener('input', onTextChanged);
    ta.addEventListener('paste', (e) => {
      const t = e.clipboardData && e.clipboardData.getData('text');
      if (t) { pieces++; lastPiece = norm(t); }
    });
    $('#cp-add').onclick = addFromClipboard;
    $('#cp-file').onclick = () => $('#cp-filein').click();
    $('#cp-filein').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 20e6) return boxInfo('That file is too big (over 20 MB).');
      try {
        const t = await f.text();
        if (!ta.value.trim()) { ta.value = norm(t); pieces = 1; lastPiece = ''; onTextChanged(); boxInfo('Loaded ' + f.name + '.'); }
        else { addPiece(t, false); }
      } catch (x) { boxInfo('Could not read that file.'); }
    });
    $('#cp-clear').onclick = () => {
      if (!ta.value) return;
      if (!confirm('Clear all the text?')) return;
      ta.value = ''; pieces = 0; lastPiece = ''; lastOut = ''; deselected = new Set();
      boxInfo('Cleared.');
      onTextChanged();
    };
    $('#cp-convert').onclick = () => {
      if (!ta.value.trim()) return say('Nothing to send yet');
      const raw = $('#raw');
      if (!raw) return;
      raw.value = ta.value;
      go('convert');
      say('Text sent. Tap Review.');
    };
    $('#cp-join').value = OPT.join;
    $('#cp-join').addEventListener('change', (e) => { OPT.join = e.target.value; fixOpt(); saveOpt(); });
    $('#cp-autoadd').checked = !!OPT.autoadd;
    $('#cp-autoadd').addEventListener('change', (e) => { OPT.autoadd = e.target.checked; saveOpt(); if (OPT.autoadd) say('Copy something, then come back here.'); });
    D.addEventListener('visibilitychange', autoAdd);
    addEventListener('focus', autoAdd);

    // paragraph picker
    $('#cp-units').addEventListener('click', (e) => {
      const el = e.target.closest('[data-u]');
      if (!el) return;
      const i = +el.dataset.u;
      sel[i] = !sel[i];
      el.classList.toggle('on', sel[i]);
      el.classList.toggle('off', !sel[i]);
      el.querySelector('.tag').classList.toggle('u', sel[i]);
      selChanged(false);
    });
    $('#cp-sall').onclick = () => { sel = sel.map(() => true); selChanged(true); };
    $('#cp-snone').onclick = () => { sel = sel.map(() => false); selChanged(true); };
    $('#cp-sinv').onclick = () => { sel = sel.map((x) => !x); selChanged(true); };
    $('#cp-srange').onclick = () => {
      const a = parseInt($('#cp-rfrom').value, 10) || 1, z = parseInt($('#cp-rto').value, 10) || units.length;
      const lo = Math.min(a, z), hi = Math.max(a, z);
      sel = sel.map((x, i) => i + 1 >= lo && i + 1 <= hi);
      selChanged(true);
    };
    $('#cp-moreu').onclick = () => { unitsShown += 200; renderUnits(); };

    // parts
    const size = $('#cp-size');
    size.value = OPT.size;
    let szT;
    size.addEventListener('input', () => {
      OPT.size = size.value; fixOpt(); saveOpt(); syncChips();
      clearTimeout(szT); szT = setTimeout(rebuild, 300);
    });
    $('#cp-chips').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) setSize(+b.dataset.n); });
    syncChips();
    $('#cp-test').onclick = findLimit;
    const flags = { labels: '#cp-o-labels', auto: '#cp-o-auto', vibrate: '#cp-o-vibrate', bubble: '#cp-o-bubble', verify: '#cp-o-verify' };
    Object.keys(flags).forEach((k) => {
      const el = $(flags[k]);
      el.checked = !!OPT[k];
      el.addEventListener('change', () => {
        OPT[k] = el.checked; saveOpt();
        if (k === 'labels') rebuild();
        if (k === 'bubble') updateBubble();
        if (k === 'verify' && el.checked) say('Your phone may ask to let this app read the clipboard.');
      });
    });
    $('#cp-next').onclick = tapMain;
    $('#cp-reset').onclick = () => { ptr = 0; done.clear(); copyInfo(''); paint(); };
    $('#cp-parts').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) copyPart(+b.dataset.c); });
    $('#cp-more').onclick = () => { shown += 100; renderParts(); paint(); };
    wireBubble();
  }

  function start() {
    build();
    addVideoShortcut();
    wire();
    const d = lsGet(DKEY, null);
    if (d && typeof d.text === 'string' && d.text) {
      $('#cp-text').value = d.text;
      pieces = parseInt(d.pieces, 10) || 0;
    }
    counts();
    reparse();
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})();
