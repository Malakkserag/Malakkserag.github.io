/* Small illustrations for projects 05 and 06. */
(function () {
  'use strict';

  /* ---- News platform: the search endpoint, on a handful of its headlines ---- */
  (function news() {
    var list = document.getElementById('news-list');
    var input = document.getElementById('news-q');
    var req = document.getElementById('news-req');
    if (!list || !input) return;

    var ITEMS = [
      ['New Technology Reshapes Education', 'AI and digital tools are transforming classrooms around the world.'],
      ['Climate Change Protests Sweep Europe', 'Thousands demand action in mass protests across major European cities.'],
      ['SpaceX Launches Next-Gen Satellite', 'The rocket launch delivers the first of a new satellite fleet for global internet.'],
      ['Breakthrough in Cancer Research Announced', 'Scientists report promising results from new immunotherapy treatment.'],
      ['Electric Cars Overtake Gasoline in Sales', 'A major milestone in the global shift to sustainable transport.'],
      ['Ocean Temperatures Hit Record Highs', 'Climate scientists warn of devastating effects on marine life.']
    ];

    function escapeHtml(s) {
      return s.replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
    }
    function highlight(title, q) {
      var at = q ? title.toLowerCase().indexOf(q) : -1;
      if (at === -1) return escapeHtml(title);
      return escapeHtml(title.slice(0, at)) + '<mark>' + escapeHtml(title.slice(at, at + q.length)) + '</mark>' + escapeHtml(title.slice(at + q.length));
    }

    function render() {
      var q = input.value.trim().toLowerCase();
      // Same rule as server/api/news/searchFilter.ts: match on title or description.
      var hits = ITEMS.filter(function (item) {
        return !q || item[0].toLowerCase().indexOf(q) !== -1 || item[1].toLowerCase().indexOf(q) !== -1;
      });
      req.textContent = q ? 'GET /api/news/searchFilter?search=' + encodeURIComponent(q) : 'GET /api/news';
      list.innerHTML = hits.length
        ? hits.map(function (item) {
            return '<li>' + highlight(item[0], q) + '<span>#' + (ITEMS.indexOf(item) + 1) + '</span></li>';
          }).join('')
        : '<li class="empty">200 OK · [] — no articles match.</li>';
    }

    input.addEventListener('input', render);
    render();
  })();

  /* ---- Cinema booking: the same 5 × 8 hall as the JavaFX seat grid ---- */
  (function cinema() {
    var grid = document.getElementById('cinema-seats');
    if (!grid) return;
    var countEl = document.getElementById('cinema-count');
    var statusEl = document.getElementById('cinema-status');
    var bookBtn = document.getElementById('cinema-book');
    var payBtns = document.querySelectorAll('#cinema-method button');

    var ROWS = 5, COLS = 8;
    var selected = [];
    var method = 'Card';

    function update() {
      countEl.textContent = selected.length + (selected.length === 1 ? ' seat' : ' seats');
      bookBtn.disabled = selected.length === 0;
      if (selected.length) statusEl.textContent = 'Selected ' + selected.slice().sort().join(', ') + '.';
    }

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        (function (id) {
          var seat = document.createElement('button');
          seat.type = 'button';
          seat.textContent = id;
          seat.setAttribute('aria-pressed', 'false');
          seat.setAttribute('aria-label', 'Seat ' + id);
          seat.addEventListener('click', function () {
            var at = selected.indexOf(id);
            if (at === -1) selected.push(id); else selected.splice(at, 1);
            seat.classList.toggle('on', at === -1);
            seat.setAttribute('aria-pressed', String(at === -1));
            if (!selected.length) statusEl.textContent = 'Pick a few seats.';
            update();
          });
          grid.appendChild(seat);
        })(String.fromCharCode(65 + r) + (c + 1));
      }
    }

    payBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        method = btn.getAttribute('data-pay');
        payBtns.forEach(function (other) {
          other.classList.toggle('on', other === btn);
          other.setAttribute('aria-pressed', String(other === btn));
        });
      });
    });

    bookBtn.addEventListener('click', function () {
      var booked = selected.slice().sort();
      grid.querySelectorAll('button.on').forEach(function (seat) {
        seat.classList.remove('on');
        seat.classList.add('booked');
        seat.disabled = true;
        seat.setAttribute('aria-label', seat.textContent + ', booked');
      });
      selected = [];
      update();
      statusEl.innerHTML = '<span class="ok">Booked ' + booked.join(', ') + '</span> · paid by ' + method.toLowerCase() + '.';
    });

    update();
  })();
})();
