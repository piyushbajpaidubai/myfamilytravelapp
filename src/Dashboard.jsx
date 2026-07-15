import { useEffect, useMemo, useState } from "react";
import "./dashboard.css";

const DAY_MS = 24 * 60 * 60 * 1000;

function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const paths = {
    plane: <><path d="M4 11.5 20 4l-5.4 16-3.2-6.2L4 11.5Z"/><path d="m11.4 13.8 3.5-4.1"/></>,
    home: <><path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></>,
    trips: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M9 12v2h6v-2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 3 3 3-4 5 6"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></>,
    sparkle: <><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  };

  return (
    <svg className="dashboard-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.arrow}
    </svg>
  );
}

const toIsoDay = (date) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const isoToUtc = (iso) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

const tripRange = (trip) => {
  const dayDates = ((trip && trip.days) || [])
    .map((day) => (day.date || "").slice(0, 10))
    .filter(Boolean);
  const startDates = [(trip && trip.startDate) || "", ...dayDates].filter(Boolean).sort();
  const endDates = [(trip && trip.endDate) || "", ...dayDates].filter(Boolean).sort();
  return {
    start: startDates[0] || "",
    end: endDates[endDates.length - 1] || "",
  };
};

const compactDateRange = (trip) => {
  const { start, end } = tripRange(trip);
  if (!start) return "Dates not set";
  const startTime = isoToUtc(start);
  const endTime = isoToUtc(end || start);
  if (startTime == null || endTime == null) return start;
  const from = new Date(startTime);
  const to = new Date(endTime);
  const month = (date) => date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  if (start === end || !end) return `${from.getUTCDate()} ${month(from)} ${from.getUTCFullYear()}`;
  if (from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth()) {
    return `${from.getUTCDate()}–${to.getUTCDate()} ${month(to)} ${to.getUTCFullYear()}`;
  }
  if (from.getUTCFullYear() === to.getUTCFullYear()) {
    return `${from.getUTCDate()} ${month(from)}–${to.getUTCDate()} ${month(to)} ${to.getUTCFullYear()}`;
  }
  return `${from.getUTCDate()} ${month(from)} ${from.getUTCFullYear()}–${to.getUTCDate()} ${month(to)} ${to.getUTCFullYear()}`;
};

const dashboardStatus = (trip) => {
  const status = (trip && trip.status) || "todo";
  const { start } = tripRange(trip);
  if (status === "active") return { label: "Active", tone: "active", order: 0 };
  if (status === "done") return { label: "Archived", tone: "archived", order: 3 };
  if (start) return { label: "Upcoming", tone: "upcoming", order: 1 };
  return { label: "Planning", tone: "planning", order: 2 };
};

const tripEvents = (trip) => ((trip && trip.days) || [])
  .flatMap((day) => (day.events || []).map((event) => ({ ...event, date: (day.date || "").slice(0, 10) })))
  .sort((a, b) => `${a.date || "9999"}T${a.time || "23:59"}`.localeCompare(`${b.date || "9999"}T${b.time || "23:59"}`));

