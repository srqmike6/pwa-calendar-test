const STORAGE_KEY = "mach_sfrg_events"; // Keep this key so previously saved events remain available.
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let searchQuery = "";
let currentPhotoData = "";
let selectedPhotoFile = null;
let toastTimer = null;

const $ = (id) => document.getElementById(id);

function loadEvents() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error("Could not read saved events:", error);
    return [];
  }
}

function saveEvents(events) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    return true;
  } catch (error) {
    console.error("Could not save events:", error);
    return false;
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function safeHttpUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function parseDate(value) { return value ? new Date(`${value}T12:00:00`) : null; }
function formatDate(value) {
  const date = parseDate(value);
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Date to be announced";
}
function dateIsUpcoming(value) {
  const date = parseDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}
function matchesSearch(item) {
  if (!searchQuery) return true;
  const haystack = [item.name, item.description, item.location, item.category, item.date, item.signup].join(" ").toLowerCase();
  return haystack.includes(searchQuery);
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function showView(view) {
  document.querySelectorAll(".view").forEach((section) => { section.hidden = section.id !== view; });
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (view === "events") renderEvents();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setPhotoPreview(data) {
  const wrap = $("photoPreviewWrap");
  if (data) {
    $("photoPreview").src = data;
    wrap.hidden = false;
  } else {
    $("photoPreview").removeAttribute("src");
    wrap.hidden = true;
  }
}

function openEventDialog(id = "") {
  $("eventForm").reset();
  $("eventId").value = "";
  $("dialogTitle").textContent = "Add an Event";
  $("formError").hidden = true;
  currentPhotoData = "";
  selectedPhotoFile = null;
  setPhotoPreview("");

  if (id) {
    const item = loadEvents().find((event) => event.id === id);
    if (!item) return;
    $("dialogTitle").textContent = "Edit Event";
    $("eventId").value = item.id;
    $("eventName").value = item.name || "";
    $("eventDate").value = item.date || "";
    $("eventTime").value = item.time || "";
    $("eventEndTime").value = item.endTime || "";
    $("eventCategory").value = item.category || "Community";
    $("eventLocation").value = item.location || "";
    $("eventSignup").value = item.signup || "";
    $("eventDescription").value = item.description || "";
    currentPhotoData = item.photoData || "";
    setPhotoPreview(currentPhotoData);
  }
  $("eventDialog").showModal();
}

function closeEventDialog() {
  if ($("eventDialog").open) $("eventDialog").close();
}

function deleteEvent(id) {
  if (!window.confirm("Delete this event?")) return;
  if (!saveEvents(loadEvents().filter((event) => event.id !== id))) {
    showToast("Could not delete the event. Your browser storage may be full.");
    return;
  }
  refresh();
  showToast("Event deleted.");
}

function eventText(item) {
  const lines = [
    item.name,
    `${formatDate(item.date)}${item.time ? ` at ${item.time}` : ""}${item.endTime ? `–${item.endTime}` : ""}`,
    item.location ? `Location: ${item.location}` : "",
    item.description || "",
    item.signup ? `Sign up: ${safeHttpUrl(item.signup)}` : ""
  ].filter(Boolean);
  return lines.join("\n\n");
}

function googleCalendarUrl(item) {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", item.name || "MACH SFRG Event");
  url.searchParams.set("details", `${item.description || ""}${item.signup ? `\n\nSign up: ${safeHttpUrl(item.signup)}` : ""}`);
  if (item.location) url.searchParams.set("location", item.location);
  if (item.date) {
    if (item.time) {
      const range = eventDateTimeRange(item);
      url.searchParams.set("dates", `${range.start}/${range.end}`);
    } else {
      const start = item.date.replaceAll("-", "");
      const end = addDays(item.date, 1).replaceAll("-", "");
      url.searchParams.set("dates", `${start}/${end}`);
    }
  }
  return url.href;
}

function formatCalendarStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}
function eventDateTimeRange(item) {
  const [year, month, day] = item.date.split("-").map(Number);
  const [startHour, startMinute] = item.time.split(":").map(Number);
  const startDate = new Date(year, month - 1, day, startHour, startMinute || 0, 0);
  let endDate;
  if (item.endTime) {
    const [endHour, endMinute] = item.endTime.split(":").map(Number);
    endDate = new Date(year, month - 1, day, endHour, endMinute || 0, 0);
  } else {
    endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  }
  return { start: formatCalendarStamp(startDate), end: formatCalendarStamp(endDate) };
}
function addDays(value, amount) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function icsEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function downloadAppleCalendar(item) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MACH SFRG//Events//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${icsEscape(item.id)}@mach-sfrg-events`, `DTSTAMP:${stamp}`
  ];
  if (item.date && item.time) {
    const range = eventDateTimeRange(item);
    lines.push(`DTSTART:${range.start}`, `DTEND:${range.end}`);
  } else if (item.date) {
    lines.push(`DTSTART;VALUE=DATE:${item.date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${addDays(item.date, 1).replaceAll("-", "")}`);
  }
  lines.push(`SUMMARY:${icsEscape(item.name)}`);
  if (item.description) lines.push(`DESCRIPTION:${icsEscape(item.description)}`);
  if (item.location) lines.push(`LOCATION:${icsEscape(item.location)}`);
  if (item.signup) lines.push(`URL:${safeHttpUrl(item.signup)}`);
  lines.push("END:VEVENT", "END:VCALENDAR", "");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(item.name || "mach-sfrg-event").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "")}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function eventCard(item) {
  const photo = item.photoData
    ? `<img class="event-photo" src="${item.photoData}" alt="Photo for ${escapeHTML(item.name)}">`
    : `<div class="event-photo-placeholder"><span>✦</span><small>MACH SFRG COMMUNITY EVENT</small></div>`;
  const signup = safeHttpUrl(item.signup);
  return `<article class="event-card" id="event-${escapeHTML(item.id)}">
    ${photo}
    <div class="event-card-body">
      <span class="event-date">${escapeHTML(item.category || "Event")} <span>·</span> ${escapeHTML(formatDate(item.date))}</span>
      <h3>${escapeHTML(item.name)}</h3>
      <p class="event-description">${escapeHTML(item.description || "Join us for this community event.")}</p>
      <div class="event-meta"><span>◷ ${escapeHTML(item.time || "Time to be announced")}${item.endTime ? ` – ${escapeHTML(item.endTime)}` : ""}</span><span>⌖ ${escapeHTML(item.location || "Location to be announced")}</span></div>
      ${signup ? `<a class="signup-button" href="${escapeHTML(signup)}" target="_blank" rel="noopener noreferrer">Sign Up / Register ↗</a>` : ""}
      <div class="event-tools">
        <a class="tool-link" href="sms:?&body=${encodeURIComponent(eventText(item))}">Text</a>
        <a class="tool-link" href="mailto:?subject=${encodeURIComponent(`MACH SFRG Event: ${item.name}`)}&body=${encodeURIComponent(eventText(item))}">Email</a>
        <a class="tool-link" href="${escapeHTML(googleCalendarUrl(item))}" target="_blank" rel="noopener noreferrer">Google Calendar</a>
        <button class="tool-link" type="button" data-action="apple-calendar" data-id="${escapeHTML(item.id)}">Apple Calendar</button>
      </div>
    </div>
    <div class="event-card-actions"><button class="small-button" data-action="edit" data-id="${escapeHTML(item.id)}">Edit</button><button class="small-button delete" data-action="delete" data-id="${escapeHTML(item.id)}">Delete</button></div>
  </article>`;
}

