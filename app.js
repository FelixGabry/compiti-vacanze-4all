const STORE = "compiti-4all-2026-v1";
const CHAR_END = "2026-09-12";

function empty() {
  return { checked: {}, notes: {}, journal: "", firma: "", chars: {}, showOptional: false, page: "home" };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE));
    if (!raw) return empty();
    return {
      ...empty(),
      ...raw,
      checked: raw.checked || {},
      notes: raw.notes || {},
      chars: raw.chars || {},
    };
  } catch {
    return empty();
  }
}

const state = load();

function save() {
  localStorage.setItem(STORE, JSON.stringify(state));
}

function walkTasks(fn) {
  DATA.subjects.forEach((s) => s.tasks.forEach((t) => {
    fn(t, s);
    (t.children || []).forEach((c) => fn(c, s, t));
  }));
}

function isDone(id) {
  if (id in state.checked) return !!state.checked[id];
  let found;
  walkTasks((t) => { if (t.id === id) found = t; });
  return !!(found && found.done);
}

function isComplete(task) {
  if (task.children && task.children.length) {
    return task.children.every((c) => isDone(c.id)) || isDone(task.id);
  }
  return isDone(task.id);
}

function counts() {
  let total = 0, done = 0;
  DATA.subjects.forEach((s) => s.tasks.forEach((t) => {
    if (t.optional && !state.showOptional && !isDone(t.id)) return;
    total += 1;
    if (isComplete(t)) done += 1;
    (t.children || []).forEach((c) => {
      total += 1;
      if (isDone(c.id)) done += 1;
    });
  }));
  return { total, done };
}

function subjectStats(sub) {
  let total = 0, done = 0;
  sub.tasks.forEach((t) => {
    if (t.optional && !state.showOptional && !isDone(t.id)) return;
    total += 1;
    if (isComplete(t)) done += 1;
    (t.children || []).forEach((c) => {
      total += 1;
      if (isDone(c.id)) done += 1;
    });
  });
  return { total, done, pct: total ? done / total : 0 };
}

function parentProgress(task) {
  if (!task.children) return null;
  const d = task.children.filter((c) => isDone(c.id)).length;
  return d + "/" + task.children.length;
}

