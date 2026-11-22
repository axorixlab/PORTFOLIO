// AXORIX DASH v3.0 - dashboard logic

(function () {
  'use strict';

  var CIRC = 2 * Math.PI * 52;
  var PRI = { high: 0, medium: 1, low: 2 };
  var PRI_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
  var DUR = { focus: 25 * 60 * 1000, break: 5 * 60 * 1000 };
  var THEMES = ['blue', 'purple', 'green'];
  var BACKUP_KEYS = ['tasks', 'notes', 'history', 'shortcuts', 'recurring', 'theme', 'wallpaper', 'weatherCity', 'sessions'];
  var DEFAULT_CITY = 'Islamabad';

  var DEFAULT_SHORTCUTS = [
    { id: 'gh', name: 'GitHub', url: 'https://github.com', badge: 'GH' },
    { id: 'gpt', name: 'ChatGPT', url: 'https://chatgpt.com', badge: 'GPT' },
    { id: 'yt', name: 'YouTube', url: 'https://www.youtube.com', badge: 'YT' },
    { id: 'cl', name: 'Claude AI', url: 'https://claude.ai', badge: 'CL' }
  ];

  var QUOTES = [
    'Small steps every day add up to big results.',
    'Start with the task you have been avoiding.',
    'Focus on progress, not perfection.',
    'One finished task beats ten started ones.',
    'Do the hard thing first and the rest gets easier.',
    'Consistency beats intensity.',
    'You do not need more time, you need a clear next step.',
    'Done is better than perfect.',
    'Your future self will thank you for today.',
    'Build the habit and the results will follow.'
  ];

  var WEATHER_TEXT = {
    0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
    77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy rain showers',
    85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail',
    99: 'Thunderstorm with hail'
  };

  var state = {
    tasks: [],
    shortcuts: DEFAULT_SHORTCUTS.slice(),
    recurring: [],
    history: [],
    timer: { mode: 'focus', running: false, endAt: 0, remaining: DUR.focus },
    sessions: { date: '', count: 0 },
    theme: 'blue',
    editMode: false
  };

  var currentDay = dayKey();
  var lastMinute = -1;
  var saveTimer = null;
  var completing = false;
  var msgTimers = {};

  function $(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(2, '0'); }

  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function setMsg(id, text) {
    var el = $(id);
    el.textContent = text;
    clearTimeout(msgTimers[id]);
    if (text) {
      msgTimers[id] = setTimeout(function () { el.textContent = ''; }, 5000);
    }
  }

  // ---------- Data helpers ----------

  function normalizeTask(t, i) {
    if (typeof t === 'string') { t = { text: t }; }
    t = t || {};
    var p = String(t.priority || 'medium').toLowerCase();
    return {
      id: t.id != null ? String(t.id) : 'legacy-' + i + '-' + newId(),
      text: String(t.text != null ? t.text : (t.title != null ? t.title : (t.name != null ? t.name : ''))),
      done: Boolean(t.done != null ? t.done : (t.completed != null ? t.completed : t.checked)),
      priority: PRI.hasOwnProperty(p) ? p : 'medium',
      due: /^\d{2}:\d{2}$/.test(t.due || '') ? t.due : '',
      recurring: Boolean(t.recurring),
      createdAt: t.createdAt
    };
  }

  function loadTasks(raw) {
    state.tasks = (Array.isArray(raw) ? raw : [])
      .map(normalizeTask)
      .filter(function (t) { return t.text.trim() !== ''; });
  }

  function cleanUrl(v) {
    v = String(v || '').trim();
    if (!v) { return null; }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) { v = 'https://' + v; }
    try {
      var u = new URL(v);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') { return null; }
      return u.href;
    } catch (e) {
      return null;
    }
  }

  function badgeFor(name) {
    var words = String(name).trim().split(/\s+/);
    if (words.length > 1) { return (words[0][0] + words[1][0]).toUpperCase(); }
    return String(name).trim().slice(0, 2).toUpperCase();
  }

  function loadShortcuts(raw) {
    if (!Array.isArray(raw)) { state.shortcuts = DEFAULT_SHORTCUTS.slice(); return; }
    state.shortcuts = raw
      .map(function (s) {
        var url = s && cleanUrl(s.url);
        if (!url || !s.name) { return null; }
        return { id: String(s.id || newId()), name: String(s.name).slice(0, 24), url: url, badge: s.badge ? String(s.badge).slice(0, 3) : badgeFor(s.name) };
      })
      .filter(Boolean);
  }

  function loadRecurring(raw) {
    state.recurring = (Array.isArray(raw) ? raw : [])
      .filter(function (r) { return r && typeof r.text === 'string' && r.text.trim() !== ''; })
      .map(function (r) {
        return { id: String(r.id || newId()), text: r.text.trim(), priority: PRI.hasOwnProperty(r.priority) ? r.priority : 'medium' };
      });
  }

  function loadTimer(raw) {
    var t = raw || {};
    var mode = t.mode === 'break' ? 'break' : 'focus';
    var rem = Number(t.remaining);
    state.timer = {
      mode: mode,
      running: Boolean(t.running) && Number(t.endAt) > 0,
      endAt: Number(t.endAt) || 0,
      remaining: rem > 0 ? rem : DUR[mode]
    };
  }

  function todaySessions() {
    var s = state.sessions;
    if (s && s.date === dayKey()) { return { date: s.date, count: Number(s.count) || 0 }; }
    return { date: dayKey(), count: 0 };
  }

  function saveTasks() { chrome.storage.local.set({ tasks: state.tasks }); }

  // ---------- Theme and background ----------

  function applyTheme(t) {
    if (THEMES.indexOf(t) < 0) { t = 'blue'; }
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    var btns = document.querySelectorAll('[data-set-theme]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', String(btns[i].getAttribute('data-set-theme') === t));
    }
  }

  function applyWallpaper(data) {
    if (typeof data === 'string' && /^data:image\//.test(data)) {
      document.documentElement.style.setProperty('--wallpaper', 'url("' + data + '")');
      document.body.classList.add('has-wallpaper');
    } else {
      document.documentElement.style.removeProperty('--wallpaper');
      document.body.classList.remove('has-wallpaper');
    }
  }

  // ---------- Tasks ----------

  function isOverdue(t) {
    if (t.done || !t.due) { return false; }
    var now = new Date();
    return t.due < pad(now.getHours()) + ':' + pad(now.getMinutes());
  }

  function renderTasks() {
    var list = $('taskList');
    list.textContent = '';

    var sorted = state.tasks.slice().sort(function (a, b) {
      if (a.done !== b.done) { return a.done ? 1 : -1; }
      return PRI[a.priority] - PRI[b.priority];
    });

    sorted.forEach(function (task) {
      var li = document.createElement('li');
      li.className = 'task' + (task.done ? ' done' : '');

      var check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = task.done;
      check.id = 'task-' + task.id;
      check.setAttribute('aria-label', 'Mark "' + task.text + '" as done');
      check.addEventListener('change', function () {
        task.done = check.checked;
        saveTasks();
        renderTasks();
      });

      var main = document.createElement('div');
      main.className = 'task-main';
      var label = document.createElement('label');
      label.htmlFor = check.id;
      label.textContent = task.text;
      main.appendChild(label);

      var meta = document.createElement('div');
      meta.className = 'task-meta';
      var tag = document.createElement('span');
      tag.className = 'tag tag-' + task.priority;
      tag.textContent = PRI_LABEL[task.priority];
      meta.appendChild(tag);
      if (task.due) {
        var due = document.createElement('span');
        due.className = 'due' + (isOverdue(task) ? ' overdue' : '');
        due.textContent = (isOverdue(task) ? 'Overdue, was due ' : 'Due ') + task.due;
        meta.appendChild(due);
      }
      if (task.recurring) {
        var rec = document.createElement('span');
        rec.className = 'due';
        rec.textContent = 'Daily';
        meta.appendChild(rec);
      }
      main.appendChild(meta);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', 'Delete "' + task.text + '"');
      del.addEventListener('click', function () {
        state.tasks = state.tasks.filter(function (t) { return t.id !== task.id; });
        saveTasks();
        renderTasks();
      });

      li.appendChild(check);
      li.appendChild(main);
      li.appendChild(del);
      list.appendChild(li);
    });

    $('emptyState').hidden = state.tasks.length > 0;
    $('clearDone').hidden = !state.tasks.some(function (t) { return t.done; });
    updateProgress();
    renderStreak();
  }

  function updateProgress() {
    var total = state.tasks.length;
    var done = state.tasks.filter(function (t) { return t.done; }).length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    $('percent').textContent = pct + '%';
    $('ringFill').style.strokeDashoffset = String(CIRC * (1 - pct / 100));
    var sub = $('progressSub');
    if (!total) {
      sub.textContent = 'No tasks yet';
    } else if (done === total) {
      sub.textContent = 'All ' + total + ' tasks done';
    } else {
      sub.textContent = done + ' of ' + total + ' tasks done';
    }
  }

  // ---------- Streak ----------

  function computeStreak() {
    var ok = {};
    state.history.forEach(function (e) {
      var t = Array.isArray(e.tasks) ? e.tasks : [];
      if (!t.length) { return; }
      var done = t.filter(function (x) { return x && (x.done || x.completed || x.checked); }).length;
      ok[e.date] = done / t.length >= 0.5;
    });
    if (state.tasks.length) {
      var d0 = state.tasks.filter(function (t) { return t.done; }).length;
      ok[dayKey()] = d0 / state.tasks.length >= 0.5;
    }
    var d = new Date();
    if (!ok[dayKey(d)]) { d.setDate(d.getDate() - 1); }
    var streak = 0;
    while (ok[dayKey(d)]) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function renderStreak() {
    var n = computeStreak();
    $('streakNum').textContent = String(n);
    $('streakLabel').textContent = n === 1 ? 'day streak' : 'day streak';
  }

  // ---------- Shortcuts ----------

  function renderShortcuts() {
    var box = $('shortcuts');
    box.textContent = '';
    box.classList.toggle('editing', state.editMode);

    state.shortcuts.forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'shortcut-item';

      var a = document.createElement('a');
      a.className = 'shortcut';
      a.href = s.url;
      a.rel = 'noopener';
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = s.badge;
      var name = document.createElement('span');
      name.className = 'shortcut-name';
      name.textContent = s.name;
      a.appendChild(badge);
      a.appendChild(name);
      a.addEventListener('click', function (e) {
        if (state.editMode) { e.preventDefault(); }
      });

      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'remove-x';
      rm.textContent = 'Remove';
      rm.setAttribute('aria-label', 'Remove shortcut ' + s.name);
      rm.addEventListener('click', function () {
        state.shortcuts = state.shortcuts.filter(function (x) { return x.id !== s.id; });
        chrome.storage.local.set({ shortcuts: state.shortcuts });
        renderShortcuts();
      });

      item.appendChild(a);
      item.appendChild(rm);
      box.appendChild(item);
    });

    $('editShortcuts').textContent = state.editMode ? 'Done editing' : 'Edit shortcuts';
    $('shortcutForm').hidden = !state.editMode;
    if (!state.shortcuts.length) {
      setMsg('shortcutMsg', 'No shortcuts yet. Press Edit shortcuts to add one.');
    }
  }

  // ---------- Daily routine ----------

  function renderRoutine() {
    var list = $('routineList');
    list.textContent = '';
    state.recurring.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'routine-item';
      var text = document.createElement('span');
      text.className = 'routine-text';
      text.textContent = r.text;
      var tag = document.createElement('span');
      tag.className = 'tag tag-' + r.priority;
      tag.textContent = PRI_LABEL[r.priority];
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.textContent = 'Remove';
      del.setAttribute('aria-label', 'Remove routine "' + r.text + '"');
      del.addEventListener('click', function () {
        state.recurring = state.recurring.filter(function (x) { return x.id !== r.id; });
        chrome.storage.local.set({ recurring: state.recurring });
        renderRoutine();
      });
      li.appendChild(text);
      li.appendChild(tag);
      li.appendChild(del);
      list.appendChild(li);
    });
    $('routineEmpty').hidden = state.recurring.length > 0;
  }

  // ---------- Focus timer ----------

  function timerLeft() {
    var t = state.timer;
    return t.running ? Math.max(0, t.endAt - Date.now()) : t.remaining;
  }

  function fmt(ms) {
    var s = Math.ceil(ms / 1000);
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }

  function renderTimerTime() {
    var left = timerLeft();
    $('timerDisplay').textContent = fmt(left);
    document.title = state.timer.running ? fmt(left) + ' - AXORIX DASH' : 'AXORIX DASH';
  }

  function renderTimer() {
    var t = state.timer;
    $('timerToggle').textContent = t.running ? 'Pause' : 'Start';
    var modes = document.querySelectorAll('#timerModes [data-mode]');
    for (var i = 0; i < modes.length; i++) {
      modes[i].setAttribute('aria-pressed', String(modes[i].getAttribute('data-mode') === t.mode));
    }
    $('sessionsText').textContent = 'Focus sessions today: ' + todaySessions().count;
    renderTimerTime();
  }

  function persistTimer() { chrome.storage.local.set({ timer: state.timer }); }

  function startTimer() {
    if (state.timer.running) { return; }
    var rem = state.timer.remaining > 0 ? state.timer.remaining : DUR[state.timer.mode];
    state.timer.running = true;
    state.timer.endAt = Date.now() + rem;
    persistTimer();
    renderTimer();
  }

  function pauseTimer() {
    if (!state.timer.running) { return; }
    state.timer.remaining = timerLeft();
    state.timer.running = false;
    state.timer.endAt = 0;
    persistTimer();
    renderTimer();
  }

  function resetTimer() {
    state.timer.running = false;
    state.timer.endAt = 0;
    state.timer.remaining = DUR[state.timer.mode];
    persistTimer();
    renderTimer();
  }

  function setTimerMode(mode) {
    state.timer = { mode: mode, running: false, endAt: 0, remaining: DUR[mode] };
    persistTimer();
    renderTimer();
  }

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      [0, 0.35, 0.7].forEach(function (offset) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.value = 0.15;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.2);
      });
    } catch (e) { /* sound is optional */ }
  }

  function completeTimer() {
    if (completing) { return; }
    completing = true;
    // Re-read storage first so two open tabs do not both count the same session.
    chrome.storage.local.get(['timer', 'sessions']).then(function (cur) {
      if (!(cur.timer && cur.timer.running)) {
        loadTimer(cur.timer);
        state.sessions = cur.sessions || state.sessions;
        renderTimer();
        completing = false;
        return;
      }
      var wasFocus = cur.timer.mode !== 'break';
      var nextMode = wasFocus ? 'break' : 'focus';
      state.timer = { mode: nextMode, running: false, endAt: 0, remaining: DUR[nextMode] };
      var upd = { timer: state.timer };
      if (wasFocus) {
        state.sessions = cur.sessions && cur.sessions.date === dayKey()
          ? { date: dayKey(), count: (Number(cur.sessions.count) || 0) + 1 }
          : { date: dayKey(), count: 1 };
        upd.sessions = state.sessions;
      }
      beep();
      renderTimer();
      return chrome.storage.local.set(upd).then(function () { completing = false; });
    }).catch(function () { completing = false; });
  }

  // ---------- Weather ----------

  function fetchJson(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 8000);
    return fetch(url, { signal: ctrl.signal }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.json();
    });
  }

  function renderWeather(w) {
    if (!w) { return; }
    $('wxTemp').textContent = Math.round(w.temp) + '\u00B0C';
    $('wxDesc').textContent = WEATHER_TEXT[w.code] || 'Current weather';
    $('wxPlace').textContent = w.place;
  }

  async function loadWeather(force) {
    var data = await chrome.storage.local.get(['weatherCity', 'weatherCache']);
    var city = (typeof data.weatherCity === 'string' && data.weatherCity.trim()) ? data.weatherCity.trim() : DEFAULT_CITY;
    var cache = data.weatherCache;
    var fresh = cache && cache.city === city && Date.now() - cache.ts < 30 * 60 * 1000;
    if (cache && cache.city === city) { renderWeather(cache); }
    if (fresh && !force) { return; }

    try {
      var lat, lon, place;
      if (cache && cache.city === city && cache.lat != null) {
        lat = cache.lat; lon = cache.lon; place = cache.place;
      } else {
        var geo = await fetchJson('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(city));
        if (!geo.results || !geo.results.length) {
          $('wxTemp').textContent = '--';
          $('wxDesc').textContent = 'City not found';
          $('wxPlace').textContent = 'Check the city name in Settings';
          return;
        }
        lat = geo.results[0].latitude;
        lon = geo.results[0].longitude;
        place = geo.results[0].name + (geo.results[0].country ? ', ' + geo.results[0].country : '');
      }
      var wx = await fetchJson('https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code&timezone=auto&latitude=' + lat + '&longitude=' + lon);
      var next = { city: city, lat: lat, lon: lon, place: place, temp: wx.current.temperature_2m, code: wx.current.weather_code, ts: Date.now() };
      await chrome.storage.local.set({ weatherCache: next });
      renderWeather(next);
    } catch (e) {
      if (!(cache && cache.city === city)) {
        $('wxTemp').textContent = '--';
        $('wxDesc').textContent = 'Weather unavailable';
        $('wxPlace').textContent = 'Check your internet connection';
      }
    }
  }

  // ---------- Clock, greeting, quote ----------

  function setQuote() {
    var now = new Date();
    var dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    $('quote').textContent = QUOTES[dayOfYear % QUOTES.length];
  }

  function tick() {
    var now = new Date();
    $('clock').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
    $('date').textContent = now.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    var h = now.getHours();
    var g = h < 12 ? 'Good morning' : (h < 18 ? 'Good afternoon' : 'Good evening');
    if ($('greeting').textContent !== g) { $('greeting').textContent = g; }

    if (state.timer.running && Date.now() >= state.timer.endAt) { completeTimer(); }
    renderTimerTime();

    var minuteKey = h * 60 + now.getMinutes();
    if (minuteKey !== lastMinute) {
      lastMinute = minuteKey;
      if (state.tasks.some(function (t) { return t.due && !t.done; })) { renderTasks(); }
    }

    if (dayKey() !== currentDay) {
      currentDay = dayKey();
      setQuote();
      requestRollover();
    }
  }

  function requestRollover() {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({ type: 'rollover-check' }, function () {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  // ---------- Backup ----------

  async function exportBackup() {
    var data = await chrome.storage.local.get(BACKUP_KEYS);
    var payload = { app: 'AXORIX DASH', version: 3, exportedAt: new Date().toISOString(), data: data };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'AXORIX-DASH-backup-' + dayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setMsg('settingsMsg', 'Backup file downloaded.');
  }

  async function importBackup(file) {
    if (!file) { return; }
    var obj;
    try {
      obj = JSON.parse(await file.text());
    } catch (e) {
      setMsg('settingsMsg', 'That file is not a valid backup.');
      return;
    }
    var data = obj && obj.data && typeof obj.data === 'object' ? obj.data : obj;
    if (!data || typeof data !== 'object' || (obj.app && obj.app !== 'AXORIX DASH')) {
      setMsg('settingsMsg', 'That file is not an AXORIX DASH backup.');
      return;
    }

    var out = {};
    if (Array.isArray(data.tasks)) {
      out.tasks = data.tasks.map(normalizeTask).filter(function (t) { return t.text.trim() !== ''; });
    }
    if (typeof data.notes === 'string') { out.notes = data.notes; }
    if (Array.isArray(data.history)) {
      out.history = data.history.filter(function (e) { return e && typeof e.date === 'string' && Array.isArray(e.tasks); });
    }
    if (Array.isArray(data.shortcuts)) {
      loadShortcuts(data.shortcuts);
      out.shortcuts = state.shortcuts;
    }
    if (Array.isArray(data.recurring)) {
      loadRecurring(data.recurring);
      out.recurring = state.recurring;
    }
    if (THEMES.indexOf(data.theme) >= 0) { out.theme = data.theme; }
    if (typeof data.wallpaper === 'string' && /^data:image\//.test(data.wallpaper)) { out.wallpaper = data.wallpaper; }
    if (typeof data.weatherCity === 'string') { out.weatherCity = data.weatherCity.slice(0, 60); }
    if (data.sessions && typeof data.sessions.date === 'string') {
      out.sessions = { date: data.sessions.date, count: Number(data.sessions.count) || 0 };
    }

    if (!Object.keys(out).length) {
      setMsg('settingsMsg', 'No usable data found in that file.');
      return;
    }
    if (!confirm('Import this backup? It will replace your current tasks, notes, history and settings.')) { return; }
    await chrome.storage.local.set(out);
    location.reload();
  }

  // ---------- Background image ----------

  function handleWallpaper(file) {
    if (!file) { return; }
    if (!/^image\//.test(file.type)) {
      setMsg('settingsMsg', 'Please choose an image file.');
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var max = 1920;
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      URL.revokeObjectURL(url);
      chrome.storage.local.set({ wallpaper: dataUrl }, function () {
        if (chrome.runtime.lastError) {
          setMsg('settingsMsg', 'That image is too large to save. Try a smaller one.');
        } else {
          setMsg('settingsMsg', 'Background image saved.');
        }
      });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setMsg('settingsMsg', 'Could not read that image.');
    };
    img.src = url;
  }

  // ---------- Events ----------

  $('taskForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('taskInput');
    var text = input.value.trim();
    if (!text) { return; }
    state.tasks.push({
      id: newId(), text: text, done: false,
      priority: $('taskPriority').value, due: $('taskDue').value || '',
      recurring: false, createdAt: new Date().toISOString()
    });
    input.value = '';
    $('taskDue').value = '';
    saveTasks();
    renderTasks();
  });

  $('clearDone').addEventListener('click', function () {
    state.tasks = state.tasks.filter(function (t) { return !t.done; });
    saveTasks();
    renderTasks();
  });

  $('routineForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('routineInput');
    var text = input.value.trim();
    if (!text) { return; }
    var pr = $('routinePriority').value;
    state.recurring.push({ id: newId(), text: text, priority: pr });
    chrome.storage.local.set({ recurring: state.recurring });
    var exists = state.tasks.some(function (t) { return t.recurring && t.text === text; });
    if (!exists) {
      state.tasks.push({ id: newId(), text: text, done: false, priority: pr, due: '', recurring: true, createdAt: new Date().toISOString() });
      saveTasks();
    }
    input.value = '';
    renderRoutine();
    renderTasks();
  });

  $('notes').addEventListener('input', function () {
    $('savedState').textContent = 'Saving...';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      chrome.storage.local.set({ notes: $('notes').value }, function () {
        $('savedState').textContent = 'Saved';
      });
    }, 400);
  });

  $('editShortcuts').addEventListener('click', function () {
    state.editMode = !state.editMode;
    renderShortcuts();
  });

  $('shortcutForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('scName').value.trim();
    var url = cleanUrl($('scUrl').value);
    if (!name) { setMsg('shortcutMsg', 'Enter a name for the shortcut.'); return; }
    if (!url) { setMsg('shortcutMsg', 'Enter a valid website address, for example example.com.'); return; }
    if (state.shortcuts.length >= 12) { setMsg('shortcutMsg', 'You can have up to 12 shortcuts. Remove one first.'); return; }
    state.shortcuts.push({ id: newId(), name: name.slice(0, 24), url: url, badge: badgeFor(name) });
    chrome.storage.local.set({ shortcuts: state.shortcuts });
    $('scName').value = '';
    $('scUrl').value = '';
    setMsg('shortcutMsg', 'Shortcut added.');
    renderShortcuts();
  });

  $('timerToggle').addEventListener('click', function () {
    if (state.timer.running) { pauseTimer(); } else { startTimer(); }
  });
  $('timerReset').addEventListener('click', resetTimer);
  Array.prototype.forEach.call(document.querySelectorAll('#timerModes [data-mode]'), function (b) {
    b.addEventListener('click', function () { setTimerMode(b.getAttribute('data-mode')); });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-set-theme]'), function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-set-theme');
      applyTheme(t);
      chrome.storage.local.set({ theme: t });
    });
  });

  $('wallpaperBtn').addEventListener('click', function () { $('wallpaperInput').click(); });
  $('wallpaperInput').addEventListener('change', function (e) {
    handleWallpaper(e.target.files[0]);
    e.target.value = '';
  });
  $('wallpaperClear').addEventListener('click', function () {
    chrome.storage.local.remove('wallpaper', function () { setMsg('settingsMsg', 'Background image removed.'); });
  });

  $('cityForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var city = $('cityInput').value.trim();
    if (!city) { setMsg('settingsMsg', 'Enter a city name.'); return; }
    chrome.storage.local.set({ weatherCity: city }, function () {
      setMsg('settingsMsg', 'City saved. Updating weather...');
      loadWeather(true);
    });
  });

  $('exportBtn').addEventListener('click', exportBackup);
  $('importBtn').addEventListener('click', function () { $('importInput').click(); });
  $('importInput').addEventListener('change', function (e) {
    importBackup(e.target.files[0]);
    e.target.value = '';
  });

  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      $('searchInput').focus();
    }
  });

  // Keep multiple open tabs in sync.
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') { return; }
    if (changes.tasks) { loadTasks(changes.tasks.newValue); renderTasks(); }
    if (changes.history) {
      state.history = Array.isArray(changes.history.newValue) ? changes.history.newValue : [];
      renderStreak();
    }
    if (changes.notes && document.activeElement !== $('notes')) {
      $('notes').value = typeof changes.notes.newValue === 'string' ? changes.notes.newValue : '';
    }
    if (changes.shortcuts) { loadShortcuts(changes.shortcuts.newValue); renderShortcuts(); }
    if (changes.recurring) { loadRecurring(changes.recurring.newValue); renderRoutine(); }
    if (changes.timer) { loadTimer(changes.timer.newValue); renderTimer(); }
    if (changes.sessions) { state.sessions = changes.sessions.newValue || { date: '', count: 0 }; renderTimer(); }
    if (changes.theme) { applyTheme(changes.theme.newValue); }
    if (changes.wallpaper) { applyWallpaper(changes.wallpaper.newValue); }
  });

  // ---------- Start ----------

  async function init() {
    $('ringFill').style.strokeDasharray = String(CIRC);
    tick();
    setQuote();
    await requestRollover();
    var d = await chrome.storage.local.get([
      'tasks', 'notes', 'history', 'shortcuts', 'recurring', 'timer', 'sessions', 'theme', 'wallpaper', 'weatherCity'
    ]);
    loadTasks(d.tasks);
    loadShortcuts(d.shortcuts);
    loadRecurring(d.recurring);
    loadTimer(d.timer);
    state.history = Array.isArray(d.history) ? d.history : [];
    state.sessions = d.sessions || { date: '', count: 0 };
    $('notes').value = typeof d.notes === 'string' ? d.notes : '';
    $('cityInput').value = typeof d.weatherCity === 'string' ? d.weatherCity : DEFAULT_CITY;
    applyTheme(d.theme);
    applyWallpaper(d.wallpaper);
    renderTasks();
    renderShortcuts();
    renderRoutine();
    renderTimer();
    if (state.timer.running && Date.now() >= state.timer.endAt) { completeTimer(); }
    loadWeather(false);
  }

  setInterval(tick, 1000);
  init();
})();
