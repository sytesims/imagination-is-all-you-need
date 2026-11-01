// iiayn.app: install tabs (auto-picked from the visitor's computer), Copy, lazy clips and the song tile. No libraries.
(() => {
  const REPO = 'https://github.com/sytesims/imagination-is-all-you-need/blob/main/scripts/';
  const OS = {
    unix: { cmd: 'curl -fsSL https://iiayn.app/install | bash', where: 'Paste this into <b>Terminal</b>:', script: 'get.sh' },
    win: { cmd: 'irm https://iiayn.app/install.ps1 | iex', where: 'Paste this into <b>PowerShell</b>:', script: 'get.ps1' },
  };

  const box = document.querySelector('[data-install]');
  if (box) {
    const tabs = [...box.querySelectorAll('[role="tab"]')];
    const panel = box.querySelector('[role="tabpanel"]');
    const code = box.querySelector('[data-cmd]');
    const where = box.querySelector('[data-where]');
    const script = box.querySelector('[data-script]');
    const copyBtn = box.querySelector('[data-copy]');
    const copyLabel = box.querySelector('[data-copy-label]');
    let timer;

    const pick = (os, focus) => {
      tabs.forEach((t) => {
        const on = t.dataset.os === os;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on) { panel.setAttribute('aria-labelledby', t.id); if (focus) t.focus(); }
      });
      code.textContent = OS[os].cmd;
      where.innerHTML = OS[os].where;
      script.href = REPO + OS[os].script;
      box.querySelectorAll('[data-only]').forEach((el) => { el.hidden = el.dataset.only !== os; });
      copyBtn.setAttribute('aria-label', `Copy the ${os === 'win' ? 'Windows' : 'Mac and Linux'} install command`);
      resetCopy();
    };

    const guess = () => {
      const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
      return /win/i.test(p) ? 'win' : 'unix';
    };
    const forced = new URLSearchParams(location.search).get('os');
    pick(forced === 'win' || forced === 'unix' ? forced : guess(), false);

    tabs.forEach((t, i) => {
      t.addEventListener('click', () => pick(t.dataset.os, false));
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        pick(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.os, true);
      });
    });

    function resetCopy() { clearTimeout(timer); copyBtn.classList.remove('done'); copyLabel.textContent = 'Copy'; }
    copyBtn.addEventListener('click', async () => {
      const text = code.textContent;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch {
        const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(code); sel.removeAllRanges(); sel.addRange(r);
        try { ok = document.execCommand('copy'); } catch { ok = false; }
      }
      copyBtn.classList.toggle('done', ok);
      copyLabel.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      clearTimeout(timer); timer = setTimeout(resetCopy, 2200);
    });
  }

  // "Get the install line": scroll up and put the keyboard on Copy.
  document.querySelectorAll('[data-to-install]').forEach((a) => a.addEventListener('click', () => {
    setTimeout(() => document.querySelector('[data-copy]')?.focus({ preventScroll: true }), 400);
  }));

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // One app, every way to run: step through the three places (price changes on Generate). Pointing at, focusing or pressing a
  // place stops it there. Reduced motion: no stepping, the first place stays shown. Steps only while the section is on screen.
  const run = document.querySelector('[data-run]');
  if (run) {
    const PLACES = [
      { model: 'LTX-2.5 22B', place: 'Your computer', price: 'Free', opts: [0, 1] },
      { model: 'LTX-2.5 22B', place: 'Comfy Cloud', price: '≈ $0.23', opts: [0, 1] },
      { model: 'Kling 3.0 Omni', place: 'partner model', price: '≈ $0.68', opts: [2] },
    ];
    const btns = [...run.querySelectorAll('[data-place]')];
    const opts = [...run.querySelectorAll('[data-opt]')];
    const models = run.querySelectorAll('[data-run-model]');
    const price = run.querySelector('[data-run-price]');
    const now = run.querySelector('[data-run-now]');
    const live = run.querySelector('[data-run-live]');
    const note = run.querySelector('[data-run-note]');
    let on = 0; let held = still; let seen = false; let tick;

    const show = (k, said) => {
      on = k; const p = PLACES[k];
      btns.forEach((b, i) => { b.classList.toggle('on', i === k); b.setAttribute('aria-pressed', String(i === k)); });
      opts.forEach((o, i) => { o.hidden = !p.opts.includes(i); o.classList.toggle('on', i === k); });
      note.hidden = k !== 2;
      models.forEach((m) => { m.textContent = p.model; });
      price.textContent = p.price;
      if (!still) { price.classList.remove('in'); void price.offsetWidth; price.classList.add('in'); }
      now.textContent = `${p.model} · ${p.place} · ${p.price}`;
      if (said) live.textContent = `${p.model} on ${p.place === 'partner model' ? 'Comfy Router' : p.place}: ${p.price === 'Free' ? 'free' : `about ${p.price.slice(2)}`}`;
    };
    const stop = () => { held = true; clearInterval(tick); };
    const go = () => { clearInterval(tick); if (!held && seen) tick = setInterval(() => show((on + 1) % PLACES.length, false), 2600); };
    const pick = (k) => { stop(); if (k !== on) show(k, true); };

    btns.forEach((b, i) => {
      b.addEventListener('click', () => { stop(); show(i, true); });
      b.addEventListener('focus', () => pick(i));
      b.addEventListener('mouseenter', () => pick(i));
    });
    run.querySelector('.run-stage').addEventListener('mouseenter', stop);
    show(0, false);
    if (!still) {
      if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen) go(); else clearInterval(tick); }, { threshold: 0.25 }).observe(run);
      else { seen = true; go(); }
    }
  }

  // Hero clip: the poster is the section's background (instant paint); the clip loads only on wider screens, never for
  // people who asked for less motion or to save data, and fades in once it is really playing.
  const hero = document.querySelector('[data-hero]');
  const saveData = navigator.connection && navigator.connection.saveData;
  if (hero && !still && !saveData && matchMedia('(min-width: 821px)').matches) {
    hero.src = hero.dataset.src;
    hero.addEventListener('playing', () => hero.classList.add('on'), { once: true });
    hero.play().catch(() => {});
  }

  // Tile clips: load only when on screen, pause when off.
  const lazy = [...document.querySelectorAll('[data-lazy-video]')];
  // Posters too: a video's poster isn't lazy-loaded by the browser, so set it when the tile comes near.
  const setPoster = (v) => { if (v.dataset.poster) { v.poster = v.dataset.poster; delete v.dataset.poster; } };
  if (!('IntersectionObserver' in window)) lazy.forEach(setPoster);
  else {
    const near = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { setPoster(e.target); near.unobserve(e.target); } }), { rootMargin: '600px 0px' });
    lazy.forEach((v) => near.observe(v));
  }
  if (lazy.length && 'IntersectionObserver' in window && !still) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) {
        const s = v.querySelector('source[data-src]');
        if (s) { s.src = s.dataset.src; s.removeAttribute('data-src'); v.load(); }
        v.play().catch(() => {});
      } else v.pause();
    }), { rootMargin: '200px 0px' });
    lazy.forEach((v) => io.observe(v));
  }

  // The song tile: a plain button over a drawn waveform; the file loads only on the first press.
  const btn = document.querySelector('[data-audio-btn]');
  const audio = document.querySelector('[data-audio]');
  const wave = document.querySelector('[data-wave]');
  if (btn && audio && wave) {
    const N = 48; const bars = [];
    for (let i = 0; i < N; i++) {
      const b = document.createElement('i');
      const h = 18 + 70 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21 + 1)) + (i % 3) * 4;
      b.style.height = `${Math.min(96, h)}%`;
      wave.appendChild(b); bars.push(b);
    }
    const paint = () => {
      const f = audio.duration ? audio.currentTime / audio.duration : 0;
      bars.forEach((b, i) => b.classList.toggle('on', i / N < f));
      if (!audio.paused) requestAnimationFrame(paint);
    };
    btn.addEventListener('click', () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); });
    audio.addEventListener('play', () => { btn.setAttribute('aria-pressed', 'true'); btn.setAttribute('aria-label', 'Pause the song'); paint(); });
    audio.addEventListener('pause', () => { btn.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-label', 'Play the song (10 seconds)'); });
    audio.addEventListener('ended', () => { bars.forEach((b) => b.classList.remove('on')); });
  }

  const y = document.querySelector('[data-year]');
  if (y) y.textContent = String(new Date().getFullYear());
})();
