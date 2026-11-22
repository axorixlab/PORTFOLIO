// AXORIX DASH v3.0 - daily rollover, recurring tasks and JSON report downloads

function pad(n) {
  return String(n).padStart(2, '0');
}

function localDateKey(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function normalizeTask(t, i) {
  if (typeof t === 'string') {
    return { id: 'legacy-' + i, text: t, done: false, priority: 'medium', due: '', recurring: false };
  }
  const p = String(t.priority || 'medium').toLowerCase();
  return {
    id: t.id != null ? t.id : 'legacy-' + i,
    text: String(t.text != null ? t.text : (t.title != null ? t.title : (t.name != null ? t.name : ''))),
    done: Boolean(t.done != null ? t.done : (t.completed != null ? t.completed : t.checked)),
    priority: ['high', 'medium', 'low'].indexOf(p) >= 0 ? p : 'medium',
    due: /^\d{2}:\d{2}$/.test(t.due || '') ? t.due : '',
    recurring: Boolean(t.recurring),
    createdAt: t.createdAt
  };
}

async function downloadReport(entry) {
  try {
    const json = JSON.stringify(entry, null, 2);
    const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    await chrome.downloads.download({
      url: url,
      filename: 'AXORIX-DASH-Reports/AXORIX-DASH-' + entry.date + '.json',
      conflictAction: 'uniquify',
      saveAs: false
    });
  } catch (err) {
    console.error('AXORIX DASH: report download failed', err);
  }
}

let running = null;

function rollover() {
  if (!running) {
    running = doRollover().finally(function () { running = null; });
  }
  return running;
}

function seedRecurring(list) {
  return (Array.isArray(list) ? list : [])
    .filter(function (r) { return r && typeof r.text === 'string' && r.text.trim() !== ''; })
    .map(function (r, i) {
      return {
        id: 'r-' + Date.now().toString(36) + '-' + i,
        text: r.text.trim(),
        done: false,
        priority: ['high', 'medium', 'low'].indexOf(r.priority) >= 0 ? r.priority : 'medium',
        due: '',
        recurring: true,
        createdAt: new Date().toISOString()
      };
    });
}

async function doRollover() {
  const today = localDateKey();
  const data = await chrome.storage.local.get(['tasks', 'notes', 'lastDate', 'history', 'recurring']);

  // First run, or upgrade from an older version (no lastDate yet): keep existing tasks, start tracking today.
  if (!data.lastDate || data.lastDate > today) {
    await chrome.storage.local.set({ lastDate: today });
    return { rolled: false };
  }
  if (data.lastDate === today) {
    return { rolled: false };
  }

  const tasks = (Array.isArray(data.tasks) ? data.tasks : [])
    .map(normalizeTask)
    .filter(function (t) { return t.text.trim() !== ''; });

  let history = Array.isArray(data.history) ? data.history : [];
  let entry = null;

  // A day counts as active if the user added a task of their own or finished anything.
  const active = tasks.some(function (t) { return !t.recurring || t.done; });

  if (tasks.length > 0 && active) {
    const completed = tasks.filter(function (t) { return t.done; }).length;
    entry = {
      date: data.lastDate,
      total: tasks.length,
      completed: completed,
      percent: Math.round((completed / tasks.length) * 100),
      tasks: tasks,
      notes: typeof data.notes === 'string' ? data.notes : '',
      archivedAt: new Date().toISOString()
    };
    history = [entry].concat(history.filter(function (h) { return h.date !== entry.date; }));
    history.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  await chrome.storage.local.set({
    history: history,
    tasks: seedRecurring(data.recurring),
    lastDate: today
  });
  if (entry) {
    await downloadReport(entry);
  }
  return { rolled: true, archived: Boolean(entry) };
}

function scheduleAlarms() {
  const next = new Date();
  next.setHours(24, 0, 2, 0); // just after the next local midnight
  chrome.alarms.create('axorix-midnight', { when: next.getTime() });
  chrome.alarms.create('axorix-check', { periodInMinutes: 15 });
}

chrome.runtime.onInstalled.addListener(function () {
  scheduleAlarms();
  rollover();
});

chrome.runtime.onStartup.addListener(function () {
  scheduleAlarms();
  rollover();
});

chrome.alarms.onAlarm.addListener(function (alarm) {
  rollover().then(function () {
    if (alarm.name === 'axorix-midnight') {
      scheduleAlarms();
    }
  });
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'rollover-check') {
    rollover().then(sendResponse, function () { sendResponse({ rolled: false }); });
    return true; // async response
  }
});
