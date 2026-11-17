
const KEY = "mach_sfrg_events";
let events = JSON.parse(localStorage.getItem(KEY) || "[]");
let currentMonth = new Date();

const $ = id => document.getElementById(id);

function save() {
  localStorage.setItem(KEY, JSON.stringify(events));
}

function dateText(date) {
  return new Date(date + "T12:00:00").toLocaleDateString();
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

function showView(name) {
  document.querySelectorAll(".view").forEach(v => {
    v.hidden = v.id !== name;
  });

  if (name === "calendar") renderCalendar();
  if (name === "events") renderEvents();
  if (name === "dashboard") renderDashboard();
}

document.querySelectorAll("[data-view]").forEach(button => {
  button.onclick = () => showView(button.dataset.view);
});

function eventHTML(e) {
  return `
    <article class="event-card">
      <h3>${escapeHTML(e.name)}</h3>
      <p>${escapeHTML(e.category)} · ${dateText(e.date)}</p>
      <p>${escapeHTML(e.time)} · ${escapeHTML(e.location)}</p>
      <p>${escapeHTML(e.description)}</p>
      <button onclick="editEvent('${e.id}')">Edit</button>
      <button onclick="deleteEvent('${e.id}')">Delete</button>
    </article>`;
}

function renderDashboard() {
  const upcoming = events
    .filter(e => e.date >= new Date().toISOString().slice(0, 10))
    .sort((a,b) => a.date.localeCompare(b.date));

  $("upcoming").innerHTML = upcoming.length
    ? upcoming.map(eventHTML).join("")
    : "<p>No upcoming events. Add your first event!</p>";
}

function renderEvents() {
  const query = $("search").value.toLowerCase();
  const category = $("filter").value;

  const filtered = events.filter(e =>
    (category === "All" || e.category === category) &&
    (e.name + e.description + e.location).toLowerCase().includes(query)
  );

  $("eventList").innerHTML = filtered.length
    ? filtered.map(eventHTML).join("")
    : "<p>No matching events.</p>";
}

function openForm(event = null) {
  $("eventForm").reset();
  $("eventId").value = event?.id || "";
  $("formTitle").textContent = event ? "Edit Event" : "Add Event";

  if (event) {
    $("name").value = event.name;
    $("category").value = event.category;
    $("date").value = event.date;
    $("time").value = event.time;
    $("location").value = event.location;
    $("description").value = event.description;
  }

  $("eventDialog").showModal();
}

$("addEvent").onclick = () => openForm();
$("cancel").onclick = () => $("eventDialog").close();

$("eventForm").onsubmit = e => {
  e.preventDefault();

  const id = $("eventId").value || crypto.randomUUID();

  const event = {
    id,
    name: $("name").value.trim(),
    category: $("category").value,
    date: $("date").value,
    time: $("time").value,
    location: $("location").value.trim(),
    description: $("description").value.trim()
  };

  const index = events.findIndex(e => e.id === id);

  if (index >= 0) events[index] = event;
  else events.push(event);

  save();
  $("eventDialog").close();
  refresh();
};

function editEvent(id) {
  const event = events.find(e => e.id === id);
  if (event) openForm(event);
}

function deleteEvent(id) {
  if (!confirm("Delete this event?")) return;

  events = events.filter(e => e.id !== id);
  save();
  refresh();
}

$("search").oninput = renderEvents;
$("filter").onchange = renderEvents;

function renderCalendar() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  $("month").textContent = currentMonth.toLocaleDateString(
    undefined, { month: "long", year: "numeric" }
  );

  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();

  const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  let html = weekdays.map(d =>
    `<div class="calendar-day"><strong>${d}</strong></div>`
  ).join("");

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="calendar-day"></div>`;
  }

  for (let day = 1; day <= days; day++) {
    const date = [
      year,
      String(month + 1).padStart(2, "0"),
      String(day).padStart(2, "0")
    ].join("-");

    const dayEvents = events.filter(e => e.date === date);

    html += `
      <div class="calendar-day">
        <strong>${day}</strong>
        ${dayEvents.map(e =>
          `<div class="calendar-event">${escapeHTML(e.name)}</div>`
        ).join("")}
      </div>`;
  }

  $("calendarGrid").innerHTML = html;
}

$("previous").onclick = () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderCalendar();
};

$("next").onclick = () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderCalendar();
};

function refresh() {
  renderDashboard();
  renderEvents();
  renderCalendar();
}

refresh();
showView("dashboard");
