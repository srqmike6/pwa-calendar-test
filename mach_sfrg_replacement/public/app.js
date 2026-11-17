const STORAGE_KEY = "mach_sfrg_events";
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

const $ = (id) => document.getElementById(id);
function loadEvents() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function saveEvents(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
function parseDate(value) { return new Date(`${value}T12:00:00`); }
function formatDate(value) {
  return value ? parseDate(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Date to be announced";
}
function showView(view) {
  document.querySelectorAll(".view").forEach((section) => { section.hidden = section.id !== view; });
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (view === "calendar") renderCalendar();
  if (view === "events") renderEvents();
}
function openEventDialog(id = "") {
  $("eventForm").reset();
  $("eventId").value = "";
  $("dialogTitle").textContent = "Add an Event";
  if (id) {
    const item = loadEvents().find((event) => event.id === id);
    if (!item) return;
    $("dialogTitle").textContent = "Edit Event";
    $("eventId").value = item.id;
    $("eventName").value = item.name || "";
    $("eventDate").value = item.date || "";
    $("eventTime").value = item.time || "";
    $("eventCategory").value = item.category || "Community";
    $("eventLocation").value = item.location || "";
    $("eventDescription").value = item.description || "";
  }
  $("eventDialog").showModal();
}
function closeEventDialog() { $("eventDialog").close(); }
function deleteEvent(id) {
  if (!window.confirm("Delete this event?")) return;
  saveEvents(loadEvents().filter((event) => event.id !== id));
  refresh();
}
function eventCard(item) {
  return `<article class="event-card"><div class="event-card-top"></div><div class="event-card-body">
    <span class="event-date">${escapeHTML(item.category || "Event")} · ${escapeHTML(formatDate(item.date))}</span>
    <h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.description || "Join us for this community event.")}</p>
    <div class="event-meta"><span>◷ ${escapeHTML(item.time || "Time to be announced")}</span><span>⌖ ${escapeHTML(item.location || "Location to be announced")}</span></div>
    </div><div class="event-card-actions"><button class="small-button" data-action="edit" data-id="${escapeHTML(item.id)}">Edit</button><button class="small-button delete" data-action="delete" data-id="${escapeHTML(item.id)}">Delete</button></div></article>`;
}
function renderDashboard() {
  const events = loadEvents();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = events.filter((item) => item.date && parseDate(item.date) >= today).sort((a, b) => a.date.localeCompare(b.date));
  $("totalCount").textContent = events.length;
  $("upcomingCount").textContent = upcoming.length;
  $("categoryCount").textContent = new Set(events.map((item) => item.category).filter(Boolean)).size;
  $("featuredEmpty").hidden = upcoming.length > 0;
  $("dashboardEvents").innerHTML = upcoming.slice(0, 3).map(eventCard).join("");
}
function renderEvents() {
  const query = ($("searchInput")?.value || "").toLowerCase();
  const category = $("categoryFilter")?.value || "";
  const events = loadEvents().filter((item) => {
    const text = [item.name, item.description, item.location].join(" ").toLowerCase();
    return text.includes(query) && (!category || item.category === category);
  }).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  $("allEvents").innerHTML = events.length ? events.map(eventCard).join("") : `<div class="empty-state">No events match your search. Try another filter or add an event.</div>`;
}
function changeMonth(amount) {
  currentMonth += amount;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  renderCalendar();
}
function renderCalendar() {
  const grid = $("calendarGrid");
  if (!grid) return;
  $("monthLabel").textContent = new Date(currentYear, currentMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = names.map((name) => `<div class="calendar-day-name">${name}</div>`).join("");
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const previousMonthDays = new Date(currentYear, currentMonth, 0).getDate();
  const events = loadEvents();
  const today = new Date();
  for (let cell = 0; cell < 42; cell++) {
    let day, date, muted = false;
    if (cell < firstDay) { day = previousMonthDays - firstDay + cell + 1; date = new Date(currentYear, currentMonth - 1, day); muted = true; }
    else if (cell >= firstDay + daysInMonth) { day = cell - firstDay - daysInMonth + 1; date = new Date(currentYear, currentMonth + 1, day); muted = true; }
    else { day = cell - firstDay + 1; date = new Date(currentYear, currentMonth, day); }
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const isToday = date.toDateString() === today.toDateString();
    const matches = events.filter((item) => item.date === key);
    html += `<div class="calendar-day ${muted ? "muted-day" : ""} ${isToday ? "today" : ""}"><strong>${day}</strong>${matches.map((item) => `<span class="calendar-event" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</span>`).join("")}</div>`;
  }
  grid.innerHTML = html;
}
function refresh() { renderDashboard(); renderEvents(); renderCalendar(); }

// Navigation and event actions are delegated so text entered by users is never run as script.
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll("[data-view-link]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); showView(link.dataset.viewLink); }));
["addEventTop", "addFirstEvent", "addEventPage", "addEventCalendar"].forEach((id) => $(id).addEventListener("click", () => openEventDialog()));
$("closeDialog").addEventListener("click", closeEventDialog);
$("cancelDialog").addEventListener("click", closeEventDialog);
$("previousMonth").addEventListener("click", () => changeMonth(-1));
$("nextMonth").addEventListener("click", () => changeMonth(1));
$("searchInput").addEventListener("input", renderEvents);
$("categoryFilter").addEventListener("change", renderEvents);
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "edit") openEventDialog(id);
  if (button.dataset.action === "delete") deleteEvent(id);
});
$("eventForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("eventId").value || (window.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const item = {
    id,
    name: $("eventName").value.trim(),
    date: $("eventDate").value,
    time: $("eventTime").value,
    category: $("eventCategory").value,
    location: $("eventLocation").value.trim(),
    description: $("eventDescription").value.trim()
  };
  const events = loadEvents();
  const index = events.findIndex((existing) => existing.id === id);
  if (index >= 0) events[index] = item; else events.push(item);
  events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  saveEvents(events);
  closeEventDialog();
  refresh();
});
refresh();
