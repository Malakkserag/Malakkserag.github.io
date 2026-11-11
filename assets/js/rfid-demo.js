/* Fig. 3 — RFID access control, simulated.
   Mirrors the firmware in github.com/Malakkserag/RFID_Scanning_system_8051:
   the Arduino keeps up to MAX_CARDS UIDs in EEPROM, auto-enrols unknown cards
   while there is room, and sends 'A' or 'D' to the 8051, which drives the
   LCD, LEDs and servo. */
(function () {
  'use strict';

  var cardsEl = document.getElementById('rfid-cards');
  if (!cardsEl) return;

  var MAX_CARDS = 4;
  var CARDS = [
    { name: 'Card 1', uid: [0x3a, 0x9f, 0x21, 0xc4] },
    { name: 'Card 2', uid: [0xb7, 0x04, 0x6e, 0x12] },
    { name: 'Card 3', uid: [0x5d, 0xe1, 0x90, 0x7b] },
    { name: 'Card 4', uid: [0xc2, 0x38, 0xaf, 0x05] },
    { name: 'Card 5', uid: [0x19, 0x76, 0xd3, 0xe8] }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var arduino = $('rfid-arduino'), mcu = $('rfid-8051');
  var uidEl = $('rfid-uid'), countEl = $('rfid-count');
  var slots = $('rfid-slots').querySelectorAll('li');
  var byteEl = $('rfid-byte');
  var lcd1 = $('rfid-lcd1');
  var green = $('rfid-green'), red = $('rfid-red'), servo = $('rfid-servo');
  var servoLabel = servo.querySelector('b');
  var statusEl = $('rfid-status'), resetBtn = $('rfid-reset');

  var eeprom = [];     // stored UIDs, as strings
  var busy = false;
  var buttons = [];

  function fmt(uid) {
    return uid.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16).toUpperCase(); }).join(' ');
  }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function lcd(text) { lcd1.textContent = (text + '                ').slice(0, 16); }
  function status(html) { statusEl.innerHTML = html; }

  function renderEeprom(hit) {
    for (var i = 0; i < slots.length; i++) {
      slots[i].textContent = eeprom[i] || '';
      slots[i].classList.toggle('used', Boolean(eeprom[i]));
      slots[i].classList.toggle('hit', i === hit);
    }
    countEl.textContent = eeprom.length + ' / ' + MAX_CARDS;
  }

  function setBusy(state) {
    busy = state;
    buttons.forEach(function (b) { b.disabled = state; });
    resetBtn.disabled = state;
  }

  function tap(card, button) {
    if (busy) return;
    setBusy(true);
    var uid = fmt(card.uid);
    var command, slot;

    // 1. MFRC522 reads the UID over SPI
    button.classList.add('active');
    arduino.classList.add('busy');
    uidEl.textContent = uid;
    status('Reading <b>' + card.name + '</b> over SPI…');

    wait(520).then(function () {
      // 2. Arduino checks EEPROM, enrolling the card if there is room
      slot = eeprom.indexOf(uid);
      if (slot !== -1) {
        command = 'A';
        status('UID found in EEPROM slot ' + slot + '. Sending <b>\'A\'</b>.');
      } else if (eeprom.length < MAX_CARDS) {
        eeprom.push(uid);
        slot = eeprom.length - 1;
        command = 'A';
        status('New card and a free slot: enrolled in slot ' + slot + '. Sending <b>\'A\'</b>.');
      } else {
        command = 'D';
        status('Unknown card and EEPROM is full. Sending <b>\'D\'</b>.');
      }
      renderEeprom(slot);
      return wait(650);
    }).then(function () {
      // 3. one byte travels down the serial link
      byteEl.textContent = command;
      byteEl.className = 'go ' + command.toLowerCase();
      return wait(700);
    }).then(function () {
      // 4. the 8051 reacts
      byteEl.className = '';
      arduino.classList.remove('busy');
      mcu.classList.add('busy');
      if (command === 'A') {
        lcd('ACCESS OK');
        green.classList.add('on');
        servo.classList.add('open');
        servoLabel.textContent = 'open';
        status('<span class="ok">Access granted.</span> Green LED on, the servo opens the lock.');
      } else {
        lcd('DENIED');
        red.classList.add('on');
        status('<span class="bad">Access denied.</span> Red LED on, buzzer sounds, the lock stays shut.');
      }
      return wait(1900);
    }).then(function () {
      // 5. back to idle
      lcd('');
      green.classList.remove('on');
      red.classList.remove('on');
      servo.classList.remove('open');
      servoLabel.textContent = 'locked';
      mcu.classList.remove('busy');
      button.classList.remove('active');
      renderEeprom(-1);
      setBusy(false);
    });
  }

  CARDS.forEach(function (card) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'rfid-card';
    button.setAttribute('aria-label', 'Tap ' + card.name + ', UID ' + fmt(card.uid));
    button.innerHTML = '<b>' + card.name + '</b><span>' + fmt(card.uid) + '</span>';
    button.addEventListener('click', function () { tap(card, button); });
    cardsEl.appendChild(button);
    buttons.push(button);
  });

  resetBtn.addEventListener('click', function () {
    if (busy) return;
    eeprom = [];
    uidEl.textContent = '— — — —';
    renderEeprom(-1);
    status('EEPROM wiped. The next four cards tapped will be enrolled.');
  });

  renderEeprom(-1);
  lcd('');
})();
