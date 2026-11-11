/* AES-128, written out by hand — a JavaScript port of the Python simulator at
   github.com/Malakkserag/AES_ENCRYPTION_PYTHON. No crypto libraries: the point
   is to expose every intermediate state, not just the ciphertext.

   The state is 16 bytes in column-major order (FIPS-197): index = col * 4 + row. */
(function (root) {
  'use strict';

  // ---- GF(2^8) arithmetic, reduction polynomial x^8 + x^4 + x^3 + x + 1 ----
  function xtime(a) {
    a <<= 1;
    return a & 0x100 ? (a ^ 0x11b) & 0xff : a;
  }

  function gmul(a, b) {
    var p = 0;
    while (b) {
      if (b & 1) p ^= a;
      a = xtime(a);
      b >>= 1;
    }
    return p;
  }

  // ---- S-Box, derived rather than pasted: multiplicative inverse + affine map ----
  var SBOX = (function () {
    var box = new Array(256);
    var p = 1, q = 1;
    do {
      p = p ^ xtime(p);                 // p *= 3
      q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff;
      if (q & 0x80) q ^= 0x09;          // q /= 3
      var x = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4);
      box[p] = (x ^ 0x63) & 0xff;
    } while (p !== 1);
    box[0] = 0x63;
    return box;
  })();

  function rotl8(x, n) {
    return ((x << n) | (x >> (8 - n))) & 0xff;
  }

  var RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

  // ---- The four round transformations ----
  function subBytes(s) {
    return s.map(function (b) { return SBOX[b]; });
  }

  function shiftRows(s) {
    var out = new Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        out[c * 4 + r] = s[((c + r) % 4) * 4 + r];   // row r rotates left by r
      }
    }
    return out;
  }

  function mixColumns(s) {
    var out = new Array(16);
    for (var c = 0; c < 4; c++) {
      var a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
      out[c * 4]     = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
      out[c * 4 + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
      out[c * 4 + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
      out[c * 4 + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
    }
    return out;
  }

  function addRoundKey(s, k) {
    return s.map(function (b, i) { return b ^ k[i]; });
  }

  // ---- Key schedule: 16-byte key -> 11 round keys ----
  function expandKey(key) {
    var w = [];
    for (var i = 0; i < 4; i++) w.push(key.slice(i * 4, i * 4 + 4));
    for (i = 4; i < 44; i++) {
      var temp = w[i - 1].slice();
      if (i % 4 === 0) {
        temp.push(temp.shift());                                   // RotWord
        temp = temp.map(function (b) { return SBOX[b]; });         // SubWord
        temp[0] ^= RCON[i / 4];                                    // Rcon
      }
      w.push(w[i - 4].map(function (b, j) { return b ^ temp[j]; }));
    }
    var keys = [];
    for (var r = 0; r < 11; r++) {
      keys.push([].concat(w[r * 4], w[r * 4 + 1], w[r * 4 + 2], w[r * 4 + 3]));
    }
    return keys;
  }

  // ---- Encrypt one block, recording the state after every step ----
  function trace(plaintext, key) {
    var keys = expandKey(key);
    var state = plaintext.slice();
    var steps = [{ round: 0, op: 'input', state: state }];
    function push(round, op, next) {
      steps.push({ round: round, op: op, state: next });
      state = next;
    }
    push(0, 'addRoundKey', addRoundKey(state, keys[0]));
    for (var r = 1; r <= 10; r++) {
      push(r, 'subBytes', subBytes(state));
      push(r, 'shiftRows', shiftRows(state));
      if (r < 10) push(r, 'mixColumns', mixColumns(state));
      push(r, 'addRoundKey', addRoundKey(state, keys[r]));
    }
    return { steps: steps, roundKeys: keys, ciphertext: state };
  }

  var api = {
    SBOX: SBOX,
    gmul: gmul,
    subBytes: subBytes,
    shiftRows: shiftRows,
    mixColumns: mixColumns,
    addRoundKey: addRoundKey,
    expandKey: expandKey,
    trace: trace
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AES128 = api;
})(typeof self !== 'undefined' ? self : this);
