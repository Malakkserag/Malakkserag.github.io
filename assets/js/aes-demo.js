/* AES figures: the animated name in the hero (Fig. 0) and the stepper (Fig. 1).
   Both are driven by the real cipher in aes-core.js. */
(function () {
  'use strict';

  var AES = window.AES128;
  if (!AES) return;

  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var OPS = {
    input:       { name: 'Input',       sym: '→', text: 'The 16 bytes of the block are loaded into a 4×4 state, column by column.' },
    addRoundKey: { name: 'AddRoundKey', sym: '⊕', text: 'Every byte is XORed with the matching byte of the round key — the only step where the key enters.' },
    subBytes:    { name: 'SubBytes',    sym: 'S', text: 'Each byte is swapped for its S-box entry: an inverse in GF(2⁸) plus an affine map. The only non-linear step.' },
    shiftRows:   { name: 'ShiftRows',   sym: '⇇', text: 'Row r rotates left by r positions, so the bytes of one column spread out across all four.' },
    mixColumns:  { name: 'MixColumns',  sym: '×', text: 'Each column is multiplied by a fixed matrix over GF(2⁸); every output byte now depends on all four inputs.' }
  };

  function hex(b) { return (b < 16 ? '0' : '') + b.toString(16); }
  function hexString(bytes) { return bytes.map(hex).join(''); }
  function textBytes(str) {
    if (window.TextEncoder) return Array.prototype.slice.call(new TextEncoder().encode(str));
    return str.split('').map(function (ch) { return ch.charCodeAt(0) & 0xff; });
  }
  function printable(b) { return b >= 0x20 && b <= 0x7e; }
  // State is column-major; the DOM grid is row-major.
  function stateIndex(cell) { return (cell % 4) * 4 + Math.floor(cell / 4); }

  /* ------------------------------------------------------------------ */
  /* Fig. 0 — hero                                                       */
  /* ------------------------------------------------------------------ */
  (function hero() {
    var grid = document.getElementById('hero-aes-grid');
    if (!grid) return;
    var cells = grid.querySelectorAll('span');
    var pips = document.querySelectorAll('#hero-aes-rounds i');
    var phase = document.getElementById('hero-aes-phase');
    var out = document.getElementById('hero-aes-out');

    var plain = textBytes('MALAK SERAG 2028');
    var run = AES.trace(plain, textBytes('COMPUTERENGINEER'));
    var steps = run.steps;
    var cipherHex = hexString(run.ciphertext);
    var timer = null;
    var visible = true;

    function paint(i) {
      var step = steps[i];
      var prev = i > 0 ? steps[i - 1].state : null;
      var last = i === steps.length - 1;
      for (var c = 0; c < 16; c++) {
        var k = stateIndex(c);
        var cell = cells[c];
        if (i === 0) {
          cell.textContent = plain[k] === 0x20 ? ' ' : String.fromCharCode(plain[k]);
        } else {
          cell.textContent = hex(step.state[k]);
        }
        cell.classList.toggle('hot', !last && i > 0 && prev[k] !== step.state[k]);
        cell.classList.toggle('done', last);
      }
      for (var p = 0; p < pips.length; p++) pips[p].classList.toggle('on', i > 0 && p <= step.round);
      if (i === 0) phase.textContent = 'plaintext';
      else if (last) phase.textContent = 'ciphertext';
      else phase.textContent = 'round ' + step.round + ' · ' + OPS[step.op].name;
      out.textContent = last ? cipherHex : '················';
    }

    function play() {
      clearTimeout(timer);
      var i = 0;
      paint(0);
      (function tick() {
        if (!visible) return;
        var delay = i === 0 ? 1700 : 150;
        timer = setTimeout(function () {
          i++;
          paint(i);
          if (i < steps.length - 1) tick();
          else timer = setTimeout(play, 6500);
        }, delay);
      })();
    }

    if (reduceMotion) { paint(steps.length - 1); return; }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var now = entries[0].isIntersecting;
        if (now && !visible) { visible = true; play(); }
        else if (!now) { visible = false; clearTimeout(timer); }
      }, { threshold: 0.2 }).observe(grid);
    }
    play();
  })();

  /* ------------------------------------------------------------------ */
  /* Fig. 1 — stepper                                                    */
  /* ------------------------------------------------------------------ */
  (function stepper() {
    var rootEl = document.getElementById('aes-demo');
    if (!rootEl) return;

    var $ = function (id) { return document.getElementById(id); };
    var ptInput = $('aes-pt'), keyInput = $('aes-key');
    var errorEl = $('aes-error');
    var inEl = $('aes-in'), outEl = $('aes-out'), rkEl = $('aes-rk');
    var keyBlock = $('aes-key-block'), keyLabel = $('aes-key-label');
    var roundEl = $('aes-round'), opEl = $('aes-opname'), explainEl = $('aes-explain'), symEl = $('aes-op-sym');
    var scrub = $('aes-scrub'), countEl = $('aes-count'), cipherEl = $('aes-cipher');
    var prevBtn = $('aes-prev'), nextBtn = $('aes-next'), playBtn = $('aes-play');
    var modeBtns = rootEl.querySelectorAll('.seg button');

    var mode = 'text';
    var run = null;
    var plain = [];
    var idx = 0;
    var playTimer = null;

    function makeCells(el) {
      var cells = [];
      for (var i = 0; i < 16; i++) {
        var s = document.createElement('span');
        el.appendChild(s);
        cells.push(s);
      }
      return cells;
    }
    var inCells = makeCells(inEl), outCells = makeCells(outEl), rkCells = makeCells(rkEl);

    function parse(value, label) {
      if (mode === 'hex') {
        var clean = value.replace(/\s+/g, '');
        if (!/^[0-9a-fA-F]{32}$/.test(clean)) {
          throw new Error(label + ' needs exactly 32 hex digits (16 bytes) — it has ' + clean.length + '.');
        }
        var bytes = [];
        for (var i = 0; i < 32; i += 2) bytes.push(parseInt(clean.substr(i, 2), 16));
        return bytes;
      }
      var b = textBytes(value);
      if (b.length > 16) throw new Error(label + ' is ' + b.length + ' bytes; AES-128 works on exactly 16.');
      while (b.length < 16) b.push(0);   // short input is padded with zero bytes
      return b;
    }

    function compute() {
      try {
        plain = parse(ptInput.value, 'Plaintext');
        run = AES.trace(plain, parse(keyInput.value, 'Key'));
        errorEl.hidden = true;
        rootEl.classList.remove('invalid');
      } catch (e) {
        errorEl.textContent = e.message;
        errorEl.hidden = false;
        rootEl.classList.add('invalid');
        return false;
      }
      cipherEl.textContent = hexString(run.ciphertext);
      scrub.max = run.steps.length - 1;
      return true;
    }

    function render() {
      if (!run) return;
      var last = run.steps.length - 1;
      var step = run.steps[idx];
      var before = idx > 0 ? run.steps[idx - 1].state : step.state;
      var op = OPS[step.op];
      var showChars = idx === 0 && mode === 'text';

      for (var c = 0; c < 16; c++) {
        var k = stateIndex(c);
        inCells[c].textContent = showChars && printable(before[k]) ? String.fromCharCode(before[k]) : hex(before[k]);
        outCells[c].textContent = hex(step.state[k]);
        outCells[c].classList.toggle('hot', idx > 0 && before[k] !== step.state[k]);
        rkCells[c].textContent = hex(run.roundKeys[step.round][k]);
      }

      keyBlock.classList.toggle('idle', step.op !== 'addRoundKey');
      keyLabel.textContent = 'Round key ' + step.round;
      roundEl.textContent = step.round === 0 ? 'Round 0' : 'Round ' + step.round + ' of 10';
      opEl.textContent = op.name;
      symEl.textContent = op.sym;
      explainEl.textContent = idx === last
        ? 'Round 10 skips MixColumns. After this last key addition, the state is the ciphertext.'
        : op.text;
      scrub.value = idx;
      countEl.textContent = idx + ' / ' + last;
      prevBtn.disabled = idx === 0;
      nextBtn.disabled = idx === last;
    }

    function go(n) {
      if (!run) return;
      idx = Math.max(0, Math.min(run.steps.length - 1, n));
      render();
    }

    function stop() {
      clearInterval(playTimer);
      playTimer = null;
      rootEl.classList.remove('playing');
      playBtn.setAttribute('aria-label', 'Play');
    }

    function play() {
      if (!run) return;
      if (idx >= run.steps.length - 1) go(0);
      rootEl.classList.add('playing');
      playBtn.setAttribute('aria-label', 'Pause');
      playTimer = setInterval(function () {
        if (idx >= run.steps.length - 1) { stop(); return; }
        go(idx + 1);
      }, 700);
    }

    function onInput() {
      stop();
      if (compute()) go(idx);
    }

    function setMode(next) {
      if (next === mode) return;
      var fields = [ptInput, keyInput];
      var fallback = ['MALAK SERAG 2028', 'COMPUTERENGINEER'];
      fields.forEach(function (field, i) {
        var bytes;
        try { bytes = parse(field.value, ''); } catch (e) { bytes = textBytes(fallback[i]); }
        if (next === 'hex') {
          field.value = hexString(bytes);
        } else {
          while (bytes.length && bytes[bytes.length - 1] === 0) bytes.pop();
          field.value = bytes.every(printable) ? String.fromCharCode.apply(null, bytes) : fallback[i];
        }
      });
      mode = next;
      modeBtns.forEach(function (btn) {
        var on = btn.getAttribute('data-mode') === mode;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', String(on));
      });
      onInput();
    }

    ptInput.addEventListener('input', onInput);
    keyInput.addEventListener('input', onInput);
    $('aes-form').addEventListener('submit', function (e) { e.preventDefault(); });
    modeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); });
    });
    prevBtn.addEventListener('click', function () { stop(); go(idx - 1); });
    nextBtn.addEventListener('click', function () { stop(); go(idx + 1); });
    playBtn.addEventListener('click', function () { if (playTimer) stop(); else play(); });
    scrub.addEventListener('input', function () { stop(); go(parseInt(scrub.value, 10)); });

    compute();
    go(0);
  })();
})();
