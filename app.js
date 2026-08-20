const STORE = "compiti-4all-2026-v1";
const CHAR_END = "2026-09-12";

const state = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || empty();
  } catch {
    return empty();
  }
}
function empty() {
  return { checked: {}, notes: {}, journal: "", firma: "", chars: {}, showOptional: false };
}
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

function setDone(id, val) {
  state.checked[id] = val;
  save();
  render();
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

let view = "compiti";
let filter = "all";
let query = "";
let openSubject = "it";
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
  const parts = [task.title, task.hint, task.req, task.who];
  (task.children || []).forEach((c) => parts.push(c.title, c.req));
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function subjectBlob(sub) {
  return [sub.name, sub.teacher, sub.ask, sub.blurb, sub.points].filter(Boolean).join(" ").toLowerCase();
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

function renderProgress() {
  const { total, done } = counts();
  const pct = total ? done / total : 0;
  const r = 18, circ = 2 * Math.PI * r;
  document.getElementById("ring-fg").style.strokeDasharray = String(circ);
  document.getElementById("ring-fg").style.strokeDashoffset = String(circ * (1 - pct));
  document.getElementById("prog-num").textContent = done + " / " + total;
  document.getElementById("prog-pct").textContent = Math.round(pct * 100) + "%";
}

function renderCompiti() {
  const box = document.getElementById("compiti");
  box.innerHTML = "";
  DATA.subjects.forEach((sub) => {
    const tasks = sub.tasks.filter((t) => taskVisible(t, sub));
    if (!tasks.length && query) return;
    const el = document.createElement("section");
    el.className = "subject";
    const leaf = sub.tasks.filter((t) => !t.optional || state.showOptional || isDone(t.id));
    const doneN = leaf.filter((t) => isComplete(t)).length;
    el.innerHTML = `
      <button class="subject-h" data-open="${sub.id}">
        <span class="dot"></span>
        <div>
          <h2>${esc(sub.name)}</h2>
          ${sub.teacher ? `<p class="teacher">${esc(sub.teacher)}</p>` : ""}
          <p class="blurb">${esc(sub.blurb)}</p>
          <div class="count">${doneN}/${leaf.length} punti${sub.points ? " · " + esc(sub.points) : ""}</div>
        </div>
        <span class="due">${esc(sub.due)}</span>
      </button>
      <div class="body ${openSubject === sub.id ? "" : "hidden"}"></div>
    `;
    const body = el.querySelector(".body");
    if (sub.ask) {
      const ask = document.createElement("div");
      ask.className = "ask";
      ask.innerHTML = `<div class="ask-kicker">Richiesta complessiva</div>${esc(sub.ask).replace(/\n/g, "<br>")}`;
      body.appendChild(ask);
    }
    tasks.forEach((task) => body.appendChild(renderTask(task, sub)));
    el.querySelector("[data-open]").addEventListener("click", () => {
      openSubject = openSubject === sub.id ? "" : sub.id;
      render();
    });
    box.appendChild(el);
  });
  if (!box.children.length) {
    box.innerHTML = '<p class="empty">Niente con questo filtro.</p>';
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
          ${reqHtml(c.id, c.req, c.who || task.who || sub.who)}
        </div>`).join("")}</div>`
    : "";
  const prog = parentProgress(task);
  wrap.innerHTML = `
    <div class="task-row">
      <input class="check" type="checkbox" data-id="${task.id}" ${isComplete(task) ? "checked" : ""}>
      <div>
        <div class="title">${esc(task.title)}${task.optional ? '<span class="badge">facoltativo</span>' : ""}${prog ? " · " + prog : ""}</div>
        ${task.hint ? `<div class="hint">${esc(task.hint)}</div>` : ""}
        ${reqHtml(task.id, task.req, task.who || sub.who)}
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
      save();
      render();
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
  const start = state.firma ? nextDay(state.firma) : "2026-08-20";
  const days = daysBetween(start, CHAR_END);
  const done = days.filter((d) => state.chars[d]).length;
  document.getElementById("firma").value = state.firma || "";
  document.getElementById("char-stats").textContent =
    done + " / " + days.length + " giorni · " + (days.length - done) + " ancora da fare · " + ((days.length - done) * 2) + " righe rimaste";
  const cal = document.getElementById("cal");
  cal.innerHTML = days.map((d) => {
    const on = state.chars[d] ? " on" : "";
    const [, m, day] = d.split("-");
    return `<button class="day${on}" data-day="${d}"><span class="w">${weekday(d)}</span><span class="n">${Number(day)}/${Number(m)}</span></button>`;
  }).join("");
  cal.querySelectorAll(".day").forEach((b) => {
    b.addEventListener("click", () => {
      state.chars[b.dataset.day] = !state.chars[b.dataset.day];
      save();
      renderChars();
      renderProgress();
    });
  });
}

function nextDay(iso) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function renderJournal() {
  document.getElementById("journal").value = state.journal || "";
}

function render() {
  document.getElementById("compiti-panel").classList.toggle("show", view === "compiti");
  document.getElementById("char-panel").classList.toggle("show", view === "caratteri");
  document.getElementById("note-panel").classList.toggle("show", view === "note");
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  document.getElementById("search-wrap").classList.toggle("hidden", view !== "compiti");
  renderProgress();
  if (view === "compiti") renderCompiti();
  if (view === "caratteri") renderChars();
  if (view === "note") renderJournal();
}

function backup() {
  return JSON.stringify(state, null, 2);
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.addEventListener("click", () => { view = b.dataset.view; render(); });
  });
  document.getElementById("q").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); render(); });
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
        Object.assign(state, JSON.parse(r.result));
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
  render();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js");
  }
});
