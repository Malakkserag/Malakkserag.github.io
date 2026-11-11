/* Fig. 1 — the Student Manager CI/CD pipeline, simulated.
   Mirrors .gitlab-ci.yml in gitlab.com/Malak21/student-manager-cicd-docker-deployment:
   four stages (build, test, package, deploy) run by a shell-executor runner on
   Ubuntu. Deploy keeps student-db and its volume, and swaps only student-app.
   The little app underneath follows the Spring Boot original: the same seed
   rows, the same search rule and the same validation as the Student entity. */
(function () {
  'use strict';

  var root = document.getElementById('pl-demo');
  if (!root) return;

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SPEED = reduceMotion ? 0.12 : 1;

  var IMAGE = 'malakk21/student-app';
  var BRANCH = 'develop';
  var STAGES = ['build', 'test', 'package', 'deploy'];
  var GOOD_COMMITS = ['Add search to the dashboard', 'Validate the student email', 'Tidy the student form', 'Show the total student count'];
  var BAD_COMMIT = 'Refactor StudentService.save';

  var stageEls = {};
  root.querySelectorAll('.pl-stage').forEach(function (el) { stageEls[el.getAttribute('data-stage')] = el; });

  var pushBtn = $('pl-push');
  var kindBtns = root.querySelectorAll('#pl-kind button');
  var refEl = $('pl-ref'), jobEl = $('pl-job'), logEl = $('pl-log'), statusEl = $('pl-status');
  var hostEl = $('pl-host');
  var appBox = $('pl-app'), dbBox = $('pl-db'), wireEl = $('pl-wire');
  var appSha = $('pl-app-sha'), appState = $('pl-app-state');
  var dbRows = $('pl-db-rows'), dbState = $('pl-db-state');
  var siteVer = $('pl-site-ver'), siteDown = $('pl-site-down'), siteUp = $('pl-site-up');
  var searchEl = $('pl-search'), rowsEl = $('pl-rows'), addBtn = $('pl-add');
  var formEl = $('pl-form'), formErr = $('pl-form-error'), saveBtn = $('pl-save'), cancelBtn = $('pl-cancel');
  var fFirst = $('pl-f-first'), fLast = $('pl-f-last'), fEmail = $('pl-f-email'), fMajor = $('pl-f-major');

  var kind = 'pass';
  var running = false;
  var pipelineNo = 0;
  var liveSha = null;       // commit the VM is serving, if any
  var dbCreated = false;
  var appUp = false;

  // What lives in the student-db-data volume.
  var students = [];
  var nextId = 1;
  var editing = null;

  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms * SPEED); }); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  }
  function status(html) { statusEl.innerHTML = html; }
  function newSha() {
    var s = '';
    for (var i = 0; i < 8; i++) s += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
    return s;
  }

  /* ---------------- the runner's log ---------------- */
  function line(text, cls) {
    var el = document.createElement('span');
    if (cls) el.className = cls;
    el.textContent = text + '\n';
    logEl.appendChild(el);
    logEl.scrollTop = logEl.scrollHeight;
  }
  // Print lines one after another. A line is [text, class, hook] or just text;
  // the hook runs as the line appears and is how the diagram stays in step.
  function print(lines) {
    return lines.reduce(function (chain, entry) {
      return chain.then(function () {
        var text = typeof entry === 'string' ? entry : entry[0];
        var cls = typeof entry === 'string' ? '' : entry[1];
        var hook = typeof entry === 'string' ? null : entry[2];
        if (!cls && text.charAt(0) === '$') cls = 'cmd';
        line(text, cls);
        if (hook) hook();
        return wait(cls === 'cmd' ? 330 : 190);
      });
    }, Promise.resolve());
  }

  /* ---------------- stages ---------------- */
  function setStage(name, state) {
    var el = stageEls[name];
    el.className = 'pl-stage ' + state;
    el.querySelector('.pl-state').textContent = state;
  }
  function startJob(name, blurb) {
    setStage(name, 'running');
    jobEl.textContent = name + '_project';
    line('');
    line('Running job ' + name + '_project on runner ubuntu2 (shell executor)', 'sec');
    status('<b>' + name + '_project</b> — ' + blurb);
  }

  /* ---------------- the VM ---------------- */
  function renderHost() {
    hostEl.classList.toggle('on', dbCreated);
    dbBox.classList.toggle('off', !dbCreated);
    appBox.classList.toggle('off', !appUp);
    wireEl.classList.toggle('on', dbCreated && appUp);
    appSha.textContent = appUp && liveSha ? liveSha : '—';
    dbRows.textContent = dbCreated ? String(students.length) : '—';
    setState(appState, appUp ? 'running' : 'not created', appUp);
    if (!dbState.classList.contains('wait')) setState(dbState, dbCreated ? 'running' : 'not created', dbCreated);
  }
  function setState(el, text, up) {
    el.textContent = text;
    el.className = 'pl-run' + (up ? ' up' : '');
  }

  /* ---------------- the deployed app ---------------- */
  function renderSite() {
    siteDown.hidden = appUp;
    siteUp.hidden = !appUp;
    siteVer.textContent = appUp ? IMAGE + ':' + BRANCH + ' @ ' + liveSha : 'connection refused';
    if (appUp) renderRows();
  }
  function renderRows() {
    var q = searchEl.value.trim().toLowerCase();
    // Same rule as the data-search attribute in templates/index.html.
    var hits = students.filter(function (s) {
      return !q || (s.first + ' ' + s.last + ' ' + s.email + ' ' + s.major).toLowerCase().indexOf(q) !== -1;
    });
    if (!students.length) {
      rowsEl.innerHTML = '<li class="empty">No students yet. Add the first one.</li>';
    } else if (!hits.length) {
      rowsEl.innerHTML = '<li class="empty">No student matches “' + escapeHtml(searchEl.value.trim()) + '”.</li>';
    } else {
      rowsEl.innerHTML = hits.map(function (s) {
        return '<li><div><b>' + escapeHtml(s.first + ' ' + s.last) + '</b><span>ID ' + s.id + ' · ' + escapeHtml(s.email) + '</span></div>' +
          '<em>' + escapeHtml(s.major || '—') + '</em>' +
          '<p><button type="button" data-edit="' + s.id + '" aria-label="Edit ' + escapeHtml(s.first + ' ' + s.last) + '">Edit</button>' +
          '<button type="button" data-del="' + s.id + '" aria-label="Delete ' + escapeHtml(s.first + ' ' + s.last) + '">Delete</button></p></li>';
      }).join('');
    }
    dbRows.textContent = String(students.length);
  }
  function seed() {
    // DataInitializer.java: only when the table is empty.
    if (students.length) return false;
    [['Alice', 'Martin', 'Computer Science'], ['Bob', 'Dupont', 'Mathematics'], ['Clara', 'Benoit', 'Physics'], ['David', 'Leroy', 'Computer Science']]
      .forEach(function (s) {
        students.push({ id: nextId++, first: s[0], last: s[1], email: (s[0] + '.' + s[1]).toLowerCase() + '@school.com', major: s[2] });
      });
    return true;
  }
  function openForm(student) {
    editing = student || null;
    fFirst.value = student ? student.first : '';
    fLast.value = student ? student.last : '';
    fEmail.value = student ? student.email : '';
    fMajor.value = student ? student.major : '';
    saveBtn.textContent = student ? 'Save changes' : 'Add student';
    formErr.hidden = true;
    formEl.hidden = false;
    addBtn.hidden = true;
    fFirst.focus();
  }
  function closeForm() {
    editing = null;
    formEl.hidden = true;
    addBtn.hidden = false;
  }

  rowsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn || !appUp) return;
    var id = Number(btn.getAttribute('data-edit') || btn.getAttribute('data-del'));
    var student = students.filter(function (s) { return s.id === id; })[0];
    if (!student) return;
    if (btn.hasAttribute('data-edit')) {
      openForm(student);
    } else {
      students.splice(students.indexOf(student), 1);
      if (editing === student) closeForm();
      renderRows();
    }
  });
  searchEl.addEventListener('input', renderRows);
  addBtn.addEventListener('click', function () { openForm(null); });
  cancelBtn.addEventListener('click', closeForm);
  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    var first = fFirst.value.trim(), last = fLast.value.trim(), email = fEmail.value.trim(), major = fMajor.value.trim();
    // The constraints on entity/Student.java: @NotBlank, @Email, unique email.
    var error = '';
    if (!first || !last || !email) error = 'First name, last name and email are required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'That email address is not valid.';
    else if (students.some(function (s) { return s !== editing && s.email.toLowerCase() === email.toLowerCase(); })) error = 'Another student already uses that email.';
    if (error) {
      formErr.textContent = error;
      formErr.hidden = false;
      return;
    }
    if (editing) {
      editing.first = first; editing.last = last; editing.email = email; editing.major = major;
    } else {
      students.push({ id: nextId++, first: first, last: last, email: email, major: major });
    }
    closeForm();
    renderRows();
  });

  /* ---------------- the four jobs ---------------- */
  function build() {
    startJob('build', 'Maven compiles the app and keeps the JAR as an artifact for the later stages.');
    return print([
      '$ chmod +x mvnw',
      '$ ./mvnw clean package -DskipTests',
      '[INFO] Building demo-student-app',
      '[INFO] Building jar: target/demo-student-app.jar',
      ['[INFO] BUILD SUCCESS', 'ok'],
      'Uploading artifacts: target/*.jar',
      ['Job succeeded', 'ok']
    ]);
  }

  function test(fails) {
    startJob('test', 'the unit tests run against the service layer. A red test stops everything after it.');
    var lines = ['$ ./mvnw test', '[INFO] Running com.example.demostudentapp.DemoStudentAppApplicationTests'];
    if (fails) {
      lines.push(
        ['[ERROR] createStudent — expected: "hamed@gmail.com" but was: null', 'bad'],
        ['[ERROR] Tests run: 1, Failures: 1, Errors: 0, Skipped: 0', 'bad'],
        ['[ERROR] BUILD FAILURE', 'bad'],
        ['ERROR: Job failed: exit status 1', 'bad']
      );
    } else {
      lines.push('[INFO] Tests run: 1, Failures: 0, Errors: 0, Skipped: 0', ['[INFO] BUILD SUCCESS', 'ok'], ['Job succeeded', 'ok']);
    }
    return print(lines);
  }

  function pack(sha) {
    var tag = IMAGE + ':' + BRANCH;
    startJob('package', 'a multi-stage Docker build, pushed to Docker Hub as <b>' + tag + '</b>.');
    return print([
      '$ echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin',
      'Login Succeeded',
      '$ docker build -t ' + tag + ' .',
      ' => [builder] FROM eclipse-temurin:17-jdk-alpine',
      ' => [builder] RUN ./mvnw package -DskipTests -q',
      ' => [runtime] FROM eclipse-temurin:17-jre-alpine',
      ' => [runtime] COPY --from=builder /app/target/*.jar app.jar',
      '$ docker push ' + tag,
      BRANCH + ': pushed, built from commit ' + sha,
      ['Job succeeded', 'ok']
    ]);
  }

  function deploy(sha) {
    var first = !dbCreated;
    var seeded = false;
    startJob('deploy', 'the runner pulls the image and swaps the app container. The database and its volume are left alone.');
    return print([
      ['=== Checking Docker network ===', 'sec'],
      first ? '$ docker network create student-network' : 'student-network already exists',
      ['=== Checking PostgreSQL volume ===', 'sec'],
      first ? '$ docker volume create student-db-data' : 'student-db-data already exists',
      ['=== Checking PostgreSQL container ===', 'sec'],
      first
        ? ['Creating PostgreSQL container', '', function () {
            dbCreated = true;
            dbState.classList.add('wait');
            renderHost();
            dbState.textContent = 'starting';
          }]
        : 'PostgreSQL container already exists',
      ['=== Waiting for PostgreSQL ===', 'sec'],
      first ? 'PostgreSQL is not ready yet... attempt 1/30' : '$ docker exec student-db pg_isready',
      ['PostgreSQL is ready', 'ok', function () {
        dbState.classList.remove('wait');
        renderHost();
      }],
      ['=== Pulling application image ===', 'sec'],
      '$ docker pull ' + IMAGE + ':' + BRANCH,
      ['=== Removing old application container ===', 'sec'],
      ['$ docker rm -f student-app', 'cmd', function () {
        appUp = false;
        closeForm();
        renderHost();
        renderSite();
      }],
      ['=== Starting application ===', 'sec'],
      ['$ docker run -d --name student-app --network student-network -p 80:9000 ' + IMAGE + ':' + BRANCH, 'cmd', function () {
        liveSha = sha;
        appUp = true;
        seeded = seed();
        renderHost();
        renderSite();
      }],
      ['=== Deployment status ===', 'sec'],
      'student-app   Up 2 seconds    0.0.0.0:80->9000/tcp',
      'student-db    Up              0.0.0.0:5460->5432/tcp',
      ['Job succeeded', 'ok']
    ]).then(function () { return seeded; });
  }

  /* ---------------- one push, one pipeline ---------------- */
  function setRunning(state) {
    running = state;
    pushBtn.disabled = state;
    kindBtns.forEach(function (b) { b.disabled = state; });
    root.classList.toggle('busy', state);
  }

  function push() {
    if (running) return;
    setRunning(true);
    var fails = kind === 'fail';
    var sha = newSha();
    var message = fails ? BAD_COMMIT : GOOD_COMMITS[pipelineNo % GOOD_COMMITS.length];
    var no = ++pipelineNo;

    STAGES.forEach(function (name) { setStage(name, 'pending'); });
    logEl.textContent = '';
    refEl.textContent = '#' + no + ' · ' + BRANCH + ' · ' + sha;
    line('$ git push origin ' + BRANCH, 'cmd');
    line('Pipeline #' + no + ' created for ' + sha + ' — "' + message + '"', 'dim');

    wait(500).then(build).then(function () {
      setStage('build', 'passed');
      return wait(260);
    }).then(function () {
      return test(fails);
    }).then(function () {
      if (fails) {
        setStage('test', 'failed');
        setStage('package', 'skipped');
        setStage('deploy', 'skipped');
        jobEl.textContent = 'pipeline failed';
        status('<span class="bad">Pipeline #' + no + ' failed at test.</span> Package and deploy were skipped, so ' +
          (liveSha ? 'the VM keeps serving <b>' + liveSha + '</b> and nobody notices the broken commit.' : 'nothing reached the VM.'));
        setRunning(false);
        return;
      }
      setStage('test', 'passed');
      return wait(260).then(function () { return pack(sha); }).then(function () {
        setStage('package', 'passed');
        return wait(260);
      }).then(function () {
        return deploy(sha);
      }).then(function (seeded) {
        setStage('deploy', 'passed');
        jobEl.textContent = 'pipeline passed';
        status('<span class="ok">Pipeline #' + no + ' passed.</span> Commit <b>' + sha + '</b> is live on port 80. ' +
          (seeded
            ? 'The table was empty, so the app seeded its sample rows. Edit them below, then push again: they survive, because they live in the volume and not in the container.'
            : 'Only <b>student-app</b> was replaced. Your ' + students.length + (students.length === 1 ? ' row is' : ' rows are') + ' still there, because the data lives in the volume.'));
        setRunning(false);
      });
    });
  }

  pushBtn.addEventListener('click', push);
  kindBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      kind = btn.getAttribute('data-kind');
      kindBtns.forEach(function (other) {
        other.classList.toggle('on', other === btn);
        other.setAttribute('aria-pressed', String(other === btn));
      });
    });
  });

  STAGES.forEach(function (name) { setStage(name, 'pending'); });
  renderHost();
  renderSite();
  line('Waiting for a push to ' + BRANCH + '…', 'dim');

  // Run the first pipeline by itself once the stages are on screen.
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      if (!pipelineNo) push();
    }, { threshold: 0.6 });
    io.observe(root.querySelector('.pl-stages'));
  }
})();
