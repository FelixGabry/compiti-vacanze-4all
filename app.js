const STORE = "compiti-4all-2026-v1";
const PIN_KEY = "compiti-4all-pin";
const API_KEY = "compiti-4all-api";
const DEFAULT_API = "https://compiti-4all.gatto-compiti.workers.dev";
const CHAR_END = "2026-09-12";

function empty() {
  return { checked: {}, notes: {}, journal: "", firma: "", chars: {}, showOptional: false, focus30: true, page: "home", updatedAt: 0 };
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
let pushTimer = 0;

function getPin() {
  return (localStorage.getItem(PIN_KEY) || "").trim();
}

function getApi() {
  return (localStorage.getItem(API_KEY) || DEFAULT_API).replace(/\/+$/, "");
}

function authHeaders() {
  const pin = getPin();
  return pin ? { Authorization: "Bearer " + pin, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function hasLocalWork() {
  return Object.keys(state.checked || {}).length > 0
    || Object.keys(state.chars || {}).length > 0
    || Object.keys(state.notes || {}).length > 0
    || !!(state.journal && state.journal.trim())
    || !!state.firma;
}

function applyRemote(remote) {
  const page = state.page;
  const next = {
    ...empty(),
    ...remote,
    checked: remote.checked || {},
    notes: remote.notes || {},
    chars: remote.chars || {},
    page,
  };
  Object.keys(state).forEach((k) => { delete state[k]; });
  Object.assign(state, next);
}

function save(opts) {
  const skipStamp = opts && opts.skipStamp;
  const skipPush = opts && opts.skipPush;
  if (!skipStamp) state.updatedAt = Date.now();
  localStorage.setItem(STORE, JSON.stringify(state));
  if (!skipPush) schedulePush();
}

function schedulePush() {
  if (!getPin() || !getApi()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushState, 500);
}

function setSyncMsg(text, kind) {
  const el = document.getElementById("sync-msg");
  if (!el) return;
  el.textContent = text || "";
  el.className = "sync-msg" + (kind ? " " + kind : "");
}

async function pullState() {
  if (!getPin() || !getApi()) {
    setSyncMsg("Inserisci PIN e indirizzo del server (una volta).");
    return;
  }
  try {
    const res = await fetch(getApi() + "/state", { headers: authHeaders() });
    if (res.status === 401) {
      setSyncMsg("PIN non accettato dal server.", "err");
      return;
    }
    if (res.status === 204) {
      if (hasLocalWork()) {
        await pushState();
        setSyncMsg("Prima copia caricata sul server.", "ok");
      } else {
        setSyncMsg("Server vuoto. Le prossime spunte si salveranno lì.", "ok");
      }
      return;
    }
    if (!res.ok) {
      setSyncMsg("Server non raggiungibile (" + res.status + "). Restano le spunte di questo telefono.", "err");
      return;
    }
    const remote = await res.json();
    const remoteTs = Number(remote && remote.updatedAt) || 0;
    const localTs = Number(state.updatedAt) || 0;
    if (remoteTs > localTs) {
      applyRemote(remote);
      save({ skipStamp: true, skipPush: true });
      render();
      setSyncMsg("Allineato al server.", "ok");
    } else if (localTs > remoteTs && hasLocalWork()) {
      await pushState();
      setSyncMsg("Questo telefono era più avanti: inviato al server.", "ok");
    } else {
      setSyncMsg("Sincronizzato.", "ok");
    }
  } catch {
    setSyncMsg("Niente rete. Le spunte restano su questo telefono.", "err");
  }
}

async function pushState() {
  if (!getPin() || !getApi()) return;
  try {
    const res = await fetch(getApi() + "/state", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(state),
    });
    if (res.status === 401) {
      setSyncMsg("PIN non accettato dal server.", "err");
      return;
    }
    if (!res.ok) {
      setSyncMsg("Salvataggio sul server non riuscito.", "err");
      return;
    }
    setSyncMsg("Salvato sul server.", "ok");
  } catch {
    setSyncMsg("Offline: salvato solo su questo telefono.", "err");
  }
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

function isCore(id) {
  return CORE.fi.includes(id) || CORE.ma.includes(id);
}

function parentHasCore(task) {
  return !!(task.children && task.children.some((c) => isCore(c.id)));
}

function countedKids(task) {
  if (!task.children) return [];
  if (state.focus30 && parentHasCore(task)) {
    return task.children.filter((c) => isCore(c.id) || isDone(c.id));
  }
  return task.children;
}

function goalKids(task) {
  if (!task.children) return [];
  if (state.focus30 && parentHasCore(task)) {
    return task.children.filter((c) => isCore(c.id));
  }
  return task.children;
}

function isComplete(task) {
  if (task.children && task.children.length) {
    const kids = goalKids(task);
    return kids.every((c) => isDone(c.id)) || isDone(task.id);
  }
  return isDone(task.id);
}

function counts() {
  let total = 0, done = 0;
  DATA.subjects.forEach((s) => s.tasks.forEach((t) => {
    if (t.optional && !state.showOptional && !isDone(t.id)) return;
    total += 1;
    if (isComplete(t)) done += 1;
    countedKids(t).forEach((c) => {
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
    countedKids(t).forEach((c) => {
      total += 1;
      if (isDone(c.id)) done += 1;
    });
  });
  return { total, done, pct: total ? done / total : 0 };
}

function parentProgress(task) {
  if (!task.children) return null;
  const kids = countedKids(task);
  const d = kids.filter((c) => isDone(c.id)).length;
  return d + "/" + kids.length;
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

function fileLink(f) {
  const ext = (f.href.split(".").pop() || "").toUpperCase();
  return `<a class="file" href="${esc(f.href)}" target="_blank" rel="noopener"><span class="file-ext">${esc(ext)}</span>${esc(f.name)}</a>`;
}

function filesHtml(list) {
  if (!list || !list.length) return "";
  const prof = list.filter((f) => f.from !== "ours");
  const ours = list.filter((f) => f.from === "ours");
  const blocks = [];
  if (prof.length) {
    blocks.push(`<div class="files-block"><div class="files-kicker">Allegati del prof</div><div class="files">${prof.map(fileLink).join("")}</div></div>`);
  }
  if (ours.length) {
    blocks.push(`<div class="files-block ours"><div class="files-kicker">Da stampare (schede nostre)</div><div class="files">${ours.map(fileLink).join("")}</div></div>`);
  }
  return `<div class="files-wrap">${blocks.join("")}</div>`;
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

function quoteHtml(text, kicker) {
  if (!text) return "";
  return `<div class="quote">
    <div class="quote-kicker">${esc(kicker || "Come scritto dal prof")}</div>
    <div class="quote-body">${esc(text).replace(/\n/g, "<br>")}</div>
  </div>`;
}

function extraReq(task) {
  if (!task.req) return "";
  const first = task.req.split("\n")[0];
  if (task.title.endsWith(first) && task.req.indexOf("\n") === -1) return "";
  return quoteHtml(task.req, task.who || "Testo del compito");
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
  if (state.page === "home") return "Materie";
  if (state.page === "piano") return "Piano Sardegna";
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
    { id: "home", label: "Materie", meta: "" },
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
  const char = charCounts();
  const cards = DATA.subjects.map((s) => {
    const st = subjectStats(s);
    const all = st.total && st.done === st.total;
    return `
      <button type="button" class="subject-btn${all ? " done" : ""}" data-go="${s.id}">
        <strong>${esc(s.name)}</strong>
        <span>${st.done}/${st.total}</span>
      </button>
    `;
  }).join("");
  const charDone = char.total && char.done === char.total;
  box.innerHTML = `
    <h1 class="page-title">Che materia fai adesso?</h1>
    <p class="lead">Tocca una materia. Trovi i compiti scritti come su Classroom, non riassunti da me.</p>
    <div class="subject-list">${cards}</div>
    <button type="button" class="subject-btn${charDone ? " done" : ""}" data-go="caratteri">
      <strong>Caratteri</strong>
      <span>${char.done}/${char.total}</span>
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
    ${quoteHtml(sub.ask, "Su Classroom")}
    ${alertHtml(sub.alerts)}
    <div class="bar page-bar"><i style="width:${Math.round(st.pct * 100)}%"></i></div>
    <p class="count">${st.done} / ${st.total}</p>
    ${st.done === st.total && st.total ? `<p class="celebrate">${esc(sub.short || sub.name)} fatto.</p>` : ""}
    ${filesHtml(sub.files)}
  `;
  box.appendChild(head);
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
  const kidsList = countedKids(task);
  const kids = kidsList.length
    ? `<div class="children">${kidsList.map((c) => `
        <div class="child">
          <label class="child-row">
            <input class="check" type="checkbox" data-id="${c.id}" ${isDone(c.id) ? "checked" : ""}>
            <span>${esc(c.title)}</span>
          </label>
          ${alertHtml(c.alerts || task.alerts)}
          ${extraReq(c)}
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
        ${extraReq(task)}
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
        goalKids(t).forEach((c) => { state.checked[c.id] = inp.checked; });
      }
      DATA.subjects.forEach((s) => s.tasks.forEach((parent) => {
        if (!parent.children) return;
        if (parent.children.some((c) => c.id === inp.dataset.id)) {
          state.checked[parent.id] = goalKids(parent).every((c) => isDone(c.id) || (c.id === inp.dataset.id && inp.checked));
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

function coreOpen(ids) {
  return ids.filter((id) => !isDone(id)).length;
}

function renderPiano() {
  const box = document.getElementById("piano");
  const fiLeft = coreOpen(CORE.fi);
  const maLeft = coreOpen(CORE.ma);
  const shops = SHOPS.map((b) => `
    <a class="shop" href="${esc(b.href)}" target="_blank" rel="noopener">
      <strong>${esc(b.title)}</strong>
      <span class="shop-store">${esc(b.store)}</span>
      <span class="hint">${esc(b.note)}</span>
    </a>
  `).join("");
  box.innerHTML = `
    <h1 class="page-title">Piano Sardegna</h1>
    <p class="blurb">Dal 22 agosto al 1° settembre. Mare e nonni prima; i compiti solo nei buchi. Non entra tutto: qui c’è l’ordine, non la lista infinita.</p>
    <p class="cal-help">Ogni ebook legale è quasi sempre Kindle o EPUB, non un PDF nudo. Li leggi sul telefono. Dickens è già su Classroom: non comprarlo da altri siti.</p>

    <div class="ask-kicker" style="margin-top:18px">Adesso — scegli la circostanza</div>
    <div class="slot-grid">
      <button type="button" class="slot" data-go="zh">
        <strong>Cuffie · 20–40 min</strong>
        <span>Mare, macchina, nonni in cucina. Cinese completo: un ascolto o una lettura. Poi, se avanza, i due video di inglese.</span>
      </button>
      <button type="button" class="slot" data-go="it">
        <strong>Letto / ombrellone · 45–90 min</strong>
        <span>Ordine di lettura: Pavese → Sepúlveda → Dickens (Classroom) → Orwell → Pirandello → Balbi. Un libro alla volta.</span>
      </button>
      <button type="button" class="slot" data-go="en">
        <strong>Cuffie extra · inglese</strong>
        <span>Performer B2 Unit 6 (pag. 106, 108, 110, 114) e i due video. Dickens: riletto dal PDF Classroom, verifica a settembre.</span>
      </button>
      <button type="button" class="slot" data-go="ma">
        <strong>Tavolo · mate 45–90 min</strong>
        <span>5–6 dei 30. Serve PDF + quaderno. Non fare mate e fisica nello stesso buco.</span>
      </button>
      <button type="button" class="slot" data-go="fi">
        <strong>Tavolo · fisica 45–90 min</strong>
        <span>5–6 dei 30 neri. Se un numero è evidenziato nel PDF, sostituiscilo. Relazione Balbi: dopo aver letto, a casa.</span>
      </button>
      <button type="button" class="slot" data-go="caratteri">
        <strong>5 minuti, ogni giorno</strong>
        <span>2 righe di caratteri. Anche dopo la Sardegna, fino al 12 settembre. Non saltare: è il pezzo più facile da recuperare male.</span>
      </button>
    </div>

    <div class="sept-box" style="margin-top:18px">
      <div class="sept-kicker">Cosa entra in questi 10 giorni</div>
      <p class="cal-help" style="margin:8px 0 0">Cinese fatto per intero · caratteri ogni giorno · comprare gli ebook oggi · leggere i libri corti · lettorato inglese (pagine + video) · i 30+30 al tavolo se c’è un pomeriggio fermo.</p>
      <div class="sept-kicker" style="margin-top:14px">Cosa resta per l’1–14 settembre</div>
      <p class="cal-help" style="margin:8px 0 0">I tre temi di italiano (li scrivi tu, niente AI) · relazione sul Balbi · orale a voce · consegna Classroom del 14/09. Arte: salta in Sardegna.</p>
    </div>

    <h2 class="page-title" style="font-size:20px;margin-top:22px">Compra oggi (legale)</h2>
    <p class="cal-help">Kindle o Kobo sul telefono. Se poi vuoi una scheda studio da me, mandami un file senza DRM oppure il testo di pubblico dominio. Non usare siti pirata.</p>
    <div class="shop-list">${shops}</div>
    <p class="cal-help">Pavese anche su <a href="https://liberliber.it/autori/autori-p/cesare-pavese/la-luna-e-i-falo/" target="_blank" rel="noopener">Liber Liber</a> e <a href="https://it.wikisource.org/wiki/La_luna_e_i_fal%C3%B2" target="_blank" rel="noopener">Wikisource</a>. Pirandello su <a href="https://it.wikisource.org/wiki/Il_fu_Mattia_Pascal" target="_blank" rel="noopener">Wikisource</a>. <em>1984</em>: traduzione italiana in libreria (niente PDF pirata).</p>

    <h2 class="page-title" style="font-size:20px;margin-top:22px">I 30 di fisica · ${30 - fiLeft}/30</h2>
    <p class="cal-help">Misti per argomento. Se nel PDF un numero è evidenziato e tu non hai debito, sostituiscilo con un nero dello stesso tipo. Aperti: ${fiLeft}.</p>
    <button type="button" class="home-card" data-go="fi">
      <div class="home-card-top"><strong>Apri Fisica</strong><span class="due">filtro Solo i 30</span></div>
      <div class="home-meta">1 2 3 6 7 8 9 10 11 12 14 15 16 17 19 21 23 26 27 31 32 33 34 36 38 41 43 45 47 48</div>
    </button>

    <h2 class="page-title" style="font-size:20px;margin-top:22px">I 30 di matematica · ${30 - maLeft}/30</h2>
    <p class="cal-help">Solo colonna sinistra / per tutti. 42 e 41: figure nel PDF. Aperti: ${maLeft}.</p>
    <button type="button" class="home-card" data-go="ma">
      <div class="home-card-top"><strong>Apri Matematica</strong><span class="due">filtro Solo i 30</span></div>
      <div class="home-meta">42 · 102a · 103a · 161 162 167 168 · 267 268 270 · 101 · 281 282 284 286 288 · 373 376 · 123 131 · 176 229 292 · 308 310 315 316 · 55 · 16 41</div>
    </button>
  `;
  box.querySelectorAll("[data-go]").forEach((b) => {
    b.addEventListener("click", () => goTo(b.dataset.go));
  });
}

function render() {
  const subPage = isSubjectPage();
  document.getElementById("home-panel").classList.toggle("show", state.page === "home");
  document.getElementById("piano-panel").classList.toggle("show", state.page === "piano");
  document.getElementById("compiti-panel").classList.toggle("show", subPage);
  document.getElementById("char-panel").classList.toggle("show", state.page === "caratteri");
  document.getElementById("note-panel").classList.toggle("show", state.page === "note");
  const show30 = subPage && (state.page === "fi" || state.page === "ma");
  document.getElementById("search-wrap").classList.toggle("hidden", !show30);
  document.getElementById("progress-row").classList.toggle("hidden", true);
  document.getElementById("core30").classList.toggle("hidden", !show30);
  document.getElementById("core30").classList.toggle("on", !!state.focus30);
  renderHeaderProgress();
  renderMenu();
  if (state.page === "home") renderHome();
  if (state.page === "piano") renderPiano();
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
  document.getElementById("core30").addEventListener("click", () => {
    state.focus30 = !state.focus30;
    save();
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
  document.getElementById("sync-pin").value = getPin();
  document.getElementById("sync-api").value = getApi();
  document.getElementById("sync-save").addEventListener("click", async () => {
    const pin = document.getElementById("sync-pin").value.trim();
    const api = document.getElementById("sync-api").value.trim().replace(/\/+$/, "");
    if (!pin || !api) {
      setSyncMsg("Servono PIN e indirizzo del server.", "err");
      return;
    }
    localStorage.setItem(PIN_KEY, pin);
    localStorage.setItem(API_KEY, api);
    setSyncMsg("Controllo il server…");
    await pullState();
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
  if (state.focus30 !== false) {
    state.focus30 = true;
    document.getElementById("core30").classList.add("on");
  }
  if (state.page && state.page !== "home" && state.page !== "piano" && !isSubjectPage() && state.page !== "caratteri" && state.page !== "note") {
    state.page = "home";
  }
  render();
  pullState();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullState();
  });
  window.addEventListener("online", () => {
    pullState();
  });
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js");
  }
});
