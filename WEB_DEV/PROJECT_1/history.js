// AXORIX DASH v3.0 - history archive, weekly chart and clearing

(function () {
  'use strict';

  var THEMES = ['blue', 'purple', 'green'];
  var listEl = document.getElementById('historyList');
  var emptyEl = document.getElementById('historyEmpty');
  var summaryEl = document.getElementById('summary');
  var clearAllBtn = document.getElementById('clearAll');
  var chartEl = document.getElementById('weekChart');
  var weekSummaryEl = document.getElementById('weekSummary');

  var historyData = [];
  var todayTasks = [];

  function pad(n) { return String(n).padStart(2, '0'); }

  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function isDone(t) { return Boolean(t && (t.done || t.completed || t.checked)); }

  function taskText(t) {
    if (typeof t === 'string') { return t; }
    return String(t.text != null ? t.text : (t.title != null ? t.title : (t.name != null ? t.name : '')));
  }

  function formatDate(key) {
    var p = String(key).split('-');
    if (p.length !== 3) { return String(key); }
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', THEMES.indexOf(t) >= 0 ? t : 'blue');
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

  function downloadEntry(entry) {
    var blob = new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'AXORIX-DASH-' + entry.date + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function renderChart() {
    var map = {};
    historyData.forEach(function (e) {
      var t = Array.isArray(e.tasks) ? e.tasks : [];
      map[e.date] = { total: t.length, done: t.filter(isDone).length };
    });
    if (todayTasks.length) {
      map[dayKey()] = { total: todayTasks.length, done: todayTasks.filter(isDone).length };
    }

    chartEl.textContent = '';
    var sumPct = 0;
    var daysWithTasks = 0;

    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var entry = map[dayKey(d)];
      var has = Boolean(entry && entry.total > 0);
      var pct = has ? Math.round((entry.done / entry.total) * 100) : 0;
      if (has) { sumPct += pct; daysWithTasks++; }

      var col = document.createElement('div');
      col.className = 'week-col';
      col.title = has ? (entry.done + ' of ' + entry.total + ' tasks done') : 'No tasks';

      var val = document.createElement('span');
      val.className = 'week-val';
      val.textContent = has ? pct + '%' : '-';

      var track = document.createElement('div');
      track.className = 'week-track';
      var bar = document.createElement('div');
      bar.className = 'week-bar';
      bar.style.height = (has ? Math.max(pct, 3) : 0) + '%';
      track.appendChild(bar);

      var day = document.createElement('span');
      day.className = 'week-day';
      day.textContent = i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' });

      col.appendChild(val);
      col.appendChild(track);
      col.appendChild(day);
      chartEl.appendChild(col);
    }

    weekSummaryEl.textContent = daysWithTasks
      ? 'Average completion ' + Math.round(sumPct / daysWithTasks) + '% across ' + daysWithTasks + (daysWithTasks === 1 ? ' day' : ' days') + ' with tasks'
      : 'No tasks in the last 7 days yet.';
  }

  function render(history) {
    listEl.textContent = '';
    var has = history.length > 0;
    emptyEl.hidden = has;
    clearAllBtn.hidden = !has;

    var totalDone = 0;
    var totalTasks = 0;

    history.forEach(function (entry) {
      var tasks = Array.isArray(entry.tasks) ? entry.tasks : [];
      var done = tasks.filter(isDone).length;
      var total = tasks.length;
      var pct = total ? Math.round((done / total) * 100) : 0;
      totalDone += done;
      totalTasks += total;

      var card = document.createElement('details');
      card.className = 'day';

      var sum = document.createElement('summary');
      var title = document.createElement('span');
      title.className = 'day-title';
      title.textContent = formatDate(entry.date);
      var stat = document.createElement('span');
      stat.className = 'day-stat';
      stat.textContent = done + ' of ' + total + ' done (' + pct + '%)';
      var bar = document.createElement('span');
      bar.className = 'bar';
      var fill = document.createElement('span');
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      sum.appendChild(title);
      sum.appendChild(stat);
      sum.appendChild(bar);
      card.appendChild(sum);

      var body = document.createElement('div');
      body.className = 'day-body';

      var ul = document.createElement('ul');
      ul.className = 'history-tasks';
      tasks.forEach(function (t) {
        var li = document.createElement('li');
        li.className = isDone(t) ? 'done' : '';
        var pr = t && t.priority ? ' [' + String(t.priority).charAt(0).toUpperCase() + String(t.priority).slice(1) + ']' : '';
        li.textContent = (isDone(t) ? 'Done: ' : 'Not done: ') + taskText(t) + pr;
        ul.appendChild(li);
      });
      body.appendChild(ul);

      if (entry.notes && String(entry.notes).trim()) {
        var notes = document.createElement('pre');
        notes.className = 'history-notes';
        notes.textContent = entry.notes;
        body.appendChild(notes);
      }

      var actions = document.createElement('div');
      actions.className = 'task-actions';
      var dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'ghost';
      dl.textContent = 'Download JSON';
      dl.addEventListener('click', function () { downloadEntry(entry); });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'danger';
      del.textContent = 'Delete this day';
      del.addEventListener('click', function () {
        if (!confirm('Delete the history for ' + formatDate(entry.date) + '?')) { return; }
        chrome.storage.local.get(['history'], function (data) {
          var h = (data.history || []).filter(function (x) { return x.date !== entry.date; });
          chrome.storage.local.set({ history: h });
        });
      });
      actions.appendChild(dl);
      actions.appendChild(del);
      body.appendChild(actions);

      card.appendChild(body);
      listEl.appendChild(card);
    });

    summaryEl.textContent = has
      ? history.length + (history.length === 1 ? ' day' : ' days') + ' archived, ' + totalDone + ' of ' + totalTasks + ' tasks completed'
      : '';
  }

  function load() {
    chrome.storage.local.get(['history', 'tasks', 'theme', 'wallpaper'], function (data) {
      historyData = Array.isArray(data.history) ? data.history.slice() : [];
      historyData.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      todayTasks = Array.isArray(data.tasks) ? data.tasks : [];
      applyTheme(data.theme);
      applyWallpaper(data.wallpaper);
      render(historyData);
      renderChart();
    });
  }

  clearAllBtn.addEventListener('click', function () {
    if (!confirm('Clear all task history? Downloaded report files will not be deleted.')) { return; }
    chrome.storage.local.set({ history: [] });
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') { return; }
    if (changes.history || changes.tasks) { load(); }
    if (changes.theme) { applyTheme(changes.theme.newValue); }
    if (changes.wallpaper) { applyWallpaper(changes.wallpaper.newValue); }
  });

  load();
})();