function renderDashboard() {
  const upcoming = loadEvents()
    .filter((item) => dateIsUpcoming(item.date) && matchesSearch(item))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const empty = $("featuredEmpty");
  const container = $("dashboardEvents");
  if (upcoming.length) {
    empty.hidden = true;
    container.innerHTML = upcoming.slice(0, 6).map(eventCard).join("");
  } else {
    container.innerHTML = "";
    empty.hidden = false;
    const hasUpcoming = loadEvents().some((item) => dateIsUpcoming(item.date));
    empty.querySelector("h3").textContent = searchQuery ? "No events found" : (hasUpcoming ? "No events match your search" : "Your next great memory starts here");
    empty.querySelector("p").textContent = searchQuery ? "Try another keyword, or browse All Events." : (hasUpcoming ? "Try a different search term." : "No upcoming events yet. Add an event to get the calendar started.");
    $("addFirstEvent").hidden = Boolean(searchQuery || hasUpcoming);
  }
}

function renderEvents() {
  const category = $("categoryFilter").value;
  const events = loadEvents().filter((item) => matchesSearch(item) && (!category || item.category === category))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  $("allEvents").innerHTML = events.length
    ? events.map(eventCard).join("")
    : `<div class="empty-state">No events match your search. Try another filter or add an event.</div>`;
}

