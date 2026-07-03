/* Mon Agenda — vue semaine, création d'événement en 2 clics,
   stats en panneau latéral (semaine affichée, mois en cours, historique).
   Stockage : Supabase si configuré (synchro tel/ordi), sinon localStorage. */

(() => {
  "use strict";

  // ---------- Types d'événements et couleurs ----------
  const TYPES = [
    { value: "Tennis", emoji: "🎾", color: "#69db7c" },
    { value: "Prépa physique", emoji: "💪", color: "#ff6b6b" },
    { value: "Sorties Amis", emoji: "🍻", color: "#b197fc" },
    { value: "Achats", emoji: "🛒", color: "#ffd43b" },
    { value: "Autre", emoji: "📌", color: "#6c8cff" },
  ];

  // Les anciens événements n'ont pas de type : on essaie de le deviner
  // à partir du titre (ex : titre "Tennis" -> type Tennis).
  function effectiveType(ev) {
    if (ev.type) return ev.type;
    const t = TYPES.find((t) => t.value.toLowerCase() === (ev.title || "").trim().toLowerCase());
    return t ? t.value : "Autre";
  }

  function typeInfo(value) {
    return TYPES.find((t) => t.value === value) || TYPES[TYPES.length - 1];
  }

  // ---------- Couche de stockage ----------
  const cfg = window.AGENDA_CONFIG || {};
  const cloudEnabled =
    typeof cfg.SUPABASE_URL === "string" &&
    cfg.SUPABASE_URL.startsWith("https://") &&
    typeof cfg.SUPABASE_ANON_KEY === "string" &&
    cfg.SUPABASE_ANON_KEY.length > 20;

  const db = cloudEnabled
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  const LOCAL_KEY = "agenda_events";

  function localLoad() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
    } catch {
      return [];
    }
  }
  function localSave(events) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(events));
  }

  // Cache en mémoire de tous les événements (évite de re-télécharger
  // à chaque navigation) ; invalidé après chaque création/modif/suppression.
  let allCache = null;

  const store = {
    async listAll() {
      if (allCache) return allCache;
      if (db) {
        const { data, error } = await db.from("events").select("*").limit(5000);
        if (error) throw error;
        allCache = data;
      } else {
        allCache = localLoad();
      }
      return allCache;
    },

    async create(ev) {
      allCache = null;
      if (db) {
        const { error } = await db.from("events").insert(ev);
        if (error) throw error;
        return;
      }
      const events = localLoad();
      events.push({ ...ev, id: crypto.randomUUID() });
      localSave(events);
    },

    async update(id, ev) {
      allCache = null;
      if (db) {
        const { error } = await db.from("events").update(ev).eq("id", id);
        if (error) throw error;
        return;
      }
      localSave(localLoad().map((e) => (e.id === id ? { ...e, ...ev } : e)));
    },

    async remove(id) {
      allCache = null;
      if (db) {
        const { error } = await db.from("events").delete().eq("id", id);
        if (error) throw error;
        return;
      }
      localSave(localLoad().filter((e) => e.id !== id));
    },
  };

  // ---------- Utilitaires dates ----------
  const DAY_MS = 24 * 60 * 60 * 1000;

  function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function mondayOf(d) {
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const shift = (copy.getDay() + 6) % 7; // lundi = 0
    copy.setDate(copy.getDate() - shift);
    return copy;
  }

  function fmtTime(t) {
    // "18:00:00" ou "18:00" -> "18h00"
    const [h, m] = t.split(":");
    return `${parseInt(h, 10)}h${m}`;
  }

  function durationMinutes(ev) {
    const [sh, sm] = ev.start_time.split(":").map(Number);
    const [eh, em] = ev.end_time.split(":").map(Number);
    let min = eh * 60 + em - (sh * 60 + sm);
    if (min < 0) min += 24 * 60; // événement qui passe minuit (ex : 23h -> 1h)
    return min;
  }

  function fmtHours(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  }

  const dayNameFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
  const dayNumFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  const weekFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  const shortMonthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" });

  // ---------- État ----------
  let currentMonday = mondayOf(new Date());
  let statsMode = "month"; // granularité de l'historique

  // ---------- Éléments ----------
  const $ = (id) => document.getElementById(id);
  const weekEl = $("week");
  const weekLabel = $("weekLabel");
  const banner = $("banner");
  const overlay = $("modalOverlay");
  const form = $("eventForm");
  const modalTitle = $("modalTitle");
  const deleteBtn = $("deleteBtn");

  function showBanner(msg, isError = false) {
    banner.textContent = msg;
    banner.classList.toggle("error", isError);
    banner.classList.remove("hidden");
  }

  if (!cloudEnabled) {
    showBanner(
      "⚠️ Mode local : les événements ne sont enregistrés que sur cet appareil. " +
        "Configurez Supabase (voir README) pour synchroniser tel + ordi."
    );
  }

  // ---------- Rendu de la semaine ----------
  async function render() {
    const days = Array.from({ length: 7 }, (_, i) => new Date(currentMonday.getTime() + i * DAY_MS));
    const fromISO = toISO(days[0]);
    const toISOStr = toISO(days[6]);
    weekLabel.textContent = `Semaine du ${weekFmt.format(days[0])} au ${weekFmt.format(days[6])}`;

    let events = [];
    try {
      const all = await store.listAll();
      events = all
        .filter((e) => e.date >= fromISO && e.date <= toISOStr)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
    } catch (err) {
      console.error(err);
      showBanner("❌ Erreur de connexion à la base de données : " + (err.message || err), true);
    }

    const todayISO = toISO(new Date());
    weekEl.innerHTML = "";

    for (const day of days) {
      const iso = toISO(day);
      const cell = document.createElement("div");
      cell.className = "day";
      if (iso === todayISO) cell.classList.add("today");
      if (iso < todayISO) cell.classList.add("past");

      const head = document.createElement("div");
      head.className = "day-head";
      head.innerHTML = `<span class="day-name">${dayNameFmt.format(day)}</span><span class="day-num">${dayNumFmt.format(day)}</span>`;
      cell.appendChild(head);

      for (const ev of events.filter((e) => e.date === iso)) {
        const info = typeInfo(effectiveType(ev));
        const evEl = document.createElement("div");
        evEl.className = "event";
        evEl.style.borderLeftColor = info.color;
        const time = document.createElement("div");
        time.className = "time";
        time.style.color = info.color;
        time.textContent = `${info.emoji} ${fmtTime(ev.start_time)} – ${fmtTime(ev.end_time)}`;
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = ev.title;
        evEl.append(time, name);
        if (ev.description) {
          const desc = document.createElement("div");
          desc.className = "desc";
          desc.textContent = ev.description;
          evEl.appendChild(desc);
        }
        evEl.addEventListener("click", () => openModal(ev));
        cell.appendChild(evEl);
      }

      const addBtn = document.createElement("button");
      addBtn.className = "add-btn";
      addBtn.textContent = "+ Ajouter";
      addBtn.addEventListener("click", () => openModal(null, iso));
      cell.appendChild(addBtn);

      weekEl.appendChild(cell);
    }

    renderSidebar();
  }

  // ---------- Panneau latéral : statistiques ----------
  function summarize(events, fromISO, toISO) {
    const s = { tennisMin: 0, prepaCount: 0, sortiesCount: 0 };
    for (const ev of events) {
      if (ev.date < fromISO || ev.date > toISO) continue;
      const type = effectiveType(ev);
      if (type === "Tennis") s.tennisMin += durationMinutes(ev);
      else if (type === "Prépa physique") s.prepaCount += 1;
      else if (type === "Sorties Amis") s.sortiesCount += 1;
    }
    return s;
  }

  function statValuesHTML(s) {
    const t = typeInfo("Tennis");
    const p = typeInfo("Prépa physique");
    const a = typeInfo("Sorties Amis");
    return `
      <div class="stat-item" style="--c:${t.color}">
        <span class="stat-num">${fmtHours(s.tennisMin)}</span>
        <span class="stat-label">${t.emoji} Tennis</span>
      </div>
      <div class="stat-item" style="--c:${p.color}">
        <span class="stat-num">${s.prepaCount}</span>
        <span class="stat-label">${p.emoji} Prépa</span>
      </div>
      <div class="stat-item" style="--c:${a.color}">
        <span class="stat-num">${s.sortiesCount}</span>
        <span class="stat-label">${a.emoji} Sorties</span>
      </div>`;
  }

  function periodLabel(key) {
    if (statsMode === "month") {
      const [y, m] = key.split("-").map(Number);
      const label = shortMonthFmt.format(new Date(y, m - 1, 1));
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    return `Sem. ${dayNumFmt.format(parseISO(key))}`;
  }

  async function renderSidebar() {
    let all = [];
    try {
      all = await store.listAll();
    } catch {
      return; // l'erreur est déjà affichée par render()
    }

    // Carte 1 : la semaine affichée
    const weekFrom = toISO(currentMonday);
    const weekTo = toISO(new Date(currentMonday.getTime() + 6 * DAY_MS));
    const todayMonday = mondayOf(new Date());
    $("cardWeekTitle").textContent =
      currentMonday.getTime() === todayMonday.getTime()
        ? "📆 Cette semaine"
        : `📆 Semaine du ${dayNumFmt.format(currentMonday)}`;
    $("cardWeek").innerHTML = statValuesHTML(summarize(all, weekFrom, weekTo));

    // Carte 2 : le mois en cours
    const now = new Date();
    const monthFrom = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthTo = toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const monthLabel = monthFmt.format(now);
    $("cardMonthTitle").textContent = `🗓️ ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`;
    $("cardMonth").innerHTML = statValuesHTML(summarize(all, monthFrom, monthTo));

    // Carte 3 : historique par mois ou par semaine
    const groups = new Map();
    for (const ev of all) {
      const key = statsMode === "month" ? ev.date.slice(0, 7) : toISO(mondayOf(parseISO(ev.date)));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ev);
    }
    const keys = [...groups.keys()].sort().reverse();

    const t = typeInfo("Tennis");
    const p = typeInfo("Prépa physique");
    const a = typeInfo("Sorties Amis");

    let html = `
      <div class="hist-row hist-head">
        <span class="hist-period"></span>
        <span style="color:${t.color}">${t.emoji}</span>
        <span style="color:${p.color}">${p.emoji}</span>
        <span style="color:${a.color}">${a.emoji}</span>
      </div>`;

    for (const key of keys) {
      const evs = groups.get(key);
      const s = summarize(evs, "0000-00-00", "9999-99-99");
      html += `
      <div class="hist-row">
        <span class="hist-period">${periodLabel(key)}</span>
        <span>${s.tennisMin ? fmtHours(s.tennisMin) : "–"}</span>
        <span>${s.prepaCount || "–"}</span>
        <span>${s.sortiesCount || "–"}</span>
      </div>`;
    }

    if (keys.length === 0) {
      html = `<p class="hist-empty">Aucun événement pour le moment.</p>`;
    }
    $("historyBody").innerHTML = html;
  }

  $("statsByMonth").addEventListener("click", () => {
    statsMode = "month";
    $("statsByMonth").classList.add("active");
    $("statsByWeek").classList.remove("active");
    renderSidebar();
  });
  $("statsByWeek").addEventListener("click", () => {
    statsMode = "week";
    $("statsByWeek").classList.add("active");
    $("statsByMonth").classList.remove("active");
    renderSidebar();
  });

  // ---------- Modale ----------
  async function openModal(event, dateISO) {
    form.reset();
    if (event) {
      modalTitle.textContent = "Modifier l'événement";
      deleteBtn.classList.remove("hidden");
      $("eventId").value = event.id;
      $("type").value = effectiveType(event);
      $("title").value = event.title;
      $("date").value = event.date;
      $("startTime").value = event.start_time.slice(0, 5);
      $("endTime").value = event.end_time.slice(0, 5);
      $("description").value = event.description || "";
    } else {
      modalTitle.textContent = "Nouvel événement";
      deleteBtn.classList.add("hidden");
      $("eventId").value = "";
      $("type").value = "Tennis";
      $("title").value = "Tennis";
      $("date").value = dateISO;
      $("startTime").value = "18:00";
      $("endTime").value = "19:00";
    }

    // Suggestions de titres déjà utilisés (Tennis, Poker, …)
    store.listAll().then((all) => {
      const titles = [...new Set(all.map((e) => e.title))];
      $("titleSuggestions").innerHTML = titles
        .map((t) => `<option value="${t.replace(/"/g, "&quot;")}"></option>`)
        .join("");
    }).catch(() => {});

    overlay.classList.remove("hidden");
    $("title").focus();
    $("title").select();
  }

  function closeModal() {
    overlay.classList.add("hidden");
  }

  // Quand on change de type, pré-remplit le titre si l'utilisateur
  // n'a pas mis un titre personnalisé.
  $("type").addEventListener("change", () => {
    const current = $("title").value.trim();
    const isDefaultTitle = current === "" || TYPES.some((t) => t.value === current);
    if (isDefaultTitle) {
      $("title").value = $("type").value === "Autre" ? "" : $("type").value;
    }
  });

  // Fin = début + 1h par défaut quand on change l'heure de début
  $("startTime").addEventListener("change", () => {
    const start = $("startTime").value;
    if (!start) return;
    const [h, m] = start.split(":").map(Number);
    $("endTime").value = `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      type: $("type").value,
      title: $("title").value.trim(),
      date: $("date").value,
      start_time: $("startTime").value,
      end_time: $("endTime").value,
      description: $("description").value.trim() || null,
    };
    const id = $("eventId").value;
    try {
      if (id) await store.update(id, payload);
      else await store.create(payload);
      closeModal();
      // Afficher la semaine de l'événement créé/modifié
      currentMonday = mondayOf(parseISO(payload.date));
      await render();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'enregistrement : " + (err.message || err));
    }
  });

  deleteBtn.addEventListener("click", async () => {
    const id = $("eventId").value;
    if (!id || !confirm("Supprimer cet événement ?")) return;
    try {
      await store.remove(id);
      closeModal();
      await render();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la suppression : " + (err.message || err));
    }
  });

  $("cancelBtn").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) closeModal();
  });

  // ---------- Navigation ----------
  $("prevWeek").addEventListener("click", () => {
    currentMonday = new Date(currentMonday.getTime() - 7 * DAY_MS);
    render();
  });
  $("nextWeek").addEventListener("click", () => {
    currentMonday = new Date(currentMonday.getTime() + 7 * DAY_MS);
    render();
  });
  $("todayBtn").addEventListener("click", () => {
    currentMonday = mondayOf(new Date());
    render();
  });

  render();
})();
