/* CyberClash — game rules, Minimax and Alpha-Beta.
   A JavaScript port of github.com/Malakkserag/CyberClash-AI (src/network.py,
   game.py, minimax.py, alpha_beta.py). Rules, action ordering and node counting
   follow the Python version line for line. */
(function (root) {
  'use strict';

  var HOSTS = ['H0', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9'];

  var NETWORK = {
    H0: ['H1', 'H2'],
    H1: ['H0', 'H3', 'H4'],
    H2: ['H0', 'H4'],
    H3: ['H1', 'H5', 'H6'],
    H4: ['H1', 'H2', 'H6'],
    H5: ['H3', 'H7'],
    H6: ['H3', 'H4', 'H7'],
    H7: ['H5', 'H6', 'H8'],
    H8: ['H7', 'H9'],
    H9: ['H8']
  };

  var ASSET_VALUES = { H0: 0, H1: 10, H2: 15, H3: 30, H4: 10, H5: 100, H6: 60, H7: 25, H8: 20, H9: 40 };

  var START_HOST = 'H0';
  var TARGET_HOST = 'H5';
  var MAX_PLIES = 10;
  var INITIAL_BUDGET = 10;
  var PATCH_COST = 2;
  var ISOLATE_COST = 8;
  var RESTORE_COST = 5;

  function initialState() {
    return {
      compromised: [START_HOST],
      patched: [],
      isolated: [],
      budget: INITIAL_BUDGET,
      zeroDay: true,
      player: 'attacker',
      ply: 0,
      exfiltrated: false
    };
  }

  function has(list, host) { return list.indexOf(host) !== -1; }

  function isTerminal(s) {
    return s.exfiltrated || s.ply >= MAX_PLIES;
  }

  function attackerActions(s) {
    if (isTerminal(s)) return [];
    var actions = [];

    // The database can be stolen once H5 is compromised and still connected.
    if (has(s.compromised, TARGET_HOST) && !has(s.isolated, TARGET_HOST)) {
      actions.push(['Exfiltrate', null]);
    }

    HOSTS.forEach(function (host) {
      if (host === START_HOST) return;
      if (has(s.compromised, host) || has(s.isolated, host)) return;

      // Needs a live link to a compromised, non-isolated neighbour.
      var reachable = NETWORK[host].some(function (n) {
        return has(s.compromised, n) && !has(s.isolated, n);
      });
      if (!reachable) return;

      if (!has(s.patched, host)) actions.push(['Exploit', host]);
      else if (s.zeroDay) actions.push(['ZeroDay', host]);
    });

    actions.push(['Pass', null]);
    return actions;
  }

  function defenderActions(s) {
    if (isTerminal(s)) return [];
    var actions = [];

    HOSTS.forEach(function (host) {
      if (host === START_HOST) return;   // H0 can never be patched, isolated or restored
      if (!has(s.compromised, host) && !has(s.patched, host) && s.budget >= PATCH_COST) {
        actions.push(['Patch', host]);
      }
      if (!has(s.isolated, host) && s.budget >= ISOLATE_COST) {
        actions.push(['Isolate', host]);
      }
      if (has(s.compromised, host) && s.budget >= RESTORE_COST) {
        actions.push(['Restore', host]);
      }
    });

    actions.push(['Pass', null]);
    return actions;
  }

  function legalActions(s) {
    return s.player === 'attacker' ? attackerActions(s) : defenderActions(s);
  }

  // Returns a new state; never mutates the one passed in.
  function applyAction(s, action) {
    var type = action[0], host = action[1];
    var n = {
      compromised: s.compromised.slice(),
      patched: s.patched.slice(),
      isolated: s.isolated.slice(),
      budget: s.budget,
      zeroDay: s.zeroDay,
      player: s.player === 'attacker' ? 'defender' : 'attacker',
      ply: s.ply + 1,
      exfiltrated: s.exfiltrated
    };

    if (type === 'Exploit') {
      n.compromised.push(host);
    } else if (type === 'ZeroDay') {
      n.compromised.push(host);
      n.zeroDay = false;
    } else if (type === 'Exfiltrate') {
      n.exfiltrated = true;
    } else if (type === 'Patch') {
      n.patched.push(host);
      n.budget -= PATCH_COST;
    } else if (type === 'Isolate') {
      n.isolated.push(host);
      n.budget -= ISOLATE_COST;
    } else if (type === 'Restore') {
      n.compromised.splice(n.compromised.indexOf(host), 1);
      if (!has(n.patched, host)) n.patched.push(host);
      n.budget -= RESTORE_COST;
    }
    return n;
  }

  // Defender's utility: higher is better for the defender.
  function utility(s) {
    var damage = s.compromised.reduce(function (sum, h) { return sum + ASSET_VALUES[h]; }, 0);
    var spent = INITIAL_BUDGET - s.budget;
    return -damage - spent - (s.exfiltrated ? 100 : 0);
  }

  // depth = null searches to terminal states.
  function minimax(state, depth) {
    var stats = { expanded: 0, leaves: 0 };

    function search(s, remaining) {
      if (isTerminal(s) || remaining === 0) {
        stats.leaves++;
        return [utility(s), null];
      }
      stats.expanded++;

      var minimizing = s.player === 'attacker';
      var actions = legalActions(s);
      var best = minimizing ? Infinity : -Infinity;
      var bestAction = null;
      var next = remaining === null ? null : remaining - 1;

      for (var i = 0; i < actions.length; i++) {
        var score = search(applyAction(s, actions[i]), next)[0];
        if (minimizing ? score < best : score > best) {
          best = score;
          bestAction = actions[i];
        }
      }
      return [best, bestAction];
    }

    var result = search(state, depth === undefined ? null : depth);
    return { score: result[0], action: result[1], expanded: stats.expanded, leaves: stats.leaves, pruned: 0 };
  }

  function alphaBeta(state, depth) {
    var stats = { expanded: 0, leaves: 0, pruned: 0 };

    function search(s, remaining, alpha, beta) {
      if (isTerminal(s) || remaining === 0) {
        stats.leaves++;
        return [utility(s), null];
      }
      stats.expanded++;

      var minimizing = s.player === 'attacker';
      var actions = legalActions(s);
      var best = minimizing ? Infinity : -Infinity;
      var bestAction = null;
      var next = remaining === null ? null : remaining - 1;

      for (var i = 0; i < actions.length; i++) {
        var score = search(applyAction(s, actions[i]), next, alpha, beta)[0];
        if (minimizing) {
          if (score < best) { best = score; bestAction = actions[i]; }
          beta = Math.min(beta, best);
        } else {
          if (score > best) { best = score; bestAction = actions[i]; }
          alpha = Math.max(alpha, best);
        }
        if (beta <= alpha) {
          stats.pruned += actions.length - i - 1;
          break;
        }
      }
      return [best, bestAction];
    }

    var result = search(state, depth === undefined ? 3 : depth, -Infinity, Infinity);
    return { score: result[0], action: result[1], expanded: stats.expanded, leaves: stats.leaves, pruned: stats.pruned };
  }

  var api = {
    HOSTS: HOSTS,
    NETWORK: NETWORK,
    ASSET_VALUES: ASSET_VALUES,
    START_HOST: START_HOST,
    TARGET_HOST: TARGET_HOST,
    MAX_PLIES: MAX_PLIES,
    INITIAL_BUDGET: INITIAL_BUDGET,
    COSTS: { Patch: PATCH_COST, Isolate: ISOLATE_COST, Restore: RESTORE_COST },
    initialState: initialState,
    isTerminal: isTerminal,
    legalActions: legalActions,
    applyAction: applyAction,
    utility: utility,
    minimax: minimax,
    alphaBeta: alphaBeta
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CyberClash = api;
})(typeof self !== 'undefined' ? self : this);