function changeMonth(amount) {
  currentMonth += amount;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  renderCalendar();
}
function jumpToToday() {
  const today = new Date();
  currentMonth = today.getMonth();
  currentYear = today.getFullYear();
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
  const events = loadEvents().filter(matchesSearch);
  const today = new Date();
  for (let cell = 0; cell < 42; cell++) {
    let day, date, muted = false;
    if (cell < firstDay) { day = previousMonthDays - firstDay + cell + 1; date = new Date(currentYear, currentMonth - 1, day); muted = true; }
    else if (cell >= firstDay + daysInMonth) { day = cell - firstDay - daysInMonth + 1; date = new Date(currentYear, currentMonth + 1, day); muted = true; }
    else { day = cell - firstDay + 1; date = new Date(currentYear, currentMonth, day); }
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const isToday = date.toDateString() === today.toDateString();
    const matches = events.filter((item) => item.date === key);
    html += `<div class="calendar-day ${muted ? "muted-day" : ""} ${isToday ? "today" : ""}"><strong>${day}</strong>${matches.slice(0, 2).map((item) => `<button type="button" class="calendar-event" data-action="view-event" data-id="${escapeHTML(item.id)}" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</button>`).join("")}${matches.length > 2 ? `<small class="calendar-more">+${matches.length - 2} more</small>` : ""}</div>`;
  }
  grid.innerHTML = html;
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("Please choose a JPG, PNG, or WebP image."));
    if (file.size > 10 * 1024 * 1024) return reject(new Error("Please choose a photo smaller than 10 MB."));
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const maxWidth = 1400;
      const maxHeight = 1000;
      const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("The photo could not be processed. Try another image."));
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("The photo could not be read. Try another image."));
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.78);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("The photo could not be opened. Try a JPG, PNG, or WebP image.")); };
    image.src = objectUrl;
  });
}

function refresh() {
  renderDashboard();
  renderEvents();
  renderCalendar();
}

// Navigation and event actions use delegated handlers.
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll("[data-view-link]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); showView(link.dataset.viewLink); }));
["addEventTop", "addFirstEvent", "addEventPage"].forEach((id) => $(id).addEventListener("click", () => openEventDialog()));
$("closeDialog").addEventListener("click", closeEventDialog);
$("cancelDialog").addEventListener("click", closeEventDialog);
$("previousMonth").addEventListener("click", () => changeMonth(-1));
$("nextMonth").addEventListener("click", () => changeMonth(1));
$("todayButton").addEventListener("click", jumpToToday);

function syncSearch(value) {
  searchQuery = value.trim().toLowerCase();
  $("dashboardSearch").value = value;
  $("searchInput").value = value;
  renderDashboard();
  renderEvents();
  renderCalendar();
}
$("dashboardSearch").addEventListener("input", (event) => syncSearch(event.target.value));
$("searchInput").addEventListener("input", (event) => syncSearch(event.target.value));
$("categoryFilter").addEventListener("change", renderEvents);

$("eventPhoto").addEventListener("change", (event) => {
  selectedPhotoFile = event.target.files?.[0] || null;
  if (selectedPhotoFile) {
    const objectUrl = URL.createObjectURL(selectedPhotoFile);
    $("photoPreview").src = objectUrl;
    $("photoPreview").onload = () => URL.revokeObjectURL(objectUrl);
    $("photoPreviewWrap").hidden = false;
  }
});
$("removePhoto").addEventListener("click", () => {
  currentPhotoData = "";
  selectedPhotoFile = null;
  $("eventPhoto").value = "";
  setPhotoPreview("");
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  const item = loadEvents().find((entry) => entry.id === id);
  if (button.dataset.action === "edit") openEventDialog(id);
  if (button.dataset.action === "delete") deleteEvent(id);
  if (button.dataset.action === "apple-calendar" && item) downloadAppleCalendar(item);
  if (button.dataset.action === "view-event" && item) {
    showView("events");
    window.setTimeout(() => {
      const card = document.getElementById(`event-${CSS.escape(id)}`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      card?.classList.add("event-highlight");
      window.setTimeout(() => card?.classList.remove("event-highlight"), 1600);
    }, 80);
  }
});

$("eventForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveButton = $("saveEventButton");
  const errorBox = $("formError");
  errorBox.hidden = true;
  saveButton.disabled = true;
  saveButton.textContent = "Saving...";
  try {
    let photoData = currentPhotoData;
    if (selectedPhotoFile) photoData = await compressPhoto(selectedPhotoFile);
    const signupValue = $("eventSignup").value.trim();
    if (signupValue && !safeHttpUrl(signupValue)) throw new Error("Enter a complete sign-up link beginning with https:// or http://.");
    const startTime = $("eventTime").value;
    const endTime = $("eventEndTime").value;
    if (startTime && endTime && endTime <= startTime) throw new Error("The end time must be later than the start time.");
    const id = $("eventId").value || (window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const item = {
      id,
      name: $("eventName").value.trim(),
      date: $("eventDate").value,
      time: startTime,
      endTime,
      category: $("eventCategory").value,
      location: $("eventLocation").value.trim(),
      signup: signupValue,
      description: $("eventDescription").value.trim(),
      photoData
    };
    const events = loadEvents();
    const index = events.findIndex((existing) => existing.id === id);
    if (index >= 0) events[index] = item; else events.push(item);
    events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (!saveEvents(events)) throw new Error("Your browser could not save this event. Try a smaller photo or remove older event photos to free browser storage.");
    closeEventDialog();
    refresh();
    showToast("Event saved successfully.");
  } catch (error) {
    errorBox.textContent = error.message || "The event could not be saved.";
    errorBox.hidden = false;
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save Event";
  }
});

refresh();