function daysBetween(from, to) {
  const a = new Date(from + "T12:00:00");
  const b = new Date(to + "T12:00:00");
  const out = [];
  for (let t = a.getTime(); t <= b.getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function weekday(iso) {
  return ["do", "lu", "ma", "me", "gi", "ve", "sa"][new Date(iso + "T12:00:00").getDay()];
}

function nextDay(iso) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function charCounts() {
  const start = state.firma ? nextDay(state.firma) : "2026-08-20";
  const days = daysBetween(start, CHAR_END);
  const done = days.filter((d) => state.chars[d]).length;
  return { total: days.length, done, days, start };
}

let filter = "all";
let query = "";
let menuOpen = false;
const openReqs = new Set();

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function filesHtml(list) {
  if (!list || !list.length) return "";
  return `<div class="files">${list.map((f) => {
    const ext = (f.href.split(".").pop() || "").toUpperCase();
    return `<a class="file" href="${esc(f.href)}" target="_blank" rel="noopener"><span class="file-ext">${esc(ext)}</span>${esc(f.name)}</a>`;
  }).join("")}</div>`;
}

const KIND_LABEL = {
  due: "Consegna",
  exam: "Verifica",
  oral: "Orale",
  dictation: "Dettato",
  maybe: "Attenzione",
};

function daysLeft(iso) {
  if (!iso) return null;
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const d = new Date(iso + "T12:00:00");
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

function whenText(iso) {
  const n = daysLeft(iso);
  if (n == null) return "";
  if (n < 0) return " · scaduto";
  if (n === 0) return " · oggi";
  if (n === 1) return " · domani";
  return " · tra " + n + " giorni";
}

function alertHtml(list) {
  if (!list || !list.length) return "";
  return `<div class="alerts">${list.map((a) => `
    <div class="alert alert-${esc(a.kind || "due")}">
      <span class="alert-kind">${esc(KIND_LABEL[a.kind] || "Scadenza")}</span>
      ${esc(a.label)}${esc(whenText(a.date))}
    </div>`).join("")}</div>`;
}

function nearestAlert(list) {
  if (!list || !list.length) return null;
  return list.slice().sort((a, b) => (a.date || "9999") < (b.date || "9999") ? -1 : 1)[0];
}

function reqHtml(id, text, who) {
  if (!text) return "";
  const open = openReqs.has(id) ? " open" : "";
  const label = who ? "Cosa chiede " + who : "Cosa chiede il prof";
  return `<details class="req"${open} data-req="${esc(id)}">
    <summary>${esc(label)}</summary>
    <div class="req-body">${esc(text).replace(/\n/g, "<br>")}</div>
  </details>`;
}

function bindReqs(root) {
  root.querySelectorAll("details.req").forEach((d) => {
    d.addEventListener("toggle", () => {
      const id = d.dataset.req;
      if (d.open) openReqs.add(id);
      else openReqs.delete(id);
    });
  });
}

function taskBlob(task) {
  const parts = [task.title, task.hint, task.req, task.who, ...(task.files || []).map((f) => f.name), ...(task.alerts || []).map((a) => a.label)];
  (task.children || []).forEach((c) => parts.push(c.title, c.req));
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function subjectBlob(sub) {
  return [sub.name, sub.teacher, sub.ask, sub.blurb, sub.points, ...(sub.alerts || []).map((a) => a.label)].filter(Boolean).join(" ").toLowerCase();
}

function taskVisible(task, sub) {
  if (task.optional && !state.showOptional && !isDone(task.id)) return false;
  const complete = isComplete(task);
  if (filter === "todo" && complete) return false;
  if (filter === "done" && !complete) return false;
  if (!query) return true;
  if (subjectBlob(sub).includes(query)) return true;
  return taskBlob(task).includes(query);
}

function currentSubject() {
  return DATA.subjects.find((s) => s.id === state.page);
}

function isSubjectPage() {
  return !!currentSubject();
}

function goTo(page) {
  state.page = page;
  menuOpen = false;
  query = "";
  const q = document.getElementById("q");
  if (q) q.value = "";
  save();
  window.scrollTo(0, 0);
  render();
}

function setMenu(open) {
  menuOpen = open;
  renderMenu();
}

function tapCheck() {
  try {
    if (navigator.vibrate) navigator.vibrate(12);
  } catch {
    /* ignore */
  }
}

function firstOpenTask(sub) {
  for (const t of sub.tasks) {
    if (t.optional && !state.showOptional && !isDone(t.id)) continue;
    if (!isComplete(t)) return t;
  }
  return null;
}

function nextUp() {
  const ranked = DATA.subjects
    .map((s) => ({ s, ...subjectStats(s) }))
    .filter((x) => x.done < x.total)
    .sort((a, b) => a.pct - b.pct);
  if (!ranked.length) return null;
  const task = firstOpenTask(ranked[0].s);
  if (!task) return null;
  return { subject: ranked[0].s, task };
}

function pageLabel() {
  if (state.page === "home") return "Home";
  if (state.page === "caratteri") return "Caratteri";
  if (state.page === "note") return "Note";
  const s = currentSubject();
  if (!s) return "Home";
  const st = subjectStats(s);
  return (s.short || s.name) + "  " + st.done + "/" + st.total;
}

function renderMenu() {
  const sheet = document.getElementById("menu-sheet");
  const backdrop = document.getElementById("menu-backdrop");
  const btn = document.getElementById("menu-btn");
  document.getElementById("menu-label").textContent = pageLabel();
  btn.setAttribute("aria-expanded", menuOpen ? "true" : "false");
  sheet.classList.toggle("hidden", !menuOpen);
  backdrop.classList.toggle("hidden", !menuOpen);
  if (!menuOpen) return;
  const char = charCounts();
  const items = [
    { id: "home", label: "Home", meta: "" },
    ...DATA.subjects.map((s) => {
      const st = subjectStats(s);
      const hot = !!(s.alerts && s.alerts.length) && !(st.total && st.done === st.total);
      return { id: s.id, label: s.short || s.name, meta: st.done + "/" + st.total, hot };
    }),
    { id: "caratteri", label: "Caratteri", meta: char.done + "/" + char.total, hot: !(char.total && char.done === char.total) },
    { id: "note", label: "Note", meta: "" },
  ];
  sheet.innerHTML = items.map((it) => `
    <button type="button" class="menu-item${it.id === state.page ? " on" : ""}${it.hot ? " hot" : ""}" data-go="${it.id}" role="menuitem">
      <span>${esc(it.label)}</span>
      ${it.meta ? `<span class="menu-meta">${esc(it.meta)}</span>` : ""}
    </button>
  `).join("");
  sheet.querySelectorAll("[data-go]").forEach((b) => {
    b.addEventListener("click", () => goTo(b.dataset.go));
  });
}

function renderHeaderProgress() {
  const home = state.page === "home";
  document.getElementById("progress-row").classList.toggle("hidden", !home);
  if (!home) return;
  const { total, done } = counts();
  const pct = total ? done / total : 0;
  const r = 18, circ = 2 * Math.PI * r;
  document.getElementById("ring-fg").style.strokeDasharray = String(circ);
  document.getElementById("ring-fg").style.strokeDashoffset = String(circ * (1 - pct));
  document.getElementById("prog-num").textContent = done + " / " + total;
  document.getElementById("prog-pct").textContent = Math.round(pct * 100) + "%";
}

function septemberWatch() {
  const rows = [];
  DATA.subjects.forEach((s) => {
    const st = subjectStats(s);
    if (st.total && st.done === st.total) return;
    (s.alerts || []).forEach((a) => {
      rows.push({ ...a, go: s.id, name: s.short || s.name });
    });
  });
  const char = charCounts();
  if (!(char.total && char.done === char.total)) {
    rows.push({ kind: "due", date: CHAR_END, label: "2 righe di caratteri al giorno fino al 12 settembre", go: "caratteri", name: "Caratteri" });
  }
  const seen = new Set();
  return rows.filter((r) => {
    const k = r.go + r.kind + r.label;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
}

function renderHome() {
  const box = document.getElementById("home");
  const nxt = nextUp();
  const char = charCounts();
  const watch = septemberWatch();
  const cards = DATA.subjects.map((s) => {
    const st = subjectStats(s);
    const pct = Math.round(st.pct * 100);
    const all = st.total && st.done === st.total;
    const hot = !all && s.alerts && s.alerts.length;
    const top = nearestAlert(s.alerts);
    return `
      <button type="button" class="home-card${all ? " done" : ""}${hot ? " hot" : ""}" data-go="${s.id}">
        <div class="home-card-top">
          <strong>${esc(s.name)}</strong>
          <span class="due${hot ? " hot" : ""}">${esc(s.due)}</span>
        </div>
        ${hot && top ? `<div class="alert-line">${esc(KIND_LABEL[top.kind] || "Scadenza")} · ${esc(top.label)}${esc(whenText(top.date))}</div>` : ""}
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="home-meta">${st.done} / ${st.total}${all ? " · fatto" : ""}</div>
      </button>
    `;
  }).join("");
  const charPct = char.total ? Math.round((char.done / char.total) * 100) : 0;
  const charDone = char.total && char.done === char.total;
  const watchHtml = watch.length ? `
    <div class="sept-box">
      <div class="sept-kicker">Settembre — scadenze e prove</div>
      ${watch.map((w) => `
        <button type="button" class="sept-row" data-go="${w.go}">
          <span class="alert-kind">${esc(KIND_LABEL[w.kind] || "Scadenza")}</span>
          <span><strong>${esc(w.name)}</strong> — ${esc(w.label)}${esc(whenText(w.date))}</span>
        </button>
      `).join("")}
    </div>` : "";
  box.innerHTML = `
    ${watchHtml}
    ${nxt ? `
      <button type="button" class="next-card" data-go="${nxt.subject.id}">
        <div class="ask-kicker">Prossimo punto</div>
        <div class="next-title">${esc(nxt.task.title)}</div>
        <div class="hint">${esc(nxt.subject.name)}</div>
      </button>
    ` : `<p class="celebrate">Tutto spuntato.</p>`}
    <div class="home-grid">${cards}</div>
    <button type="button" class="home-card${charDone ? " done" : " hot"}" data-go="caratteri">
      <div class="home-card-top">
        <strong>Caratteri</strong>
        <span class="due${charDone ? "" : " hot"}">12 set</span>
      </div>
      ${charDone ? "" : `<div class="alert-line">Consegna · 2 righe al giorno fino al 12 settembre${esc(whenText(CHAR_END))}</div>`}
      <div class="bar"><i style="width:${charPct}%"></i></div>
      <div class="home-meta">${char.done} / ${char.total} giorni${charDone ? " · fatto" : ""}</div>
    </button>
    <button type="button" class="home-card" data-go="note">
      <div class="home-card-top">
        <strong>Note</strong>
      </div>
      <div class="home-meta">${state.journal ? "C’è già qualcosa nel diario" : "Diario e backup"}</div>
    </button>
  `;
  box.querySelectorAll("[data-go]").forEach((b) => {
    b.addEventListener("click", () => goTo(b.dataset.go));
  });
}

function renderSubject() {
  const sub = currentSubject();
  const box = document.getElementById("compiti");
  box.innerHTML = "";
  if (!sub) {
    goTo("home");
    return;
  }
  const st = subjectStats(sub);
  const tasks = sub.tasks.filter((t) => taskVisible(t, sub));
  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML = `
    <div class="page-head-row">
      <h1>${esc(sub.name)}</h1>
      <span class="due${sub.alerts && sub.alerts.length ? " hot" : ""}">${esc(sub.due)}</span>
    </div>
    ${sub.teacher ? `<p class="teacher">${esc(sub.teacher)}</p>` : ""}
    <p class="blurb">${esc(sub.blurb)}</p>
    ${alertHtml(sub.alerts)}
    <div class="bar page-bar"><i style="width:${Math.round(st.pct * 100)}%"></i></div>
    <p class="count">${st.done} / ${st.total}</p>
    ${st.done === st.total && st.total ? `<p class="celebrate">${esc(sub.short || sub.name)} fatto.</p>` : ""}
    ${filesHtml(sub.files)}
  `;
  box.appendChild(head);
  if (sub.ask) {
    const ask = document.createElement("details");
    ask.className = "req";
    ask.innerHTML = `<summary>Richiesta complessiva</summary><div class="req-body">${esc(sub.ask).replace(/\n/g, "<br>")}</div>`;
    box.appendChild(ask);
  }
  const list = document.createElement("div");
  list.className = "task-list";
  tasks.forEach((task) => list.appendChild(renderTask(task, sub)));
  box.appendChild(list);
  if (!tasks.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Niente con questo filtro.";
    box.appendChild(p);
  }
}

function renderTask(task, sub) {
  const wrap = document.createElement("div");
  wrap.className = "task" + (isComplete(task) ? " done" : "");
  const kids = task.children
    ? `<div class="children">${task.children.map((c) => `
        <div class="child">
          <label class="child-row">
            <input class="check" type="checkbox" data-id="${c.id}" ${isDone(c.id) ? "checked" : ""}>
            <span>${esc(c.title)}</span>
          </label>
          ${alertHtml(c.alerts || task.alerts)}
          ${reqHtml(c.id, c.req, c.who || task.who || sub.who)}
          ${filesHtml(c.files || task.files)}
        </div>`).join("")}</div>`
    : "";
  const prog = parentProgress(task);
  wrap.innerHTML = `
    <div class="task-row">
      <input class="check" type="checkbox" data-id="${task.id}" ${isComplete(task) ? "checked" : ""}>
      <div>
        <div class="title">${esc(task.title)}${task.optional ? '<span class="badge">facoltativo</span>' : ""}${prog ? " · " + prog : ""}</div>
        ${alertHtml(task.alerts)}
        ${task.hint ? `<div class="hint">${esc(task.hint)}</div>` : ""}
        ${reqHtml(task.id, task.req, task.who || sub.who)}
        ${filesHtml(task.files)}
        ${task.href ? `<a class="link" href="${esc(task.href)}" target="_blank" rel="noopener">Apri link</a>` : ""}
        ${kids}
        <textarea class="note" data-note="${task.id}" placeholder="Nota su questo punto…">${esc(state.notes[task.id] || "")}</textarea>
      </div>
    </div>
  `;
  bindReqs(wrap);
  wrap.querySelectorAll("input.check").forEach((inp) => {
    inp.addEventListener("change", () => {
      const t = findTask(inp.dataset.id);
      state.checked[inp.dataset.id] = inp.checked;
      if (t && t.children) {
        t.children.forEach((c) => { state.checked[c.id] = inp.checked; });
      }
      DATA.subjects.forEach((s) => s.tasks.forEach((parent) => {
        if (!parent.children) return;
        if (parent.children.some((c) => c.id === inp.dataset.id)) {
          state.checked[parent.id] = parent.children.every((c) => isDone(c.id) || (c.id === inp.dataset.id && inp.checked));
        }
      }));
      if (inp.checked) tapCheck();
      save();
      setTimeout(render, inp.checked ? 220 : 0);
    });
  });
  wrap.querySelector("textarea.note").addEventListener("input", (e) => {
    state.notes[task.id] = e.target.value;
    save();
  });
  return wrap;
}

function findTask(id) {
  let found;
  walkTasks((t) => { if (t.id === id) found = t; });
  return found;
}

function renderChars() {
  const { days, done, total } = charCounts();
  const el = document.getElementById("char-alerts");
  if (el) {
    el.innerHTML = alertHtml([
      { kind: "due", date: CHAR_END, label: "2 righe di caratteri al giorno fino al 12 settembre" },
      { kind: "dictation", date: "2026-09-14", label: "Dettato della Zu al rientro" },
    ]);
  }
  document.getElementById("firma").value = state.firma || "";
  document.getElementById("char-stats").textContent =
    done + " / " + total + " giorni · " + (total - done) + " ancora da fare · " + ((total - done) * 2) + " righe rimaste";
  const cal = document.getElementById("cal");
  cal.innerHTML = days.map((d) => {
    const on = state.chars[d] ? " on" : "";
    const [, m, day] = d.split("-");
    return `<button class="day${on}" data-day="${d}"><span class="w">${weekday(d)}</span><span class="n">${Number(day)}/${Number(m)}</span></button>`;
  }).join("");
  cal.querySelectorAll(".day").forEach((b) => {
    b.addEventListener("click", () => {
      state.chars[b.dataset.day] = !state.chars[b.dataset.day];
      if (state.chars[b.dataset.day]) tapCheck();
      save();
      renderChars();
      renderMenu();
    });
  });
}

function renderJournal() {
  document.getElementById("journal").value = state.journal || "";
}

function render() {
  const subPage = isSubjectPage();
  document.getElementById("home-panel").classList.toggle("show", state.page === "home");
  document.getElementById("compiti-panel").classList.toggle("show", subPage);
  document.getElementById("char-panel").classList.toggle("show", state.page === "caratteri");
  document.getElementById("note-panel").classList.toggle("show", state.page === "note");
  document.getElementById("search-wrap").classList.toggle("hidden", !subPage);
  renderHeaderProgress();
  renderMenu();
  if (state.page === "home") renderHome();
  if (subPage) renderSubject();
  if (state.page === "caratteri") renderChars();
  if (state.page === "note") renderJournal();
}

function backup() {
  return JSON.stringify(state, null, 2);
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("menu-btn").addEventListener("click", () => setMenu(!menuOpen));
  document.getElementById("menu-backdrop").addEventListener("click", () => setMenu(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenu(false);
  });
  document.getElementById("q").addEventListener("input", (e) => {
    query = e.target.value.trim().toLowerCase();
    render();
  });
  document.querySelectorAll("[data-filter]").forEach((b) => {
    b.addEventListener("click", () => {
      filter = b.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((x) => x.classList.toggle("on", x === b));
      render();
    });
  });
  document.getElementById("opt").addEventListener("click", () => {
    state.showOptional = !state.showOptional;
    save();
    document.getElementById("opt").classList.toggle("on", state.showOptional);
    render();
  });
  document.getElementById("firma").addEventListener("change", (e) => {
    state.firma = e.target.value;
    save();
    renderChars();
    renderMenu();
  });
  document.getElementById("journal").addEventListener("input", (e) => {
    state.journal = e.target.value;
    save();
  });
  document.getElementById("copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText(backup());
    alert("Backup copiato. Incollalo in Note o Telegram, così non lo perdi.");
  });
  document.getElementById("download").addEventListener("click", () => {
    const blob = new Blob([backup()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "compiti-backup.json";
    a.click();
  });
  document.getElementById("restore").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        Object.assign(state, empty(), parsed);
        save();
        render();
        alert("Backup ripristinato.");
      } catch {
        alert("File non valido.");
      }
    };
    r.readAsText(f);
  });
  if (state.showOptional) document.getElementById("opt").classList.add("on");
  if (state.page && state.page !== "home" && !isSubjectPage() && state.page !== "caratteri" && state.page !== "note") {
    state.page = "home";
  }
  render();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js");
  }
});