const nextTripEvent = (trip) => {
  const events = tripEvents(trip);
  if (!events.length) return null;
  const now = new Date();
  const marker = `${toIsoDay(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return events.find((event) => `${event.date || "9999"}T${event.time || "23:59"}` >= marker)
    || events.find((event) => event.date === toIsoDay(now))
    || events[0];
};

const tripProgress = (trip) => {
  const { start, end } = tripRange(trip);
  const startTime = isoToUtc(start);
  const endTime = isoToUtc(end || start);
  if (startTime == null || endTime == null) return { complete: 0, total: 0, percent: 0, dayLabel: "Dates being planned" };
  const total = Math.max(1, Math.round((endTime - startTime) / DAY_MS) + 1);
  const status = (trip && trip.status) || "todo";
  let complete = 0;
  if (status === "done") complete = total;
  if (status === "active") complete = Math.max(0, Math.min(total, Math.floor((isoToUtc(toIsoDay(new Date())) - startTime) / DAY_MS)));
  const currentDay = Math.max(1, Math.min(total, complete + 1));
  const dayLabel = status === "active" ? `Day ${currentDay} of ${total}` : status === "done" ? `${total} days complete` : `${total}-day journey`;
  return { complete, total, percent: Math.round((complete / total) * 100), dayLabel };
};

const documentCount = (trip) => {
  if (!trip) return 0;
  let count = 0;
  (trip.days || []).forEach((day) => (day.events || []).forEach((event) => {
    count += (event.docs || []).length;
    (event.activities || []).forEach((activity) => { count += (activity.docs || []).length; });
  }));
  (trip.spans || []).forEach((span) => { count += (span.docs || []).length; });
  return count;
};

const initialsFor = (name) => {
  const parts = String(name || "Traveler").trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || "T"}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
};

const memberSummary = (trip, member) => {
  const items = [];
  (trip && trip.days || []).forEach((day) => (day.events || []).forEach((event) => {
    items.push(event);
    (event.activities || []).forEach((activity) => items.push(activity));
  }));
  const states = items.map((item) => (item.memberStatus && item.memberStatus[member.userId]) || item.status || (item.done ? "done" : "todo"));
  const activeItem = items.find((item) => item.memberStatus && item.memberStatus[member.userId] === "active") || items.find((item) => item.status === "active");
  if (states.length && states.every((state) => state === "done")) {
    return { label: "Complete", tone: "complete", location: activeItem?.location || trip.destination || "Trip complete" };
  }
  if (states.some((state) => state === "active" || state === "done")) {
    return { label: "On track", tone: "on-track", location: activeItem?.location || trip.destination || "Journey in progress" };
  }
  return { label: "Ready", tone: "ready", location: trip.destination || "Ready for the journey" };
};

function Brand({ compact = false }) {
  return (
    <div className={`dashboard-brand ${compact ? "dashboard-brand--compact" : ""}`}>
      <span className="dashboard-brand-mark"><Icon name="plane" size={compact ? 18 : 22} /></span>
      <span className="dashboard-brand-copy">
        <strong>My Travel Hub</strong>
        {!compact && <span>Family journeys, together</span>}
      </span>
    </div>
  );
}

function TripArtwork({ variant = 0 }) {
  return (
    <span className={`dashboard-trip-art dashboard-trip-art--${(variant % 3) + 1}`} aria-hidden="true">
      <span className="dashboard-art-sun" />
      <span className="dashboard-art-mountain dashboard-art-mountain--back" />
      <span className="dashboard-art-mountain dashboard-art-mountain--front" />
      <span className="dashboard-art-plane"><Icon name="plane" size={18} /></span>
    </span>
  );
}

export default function Dashboard({
  session,
  profile,
  trips = [],
  loading = false,
  canCreate = true,
  onOpenTrip,
  onNewTrip,
  onOpenAccount,
  onSaveData,
  onNavigate,
}) {
  const [notes, setNotes] = useState("");
  const [todoInput, setTodoInput] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [addingTodo, setAddingTodo] = useState(false);
  const [showAllTrips, setShowAllTrips] = useState(false);
  const savedNotes = (profile && profile.notes) || "";
  const todos = (profile && profile.todos) || [];

  useEffect(() => { setNotes(savedNotes); }, [savedNotes]);

  const sortedTrips = useMemo(() => [...trips].sort((a, b) => {
    const statusDifference = dashboardStatus(a).order - dashboardStatus(b).order;
    if (statusDifference) return statusDifference;
    return (tripRange(a).start || "9999").localeCompare(tripRange(b).start || "9999");
  }), [trips]);

  const currentTrip = sortedTrips.find((trip) => dashboardStatus(trip).tone === "active") || sortedTrips[0] || null;
  const nextEvent = nextTripEvent(currentTrip);
  const progress = tripProgress(currentTrip);
  const tripDocuments = documentCount(currentTrip);
  const firstName = String((session && session.name) || (profile && profile.name) || "Traveler").trim().split(/\s+/)[0] || "Traveler";
  const fullName = (profile && profile.name) || (session && session.name) || "Traveler";
  const roleLabel = session && session.role === "viewer" ? "Trip viewer" : session && session.role === "traveler" ? "Traveler" : "Trip captain";
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(now).toUpperCase();

  const members = useMemo(() => {
    if (!currentTrip) return [];
    const list = [...(currentTrip.members || [])];
    if (session && session.userId && !list.some((member) => member.userId === session.userId)) {
      list.unshift({ userId: session.userId, name: session.name, role: "captain" });
    }
    return list.map((member) => ({
      ...member,
      name: member.name || member.userId || "Traveler",
      pic: member.pic || (session && member.userId === session.userId && profile && profile.pic) || "",
      summary: memberSummary(currentTrip, member),
    }));
  }, [currentTrip, profile, session]);

  const saveNotes = () => {
    if (notes !== savedNotes && onSaveData) onSaveData({ notes });
    setEditingNote(false);
  };
  const addTodo = () => {
    const text = todoInput.trim();
    if (!text || !onSaveData) return;
    onSaveData({ todos: [...todos, { id: `todo-${Date.now()}`, text, done: false }] });
    setTodoInput("");
    setAddingTodo(false);
  };
  const toggleTodo = (id) => onSaveData && onSaveData({ todos: todos.map((todo) => todo.id === id ? { ...todo, done: !todo.done } : todo) });
  const removeTodo = (id) => onSaveData && onSaveData({ todos: todos.filter((todo) => todo.id !== id) });
  const navigate = (target) => onNavigate && onNavigate(target, currentTrip && currentTrip.id);
  const cards = showAllTrips ? sortedTrips : sortedTrips.slice(0, 3);

  return (
    <main className="travel-dashboard">
      <aside className="dashboard-sidebar" aria-label="Workspace sidebar">
        <button className="dashboard-brand-button" type="button" onClick={() => navigate("overview")} aria-label="My Travel Hub home">
          <Brand />
        </button>

        <nav className="dashboard-navigation" aria-label="Main navigation">
          <p className="dashboard-nav-label">Workspace</p>
          <button className="dashboard-nav-item is-active" type="button" onClick={() => navigate("overview")}><Icon name="home" /> <span>Overview</span><i /></button>
          <a className="dashboard-nav-item" href="#dashboard-trips"><Icon name="trips" /> <span>My trips</span></a>
          <button className="dashboard-nav-item" type="button" onClick={() => navigate("calendar")} disabled={!currentTrip}><Icon name="calendar" /> <span>Calendar</span></button>
          <button className="dashboard-nav-item" type="button" onClick={() => navigate("documents")} disabled={!currentTrip}><Icon name="file" /> <span>Documents</span></button>
          <button className="dashboard-nav-item" type="button" onClick={() => navigate("memories")} disabled={!currentTrip}><Icon name="image" /> <span>Memories</span></button>
        </nav>

        <div className="dashboard-sidebar-spacer" />
        <div className="dashboard-offline-card">
          <span><Icon name="sun" size={17} /></span>
          <div><strong>Travel light</strong><p>{currentTrip ? `${tripDocuments} ${tripDocuments === 1 ? "document" : "documents"} for ${currentTrip.name || "this trip"} ${tripDocuments === 1 ? "is" : "are"} together in one place.` : "Your travel documents will stay close at hand."}</p></div>
        </div>
        <button className="dashboard-nav-item dashboard-settings" type="button" onClick={onOpenAccount}><Icon name="settings" /> <span>Settings</span></button>
        <button className="dashboard-user" type="button" onClick={onOpenAccount} aria-label="Open account menu">
          <span className="dashboard-user-avatar">{profile && profile.pic ? <img src={profile.pic} alt="" /> : initialsFor(fullName)}</span>
          <span className="dashboard-user-copy"><strong>{fullName}</strong><small>{roleLabel}</small></span>
          <span className="dashboard-user-more">•••</span>
        </button>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="dashboard-mobile-brand"><Brand compact /></div>
          <div className="dashboard-top-actions">
            <button className="dashboard-icon-button" type="button" onClick={() => navigate("calendar")} disabled={!currentTrip} aria-label="Open today's plan"><Icon name="bell" /><span className="dashboard-notification-dot" /></button>
            {canCreate && <button className="dashboard-primary-button" type="button" onClick={onNewTrip}><Icon name="plus" size={16} /> <span>New trip</span></button>}
            {!canCreate && <button className="dashboard-icon-button dashboard-mobile-account" type="button" onClick={onOpenAccount} aria-label="Open account menu">{initialsFor(fullName)}</button>}
          </div>
        </header>

        <div className="dashboard-content">
          <header className="dashboard-welcome" id="overview">
            <div>
              <p className="dashboard-eyebrow">{todayLabel}</p>
              <h1>{greeting}, {firstName}.</h1>
              <p className="dashboard-subtitle">Here’s what’s happening across your family’s journeys.</p>
            </div>
            {currentTrip && (
              <div className="dashboard-destination-chip" aria-label={`Current trip: ${currentTrip.destination || currentTrip.name}`}>
                <Icon name="sun" size={20} />
                <span><strong>{dashboardStatus(currentTrip).label}</strong><small>{currentTrip.destination || currentTrip.name}</small></span>
              </div>
            )}
          </header>

          {loading ? (
            <section className="dashboard-current-trip dashboard-skeleton" aria-label="Loading current trip"><span /></section>
          ) : currentTrip ? (
            <section className="dashboard-current-trip" aria-label="Current trip">
              <div className="dashboard-hero-art" aria-hidden="true">
                <i className="dashboard-hero-sun" />
                <i className="dashboard-hero-cloud dashboard-hero-cloud--one" />
                <i className="dashboard-hero-cloud dashboard-hero-cloud--two" />
                <i className="dashboard-hero-mountain dashboard-hero-mountain--back" />
                <i className="dashboard-hero-mountain dashboard-hero-mountain--front" />
                <i className="dashboard-hero-route" />
                <span className="dashboard-hero-plane"><Icon name="plane" size={20} /></span>
              </div>
              <div className="dashboard-current-copy">
                <p className="dashboard-trip-kicker"><i /> {dashboardStatus(currentTrip).tone === "active" ? "Trip in progress" : dashboardStatus(currentTrip).label}</p>
                <h2>{currentTrip.name || "Your next journey"}</h2>
                <p className="dashboard-trip-location"><Icon name="location" size={15} /> {currentTrip.destination || "Destination to be decided"}<span>·</span>{progress.dayLabel}</p>
                <div className="dashboard-next-card">
                  <span className="dashboard-next-time"><small>{nextEvent ? "Next" : "Plan"}</small><strong>{nextEvent && nextEvent.time ? nextEvent.time : "Open"}</strong></span>
                  <span className="dashboard-next-divider" />
                  <span className="dashboard-next-copy"><strong>{nextEvent ? nextEvent.title || "Next activity" : "Build your itinerary"}</strong><small>{nextEvent ? [nextEvent.location, nextEvent.notes].filter(Boolean).join(" · ") || "Trip details ready" : "Add days, stays and activities"}</small></span>
                  <button type="button" onClick={() => onOpenTrip && onOpenTrip(currentTrip.id)} aria-label={`Open ${currentTrip.name || "trip"}`}><Icon name="arrow" size={17} /></button>
                </div>
              </div>
              <div className="dashboard-progress">
                <span><strong>{progress.complete}</strong> days complete</span>
                <span className="dashboard-progress-track"><i style={{ width: `${progress.percent}%` }} /></span>
                <span>{Math.max(0, progress.total - progress.complete)} {Math.max(0, progress.total - progress.complete) === 1 ? "day" : "days"} to go</span>
              </div>
            </section>
          ) : (
            <section className="dashboard-current-trip dashboard-current-trip--empty" aria-label="No current trip">
              <div className="dashboard-current-copy">
                <p className="dashboard-trip-kicker"><i /> Your next chapter</p>
                <h2>Where will your family go next?</h2>
                <p className="dashboard-empty-hero-copy">Create a trip to bring the itinerary, documents and live family progress into one calm workspace.</p>
                {canCreate && <button className="dashboard-hero-cta" type="button" onClick={onNewTrip}>Plan a new trip <Icon name="arrow" size={16} /></button>}
              </div>
              <div className="dashboard-hero-art" aria-hidden="true"><i className="dashboard-hero-sun" /><i className="dashboard-hero-mountain dashboard-hero-mountain--back" /><i className="dashboard-hero-mountain dashboard-hero-mountain--front" /></div>
            </section>
          )}

          <div className="dashboard-columns">
            <section className="dashboard-journeys" id="dashboard-trips" aria-labelledby="dashboard-trips-heading">
              <div className="dashboard-section-heading">
                <div><p className="dashboard-eyebrow">Your journeys</p><h2 id="dashboard-trips-heading">My trips</h2></div>
                {sortedTrips.length > 3 && <button type="button" onClick={() => setShowAllTrips((value) => !value)}>{showAllTrips ? "Show less" : "View all"} <Icon name="arrow" size={14} /></button>}
              </div>

              {loading && [0, 1, 2].map((value) => <div className="dashboard-trip-card dashboard-skeleton" key={value}><span /></div>)}
              {!loading && cards.map((trip, index) => {
                const status = dashboardStatus(trip);
                return (
                  <article className="dashboard-trip-card" key={trip.id}>
                    <button className="dashboard-trip-card-action" type="button" onClick={() => onOpenTrip && onOpenTrip(trip.id)} aria-label={`Open ${trip.name || "trip"}`}>
                      <TripArtwork variant={index} />
                      <span className="dashboard-trip-card-copy">
                        <span className={`dashboard-status dashboard-status--${status.tone}`}><i /> {status.label}</span>
                        <strong className="dashboard-trip-name">{trip.name || "Unnamed trip"}</strong>
                        <span className="dashboard-trip-destination"><Icon name="location" size={13} /> {trip.destination || "Destination not set"}</span>
                        <span className="dashboard-trip-meta"><span><Icon name="clock" size={13} /> {compactDateRange(trip)}</span>{(trip.members || []).length > 0 && <span><Icon name="users" size={13} /> {(trip.members || []).length} travelers</span>}</span>
                      </span>
                      <span className="dashboard-card-arrow"><Icon name="arrow" size={15} /></span>
                    </button>
                  </article>
                );
              })}
              {!loading && sortedTrips.length === 0 && (
                <div className="dashboard-empty-card">
                  <span className="dashboard-empty-icon"><Icon name="plane" size={22} /></span>
                  <div><strong>No journeys yet</strong><p>Your active, future and archived trips will appear here.</p></div>
                </div>
              )}
            </section>

            <aside className="dashboard-side-column" aria-label="Trip summary and personal planning">
              <section className="dashboard-panel dashboard-family-panel">
                <div className="dashboard-panel-heading">
                  <div><p className="dashboard-eyebrow">{currentTrip ? `${(currentTrip.destination || currentTrip.name || "Current").split(",")[0]} trip` : "Current trip"}</p><h2>Family status</h2></div>
                  <span className="dashboard-live"><i /> Live</span>
                </div>
                {loading && <div className="dashboard-panel-loading dashboard-skeleton"><span /></div>}
                {!loading && members.slice(0, 4).map((member, index) => (
                  <div className="dashboard-member" key={member.userId || `${member.name}-${index}`}>
                    <span className={`dashboard-member-avatar dashboard-member-avatar--${(index % 4) + 1}`}>{member.pic ? <img src={member.pic} alt="" /> : initialsFor(member.name)}</span>
                    <span className="dashboard-member-copy"><strong>{member.name.split(/\s+/)[0]}</strong><small>{member.summary.location}</small></span>
                    <span className={`dashboard-member-state dashboard-member-state--${member.summary.tone}`}>{member.summary.label}</span>
                  </div>
                ))}
                {!loading && members.length === 0 && <p className="dashboard-panel-empty">Add travelers to see everyone’s live trip status here.</p>}
                <button className="dashboard-secondary-button" type="button" onClick={() => navigate("status")} disabled={!currentTrip}>Open live trip status <Icon name="arrow" size={14} /></button>
              </section>

              <section className="dashboard-panel dashboard-todo-panel">
                <div className="dashboard-panel-heading">
                  <div><p className="dashboard-eyebrow">Personal</p><h2>To-do</h2></div>
                  <button className="dashboard-add-small" type="button" onClick={() => setAddingTodo((value) => !value)} aria-label="Add task"><Icon name="plus" size={17} /></button>
                </div>
                {addingTodo && (
                  <div className="dashboard-add-task">
                    <input value={todoInput} onChange={(event) => setTodoInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTodo(); }} placeholder="Add a travel task…" autoFocus />
                    <button type="button" onClick={addTodo}>Add</button>
                  </div>
                )}
                <div className="dashboard-todo-list">
                  {todos.slice(0, 4).map((todo) => (
                    <div className="dashboard-todo-row" key={todo.id}>
                      <label><input type="checkbox" checked={!!todo.done} onChange={() => toggleTodo(todo.id)} /><span className="dashboard-checkmark"><Icon name="check" size={13} /></span><span className={todo.done ? "is-complete" : ""}>{todo.text}</span></label>
                      {todo.due && <small>{todo.due}</small>}
                      <button type="button" onClick={() => removeTodo(todo.id)} aria-label={`Remove ${todo.text}`}>×</button>
                    </div>
                  ))}
                  {todos.length === 0 && <p className="dashboard-panel-empty">Nothing on the list. Add a small task for the next journey.</p>}
                </div>
              </section>

              <section className="dashboard-note-panel">
                <div className="dashboard-note-sparkle"><Icon name="sparkle" size={14} /></div>
                <p className="dashboard-eyebrow">Quick note</p>
                {editingNote ? (
                  <div className="dashboard-note-editor">
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Write a reminder for your next trip…" autoFocus />
                    <button type="button" onClick={saveNotes}>Save note</button>
                  </div>
                ) : (
                  <>
                    <p className={`dashboard-note-copy ${notes ? "" : "is-placeholder"}`}>{notes || "Keep a thoughtful reminder here for the whole journey."}</p>
                    <button type="button" onClick={() => setEditingNote(true)}>{notes ? "Edit note" : "Add note"}</button>
                  </>
                )}
              </section>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
