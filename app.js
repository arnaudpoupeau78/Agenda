/* Mon Agenda — vue semaine, création d'événement en 2 clics.
   Stockage : Supabase si configuré (synchro tel/ordi), sinon localStorage. */

(() => {
  "use strict";

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

  const store = {
    async list(fromISO, toISO) {
      if (db) {
        const { data, error } = await db
          .from("events")
          .select("*")
          .gte("date", fromISO)
          .lte("date", toISO)
          .order("start_time");
        if (error) throw error;
        return data;
      }
      return localLoad()
        .filter((e) => e.date >= fromISO && e.date <= toISO)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
    },

    async create(ev) {
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
      if (db) {
        const { error } = await db.from("events").update(ev).eq("id", id);
        if (error) throw error;
        return;
      }
      localSave(localLoad().map((e) => (e.id === id ? { ...e, ...ev } : e)));
    },

    async remove(id) {
      if (db) {
        const { error } = await db.from("events").delete().eq("id", id);
        if (error) throw error;
        return;
      }
      localSave(localLoad().filter((e) => e.id !== id));
    },

    async knownTitles() {
      if (db) {
        const { data, error } = await db.from("events").select("title").limit(200);
        if (error) return [];
        return [...new Set(data.map((e) => e.title))];
      }
      return [...new Set(localLoad().map((e) => e.title))];
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

  const dayNameFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
  const dayNumFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  const weekFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  // ---------- État ----------
  let currentMonday = mondayOf(new Date());

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

  // ---------- Rendu ----------
  async function render() {
    const days = Array.from({ length: 7 }, (_, i) => new Date(currentMonday.getTime() + i * DAY_MS));
    const fromISO = toISO(days[0]);
    const toISOStr = toISO(days[6]);
    weekLabel.textContent = `Semaine du ${weekFmt.format(days[0])} au ${weekFmt.format(days[6])}`;

    let events = [];
    try {
      events = await store.list(fromISO, toISOStr);
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
        const evEl = document.createElement("div");
        evEl.className = "event";
        const time = document.createElement("div");
        time.className = "time";
        time.textContent = `${fmtTime(ev.start_time)} – ${fmtTime(ev.end_time)}`;
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
  }

  // ---------- Modale ----------
  async function openModal(event, dateISO) {
    form.reset();
    if (event) {
      modalTitle.textContent = "Modifier l'événement";
      deleteBtn.classList.remove("hidden");
      $("eventId").value = event.id;
      $("title").value = event.title;
      $("date").value = event.date;
      $("startTime").value = event.start_time.slice(0, 5);
      $("endTime").value = event.end_time.slice(0, 5);
      $("description").value = event.description || "";
    } else {
      modalTitle.textContent = "Nouvel événement";
      deleteBtn.classList.add("hidden");
      $("eventId").value = "";
      $("date").value = dateISO;
      $("startTime").value = "18:00";
      $("endTime").value = "19:00";
    }

    // Suggestions de titres déjà utilisés (Tennis, Poker, …)
    store.knownTitles().then((titles) => {
      $("titleSuggestions").innerHTML = titles
        .map((t) => `<option value="${t.replace(/"/g, "&quot;")}"></option>`)
        .join("");
    });

    overlay.classList.remove("hidden");
    $("title").focus();
  }

  function closeModal() {
    overlay.classList.add("hidden");
  }

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
      const [y, mo, d] = payload.date.split("-").map(Number);
      currentMonday = mondayOf(new Date(y, mo - 1, d));
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
