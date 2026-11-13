/**
 * Sightline — submission film. Every visual property is a pure function of `t`; there are
 * no CSS transitions, timers or state carried between frames, so any frame can be rendered
 * on its own and the same time always produces the same picture.
 *
 * The one shape is the sheet: a letter becomes the enclave slab, the reading, the receipt
 * and finally a line under the wordmark. Content inside it swaps with a short blur.
 */
(function () {
  const TL = window.TL;
  const M = TL.marks;
  const S = TL.sceneStarts;
  const DUR = TL.duration;

  const $ = (id) => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const mix = (a, b, p) => a + (b - a) * p;
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

  /** Closed-form damped spring step, 0 at `at` and settling to 1. */
  function spring(t, at, k, c, v0) {
    const dt = t - at;
    if (dt <= 0) return 0;
    const w0 = Math.sqrt(k);
    const zeta = (c || 22) / (2 * w0);
    if (zeta >= 1) return 1 - Math.exp(-w0 * dt) * (1 + w0 * dt);
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const A = (v0 || 0) / wd;
    return 1 - Math.exp(-zeta * w0 * dt) * (Math.cos(wd * dt) + (zeta * w0 / wd + A) * Math.sin(wd * dt));
  }

  const stage = $('stage');
  const sheet = $('sheet');
  const sheetBg = $('sheet-bg');
  const sheetDark = $('sheet-dark');
  const sheetEdge = $('sheet-edge');
  const chrome = [$('slug'), $('sceneNo')];

  // ---- the cover: the redaction that becomes the enclave -------------------
  const scrim = document.createElement('div');
  scrim.style.cssText =
    'position:absolute;inset:0;border-radius:18px;background:rgba(11,13,8,0.86);opacity:0;z-index:5';
  sheet.appendChild(scrim);

  const cover = document.createElement('div');
  cover.style.cssText =
    'position:absolute;inset:0;border-radius:18px;background:#12140f;transform-origin:50% 0;' +
    'transform:scaleY(0);opacity:0;z-index:2;box-shadow:0 0 0 1px rgba(18,20,15,0.9)';
  sheet.appendChild(cover);

  // ---- static content -----------------------------------------------------
  const CHECKS_PASS = [
    'quote_is_tdx', 'td_not_debug', 'quote_binds_our_nonce', 'quote_binds_attested_key',
    'quote_binds_compose_hash', 'quote_matches_report_measurements', 'event_log_replays_rtmr0_to_2',
    'nonce_fresh', 'attestation_report', 'response_signature', 'signed_by_model_enclave', 'td_attributes_allowed',
  ];
  const CHECKS_GAP = ['quote_signed_by_hardware', 'platform_still_trusted', 'gpu_evidence_verdict', 'report_expiry'];

  const checksEl = $('checks');
  const checkRows = [];
  for (const name of CHECKS_PASS) {
    const d = document.createElement('div');
    d.className = 'chk';
    d.innerHTML = '<span class="dot"></span><span>' + name + '</span>';
    checksEl.appendChild(d);
    checkRows.push(d);
  }
  for (const name of CHECKS_GAP) {
    const d = document.createElement('div');
    d.className = 'chk gap';
    d.innerHTML = '<span class="dot"></span><span>' + name + '</span>';
    checksEl.appendChild(d);
    checkRows.push(d);
  }

  const FACTS = [
    ['MEDICINE', 'sertraline 50 mg tablets'],
    ['DOSE', 'one tablet every morning'],
    ['CLINIC', 'Tuesday 17 March 2026, 10:15, Room 4'],
  ];
  const factsEl = $('facts');
  const factRows = FACTS.map(([k, v]) => {
    const d = document.createElement('div');
    d.className = 'fact';
    d.innerHTML = '<div class="fk">' + k + '</div><div class="fv">' + v + '</div>';
    factsEl.appendChild(d);
    return d;
  });

  const RECEIPT = [
    ['model', 'z-ai/glm-5.3-flash', true],
    ['response_signature', 'verified', true],
    ['signed_by_model_enclave', 'verified', true],
    ['checks passed', '12 of 16', true],
    ['quote_signed_by_hardware', 'could not run', false],
    ['platform_still_trusted', 'could not run', false],
    ['gpu_evidence_verdict', 'could not run', false],
    ['report_expiry', 'could not run', false],
  ];
  const rGrid = $('rGrid');
  const receiptRows = RECEIPT.map(([k, v, ok]) => {
    const d = document.createElement('div');
    d.className = 'r-row' + (ok ? ' ok' : '');
    d.innerHTML = '<span>' + k + '</span><b>' + v + '</b>';
    rGrid.appendChild(d);
    return d;
  });

  const HL = [
    { el: $('pgMed'), u: $('u1') },
    { el: $('pgDose'), u: $('u2') },
    { el: $('pgClinic'), u: $('u3') },
  ];

  const askText = $('askText');
  const QUESTION = 'When should I take it?';
  const qa1 = $('qa1');
  const qa2 = $('qa2');
  const qunder = $('qunder');
  const doseSpan = $('pgDose2');

  // underline sits under the real span, measured once after layout
  let underline = { left: 0, top: 0, width: 0 };
  function measureHighlights() {
    const c5 = $('c5').getBoundingClientRect();
    const scale = c5.width / $('c5').offsetWidth || 1;
    for (const h of HL) {
      const b = h.el.getBoundingClientRect();
      h.u.style.left = (b.left - c5.left) / scale + 'px';
      h.u.style.top = (b.bottom - c5.top) / scale + 1 + 'px';
      h.u.dataset.w = String(b.width / scale);
    }
  }

  function measureUnderline() {
    const box = doseSpan.getBoundingClientRect();
    const c6 = $('c6').getBoundingClientRect();
    const scale = c6.width / $('c6').offsetWidth || 1;
    underline = {
      left: (box.left - c6.left) / scale,
      top: (box.bottom - c6.top) / scale + 2,
      width: box.width / scale,
    };
  }

  // ---- cursor choreography ------------------------------------------------
  const CURSOR = [
    { t: 26.0, x: 1520, y: 980 },
    { t: 27.1, x: 1030, y: 655 },
    { t: 27.55, x: 1030, y: 655, click: true },
    { t: 30.6, x: 1230, y: 560 },
    { t: 36.4, x: 560, y: 300 },
    { t: 40.2, x: 1210, y: 340 },
    { t: 44.6, x: 1270, y: 620 },
    { t: 50.2, x: 1010, y: 960 },
    { t: 54.0, x: 700, y: 760 },
    { t: 66.0, x: 940, y: 700 },
    { t: 70.6, x: 1150, y: 500 },
    { t: 72.75, x: 1150, y: 500, click: true },
    { t: 78.4, x: 1090, y: 760 },
    { t: 83.0, x: 1500, y: 900 },
    { t: 95.5, x: 1010, y: 640 },
    { t: 97.23, x: 960, y: 600, click: true },
    { t: 98.6, x: 1240, y: 780 },
  ];
  const cursorEl = $('cursor');
  const ripple = $('ripple');
  const WINDOWS = [[25.6, 33.6], [67.6, 83.6], [95.2, 99.2]];

  function cursorAt(t) {
    let i = 0;
    while (i < CURSOR.length - 1 && CURSOR[i + 1].t <= t) i++;
    const a = CURSOR[i];
    const b = CURSOR[Math.min(i + 1, CURSOR.length - 1)];
    const p = ease(seg(t, a.t, b.t));
    return { x: mix(a.x, b.x, p), y: mix(a.y, b.y, p), clickAt: CURSOR.filter((c) => c.click).map((c) => c.t) };
  }

  // ---- geometry -----------------------------------------------------------
  const KEYS = [
    { t: -1, w: 760, h: 980, x: 900, y: 520, r: -1.4 },
    { t: S[1], w: 700, h: 900, x: 960, y: 540, r: 0 },
    { t: M.statLine, w: 1300, h: 760, x: 960, y: 540, r: 0 },
    { t: S[3], w: 1490, h: 800, x: 960, y: 540, r: 0 },
    { t: S[4], w: 1540, h: 830, x: 960, y: 540, r: 0 },
    { t: S[6], w: 1440, h: 790, x: 960, y: 540, r: 0 },
  ];

  function geometry(t) {
    let g = { ...KEYS[0] };
    for (let i = 1; i < KEYS.length; i++) {
      const k = KEYS[i];
      const p = spring(t, k.t, 155, 27);
      g = {
        w: mix(g.w, k.w, p), h: mix(g.h, k.h, p),
        x: mix(g.x, k.x, p), y: mix(g.y, k.y, p), r: mix(g.r, k.r, p),
      };
    }
    return g;
  }

  /** Content window: fade in at `a`, out at `b`, with a short blur on each edge. */
  function windowFor(t, a, b, fi, fo) {
    fi = fi === undefined ? 0.5 : fi;
    fo = fo === undefined ? 0.42 : fo;
    const i = ease(seg(t, a, a + fi));
    const o = 1 - ease(seg(t, b - fo, b));
    return Math.min(i, o);
  }

  // Each swap overlaps its neighbour by ~0.25 s on both sides, so the blur crossfade
  // never lands on an empty frame.
  const GROUPS = [
    { el: $('c1'), a: -0.4, b: M.statLine + 0.3 },
    { el: $('c2'), a: M.statLine - 0.25, b: S[2] + 0.25 },
    { el: $('c3'), a: S[2] - 0.25, b: S[3] + 0.25 },
    { el: $('c4'), a: S[3] - 0.25, b: S[4] + 0.25 },
    { el: $('c5'), a: S[4] - 0.25, b: S[5] + 0.25 },
    { el: $('c6'), a: S[5] - 0.25, b: S[6] + 0.25 },
    { el: $('c7'), a: S[6] - 0.25, b: S[7] + 0.95 },
  ];

  function draw(t) {
    const g = geometry(t);
    const collapse = ease(seg(t, M.forget + 0.05, M.forget + 0.85));

    sheet.style.width = g.w + 'px';
    sheet.style.height = g.h + 'px';
    sheet.style.transform =
      'translate(' + (g.x - g.w / 2) + 'px,' + (g.y - g.h / 2) + 'px) rotate(' + g.r + 'deg) ' +
      'scaleY(' + (1 - 0.985 * collapse) + ') scale(' +
      (1 + 0.014 * ease(seg(t, S[4], S[5])) + 0.008 * ease(seg(t, S[6], S[7])) +
       0.01 * ease(seg(t, M.wordmark, DUR))) + ')';
    sheet.style.opacity = String(1 - collapse);
    sheetBg.style.borderRadius = mix(18, 26, spring(t, S[2], 120, 24)) + 'px';

    // dark rungs: the page, gone; the enclave; the reading; the receipt
    let dark = 0;
    dark = mix(dark, 1, spring(t, S[2] - 0.75, 120, 24));
    dark = mix(dark, 0, spring(t, S[4] - 0.7, 120, 24));
    dark = mix(dark, 1, spring(t, S[6] - 0.7, 120, 24));
    dark = mix(dark, 0, spring(t, M.forget + 0.5, 110, 24));
    sheetDark.style.opacity = String(clamp(dark, 0, 1));
    sheetEdge.style.opacity = String(dark > 0.2 ? clamp((dark - 0.2) / 0.6, 0, 1) * 0.9 : 0);
    const light = dark > 0.5;
    chrome.forEach((el) => el.classList.toggle('light', light));

    // content windows
    for (const grp of GROUPS) {
      const o = windowFor(t, grp.a, grp.b);
      const inP = ease(seg(t, grp.a, grp.a + 0.55));
      grp.el.style.opacity = String(o);
      grp.el.style.filter = o <= 0.001 ? 'none' : 'blur(' + (1 - o) * 7 + 'px)';
      grp.el.style.transform = 'translateY(' + (1 - inP) * 16 + 'px)';
    }

    // scene 1 redactions
    const bars = [
      ['redName', 2.9, 132],
      ['redMed', 6.4, 300],
      ['redDose', 8.0, 372],
    ];
    for (const [id, at, w] of bars) {
      const el = $(id);
      const p = spring(t, at, 190, 26);
      el.style.width = w * p + 'px';
      el.style.opacity = t >= at ? '1' : '0';
    }

    // the full cover during the trade-off
    const cov = spring(t, M.redact1, 95, 22);
    cover.style.transform = 'scaleY(' + cov + ')';
    cover.style.opacity = cov > 0.001 && t < S[2] + 0.5 ? '1' : '0';
    cover.style.boxShadow =
      '0 0 0 1px rgba(18,20,15,0.9), 0 0 0 ' + (2 + 8 * (1 - spring(t, M.redact2, 160, 20))) + 'px rgba(0,236,151,0.10)';

    // side labels
    const lp = windowFor(t, M.redact1 - 0.1, S[2] - 0.6, 0.5, 0.45);
    const la = windowFor(t, M.redact2 - 0.1, S[2] - 0.6, 0.5, 0.45);
    $('lblPerson').style.opacity = String(lp);
    $('rulePerson').style.opacity = String(lp * 0.9);
    $('lblAI').style.opacity = String(la);
    $('ruleAI').style.opacity = String(la * 0.9);
    $('lblPerson').style.transform = 'translateX(' + (1 - lp) * -20 + 'px)';
    $('lblAI').style.transform = 'translateX(' + (1 - la) * 20 + 'px)';

    // stat line scale-settles onto the cover
    const statP = spring(t, M.statLine + 0.05, 150, 24);
    $('statBig').style.transform = 'scale(' + mix(1.16, 1, statP) + ')';
    $('statBig').style.opacity = String(ease(seg(t, M.statLine + 0.05, M.statLine + 0.6)));
    $('statSub').style.opacity = String(ease(seg(t, M.statLine + 0.5, M.statLine + 1.2)));

    // scene 3: pages land, the scan runs, the seal stamps
    const stack = $('pageStack');
    stack.style.opacity = String(ease(seg(t, S[2] + 0.35, S[2] + 0.8)));
    stack.style.transform = 'translateY(' + (1 - spring(t, S[2] + 0.35, 150, 24)) * 26 + 'px)';
    const ps = seg(t, S[3] + 1.2, S[3] + 7.5);
    const proofScan = $('proofScan');
    proofScan.style.opacity = String(ps > 0 && ps < 1 ? 0.9 : 0);
    proofScan.style.left = mix(700, 1430, ps) + 'px';
    const scanP = seg(t, M.shutter - 0.1, M.shutter + 1.5);
    $('scan').style.opacity = String(scanP > 0 && scanP < 1 ? 1 : 0);
    $('scan').style.top = mix(90, 700, scanP) + 'px';
    const sealP = spring(t, M.seal, 150, 18);
    $('sealRing').style.opacity = String(clamp(sealP * 2, 0, 1));
    $('sealRing').style.transform = 'scale(' + mix(1.45, 1, sealP) + ')';

    // scene 4: checks light up one at a time, then the send gate opens
    checkRows.forEach((row, i) => {
      const at = M.checks[i];
      const on = ease(seg(t, at, at + 0.18));
      row.style.opacity = String(0.25 + 0.75 * on);
      row.classList.toggle('pass', on > 0.5 && i < CHECKS_PASS.length);
    });
    const zeroP = spring(t, M.zeroBytes, 170, 26);
    const pill = $('bytesPill');
    if (zeroP > 0.001) {
      pill.textContent = zeroP > 0.55 ? 'CHECKS PASSED · SENDING 1 PAGE' : '0 BYTES SENT';
      pill.style.color = zeroP > 0.55 ? '#042a1c' : 'rgba(242,238,228,0.8)';
      pill.style.background = 'rgba(0,236,151,' + clamp(zeroP, 0, 1) + ')';
      pill.style.borderColor = 'rgba(0,236,151,' + clamp(zeroP, 0, 1) + ')';
    } else {
      pill.textContent = '0 BYTES SENT';
      pill.style.background = 'transparent';
      pill.style.color = 'rgba(242,238,228,0.8)';
    }

    // scene 5: the reading builds
    factRows.forEach((row, i) => {
      const at = M.resultsIn + 0.9 + i * 0.62;
      const p = spring(t, at, 170, 25);
      row.style.opacity = String(clamp(p * 1.6, 0, 1));
      row.style.transform = 'translateY(' + (1 - p) * 12 + 'px)';
    });
    HL.forEach((h, i) => {
      const p = spring(t, M.resultsIn + 1.1 + i * 1.15, 170, 25);
      h.u.style.width = Number(h.u.dataset.w || 0) * p + 'px';
      h.u.style.opacity = String(clamp(p * 1.5, 0, 1));
    });
    const sumP = spring(t, M.resultsIn, 160, 25);
    $('sumText').style.opacity = String(clamp(sumP * 1.5, 0, 1));
    const actP = spring(t, M.resultsIn + 2.2, 160, 25);
    $('actionRow').style.opacity = String(clamp(actP * 1.5, 0, 1));
    $('actionRow').style.transform = 'translateY(' + (1 - actP) * 10 + 'px)';
    $('notice').style.opacity = String(clamp(spring(t, M.resultsIn + 3.1, 160, 25) * 1.5, 0, 1));

    // scene 6: typing, answers, the underline
    const typed = Math.floor(clamp((t - M.askType) / 0.055, 0, QUESTION.length));
    askText.textContent = QUESTION.slice(0, typed);
    $('askCaret').style.opacity = t > M.askType - 0.6 && t < M.answer1 ? String((Math.floor(t * 3) % 2) * 0.9) : '0';
    const a1 = spring(t, M.answer1, 165, 25);
    const a2 = spring(t, M.answer2, 165, 25);
    qa1.style.opacity = String(clamp(a1 * 1.6, 0, 1));
    qa1.style.transform = 'translateY(' + (1 - a1) * 14 + 'px)';
    qa2.style.opacity = String(clamp(a2 * 1.6, 0, 1));
    qa2.style.transform = 'translateY(' + (1 - a2) * 14 + 'px)';
    const qP = spring(t, M.quoteReveal, 170, 24);
    qunder.style.left = underline.left + 'px';
    qunder.style.top = underline.top + 'px';
    qunder.style.width = underline.width * qP + 'px';
    qunder.style.opacity = String(clamp(qP * 1.5, 0, 1));

    // scene 7: the receipt resolves
    receiptRows.forEach((row, i) => {
      const p = spring(t, M.receiptIn + i * 0.22, 170, 25);
      row.style.opacity = String(clamp(p * 1.6, 0, 1));
    });
    const sigP = spring(t, M.signature, 190, 22);
    $('rStored').style.opacity = String(clamp(sigP * 1.4, 0, 1));
    $('rStored').style.transform = 'translateY(' + (1 - sigP) * 10 + 'px)';
    // storage counts down to zero as the receipt confirms the signature
    const stored = 4.2 * (1 - clamp(sigP, 0, 1));
    $('rStored').querySelector('.big').textContent = sigP > 0.985 ? '0 KB' : stored.toFixed(1) + ' KB';

    // scene 8: forget, line, wordmark
      scrim.style.opacity = String(windowFor(t, S[7] + 0.45, M.forget + 0.75, 0.45, 0.45) * 0.92);
    const btn = windowFor(t, S[7] + 0.35, M.forget + 0.35, 0.4, 0.35);
    const btnPress = 1 - 0.08 * ease(seg(t, M.forget - 0.08, M.forget)) * (1 - ease(seg(t, M.forget + 0.12, M.forget + 0.5)));
    $('forgetBtn').style.opacity = String(btn);
    $('forgetBtn').style.transform = 'translate(-50%, -50%) scale(' + btnPress + ')';

    const lineP = spring(t, M.forget + 0.3, 130, 26);
    const lineW = mix(0, 880, lineP) * (1 - ease(seg(t, M.wordmark - 0.1, M.wordmark + 0.5)));
    $('lineOut').style.width = lineW + 'px';
    $('lineOut').style.transform = 'translateX(-50%)';
    $('lineOut').style.opacity = String(clamp(lineP * 1.6, 0, 1) * (1 - ease(seg(t, M.wordmark - 0.1, M.wordmark + 0.5))));
    $('lineOut').style.background = '#00ec97';
    $('wipeNote').style.opacity = String(windowFor(t, M.forget + 2.1, M.wordmark - 0.5, 0.6, 0.5));

    const brandP = spring(t, M.wordmark - 0.45, 130, 22);
    $('brand').style.opacity = String(clamp(brandP * 1.5, 0, 1));
    $('brand').style.transform = 'scale(' + (1 + 0.016 * ease(seg(t, M.wordmark, DUR))) + ')';
    $('wordmark').style.transform = 'translateY(' + (1 - spring(t, M.wordmark - 0.45, 150, 22)) * 40 + 'px';
    $('wordmark').style.letterSpacing = mix(0.06, -0.045, spring(t, M.wordmark - 0.45, 130, 22)) + 'em';
    $('tagline').style.opacity = String(ease(seg(t, M.wordmark + 0.5, M.wordmark + 1.2)));
    $('endline').style.opacity = String(ease(seg(t, M.wordmark + 0.9, M.wordmark + 1.6)));
    $('endline').style.transform = 'translateY(' + (1 - spring(t, M.wordmark + 0.9, 160, 24)) * 12 + 'px';
    $('url').style.opacity = String(ease(seg(t, M.wordmark + 1.8, M.wordmark + 2.5)));

    // cursor
    let curVisible = 0;
    for (const [a, b] of WINDOWS) curVisible = Math.max(curVisible, windowFor(t, a, b, 0.35, 0.3));
    const cur = cursorAt(t);
    const press = 1 - 0.14 * cursorPress(t);
    cursorEl.style.opacity = String(curVisible);
    cursorEl.style.transform = 'translate(' + cur.x + 'px,' + cur.y + 'px) scale(' + press + ')';
    const sinceClick = M.checks.concat([M.shutter, M.askType ? 0 : 0]).length;
    const clickTimes = [27.55, 72.75, 97.23];
    let rip = 0;
    let ripAt = 0;
    for (const c of clickTimes) {
      if (t >= c) {
        const p = seg(t, c, c + 0.55);
        if (p < 1 && p > rip) { rip = p; ripAt = c; }
      }
    }
    ripple.style.opacity = String(rip > 0 ? (1 - rip) * 0.9 : 0);
    ripple.style.transform = 'scale(' + (0.4 + rip * 2.2) + ')';
    if (ripAt) {
      let i = 0;
      while (i < CURSOR.length - 1 && CURSOR[i + 1].t <= ripAt) i++;
      const c = CURSOR.find((x) => Math.abs(x.t - ripAt) < 0.01) || CURSOR[i];
      ripple.style.left = c.x + 'px';
      ripple.style.top = c.y + 'px';
    }

    // chrome
    let idx = 0;
    for (let i = 0; i < S.length; i++) if (t >= S[i] - 0.4) idx = i;
    $('sceneNo').textContent = String(idx + 1).padStart(2, '0') + ' / 08';
    $('slug').textContent = t > M.forget + 1 ? 'SIGHTLINE' : 'SIGHTLINE / NEAR HACKATHON 2026';
  }

  function cursorPress(t) {
    let p = 0;
    for (const c of [27.55, 72.75, 97.23]) {
      p = Math.max(p, ease(seg(t, c - 0.1, c)) * (1 - ease(seg(t, c + 0.06, c + 0.3))));
    }
    return p;
  }

  window.seek = function (t) {
    if (!underline.width) measureUnderline();
    draw(clamp(t, 0, DUR));
  };

  window.filmReady = true;
  window.filmMeta = { duration: DUR, fps: 60 };

  document.fonts.ready.then(() => {
    measureUnderline();
    measureHighlights();
    draw(0);
  });
  draw(0);
})();
