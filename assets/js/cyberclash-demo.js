/* Fig. 4 — CyberClash, playable. Rules and search live in cyberclash-core.js;
   this file only draws the network and handles turns. */
(function () {
  'use strict';

  var CC = window.CyberClash;
  var svg = document.getElementById('cc-graph');
  if (!CC || !svg) return;

  var NS = 'http://www.w3.org/2000/svg';
  // Two layouts of the same graph: wide for desktop, tall for phones.
  var LAYOUTS = {
    wide: {
      box: '0 0 640 280',
      pos: {
        H0: [42, 135], H1: [142, 68], H2: [142, 206], H3: [256, 52], H4: [256, 192],
        H5: [376, 52], H6: [376, 182], H7: [482, 112], H8: [556, 194], H9: [600, 78]
      },
      note: { H0: [0, 46], H5: [0, -34] }
    },
    tall: {
      box: '0 0 340 440',
      pos: {
        H0: [170, 40], H1: [92, 112], H2: [250, 112], H3: [62, 200], H4: [232, 200],
        H5: [62, 292], H6: [204, 292], H7: [140, 366], H8: [240, 404], H9: [300, 326]
      },
      note: { H0: [62, 4], H5: [0, 47] }
    }
  };
  var NOTE = { H0: 'entry', H5: 'database' };
  var narrow = window.matchMedia ? matchMedia('(max-width: 620px)') : null;

  var $ = function (id) { return document.getElementById(id); };
  var actionsEl = $('cc-actions'), statusEl = $('cc-status');
  var plyEl = $('cc-ply'), budgetEl = $('cc-budget'), zeroEl = $('cc-zero'), utilEl = $('cc-util');
  var searchEl = $('cc-search'), barMM = $('cc-bar-mm'), barAB = $('cc-bar-ab');
  var nMM = $('cc-n-mm'), nAB = $('cc-n-ab'), noteEl = $('cc-search-note');
  var depthEl = $('cc-depth'), sideBtns = document.querySelectorAll('#cc-side button');

  var human = 'attacker';
  var state, selected, thinking, aiTimer;
  var nodes = {}, edges = [];

  function el(name, attrs, text) {
    var node = document.createElementNS(NS, name);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function has(list, host) { return list.indexOf(host) !== -1; }

  // ---- draw the network once, then position it for the current layout ----
  (function build() {
    var seen = {};
    CC.HOSTS.forEach(function (a) {
      CC.NETWORK[a].forEach(function (b) {
        var key = [a, b].sort().join('-');
        if (seen[key]) return;
        seen[key] = true;
        var line = el('line', { 'class': 'cc-edge' });
        svg.appendChild(line);
        edges.push({ a: a, b: b, line: line });
      });
    });

    CC.HOSTS.forEach(function (host) {
      var g = el('g', { 'class': 'cc-node' + (host === CC.TARGET_HOST ? ' target' : '') });
      g.appendChild(el('circle', { 'class': 'ring', r: 31 }));
      g.appendChild(el('circle', { 'class': 'shield', r: 26.5 }));
      g.appendChild(el('circle', { 'class': 'body', r: 22 }));
      g.appendChild(el('text', { 'class': 'id', y: 0 }, host));
      g.appendChild(el('text', { 'class': 'val', y: 13 }, host === CC.START_HOST ? '·' : String(CC.ASSET_VALUES[host])));
      if (NOTE[host]) g.appendChild(el('text', { 'class': 'val note' }, NOTE[host]));
      g.addEventListener('click', function () { pick(host); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(host); }
      });
      svg.appendChild(g);
      nodes[host] = g;
    });
  })();

  function place() {
    var layout = LAYOUTS[narrow && narrow.matches ? 'tall' : 'wide'];
    svg.setAttribute('viewBox', layout.box);
    svg.classList.toggle('tall', layout === LAYOUTS.tall);
    edges.forEach(function (edge) {
      edge.line.setAttribute('x1', layout.pos[edge.a][0]);
      edge.line.setAttribute('y1', layout.pos[edge.a][1]);
      edge.line.setAttribute('x2', layout.pos[edge.b][0]);
      edge.line.setAttribute('y2', layout.pos[edge.b][1]);
    });
    CC.HOSTS.forEach(function (host) {
      nodes[host].setAttribute('transform', 'translate(' + layout.pos[host][0] + ' ' + layout.pos[host][1] + ')');
      var note = nodes[host].querySelector('.note');
      if (note) {
        note.setAttribute('x', layout.note[host][0]);
        note.setAttribute('y', layout.note[host][1]);
      }
    });
  }
  place();
  if (narrow) {
    if (narrow.addEventListener) narrow.addEventListener('change', place);
    else if (narrow.addListener) narrow.addListener(place);
  }

  // ---- wording ----
  function label(action) {
    var type = action[0], host = action[1];
    if (type === 'Exfiltrate') return 'Exfiltrate the database';
    if (type === 'Pass') return 'Pass';
    if (type === 'ZeroDay') return 'Zero-day ' + host;
    if (CC.COSTS[type]) return type + ' ' + host + ' · ' + CC.COSTS[type];
    return type + ' ' + host;
  }
  function past(action) {
    var type = action[0], host = action[1];
    switch (type) {
      case 'Exploit': return 'exploited ' + host;
      case 'ZeroDay': return 'burned the zero-day on patched ' + host;
      case 'Exfiltrate': return 'exfiltrated the database';
      case 'Patch': return 'patched ' + host;
      case 'Isolate': return 'isolated ' + host;
      case 'Restore': return 'restored ' + host;
      default: return 'passed';
    }
  }
  function signed(n) { return n < 0 ? '−' + Math.abs(n) : String(n); }

  // ---- rendering ----
  function hostActions(host) {
    if (thinking || state.player !== human || CC.isTerminal(state)) return [];
    return CC.legalActions(state).filter(function (a) { return a[1] === host; });
  }

  function render() {
    var over = CC.isTerminal(state);
    var myTurn = !over && !thinking && state.player === human;
    var legal = myTurn ? CC.legalActions(state) : [];

    plyEl.textContent = state.ply + ' / ' + CC.MAX_PLIES;
    budgetEl.textContent = state.budget;
    zeroEl.textContent = state.zeroDay ? 'ready' : 'spent';
    utilEl.textContent = signed(CC.utility(state));

    CC.HOSTS.forEach(function (host) {
      var g = nodes[host];
      var can = legal.some(function (a) { return a[1] === host; });
      g.classList.toggle('compromised', has(state.compromised, host));
      g.classList.toggle('patched', has(state.patched, host));
      g.classList.toggle('isolated', has(state.isolated, host));
      g.classList.toggle('can', can);
      g.classList.toggle('sel', can && selected === host);
      if (can) {
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
      } else {
        g.removeAttribute('tabindex');
        g.removeAttribute('role');
      }
      var bits = [host, 'value ' + CC.ASSET_VALUES[host]];
      if (has(state.compromised, host)) bits.push('compromised');
      if (has(state.patched, host)) bits.push('patched');
      if (has(state.isolated, host)) bits.push('isolated');
      g.setAttribute('aria-label', bits.join(', '));
    });

    edges.forEach(function (edge) {
      var cut = has(state.isolated, edge.a) || has(state.isolated, edge.b);
      edge.line.classList.toggle('cut', cut);
      edge.line.classList.toggle('hot', !cut && has(state.compromised, edge.a) && has(state.compromised, edge.b));
    });

    actionsEl.innerHTML = '';
    if (over) {
      addButton('Play again', reset, true);
      return;
    }
    if (!myTurn) {
      addHint('The AI is searching…');
      return;
    }
    var shown = legal.filter(function (a) { return a[1] === null || a[1] === selected; });
    shown.sort(function (a, b) { return (a[1] === null) - (b[1] === null); });
    shown.forEach(function (action) {
      addButton(label(action), function () { move(action); }, action[0] === 'Exfiltrate' || action[1] !== null);
    });
    if (!selected) {
      addHint(human === 'attacker' ? 'or click a ringed host to attack it' : 'or click a ringed host to defend it');
    }
  }

  function addButton(text, handler, primary) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm' + (primary ? ' btn-solid' : '');
    b.textContent = text;
    b.addEventListener('click', handler);
    actionsEl.appendChild(b);
  }
  function addHint(text) {
    var s = document.createElement('span');
    s.className = 'hint';
    s.textContent = text;
    actionsEl.appendChild(s);
  }

  // ---- turns ----
  function pick(host) {
    var options = hostActions(host);
    if (!options.length) return;
    if (options.length === 1 && human === 'attacker') { move(options[0]); return; }
    selected = selected === host ? null : host;
    render();
  }

  function move(action) {
    var who = state.player === human ? 'You' : 'The AI';
    state = CC.applyAction(state, action);
    selected = null;
    var line = who + ' ' + past(action) + '.';
    if (CC.isTerminal(state)) {
      finish(line);
      return line;
    }
    if (state.player !== human) aiTurn(line);
    return line;
  }

  function aiTurn(prefix) {
    thinking = true;
    render();
    statusEl.textContent = (prefix ? prefix + ' ' : '') + 'The AI is thinking…';
    aiTimer = setTimeout(function () {
      var depth = parseInt(depthEl.value, 10);
      var mm = CC.minimax(state, depth);
      var ab = CC.alphaBeta(state, depth);
      thinking = false;
      showSearch(mm, ab, depth);
      var line = move(ab.action);
      if (!CC.isTerminal(state)) {
        statusEl.innerHTML = (prefix ? prefix + ' ' : '') + '<b>' + line + '</b> Your move.';
        render();
      }
    }, 650);
  }

  function showSearch(mm, ab, depth) {
    searchEl.hidden = false;
    nMM.textContent = mm.expanded;
    nAB.textContent = ab.expanded;
    barMM.style.width = '100%';
    barAB.style.width = Math.max(2, Math.round((ab.expanded / mm.expanded) * 100)) + '%';
    var saved = mm.expanded - ab.expanded;
    noteEl.textContent = saved > 0
      ? 'Same move, same value (' + signed(ab.score) + ') at depth ' + depth + ' — Alpha-Beta expanded ' +
        Math.round((saved / mm.expanded) * 100) + '% fewer nodes and cut ' + ab.pruned + ' branches.'
      : 'Same move and value (' + signed(ab.score) + ') at depth ' + depth + '. Nothing could be pruned in this position — the gap opens up with more plies left and a deeper search.';
  }

  function finish(lastLine) {
    thinking = false;
    render();
    var result = state.exfiltrated
      ? '<span class="bad">Database exfiltrated.</span>'
      : '<span class="ok">Ten plies played and the database held.</span>';
    statusEl.innerHTML = lastLine + ' ' + result + ' Final utility <b>' + signed(CC.utility(state)) +
      '</b> — the defender wants it high, the attacker low.';
  }

  function reset() {
    clearTimeout(aiTimer);
    state = CC.initialState();
    selected = null;
    thinking = false;
    searchEl.hidden = true;
    if (human === 'attacker') {
      statusEl.textContent = 'You start on H0. Reach H5 and exfiltrate the database within ten plies.';
      render();
    } else {
      aiTurn('');
    }
  }

  sideBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      human = btn.getAttribute('data-side');
      sideBtns.forEach(function (other) {
        var on = other === btn;
        other.classList.toggle('on', on);
        other.setAttribute('aria-pressed', String(on));
      });
      reset();
    });
  });
  $('cc-reset').addEventListener('click', reset);

  reset();
})();
