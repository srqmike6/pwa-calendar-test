const CONFIG = window.MACH_SUPABASE_CONFIG;
const db = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey);
const $ = (id) => document.getElementById(id);
let events = [];
let profile = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let searchQuery = "";
let currentPhotoPath = "";
let currentPhotoUrl = "";
let selectedPhotoFile = null;
let signupMode = false;
let toastTimer = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function safeHttpUrl(value) {
  if (!value) return "";
  try { const u = new URL(value); return ["http:","https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; }
}
function parseDate(value) { return value ? new Date(value + "T12:00:00") : null; }
function formatDate(value) {
  const d = parseDate(value);
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "Date to be announced";
}
function dateIsUpcoming(value) {
  const d = parseDate(value); if (!d) return false;
  const today = new Date(); today.setHours(0,0,0,0); return d >= today;
}
function matchesSearch(item) {
  if (!searchQuery) return true;
  return [item.name,item.description,item.location,item.category,item.date,item.signup].join(" ").toLowerCase().includes(searchQuery);
}
function showToast(message) {
  const toast=$("toast"); toast.textContent=message; toast.classList.add("visible");
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove("visible"),3200);
}
function showAuth(message, showAccess=false) {
  $("authScreen").hidden=false; $("appShell").hidden=true;
  $("authMessage").textContent=message || "Sign in or create an account to continue.";
  $("accessArea").hidden=!showAccess; $("signOutButton").hidden=false;
}
function authError(message) {
  $("authError").textContent=message; $("authError").hidden=false;
}
function setPhotoPreview(src) {
  if(src){$("photoPreview").src=src;$("photoPreviewWrap").hidden=false;}
  else{$("photoPreview").removeAttribute("src");$("photoPreviewWrap").hidden=true;}
}
function mapEvent(row, photoUrl="") {
  return {id:row.id,name:row.name,date:row.event_date,time:row.start_time||"",endTime:row.end_time||"",category:row.category||"Community",location:row.location||"",signup:row.signup_url||"",description:row.description||"",photoPath:row.photo_path||"",photoUrl};
}
async function loadEvents() {
  const {data,error}=await db.from("events").select("*").order("event_date",{ascending:true});
  if(error) throw error;
  events=await Promise.all((data||[]).map(async row=>{
    let photoUrl="";
    if(row.photo_path){
      const {data:photo}=await db.storage.from("event-photos").createSignedUrl(row.photo_path,3600);
      photoUrl=photo?.signedUrl||"";
    }
    return mapEvent(row,photoUrl);
  }));
  refresh();
}
async function loadProfile(user) {
  const {data,error}=await db.from("member_profiles").select("*").eq("id",user.id).single();
  if(error) throw error;
  profile=data;
  if(profile.access_status!=="approved"){
    const status=profile.access_status==="denied" ? "Your access request was declined. You can submit a new request or redeem the shared access code." : "Your account is verified. Redeem the shared access code or request administrator approval.";
    showAuth(status,true);
    $("authTitle").textContent=profile.access_status==="denied"?"Access not approved yet":"Member access";
    $("authForm").hidden=true; $("toggleAuthMode").hidden=true;
    return;
  }
  $("authScreen").hidden=true; $("appShell").hidden=false;
  const admin=profile.role==="admin";
  ["addEventTop","addFirstEvent","addEventPage"].forEach(id=>$(id).hidden=!admin);
  $("adminPanel").hidden=!admin;
  await loadEvents();
  if(admin) await loadAccessRequests();
}
async function handleSession(session) {
  if(!session?.user){
    profile=null;events=[];$("authScreen").hidden=false;$("appShell").hidden=true;
    $("authForm").hidden=false;$("toggleAuthMode").hidden=false;$("accessArea").hidden=true;$("signOutButton").hidden=true;
    $("authTitle").textContent="Welcome";$("authMessage").textContent="Sign in or create an account to continue.";
    return;
  }
  if(!session.user.email_confirmed_at){
    showAuth("Check your email and confirm your address before signing in.",false);
    $("authForm").hidden=false;return;
  }
  try { await loadProfile(session.user); }
  catch(error){showAuth("We couldn't load your member profile. Please try signing out and back in.");authError(error.message);}
}
$("toggleAuthMode").addEventListener("click",()=>{
  signupMode=!signupMode;$("authTitle").textContent=signupMode?"Create your account":"Welcome";
  $("authSubmit").textContent=signupMode?"Create Account":"Sign In";
  $("authPassword").autocomplete=signupMode?"new-password":"current-password";
  $("toggleAuthMode").textContent=signupMode?"Already have an account? Sign in":"Need an account? Sign up";
  $("authError").hidden=true;
});
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault();$("authError").hidden=true;$("authSubmit").disabled=true;
  const email=$("authEmail").value.trim(),password=$("authPassword").value;
  try{
    const result=signupMode
      ? await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin}})
      : await db.auth.signInWithPassword({email,password});
    if(result.error) throw result.error;
    if(signupMode&&!result.data.session){
      $("authMessage").textContent="Account created. Check your inbox for the confirmation email, then come back and sign in.";
      $("authForm").hidden=true;$("toggleAuthMode").hidden=true;return;
    }
    await handleSession(result.data.session);
  }catch(error){authError(error.message||"Sign-in failed.");}
  finally{$("authSubmit").disabled=false;}
});
$("signOutButton").addEventListener("click",async()=>{await db.auth.signOut();});
$("codeForm").addEventListener("submit",async e=>{
  e.preventDefault();$("authError").hidden=true;
  try{
    const {data,error}=await db.functions.invoke("redeem-access-code",{body:{code:$("accessCode").value}});
    if(error) throw error;
    if(data?.error) throw new Error(data.error);
    $("accessCode").value="";showToast("Access approved.");const {data:{session}}=await db.auth.getSession();await handleSession(session);
  }catch(error){authError(error.message||"Could not redeem that code.");}
});
$("requestForm").addEventListener("submit",async e=>{
  e.preventDefault();$("authError").hidden=true;
  try{
    const {error}=await db.rpc("submit_access_request",{p_message:$("requestMessage").value.trim()||null});
    if(error) throw error;
    $("authMessage").textContent="Your access request has been sent. An administrator will review it.";
    $("requestMessage").value="";showToast("Access request submitted.");
  }catch(error){authError(error.message||"Could not submit your request.");}
});
async function loadAccessRequests(){
  const {data,error}=await db.from("access_requests").select("id,user_id,message,status,requested_at").eq("status","pending").order("requested_at");
  if(error)throw error;
  $("accessRequests").innerHTML=data?.length?data.map(r=>`<div class="admin-request"><div><strong>${escapeHTML(r.user_id)}</strong><p>${escapeHTML(r.message||"No message provided")}</p></div><div class="admin-request-actions"><button class="small-button" data-action="review-approve" data-id="${r.id}">Approve</button><button class="small-button delete" data-action="review-deny" data-id="${r.id}">Decline</button></div></div>`).join(""):"<p class='muted'>No pending access requests.</p>";
}
async function reviewRequest(id,decision){
  const {error}=await db.rpc("review_access_request",{p_request_id:id,p_decision:decision});
  if(error)throw error;await loadAccessRequests();showToast("Access request "+decision+".");
}
function showView(view){
  document.querySelectorAll(".view").forEach(s=>s.hidden=s.id!==view);
  document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="events")renderEvents();window.scrollTo({top:0,behavior:"smooth"});
}
function openEventDialog(id=""){
  $("eventForm").reset();$("eventId").value="";$("dialogTitle").textContent="Add an Event";
  $("formError").hidden=true;currentPhotoPath="";currentPhotoUrl="";selectedPhotoFile=null;setPhotoPreview("");
  if(id){
    const item=events.find(x=>x.id===id);if(!item)return;
    $("dialogTitle").textContent="Edit Event";$("eventId").value=item.id;$("eventName").value=item.name||"";
    $("eventDate").value=item.date||"";$("eventTime").value=item.time||"";$("eventEndTime").value=item.endTime||"";
    $("eventCategory").value=item.category||"Community";$("eventLocation").value=item.location||"";
    $("eventSignup").value=item.signup||"";$("eventDescription").value=item.description||"";
    currentPhotoPath=item.photoPath||"";currentPhotoUrl=item.photoUrl||"";setPhotoPreview(currentPhotoUrl);
  }
  $("eventDialog").showModal();
}
function closeEventDialog(){if($("eventDialog").open)$("eventDialog").close();}
function eventText(item){
  return [item.name,`${formatDate(item.date)}${item.time?" at "+item.time:""}${item.endTime?"–"+item.endTime:""}`,item.location?"Location: "+item.location:"",item.description||"",item.signup?"Sign up: "+safeHttpUrl(item.signup):""].filter(Boolean).join("\n\n");
}
function googleCalendarUrl(item){
  const u=new URL("https://calendar.google.com/calendar/render");u.searchParams.set("action","TEMPLATE");
  u.searchParams.set("text",item.name||"MACH SFRG Event");u.searchParams.set("details",eventText(item));
  if(item.location)u.searchParams.set("location",item.location);
  if(item.date){const start=item.date.replaceAll("-","");const end=addDays(item.date,1).replaceAll("-","");
    if(item.time){const range=eventDateTimeRange(item);u.searchParams.set("dates",range.start+"/"+range.end);}
    else u.searchParams.set("dates",start+"/"+end);}
  return u.href;
}
function formatCalendarStamp(d){const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;}
function eventDateTimeRange(item){
  const [y,m,d]=item.date.split("-").map(Number),[h,min]=item.time.split(":").map(Number);
  const start=new Date(y,m-1,d,h,min||0),end=item.endTime?new Date(y,m-1,d,...item.endTime.split(":").map(Number)):new Date(start.getTime()+3600000);
  return {start:formatCalendarStamp(start),end:formatCalendarStamp(end)};
}
function addDays(value,n){const d=parseDate(value);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function downloadAppleCalendar(item){
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
  const esc=s=>String(s||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//MACH SFRG//Events//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT",`UID:${esc(item.id)}@mach-sfrg-events`,`DTSTAMP:${stamp}`];
  if(item.date&&item.time){const r=eventDateTimeRange(item);lines.push("DTSTART:"+r.start,"DTEND:"+r.end);}
  else if(item.date)lines.push("DTSTART;VALUE=DATE:"+item.date.replaceAll("-",""),"DTEND;VALUE=DATE:"+addDays(item.date,1).replaceAll("-",""));
  lines.push("SUMMARY:"+esc(item.name));if(item.description)lines.push("DESCRIPTION:"+esc(item.description));if(item.location)lines.push("LOCATION:"+esc(item.location));lines.push("END:VEVENT","END:VCALENDAR","");
  const url=URL.createObjectURL(new Blob([lines.join("\r\n")],{type:"text/calendar;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="mach-sfrg-event.ics";a.click();URL.revokeObjectURL(url);
}
function eventCard(item){
  const photo=item.photoUrl?`<img class="event-photo" src="${escapeHTML(item.photoUrl)}" alt="Photo for ${escapeHTML(item.name)}">`:'<div class="event-photo-placeholder"><span>✦</span><small>MACH SFRG COMMUNITY EVENT</small></div>';
  const signup=safeHttpUrl(item.signup),actions=profile?.role==="admin"?`<div class="event-card-actions"><button class="small-button" data-action="edit" data-id="${item.id}">Edit</button><button class="small-button delete" data-action="delete" data-id="${item.id}">Delete</button></div>`:"";
  return `<article class="event-card" id="event-${escapeHTML(item.id)}">${photo}<div class="event-card-body"><span class="event-date">${escapeHTML(item.category)} <span>·</span> ${escapeHTML(formatDate(item.date))}</span><h3>${escapeHTML(item.name)}</h3><p class="event-description">${escapeHTML(item.description||"Join us for this community event.")}</p><div class="event-meta"><span>◷ ${escapeHTML(item.time||"Time to be announced")}${item.endTime?" – "+escapeHTML(item.endTime):""}</span><span>⌖ ${escapeHTML(item.location||"Location to be announced")}</span></div>${signup?`<a class="signup-button" href="${escapeHTML(signup)}" target="_blank" rel="noopener noreferrer">Sign Up / Register ↗</a>`:""}<div class="event-tools"><a class="tool-link" href="sms:?&body=${encodeURIComponent(eventText(item))}">Text</a><a class="tool-link" href="mailto:?subject=${encodeURIComponent("MACH SFRG Event: "+item.name)}&body=${encodeURIComponent(eventText(item))}">Email</a><a class="tool-link" href="${escapeHTML(googleCalendarUrl(item))}" target="_blank" rel="noopener noreferrer">Google Calendar</a><button class="tool-link" data-action="apple-calendar" data-id="${item.id}">Apple Calendar</button></div></div>${actions}</article>`;
}
function renderDashboard(){
  const upcoming=events.filter(x=>dateIsUpcoming(x.date)&&matchesSearch(x)).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  $("featuredEmpty").hidden=!!upcoming.length;$("dashboardEvents").innerHTML=upcoming.slice(0,6).map(eventCard).join("");
  if(!upcoming.length){$("featuredEmpty").querySelector("h3").textContent=searchQuery?"No events found":"Your next great memory starts here";$("addFirstEvent").hidden=profile?.role!=="admin";}
}
function renderEvents(){
  const category=$("categoryFilter").value;
  const list=events.filter(x=>matchesSearch(x)&&(!category||x.category===category)).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  $("allEvents").innerHTML=list.length?list.map(eventCard).join():"<div class='empty-state'>No events match your search. Try another filter.</div>";
}
function renderCalendar(){
  const grid=$("calendarGrid");if(!grid)return;
  $("monthLabel").textContent=new Date(currentYear,currentMonth,1).toLocaleDateString(undefined,{month:"long",year:"numeric"});
  const names=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];let html=names.map(n=>`<div class="calendar-day-name">${n}</div>`).join("");
  const first=new Date(currentYear,currentMonth,1).getDay(),days=new Date(currentYear,currentMonth+1,0).getDate(),prev=new Date(currentYear,currentMonth,0).getDate(),today=new Date();
  for(let i=0;i<42;i++){
    let day,date,muted=false;
    if(i<first){day=prev-first+i+1;date=new Date(currentYear,currentMonth-1,day);muted=true;}
    else if(i>=first+days){day=i-first-days+1;date=new Date(currentYear,currentMonth+1,day);muted=true;}
    else{day=i-first+1;date=new Date(currentYear,currentMonth,day);}
    const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const found=events.filter(e=>matchesSearch(e)&&e.date===key);
    html+=`<div class="calendar-day ${muted?"muted-day":""} ${date.toDateString()===today.toDateString()?"today":""}"><strong>${day}</strong>${found.slice(0,2).map(e=>`<button class="calendar-event" data-action="view-event" data-id="${e.id}" title="${escapeHTML(e.name)}">${escapeHTML(e.name)}</button>`).join("")}${found.length>2?`<small class="calendar-more">+${found.length-2} more</small>`:""}</div>`;
  }
  grid.innerHTML=html;
}
function refresh(){renderDashboard();renderEvents();renderCalendar();}
function changeMonth(n){currentMonth+=n;if(currentMonth<0){currentMonth=11;currentYear--;}if(currentMonth>11){currentMonth=0;currentYear++;}renderCalendar();}
function jumpToToday(){const d=new Date();currentMonth=d.getMonth();currentYear=d.getFullYear();renderCalendar();}
function compressPhoto(file){
  return new Promise((resolve,reject)=>{
    if(!file)return resolve(null);if(!/^image\/(jpeg|png|webp)$/.test(file.type))return reject(new Error("Choose a JPG, PNG, or WebP image."));
    if(file.size>10*1024*1024)return reject(new Error("Choose a photo smaller than 10 MB."));
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{const scale=Math.min(1,1400/img.width,1000/img.height),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Photo processing failed.")),"image/jpeg",.78);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Could not open that photo."));};img.src=url;
  });
}
async function deleteEvent(id){
  if(!confirm("Delete this event?"))return;
  const item=events.find(e=>e.id===id);const {error}=await db.from("events").delete().eq("id",id);
  if(error){showToast(error.message);return;}
  if(item?.photoPath)await db.storage.from("event-photos").remove([item.photoPath]);
  await loadEvents();showToast("Event deleted.");
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
document.querySelectorAll("[data-view-link]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();showView(a.dataset.viewLink);}));
["addEventTop","addFirstEvent","addEventPage"].forEach(id=>$(id).addEventListener("click",()=>{if(profile?.role==="admin")openEventDialog();}));
$("closeDialog").addEventListener("click",closeEventDialog);$("cancelDialog").addEventListener("click",closeEventDialog);
$("previousMonth").addEventListener("click",()=>changeMonth(-1));$("nextMonth").addEventListener("click",()=>changeMonth(1));$("todayButton").addEventListener("click",jumpToToday);
function syncSearch(v){searchQuery=v.trim().toLowerCase();$("dashboardSearch").value=v;$("searchInput").value=v;refresh();}
$("dashboardSearch").addEventListener("input",e=>syncSearch(e.target.value));$("searchInput").addEventListener("input",e=>syncSearch(e.target.value));$("categoryFilter").addEventListener("change",renderEvents);
$("eventPhoto").addEventListener("change",e=>{selectedPhotoFile=e.target.files?.[0]||null;if(selectedPhotoFile){const u=URL.createObjectURL(selectedPhotoFile);$("photoPreview").src=u;$("photoPreview").onload=()=>URL.revokeObjectURL(u);$("photoPreviewWrap").hidden=false;}});
$("removePhoto").addEventListener("click",()=>{currentPhotoPath="";currentPhotoUrl="";selectedPhotoFile=null;$("eventPhoto").value="";setPhotoPreview("");});
document.addEventListener("click",async e=>{
  const b=e.target.closest("button[data-action]");if(!b)return;const id=b.dataset.id,item=events.find(x=>x.id===id);
  try{
    if(b.dataset.action==="edit"&&profile?.role==="admin")openEventDialog(id);
    if(b.dataset.action==="delete"&&profile?.role==="admin")await deleteEvent(id);
    if(b.dataset.action==="apple-calendar"&&item)downloadAppleCalendar(item);
    if(b.dataset.action==="view-event"&&item){showView("events");setTimeout(()=>document.getElementById("event-"+CSS.escape(id))?.scrollIntoView({behavior:"smooth",block:"center"}),80);}
    if(b.dataset.action==="review-approve"||b.dataset.action==="review-deny")await reviewRequest(id,b.dataset.action==="review-approve"?"approved":"denied");
  }catch(error){showToast(error.message||"Action failed.");}
});
$("eventForm").addEventListener("submit",async e=>{
  e.preventDefault();if(profile?.role!=="admin")return;
  const button=$("saveEventButton"),errorBox=$("formError");errorBox.hidden=true;button.disabled=true;button.textContent="Saving...";
  try{
    const signup=$("eventSignup").value.trim();if(signup&&!safeHttpUrl(signup))throw new Error("Enter a complete sign-up link beginning with https:// or http://.");
    const start=$("eventTime").value,end=$("eventEndTime").value;if(start&&end&&end<=start)throw new Error("The end time must be later than the start time.");
    const id=$("eventId").value||crypto.randomUUID();let photoPath=currentPhotoPath;
    if(selectedPhotoFile){const blob=await compressPhoto(selectedPhotoFile);photoPath=`${id}/${crypto.randomUUID()}.jpg`;const {error}=await db.storage.from("event-photos").upload(photoPath,blob,{contentType:"image/jpeg",upsert:false});if(error)throw error;}
    const row={id,name:$("eventName").value.trim(),event_date:$("eventDate").value,start_time:start||null,end_time:end||null,category:$("eventCategory").value,location:$("eventLocation").value.trim()||null,signup_url:signup||null,description:$("eventDescription").value.trim()||null,photo_path:photoPath||null,updated_by:(await db.auth.getUser()).data.user.id};
    const {error}=await db.from("events").upsert(row);if(error)throw error;
    closeEventDialog();await loadEvents();showToast("Event saved successfully.");
  }catch(error){errorBox.textContent=error.message||"The event could not be saved.";errorBox.hidden=false;}
  finally{button.disabled=false;button.textContent="Save Event";}
});
(async()=>{
  db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>handleSession(session),0);});
  const {data:{session}}=await db.auth.getSession();await handleSession(session);
})();
