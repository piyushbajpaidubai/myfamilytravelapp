import { useState, useEffect, useRef } from "react";

const TABS = ["Schedule", "Status", "Budget", "Packing", "Pictures"];
const CATEGORIES = ["Transport", "Hotel", "Food", "Sightseeing", "Other"];
const BUDGET_CATS = ["Transport", "Accommodation", "Food", "Activities", "Shopping", "Other"];
const PACK_CATS = ["Documents", "Clothing", "Toiletries", "Electronics", "Other"];

const uid = () => Math.random().toString(36).slice(2, 9);

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// Format an ISO date string (YYYY-MM-DD) as "21 June 2026". Returns input unchanged if unparseable.
const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso;
  const mi = parseInt(m[2], 10) - 1;
  if (mi < 0 || mi > 11) return iso;
  return `${parseInt(m[3], 10)} ${MONTHS[mi]} ${m[1]}`;
};
// Compact day header: big day number + short month, no year → { d: 21, mon: "JUNE" }
const compactDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return { d: iso || "", mon: "" };
  return { d: parseInt(m[3], 10), mon: (MONTHS[parseInt(m[2], 10) - 1] || "").toUpperCase() };
};
// Weekday name for an ISO date (UTC-based so it never shifts by timezone)
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const weekdayOf = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  return WEEKDAYS[new Date(Date.UTC(+m[1], +m[2]-1, +m[3])).getUTCDay()];
};
// Trip date span derived from the itinerary (earliest → latest day); falls back to manual dates if no days yet
const tripDateRange = (trip) => {
  const ds = ((trip && trip.days) || []).map(d => (d.date || "").slice(0, 10)).filter(Boolean).sort();
  return {
    start: ds[0] || (trip && trip.startDate) || "",
    end: ds.length ? ds[ds.length - 1] : ((trip && trip.endDate) || ""),
  };
};

const defaultTrip = () => ({
  id: uid(), name: "", destination: "", startDate: "", endDate: "",
  days: [], expenses: [], packItems: [], pictures: [],
  budget: "", ownerId: "", members: [], status: "todo", currency: "$", viewers: []
});

// Currency options + money formatter (symbol prefixes directly; letter-codes get a space)
const CURRENCIES = ["$", "€", "£", "₹", "AED", "¥", "₩", "฿", "R$", "A$", "C$"];
const fmtMoney = (amt, cur) => {
  const c = cur || "$";
  const n = parseFloat(amt || 0).toFixed(2);
  return /[A-Za-z]/.test(c) ? `${c} ${n}` : `${c}${n}`;
};

// Whole-trip lifecycle status: not started → active → complete
const TRIP_STATUS = {
  todo:   { label:'Not started', color:'#8A7A6D', bg:'#E5DFD2', dot:'#B0A091' },
  active: { label:'Active',      color:'#1F6FB2', bg:'#D8E8F4', dot:'#2E86C8' },
  done:   { label:'Complete',    color:'#3C8A3C', bg:'#DCEEDC', dot:'#3C8A3C' },
};
const tripStatusOf = (trip) => (trip && trip.status) || 'todo';

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:"#F0EBE0",borderRadius:12,padding:24,minWidth:320,maxWidth:480,width:"90%",boxShadow:"0 8px 32px rgba(44,24,16,0.15)" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
          <h3 style={{ margin:0,fontSize:16,fontWeight:600 }}>{title}</h3>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#B54030" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom:12 }}>
      {label && <label style={{ display:"block",fontSize:12,color:"#A83020",marginBottom:4 }}>{label}</label>}
      <input {...props} style={{ width:"100%",padding:"8px 10px",border:"1px solid #C8B09A",borderRadius:7,fontSize:14,boxSizing:"border-box",...props.style }} />
    </div>
  );
}

function Select({ label, options, renderOption, ...props }) {
  return (
    <div style={{ marginBottom:12 }}>
      {label && <label style={{ display:"block",fontSize:12,color:"#A83020",marginBottom:4 }}>{label}</label>}
      <select {...props} style={{ width:"100%",padding:"8px 10px",border:"1px solid #C8B09A",borderRadius:7,fontSize:14,boxSizing:"border-box" }}>
        {options.map(o => <option key={o} value={o}>{renderOption ? renderOption(o) : o}</option>)}
      </select>
    </div>
  );
}

function Btn({ children, variant="primary", ...props }) {
  const base = { padding:"8px 16px",borderRadius:7,fontSize:13,fontWeight:500,cursor:"pointer",border:"none" };
  const styles = {
    primary: { ...base, background:"#6E1A10",color:"#fff" },
    ghost: { ...base, background:"transparent",color:"#8B2A14",border:"1px solid #C8B09A" },
    danger: { ...base, background:"#F5E0D8",color:"#8B2A14" },
    soft: { ...base, background:"#E8E2D4",color:"#6E1A10" },
  };
  return <button {...props} style={{ ...styles[variant],...props.style }}>{children}</button>;
}

// ── Per-traveler status (group trips) ──
// Events/activities carry memberStatus[userId]; spans carry memberDayStatus[userId][iso].
// Each traveler's progress is independent; missing entry means 'todo'.
const memStOf = (item, userId) => (item && item.memberStatus && item.memberStatus[userId]) || 'todo';
const spanMemStOf = (s, userId, iso) => (s && s.memberDayStatus && s.memberDayStatus[userId] && s.memberDayStatus[userId][iso]) || 'todo';
// Roll several travelers' statuses into one (for the timeline node + counts): all done → done; any progress → active; else todo
const aggStatus = (arr) => (arr.length && arr.every(x => x === 'done')) ? 'done' : (arr.some(x => x === 'active' || x === 'done')) ? 'active' : 'todo';

// ── Three-state status: not started → active → done ──
const STATUS_ORDER = ['todo','active','done'];
// Read an item's status, tolerating legacy `done:true` data
const stOf = (x) => (x && x.status) || (x && x.done ? 'done' : 'todo');
const nextStatus = (s) => STATUS_ORDER[(STATUS_ORDER.indexOf(s) + 1) % 3];
const STATUS_META = {
  todo:   { label:'Not started', short:'TODO',   color:'#8A7A6D', bg:'#E5DFD2', ring:'#B0A091' },
  active: { label:'Active',      short:'ACTIVE', color:'#1F6FB2', bg:'#D8E8F4', ring:'#2E86C8' },
  done:   { label:'Done',        short:'DONE',   color:'#3C8A3C', bg:'#DCEEDC', ring:'#3C8A3C' },
};

// ── Spanning events: accommodation & travel that cross multiple calendar days ──
// Stored at trip level in trip.spans[] and overlaid onto every day they touch.
const SPAN_TYPES = {
  Accommodation: { icon:'🏨', kind:'stay',   startLabel:'Check-in', endLabel:'Check-out' },
  Travel:        { icon:'✈️', kind:'travel', startLabel:'Depart',   endLabel:'Arrive' },
  Other:         { icon:'📌', kind:'other',  startLabel:'Start',    endLabel:'End' },
  // legacy aliases (pre-2026-07-07 data) — rendered but not offered in the picker
  Flight:        { icon:'✈️', kind:'travel', startLabel:'Depart',   endLabel:'Arrive' },
  Train:         { icon:'🚆', kind:'travel', startLabel:'Depart',   endLabel:'Arrive' },
  Car:           { icon:'🚗', kind:'travel', startLabel:'Depart',   endLabel:'Arrive' },
};
const SPAN_TYPE_OPTIONS = ["Accommodation", "Travel", "Other"];
// Travel sub-category (mode). By Road → Google Maps driving; By Air → Flightradar24 by flight no.
const TRAVEL_MODES = ["By Road", "By Air"];
// Official Google Maps directions URL (no API key needed; opens the Maps app on phones for live navigation)
const gmapsDirUrl = (from, to) =>
  'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(from || '') + '&destination=' + encodeURIComponent(to || '') + '&travelmode=driving';
// Flightradar24 flight-status page for a given flight number (free feature; live when airborne)
const fr24Url = (flightNo) => 'https://www.flightradar24.com/data/flights/' + encodeURIComponent((flightNo || '').replace(/\s+/g, '').toLowerCase());

// Free driving route (OpenStreetMap Nominatim geocode + OSRM routing; no API key) → { seconds, meters } or null
async function roadRoute(from, to) {
  try {
    const geocode = async (q) => {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json' } });
      if (!r.ok) return null;
      const rows = await r.json();
      return (rows && rows[0]) ? { lat: rows[0].lat, lon: rows[0].lon } : null;
    };
    const a = await geocode(from); if (!a) return null;
    const b = await geocode(to);   if (!b) return null;
    const rr = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
    if (!rr.ok) return null;
    const j = await rr.json();
    if (j.code !== 'Ok' || !j.routes || !j.routes[0]) return null;
    return { seconds: j.routes[0].duration, meters: j.routes[0].distance };
  } catch (e) { return null; }
}
// Add seconds to a (YYYY-MM-DD, HH:MM) → { date, time }, UTC math to avoid timezone drift
const addSeconds = (dateISO, timeHM, secs) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO || '');
  if (!m) return null;
  const t = /^(\d{1,2}):(\d{2})/.exec(timeHM || '00:00');
  const base = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], t ? +t[1] : 0, t ? +t[2] : 0));
  const end = new Date(base.getTime() + secs * 1000);
  const p = n => String(n).padStart(2, '0');
  return { date: `${end.getUTCFullYear()}-${p(end.getUTCMonth()+1)}-${p(end.getUTCDate())}`, time: `${p(end.getUTCHours())}:${p(end.getUTCMinutes())}` };
};
// Icon for a span: travel shows mode-specific (road/air), else the type icon
const spanIcon = (s) => {
  if ((SPAN_TYPES[s.type] || {}).kind === 'travel') return s.mode === 'By Air' ? '✈️' : '🚗';
  return (SPAN_TYPES[s.type] || {}).icon || '';
};
// whole calendar days between two ISO dates (UTC, DST-safe)
const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
// trip-level spans that overlap a given ISO day (string compare works for YYYY-MM-DD)
const spansOnDay = (trip, dayISO) => (trip.spans || []).filter(s =>
  s.startDate && s.endDate && dayISO >= s.startDate && dayISO <= s.endDate);
// which end of the span this day represents
const spanRole = (s, dayISO) => s.startDate === s.endDate ? 'single'
  : dayISO === s.startDate ? 'start' : dayISO === s.endDate ? 'end' : 'mid';
// spans carry a per-day status map (dayStatus[iso]); each day the span touches is tracked independently
const spanStOf = (s, dayISO) => (s && s.dayStatus && s.dayStatus[dayISO]) || 'todo';
// location text for a span: travel shows "From → To" (air also prefixes the flight no); stay/other shows the single location
const spanLocationText = (s) => {
  const isTravel = (SPAN_TYPES[s.type] || {}).kind === 'travel';
  if (isTravel) {
    const route = (s.from || s.to) ? `${s.from || '?'} → ${s.to || '?'}` : '';
    if (s.mode === 'By Air' && s.flightNo) return route ? `${s.flightNo.toUpperCase()} · ${route}` : s.flightNo.toUpperCase();
    return route;
  }
  return s.location || '';
};
// short contextual label for a span on a given day, e.g. "Check-in · 14:00", "Night 2", "Arrive · 09:30"
const spanSegLabel = (s, dayISO) => {
  const meta = SPAN_TYPES[s.type] || SPAN_TYPES.Accommodation;
  const role = spanRole(s, dayISO);
  const withTime = (label, tm) => tm ? `${label} · ${tm}` : label;
  if (role === 'start') return withTime(meta.startLabel, s.startTime);
  if (role === 'end')   return withTime(meta.endLabel, s.endTime);
  if (role === 'mid') {
    if (meta.kind === 'stay')   return `Night ${dayDiff(dayISO, s.startDate) + 1}`;
    if (meta.kind === 'travel') return 'In transit';
    return `Day ${dayDiff(dayISO, s.startDate) + 1}`; // 'other'
  }
  // single calendar day
  const tm = [s.startTime, s.endTime].filter(Boolean).join('–');
  return meta.kind === 'stay' ? withTime(`${meta.startLabel} & ${meta.endLabel}`, tm) : (tm || meta.startLabel);
};

// Clickable status indicator: empty circle → filled (active) → check (done)
function StatusBox({ status='todo', onClick, size=16, style }) {
  const s = STATUS_META[status] ? status : 'todo';
  const base = { width:size, height:size, borderRadius:'50%', flexShrink:0, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', boxSizing:'border-box', marginTop:3, transition:'all .15s' };
  let box, inner = null;
  if (s === 'todo') {
    box = { ...base, border:`2px solid ${STATUS_META.todo.ring}`, background:'transparent' };
  } else if (s === 'active') {
    box = { ...base, border:`2px solid ${STATUS_META.active.ring}`, background:STATUS_META.active.ring };
    inner = <span style={{ width:Math.round(size*0.36), height:Math.round(size*0.36), borderRadius:'50%', background:'#fff' }} />;
  } else {
    box = { ...base, border:`2px solid ${STATUS_META.done.ring}`, background:STATUS_META.done.ring };
    inner = <span style={{ color:'#fff', fontSize:Math.round(size*0.72), lineHeight:1, fontWeight:700 }}>✓</span>;
  }
  return <span role="button" title={`${STATUS_META[s].label} — click to change`} onClick={onClick} style={{ ...box, ...style }}>{inner}</span>;
}

function StatusBadge({ status='todo' }) {
  const s = STATUS_META[status] ? status : 'todo';
  const m = STATUS_META[s];
  return <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.05em', padding:'1px 6px', borderRadius:4, color:m.color, background:m.bg, whiteSpace:'nowrap' }}>{m.short}</span>;
}

// Inline "assigned travelers" picker. Empty value = everyone ("All on this Trip").
function Assignees({ members, value, onChange }) {
  const [open, setOpen] = useState(false);
  if (!members.length) return null;
  const isAll = !value || value.length === 0;
  const names = isAll
    ? 'Everyone'
    : (members.filter(m => value.includes(m.userId)).map(m => (m.name || m.userId).split(' ')[0]).join(', ') || `${value.length} selected`);
  const toggle = (uid) => {
    if (isAll) { onChange([uid]); return; }          // from everyone → just this traveler
    const next = value.includes(uid) ? value.filter(x => x !== uid) : [...value, uid];
    onChange(next);                                   // emptying it → back to everyone
  };
  return (
    <div style={{ marginTop:5 }}>
      <button type="button" onClick={()=>setOpen(o=>!o)}
        style={{ display:'inline-flex', alignItems:'center', gap:5, background:'#EDE7D9', border:'1px solid #D4BFB0', borderRadius:20, padding:'2px 10px', fontSize:11.5, color:'#6E1A10', cursor:'pointer', fontWeight:500 }}>
        <span style={{ fontSize:12 }}>👥</span> {names} <span style={{ color:'#B0967A' }}>▾</span>
      </button>
      {open && (
        <div style={{ marginTop:6, background:'#F5EFE2', border:'1px solid #E2D8C8', borderRadius:8, padding:'4px 2px', maxWidth:280 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', fontSize:12.5, color:'#6E1A10', cursor:'pointer' }}>
            <input type="checkbox" checked={isAll} onChange={()=>onChange([])} /> <strong>All on this Trip</strong>
          </label>
          {members.map(m => (
            <label key={m.userId} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', fontSize:12.5, color:'#6E1A10', cursor:'pointer', borderTop:'1px solid #EDE7D9' }}>
              <input type="checkbox" checked={!isAll && value.includes(m.userId)} onChange={()=>toggle(m.userId)} /> {m.name || m.userId}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Schedule Tab ----
function ScheduleTab({ trip, update, session, canEdit=true }) {
  const myId = session ? session.userId : null;
  // The status the current user sees/toggles on an item (per-traveler when logged in, else legacy shared)
  const evStatus = (item) => myId ? memStOf(item, myId) : stOf(item);
  const spStatus = (s, iso) => myId ? spanMemStOf(s, myId, iso) : spanStOf(s, iso);
  const [showDay, setShowDay] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState({}); // { [dayId]: true } when collapsed
  const toggleDayCollapse = (id) => setCollapsedDays(c => ({ ...c, [id]: !c[id] }));
  const [showEvent, setShowEvent] = useState(null); // dayId when the add modal is open
  const [dayForm, setDayForm] = useState({ date:"", label:"" });
  // evForm covers both single-day activities (time/endTime/category) and multi-day spans (startDate/endDate/…)
  // duration = 'single' | 'multi' decides which; type only matters for multi-day spans
  const [evForm, setEvForm] = useState({ duration:"single", type:"Activity", time:"", endTime:"", title:"", location:"", from:"", to:"", mode:"By Road", flightNo:"", category:"Sightseeing", notes:"", startDate:"", startTime:"", endDate:"", spanEndTime:"", expAmount:"", expCat:"Food", expTraveler:"" });
  // Activity state: { [eventId]: inputText }
  const [activityInput, setActivityInput] = useState({});
  // Which event is showing the activity input box
  const [addingActivityFor, setAddingActivityFor] = useState(null);
  // Auto-fill arrival (road route estimate) state
  const [estimating, setEstimating] = useState(false);
  const [estimateMsg, setEstimateMsg] = useState('');
  // Event expense modal: eventId being logged + the form
  const members = trip.members || [];
  const [expenseFor, setExpenseFor] = useState(null); // eventId
  const [expForm, setExpForm] = useState({ amount:"", category:"Food", travelerId:"", desc:"" });
  const nameOfTraveler = (uid) => { const m = members.find(x => x.userId === uid); return m ? m.name : ''; };
  const openExpense = (evId) => {
    const defTrav = (myId && members.some(m => m.userId === myId)) ? myId : (members[0] ? members[0].userId : '');
    setExpForm({ amount:"", category:"Food", travelerId:defTrav, desc:"" });
    setExpenseFor(evId);
  };
  const addEventExpense = () => {
    if (!expForm.amount) { alert('Please enter an amount.'); return; }
    const exp = { id:uid(), desc:expForm.desc, amount:expForm.amount, category:expForm.category, eventId:expenseFor, travelerId:expForm.travelerId };
    update(t => ({ expenses:[...(t.expenses||[]), exp] }));
    setExpenseFor(null); setExpForm({ amount:"", category:"Food", travelerId:"", desc:"" });
  };

  // Optional expense fields shown inside the add-event popup (all types)
  const expenseFields = (
    <div style={{ marginTop:4, paddingTop:12, borderTop:'1px dashed #D4BFB0' }}>
      <div style={{ fontSize:12, color:'#A83020', marginBottom:8, fontWeight:600 }}>Expense (optional)</div>
      <div style={{ display:'flex', gap:10 }}>
        <div style={{ flex:1 }}><Input label="Amount" type="number" value={evForm.expAmount} onChange={e=>setEvForm({...evForm,expAmount:e.target.value})} placeholder="0.00" /></div>
        <div style={{ flex:1.2 }}><Select label="Category" options={BUDGET_CATS} value={evForm.expCat} onChange={e=>setEvForm({...evForm,expCat:e.target.value})} /></div>
      </div>
      {members.length>0 && (
        <Select label="Traveler" value={evForm.expTraveler} onChange={e=>setEvForm({...evForm,expTraveler:e.target.value})}
          options={['', ...members.map(m=>m.userId)]} renderOption={o => o==='' ? '— shared —' : (nameOfTraveler(o)||o)} />
      )}
    </div>
  );

  // ── Inline editing of day labels / event titles / activity text ──
  // editing = { kind:'day'|'event'|'activity', dayId, evId?, actId? }
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');
  const editKey = (e) => e ? [e.kind, e.dayId, e.evId||'', e.actId||''].join('|') : '';
  const startEdit = (kind, ids, current) => { if (!canEdit) return; setEditing({ kind, ...ids }); setEditVal(current||''); };
  const cancelEdit = () => setEditing(null);
  const commitEdit = () => {
    if (!editing) return;
    const v = editVal.trim();
    const { kind, dayId, evId, actId } = editing;
    if (kind === 'day') {
      // label is optional — allow clearing it
      update(t => ({ days:(t.days||[]).map(d => d.id===dayId ? { ...d, label:v } : d) }));
    } else if (kind === 'event' && v) {
      update(t => ({ days:(t.days||[]).map(d => d.id===dayId
        ? { ...d, events:(d.events||[]).map(e => e.id===evId ? { ...e, title:v } : e) } : d) }));
    } else if (kind === 'startTime' && v) {
      update(t => ({ days:(t.days||[]).map(d => d.id===dayId
        ? { ...d, events:(d.events||[]).map(e => e.id===evId ? { ...e, time:v } : e).sort((a,b)=>a.time>b.time?1:-1) } : d) }));
    } else if (kind === 'endTime' && v) {
      update(t => ({ days:(t.days||[]).map(d => d.id===dayId
        ? { ...d, events:(d.events||[]).map(e => e.id===evId ? { ...e, endTime:v } : e) } : d) }));
    } else if (kind === 'activity' && v) {
      update(t => ({ days:(t.days||[]).map(d => d.id===dayId
        ? { ...d, events:(d.events||[]).map(e => e.id===evId
            ? { ...e, activities:(e.activities||[]).map(a => a.id===actId ? { ...a, text:v } : a) } : e) } : d) }));
    } else if (kind === 'span' && v) {
      // evId holds the span id here
      update(t => ({ spans:(t.spans||[]).map(s => s.id===evId ? { ...s, title:v } : s) }));
    }
    setEditing(null);
  };

  // ── Cycle status: not started → active → done → not started (per-traveler when logged in) ──
  const cycleEventStatus = (dayId, evId) =>
    update(t => ({ days:(t.days||[]).map(d => d.id===dayId
      ? { ...d, events:(d.events||[]).map(e => {
          if (e.id!==evId) return e;
          if (myId) return { ...e, memberStatus:{ ...(e.memberStatus||{}), [myId]: nextStatus(memStOf(e, myId)) } };
          return { ...e, status: nextStatus(stOf(e)), done: undefined };
        }) } : d) }));
  // Activities are a simple two-state toggle: not started ⇄ done (no "active")
  const cycleActivityStatus = (dayId, evId, actId) =>
    update(t => ({ days:(t.days||[]).map(d => d.id===dayId
      ? { ...d, events:(d.events||[]).map(e => e.id===evId
          ? { ...e, activities:(e.activities||[]).map(a => {
              if (a.id!==actId) return a;
              if (myId) { const cur=memStOf(a, myId); return { ...a, memberStatus:{ ...(a.memberStatus||{}), [myId]: cur==='done'?'todo':'done' } }; }
              return { ...a, status: stOf(a)==='done' ? 'todo' : 'done', done: undefined };
            }) } : e) } : d) }));

  // Renders an editable text span; clicking turns it into an input (Enter/blur saves, Esc cancels)
  const Editable = ({ kind, ids, value, placeholder, spanStyle, inputWidth, inputType }) => {
    const active = editing && editKey(editing) === editKey({ kind, ...ids });
    if (active) {
      return (
        <input
          type={inputType||'text'}
          autoFocus
          value={editVal}
          onChange={e=>setEditVal(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); commitEdit(); } if(e.key==='Escape'){ cancelEdit(); } }}
          onBlur={commitEdit}
          style={{ font:'inherit', fontSize:13, padding:'2px 6px', border:'1px solid #C8B09A', borderRadius:5, background:'#F0EBE0', color:'#6E1A10', outline:'none', width:inputWidth||160, boxSizing:'border-box' }}
        />
      );
    }
    return (
      <span
        onClick={()=>startEdit(kind, ids, value)}
        title="Click to edit"
        style={{ cursor:'text', borderBottom:'1px dashed transparent', ...spanStyle, ...(value? {} : { color:'#C0A090', fontStyle:'italic' }) }}
        onMouseEnter={e=>{ e.currentTarget.style.borderBottom='1px dashed #C8A090'; }}
        onMouseLeave={e=>{ e.currentTarget.style.borderBottom='1px dashed transparent'; }}
      >{value || placeholder}</span>
    );
  };

  const addDay = () => {
    if (!dayForm.date) return;
    update({ days: [...(trip.days||[]), { id:uid(), date:dayForm.date, label:dayForm.label, events:[] }].sort((a,b)=>a.date>b.date?1:-1) });
    setShowDay(false); setDayForm({ date:"", label:"" });
  };

  const delDay = (id) => update({ days: (trip.days||[]).filter(d=>d.id!==id) });

  const blankForm = { duration:"single", type:"Activity", time:"", endTime:"", title:"", location:"", from:"", to:"", mode:"By Road", flightNo:"", category:"Sightseeing", notes:"", startDate:"", startTime:"", endDate:"", spanEndTime:"", expAmount:"", expCat:"Food", expTraveler:"" };
  const closeModal = () => { setShowEvent(null); setEvForm(blankForm); };
  // Open "add" modal from a day; prefill span dates to that day + default the optional expense to the current traveler
  const openAddEvent = (day) => {
    const defTrav = (myId && members.some(m => m.userId === myId)) ? myId : (members[0] ? members[0].userId : '');
    setEvForm({ ...blankForm, startDate:day.date, endDate:day.date, expTraveler:defTrav });
    setEstimateMsg('');
    setShowEvent(day.id);
  };
  // Estimate driving time From→To and fill in the arrival date/time (By Road)
  const autoFillArrival = async () => {
    const f = evForm;
    if (!f.from || !f.to) { setEstimateMsg('Enter both From and To first.'); return; }
    if (!f.startTime) { setEstimateMsg('Enter the depart time first.'); return; }
    setEstimating(true); setEstimateMsg('Calculating route…');
    const route = await roadRoute(f.from, f.to);
    setEstimating(false);
    if (!route) { setEstimateMsg('Could not find a driving route for those places. Check the spellings.'); return; }
    const arr = addSeconds(f.startDate, f.startTime, route.seconds);
    if (!arr) { setEstimateMsg('Could not compute the arrival time.'); return; }
    setEvForm(prev => ({ ...prev, spanEndTime: arr.time, ...(prev.duration === 'multi' ? { endDate: arr.date } : {}) }));
    const h = Math.floor(route.seconds / 3600), mn = Math.round((route.seconds % 3600) / 60);
    const km = Math.round(route.meters / 1000);
    const nextDay = f.duration === 'single' && arr.date !== f.startDate;
    setEstimateMsg(`≈ ${h}h ${mn}m · ${km} km${nextDay ? ' — arrives next day, switch to Multi-day' : ''}`);
  };
  // Optional expense entered in the add popup → an expense object tagged to the new item (or null)
  const expenseFromForm = (itemId) => evForm.expAmount
    ? { id:uid(), desc:"", amount:evForm.expAmount, category:evForm.expCat, eventId:itemId, travelerId:evForm.expTraveler }
    : null;

  const addEvent = (dayId) => {
    // Multi-day (any type) and single-day Travel are stored as spans; single-day Activity is a timed event
    if (evForm.duration === 'multi' || evForm.type === 'Travel') { submitSpan(); return; }
    if (!evForm.title || !evForm.time || !evForm.endTime) {
      alert('Please fill in Title, Start Time and End Time.');
      return;
    }
    const newEvent = { id:uid(), time:evForm.time, endTime:evForm.endTime, title:evForm.title, location:evForm.location, category:evForm.category, notes:evForm.notes, activities:[], docs:[] };
    const exp = expenseFromForm(newEvent.id);
    update(t => ({
      days:(t.days||[]).map(d => d.id===dayId ? { ...d, events:[...(d.events||[]), newEvent].sort((a,b)=>a.time>b.time?1:-1) } : d),
      ...(exp ? { expenses:[...(t.expenses||[]), exp] } : {}),
    }));
    closeModal();
  };

  // ── Multi-day spans (accommodation / travel) ──
  const submitSpan = () => {
    const f = evForm;
    if (!f.title || !f.startDate || !f.endDate) { alert('Please fill in Title, start date and end date.'); return; }
    if (f.endDate < f.startDate) { alert('The end date must be on or after the start date.'); return; }
    if (f.type === 'Travel') {
      if (f.mode === 'By Air') { if (!f.flightNo) { alert('Please enter the flight number.'); return; } }
      else if (!f.from || !f.to) { alert('Please fill in the From and To locations.'); return; }
    }
    const endDate = f.duration === 'single' ? f.startDate : f.endDate; // single-day travel stays same-day
    const fields = { type:f.type, title:f.title, location:f.location, from:f.from, to:f.to, mode:f.mode, flightNo:f.flightNo, notes:f.notes, startDate:f.startDate, startTime:f.startTime, endDate, endTime:f.spanEndTime };
    const span = { id:uid(), ...fields, dayStatus:{}, docs:[] };
    const exp = expenseFromForm(span.id);
    update(t => ({
      spans:[...(t.spans||[]), span],
      ...(exp ? { expenses:[...(t.expenses||[]), exp] } : {}),
    }));
    closeModal();
  };
  const delSpan = (id) => {
    const s = (trip.spans||[]).find(x=>x.id===id);
    if (s && s.docs) s.docs.forEach(d => d.url && deleteFromStorage(d.url));
    update(t => ({ spans:(t.spans||[]).filter(x=>x.id!==id), expenses:(t.expenses||[]).filter(e => e.eventId !== id) }));
  };
  const cycleSpanStatus = (id, dayISO) =>
    update(t => ({ spans:(t.spans||[]).map(s => {
      if (s.id !== id) return s;
      if (myId) { const mds = { ...(s.memberDayStatus||{}) }; mds[myId] = { ...(mds[myId]||{}), [dayISO]: nextStatus(spanMemStOf(s, myId, dayISO)) }; return { ...s, memberDayStatus: mds }; }
      return { ...s, dayStatus: { ...(s.dayStatus||{}), [dayISO]: nextStatus(spanStOf(s, dayISO)) } };
    }) }));
  const attachSpanDoc = async (id, file) => {
    let doc;
    try { const url = await uploadToStorage(file, 'docs'); doc = { id:uid(), name:file.name, size:file.size, type:file.type, url }; }
    catch(err) { alert('Could not upload "' + file.name + '". ' + err.message); return; }
    update(t => ({ spans:(t.spans||[]).map(s => s.id===id ? { ...s, docs:[...(s.docs||[]), doc] } : s) }));
  };
  const delSpanDoc = (id, docId) => {
    const s = (trip.spans||[]).find(x=>x.id===id);
    const d = s && (s.docs||[]).find(x=>x.id===docId);
    if (d && d.url) deleteFromStorage(d.url);
    update({ spans:(trip.spans||[]).map(x => x.id===id ? { ...x, docs:(x.docs||[]).filter(dd=>dd.id!==docId) } : x) });
  };

  const delEvent = (dayId, evId) => {
    update(t => ({
      days:(t.days||[]).map(d => d.id===dayId ? { ...d, events:(d.events||[]).filter(e=>e.id!==evId) } : d),
      expenses:(t.expenses||[]).filter(e => e.eventId !== evId), // drop expenses logged against this event
    }));
  };

  // Add a text activity to an event
  const addActivity = (dayId, evId) => {
    const text = (activityInput[evId]||'').trim();
    if (!text) return;
    const days = (trip.days||[]).map(d => d.id===dayId
      ? { ...d, events:(d.events||[]).map(e => e.id===evId
          ? { ...e, activities:[...(e.activities||[]), { id:uid(), text }] }
          : e) }
      : d);
    update({ days });
    setActivityInput(prev => ({ ...prev, [evId]: '' }));
    setAddingActivityFor(null);
  };

  // Assign travelers to an event / task / span ([] = everyone)
  const setEventAssignees = (dayId, evId, list) =>
    update(t => ({ days:(t.days||[]).map(d => d.id===dayId ? { ...d, events:(d.events||[]).map(e => e.id===evId ? { ...e, assignees:list } : e) } : d) }));
  const setSpanAssignees = (spanId, list) =>
    update(t => ({ spans:(t.spans||[]).map(s => s.id===spanId ? { ...s, assignees:list } : s) }));
  const setTaskAssignees = (dayId, evId, actId, list) =>
    update(t => ({ days:(t.days||[]).map(d => d.id===dayId ? { ...d, events:(d.events||[]).map(e => e.id===evId
      ? { ...e, activities:(e.activities||[]).map(a => a.id===actId ? { ...a, assignees:list } : a) } : e) } : d) }));

  const delActivity = (dayId, evId, actId) => {
    const days = (trip.days||[]).map(d => d.id===dayId
      ? { ...d, events:(d.events||[]).map(e => e.id===evId
          ? { ...e, activities:(e.activities||[]).filter(a=>a.id!==actId) }
          : e) }
      : d);
    update({ days });
  };

  // Attach a document (file) to an event or activity — uploads to Supabase Storage
  const attachDoc = async (dayId, evId, actId, file) => {
    let doc;
    try {
      const url = await uploadToStorage(file, 'docs');
      doc = { id:uid(), name:file.name, size:file.size, type:file.type, url };
    } catch(err) {
      alert('Could not upload "' + file.name + '". ' + err.message);
      return;
    }
    update(t => {
      const days = (t.days||[]).map(d => d.id===dayId
        ? { ...d, events:(d.events||[]).map(e => {
            if (e.id !== evId) return e;
            if (actId) {
              // attach to activity
              return { ...e, activities:(e.activities||[]).map(a => a.id===actId
                ? { ...a, docs:[...(a.docs||[]), doc] }
                : a) };
            } else {
              // attach to event
              return { ...e, docs:[...(e.docs||[]), doc] };
            }
          }) }
        : d);
      return { days };
    });
  };

  const delDoc = (dayId, evId, actId, docId) => {
    // best-effort remove the stored file
    const _day = (trip.days||[]).find(d=>d.id===dayId);
    const _ev = _day && (_day.events||[]).find(e=>e.id===evId);
    const _list = _ev ? (actId ? (((_ev.activities||[]).find(a=>a.id===actId)||{}).docs||[]) : (_ev.docs||[])) : [];
    const _target = _list.find(x=>x.id===docId);
    if (_target && _target.url) deleteFromStorage(_target.url);
    const days = (trip.days||[]).map(d => d.id===dayId
      ? { ...d, events:(d.events||[]).map(e => {
          if (e.id !== evId) return e;
          if (actId) {
            return { ...e, activities:(e.activities||[]).map(a => a.id===actId
              ? { ...a, docs:(a.docs||[]).filter(doc=>doc.id!==docId) }
              : a) };
          } else {
            return { ...e, docs:(e.docs||[]).filter(doc=>doc.id!==docId) };
          }
        }) }
      : d);
    update({ days });
  };

  const fmtSize = (bytes) => bytes < 1024 ? bytes+'B' : bytes < 1048576 ? (bytes/1024).toFixed(1)+'KB' : (bytes/1048576).toFixed(1)+'MB';

  // Reusable doc attachment row
  function DocList({ docs=[], onAdd, onDel }) {
  const [preview, setPreview] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);

  function openPreview(doc) {
    // Files in Storage are served by URL directly; only legacy base64 needs Blob conversion
    if (doc.url) { setBlobUrl(null); setPreview(doc); return; }
    // Convert base64 data URI to Blob URL for reliable in-browser preview
    try {
      const arr = doc.data.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const blob = new Blob([u8arr], { type: mime });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch(e) {
      setBlobUrl(null);
    }
    setPreview(doc);
  }

  function closePreview() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setPreview(null);
  }

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const srcOf = doc => doc.url || doc.data;
  const isPdf = doc => doc.name && doc.name.toLowerCase().endsWith('.pdf');
  const isImage = doc => (doc.type && doc.type.startsWith('image')) || (doc.data && doc.data.startsWith('data:image')) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(doc.name||'');

  return (
    <div style={{ marginTop:6 }}>
      {docs.map(doc => (
        <div key={doc.id} style={{ display:'flex',alignItems:'center',gap:6,padding:'3px 0',borderBottom:'1px solid #E8E2D4' }}>
          <span style={{ fontSize:14 }}>📎</span>
          <span onClick={()=>openPreview(doc)} style={{ fontSize:12,color:'#8B2A14',textDecoration:'underline',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'pointer' }}>{doc.name}</span>
          <span style={{ fontSize:11,color:'#C05040',flexShrink:0 }}>{fmtSize(doc.size)}</span>
          {onDel && <button onClick={()=>onDel(doc.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#C04428',fontSize:13,padding:'0 2px',lineHeight:1 }}>✕</button>}
        </div>
      ))}

      {preview && (
        <div onClick={closePreview}
          style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px' }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:'#fff',borderRadius:12,overflow:'hidden',boxShadow:'0 8px 40px rgba(0,0,0,0.5)',display:'flex',flexDirection:'column',maxWidth:'90vw',maxHeight:'90vh',minWidth:'320px' }}>
            {/* Header */}
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'#3D0C02',color:'#fff' }}>
              <span style={{ fontFamily:"var(--font-body)",fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60vw' }}>{preview.name}</span>
              <div style={{ display:'flex',gap:8,flexShrink:0 }}>
                <a href={srcOf(preview)} download={preview.name}
                  style={{ fontSize:12,padding:'4px 12px',borderRadius:6,background:'rgba(255,255,255,0.15)',color:'#fff',textDecoration:'none',fontFamily:"var(--font-body)",cursor:'pointer' }}>
                  ⬇ Download
                </a>
                <button onClick={closePreview}
                  style={{ background:'rgba(255,255,255,0.15)',border:'none',borderRadius:6,color:'#fff',cursor:'pointer',fontSize:16,width:28,height:28,lineHeight:'28px',textAlign:'center',padding:0 }}>×</button>
              </div>
            </div>
            {/* Preview pane */}
            <div style={{ flex:1,overflow:'auto',background:'#F5F0E8',display:'flex',alignItems:'center',justifyContent:'center',minHeight:'300px' }}>
              {isPdf(preview) ? (
                <div style={{ width:'80vw',height:'75vh',maxWidth:'900px',display:'flex',flexDirection:'column',overflow:'hidden' }}>
                  {isMobile ? (
                    <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px',fontFamily:"var(--font-body)",color:'#6E1A10',gap:16 }}>
                      <div style={{ fontSize:48 }}>📄</div>
                      <p style={{ fontSize:14,margin:0,textAlign:'center' }}>{preview.name}</p>
                      <button onClick={()=>{
                        if(preview.url){window.open(preview.url,'_blank');return;}
                        try{
                          const arr=preview.data.split(','),mime=arr[0].match(/:(.*?);/)[1],bstr=atob(arr[1]),u8=new Uint8Array(bstr.length);
                          for(let i=0;i<bstr.length;i++)u8[i]=bstr.charCodeAt(i);
                          const url=URL.createObjectURL(new Blob([u8],{type:mime}));
                          window.open(url,'_blank');
                          setTimeout(()=>URL.revokeObjectURL(url),10000);
                        }catch(e){window.open(srcOf(preview),'_blank');}
                      }}
                        style={{ background:'#3D0C02',color:'#fff',padding:'10px 24px',borderRadius:8,border:'none',fontSize:13,fontWeight:600,cursor:'pointer' }}>
                        🔗 Open PDF
                      </button>
                      <a href={srcOf(preview)} download={preview.name}
                        style={{ background:'rgba(61,12,2,0.12)',color:'#3D0C02',padding:'8px 20px',borderRadius:8,textDecoration:'none',fontSize:13 }}>
                        ⬇ Download
                      </a>
                    </div>
                  ) : (
                    <object data={blobUrl || srcOf(preview)} type="application/pdf"
                      style={{ width:'100%',height:'100%',border:'none' }}>
                      <div style={{ textAlign:'center',padding:'40px',fontFamily:"var(--font-body)",color:'#6E1A10' }}>
                        <div style={{ fontSize:32,marginBottom:12 }}>📄</div>
                        <p style={{ fontSize:14,marginBottom:16 }}>Your browser cannot preview this PDF inline.</p>
                        <a href={srcOf(preview)} download={preview.name}
                          style={{ background:'#3D0C02',color:'#fff',padding:'8px 20px',borderRadius:8,textDecoration:'none',fontSize:13 }}>
                          ⬇ Download to View
                        </a>
                      </div>
                    </object>
                  )}
                </div>
              ) : isImage(preview) ? (
                <img src={srcOf(preview)} alt={preview.name}
                  style={{ maxWidth:'85vw',maxHeight:'75vh',objectFit:'contain',display:'block' }} />
              ) : (
                <div style={{ textAlign:'center',padding:'40px',fontFamily:"var(--font-body)",color:'#6E1A10' }}>
                  <div style={{ fontSize:48,marginBottom:12 }}>📄</div>
                  <p style={{ fontSize:14,marginBottom:16 }}>Preview not available for this file type.</p>
                  <a href={srcOf(preview)} download={preview.name}
                    style={{ background:'#3D0C02',color:'#fff',padding:'8px 20px',borderRadius:8,textDecoration:'none',fontSize:13,fontFamily:"var(--font-body)" }}>
                    ⬇ Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



  // Merge spans + events for a day and sort chronologically by start time (all-day/mid-span items first)
  const mergedDayItems = (day) => {
    const spanT = (s) => day.date === s.startDate ? (s.startTime || '') : day.date === s.endDate ? (s.endTime || '') : '';
    const items = [
      ...spansOnDay(trip, day.date).map(s => ({ kind:'span', s, t: spanT(s) })),
      ...(day.events || []).map(ev => ({ kind:'event', ev, t: ev.time || '' })),
    ];
    return items.sort((a, b) => (!a.t && !b.t) ? 0 : !a.t ? -1 : !b.t ? 1 : (a.t > b.t ? 1 : a.t < b.t ? -1 : 0));
  };

  // ── Multi-day span strip (hotel / travel) ──
  const renderSpanStrip = (day, s) => (
    <div key={s.id} style={{ padding:"9px 14px",borderTop:"1px solid #D4BFB0",background:"#F3ECDA" }}>
      <div style={{ display:"flex",alignItems:"flex-start",gap:8 }}>
        <StatusBox status={spStatus(s, day.date)} onClick={()=>cycleSpanStatus(s.id, day.date)} size={16} style={{ marginRight:0 }} />
        <span style={{ fontSize:17,lineHeight:1.2,flexShrink:0 }}>{spanIcon(s)}</span>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
            <span style={{ opacity: spStatus(s, day.date)==='done'?0.55:1, textDecoration: spStatus(s, day.date)==='done'?"line-through":"none" }}>
              {Editable({ kind:'span', ids:{ dayId:day.id, evId:s.id }, value:s.title, placeholder:'(untitled)', spanStyle:{ fontSize:13,fontWeight:700,color:'#6E1A10' }, inputWidth:200 })}
            </span>
            <span style={{ fontSize:11,background:"#E4D3B4",borderRadius:4,padding:"1px 6px",color:"#7A4A1A",fontWeight:600 }}>{s.type}</span>
          </div>
          <div style={{ fontSize:11.5,color:'#9A6A2A',fontWeight:700,marginTop:3,textTransform:'uppercase',letterSpacing:'0.04em' }}>{spanSegLabel(s, day.date)}</div>
          {spanLocationText(s) && <div style={{ fontSize:12,color:"#A83020",marginTop:2 }}>📍 {spanLocationText(s)}</div>}
          {s.notes && <div style={{ fontSize:12,color:"#C05040",marginTop:2 }}>{s.notes}</div>}
          <div style={{ fontSize:10.5,color:'#B0967A',marginTop:3 }}>
            {fmtDate(s.startDate)}{s.startTime?` · ${s.startTime}`:''} → {fmtDate(s.endDate)}{s.endTime?` · ${s.endTime}`:''}
          </div>
          {canEdit && <Assignees members={members} value={s.assignees} onChange={(list)=>setSpanAssignees(s.id, list)} />}
          <DocList docs={s.docs||[]} onAdd={(file)=>attachSpanDoc(s.id,file)} onDel={canEdit ? (docId)=>delSpanDoc(s.id,docId) : null} />
          <button onClick={()=>openExpense(s.id)}
            style={{ marginTop:8, background:'none', border:'1px dashed #C8B09A', borderRadius:6, padding:'3px 10px', fontSize:12, color:'#8B2A14', cursor:'pointer', fontWeight:500 }}>
            + Expense
          </button>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:8 }}>
          <span style={{ width:54,display:"flex",justifyContent:"flex-end" }}><StatusBadge status={spStatus(s, day.date)} /></span>
          {canEdit && (<>
          <label title="Attach document" style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,cursor:'pointer',color:'#8B2A14',background:'rgba(139,42,20,0.08)',flexShrink:0 }}>
            <span style={{ fontSize:15, lineHeight:1 }}>📎</span>
            <input type="file" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) attachSpanDoc(s.id,e.target.files[0]); e.target.value=''; }} />
          </label>
          <button title="Delete" onClick={()=>delSpan(s.id)} style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,border:'none',cursor:'pointer',color:'#8B2A14',background:'#F5E0D8',fontSize:13,lineHeight:1,flexShrink:0 }}>✕</button>
          </>)}
        </div>
      </div>
    </div>
  );

  // ── Single-day timed event block ──
  const renderEventBlock = (day, ev) => (
    <div key={ev.id} style={{ padding:"10px 14px",borderTop:"1px solid #D4BFB0" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
        <StatusBox status={evStatus(ev)} onClick={()=>cycleEventStatus(day.id,ev.id)} size={16} style={{ marginRight:8 }} />
        <div style={{ flex:1 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
            <span style={{ fontSize:12,color:"#B54030",fontWeight:600,display:"inline-flex",alignItems:"center",gap:4 }}>
              {Editable({ kind:'startTime', ids:{ dayId:day.id, evId:ev.id }, value:ev.time, placeholder:'--:--', spanStyle:{ fontSize:12,color:'#B54030',fontWeight:600 }, inputType:'time', inputWidth:108 })}
              <span style={{ color:'#C8A090' }}>–</span>
              {Editable({ kind:'endTime', ids:{ dayId:day.id, evId:ev.id }, value:ev.endTime, placeholder:'--:--', spanStyle:{ fontSize:12,color:'#B54030',fontWeight:600 }, inputType:'time', inputWidth:108 })}
            </span>
            <span style={{ opacity: evStatus(ev)==='done'?0.55:1, textDecoration: evStatus(ev)==='done'?"line-through":"none" }}>
              {Editable({ kind:'event', ids:{ dayId:day.id, evId:ev.id }, value:ev.title, placeholder:'(untitled)', spanStyle:{ fontSize:13, fontWeight:500 }, inputWidth:200 })}
            </span>
            <span style={{ fontSize:11,background:"#DDD8CB",borderRadius:4,padding:"1px 6px",color:"#8B2A14" }}>{ev.category}</span>
          </div>
          {ev.location && <div style={{ fontSize:12,color:"#A83020",marginTop:2 }}>📍 {ev.location}</div>}
          {ev.notes && <div style={{ fontSize:12,color:"#C05040",marginTop:2 }}>{ev.notes}</div>}
          {canEdit && <Assignees members={members} value={ev.assignees} onChange={(list)=>setEventAssignees(day.id, ev.id, list)} />}
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:8 }}>
          <span style={{ width:54,display:"flex",justifyContent:"flex-end" }}><StatusBadge status={evStatus(ev)} /></span>
          {canEdit && (<>
          <label title="Attach document" style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,cursor:'pointer',color:'#8B2A14',background:'rgba(139,42,20,0.08)',flexShrink:0 }}>
            <span style={{ fontSize:15, lineHeight:1 }}>📎</span>
            <input type="file" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) attachDoc(day.id,ev.id,null,e.target.files[0]); e.target.value=''; }} />
          </label>
          <button title="Delete event" onClick={()=>delEvent(day.id,ev.id)} style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,border:'none',cursor:'pointer',color:'#8B2A14',background:'#F5E0D8',fontSize:13,lineHeight:1,flexShrink:0 }}>✕</button>
          </>)}
        </div>
      </div>

      <DocList docs={ev.docs||[]} onAdd={(file)=>attachDoc(day.id,ev.id,null,file)} onDel={canEdit ? (docId)=>delDoc(day.id,ev.id,null,docId) : null} />

      {(ev.activities||[]).length > 0 && (
        <div style={{ marginTop:10,paddingLeft:12,borderLeft:"2px solid #D4BFB0" }}>
          {(ev.activities||[]).map(act => (
            <div key={act.id} style={{ marginBottom:6 }}>
              <div style={{ display:"flex",alignItems:"flex-start",gap:6 }}>
                <StatusBox status={evStatus(act)} onClick={()=>cycleActivityStatus(day.id,ev.id,act.id)} size={14} style={{ marginTop:2 }} />
                <div style={{ flex:1 }}>
                  <span style={{ display:"inline-block", opacity: evStatus(act)==='done'?0.55:1, textDecoration: evStatus(act)==='done'?"line-through":"none" }}>
                    {Editable({ kind:'activity', ids:{ dayId:day.id, evId:ev.id, actId:act.id }, value:act.text, placeholder:'(empty)', spanStyle:{ fontSize:13, color:'#6E1A10' }, inputWidth:240 })}
                  </span>
                  <DocList docs={act.docs||[]} onAdd={(file)=>attachDoc(day.id,ev.id,act.id,file)} onDel={canEdit ? (docId)=>delDoc(day.id,ev.id,act.id,docId) : null} />
                  {canEdit && <Assignees members={members} value={act.assignees} onChange={(list)=>setTaskAssignees(day.id, ev.id, act.id, list)} />}
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:8 }}>
                  <span style={{ width:54,display:"flex",justifyContent:"flex-end" }}><StatusBadge status={evStatus(act)} /></span>
                  {canEdit && (<>
                  <label title="Attach document" style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,cursor:'pointer',color:'#8B2A14',background:'rgba(139,42,20,0.08)',flexShrink:0 }}>
                    <span style={{ fontSize:15, lineHeight:1 }}>📎</span>
                    <input type="file" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) attachDoc(day.id,ev.id,act.id,e.target.files[0]); e.target.value=''; }} />
                  </label>
                  <button title="Delete task" onClick={()=>delActivity(day.id,ev.id,act.id)} style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,border:'none',cursor:'pointer',color:'#8B2A14',background:'#F5E0D8',fontSize:13,lineHeight:1,flexShrink:0 }}>✕</button>
                  </>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {addingActivityFor === ev.id ? (
        <div style={{ display:'flex',gap:6,marginTop:8,alignItems:'center' }}>
          <input autoFocus placeholder="Describe the task…" value={activityInput[ev.id]||''}
            onChange={e=>setActivityInput(prev=>({...prev,[ev.id]:e.target.value}))}
            onKeyDown={e=>{ if(e.key==='Enter') addActivity(day.id,ev.id); if(e.key==='Escape') setAddingActivityFor(null); }}
            style={{ flex:1,padding:'5px 9px',border:'1px solid #C8B09A',borderRadius:6,fontSize:13,background:'#F0EBE0',color:'#6E1A10',outline:'none' }} />
          <Btn style={{ padding:'4px 10px',fontSize:12 }} onClick={()=>addActivity(day.id,ev.id)}>Add</Btn>
          <Btn variant="ghost" style={{ padding:'4px 8px',fontSize:12 }} onClick={()=>setAddingActivityFor(null)}>Cancel</Btn>
        </div>
      ) : (
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          {canEdit && <button onClick={()=>setAddingActivityFor(ev.id)} style={{ background:'none',border:'1px dashed #C8B09A',borderRadius:6,padding:'3px 10px',fontSize:12,color:'#8B2A14',cursor:'pointer',fontWeight:500 }}>+ Task</button>}
          <button onClick={()=>openExpense(ev.id)} style={{ background:'none',border:'1px dashed #C8B09A',borderRadius:6,padding:'3px 10px',fontSize:12,color:'#8B2A14',cursor:'pointer',fontWeight:500 }}>+ Expense</button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ position:"sticky", top:"calc(env(safe-area-inset-top, 0px) + 51px)", zIndex:15, background:"#F0EBE0", margin:"0 -20px 16px", padding:"6px 20px 10px", borderBottom:"2px solid #C4A882", display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <h2 style={{ margin:0,fontSize:16,fontWeight:700 }}>Days</h2>
        {canEdit && <Btn onClick={()=>setShowDay(true)}>+ Add Day</Btn>}
      </div>

      {(!trip.days||trip.days.length===0) && (
        <p style={{ color:"#C05040",fontSize:13,textAlign:"center",padding:"24px 0" }}>No days added yet.</p>
      )}

      {(trip.days||[]).map(day => (
        <div key={day.id} style={{ marginBottom:16,border:"1px solid #D4BFB0",borderRadius:10,overflow:"hidden",background:"#EDE7D9" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"#DDD8CB" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span onClick={()=>toggleDayCollapse(day.id)} title={collapsedDays[day.id]?"Expand day":"Collapse day"}
                style={{ cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:11, color:"#8B2A14", display:"inline-block", transition:"transform .15s", transform: collapsedDays[day.id]?"rotate(-90deg)":"rotate(0deg)" }}>▼</span>
                <span style={{ display:"inline-flex", flexDirection:"column", alignItems:"center", lineHeight:1 }}>
                  <strong style={{ fontSize:22, fontWeight:800, color:"#8B2A14", lineHeight:1 }}>{compactDate(day.date).d}</strong>
                  <span style={{ fontSize:10, fontWeight:700, color:"#8B2A14", letterSpacing:"0.08em", marginTop:2 }}>{compactDate(day.date).mon}</span>
                </span>
              </span>
              <span>{Editable({ kind:'day', ids:{ dayId:day.id }, value:day.label, placeholder:'+ add label', spanStyle:{ fontSize:13, color:'#8B2A14' }, inputWidth:160 })}</span>
            </div>
            {canEdit && (
            <div style={{ display:"flex",gap:6 }}>
              <Btn onClick={()=>openAddEvent(day)} style={{ padding:"4px 10px",fontSize:12 }}>+ Event</Btn>
              <Btn variant="danger" style={{ padding:"4px 8px",fontSize:12 }} onClick={()=>delDay(day.id)}>✕</Btn>
            </div>
            )}
          </div>

          {!collapsedDays[day.id] && (<>
          {(!day.events||day.events.length===0) && spansOnDay(trip, day.date).length===0 && (
            <p style={{ color:"#C05040",fontSize:13,padding:"10px 14px",margin:0 }}>No events</p>
          )}

          {/* ── Events, tasks & spans interleaved chronologically by start time ── */}
          {mergedDayItems(day).map(it => it.kind === 'span' ? renderSpanStrip(day, it.s) : renderEventBlock(day, it.ev))}

          </>)}
        </div>
      ))}

      {expenseFor && (
        <Modal title="Log Expense" onClose={()=>setExpenseFor(null)}>
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1 }}><Input label="Amount *" type="number" value={expForm.amount} onChange={e=>setExpForm({...expForm,amount:e.target.value})} placeholder="0.00" /></div>
            <div style={{ flex:1.2 }}><Select label="Category" options={BUDGET_CATS} value={expForm.category} onChange={e=>setExpForm({...expForm,category:e.target.value})} /></div>
          </div>
          {members.length > 0 && (
            <Select label="Traveler" value={expForm.travelerId} onChange={e=>setExpForm({...expForm,travelerId:e.target.value})}
              options={['', ...members.map(m=>m.userId)]} renderOption={o => o==='' ? '— shared —' : (nameOfTraveler(o)||o)} />
          )}
          <Input label="Description" value={expForm.desc} onChange={e=>setExpForm({...expForm,desc:e.target.value})} placeholder="e.g. Lunch, taxi, tickets…" />
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end",marginTop:8 }}>
            <Btn variant="ghost" onClick={()=>setExpenseFor(null)}>Cancel</Btn>
            <Btn onClick={addEventExpense}>Add</Btn>
          </div>
        </Modal>
      )}

      {showDay && (
        <Modal title="Add Day" onClose={()=>setShowDay(false)}>
          <Input label="Date" type="date" value={dayForm.date} onChange={e=>setDayForm({...dayForm,date:e.target.value})} />
          <Input label="Label (optional)" value={dayForm.label} onChange={e=>setDayForm({...dayForm,label:e.target.value})} placeholder="e.g. Travel Day" />
          <div style={{ display:"flex",gap:8,marginTop:8 }}>
            <Btn onClick={addDay}>Add Day</Btn>
            <Btn variant="ghost" onClick={()=>setShowDay(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {showEvent && (
        <Modal title="Add to Itinerary" onClose={closeModal}>
          <Select label="Duration" value={evForm.duration}
            onChange={e=>{ const dur=e.target.value; setEvForm({...evForm, duration:dur, type: dur==='single' ? 'Activity' : 'Accommodation'}); }}
            options={["single","multi"]}
            renderOption={o => o==='single' ? 'Single day' : 'Multi-day'} />

          <Select label="Type" value={evForm.type}
            onChange={e=>setEvForm({...evForm, type:e.target.value})}
            options={evForm.duration==='single' ? ["Activity","Travel"] : SPAN_TYPE_OPTIONS} />

          {evForm.type === 'Activity' ? (
            // ── Single-day timed activity ──
            <>
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}>
                  <Input label="Start Time *" type="time" value={evForm.time} onChange={e=>setEvForm({...evForm,time:e.target.value})} />
                </div>
                <div style={{ flex:1 }}>
                  <Input label="End Time *" type="time" value={evForm.endTime} onChange={e=>setEvForm({...evForm,endTime:e.target.value})} />
                </div>
              </div>
              <Input label="Title *" value={evForm.title} onChange={e=>setEvForm({...evForm,title:e.target.value})} placeholder="e.g. Visit Kedarnath" />
              <Input label="Location" value={evForm.location} onChange={e=>setEvForm({...evForm,location:e.target.value})} placeholder="e.g. Kedarnath Temple" />
              <Select label="Category" value={evForm.category} onChange={e=>setEvForm({...evForm,category:e.target.value})}
                options={["Sightseeing","Transport","Food","Accommodation","Activity","Other"]} />
              <Input label="Notes" value={evForm.notes} onChange={e=>setEvForm({...evForm,notes:e.target.value})} placeholder="Any notes…" />
              {expenseFields}
              <div style={{ display:"flex",gap:8,marginTop:8 }}>
                <Btn onClick={()=>addEvent(showEvent)}>Add Event</Btn>
                <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
              </div>
            </>
          ) : evForm.type === 'Travel' ? (
            // ── Travel (single- or multi-day): By Road → Google Maps, By Air → Flightradar24 ──
            <>
              <Select label="Mode" value={evForm.mode} onChange={e=>setEvForm({...evForm,mode:e.target.value})} options={TRAVEL_MODES} />
              <Input label="Title *" value={evForm.title} onChange={e=>setEvForm({...evForm,title:e.target.value})}
                placeholder={evForm.mode==='By Air' ? 'e.g. AI 865  Delhi → Dubai' : 'e.g. Drive Dehradun → Kedarnath'} />
              {evForm.mode === 'By Air' && (
                <Input label="Flight No. *" value={evForm.flightNo} onChange={e=>setEvForm({...evForm,flightNo:e.target.value})} placeholder="e.g. AI 865" />
              )}
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}><Input label={evForm.mode==='By Air' ? 'From' : 'From *'} value={evForm.from} onChange={e=>setEvForm({...evForm,from:e.target.value})} placeholder={evForm.mode==='By Air' ? 'e.g. Delhi (DEL)' : 'e.g. Dehradun'} /></div>
                <div style={{ flex:1 }}><Input label={evForm.mode==='By Air' ? 'To' : 'To *'} value={evForm.to} onChange={e=>setEvForm({...evForm,to:e.target.value})} placeholder={evForm.mode==='By Air' ? 'e.g. Dubai (DXB)' : 'e.g. Kedarnath'} /></div>
              </div>
              {evForm.duration === 'multi' ? (
                <>
                  <div style={{ display:"flex", gap:10 }}>
                    <div style={{ flex:1.4 }}><Input label="Depart date *" type="date" value={evForm.startDate} onChange={e=>setEvForm({...evForm,startDate:e.target.value})} /></div>
                    <div style={{ flex:1 }}><Input label="Depart time" type="time" value={evForm.startTime} onChange={e=>setEvForm({...evForm,startTime:e.target.value})} /></div>
                  </div>
                  <div style={{ display:"flex", gap:10 }}>
                    <div style={{ flex:1.4 }}><Input label="Arrive date *" type="date" value={evForm.endDate} onChange={e=>setEvForm({...evForm,endDate:e.target.value})} /></div>
                    <div style={{ flex:1 }}><Input label="Arrive time" type="time" value={evForm.spanEndTime} onChange={e=>setEvForm({...evForm,spanEndTime:e.target.value})} /></div>
                  </div>
                </>
              ) : (
                <div style={{ display:"flex", gap:10 }}>
                  <div style={{ flex:1 }}><Input label="Depart time" type="time" value={evForm.startTime} onChange={e=>setEvForm({...evForm,startTime:e.target.value})} /></div>
                  <div style={{ flex:1 }}><Input label="Arrive time" type="time" value={evForm.spanEndTime} onChange={e=>setEvForm({...evForm,spanEndTime:e.target.value})} /></div>
                </div>
              )}
              {evForm.mode === 'By Road' && (
                <div style={{ marginTop:-4, marginBottom:12 }}>
                  <button type="button" onClick={autoFillArrival} disabled={estimating}
                    style={{ background:'none', border:'1px dashed #C8B09A', borderRadius:6, padding:'4px 12px', fontSize:12, color:'#8B2A14', cursor:'pointer', fontWeight:500, opacity: estimating?0.6:1 }}>
                    ⟳ Auto-fill arrival from route
                  </button>
                  {estimateMsg && <div style={{ fontSize:11.5, color:'#8A7A6D', marginTop:6, lineHeight:1.4 }}>{estimateMsg}</div>}
                </div>
              )}
              <Input label="Notes" value={evForm.notes} onChange={e=>setEvForm({...evForm,notes:e.target.value})} placeholder="Vehicle, driver, PNR…" />
              {expenseFields}
              <div style={{ display:"flex",gap:8,marginTop:8 }}>
                <Btn onClick={submitSpan}>Add</Btn>
                <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
              </div>
            </>
          ) : (
            // ── Accommodation / Other (multi-day) ──
            <>
              {(() => { const m = SPAN_TYPES[evForm.type] || SPAN_TYPES.Other; return (
                <>
                  <Input label="Title *" value={evForm.title} onChange={e=>setEvForm({...evForm,title:e.target.value})}
                    placeholder={evForm.type==='Accommodation' ? 'e.g. Taj Hotel, Rishikesh' : 'e.g. Yoga retreat'} />
                  <div style={{ display:"flex", gap:10 }}>
                    <div style={{ flex:1.4 }}><Input label={`${m.startLabel} date *`} type="date" value={evForm.startDate} onChange={e=>setEvForm({...evForm,startDate:e.target.value})} /></div>
                    <div style={{ flex:1 }}><Input label={`${m.startLabel} time`} type="time" value={evForm.startTime} onChange={e=>setEvForm({...evForm,startTime:e.target.value})} /></div>
                  </div>
                  <div style={{ display:"flex", gap:10 }}>
                    <div style={{ flex:1.4 }}><Input label={`${m.endLabel} date *`} type="date" value={evForm.endDate} onChange={e=>setEvForm({...evForm,endDate:e.target.value})} /></div>
                    <div style={{ flex:1 }}><Input label={`${m.endLabel} time`} type="time" value={evForm.spanEndTime} onChange={e=>setEvForm({...evForm,spanEndTime:e.target.value})} /></div>
                  </div>
                  <Input label="Location" value={evForm.location} onChange={e=>setEvForm({...evForm,location:e.target.value})}
                    placeholder={evForm.type==='Accommodation' ? 'e.g. Laxman Jhula Rd' : 'Optional'} />
                  <Input label="Notes" value={evForm.notes} onChange={e=>setEvForm({...evForm,notes:e.target.value})} placeholder="Booking ref, room type…" />
                </>
              ); })()}
              {expenseFields}
              <div style={{ display:"flex",gap:8,marginTop:8 }}>
                <Btn onClick={submitSpan}>Add</Btn>
                <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function BudgetTab({ trip, update, session }) {
  const [showExp, setShowExp] = useState(false);
  const myId = session ? session.userId : null;
  const members = trip.members || [];
  const [form, setForm] = useState({ desc:"", amount:"", category:"Food", travelerId:"" });

  const expenses = trip.expenses || [];
  const total = expenses.reduce((s,e)=>s+parseFloat(e.amount||0),0);
  const budget = parseFloat(trip.budget||0);
  const cur = trip.currency || '$';

  const nameOf = (uid) => { const m = members.find(x => x.userId === uid); return m ? m.name : (uid || 'Shared'); };
  // event-title lookup so an expense can show which event it belongs to
  const evTitle = {};
  (trip.days||[]).forEach(d => (d.events||[]).forEach(ev => { evTitle[ev.id] = ev.title || 'event'; }));

  const openAdd = () => { setForm({ desc:"", amount:"", category:"Food", travelerId: (myId && members.some(m=>m.userId===myId)) ? myId : "" }); setShowExp(true); };
  const addExp = () => {
    if (!form.amount) { alert('Please enter an amount.'); return; }
    update({ expenses:[...expenses, { id:uid(), desc:form.desc, amount:form.amount, category:form.category, travelerId:form.travelerId }] });
    setShowExp(false); setForm({ desc:"", amount:"", category:"Food", travelerId:"" });
  };
  const delExp = (id) => update({ expenses: expenses.filter(e=>e.id!==id) });

  const bycat = BUDGET_CATS.map(c => ({
    cat:c, total:expenses.filter(e=>e.category===c).reduce((s,e)=>s+parseFloat(e.amount||0),0)
  })).filter(x=>x.total>0);

  // group spend by traveler (roster order first, then any other ids, then shared/unassigned)
  const travTotals = {};
  expenses.forEach(e => { const k = e.travelerId || '__shared__'; travTotals[k] = (travTotals[k]||0) + parseFloat(e.amount||0); });
  const bytrav = [
    ...members.filter(m => travTotals[m.userId]).map(m => ({ key:m.userId, label:m.name, total:travTotals[m.userId] })),
    ...Object.keys(travTotals).filter(k => k!=='__shared__' && !members.some(m=>m.userId===k)).map(k => ({ key:k, label:k, total:travTotals[k] })),
    ...(travTotals['__shared__'] ? [{ key:'__shared__', label:'Shared / unassigned', total:travTotals['__shared__'] }] : []),
  ];

  return (
    <div>
      <div style={{ background:"#EDE7D9",border:"1px solid #D4BFB0",borderRadius:10,padding:16,marginBottom:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
          <span style={{ fontWeight:700,fontSize:14,color:"#6E1A10" }}>Budget</span>
          <label style={{ display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#A83020" }}>
            Currency
            <select value={cur} onChange={e=>update({currency:e.target.value})}
              style={{ padding:"3px 6px",border:"1px solid #C8B09A",borderRadius:6,fontSize:13,background:"#F5EFE2",color:"#6E1A10" }}>
              {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
          <span style={{ fontSize:13,color:"#A83020" }}>Trip Budget</span>
          <input value={trip.budget||""} onChange={e=>update({budget:e.target.value})} placeholder="0.00" type="number"
            style={{ width:120,padding:"4px 8px",border:"1px solid #C8B09A",borderRadius:6,fontSize:14,textAlign:"right" }} />
        </div>
        <div style={{ display:"flex",justifyContent:"space-between" }}>
          <span style={{ fontSize:13,color:"#A83020" }}>Spent</span>
          <span style={{ fontWeight:600,color: budget&&total>budget?"#8B2A14":"#6E1A10" }}>{fmtMoney(total, cur)}</span>
        </div>
        {budget>0 && (
          <>
            <div style={{ marginTop:10,height:6,background:"#DDD8CB",borderRadius:3,overflow:"hidden" }}>
              <div style={{ height:"100%",background: total>budget?"#C04428":"#6E1A10",width:`${Math.min(100,(total/budget)*100)}%`,transition:"width .3s" }} />
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",marginTop:4,fontSize:12,color:"#B54030" }}>
              <span>Remaining: {fmtMoney(Math.max(0,budget-total), cur)}</span>
              <span>{budget>0?Math.round((total/budget)*100):0}%</span>
            </div>
          </>
        )}
      </div>

      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:16 }}>
        {bycat.length>0 && (
          <div style={{ flex:1, minWidth:150 }}>
            <div style={{ fontSize:12,color:"#B54030",marginBottom:8 }}>By Category</div>
            {bycat.map(x=>(
              <div key={x.cat} style={{ display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderBottom:"1px solid #E8E2D4" }}>
                <span>{x.cat}</span><span style={{ fontWeight:500 }}>{fmtMoney(x.total, cur)}</span>
              </div>
            ))}
          </div>
        )}
        {bytrav.length>0 && (
          <div style={{ flex:1, minWidth:150 }}>
            <div style={{ fontSize:12,color:"#B54030",marginBottom:8 }}>By Traveler</div>
            {bytrav.map(x=>(
              <div key={x.key} style={{ display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderBottom:"1px solid #E8E2D4" }}>
                <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{x.label}</span><span style={{ fontWeight:500 }}>{fmtMoney(x.total, cur)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
        <span style={{ fontWeight:600 }}>Expenses</span>
        <Btn onClick={openAdd}>+ Add Expense</Btn>
      </div>
      {expenses.length===0 && <p style={{ color:"#C86050",textAlign:"center",marginTop:24 }}>No expenses logged yet. Add one here, or log it against an event in the Schedule tab.</p>}
      {expenses.map(e=>(
        <div key={e.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #E8E2D4" }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13,fontWeight:500 }}>{e.desc || e.category}</div>
            <div style={{ fontSize:11,color:"#B54030" }}>
              {e.category}
              {e.travelerId && <span> · {nameOf(e.travelerId)}</span>}
              {e.eventId && evTitle[e.eventId] && <span style={{ color:"#9A8478" }}> · {evTitle[e.eventId]}</span>}
            </div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
            <span style={{ fontWeight:600 }}>{fmtMoney(e.amount, cur)}</span>
            <Btn variant="danger" style={{ padding:"2px 8px",fontSize:12 }} onClick={()=>delExp(e.id)}>✕</Btn>
          </div>
        </div>
      ))}

      {showExp && (
        <Modal title="Add Expense" onClose={()=>setShowExp(false)}>
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1 }}><Input label="Amount *" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00" /></div>
            <div style={{ flex:1.2 }}><Select label="Category" options={BUDGET_CATS} value={form.category} onChange={e=>setForm({...form,category:e.target.value})} /></div>
          </div>
          {members.length>0 && (
            <Select label="Traveler" value={form.travelerId} onChange={e=>setForm({...form,travelerId:e.target.value})}
              options={['', ...members.map(m=>m.userId)]} renderOption={o => o==='' ? '— shared —' : nameOf(o)} />
          )}
          <Input label="Description" value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} placeholder="e.g. Dinner, taxi, tickets…" />
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setShowExp(false)}>Cancel</Btn>
            <Btn onClick={addExp}>Add</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---- Packing Tab ----
function PackingTab({ trip, update }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:"", category:"Clothing" });

  const addItem = () => {
    if (!form.name) return;
    update({ packItems:[...(trip.packItems||[]), { id:uid(), packed:false, ...form }] });
    setShowAdd(false); setForm({ name:"", category:"Clothing" });
  };
  const toggle = (id) => update({ packItems: trip.packItems.map(p=>p.id===id?{...p,packed:!p.packed}:p) });
  const del = (id) => update({ packItems: trip.packItems.filter(p=>p.id!==id) });

  const packed = (trip.packItems||[]).filter(p=>p.packed).length;
  const total = (trip.packItems||[]).length;

  const grouped = PACK_CATS.map(c=>({ cat:c, items:(trip.packItems||[]).filter(p=>p.category===c) })).filter(x=>x.items.length>0);
  const uncatted = (trip.packItems||[]).filter(p=>!PACK_CATS.includes(p.category));

  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
        <div>
          <span style={{ fontWeight:600 }}>Packing List</span>
          {total>0 && <span style={{ fontSize:12,color:"#B54030",marginLeft:8 }}>{packed}/{total} packed</span>}
        </div>
        <Btn onClick={()=>setShowAdd(true)}>+ Add Item</Btn>
      </div>
      {total>0 && (
        <div style={{ height:4,background:"#DDD8CB",borderRadius:2,marginBottom:16,overflow:"hidden" }}>
          <div style={{ height:"100%",background:"#6E1A10",width:`${total?Math.round((packed/total)*100):0}%`,transition:"width .3s" }} />
        </div>
      )}
      {total===0 && <p style={{ color:"#C86050",textAlign:"center",marginTop:40 }}>Nothing to pack yet!</p>}
      {grouped.map(({ cat, items })=>(
        <div key={cat} style={{ marginBottom:14 }}>
          <div style={{ fontSize:12,fontWeight:600,color:"#B54030",marginBottom:6,textTransform:"uppercase",letterSpacing:".05em" }}>{cat}</div>
          {items.map(item=>(
            <div key={item.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #f3f4f6" }}>
              <input type="checkbox" checked={item.packed} onChange={()=>toggle(item.id)} style={{ accentColor:"#6E1A10",width:15,height:15 }} />
              <span style={{ flex:1,fontSize:13,textDecoration:item.packed?"line-through":"none",color:item.packed?"#D47060":"#6E1A10" }}>{item.name}</span>
              <Btn variant="danger" style={{ padding:"2px 8px",fontSize:12 }} onClick={()=>del(item.id)}>✕</Btn>
            </div>
          ))}
        </div>
      ))}
      {uncatted.map(item=>(
        <div key={item.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #f3f4f6" }}>
          <input type="checkbox" checked={item.packed} onChange={()=>toggle(item.id)} style={{ accentColor:"#6E1A10" }} />
          <span style={{ flex:1,fontSize:13,textDecoration:item.packed?"line-through":"none",color:item.packed?"#D47060":"#6E1A10" }}>{item.name}</span>
          <Btn variant="danger" style={{ padding:"2px 8px",fontSize:12 }} onClick={()=>del(item.id)}>✕</Btn>
        </div>
      ))}

      {showAdd && (
        <Modal title="Add Item" onClose={()=>setShowAdd(false)}>
          <Input label="Item Name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
          <Select label="Category" options={PACK_CATS} value={form.category} onChange={e=>setForm({...form,category:e.target.value})} />
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn onClick={addItem}>Add</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---- Locations Tab ----
function PicturesTab({ trip, update }) {
  const [lightbox, setLightbox] = useState(null);
  const [uploading, setUploading] = useState(false);
  const pics = trip.pictures || [];

  async function addPics(e) {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    const newPics = [];
    for (const file of files) {
      try {
        const url = await uploadToStorage(file, 'pics');
        newPics.push({ id: 'pic_' + uid(), name: file.name, url });
      } catch (err) {
        alert('Could not upload "' + file.name + '". ' + err.message);
      }
    }
    if (newPics.length) update(t => ({ ...t, pictures: [...(t.pictures || []), ...newPics] }));
    setUploading(false);
  }

  function delPic(id) {
    const pic = pics.find(p => p.id === id);
    if (pic && pic.url) deleteFromStorage(pic.url);
    update(t => ({ ...t, pictures: (t.pictures || []).filter(p => p.id !== id) }));
    if (lightbox && lightbox.id === id) setLightbox(null);
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#3D0C02', fontFamily: "var(--font-body)", fontSize: '18px', fontWeight: 600 }}>Trip Pictures</h3>
        <label style={{ background: uploading ? '#7A5A50' : '#3D0C02', color: '#fff', padding: '8px 18px', borderRadius: '8px', cursor: uploading ? 'default' : 'pointer', fontFamily: "var(--font-body)", fontSize: '14px', fontWeight: 500 }}>
          {uploading ? 'Uploading…' : '+ Upload Photos'}
          <input type="file" accept="image/*" multiple disabled={uploading} onChange={addPics} style={{ display: 'none' }} />
        </label>
      </div>

      {pics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8B4A3A' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📷</div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: '15px' }}>No pictures yet. Upload some to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
          {pics.map(pic => (
            <div key={pic.id} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', aspectRatio: '1', background: '#E8E4D9', cursor: 'pointer', boxShadow: '0 2px 8px rgba(61,12,2,0.12)' }}
              onClick={() => setLightbox(pic)}>
              <img src={pic.url || pic.data} alt={pic.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <button onClick={e => { e.stopPropagation(); delPic(pic.id); }}
                style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(61,12,2,0.75)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', color: '#fff', cursor: 'pointer', fontSize: '14px', lineHeight: '24px', textAlign: 'center', padding: 0 }}>×</button>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(61,12,2,0.6))', padding: '18px 6px 6px', fontSize: '11px', color: '#fff', fontFamily: "var(--font-body)", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pic.name}</div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
            <img src={lightbox.url || lightbox.data} alt={lightbox.name} style={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain' }} />
            <div style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '10px 16px', fontFamily: "var(--font-body)", fontSize: '13px' }}>{lightbox.name}</div>
            <button onClick={() => setLightbox(null)}
              style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', border: '2px solid #fff', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', cursor: 'pointer', fontSize: '18px', lineHeight: '28px', textAlign: 'center', padding: 0 }}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}


const STATUS_WORD = { todo:'not started', active:'ongoing', done:'complete' };

// Standardised status word for the Status "Sentences" view (coloured via STATUS_META[status].color)
const STATUS_SENTENCE_WORD = { done:'complete', active:'on-going', todo:'not started' };
// "A" · "A and B" · "A, B and C"
const joinNames = (names) => names.length <= 1 ? (names[0] || '')
  : names.length === 2 ? `${names[0]} and ${names[1]}`
  : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// Per-traveler marker: the traveler's PHOTO is their identity; a coloured ring shows
// their status, and a corner ✓ (done) / dot (ongoing) adds a shape cue so status isn't
// conveyed by colour alone (readability for elderly / colour-blind viewers).
function MemberMark({ name, userId, status, pic, size=24, onClick }) {
  const s = STATUS_META[status] ? status : 'todo';
  const ring = STATUS_META[s].ring;
  const initial = ((name || userId || '?').trim().charAt(0) || '?').toUpperCase();
  const badge = Math.round(size * 0.46);
  const title = onClick ? `${name || userId}: ${STATUS_WORD[s]} — tap to update` : `${name || userId}: ${STATUS_WORD[s]}`;
  return (
    <span onClick={onClick} role={onClick ? 'button' : undefined} title={title} style={{ position:'relative', display:'inline-flex', width:size, height:size, flexShrink:0, cursor: onClick ? 'pointer' : 'default' }}>
      <span style={{ width:size, height:size, borderRadius:'50%', boxSizing:'border-box', border:`2.5px solid ${ring}`, background:'#E8E2D4', overflow:'hidden', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
        {pic
          ? <img src={pic} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : <span style={{ fontSize:Math.round(size*0.42), fontWeight:700, color:'#8A6A50' }}>{initial}</span>}
      </span>
      {s === 'done' && (
        <span style={{ position:'absolute', right:-3, bottom:-3, width:badge, height:badge, borderRadius:'50%', background:STATUS_META.done.ring, color:'#fff', fontSize:Math.round(badge*0.72), fontWeight:700, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center', border:'1.5px solid #F0EBE0' }}>✓</span>
      )}
      {s === 'active' && (
        <span style={{ position:'absolute', right:-2, bottom:-2, width:Math.round(badge*0.7), height:Math.round(badge*0.7), borderRadius:'50%', background:STATUS_META.active.ring, border:'1.5px solid #F0EBE0' }} />
      )}
    </span>
  );
}

// ---- Status Tab ----  (per-traveler rollup of event/activity/span statuses per day)
function StatusTab({ trip, session, update, shareUrl, canUpdateOthers=true, focusUserId=null }) {
  const days = trip.days || [];
  // focusUserId (from a traveler's share link) narrows the view to that traveler only
  const roster = focusUserId ? (trip.members || []).filter(m => m.userId === focusUserId) : (trip.members || []);
  const perTraveler = roster.length > 0; // group trips show a marker per traveler; solo/legacy show one status
  const [copied, setCopied] = useState(false);

  // Load each traveler's photo (identity) from the directory
  const [memberPics, setMemberPics] = useState({});
  const memberKey = roster.map(m => m.userId).join(',');
  useEffect(() => {
    let cancelled = false;
    const ids = memberKey ? memberKey.split(',') : [];
    if (ids.length) directoryGetProfiles(ids).then(map => { if (!cancelled) setMemberPics(map); });
    return () => { cancelled = true; };
  }, [memberKey]);
  const picOf = (userId) => (memberPics[userId] || {}).pic || '';
  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      window.prompt('Copy this read-only status link:', shareUrl);
    }
  };

  const LINE = '#3D0C02';
  const [livePopup, setLivePopup] = useState(null); // { kind:'maps'|'flight', from, to, mode, flightNo, name }
  const [sentenceView, setSentenceView] = useState(false); // Markers ⇄ Sentences
  // Travelers who count for an item: its assignees, or everyone when unassigned
  const assignedRoster = (item) => {
    const a = item && item.assignees;
    return (!a || a.length === 0) ? roster : roster.filter(m => a.includes(m.userId));
  };

  // Advance a given traveler's status on any item (lets one traveler update another's — e.g. a family travelling together)
  const cycleMemberStatus = (ref, userId, itemTitle, travelerName) => {
    if (!update || !userId || !ref) return;
    let newStatus = null;
    if (ref.kind === 'span') {
      const s0 = (trip.spans || []).find(s => s.id === ref.spanId);
      newStatus = nextStatus(spanMemStOf(s0 || {}, userId, ref.dayISO));
      update(t => ({ spans:(t.spans||[]).map(s => s.id===ref.spanId
        ? { ...s, memberDayStatus:{ ...(s.memberDayStatus||{}), [userId]:{ ...((s.memberDayStatus||{})[userId]||{}), [ref.dayISO]: newStatus } } } : s) }));
    } else if (ref.kind === 'event') {
      const e0 = ((trip.days || []).find(d => d.id === ref.dayId) || {}).events || [];
      newStatus = nextStatus(memStOf(e0.find(e => e.id === ref.evId) || {}, userId));
      update(t => ({ days:(t.days||[]).map(d => d.id===ref.dayId
        ? { ...d, events:(d.events||[]).map(e => e.id===ref.evId ? { ...e, memberStatus:{ ...(e.memberStatus||{}), [userId]: newStatus } } : e) } : d) }));
    } else if (ref.kind === 'activity') {
      const d0 = (trip.days || []).find(d => d.id === ref.dayId) || {};
      const e0 = (d0.events || []).find(e => e.id === ref.evId) || {};
      const a0 = (e0.activities || []).find(a => a.id === ref.actId) || {};
      newStatus = memStOf(a0, userId) === 'done' ? 'todo' : 'done';
      update(t => ({ days:(t.days||[]).map(d => d.id===ref.dayId
        ? { ...d, events:(d.events||[]).map(e => e.id===ref.evId
            ? { ...e, activities:(e.activities||[]).map(a => a.id===ref.actId ? { ...a, memberStatus:{ ...(a.memberStatus||{}), [userId]: newStatus } } : a) } : e) } : d) }));
    }
    // Tell the trip's followers, if this trip has notifications switched on.
    if (newStatus && itemTitle) {
      const word = STATUS_SENTENCE_WORD[newStatus] || newStatus;
      sendFollowerPush(session, trip, `${trip.name || 'Trip'} · status update`, `${itemTitle} is ${word} for ${travelerName || 'a traveler'}`);
    }
  };

  // overall counts across the whole trip (aggregated across travelers per item)
  const total = { todo:0, active:0, done:0 };
  days.forEach(d => {
    spansOnDay(trip, d.date).forEach(s => { total[aggStatus(perTraveler ? assignedRoster(s).map(m => spanMemStOf(s, m.userId, d.date)) : [spanStOf(s, d.date)])]++; });
    (d.events||[]).forEach(ev => {
      total[aggStatus(perTraveler ? assignedRoster(ev).map(m => memStOf(ev, m.userId)) : [stOf(ev)])]++;
      (ev.activities||[]).forEach(a => { total[aggStatus(perTraveler ? assignedRoster(a).map(m => memStOf(a, m.userId)) : [stOf(a)])]++; });
    });
  });
  const totalItems = total.todo + total.active + total.done;

  // flatten a day into timeline items (spans that touch it, then each event + activities)
  const dayItems = (day) => {
    const out = [];
    // itemRoster = the travelers whose markers this item shows (assignees, or everyone)
    const push = (key, time, name, statuses, extra, itemRoster) => {
      const r = itemRoster || roster;
      out.push({ key, time, name, agg: aggStatus(statuses), marks: perTraveler ? r.map((m, i) => ({ userId:m.userId, name:m.name, status:statuses[i] })) : null, legacy: perTraveler ? null : statuses[0], anyActive: statuses.some(x => x === 'active'), ...(extra||{}) });
    };
    const pushSpan = (s) => {
      const meta = SPAN_TYPES[s.type] || {};
      const sr = assignedRoster(s);
      const statuses = perTraveler ? sr.map(m => spanMemStOf(s, m.userId, day.date)) : [spanStOf(s, day.date)];
      const isTravel = meta.kind === 'travel';
      const hasLink = isTravel && (s.mode === 'By Air' ? !!s.flightNo : (s.from || s.to));
      const extra = { ref:{ kind:'span', spanId:s.id, dayISO:day.date }, titleText: s.title || '(untitled)', ...(hasLink ? { travel: { mode:s.mode, from:s.from, to:s.to, flightNo:s.flightNo, name:s.title || 'Travel' } } : {}) };
      push(s.id+'_'+day.id, spanSegLabel(s, day.date), `${spanIcon(s)} ${s.title || '(untitled)'}`.trim(), statuses, extra, sr);
    };
    const pushEvent = (ev) => {
      const er = assignedRoster(ev);
      push(ev.id, ev.time ? `${ev.time}${ev.endTime ? ` to ${ev.endTime}` : ''}` : 'event', ev.title || '(untitled)',
        perTraveler ? er.map(m => memStOf(ev, m.userId)) : [stOf(ev)], { ref:{ kind:'event', dayId:day.id, evId:ev.id }, titleText: ev.title || '(untitled)' }, er);
      (ev.activities||[]).forEach(a => {
        const ar = assignedRoster(a);
        push(a.id, 'task', a.text || '(task)', perTraveler ? ar.map(m => memStOf(a, m.userId)) : [stOf(a)], { ref:{ kind:'activity', dayId:day.id, evId:ev.id, actId:a.id }, titleText: a.text || '(task)' }, ar);
      });
    };
    // Interleave spans + events chronologically; each event's tasks follow it
    const spanT = (s) => day.date === s.startDate ? (s.startTime || '') : day.date === s.endDate ? (s.endTime || '') : '';
    [
      ...spansOnDay(trip, day.date).map(s => ({ t: spanT(s), fn: () => pushSpan(s) })),
      ...(day.events||[]).map(ev => ({ t: ev.time || '', fn: () => pushEvent(ev) })),
    ].sort((a, b) => (!a.t && !b.t) ? 0 : !a.t ? -1 : !b.t ? 1 : (a.t > b.t ? 1 : a.t < b.t ? -1 : 0))
     .forEach(e => e.fn());
    return out;
  };

  // DAY number = calendar days since the trip's earliest day + 1 (21 Jun = DAY 1, 04 Jul = DAY 14)
  const parseDay = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s||''); return m ? Date.UTC(+m[1], +m[2]-1, +m[3]) : null; };
  const baseMs = days.reduce((min, d) => { const t = parseDay(d.date); return (t != null && (min == null || t < min)) ? t : min; }, null);

  return (
    <div>
      {shareUrl && (
        <div style={{ marginBottom:16, background:'#F5EFE2', border:'1px dashed #D4BFB0', borderRadius:10, padding:'10px 14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <span style={{ fontSize:12.5, color:'#8B5A3C', flex:1, minWidth:150, lineHeight:1.4 }}>Share a live, read-only link so anyone can follow this trip's status.</span>
            <button onClick={copyShare} style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'#6E1A10', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>{copied ? '✓ Link copied' : 'Share status'}</button>
          </div>
          {/* Traveler's opt-in: push a notification to followers on each status update */}
          {update && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:10, paddingTop:10, borderTop:'1px solid #E4D8C4' }}>
              <span style={{ fontSize:12.5, color:'#8B5A3C', flex:1, minWidth:150, lineHeight:1.4 }}>
                🔔 Notify followers when status changes
                <span style={{ display:'block', fontSize:11, color:'#B0967A', marginTop:2 }}>{trip.notifyEnabled ? 'On — followers who tapped “Notify me” get a push.' : 'Off — followers can still open the link to check.'}</span>
              </span>
              <button onClick={()=>update({ notifyEnabled: !trip.notifyEnabled })}
                style={{ padding:'6px 14px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12.5, fontWeight:700, whiteSpace:'nowrap', color: trip.notifyEnabled ? '#fff' : '#8B5A3C', background: trip.notifyEnabled ? '#3C8A3C' : '#E4D3B4' }}>
                {trip.notifyEnabled ? '✓ On' : 'Off'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Overall counts (aggregated across travelers) */}
      {totalItems>0 && (
        <div style={{ fontSize:12.5, display:'flex', gap:12, flexWrap:'wrap', marginBottom: perTraveler?12:26 }}>
          <span style={{ color: STATUS_META.done.color, fontWeight:600 }}>{total.done} complete</span>
          <span style={{ color: STATUS_META.active.color, fontWeight:600 }}>{total.active} ongoing</span>
          <span style={{ color: STATUS_META.todo.color, fontWeight:600 }}>{total.todo} not started</span>
        </div>
      )}
      {/* Traveler legend — which initial is who */}
      {perTraveler && (
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', alignItems:'center', marginBottom:24, paddingBottom:14, borderBottom:'1px solid #E2D8C8' }}>
          {roster.map(m => (
            <span key={m.userId} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'#6E1A10' }}>
              <span style={{ width:24, height:24, borderRadius:'50%', background:'#E8E2D4', overflow:'hidden', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#8A6A50', flexShrink:0 }}>
                {picOf(m.userId)
                  ? <img src={picOf(m.userId)} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : ((m.name||m.userId||'?').trim().charAt(0)||'?').toUpperCase()}
              </span>
              {m.name || m.userId}{session && m.userId===session.userId ? ' (you)' : ''}
            </span>
          ))}
        </div>
      )}
      {perTraveler && update && canUpdateOthers && (
        <p style={{ fontSize:11.5, color:'#8A7A6D', margin:'-14px 0 22px', lineHeight:1.45 }}>💡 Tap any traveler's photo on an item to update their status — handy when you're travelling together and someone's away from their phone.</p>
      )}

      {/* Toggle: show status sentences above the markers */}
      {perTraveler && totalItems > 0 && (
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginBottom:18 }}>
          <span style={{ fontSize:12.5, color:'#8B2A14', fontWeight:600 }}>Status sentences</span>
          <button onClick={()=>setSentenceView(v=>!v)}
            style={{ display:'inline-flex', alignItems:'center', gap:6, border:`1px solid ${sentenceView?'#6E1A10':'#C8B09A'}`, borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:700, cursor:'pointer', background: sentenceView?'#6E1A10':'transparent', color: sentenceView?'#fff':'#8B2A14' }}>
            {sentenceView ? '✓ On' : 'Off'}
          </button>
        </div>
      )}

      {days.length===0 && (
        <p style={{ color:'#C05040', fontSize:13, textAlign:'center', padding:'24px 0' }}>No days added yet.</p>
      )}

      {days.map((day, di) => {
        const items = dayItems(day);
        const t = parseDay(day.date);
        const dayNum = (baseMs != null && t != null) ? Math.round((t - baseMs) / 86400000) + 1 : (di + 1);
        return (
          <div key={day.id}>
            {di>0 && <div style={{ borderTop:'2px dotted #C8B09A', margin:'0 0 30px' }} />}
            {/* Day header on top, left-aligned — frees the full width for the timeline content below */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:25, fontWeight:400, letterSpacing:'0.14em', color:'#2E2320', lineHeight:1.05 }}>DAY {dayNum}</div>
              <div style={{ fontSize:11, fontWeight:500, letterSpacing:'0.12em', color:'#7A685F', marginTop:5 }}>{fmtDate(day.date).toUpperCase()}</div>
              {day.label && <div style={{ fontSize:12, color:'#8B2A14', marginTop:4, fontStyle:'italic' }}>{day.label}</div>}
            </div>

            {/* Timeline below — indented so the vertical bar/dots sit under the centre of the DAY header */}
            <div style={{ minWidth:0, marginBottom:30, paddingLeft:32 }}>
              {items.length===0 && <div style={{ fontSize:13, color:'#C05040', padding:'2px 0' }}>No events</div>}
              {items.map((it, idx) => {
                const first = idx===0, last = idx===items.length-1;
                return (
                  <div key={it.key} style={{ display:'flex', gap:12, alignItems:'stretch' }}>
                    <div style={{ position:'relative', width:16, flexShrink:0 }}>
                      {!first && <div style={{ position:'absolute', left:7, top:0, height:10, width:2, background:LINE }} />}
                      {!last && <div style={{ position:'absolute', left:7, top:10, bottom:0, width:2, background:LINE }} />}
                      <div style={{ position:'absolute', left:2, top:4, width:12, height:12, borderRadius:'50%', boxSizing:'border-box', border:`2px solid ${LINE}`, background: it.agg==='done' ? LINE : '#F0EBE0', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {it.agg==='active' && <span style={{ width:4, height:4, borderRadius:'50%', background:LINE }} />}
                      </div>
                    </div>
                    <div style={{ width:80, flexShrink:0, paddingBottom: last?0:28, fontSize:12, letterSpacing:'0.03em', color:'#4A3B34', textTransform:'uppercase', lineHeight:1.35 }}>{it.time}</div>
                    <div style={{ flex:1, minWidth:0, paddingBottom: last?0:28, fontSize:13.5, color:'#2E2320', lineHeight:1.4 }}>
                      <div>{it.name}</div>
                      {/* Sentences (one coloured line per traveler) shown above the markers when toggled on */}
                      {sentenceView && it.marks && (
                        <div style={{ marginTop:5 }}>
                          {(() => {
                            // display name = first name, unless two travelers on this item share it
                            const firsts = it.marks.map(mk => (mk.name || mk.userId || '').trim().split(/\s+/)[0]);
                            const fCount = {};
                            firsts.forEach(f => { fCount[f] = (fCount[f] || 0) + 1; });
                            const disp = it.marks.map((mk, i) => fCount[firsts[i]] > 1 ? (mk.name || mk.userId) : firsts[i]);
                            // one combined line per status group
                            return ['active', 'done', 'todo'].map(st => {
                              const names = it.marks.map((mk, i) => mk.status === st ? disp[i] : null).filter(Boolean);
                              if (!names.length) return null;
                              return (
                                <div key={st} style={{ fontSize:12.5, color:'#4A3B34', lineHeight:1.55 }}>
                                  {it.titleText} is <span style={{ color: STATUS_META[st].color, fontWeight:700 }}>{STATUS_SENTENCE_WORD[st]}</span> for {joinNames(names)}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                      {it.marks
                        ? <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:6 }}>
                            {it.marks.map(mk => <MemberMark key={mk.userId} name={mk.name} userId={mk.userId} status={mk.status} pic={picOf(mk.userId)} onClick={update && (canUpdateOthers || (session && mk.userId === session.userId)) ? ()=>cycleMemberStatus(it.ref, mk.userId, it.titleText, mk.name) : undefined} />)}
                          </div>
                        : <span style={{ color: STATUS_META[it.legacy].color, fontWeight:600 }}>{STATUS_WORD[it.legacy]}</span>}
                      {it.travel && it.anyActive && (
                        <div style={{ marginTop:8 }}>
                          {it.travel.mode === 'By Air'
                            ? <button onClick={()=>setLivePopup({ kind:'flight', ...it.travel })}
                                style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#F16C1E', color:'#fff', border:'none', borderRadius:8, padding:'7px 12px', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
                                <span style={{ fontSize:14 }}>✈️</span> Show Live
                              </button>
                            : <button onClick={()=>setLivePopup({ kind:'maps', ...it.travel })}
                                style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#1A73E8', color:'#fff', border:'none', borderRadius:8, padding:'7px 12px', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
                                <span style={{ fontSize:14 }}>🗺</span> Show Live
                              </button>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {livePopup && (livePopup.kind === 'flight' ? (
        <Modal title="Live on Flightradar24" onClose={()=>setLivePopup(null)}>
          <div style={{ fontSize:13.5, color:'#6E1A10', marginBottom:6 }}>{livePopup.name}</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'#F5EFE2', border:'1px solid #E2D8C8', borderRadius:9, padding:'12px 14px', marginBottom:16 }}>
            <span style={{ fontSize:18 }}>✈️</span>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'#2E2320', letterSpacing:'0.03em' }}>{(livePopup.flightNo||'').toUpperCase()}</div>
              {(livePopup.from || livePopup.to) && <div style={{ fontSize:12, color:'#8A7A6D' }}>{livePopup.from || '?'} → {livePopup.to || '?'}</div>}
            </div>
          </div>
          <p style={{ fontSize:12.5, color:'#8A7A6D', margin:'0 0 16px', lineHeight:1.5 }}>Opens this flight's live status on Flightradar24 — shows the aircraft's position and progress when it's airborne.</p>
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={()=>{ window.open(fr24Url(livePopup.flightNo), '_blank', 'noopener'); setLivePopup(null); }} style={{ background:'#F16C1E' }}>Open on Flightradar24</Btn>
            <Btn variant="ghost" onClick={()=>setLivePopup(null)}>Cancel</Btn>
          </div>
        </Modal>
      ) : (
        <Modal title="Live on Google Maps" onClose={()=>setLivePopup(null)}>
          <div style={{ fontSize:13.5, color:'#6E1A10', marginBottom:6 }}>{livePopup.name}</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'#F5EFE2', border:'1px solid #E2D8C8', borderRadius:9, padding:'12px 14px', marginBottom:16 }}>
            <span style={{ fontSize:18 }}>🚗</span>
            <span style={{ fontSize:14, fontWeight:600, color:'#2E2320' }}>{livePopup.from || '?'} <span style={{ color:'#B0967A' }}>→</span> {livePopup.to || '?'}</span>
          </div>
          <p style={{ fontSize:12.5, color:'#8A7A6D', margin:'0 0 16px', lineHeight:1.5 }}>Opens live driving directions in Google Maps — on a phone this launches turn-by-turn navigation.</p>
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={()=>{ window.open(gmapsDirUrl(livePopup.from, livePopup.to), '_blank', 'noopener'); setLivePopup(null); }} style={{ background:'#1A73E8' }}>Open live in Google Maps</Btn>
            <Btn variant="ghost" onClick={()=>setLivePopup(null)}>Cancel</Btn>
          </div>
        </Modal>
      ))}
    </div>
  );
}

// Supabase cloud sync helpers
const SUPA_URL = 'https://lafpiwlpjvongtdtzuam.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhZnBpd2xwanZvbmd0ZHR6dWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjUyNDgsImV4cCI6MjA5Njg0MTI0OH0.cdDldzH4xrPYWZgdqeYOCBk7u34CtZWT6L2ldx3qYRk';
const supaHeaders = { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY };
async function loadFromCloud() {
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/travel_data?id=eq.shared&select=trips,header_note', { headers: supaHeaders });
    if (!r.ok) return null;
    const data = await r.json();
    return data && data[0] ? data[0] : null;
  } catch(e) { return null; }
}
async function saveToCloud(trips, headerNote) {
  try {
    await fetch(SUPA_URL + '/rest/v1/travel_data', {
      method: 'POST',
      headers: { ...supaHeaders, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: 'shared', trips, header_note: headerNote || '', updated_at: new Date().toISOString() })
    });
  } catch(e) {}
}

const SUPA_BUCKET = 'trip-media';

// ---- Follower push notifications --------------------------------------
// Public VAPID key (safe to ship). The matching private key lives only in
// the notify() Netlify function's env. The send-function lives at the public
// Netlify domain (works when the traveler is on the phone app too).
const VAPID_PUBLIC = 'BAa-b04xoM_bBMoDI5swB7prW9uWkVr1AchqETMVemZC0u-SP_BCooth8VYx00K_dsBn5WiTklpT3ERzjoj4_gc';
const NOTIFY_FN = 'https://mytravelhub.netlify.app/.netlify/functions/notify';
const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const urlB64ToU8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};
// Is this browser already following this trip? → the PushSubscription or null
async function followerSubscription() {
  if (!pushSupported()) return null;
  try { const reg = await navigator.serviceWorker.getRegistration('/sw.js'); return reg ? await reg.pushManager.getSubscription() : null; }
  catch (e) { return null; }
}
// Follower taps "Notify me": ask permission, subscribe, store keyed to the trip.
async function followerSubscribe(tripId) {
  if (!pushSupported()) throw new Error('This browser doesn’t support notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('blocked');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(VAPID_PUBLIC) });
  const j = sub.toJSON();
  const r = await fetch(SUPA_URL + '/rest/v1/push_subscriptions', {
    method: 'POST', headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ trip_id: tripId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth })
  });
  if (!r.ok && r.status === 404) throw new Error('setup'); // table not created yet
  return sub;
}
async function followerUnsubscribe() {
  const sub = await followerSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch (e) {}
  try { await fetch(SUPA_URL + '/rest/v1/push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), { method: 'DELETE', headers: supaHeaders }); } catch (e) {}
}
// Traveler side: after a status change, ping the send-function (which fans out
// to followers). No-op unless the trip has notifications switched on.
async function sendFollowerPush(session, trip, title, body) {
  try {
    if (!trip || !trip.notifyEnabled || !session) return;
    const s = await freshSession(session);
    await fetch(NOTIFY_FN, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ((s && s.accessToken) || '') },
      body: JSON.stringify({ tripId: trip.id, title, body })
    });
  } catch (e) {}
}

// Upload a File/Blob to Supabase Storage; returns its public URL.
async function uploadToStorage(file, folder) {
  const ext = (file.name && file.name.includes('.'))
    ? file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'')
    : 'bin';
  const path = folder + '/' + uid() + '-' + Date.now() + '.' + ext;
  const res = await fetch(SUPA_URL + '/storage/v1/object/' + SUPA_BUCKET + '/' + path, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
    body: file
  });
  if (!res.ok) throw new Error('Storage upload failed (' + res.status + ')');
  return SUPA_URL + '/storage/v1/object/public/' + SUPA_BUCKET + '/' + path;
}

// Best-effort delete of a stored file given its public URL.
async function deleteFromStorage(url) {
  if (!url || typeof url !== 'string') return;
  const marker = '/object/public/' + SUPA_BUCKET + '/';
  const i = url.indexOf(marker);
  if (i === -1) return;
  const path = url.slice(i + marker.length);
  try {
    await fetch(SUPA_URL + '/storage/v1/object/' + SUPA_BUCKET + '/' + path, {
      method: 'DELETE', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
    });
  } catch(e) {}
}

// ── Traveler accounts (Supabase Auth / GoTrue REST) ──
// Travelers sign up with a unique User ID + password. We map the User ID to a
// synthetic internal email so no real email is needed yet; a real email / Gmail
// sign-in can be linked to the same account later without breaking logins.
// Opaque internal domain for User-ID logins. Must pass GoTrue's email validation;
// 'users.mytravelhub.com' verified to validate. No mail is ever sent to it
// (email confirmation is off), so we don't need to own the domain.
const AUTH_DOMAIN = 'users.mytravelhub.com';
const AUTH_KEY = 'travelerAuth';
const normUserId = (s) => (s || '').trim().toLowerCase();
const userIdToEmail = (userId) => normUserId(userId) + '@' + AUTH_DOMAIN;
const loadAuth = () => { try { const a = localStorage.getItem(AUTH_KEY); return a ? JSON.parse(a) : null; } catch(e){ return null; } };
const saveAuth = (a) => { try { if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a)); else localStorage.removeItem(AUTH_KEY); } catch(e){} };

// Shape a GoTrue token/session response into the small object we persist
const sessionFromResponse = (j, fallbackUserId, fallbackName) => {
  const u = j.user || {};
  const meta = u.user_metadata || {};
  return {
    uid: u.id || j.id || '',
    userId: meta.user_id || normUserId(fallbackUserId),
    name: meta.traveler_name || fallbackName || normUserId(fallbackUserId),
    role: meta.role || 'captain', // profile type: captain | traveler | viewer (legacy accounts default to captain)
    accessToken: j.access_token || '',
    refreshToken: j.refresh_token || '',
  };
};

async function authSignIn(userId, password, fallbackName) {
  const res = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userIdToEmail(userId), password })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    const m = j.msg || j.error_description || j.error || 'Login failed';
    if (/not confirmed/i.test(m)) throw new Error('One-time setup needed: in Supabase → Authentication → Providers → Email, turn OFF "Confirm email", then try again.');
    if (/invalid/i.test(m)) throw new Error('Incorrect User ID or password.');
    throw new Error(m);
  }
  const s = sessionFromResponse(j, userId, fallbackName);
  directoryUpsert(s); // keep the traveler directory fresh
  return s;
}

async function authSignUp(userId, password, name, role) {
  const res = await fetch(SUPA_URL + '/auth/v1/signup', {
    method: 'POST', headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userIdToEmail(userId), password, data: { user_id: normUserId(userId), traveler_name: name, role: role || 'captain' } })
  });
  const j = await res.json().catch(() => ({}));
  const code = j.error_code || '';
  if (!res.ok) {
    const m = j.msg || j.error_description || j.error || 'Sign up failed';
    if (/registered|already|exists/i.test(m) || code === 'user_already_exists') throw new Error('That User ID is already taken — please choose another.');
    if (code === 'over_email_send_rate_limit' || /confirm/i.test(m)) throw new Error('One-time setup needed: in Supabase → Authentication → Providers → Email, turn OFF "Confirm email", then try again.');
    throw new Error(m);
  }
  // With email confirmation off, signup returns a session directly; otherwise log in to fetch one
  if (j.access_token) { const s = sessionFromResponse(j, userId, name); directorySaveProfile(s, s.name, { role: s.role }); return s; }
  // No session → confirmation is still on
  throw new Error('One-time setup needed: in Supabase → Authentication → Providers → Email, turn OFF "Confirm email", then try again.');
}

async function authSignOut(session) {
  try {
    if (session && session.accessToken) await fetch(SUPA_URL + '/auth/v1/logout', {
      method: 'POST', headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.accessToken }
    });
  } catch(e) {}
}

// ── Traveler directory (public `profiles` table) ──
// ---- Session freshness -------------------------------------------------
// Supabase access tokens expire (~1h). Every request that relies on RLS must
// carry a live one, so refresh just before it lapses.
const jwtExpMs = (tok) => { try { return (JSON.parse(atob(String(tok).split('.')[1])).exp || 0) * 1000; } catch(e) { return 0; } };
async function authRefresh(session) {
  try {
    if (!session || !session.refreshToken) return null;
    const res = await fetch(SUPA_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refreshToken })
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j.access_token) return null;
    return { ...session, ...sessionFromResponse(j, session.userId, session.name) };
  } catch(e) { return null; }
}
// Hand back a session whose token is good for at least another minute.
async function freshSession(session, onSession) {
  if (!session || !session.accessToken) return session;
  if (jwtExpMs(session.accessToken) - Date.now() > 60000) return session;
  const s = await authRefresh(session);
  if (s) { if (onSession) onSession(s); saveAuth(s); return s; }
  return session;
}
// Requests made AS the signed-in traveler — this is what RLS reads.
const authHeaders = (session) => ({
  'Content-Type': 'application/json',
  apikey: SUPA_KEY,
  Authorization: 'Bearer ' + ((session && session.accessToken) || SUPA_KEY),
});

// ---- Trips storage (row-level security) --------------------------------
// One row per trip. Postgres decides what you may read/write: owner + members
// can edit, invited viewers can only read, everyone else sees nothing. The
// owner_uid/member_uids/viewer_uids/share_token columns drive those policies,
// so they're mirrored onto the trip object but kept out of the JSON blob.
const TRIP_ROW_FIELDS = ['shareToken', 'ownerUid', 'memberUids', 'viewerUids'];
const rowToTrip = (row) => ({
  ...(row.data || {}),
  id: row.id,
  shareToken: row.share_token || '',
  ownerUid: row.owner_uid || '',
  memberUids: row.member_uids || [],
  viewerUids: row.viewer_uids || [],
});
const tripData = (trip) => { const d = { ...trip }; TRIP_ROW_FIELDS.forEach(k => delete d[k]); return d; };

// → {mode:'rls', trips} | {mode:'legacy'} (migration not run yet) | {mode:'error'}
async function tripsFetch(session) {
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/trips?select=id,data,share_token,owner_uid,member_uids,viewer_uids', { headers: authHeaders(session) });
    if (r.status === 404) return { mode: 'legacy' };
    if (r.status === 401) return { mode: 'unauthorized' }; // token dead and refresh failed
    if (!r.ok) return { mode: 'error' };
    const rows = await r.json();
    return { mode: 'rls', trips: (rows || []).map(rowToTrip) };
  } catch(e) { return { mode: 'error' }; }
}
async function tripCreate(session, trip) {
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/trips', {
      method: 'POST', headers: { ...authHeaders(session), 'Prefer': 'return=representation' },
      body: JSON.stringify({ id: trip.id, owner_uid: session.uid, member_uids: [session.uid], data: tripData(trip) })
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows && rows[0] ? rowToTrip(rows[0]) : null;
  } catch(e) { return null; }
}
async function tripPatch(session, id, fields) {
  try {
    await fetch(SUPA_URL + '/rest/v1/trips?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: authHeaders(session), body: JSON.stringify(fields)
    });
  } catch(e) {}
}
async function tripDelete(session, id) {
  try {
    await fetch(SUPA_URL + '/rest/v1/trips?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE', headers: authHeaders(session)
    });
  } catch(e) {}
}
// Public read-only share link: returns ONE trip, and only for the right token.
// → {ok:true, trip, updatedAt} | {ok:false, missing:true} (pre-migration) | {ok:false}
async function sharedTripFetch(tripId, token) {
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/rpc/shared_trip', {
      method: 'POST', headers: supaHeaders,
      body: JSON.stringify({ p_id: tripId, p_token: token || '' })
    });
    if (r.status === 404) return { ok: false, missing: true };
    if (!r.ok) return { ok: false };
    const j = await r.json();
    return { ok: true, trip: (j && j.trip) || null, updatedAt: (j && j.updated_at) || null };
  } catch(e) { return { ok: false }; }
}

// ---- Traveler directory ------------------------------------------------
// Reads go through profiles_public, which exposes only User ID / name / avatar
// — a profile's private side (notes, to-dos, age…) is never world-readable.
// Each call falls back to the old open table until the migration has been run.
async function directoryUpsert(session) {
  if (!session) return;
  const base = { user_id: normUserId(session.userId), name: session.name || normUserId(session.userId) };
  const post = (headers, body) => fetch(SUPA_URL + '/rest/v1/profiles', {
    method: 'POST', headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify(body)
  });
  try {
    const r = await post(authHeaders(session), { ...base, auth_uid: session.uid });
    if (!r.ok) await post(supaHeaders, base); // pre-migration
  } catch(e) {}
}
// Look up a traveler by exact User ID; returns { userId, name, uid } or null
async function directoryLookup(userId) {
  const id = normUserId(userId);
  try {
    let r = await fetch(SUPA_URL + '/rest/v1/profiles_public?user_id=eq.' + encodeURIComponent(id) + '&select=user_id,name,auth_uid', { headers: supaHeaders });
    if (r.status === 404) r = await fetch(SUPA_URL + '/rest/v1/profiles?user_id=eq.' + encodeURIComponent(id) + '&select=user_id,name', { headers: supaHeaders });
    if (!r.ok) return null;
    const rows = await r.json();
    if (rows && rows[0]) return { userId: rows[0].user_id, name: rows[0].name || rows[0].user_id, uid: rows[0].auth_uid || '' };
    return null;
  } catch(e) { return null; }
}
// Load MY OWN full profile (photo/age/city/notes/to-dos) — RLS: own row only
async function directoryGetProfile(session) {
  if (!session) return null;
  const q = '/rest/v1/profiles?user_id=eq.' + encodeURIComponent(normUserId(session.userId)) + '&select=name,profile';
  try {
    let r = await fetch(SUPA_URL + q, { headers: authHeaders(session) });
    let rows = r.ok ? await r.json() : null;
    if (!rows || !rows[0]) { // pre-migration the row may only be visible to anon
      r = await fetch(SUPA_URL + q, { headers: supaHeaders });
      rows = r.ok ? await r.json() : null;
    }
    if (rows && rows[0]) return { name: rows[0].name, profile: rows[0].profile || {} };
    return null;
  } catch(e) { return null; }
}
// Fetch several travelers' name+photo at once → { userId: { name, pic } }
async function directoryGetProfiles(userIds) {
  try {
    const ids = (userIds || []).map(u => normUserId(u)).filter(Boolean);
    if (!ids.length) return {};
    const list = ids.map(u => encodeURIComponent(u)).join(',');
    let legacy = false;
    let r = await fetch(SUPA_URL + '/rest/v1/profiles_public?user_id=in.(' + list + ')&select=user_id,name,pic', { headers: supaHeaders });
    if (r.status === 404) { legacy = true; r = await fetch(SUPA_URL + '/rest/v1/profiles?user_id=in.(' + list + ')&select=user_id,name,profile', { headers: supaHeaders }); }
    if (!r.ok) return {};
    const rows = await r.json();
    const map = {};
    (rows || []).forEach(row => { map[row.user_id] = { name: row.name, pic: (legacy ? (row.profile && row.profile.pic) : row.pic) || '' }; });
    return map;
  } catch(e) { return {}; }
}
// Save my profile (name + details) to the directory
async function directorySaveProfile(session, name, profileObj) {
  if (!session) return;
  const base = { user_id: normUserId(session.userId), name: name || normUserId(session.userId), profile: profileObj || {} };
  const post = (headers, body) => fetch(SUPA_URL + '/rest/v1/profiles', {
    method: 'POST', headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify(body)
  });
  try {
    const r = await post(authHeaders(session), { ...base, auth_uid: session.uid });
    if (!r.ok) await post(supaHeaders, base); // pre-migration
  } catch(e) {}
}

// ---- Viewer home: view-only account sees just the trips shared with them ----
function ViewerHome({ session, profile, trips, onOpenAccount }) {
  const firstName = ((session && session.name) || '').trim().split(/\s+/)[0] || 'Viewer';
  const initial = firstName.charAt(0).toUpperCase() || '?';
  return (
    <div style={{ fontFamily:'var(--font-body)', maxWidth:680, margin:'0 auto', minHeight:'100vh', background:'#F0EBE0', paddingBottom:'env(safe-area-inset-bottom, 0px)', color:'#6E1A10' }}>
      <div style={{ background:'#5C1A1A', boxShadow:'0 2px 12px rgba(0,0,0,0.18)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'calc(env(safe-area-inset-top, 0px) + 16px) 20px 14px' }}>
          <img src="/logo-travelhub.png" alt="My Travel Hub" width="38" height="38" style={{ borderRadius:9, flexShrink:0, display:'block' }} />
          <div style={{ flex:1, minWidth:0 }}>
            <h1 style={{ margin:0, fontSize:18, fontWeight:800, color:'#F5ECD7', letterSpacing:'0.03em', textTransform:'uppercase', lineHeight:1.15 }}>My Travel Hub</h1>
            <p style={{ margin:'2px 0 0', fontSize:10.5, color:'rgba(245,236,215,0.6)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Viewer</p>
          </div>
          <button onClick={onOpenAccount} title={`Signed in as ${(session && session.name) || ''}`} aria-label="Account"
            style={{ width:42, height:42, borderRadius:'50%', overflow:'hidden', border:'2px solid rgba(245,236,215,0.5)', background:'rgba(245,236,215,0.12)', cursor:'pointer', padding:0, flexShrink:0, color:'#F5ECD7', fontSize:17, fontWeight:800 }}>
            {profile && profile.pic ? <img src={profile.pic} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initial}
          </button>
        </div>
      </div>
      <div style={{ padding:'18px 20px' }}>
        <div style={{ fontSize:19, fontWeight:800, color:'#3D0C02', marginBottom:6 }}>Hi, {firstName} 👋</div>
        <p style={{ fontSize:13, color:'#8A7A6D', margin:'0 0 18px' }}>Trips shared with you — tap one to follow its live status.</p>
        {trips.length === 0 && (
          <div style={{ textAlign:'center', padding:'50px 16px', color:'#B54030' }}>
            <div style={{ fontSize:44, marginBottom:12 }}>🔭</div>
            <p style={{ fontSize:14.5, margin:0 }}>No trips shared with you yet.</p>
            <p style={{ fontSize:12.5, color:'#8A7A6D', marginTop:8 }}>Ask a Trip Captain to add <strong>@{session.userId}</strong> as a viewer on their trip.</p>
          </div>
        )}
        {trips.map(t => { const r = tripDateRange(t); const m = TRIP_STATUS[tripStatusOf(t)]; return (
          <button key={t.id} onClick={()=>{ window.location.href = '?view=' + t.id + (t.shareToken ? '&k=' + encodeURIComponent(t.shareToken) : ''); }}
            style={{ background:'#EDE7D9', border:'1px solid #D4BFB0', borderRadius:12, padding:'14px 16px', width:'100%', textAlign:'left', cursor:'pointer', marginBottom:10, display:'block' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:m.dot, flexShrink:0 }} />
              <span style={{ fontSize:14.5, fontWeight:700, color:'#3D0C02', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.name || 'Trip'}</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#3C8A3C', background:'#DCEEDC', borderRadius:10, padding:'2px 8px' }}>LIVE ▸</span>
            </div>
            <div style={{ fontSize:12, color:'#8B5A3C', marginTop:4, display:'flex', gap:12, flexWrap:'wrap' }}>
              {t.destination && <span>📍 {t.destination}</span>}
              {r.start && <span>🗓 {fmtDate(r.start)}{r.end && r.end!==r.start ? ` → ${fmtDate(r.end)}` : ''}</span>}
            </div>
          </button>
        ); })}
      </div>
    </div>
  );
}

// ---- Dashboard: landing page after sign-in (hero trip, journeys, family status, to-dos, note) ----
function Dashboard({ session, profile, trips, canCreate=true, onOpenTrip, onOpenStatus, onNewTrip, onOpenAccount, onMyTrips, onCalendar, onSaveData }) {
  const [notes, setNotes] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [todoInput, setTodoInput] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);
  const savedNotes = (profile && profile.notes) || '';
  useEffect(() => { setNotes(savedNotes); }, [savedNotes]);
  const todos = (profile && profile.todos) || [];
  const saveNotes = () => { if (notes !== savedNotes) onSaveData({ notes }); setEditingNote(false); };
  const addTodo = () => { const t = todoInput.trim(); if (!t) return; onSaveData({ todos:[...todos, { id:uid(), text:t, done:false }] }); setTodoInput(''); };
  const toggleTodo = (id) => onSaveData({ todos: todos.map(t => t.id===id ? { ...t, done:!t.done } : t) });
  const delTodo = (id) => onSaveData({ todos: todos.filter(t => t.id!==id) });

  // Responsive: full sidebar layout on wide screens, stacked on phones
  const [wide, setWide] = useState(typeof window !== 'undefined' && window.innerWidth >= 1000);
  useEffect(() => { const on = () => setWide(window.innerWidth >= 1000); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);

  const firstName = ((session && session.name) || '').trim().split(/\s+/)[0] || 'Traveler';
  const initial = firstName.charAt(0).toUpperCase() || '?';
  const roleLabel = ((session && session.role) || 'captain') === 'captain' ? 'Trip captain' : (session && session.role === 'viewer' ? 'Viewer' : 'Traveler');

  // Today / greeting
  const pad = n => String(n).padStart(2, '0');
  const nowD = new Date();
  const todayISO = `${nowD.getFullYear()}-${pad(nowD.getMonth()+1)}-${pad(nowD.getDate())}`;
  const nowHM = `${pad(nowD.getHours())}:${pad(nowD.getMinutes())}`;
  const greet = nowD.getHours() < 12 ? 'morning' : nowD.getHours() < 17 ? 'afternoon' : 'evening';
  const dateLine = `${weekdayOf(todayISO)}, ${fmtDate(todayISO).replace(/ \d{4}$/, '')}`.toUpperCase();

  // Hero = the trip in progress
  const hero = trips.find(t => tripStatusOf(t) === 'active') || null;
  const msOf = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2]-1, +m[3]) : null; };
  let heroX = null;
  if (hero) {
    const r = tripDateRange(hero);
    const s = msOf(r.start), e = msOf(r.end), t0 = msOf(todayISO);
    const total = (s != null && e != null) ? Math.round((e - s) / 86400000) + 1 : null;
    const dayN = (s != null && t0 != null) ? Math.round((t0 - s) / 86400000) + 1 : null;
    const day = (hero.days || []).find(d => (d.date || '').slice(0, 10) === todayISO);
    let next = null;
    if (day) { const evs = (day.events || []).filter(ev => ev.time).sort((a, b) => a.time > b.time ? 1 : -1); next = evs.find(ev => ev.time >= nowHM) || null; }
    const pct = (total && dayN != null) ? Math.max(0, Math.min(100, Math.round((Math.min(dayN, total) / total) * 100))) : 0;
    heroX = { r, total, dayN, next, pct };
  }

  // What each family member is up to right now (hero trip, today)
  const memberNow = (m) => {
    let active = null, done = null;
    spansOnDay(hero, todayISO).forEach(sp => { const st = spanMemStOf(sp, m.userId, todayISO); if (st === 'active' && !active) active = sp.title; else if (st === 'done' && !done) done = sp.title; });
    const day = (hero.days || []).find(d => (d.date || '').slice(0, 10) === todayISO);
    if (day) (day.events || []).forEach(ev => { const st = memStOf(ev, m.userId); if (st === 'active' && !active) active = ev.title; else if (st === 'done' && !done) done = ev.title; });
    if (active) return { line: `At ${active}`, chip: 'Active', ok: true };
    if (done) return { line: `Finished ${done}`, chip: 'Active', ok: true };
    return { line: 'No update yet', chip: 'No update', ok: false };
  };

  const chipFor = (t) => {
    const st = tripStatusOf(t);
    if (st === 'active') return { label: 'ACTIVE', color: '#2F7A2F', dot: '#3C8A3C' };
    if (st === 'done') return { label: 'COMPLETE', color: '#8A7A6D', dot: '#B0A091' };
    return tripDateRange(t).start ? { label: 'UPCOMING', color: '#2E6FB2', dot: '#2E86C8' } : { label: 'PLANNING', color: '#B07A2A', dot: '#C89040' };
  };
  const TripArt = ({ status }) => {
    const pal = status === 'active' ? ['#A8442A', '#7E2415', '#E8C9A8'] : status === 'done' ? ['#8F8578', '#6E655B', '#D8CFC2'] : ['#B08A54', '#8A6A3E', '#E4D3B4'];
    return (
      <svg width="76" height="76" viewBox="0 0 84 84" style={{ borderRadius: 12, flexShrink: 0, display: 'block' }}>
        <rect width="84" height="84" fill={pal[2]} />
        <circle cx="58" cy="26" r="12" fill="#F5EFE2" opacity="0.85" />
        <path d="M0 84 L34 38 L58 84 Z" fill={pal[0]} />
        <path d="M30 84 L60 48 L84 84 Z" fill={pal[1]} />
        <path d="M36 28 l10 -6 -3 8 z" fill="#F5EFE2" opacity="0.9" />
      </svg>
    );
  };

  const panel = { background: '#FDF7EC', border: '1px solid #E4D8C4', borderRadius: 17, padding: '18px 18px' };
  const capsLabel = { fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#B07A4A' };
  const avatarBtn = (
    <button onClick={onOpenAccount} title={`Signed in as ${(session && session.name) || ''}`} aria-label="Account"
      style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(92,26,26,0.35)', background: '#EFE3CC', cursor: 'pointer', padding: 0, flexShrink: 0, color: '#8B5A3C', fontSize: 16, fontWeight: 800 }}>
      {profile && profile.pic ? <img src={profile.pic} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
    </button>
  );

  const navItems = [
    { icon: '⌂', label: 'Overview', active: true, go: () => {} },
    { icon: '🧳', label: 'My trips', go: onMyTrips },
    { icon: '🗓', label: 'Calendar', go: onCalendar },
    { icon: '⚙', label: 'Settings', go: onOpenAccount },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F5EFE2', fontFamily: 'var(--font-body)', color: '#6E1A10' }}>
      {/* Sidebar (desktop) */}
      {wide && (
        <aside style={{ width: 244, flexShrink: 0, background: '#5C1A1A', color: '#F5ECD7', display: 'flex', flexDirection: 'column', padding: '22px 14px 18px', position: 'sticky', top: 0, height: '100vh', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 22px' }}>
            <img src="/logo-travelhub.png" alt="" width="38" height="38" style={{ borderRadius: 10, flexShrink: 0, display: 'block' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.15 }}>My Travel Hub</div>
              <div style={{ fontSize: 10.5, color: 'rgba(245,236,215,0.55)', marginTop: 3, lineHeight: 1.35 }}>Every Trip, Every Document, Everyone</div>
            </div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(245,236,215,0.45)', padding: '0 10px 8px' }}>WORKSPACE</div>
          {navItems.map(n => (
            <button key={n.label} onClick={n.go}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', marginBottom: 4, border: 'none', borderRadius: 11, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, textAlign: 'left',
                background: n.active ? '#F5ECD7' : 'transparent', color: n.active ? '#5C1A1A' : 'rgba(245,236,215,0.82)' }}>
              <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>{n.icon}</span> {n.label}
              {n.active && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#C04428' }} />}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={onOpenAccount} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 8px', border: 'none', borderRadius: 12, cursor: 'pointer', background: 'rgba(245,236,215,0.06)', color: '#F5ECD7', textAlign: 'left' }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', background: 'rgba(245,236,215,0.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
              {profile && profile.pic ? <img src={profile.pic} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(session && session.name) || ''}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'rgba(245,236,215,0.55)' }}>{roleLabel}</span>
            </span>
          </button>
        </aside>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top bar */}
        {wide ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, padding: '18px 32px 0' }}>
            {canCreate && (
              <button onClick={onNewTrip} style={{ background: '#5C1A1A', color: '#F5ECD7', border: 'none', borderRadius: 24, padding: '10px 20px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(92,26,26,0.25)' }}>+ New trip</button>
            )}
            {avatarBtn}
          </div>
        ) : (
          <div style={{ background: '#5C1A1A', boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 12px' }}>
              <img src="/logo-travelhub.png" alt="" width="34" height="34" style={{ borderRadius: 9, display: 'block', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17.5, fontWeight: 800, color: '#F5ECD7', lineHeight: 1.15 }}>My Travel Hub</div>
                <div style={{ fontSize: 9.5, color: 'rgba(245,236,215,0.55)', letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 2, lineHeight: 1.35 }}>Every Trip, Every Document, Everyone</div>
              </div>
              {canCreate && (
                <button onClick={onNewTrip} style={{ background: '#F5ECD7', color: '#5C1A1A', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>+ New trip</button>
              )}
              <button onClick={onOpenAccount} aria-label="Account"
                style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(245,236,215,0.5)', background: 'rgba(245,236,215,0.12)', cursor: 'pointer', padding: 0, flexShrink: 0, color: '#F5ECD7', fontSize: 14, fontWeight: 800 }}>
                {profile && profile.pic ? <img src={profile.pic} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
              </button>
            </div>
          </div>
        )}

        <div style={{ maxWidth: 1180, margin: '0 auto', padding: wide ? '14px 32px 48px' : '18px 16px 40px', display: 'flex', gap: 24, alignItems: 'flex-start', flexDirection: wide ? 'row' : 'column' }}>
          {/* Main column */}
          <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
            <div style={{ ...capsLabel, color: '#B54030' }}>{dateLine}</div>
            <h2 style={{ margin: '6px 0 4px', fontSize: wide ? 38 : 27, fontWeight: 800, color: '#6E1A10', letterSpacing: '-0.01em', lineHeight: 1.1 }}>Good {greet}, {firstName}.</h2>
            <p style={{ margin: 0, fontSize: 14, color: '#8A7A6D' }}>Here's what's happening across your family's journeys.</p>

            {/* Hero: trip in progress */}
            {hero && heroX && (
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, marginTop: 22, padding: wide ? '26px 28px' : '20px 18px', color: '#F5ECD7', background: 'linear-gradient(115deg, #7E2415 0%, #5C150C 55%, #46100A 100%)', boxShadow: '0 14px 34px rgba(70,16,10,0.3)' }}>
                <div style={{ position: 'absolute', right: -60, bottom: -90, width: 260, height: 260, borderRadius: '50%', background: 'rgba(245,236,215,0.10)' }} />
                <div style={{ position: 'absolute', right: 70, top: -40, width: 130, height: 130, borderRadius: '50%', background: 'rgba(245,236,215,0.07)' }} />
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7DB87A' }} /> TRIP IN PROGRESS
                  </div>
                  <div style={{ fontSize: wide ? 34 : 24, fontWeight: 800, margin: '10px 0 6px', lineHeight: 1.1 }}>{hero.name || 'Current trip'}</div>
                  <div style={{ fontSize: 12.5, color: 'rgba(245,236,215,0.75)' }}>
                    {hero.destination && <span>📍 {hero.destination}</span>}
                    {heroX.total && heroX.dayN != null && heroX.dayN >= 1 && heroX.dayN <= heroX.total && <span style={{ marginLeft: hero.destination ? 10 : 0 }}>· Day {heroX.dayN} of {heroX.total}</span>}
                  </div>
                  {heroX.next && (
                    <button onClick={() => onOpenTrip(hero.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, background: 'rgba(0,0,0,0.28)', border: 'none', borderRadius: 13, padding: '10px 14px', color: '#F5ECD7', cursor: 'pointer', textAlign: 'left', maxWidth: 430, width: wide ? 'auto' : '100%' }}>
                      <span style={{ flexShrink: 0 }}>
                        <span style={{ display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: 'rgba(245,236,215,0.6)' }}>NEXT</span>
                        <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>{heroX.next.time}</span>
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{heroX.next.title || '(untitled)'}</span>
                        {heroX.next.location && <span style={{ display: 'block', fontSize: 11.5, color: 'rgba(245,236,215,0.65)' }}>{heroX.next.location}</span>}
                      </span>
                      <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#F5ECD7', color: '#5C1A1A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>→</span>
                    </button>
                  )}
                  {!heroX.next && (
                    <button onClick={() => onOpenTrip(hero.id)} style={{ marginTop: 16, background: 'rgba(0,0,0,0.28)', border: 'none', borderRadius: 13, padding: '10px 16px', color: '#F5ECD7', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Open itinerary →</button>
                  )}
                  {heroX.total && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ height: 5, borderRadius: 3, background: 'rgba(245,236,215,0.22)', overflow: 'hidden' }}>
                        <div style={{ width: `${heroX.pct}%`, height: '100%', background: '#F5ECD7', borderRadius: 3 }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(245,236,215,0.6)', marginTop: 6 }}>
                        <span>{Math.max(0, Math.min(heroX.dayN != null ? heroX.dayN : 0, heroX.total))} day{heroX.dayN === 1 ? '' : 's'} in</span>
                        <span>{Math.max(0, heroX.total - (heroX.dayN != null ? heroX.dayN : 0))} days to go</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* My trips */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '30px 0 12px' }}>
              <div>
                <div style={capsLabel}>YOUR JOURNEYS</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#6E1A10', marginTop: 3 }}>My trips</div>
              </div>
              <button onClick={onMyTrips} style={{ background: 'none', border: 'none', color: '#8B2A14', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>View all →</button>
            </div>
            {trips.length === 0 && (
              <div style={{ ...panel, textAlign: 'center', color: '#9A8478', fontSize: 13.5 }}>
                {canCreate ? 'No trips yet — tap “+ New trip” to plan your first journey.' : 'No trips yet — ask a Trip Captain to add you to one.'}
              </div>
            )}
            {[...trips.filter(t => tripStatusOf(t) === 'active'), ...trips.filter(t => tripStatusOf(t) === 'todo'), ...trips.filter(t => tripStatusOf(t) === 'done')].map(t => {
              const r = tripDateRange(t); const c = chipFor(t);
              return (
                <button key={t.id} onClick={() => onOpenTrip(t.id)}
                  style={{ ...panel, background: 'rgba(255,250,240,0.85)', width: '100%', display: 'flex', gap: 16, alignItems: 'center', textAlign: 'left', cursor: 'pointer', marginBottom: 12, padding: 14 }}>
                  <TripArt status={tripStatusOf(t)} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: c.color }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} /> {c.label}
                    </span>
                    <span style={{ display: 'block', fontSize: 16.5, fontWeight: 800, color: '#3D0C02', margin: '4px 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name || 'Unnamed trip'}</span>
                    {t.destination && <span style={{ display: 'block', fontSize: 12, color: '#8B5A3C', marginBottom: 3 }}>📍 {t.destination}</span>}
                    <span style={{ display: 'flex', gap: 14, fontSize: 11.5, color: '#9A8478', flexWrap: 'wrap' }}>
                      <span>🕒 {r.start ? `${fmtDate(r.start).replace(/ \d{4}$/, '')}${r.end && r.end !== r.start ? ` – ${fmtDate(r.end)}` : ` ${r.start.slice(0, 4)}`}` : 'Dates not set'}</span>
                      <span>👥 {(t.members || []).length || 1} traveler{((t.members || []).length || 1) === 1 ? '' : 's'}</span>
                    </span>
                  </span>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid #D4BFB0', color: '#8B2A14', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>→</span>
                </button>
              );
            })}
          </div>

          {/* Right rail */}
          <div style={{ width: wide ? 330 : '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Family status (hero trip) */}
            {hero && (hero.members || []).length > 0 && (
              <div style={panel}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ ...capsLabel }}>{(hero.name || 'TRIP').toUpperCase()}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, color: '#2F7A2F' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3C8A3C' }} /> LIVE
                  </span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#3D0C02', marginBottom: 10 }}>Family status</div>
                {(hero.members || []).map(m => {
                  const s = memberNow(m);
                  const ini = ((m.name || m.userId || '?').trim().charAt(0) || '?').toUpperCase();
                  return (
                    <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #EFE6D6' }}>
                      <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#EFE3CC', color: '#8B5A3C', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>{ini}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3D0C02' }}>{(m.name || m.userId).split(/\s+/)[0]}</span>
                        <span style={{ display: 'block', fontSize: 11, color: '#9A8478', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.line}</span>
                      </span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '2px 8px', flexShrink: 0, color: s.ok ? STATUS_META.active.color : '#8A7A6D', background: s.ok ? STATUS_META.active.bg : '#EDE5D4' }}>{s.chip}</span>
                    </div>
                  );
                })}
                <button onClick={() => onOpenStatus(hero.id)}
                  style={{ width: '100%', marginTop: 12, background: 'transparent', border: '1.5px solid #D4BFB0', borderRadius: 12, padding: '10px 0', color: '#6E1A10', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Open live trip status →
                </button>
              </div>
            )}

            {/* Personal to-do */}
            <div style={panel}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={capsLabel}>PERSONAL</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#3D0C02', marginTop: 2 }}>To-do</div>
                </div>
                <button onClick={() => setAddingTodo(a => !a)} aria-label="Add to-do"
                  style={{ width: 32, height: 32, borderRadius: 10, border: '1.5px solid #D4BFB0', background: 'transparent', color: '#8B2A14', fontSize: 17, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>+</button>
              </div>
              {addingTodo && (
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <input autoFocus value={todoInput} onChange={e => setTodoInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addTodo(); if (e.key === 'Escape') setAddingTodo(false); }}
                    placeholder="Add a to-do…"
                    style={{ flex: 1, minWidth: 0, padding: '7px 10px', border: '1px solid #D4BFB0', borderRadius: 8, fontSize: 13, background: '#FFFDF7', color: '#3D0C02', outline: 'none' }} />
                  <Btn onClick={addTodo} style={{ padding: '6px 14px', fontSize: 12.5 }}>Add</Btn>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                {todos.length === 0 && !addingTodo && <div style={{ fontSize: 12.5, color: '#9A8478', paddingTop: 6 }}>Nothing on the list — tap + to add one.</div>}
                {todos.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #EFE6D6' }}>
                    <button onClick={() => toggleTodo(t.id)} aria-label="Toggle"
                      style={{ width: 19, height: 19, borderRadius: 6, flexShrink: 0, cursor: 'pointer', border: t.done ? 'none' : '1.5px solid #C8B09A', background: t.done ? '#3C8A3C' : 'transparent', color: '#fff', fontSize: 12, fontWeight: 800, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      {t.done ? '✓' : ''}
                    </button>
                    <span style={{ flex: 1, fontSize: 13, color: '#3D0C02', textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.5 : 1, wordBreak: 'break-word' }}>{t.text}</span>
                    <button onClick={() => delTodo(t.id)} style={{ background: 'none', border: 'none', color: '#C04428', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick note */}
            <div style={{ ...panel, background: '#DFCA9F', border: '1px solid #CBB27E', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: -24, bottom: -34, width: 110, height: 110, borderRadius: '50%', border: '10px solid rgba(255,250,240,0.35)' }} />
              <div style={{ ...capsLabel, color: '#7A5A24' }}>QUICK NOTE</div>
              {editingNote ? (
                <>
                  <textarea autoFocus value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                    placeholder="Jot down ideas, reminders, packing thoughts…"
                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', marginTop: 10, padding: '9px 11px', border: '1px solid #B99F63', borderRadius: 10, background: '#F2E7CB', color: '#3D2A08', fontSize: 13.5, fontFamily: 'Georgia, serif', lineHeight: 1.5, outline: 'none' }} />
                  <button onClick={saveNotes} style={{ marginTop: 8, background: '#7A5A24', color: '#F5ECD7', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                </>
              ) : (
                <>
                  <p style={{ margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.5, color: '#3D2A08', fontFamily: 'Georgia, serif', whiteSpace: 'pre-wrap', position: 'relative' }}>
                    {savedNotes || <span style={{ opacity: 0.55 }}>Jot down ideas, reminders, packing thoughts…</span>}
                  </p>
                  <button onClick={() => setEditingNote(true)} style={{ marginTop: 10, background: 'none', border: 'none', color: '#7A5A24', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 0, position: 'relative' }}>Edit note</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeTab, setActiveTab] = useState("Schedule");
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [showToday, setShowToday] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [accountMode, setAccountMode] = useState('login'); // which tab the account modal opens on
  const [showTravelers, setShowTravelers] = useState(false);
  const [session, setSession] = useState(loadAuth);
  const [showDashboard, setShowDashboard] = useState(true); // post-login landing page
  const [profile, setProfile] = useState(() => { try { const p = localStorage.getItem('travelerProfile'); return p ? JSON.parse(p) : null; } catch(e){ return null; } });
  const [editingDest, setEditingDest] = useState(false);
  const [destDraft, setDestDraft] = useState('');
  const [headerNote, setHeaderNote] = useState('');
  const [savedStatus, setSavedStatus] = useState(''); // '', 'saving', 'saved'
  const [past, setPast] = useState([]); // undo history: recent trips snapshots (max 3)

  // Snapshot current trips before a mutation so it can be reverted (keep last 3)
  const recordHistory = () => setPast(p => [trips, ...p].slice(0, 3));
  const undo = () => {
    if (past.length === 0) return;
    const [snapshot, ...rest] = past;
    setTrips(snapshot);
    setPast(rest);
    setActiveTrip(a => snapshot.some(t => t.id === a) ? a : (snapshot[0] ? snapshot[0].id : null));
  };

  // Where trips live: 'rls' = the per-trip table Postgres protects (each traveler
  // only ever receives their own trips); 'legacy' = the old shared blob, used
  // while signed out and until the RLS migration has been run.
  const cloudMode = useRef('unknown');
  const savedRef = useRef({}); // tripId -> last JSON persisted, so we only write changes
  const sessionKey = session ? session.userId : '';

  // Load trips whenever the signed-in traveler changes
  useEffect(() => {
    let cancelled = false;
    const loadLegacy = async () => {
      const cloudData = await loadFromCloud();
      if (cancelled) return;
      if (cloudData && cloudData.trips && cloudData.trips.length > 0) {
        setTrips(cloudData.trips);
        setActiveTrip(a => a || cloudData.trips[0].id);
        if (cloudData.header_note) setHeaderNote(cloudData.header_note);
        try { localStorage.setItem('travelPlannerData', JSON.stringify({ trips: cloudData.trips })); } catch(e) {}
      } else {
        try {
          const sv = localStorage.getItem('travelPlannerData');
          if (sv) { const { trips: t } = JSON.parse(sv); if (t && t.length) { setTrips(t); setActiveTrip(a => a || t[0].id); } }
        } catch(e) {}
      }
    };
    (async () => {
      // Signed out shows only the landing page, so load nothing: the old shared
      // blob would otherwise hand this browser somebody else's trips and header
      // note, and the note would then follow whoever logs in next.
      if (!session) { cloudMode.current = 'legacy'; setTrips([]); setHeaderNote(''); return; }
      const s = await freshSession(session, setSession);
      const res = await tripsFetch(s);
      if (cancelled) return;
      if (res.mode === 'rls') {
        cloudMode.current = 'rls';
        const list = res.trips || [];
        savedRef.current = {};
        list.forEach(t => { savedRef.current[t.id] = JSON.stringify(tripData(t)); });
        setTrips(list);
        setActiveTrip(a => list.some(t => t.id === a) ? a : (list[0] ? list[0].id : null));
        try { localStorage.setItem('travelPlannerData', JSON.stringify({ trips: list })); } catch(e) {}
      } else if (res.mode === 'legacy') {
        cloudMode.current = 'legacy';
        await loadLegacy();
      } else if (res.mode === 'unauthorized') {
        setSession(null); saveAuth(null); // signed-in state is stale — ask for a fresh login
      }
      // on a network error keep whatever is already on screen
    })();
    return () => { cancelled = true; };
  }, [sessionKey]);

  // The header note used to live in the one shared row. With trips isolated per
  // traveler it becomes personal, and rides along in the account's profile.
  useEffect(() => {
    if (cloudMode.current !== 'rls' || !session || !profile) return;
    if ((profile.headerNote || '') === headerNote) return;
    const timer = setTimeout(() => {
      const p = { ...profile, headerNote };
      setProfile(p);
      directorySaveProfile(session, p.name || session.name, p);
    }, 1500);
    return () => clearTimeout(timer);
  }, [headerNote, profile, session]);

  // Auto-save: debounce 2s after any change to trips
  useEffect(() => {
    if (trips.length === 0) return;
    const timer = setTimeout(async () => {
      try { localStorage.setItem('travelPlannerData', JSON.stringify({ trips })); } catch(e) {}
      if (cloudMode.current !== 'rls') { saveToCloud(trips, headerNote); return; }
      if (!session) return;
      const s = await freshSession(session, setSession);
      trips.forEach(t => { // one row per trip → only the edited ones are written
        const body = JSON.stringify(tripData(t));
        if (savedRef.current[t.id] === body) return;
        savedRef.current[t.id] = body;
        tripPatch(s, t.id, { data: JSON.parse(body) });
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [trips, headerNote, session]);

  const handleSave = async () => {
    setSavedStatus('saving');
    // Save to localStorage immediately
    try { localStorage.setItem('travelPlannerData', JSON.stringify({ trips })); } catch(e) {}
    // Save to cloud
    try {
      if (cloudMode.current === 'rls' && session) {
        const s = await freshSession(session, setSession);
        await Promise.all(trips.map(t => {
          const body = JSON.stringify(tripData(t));
          savedRef.current[t.id] = body;
          return tripPatch(s, t.id, { data: JSON.parse(body) });
        }));
      } else {
        await saveToCloud(trips, headerNote);
      }
    } catch(e) {}
    setSavedStatus('saved');
    setTimeout(() => setSavedStatus(''), 2500);
  };
  const [tripForm, setTripForm] = useState({ name:"", destination:"", startDate:"", endDate:"" });
  const [createErr, setCreateErr] = useState('');

  const createTrip = async () => {
    if (!tripForm.name) return;
    recordHistory();
    const t = { ...defaultTrip(), ...tripForm };
    if (session) { t.ownerId = session.userId; t.members = [{ userId: session.userId, name: session.name, role:'captain' }]; }
    if (cloudMode.current === 'rls' && session) {
      // The row must exist before the auto-save can patch it
      const s = await freshSession(session, setSession);
      const row = await tripCreate(s, t);
      if (!row) { setCreateErr("Couldn't create the trip — check your connection and try again."); return; }
      savedRef.current[row.id] = JSON.stringify(tripData(row));
      setTrips(prev => [...prev, row]);
      setActiveTrip(row.id);
    } else {
      setTrips(prev => [...prev, t]);
      setActiveTrip(t.id);
    }
    setCreateErr('');
    setShowNewTrip(false);
    setTripForm({ name:"", destination:"", startDate:"", endDate:"" });
  };

  const deleteTrip = async (id) => {
    recordHistory();
    const updated = trips.filter(t=>t.id!==id);
    setTrips(updated);
    setActiveTrip(updated.length>0 ? updated[0].id : null);
    delete savedRef.current[id];
    if (cloudMode.current === 'rls' && session) {
      const s = await freshSession(session, setSession);
      tripDelete(s, id);
    }
  };

  const updateTrip = (id, patch) => {
    recordHistory();
    // patch may be a plain object (most tabs) or an updater fn (Pictures tab)
    setTrips(prev => prev.map(t =>
      t.id===id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t
    ));
  };

  // Profile is per-account when logged in (synced via the directory), else device-local
  useEffect(() => {
    let cancelled = false;
    if (session) {
      directoryGetProfile(session).then(res => {
        if (cancelled) return;
        const prof = (res && res.profile) ? res.profile : {};
        setProfile({ name: (res && res.name) || session.name, ...prof });
        if (typeof prof.headerNote === 'string') setHeaderNote(prof.headerNote);
      });
    } else {
      try { const p = localStorage.getItem('travelerProfile'); setProfile(p ? JSON.parse(p) : null); } catch(e){ setProfile(null); }
    }
    return () => { cancelled = true; };
  }, [session]);

  const saveProfile = (p) => {
    setProfile(p);
    if (session) directorySaveProfile(session, p.name || session.name, p);
    else { try { localStorage.setItem('travelerProfile', JSON.stringify(p)); } catch(e){} }
    setShowProfile(false);
  };

  const onAuth = (s) => { setSession(s); saveAuth(s); setShowDashboard(true); };
  const onLogout = () => { authSignOut(session); setSession(null); saveAuth(null); setShowAccount(false); };

  // ── Roles & permissions (UI-level) ──
  // Profile type: captain (can create trips) | traveler (limited) | viewer (view only).
  // Per-trip: the CREATOR is that trip's captain by default; added members join as travelers,
  // and only the creator can promote a member to captain (or demote them back).
  const myRole = (session && session.role) || 'captain';
  const isTripCreator = (t) => !!t && (!t.ownerId || (session && t.ownerId === session.userId)); // legacy unowned trips stay open
  const isTripCaptain = (t) => !!t && (isTripCreator(t) || (session && (t.members || []).some(m => m.userId === session.userId && m.role === 'captain')));

  // Trip viewers (viewer accounts a captain has shared the trip with)
  const addViewer = (tripId, member) => {
    updateTrip(tripId, t => ({ viewers: [...(t.viewers||[]).filter(v => v.userId !== member.userId), { userId: member.userId, name: member.name }] }));
    syncRoster(tripId, 'viewer_uids', member.uid, true);
  };
  const removeViewer = async (tripId, userId) => {
    updateTrip(tripId, t => ({ viewers: (t.viewers||[]).filter(v => v.userId !== userId) }));
    syncRoster(tripId, 'viewer_uids', await uidOf(userId), false);
  };

  // ── Trip travelers (members) ──
  // Add a traveler; also stamps ownership/self onto legacy (unowned) trips on first add
  // Grant/revoke real access: member_uids and viewer_uids are what the database
  // policies read, so they must track the trip's rosters.
  const syncRoster = async (tripId, column, uid, add) => {
    if (cloudMode.current !== 'rls' || !session || !uid) return;
    const key = column === 'member_uids' ? 'memberUids' : 'viewerUids';
    const cur = ((trips.find(x => x.id === tripId) || {})[key]) || [];
    const next = add ? (cur.includes(uid) ? cur : [...cur, uid]) : cur.filter(x => x !== uid);
    const s = await freshSession(session, setSession);
    await tripPatch(s, tripId, { [column]: next });
    setTrips(prev => prev.map(x => x.id === tripId ? { ...x, [key]: next } : x));
  };
  const uidOf = async (userId) => { const f = await directoryLookup(userId); return f ? f.uid : ''; };

  const addMember = (tripId, member) => {
    updateTrip(tripId, t => {
      const owner = t.ownerId || (session ? session.userId : "");
      let members = Array.isArray(t.members) ? [...t.members] : [];
      if (session && owner === session.userId && !members.some(m => m.userId === session.userId)) members.push({ userId: session.userId, name: session.name, role:'captain' });
      if (!members.some(m => m.userId === member.userId)) members.push({ userId: member.userId, name: member.name, role:'traveler' }); // everyone added joins as a traveler
      return { ownerId: owner, members };
    });
    syncRoster(tripId, 'member_uids', member.uid, true);
  };
  const removeMember = async (tripId, userId) => {
    updateTrip(tripId, t => ({ members: (t.members || []).filter(m => m.userId !== userId) }));
    syncRoster(tripId, 'member_uids', await uidOf(userId), false);
  };
  // Promote/demote a member's per-trip role (creator only, gated in the UI)
  const setMemberRole = (tripId, userId, role) => updateTrip(tripId, t => ({ members: (t.members || []).map(m => m.userId === userId ? { ...m, role } : m) }));

  const goToTrip = (id) => { setActiveTrip(id); setActiveTab('Schedule'); setShowSearch(false); setShowDashboard(false); };

  // Trips visible to the signed-in traveler: unowned/legacy, owned by me, or shared with me.
  // Logged out shows everything (unchanged behaviour).
  const myId = session ? session.userId : null;
  const visibleTrips = myId
    ? trips.filter(t => !t.ownerId || t.ownerId === myId || (t.members || []).some(m => m.userId === myId))
    : trips;

  // Keep the active trip valid when login state changes (or the trip set changes)
  useEffect(() => {
    if (activeTrip && !visibleTrips.some(t => t.id === activeTrip)) {
      setActiveTrip(visibleTrips.length ? visibleTrips[0].id : null);
    }
  }, [session, trips, activeTrip]); // visibleTrips derives from these

  const trip = visibleTrips.find(t=>t.id===activeTrip);

  // Local calendar date as YYYY-MM-DD, for the Today's Plan view
  const todayISO = (() => { const d = new Date(); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })();
  const dateRange = trip ? tripDateRange(trip) : { start:"", end:"" };

  // ── Landing page for logged-out visitors ──
  if (!session) {
    const openAccount = (mode) => { setAccountMode(mode); setShowAccount(true); };
    const features = [
      { icon:"🗓️", title:"Plan your itinerary", desc:"Days, events, stays and travel — one clean timeline." },
      { icon:"📎", title:"Docs in one place", desc:"Tickets, bookings and PDFs, always within reach." },
      { icon:"👥", title:"Travel as a group", desc:"Add travellers and track everyone's progress." },
      { icon:"📍", title:"Live trip status", desc:"Follow the journey live and share a read-only link." },
    ];
    return (
      <div style={{ fontFamily:"var(--font-body)", maxWidth:680, margin:"0 auto", minHeight:"100vh", background:"#F0EBE0", paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
        {/* Hero */}
        <div style={{ background:"radial-gradient(120% 90% at 50% 0%, #7A241A 0%, #5C1A1A 58%)", padding:"calc(env(safe-area-inset-top, 0px) + 56px) 24px 52px", textAlign:"center", boxShadow:"0 2px 18px rgba(0,0,0,0.22)" }}>
          <img src="/logo-travelhub.png" alt="My Travel Hub" width="86" height="86" style={{ borderRadius:22, display:"block", margin:"0 auto 18px", boxShadow:"0 8px 26px rgba(0,0,0,0.32)" }} />
          <h1 style={{ margin:0, fontSize:30, fontWeight:800, color:"#F5ECD7", letterSpacing:"0.06em", textTransform:"uppercase", lineHeight:1.1 }}>My Travel Hub</h1>
          <p style={{ margin:"14px auto 0", fontSize:15.5, lineHeight:1.55, color:"rgba(245,236,215,0.82)", maxWidth:430 }}>
            Every trip, every document, everyone — in one place.
          </p>
          <button onClick={()=>openAccount('signup')}
            style={{ marginTop:28, background:"#F5ECD7", color:"#5C1A1A", border:"none", borderRadius:30, padding:"13px 38px", fontSize:15, fontWeight:700, letterSpacing:"0.02em", cursor:"pointer", boxShadow:"0 5px 18px rgba(0,0,0,0.28)" }}>
            Get Started
          </button>
          <div style={{ marginTop:14, fontSize:12.5, color:"rgba(245,236,215,0.62)" }}>Free · just a User ID to begin</div>
        </div>

        {/* Feature highlights */}
        <div style={{ padding:"38px 20px 4px" }}>
          <div style={{ textAlign:"center", fontSize:12, fontWeight:700, letterSpacing:"0.15em", textTransform:"uppercase", color:"#B07A4A", marginBottom:20 }}>Everything for the trip</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(148px, 1fr))", gap:12 }}>
            {features.map(f => (
              <div key={f.title} style={{ background:"#EDE7D9", border:"1px solid #E2D8C8", borderRadius:14, padding:"18px 16px" }}>
                <div style={{ fontSize:26, marginBottom:8 }}>{f.icon}</div>
                <div style={{ fontSize:14.5, fontWeight:700, color:"#6E1A10", marginBottom:4 }}>{f.title}</div>
                <div style={{ fontSize:12.5, color:"#8A7A6D", lineHeight:1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{ textAlign:"center", padding:"30px 24px 46px" }}>
          <button onClick={()=>openAccount('signup')}
            style={{ background:"#6E1A10", color:"#fff", border:"none", borderRadius:30, padding:"13px 42px", fontSize:15, fontWeight:700, cursor:"pointer", boxShadow:"0 5px 16px rgba(110,26,16,0.3)" }}>
            Create your account
          </button>
          <div style={{ marginTop:16, fontSize:13, color:"#8A7A6D" }}>
            Already travelling with us? <span onClick={()=>openAccount('login')} style={{ color:"#8B2A14", fontWeight:700, cursor:"pointer", textDecoration:"underline" }}>Log in</span>
          </div>
          <div style={{ marginTop:22, fontSize:11.5, color:"#B0A091", letterSpacing:"0.04em" }}>🏔️  Made for families & groups on the move</div>
        </div>

        {showAccount && (
          <AccountModal session={null} profile={null} startMode={accountMode} onAuth={onAuth} onLogout={onLogout} onOpenDetails={()=>{}} onClose={()=>setShowAccount(false)} />
        )}
      </div>
    );
  }

  // ── Viewer accounts: view-only home listing trips shared with them ──
  if (myRole === 'viewer') {
    const shared = trips.filter(t => (t.viewers || []).some(v => v.userId === session.userId));
    return (
      <>
        <ViewerHome session={session} profile={profile} trips={shared} onOpenAccount={()=>setShowAccount(true)} />
        {showAccount && (
          <AccountModal session={session} profile={profile} onAuth={onAuth} onLogout={onLogout}
            onOpenDetails={()=>{ setShowAccount(false); setShowProfile(true); }} onClose={()=>setShowAccount(false)} />
        )}
        {showProfile && (
          <ProfileModal initial={profile} onSave={saveProfile} onClose={()=>setShowProfile(false)} />
        )}
      </>
    );
  }

  // ── Dashboard: where a signed-in traveler lands ──
  if (showDashboard) {
    return (
      <>
        <Dashboard
          session={session}
          profile={profile}
          trips={visibleTrips}
          canCreate={myRole === 'captain'}
          onOpenTrip={(id)=>{ setActiveTrip(id); setActiveTab('Schedule'); setShowDashboard(false); }}
          onOpenStatus={(id)=>{ setActiveTrip(id); setActiveTab('Status'); setShowDashboard(false); }}
          onMyTrips={()=>setShowDashboard(false)}
          onCalendar={()=>{ setShowDashboard(false); setShowToday(true); }}
          onNewTrip={()=>{ setShowDashboard(false); setShowNewTrip(true); }}
          onOpenAccount={()=>setShowAccount(true)}
          onSaveData={(patch)=>{ const p = { ...(profile||{}), ...patch }; setProfile(p); directorySaveProfile(session, p.name || session.name, p); }}
        />
        {showAccount && (
          <AccountModal session={session} profile={profile} onAuth={onAuth} onLogout={onLogout}
            onOpenDetails={()=>{ setShowAccount(false); setShowProfile(true); }} onClose={()=>setShowAccount(false)} />
        )}
        {showProfile && (
          <ProfileModal initial={profile} onSave={saveProfile} onClose={()=>setShowProfile(false)} />
        )}
      </>
    );
  }


  return (
    <div style={{ fontFamily:"var(--font-body)",maxWidth:680,margin:"0 auto",minHeight:"100vh",background:"#F0EBE0",paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
      {/* Header */}
      <div style={{ background:"#5C1A1A",borderBottom:"none",boxShadow:"0 2px 12px rgba(0,0,0,0.18)" }}>
        {/* Row 1: logo + title */}
        <div style={{ display:"flex",alignItems:"center",padding:"calc(env(safe-area-inset-top, 0px) + 16px) 20px 0" }}>
          {/* Logo + Title */}
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <img src="/logo-travelhub.png" alt="My Travel Hub" width="38" height="38" style={{ flexShrink:0, borderRadius:9, display:"block" }} />
            <div>
              <h1 style={{ margin:0,fontSize:20,fontWeight:800,color:"#F5ECD7",letterSpacing:"0.03em",lineHeight:1.15,textTransform:"uppercase" }}>My Travel Hub</h1>
              <p style={{ margin:0,fontSize:10.5,color:"rgba(245,236,215,0.6)",letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:500,marginTop:3 }}>Every trip, every document, everyone — in one place</p>
            </div>
          </div>
        </div>
        {/* Row 2: action toolbar */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px 6px" }}>
            <button onClick={()=>setShowDashboard(true)} aria-label="Dashboard" title="Dashboard" style={{ width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,border:"1.5px solid rgba(245,236,215,0.28)",background:"rgba(245,236,215,0.08)",color:"#F5ECD7",padding:0,cursor:"pointer",transition:"all 0.3s" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
            </button>
            <button onClick={()=>setShowSearch(true)} aria-label="Search" title="Search" style={{ width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,border:"1.5px solid rgba(245,236,215,0.28)",background:"rgba(245,236,215,0.08)",color:"#F5ECD7",padding:0,cursor:"pointer",transition:"all 0.3s" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </button>
            <button onClick={()=>setShowDocs(true)} aria-label="Documents" title="Documents" style={{ width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,border:"1.5px solid rgba(245,236,215,0.28)",background:"rgba(245,236,215,0.08)",color:"#F5ECD7",padding:0,cursor:"pointer",transition:"all 0.3s" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
            </button>
            <button onClick={()=>{ if(trip) exportTripHtml(trip); }} aria-label="Export itinerary" title="Export itinerary" style={{ width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,border:"1.5px solid rgba(245,236,215,0.28)",background:"rgba(245,236,215,0.08)",color:"#F5ECD7",padding:0,cursor:"pointer",transition:"all 0.3s" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            </button>
            <button
              onClick={()=>setShowToday(true)}
              aria-label="Today's plan"
              title="Today's plan"
              style={{
                width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",
                borderRadius:10,border:"1.5px solid rgba(245,236,215,0.28)",background:"rgba(245,236,215,0.08)",
                color:"#F5ECD7",padding:0,cursor:"pointer",transition:"all 0.3s"
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V8h16v11zm-2-8h-6v6h6v-6z"/></svg>
            </button>
            <button
              onClick={undo}
              disabled={past.length===0}
              title={past.length ? `Undo last change (${past.length} available)` : 'Nothing to undo'}
              aria-label="Undo"
              style={{
                width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",
                borderRadius:10,border:"1.5px solid rgba(245,236,215,0.28)",background:"rgba(245,236,215,0.08)",
                color:"#F5ECD7",padding:0,
                cursor: past.length ? "pointer" : "not-allowed",
                opacity: past.length ? 1 : 0.4,
                transition:"all 0.3s"
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
            </button>
            <button
              onClick={handleSave}
              aria-label={savedStatus==='saved'?'Saved':'Save'}
              title={savedStatus==='saved'?'Saved':'Save'}
              style={{
                width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",
                borderRadius:10,padding:0,cursor:"pointer",transition:"all 0.3s",
                border: savedStatus==='saved'?'1.5px solid #7DB87A':'1.5px solid rgba(245,236,215,0.28)',
                background: savedStatus==='saved'?'rgba(125,184,122,0.22)':'rgba(245,236,215,0.08)',
                color: savedStatus==='saved'?'#A8E6A0':'#F5ECD7'
              }}
            >
              {savedStatus==='saved'
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                : savedStatus==='saving'
                  ? <span style={{ fontSize:17,lineHeight:1 }}>…</span>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>}
            </button>
            <button
              onClick={()=>setShowAccount(true)}
              aria-label="Traveler account"
              title={session ? `Signed in as ${session.name}` : "Traveler account"}
              style={{ width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,border:"1.5px solid rgba(245,236,215,0.28)",background:"rgba(245,236,215,0.08)",color:"#F5ECD7",padding:0,cursor:"pointer",transition:"all 0.3s",overflow:"hidden" }}
            >
              {profile && profile.pic
                ? <img src={profile.pic} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                : session
                  ? <span style={{ fontSize:15, fontWeight:800, letterSpacing:0 }}>{((session.name||session.userId||'?').trim().charAt(0)||'?').toUpperCase()}</span>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>}
            </button>
          </div>
        {/* Header note */}
        <div style={{ padding:"0 20px 10px" }}>
          <textarea value={headerNote} onChange={e=>setHeaderNote(e.target.value)} placeholder="Add a trip note or travel tagline…" rows={1} style={{ width:"100%",boxSizing:"border-box",resize:"none",padding:"7px 12px",border:"1px solid rgba(245,236,215,0.2)",borderRadius:7,background:"rgba(0,0,0,0.15)",color:"rgba(245,236,215,0.85)",fontSize:12,fontFamily:"inherit",outline:"none",lineHeight:1.5,letterSpacing:"0.01em" }} />
        </div>
        {/* Trip tabs */}
        <div style={{ display:"flex",gap:2,overflowX:"auto",padding:"0 20px",paddingBottom:0 }}>
          {visibleTrips.map(t=>(
            <button key={t.id} onClick={()=>setActiveTrip(t.id)}
              style={{
                padding:"8px 16px",
                borderRadius:"6px 6px 0 0",
                border:"none",
                borderTop: activeTrip===t.id?"2px solid rgba(245,236,215,0.7)":"2px solid transparent",
                background: activeTrip===t.id?"#F0EBE0":"rgba(0,0,0,0.18)",
                fontWeight: activeTrip===t.id?700:400,
                fontSize:13,cursor:"pointer",
                color: activeTrip===t.id?"#5C1A1A":"rgba(245,236,215,0.65)",
                whiteSpace:"nowrap",
                transition:"all 0.15s"
              }}>
              {tripStatusOf(t)!=='todo' && <span title={TRIP_STATUS[tripStatusOf(t)].label} style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:TRIP_STATUS[tripStatusOf(t)].dot, marginRight:6, verticalAlign:"middle" }} />}
              {t.name||"Unnamed"}
            </button>
          ))}
          {/* New Trip tab — Trip Captains only */}
          {myRole === 'captain' && (
          <button
            onClick={()=>setShowNewTrip(true)}
            title="New Trip"
            aria-label="New Trip"
            style={{
              padding:"8px 16px",
              borderRadius:"6px 6px 0 0",
              border:"none",
              borderTop:"2px solid transparent",
              background:"rgba(0,0,0,0.18)",
              fontWeight:700,
              fontSize:13,
              lineHeight:1,
              cursor:"pointer",
              color:"rgba(245,236,215,0.75)",
              whiteSpace:"nowrap",
              flexShrink:0,
              transition:"all 0.15s"
            }}>
            + Trip
          </button>
          )}
        </div>
      </div>

      {/* Trip content */}
      {!trip ? (
        <div style={{ textAlign:"center",marginTop:80,color:"#D47060" }}>
          <div style={{ fontSize:48,marginBottom:12 }}>🗺️</div>
          {myRole === 'captain' ? (
            <>
              <p style={{ fontSize:15 }}>No trips yet. Create your first one!</p>
              <Btn onClick={()=>setShowNewTrip(true)} style={{ marginTop:8 }}>+ New Trip</Btn>
            </>
          ) : (
            <p style={{ fontSize:15 }}>No trips yet — ask a Trip Captain to add you to one.</p>
          )}
        </div>
      ) : (
        <div style={{ padding:20 }}>
          {/* Trip info */}
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}>
            <div>
              <h2 style={{ margin:"0 0 2px",fontSize:18,fontWeight:700 }}>{trip.name}</h2>
              <div style={{ fontSize:13,color:"#B54030" }}>
                {editingDest ? (
                  <input
                    autoFocus
                    value={destDraft}
                    onChange={e=>setDestDraft(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); updateTrip(trip.id,{destination:destDraft.trim()}); setEditingDest(false); } if(e.key==='Escape'){ setEditingDest(false); } }}
                    onBlur={()=>{ updateTrip(trip.id,{destination:destDraft.trim()}); setEditingDest(false); }}
                    placeholder="e.g. Dubai - Delhi - Uttarakhand"
                    style={{ font:'inherit', fontSize:13, padding:'2px 6px', border:'1px solid #C8B09A', borderRadius:5, background:'#F5EFE2', color:'#6E1A10', outline:'none', minWidth:220, maxWidth:'100%' }}
                  />
                ) : (
                  <span onClick={()=>{ setDestDraft(trip.destination||''); setEditingDest(true); }} title="Click to edit destination" style={{ cursor:'text' }}>
                    📍 {trip.destination || <span style={{ color:'#C0A090', fontStyle:'italic' }}>add destination</span>}
                  </span>
                )}
                {dateRange.start && <span style={{ marginLeft:8 }}>🗓 {fmtDate(dateRange.start)}{dateRange.end && dateRange.end!==dateRange.start ? ` → ${fmtDate(dateRange.end)}` : ""}</span>}
              </div>
              {/* Travelers + trip lifecycle status */}
              <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <button onClick={()=>setShowTravelers(true)} title="Travelers on this trip"
                  style={{ display:"inline-flex", alignItems:"center", gap:6, background:"#EDE7D9", border:"1px solid #D4BFB0", borderRadius:20, padding:"4px 12px", fontSize:12.5, color:"#6E1A10", cursor:"pointer" }}>
                  <span style={{ fontSize:14 }}>👥</span>
                  {(() => { const n = (trip.members || []).length; return n > 0
                    ? <span><strong>{n}</strong> traveler{n===1?'':'s'}</span>
                    : <span>Add travelers</span>; })()}
                </button>
                {(() => { const m = TRIP_STATUS[tripStatusOf(trip)]; return (
                  <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11, fontWeight:700, letterSpacing:"0.03em", color:m.color, background:m.bg, borderRadius:20, padding:"4px 10px" }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:m.dot }} />{m.label.toUpperCase()}
                  </span>
                ); })()}
                {tripStatusOf(trip)==='todo' && (
                  <button onClick={()=>updateTrip(trip.id,{status:'active'})} style={{ border:"none", borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer", background:"#6E1A10", color:"#fff" }}>▶ Start trip</button>
                )}
                {tripStatusOf(trip)==='active' && (
                  <button onClick={()=>updateTrip(trip.id,{status:'done'})} style={{ border:"none", borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer", background:"#3C8A3C", color:"#fff" }}>✓ Complete trip</button>
                )}
                {tripStatusOf(trip)==='done' && (
                  <button onClick={()=>updateTrip(trip.id,{status:'active'})} style={{ border:"1px solid #C8B09A", borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer", background:"transparent", color:"#8B2A14" }}>↺ Reopen</button>
                )}
              </div>
            </div>
            {isTripCreator(trip) && <Btn variant="danger" style={{ fontSize:12,padding:"4px 10px" }} onClick={()=>deleteTrip(trip.id)}>Delete Trip</Btn>}
          </div>

          {/* Inner tabs — sticky so you can switch tabs while scrolled down */}
          <div style={{ position:"sticky", top:"env(safe-area-inset-top, 0px)", zIndex:20, background:"#F0EBE0", margin:"0 -20px 20px", padding:"8px 20px", borderBottom: activeTab==="Schedule" ? "none" : "2px solid #C4A882" }}>
            <div style={{ display:"flex",gap:2,background:"#E8E2D4",borderRadius:8,padding:3 }}>
              {TABS.map(tab=>(
                <button key={tab} onClick={()=>setActiveTab(tab)}
                  style={{ flex:1,padding:"6px 0",border:"none",borderRadius:6,fontSize:13,cursor:"pointer",fontWeight:500,
                    background: activeTab===tab?"#F0EBE0":"transparent",
                    color: activeTab===tab?"#6E1A10":"#B54030",
                    boxShadow: activeTab===tab?"0 1px 3px rgba(0,0,0,.08)":"none" }}>
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {activeTab==="Schedule" && <ScheduleTab trip={trip} update={p=>updateTrip(trip.id,p)} session={session} canEdit={isTripCaptain(trip)} />}
          {activeTab==="Budget" && <BudgetTab trip={trip} update={p=>updateTrip(trip.id,p)} session={session} />}
          {activeTab==="Packing" && <PackingTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
          {activeTab==="Status" && <StatusTab trip={trip} session={session} update={p=>updateTrip(trip.id,p)} canUpdateOthers={isTripCaptain(trip)}
            shareUrl={`https://mytravelhub.netlify.app/?view=${trip.id}${trip.shareToken ? `&k=${encodeURIComponent(trip.shareToken)}` : ''}${!isTripCaptain(trip) && session ? `&t=${encodeURIComponent(session.userId)}` : ''}`} />}
          {activeTab==="Pictures" && <PicturesTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
        </div>
      )}

      {/* New Trip Modal */}
      {showNewTrip && (
        <Modal title="New Trip" onClose={()=>setShowNewTrip(false)}>
          <Input label="Trip Name *" placeholder="e.g. Tokyo Summer 2026" value={tripForm.name} onChange={e=>setTripForm({...tripForm,name:e.target.value})} />
          <Input label="Destination" placeholder="e.g. Tokyo, Japan" value={tripForm.destination} onChange={e=>setTripForm({...tripForm,destination:e.target.value})} />
          <Input label="Start Date" type="date" value={tripForm.startDate} onChange={e=>setTripForm({...tripForm,startDate:e.target.value})} />
          <Input label="End Date" type="date" value={tripForm.endDate} onChange={e=>setTripForm({...tripForm,endDate:e.target.value})} />
          {createErr && <div style={{ fontSize:12.5, color:'#B3261E', background:'#FBEAE7', border:'1px solid #F1C6C0', borderRadius:7, padding:'8px 10px', marginBottom:12 }}>{createErr}</div>}
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>{ setCreateErr(''); setShowNewTrip(false); }}>Cancel</Btn>
            <Btn onClick={createTrip}>Create Trip</Btn>
          </div>
        </Modal>
      )}

      {showToday && (
        <TodayView trips={trips} todayISO={todayISO} updateTrip={updateTrip} session={session} onClose={()=>setShowToday(false)} />
      )}

      {showAccount && (
        <AccountModal
          session={session}
          profile={profile}
          onAuth={onAuth}
          onLogout={onLogout}
          onOpenDetails={()=>{ setShowAccount(false); setShowProfile(true); }}
          onClose={()=>setShowAccount(false)}
        />
      )}

      {showTravelers && trip && (
        <TravelersModal
          trip={trip}
          session={session}
          rlsActive={cloudMode.current === 'rls'}
          onAdd={(m)=>addMember(trip.id, m)}
          onRemove={(uid)=>removeMember(trip.id, uid)}
          onAddViewer={(m)=>addViewer(trip.id, m)}
          onRemoveViewer={(uid)=>removeViewer(trip.id, uid)}
          onSetRole={(uid, role)=>setMemberRole(trip.id, uid, role)}
          onNeedLogin={()=>{ setShowTravelers(false); setShowAccount(true); }}
          onClose={()=>setShowTravelers(false)}
        />
      )}

      {showProfile && (
        <ProfileModal initial={profile} onSave={saveProfile} onClose={()=>setShowProfile(false)} />
      )}

      {showSearch && (
        <SearchModal trips={trips} onGoToTrip={goToTrip} onClose={()=>setShowSearch(false)} />
      )}

      {showDocs && trip && (
        <DocsView trip={trip} onClose={()=>setShowDocs(false)} />
      )}
    </div>
  );
}

// ---- Traveler Profile (device-local: pic, name, age, gender, city) ----
function ProfileModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || { pic:'', name:'', age:'', gender:'', city:'' });
  const [uploading, setUploading] = useState(false);

  const pickPic = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToStorage(file, 'profile');
      setForm(f => ({ ...f, pic: url }));
    } catch (err) {
      alert('Could not upload photo. ' + err.message);
    }
    setUploading(false);
  };

  return (
    <Modal title="Traveler Profile" onClose={onClose}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:16 }}>
        <label style={{ cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:88, height:88, borderRadius:'50%', overflow:'hidden', background:'#E8E2D4', display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #D4BFB0' }}>
            {form.pic
              ? <img src={form.pic} alt="Profile" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : <span style={{ fontSize:34, fontWeight:600, color:'#B7A08F' }}>{(form.name||'?').trim().charAt(0).toUpperCase() || '?'}</span>}
          </div>
          <input type="file" accept="image/*" onChange={pickPic} style={{ display:'none' }} />
          <span style={{ fontSize:12, color:'#8B2A14', marginTop:8 }}>{uploading ? 'Uploading…' : (form.pic ? 'Change photo' : 'Add photo')}</span>
        </label>
      </div>
      <Input label="Name" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="e.g. Piyush" />
      <div style={{ display:'flex', gap:10 }}>
        <div style={{ flex:1 }}>
          <Input label="Age" type="number" value={form.age} onChange={e=>setForm({...form, age:e.target.value})} placeholder="e.g. 34" />
        </div>
        <div style={{ flex:1 }}>
          <Select label="Gender" value={form.gender} onChange={e=>setForm({...form, gender:e.target.value})} options={["","Male","Female","Other","Prefer not to say"]} />
        </div>
      </div>
      <Input label="City" value={form.city} onChange={e=>setForm({...form, city:e.target.value})} placeholder="e.g. Dubai" />
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>onSave(form)}>Save</Btn>
      </div>
    </Modal>
  );
}

// ---- Traveler account: sign up / log in, and the logged-in card ----
function AccountModal({ session, profile, startMode='login', onAuth, onLogout, onOpenDetails, onClose }) {
  const [mode, setMode] = useState(startMode); // 'login' | 'signup'
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('captain'); // profile type chosen at signup
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // ── Logged-in view ──
  if (session) {
    const initial = ((session.name || session.userId || '?').trim().charAt(0) || '?').toUpperCase();
    return (
      <Modal title="Traveler Account" onClose={onClose}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:18 }}>
          <div style={{ width:80, height:80, borderRadius:'50%', overflow:'hidden', background:'#E8E2D4', display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #D4BFB0', marginBottom:10 }}>
            {profile && profile.pic
              ? <img src={profile.pic} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : <span style={{ fontSize:32, fontWeight:700, color:'#B7A08F' }}>{initial}</span>}
          </div>
          <div style={{ fontSize:18, fontWeight:700, color:'#6E1A10' }}>{session.name}</div>
          <div style={{ fontSize:13, color:'#9A8478', marginTop:2 }}>@{session.userId}</div>
          <span style={{ marginTop:8, fontSize:10.5, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'#8B5A3C', background:'#EFE3CC', borderRadius:10, padding:'2px 10px' }}>
            {(session.role||'captain')==='captain' ? '⭐ Trip Captain' : session.role==='viewer' ? '👁 Viewer' : '🧭 Traveler'}
          </span>
        </div>
        <Btn variant="soft" style={{ width:'100%', marginBottom:8 }} onClick={onOpenDetails}>Edit profile details</Btn>
        <Btn variant="ghost" style={{ width:'100%' }} onClick={onLogout}>Log out</Btn>
        <p style={{ fontSize:11.5, color:'#9A8478', textAlign:'center', marginTop:14, lineHeight:1.5 }}>
          Coming soon: add travelers to a trip and follow everyone's live status. Gmail sign-in & more profile details arrive in a later update.
        </p>
      </Modal>
    );
  }

  // ── Signed-out view: log in / sign up ──
  const submit = async () => {
    setErr('');
    const uidv = userId.trim();
    if (!/^[a-zA-Z0-9._-]{3,20}$/.test(uidv)) { setErr('User ID must be 3–20 characters — letters, numbers, and . _ - only.'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    if (mode === 'signup' && !name.trim()) { setErr('Please enter the traveler name.'); return; }
    setBusy(true);
    try {
      const s = mode === 'signup' ? await authSignUp(uidv, password, name.trim(), role) : await authSignIn(uidv, password);
      onAuth(s);
    } catch(e) { setErr(e.message || 'Something went wrong.'); }
    setBusy(false);
  };

  const tabBtn = (m, label) => (
    <button onClick={()=>{ setMode(m); setErr(''); }}
      style={{ flex:1, padding:'8px 0', border:'none', cursor:'pointer', fontSize:13, fontWeight:700,
        background: mode===m ? '#6E1A10' : 'transparent', color: mode===m ? '#fff' : '#8B2A14',
        borderRadius:7, transition:'all .15s' }}>{label}</button>
  );

  return (
    <Modal title={mode==='signup' ? 'Create Traveler Account' : 'Traveler Log In'} onClose={onClose}>
      <div style={{ display:'flex', gap:4, background:'#E8E2D4', borderRadius:9, padding:4, marginBottom:16 }}>
        {tabBtn('login', 'Log In')}
        {tabBtn('signup', 'Sign Up')}
      </div>

      {mode === 'signup' && (
        <>
          <Input label="Traveler Name *" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Piyush Bajpai" />
          <Select label="Profile type *" value={role} onChange={e=>setRole(e.target.value)}
            options={['captain','traveler','viewer']}
            renderOption={o => o==='captain' ? 'Trip Captain — plans & manages trips' : o==='traveler' ? 'Traveler — joins a captain’s trips' : 'Viewer — follows shared trips (view only)'} />
        </>
      )}
      <Input label="User ID *" value={userId}
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        onChange={e=>setUserId(e.target.value)}
        onKeyDown={e=>{ if(e.key==='Enter') submit(); }}
        placeholder="unique handle, e.g. piyush_b" />
      <Input label="Password *" type="password" value={password}
        onChange={e=>setPassword(e.target.value)}
        onKeyDown={e=>{ if(e.key==='Enter') submit(); }}
        placeholder={mode==='signup' ? 'at least 6 characters' : '••••••'} />

      {err && <div style={{ fontSize:12.5, color:'#B3261E', background:'#FBEAE7', border:'1px solid #F1C6C0', borderRadius:7, padding:'8px 10px', marginBottom:12 }}>{err}</div>}

      <Btn onClick={submit} disabled={busy} style={{ width:'100%', opacity: busy?0.6:1 }}>
        {busy ? 'Please wait…' : (mode==='signup' ? 'Create Account' : 'Log In')}
      </Btn>
      <p style={{ fontSize:11.5, color:'#9A8478', textAlign:'center', marginTop:12, lineHeight:1.5 }}>
        {mode==='signup' ? 'Just a User ID & password for now — no email needed.' : 'New here? Tap “Sign Up”.'}
      </p>
    </Modal>
  );
}

// ---- Trip travelers: view the roster, add/remove by User ID ----
function TravelersModal({ trip, session, rlsActive, onAdd, onRemove, onAddViewer, onRemoveViewer, onSetRole, onNeedLogin, onClose }) {
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [viewerId, setViewerId] = useState('');
  const [vBusy, setVBusy] = useState(false);
  const [vErr, setVErr] = useState('');

  const owner = trip.ownerId || '';
  const members = trip.members || [];
  const myId = session ? session.userId : null;
  const isOwner = !!session && (owner === myId || !owner); // logged-in user manages legacy (unowned) trips too
  const initial = (s) => ((s || '?').trim().charAt(0) || '?').toUpperCase();

  const add = async () => {
    setErr('');
    const uidv = normUserId(userId);
    if (!uidv) return;
    if (uidv === owner || members.some(m => m.userId === uidv)) { setErr('That traveler is already on this trip.'); return; }
    setBusy(true);
    const found = await directoryLookup(uidv);
    setBusy(false);
    if (!found) { setErr('No traveler found with User ID “' + uidv + '”. Check the spelling — they need to have created an account first.'); return; }
    if (rlsActive && !found.uid) { setErr('“' + uidv + '” needs to sign in once before they can be given access to a trip.'); return; }
    onAdd(found);
    setUserId('');
  };

  const viewers = trip.viewers || [];
  const addV = async () => {
    setVErr('');
    const uidv = normUserId(viewerId);
    if (!uidv) return;
    if (viewers.some(v => v.userId === uidv)) { setVErr('That viewer is already on this trip.'); return; }
    setVBusy(true);
    const found = await directoryLookup(uidv);
    setVBusy(false);
    if (!found) { setVErr('No account found with User ID “' + uidv + '”. They need to sign up (as a Viewer) first.'); return; }
    if (rlsActive && !found.uid) { setVErr('“' + uidv + '” needs to sign in once before they can be given access to a trip.'); return; }
    onAddViewer(found);
    setViewerId('');
  };

  return (
    <Modal title="Trip Travelers" onClose={onClose}>
      {!session && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:'#F5EFE2', border:'1px dashed #D4BFB0', borderRadius:9, padding:'10px 12px', marginBottom:14 }}>
          <span style={{ fontSize:12.5, color:'#8B5A3C', flex:1, lineHeight:1.4 }}>Log in to add travelers and share this trip.</span>
          <Btn onClick={onNeedLogin} style={{ padding:'6px 12px', fontSize:12 }}>Log in</Btn>
        </div>
      )}

      <div style={{ marginBottom: isOwner ? 16 : 0 }}>
        {members.length === 0 && <p style={{ fontSize:13, color:'#9A8478', margin:'4px 0 0' }}>No travelers added yet.</p>}
        {members.map(m => {
          const isCaptainRole = m.userId === owner || m.role === 'captain';
          return (
          <div key={m.userId} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #E8E2D4' }}>
            <div style={{ width:38, height:38, borderRadius:'50%', background:'#E8E2D4', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16, fontWeight:700, color:'#B7A08F' }}>{initial(m.name || m.userId)}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#6E1A10', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                {m.name || m.userId}
                <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.04em', color: isCaptainRole ? '#8B5A3C' : '#5A6B7A', background: isCaptainRole ? '#EFE3CC' : '#E2E8ED', borderRadius:4, padding:'1px 6px' }}>{isCaptainRole ? '⭐ CAPTAIN' : '🧭 TRAVELER'}</span>
                {m.userId === owner && <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.04em', color:'#8B5A3C', background:'#EFE3CC', borderRadius:4, padding:'1px 6px' }}>CREATOR</span>}
                {m.userId === myId && <span style={{ fontSize:10, fontWeight:700, color:'#3C8A3C', background:'#DCEEDC', borderRadius:4, padding:'1px 6px' }}>YOU</span>}
              </div>
              <div style={{ fontSize:12, color:'#9A8478' }}>@{m.userId}</div>
            </div>
            {isOwner && m.userId !== owner && (
              <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end', flexShrink:0 }}>
                <button onClick={()=>onSetRole(m.userId, m.role === 'captain' ? 'traveler' : 'captain')}
                  title={m.role === 'captain' ? 'Demote to traveler' : 'Promote to trip captain'}
                  style={{ background:'#EFE3CC', border:'none', borderRadius:6, color:'#8B5A3C', cursor:'pointer', fontSize:11.5, fontWeight:600, padding:'4px 10px', whiteSpace:'nowrap' }}>
                  {m.role === 'captain' ? 'Make Traveler' : 'Make Captain'}
                </button>
                <button onClick={()=>onRemove(m.userId)} title="Remove traveler"
                  style={{ background:'#F5E0D8', border:'none', borderRadius:6, color:'#8B2A14', cursor:'pointer', fontSize:11.5, padding:'4px 10px' }}>Remove</button>
              </div>
            )}
          </div>
        ); })}
      </div>

      {isOwner && (
        <div style={{ borderTop: members.length ? '1px solid #E2D8C8' : 'none', paddingTop: members.length ? 14 : 0 }}>
          <Input label="Add traveler by User ID" value={userId}
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            onChange={e=>setUserId(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') add(); }}
            placeholder="their unique User ID" />
          {err && <div style={{ fontSize:12.5, color:'#B3261E', background:'#FBEAE7', border:'1px solid #F1C6C0', borderRadius:7, padding:'8px 10px', marginBottom:12 }}>{err}</div>}
          <Btn onClick={add} disabled={busy} style={{ opacity: busy?0.6:1 }}>{busy ? 'Checking…' : 'Add traveler'}</Btn>
        </div>
      )}

      {/* Viewers — view-only accounts this trip is shared with */}
      {(isOwner || viewers.length > 0) && (
        <div style={{ borderTop:'1px solid #E2D8C8', marginTop:16, paddingTop:14 }}>
          <div style={{ fontSize:12.5, fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', color:'#8B2A14', marginBottom:8 }}>👁 Viewers</div>
          {viewers.length === 0 && <p style={{ fontSize:12.5, color:'#9A8478', margin:'0 0 10px' }}>No viewers yet — share this trip's live status with a view-only account.</p>}
          {viewers.map(v => (
            <div key={v.userId} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid #E8E2D4' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <span style={{ fontSize:13.5, fontWeight:600, color:'#6E1A10' }}>{v.name || v.userId}</span>
                <span style={{ fontSize:12, color:'#9A8478', marginLeft:6 }}>@{v.userId}</span>
              </div>
              {isOwner && (
                <button onClick={()=>onRemoveViewer(v.userId)} title="Remove viewer"
                  style={{ background:'#F5E0D8', border:'none', borderRadius:6, color:'#8B2A14', cursor:'pointer', fontSize:12, padding:'4px 10px' }}>Remove</button>
              )}
            </div>
          ))}
          {isOwner && (
            <div style={{ marginTop:10 }}>
              <Input label="Add viewer by User ID" value={viewerId}
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onChange={e=>setViewerId(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') addV(); }}
                placeholder="their User ID" />
              {vErr && <div style={{ fontSize:12.5, color:'#B3261E', background:'#FBEAE7', border:'1px solid #F1C6C0', borderRadius:7, padding:'8px 10px', marginBottom:12 }}>{vErr}</div>}
              <Btn variant="soft" onClick={addV} disabled={vBusy} style={{ opacity: vBusy?0.6:1 }}>{vBusy ? 'Checking…' : 'Add viewer'}</Btn>
            </div>
          )}
        </div>
      )}

      {session && !isOwner && (
        <p style={{ fontSize:12, color:'#9A8478', marginTop:12 }}>Only the trip owner can add or remove travelers.</p>
      )}
    </Modal>
  );
}

// ---- Today's Plan (focused view of the current date across all trips) ----
function TodayView({ trips, todayISO, updateTrip, session, onClose }) {
  const myId = session ? session.userId : null;
  const evStatus = (item) => myId ? memStOf(item, myId) : stOf(item);
  const spStatus = (s, iso) => myId ? spanMemStOf(s, myId, iso) : spanStOf(s, iso);
  const matches = [];
  (trips || []).forEach(trip => (trip.days || []).forEach(day => {
    if ((day.date || '').slice(0, 10) === todayISO) matches.push({ trip, day });
  }));

  // nearest upcoming day, for the empty state
  let upcoming = null;
  (trips || []).forEach(trip => (trip.days || []).forEach(day => {
    const d = (day.date || '').slice(0, 10);
    if (d > todayISO && (!upcoming || d < upcoming.date)) upcoming = { date: d, name: trip.name };
  }));

  const cycleEvent = (tripId, dayId, evId) => updateTrip(tripId, t => ({ days:(t.days||[]).map(d => d.id===dayId
    ? { ...d, events:(d.events||[]).map(e => {
        if (e.id!==evId) return e;
        if (myId) return { ...e, memberStatus:{ ...(e.memberStatus||{}), [myId]: nextStatus(memStOf(e, myId)) } };
        return { ...e, status: nextStatus(stOf(e)), done: undefined };
      }) } : d) }));
  const toggleAct = (tripId, dayId, evId, actId) => updateTrip(tripId, t => ({ days:(t.days||[]).map(d => d.id===dayId
    ? { ...d, events:(d.events||[]).map(e => e.id===evId
        ? { ...e, activities:(e.activities||[]).map(a => {
            if (a.id!==actId) return a;
            if (myId) { const cur=memStOf(a, myId); return { ...a, memberStatus:{ ...(a.memberStatus||{}), [myId]: cur==='done'?'todo':'done' } }; }
            return { ...a, status: stOf(a)==='done'?'todo':'done', done: undefined };
          }) } : e) } : d) }));
  const toggleSpan = (tripId, spanId, dayISO) => updateTrip(tripId, t => ({ spans:(t.spans||[]).map(s => {
    if (s.id!==spanId) return s;
    if (myId) { const mds={ ...(s.memberDayStatus||{}) }; mds[myId]={ ...(mds[myId]||{}), [dayISO]: nextStatus(spanMemStOf(s, myId, dayISO)) }; return { ...s, memberDayStatus: mds }; }
    return { ...s, dayStatus:{ ...(s.dayStatus||{}), [dayISO]: nextStatus(spanStOf(s, dayISO)) } };
  }) }));

  const docLinks = (docs) => (docs && docs.length > 0) ? (
    <div style={{ marginTop:6, display:'flex', flexDirection:'column', gap:4 }}>
      {docs.map(doc => (
        <a key={doc.id} href={doc.url || doc.data} target="_blank" rel="noopener noreferrer"
          style={{ fontSize:12.5, color:'#8B2A14', textDecoration:'underline', display:'inline-flex', alignItems:'center', gap:6, wordBreak:'break-word' }}>
          <span style={{ fontSize:14 }}>📎</span>{doc.name}
        </a>
      ))}
    </div>
  ) : null;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'#F0EBE0', overflowY:'auto', fontFamily:'var(--font-body)', color:'#6E1A10', paddingBottom:'env(safe-area-inset-bottom, 0px)' }}>
      <div style={{ background:'#5C1A1A', boxShadow:'0 2px 12px rgba(0,0,0,0.18)', position:'sticky', top:0, zIndex:5 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'calc(env(safe-area-inset-top, 0px) + 14px) 18px 14px' }}>
          <button onClick={onClose} aria-label="Back" style={{ width:38, height:38, borderRadius:9, border:'1.5px solid rgba(245,236,215,0.28)', background:'rgba(245,236,215,0.08)', color:'#F5ECD7', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, padding:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#F5ECD7', letterSpacing:'0.02em' }}>Today's Plan</div>
            <div style={{ fontSize:12, color:'rgba(245,236,215,0.65)', marginTop:2 }}>{fmtDate(todayISO)}</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:680, margin:'0 auto', padding:'18px 20px' }}>
        {matches.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 10px', color:'#B54030' }}>
            <div style={{ fontSize:44, marginBottom:12 }}>🗓️</div>
            <p style={{ fontSize:15, margin:0 }}>Nothing scheduled for today.</p>
            {upcoming && <p style={{ fontSize:13, color:'#8A7A6D', marginTop:10 }}>Next up: <strong>{fmtDate(upcoming.date)}</strong> · {upcoming.name}</p>}
          </div>
        ) : matches.map(({ trip, day }) => (
          <div key={trip.id + '_' + day.id} style={{ marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:12, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, textTransform:'uppercase', letterSpacing:'0.08em', color:'#B07A4A' }}>{trip.name}</span>
              {day.label && <span style={{ fontSize:14, fontWeight:600, color:'#6E1A10' }}>{day.label}</span>}
            </div>

            {(day.events||[]).length === 0 && spansOnDay(trip, todayISO).length === 0 && <p style={{ color:'#C05040', fontSize:13 }}>No events for today.</p>}

            {/* ── Multi-day spans (hotel / travel) active today ── */}
            {spansOnDay(trip, todayISO).map(s => (
              <div key={s.id} style={{ display:'flex', gap:12, padding:'12px 0', borderTop:'1px solid #E2D8C8', background:'#F5EEDC' }}>
                <StatusBox status={spStatus(s, todayISO)} onClick={()=>toggleSpan(trip.id, s.id, todayISO)} size={18} style={{ marginTop:2 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontSize:16 }}>{spanIcon(s)}</span>
                    <span style={{ fontSize:14, fontWeight:700, color:'#2E2320', textDecoration: spStatus(s, todayISO)==='done'?'line-through':'none', opacity: spStatus(s, todayISO)==='done'?0.55:1 }}>{s.title || '(untitled)'}</span>
                    <span style={{ fontSize:11, background:'#E4D3B4', borderRadius:4, padding:'1px 6px', color:'#7A4A1A', fontWeight:700 }}>{spanSegLabel(s, todayISO)}</span>
                    <StatusBadge status={spStatus(s, todayISO)} />
                  </div>
                  {spanLocationText(s) && <div style={{ fontSize:12.5, color:'#A83020', marginTop:3 }}>📍 {spanLocationText(s)}</div>}
                  {s.notes && <div style={{ fontSize:12.5, color:'#7A685F', marginTop:3 }}>{s.notes}</div>}
                  {docLinks(s.docs)}
                </div>
              </div>
            ))}

            {(day.events||[]).map(ev => (
              <div key={ev.id} style={{ display:'flex', gap:12, padding:'12px 0', borderTop:'1px solid #E2D8C8' }}>
                <StatusBox status={evStatus(ev)} onClick={()=>cycleEvent(trip.id, day.id, ev.id)} size={18} style={{ marginTop:2 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    {(ev.time || ev.endTime) && <span style={{ fontSize:12.5, fontWeight:600, color:'#B54030' }}>{ev.time}{ev.endTime?` – ${ev.endTime}`:''}</span>}
                    <span style={{ fontSize:14, fontWeight:600, color:'#2E2320', textDecoration: evStatus(ev)==='done'?'line-through':'none', opacity: evStatus(ev)==='done'?0.55:1 }}>{ev.title || '(untitled)'}</span>
                    {ev.category && <span style={{ fontSize:11, background:'#E4DED0', borderRadius:4, padding:'1px 6px', color:'#8B2A14' }}>{ev.category}</span>}
                    <StatusBadge status={evStatus(ev)} />
                  </div>
                  {ev.location && <div style={{ fontSize:12.5, color:'#A83020', marginTop:3 }}>📍 {ev.location}</div>}
                  {ev.notes && <div style={{ fontSize:12.5, color:'#7A685F', marginTop:3 }}>{ev.notes}</div>}
                  {docLinks(ev.docs)}
                  {(ev.activities||[]).length > 0 && (
                    <div style={{ marginTop:10, borderLeft:'2px solid #E2D8C8' }}>
                      {(ev.activities||[]).map(act => (
                        <div key={act.id} style={{ display:'flex', gap:10, alignItems:'flex-start', paddingLeft:8, marginBottom:8 }}>
                          <StatusBox status={evStatus(act)} onClick={()=>toggleAct(trip.id, day.id, ev.id, act.id)} size={14} style={{ marginTop:2 }} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <span style={{ fontSize:13.5, color:'#2E2320', textDecoration: evStatus(act)==='done'?'line-through':'none', opacity: evStatus(act)==='done'?0.55:1 }}>{act.text || '(task)'}</span>
                            {docLinks(act.docs)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Global search across all trips ----
function SearchModal({ trips, onGoToTrip, onClose }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const results = [];
  if (query) {
    (trips || []).forEach(trip => {
      const add = (label, sub) => results.push({ tripId: trip.id, label, sub });
      if ((trip.name || '').toLowerCase().includes(query)) add(trip.name, 'Trip');
      if ((trip.destination || '').toLowerCase().includes(query)) add(trip.destination, `${trip.name} · destination`);
      (trip.days || []).forEach(day => {
        if ((day.label || '').toLowerCase().includes(query)) add(day.label, `${trip.name} · ${fmtDate(day.date)}`);
        (day.events || []).forEach(ev => {
          if ([ev.title, ev.location, ev.notes, ev.category].filter(Boolean).join(' ').toLowerCase().includes(query)) add(ev.title || '(untitled)', `${trip.name} · ${fmtDate(day.date)}`);
          (ev.docs || []).forEach(d => { if ((d.name || '').toLowerCase().includes(query)) add(d.name, `${trip.name} · ${fmtDate(day.date)} · attachment`); });
          (ev.activities || []).forEach(a => {
            if ((a.text || '').toLowerCase().includes(query)) add(a.text, `${trip.name} · ${fmtDate(day.date)} · task`);
            (a.docs || []).forEach(d => { if ((d.name || '').toLowerCase().includes(query)) add(d.name, `${trip.name} · attachment`); });
          });
        });
      });
      (trip.spans || []).forEach(s => {
        if ([s.title, s.location, s.from, s.to, s.notes, s.type].filter(Boolean).join(' ').toLowerCase().includes(query)) add(s.title || s.type, `${trip.name} · ${s.type} · ${fmtDate(s.startDate)}`);
        (s.docs || []).forEach(d => { if ((d.name || '').toLowerCase().includes(query)) add(d.name, `${trip.name} · ${s.type} · attachment`); });
      });
    });
  }
  return (
    <Modal title="Search" onClose={onClose}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search trips, events, tasks, docs…"
        style={{ width:'100%', padding:'9px 12px', border:'1px solid #C8B09A', borderRadius:8, fontSize:14, boxSizing:'border-box', marginBottom:12, background:'#F5EFE2', color:'#6E1A10', outline:'none' }} />
      <div style={{ maxHeight:'50vh', overflowY:'auto' }}>
        {query && results.length === 0 && <p style={{ color:'#C05040', fontSize:13, textAlign:'center', padding:'14px' }}>No matches found.</p>}
        {results.slice(0, 60).map((r, i) => (
          <div key={i} onClick={() => onGoToTrip(r.tripId)}
            style={{ padding:'8px 6px', borderBottom:'1px solid #EEE7DA', cursor:'pointer' }}>
            <div style={{ fontSize:13.5, color:'#3D0C02' }}>{r.label}</div>
            <div style={{ fontSize:11.5, color:'#9A8478' }}>{r.sub}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ---- Documents repository: every attachment across a trip, filed by day/date ----
function DocsView({ trip, onClose }) {
  // Group every attachment under its day/date
  const byDate = {}; // iso (or '__undated__') -> [{ doc, ctx }]
  const dayLabelOf = {};
  (trip.days || []).forEach(d => { dayLabelOf[(d.date || '').slice(0, 10)] = d.label || ''; });
  const push = (date, doc, ctx) => {
    const key = (date || '').slice(0, 10) || '__undated__';
    (byDate[key] = byDate[key] || []).push({ doc, ctx });
  };
  (trip.days || []).forEach(day => (day.events || []).forEach(ev => {
    (ev.docs || []).forEach(d => push(day.date, d, ev.title || 'event'));
    (ev.activities || []).forEach(a => (a.docs || []).forEach(d => push(day.date, d, `${ev.title || 'event'} · ${a.text || 'task'}`)));
  }));
  (trip.spans || []).forEach(s => (s.docs || []).forEach(d => push(s.startDate, d, `${spanIcon(s)} ${s.title || s.type}`)));

  const dates = Object.keys(byDate).sort((a, b) => a === '__undated__' ? 1 : b === '__undated__' ? -1 : (a > b ? 1 : -1));
  const totalCount = Object.values(byDate).reduce((n, arr) => n + arr.length, 0);
  const fmtSize = b => (b == null ? '' : b < 1024 ? b + 'B' : b < 1048576 ? (b / 1024).toFixed(1) + 'KB' : (b / 1048576).toFixed(1) + 'MB');

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'#F0EBE0', overflowY:'auto', fontFamily:'var(--font-body)', color:'#6E1A10', paddingBottom:'env(safe-area-inset-bottom, 0px)' }}>
      <div style={{ background:'#5C1A1A', boxShadow:'0 2px 12px rgba(0,0,0,0.18)', position:'sticky', top:0, zIndex:5 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'calc(env(safe-area-inset-top, 0px) + 14px) 18px 14px' }}>
          <button onClick={onClose} aria-label="Back" style={{ width:38, height:38, borderRadius:9, border:'1.5px solid rgba(245,236,215,0.28)', background:'rgba(245,236,215,0.08)', color:'#F5ECD7', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, padding:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#F5ECD7', letterSpacing:'0.02em' }}>Documents</div>
            <div style={{ fontSize:12, color:'rgba(245,236,215,0.65)', marginTop:2 }}>{trip.name} · {totalCount} file{totalCount===1?'':'s'}</div>
          </div>
        </div>
      </div>
      <div style={{ maxWidth:680, margin:'0 auto', padding:'8px 20px 16px' }}>
        {totalCount === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 10px', color:'#B54030' }}>
            <div style={{ fontSize:44, marginBottom:12 }}>📎</div>
            <p style={{ fontSize:15, margin:0 }}>No documents attached yet.</p>
            <p style={{ fontSize:13, color:'#8A7A6D', marginTop:8 }}>Attach files to events or tasks in the Schedule tab.</p>
          </div>
        ) : dates.map((iso, di) => (
          <div key={iso}>
            {/* Day / date header */}
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', margin: di===0 ? '10px 0 10px' : '28px 0 10px' }}>
              <span style={{ background:'#5C1A1A', color:'#F5ECD7', borderRadius:8, padding:'6px 12px', fontSize:13.5, fontWeight:700, letterSpacing:'0.02em' }}>
                {iso==='__undated__' ? 'Undated' : fmtDate(iso)}
              </span>
              {iso!=='__undated__' && (
                <span style={{ fontSize:12, color:'#9A8478', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600 }}>
                  {weekdayOf(iso)}{dayLabelOf[iso] ? ` · ${dayLabelOf[iso]}` : ''}
                </span>
              )}
              <span style={{ fontSize:11.5, color:'#B07A4A', marginLeft:'auto' }}>{byDate[iso].length} file{byDate[iso].length===1?'':'s'}</span>
            </div>
            {byDate[iso].map((it, i) => (
              <a key={i} href={it.doc.url || it.doc.data} target="_blank" rel="noopener noreferrer"
                style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 4px', borderBottom:'1px solid #E2D8C8', textDecoration:'none', color:'inherit' }}>
                <span style={{ fontSize:20 }}>📎</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13.5, color:'#8B2A14', textDecoration:'underline', wordBreak:'break-word' }}>{it.doc.name}</div>
                  <div style={{ fontSize:11.5, color:'#9A8478' }}>{it.ctx}</div>
                </div>
                {it.doc.size != null && <span style={{ fontSize:11.5, color:'#B07A4A', flexShrink:0 }}>{fmtSize(it.doc.size)}</span>}
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Export a trip's itinerary — download on desktop, native share on mobile ----
function buildTripHtml(trip) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
  let body = '';
  (trip.days || []).forEach(day => {
    body += `<h2>${esc(fmtDate(day.date))}${day.label ? ` — ${esc(day.label)}` : ''}</h2>`;
    spansOnDay(trip, day.date).forEach(s => {
      body += `<div class="ev"><strong>${esc(spanIcon(s))} ${esc(s.title || '')}</strong> <span class="cat">${esc(s.type)} · ${esc(spanSegLabel(s, day.date))}</span>`;
      if (spanLocationText(s)) body += `<div class="loc">📍 ${esc(spanLocationText(s))}</div>`;
      body += `</div>`;
    });
    (day.events || []).forEach(ev => {
      const tm = ev.time ? `${esc(ev.time)}${ev.endTime ? '–' + esc(ev.endTime) : ''} ` : '';
      body += `<div class="ev"><strong>${tm}${esc(ev.title || '')}</strong> <span class="cat">${esc(ev.category || '')}</span>`;
      if (ev.location) body += `<div class="loc">📍 ${esc(ev.location)}</div>`;
      if (ev.notes) body += `<div class="note">${esc(ev.notes)}</div>`;
      (ev.activities || []).forEach(a => { body += `<div class="act">• ${esc(a.text || '')}</div>`; });
      body += `</div>`;
    });
  });
  const r = tripDateRange(trip);
  const dateLine = r.start ? ` &nbsp;•&nbsp; ${esc(fmtDate(r.start))}${r.end && r.end !== r.start ? ' → ' + esc(fmtDate(r.end)) : ''}` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(trip.name)} — itinerary</title>` +
    `<style>body{font-family:Arial,Helvetica,sans-serif;color:#3D0C02;max-width:720px;margin:24px auto;padding:0 18px;line-height:1.5;}h1{color:#6E1A10;margin-bottom:4px;}h2{color:#8B2A14;border-bottom:1px solid #D4BFB0;padding-bottom:4px;margin-top:26px;font-size:18px;}.ev{margin:10px 0 14px;padding-left:10px;border-left:3px solid #D4BFB0;}.cat{color:#8B2A14;font-size:12px;}.loc{color:#A83020;font-size:13px;}.note{color:#6b5a52;font-size:13px;}.act{margin-left:14px;color:#555;font-size:13px;}.sub{color:#8B5A3C;}</style>` +
    `</head><body><h1>${esc(trip.name || 'Trip')}</h1><p class="sub">${esc(trip.destination || '')}${dateLine}</p>${body || '<p>No days scheduled.</p>'}</body></html>`;
}
function buildTripText(trip) {
  let out = `${trip.name || 'Trip'}${trip.destination ? ` — ${trip.destination}` : ''}\n`;
  const r = tripDateRange(trip);
  if (r.start) out += `${fmtDate(r.start)}${r.end && r.end !== r.start ? ` → ${fmtDate(r.end)}` : ''}\n`;
  (trip.days || []).forEach(day => {
    out += `\n${fmtDate(day.date)}${day.label ? ` — ${day.label}` : ''}\n`;
    spansOnDay(trip, day.date).forEach(s => { out += `  ${spanIcon(s)} ${s.title || ''} (${spanSegLabel(s, day.date)})${spanLocationText(s) ? ` — ${spanLocationText(s)}` : ''}\n`; });
    (day.events || []).forEach(ev => {
      const tm = ev.time ? `${ev.time}${ev.endTime ? '–' + ev.endTime : ''} ` : '';
      out += `  • ${tm}${ev.title || ''}${ev.location ? ` @ ${ev.location}` : ''}\n`;
      (ev.activities || []).forEach(a => { out += `      - ${a.text || ''}\n`; });
    });
  });
  return out;
}
async function exportTripHtml(trip) {
  const html = buildTripHtml(trip);
  const filename = `${(trip.name || 'trip').replace(/[^a-z0-9]+/gi, '_')}-itinerary.html`;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  // On mobile, use the native share sheet (Save to Files / Drive / share to apps)
  if (isMobile && navigator.share) {
    try {
      const file = new File([html], filename, { type: 'text/html' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${trip.name || 'Trip'} — itinerary` });
        return;
      }
      await navigator.share({ title: `${trip.name || 'Trip'} — itinerary`, text: buildTripText(trip) });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // user dismissed the share sheet
      // otherwise fall through to the download attempt
    }
  }
  // Desktop (or share unavailable): download the HTML file
  try {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    alert('Could not export the itinerary on this device.');
  }
}

// ---- Read-only Viewer (shared status link: ?view=<tripId>) ----
const fmtDateTime = (iso) => {
  try { return new Date(iso).toLocaleString(undefined, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); }
  catch(e){ return ''; }
};

// A follower's opt-in control on the shared status page: subscribe this
// browser to push notifications for the trip (or turn them back off).
function FollowerNotify({ tripId }) {
  const [state, setState] = useState('checking'); // checking | off | on | busy | unsupported | blocked | setup
  useEffect(() => {
    let cancelled = false;
    if (!pushSupported() || Notification.permission === 'denied') { setState(pushSupported() ? 'blocked' : 'unsupported'); return; }
    followerSubscription().then(sub => { if (!cancelled) setState(sub ? 'on' : 'off'); });
    return () => { cancelled = true; };
  }, []);
  if (state === 'unsupported') return null; // e.g. iOS Safari not added to home screen
  const turnOn = async () => {
    setState('busy');
    try { await followerSubscribe(tripId); setState('on'); }
    catch (e) { setState(e.message === 'blocked' ? 'blocked' : e.message === 'setup' ? 'setup' : 'off'); }
  };
  const turnOff = async () => { setState('busy'); try { await followerUnsubscribe(); } catch (e) {} setState('off'); };

  const box = { display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', background:'#F5EFE2', border:'1px solid #E4D8C4', borderRadius:10, padding:'10px 14px', margin:'0 0 18px' };
  if (state === 'on') return (
    <div style={box}>
      <span style={{ fontSize:12.5, color:'#2F7A2F', fontWeight:600, flex:1, minWidth:150 }}>🔔 Notifications on — you'll be alerted when a traveler updates status.</span>
      <button onClick={turnOff} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #C8B09A', background:'transparent', color:'#8B2A14', fontSize:12.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>Turn off</button>
    </div>
  );
  if (state === 'blocked') return (
    <div style={box}><span style={{ fontSize:12, color:'#B54030', lineHeight:1.45 }}>🔔 Notifications are blocked for this site. Allow them in your browser's site settings, then reload to follow this trip's updates.</span></div>
  );
  if (state === 'setup') return (
    <div style={box}><span style={{ fontSize:12, color:'#B54030', lineHeight:1.45 }}>Notifications aren't switched on for this trip yet.</span></div>
  );
  return (
    <div style={box}>
      <span style={{ fontSize:12.5, color:'#8B5A3C', flex:1, minWidth:150, lineHeight:1.4 }}>Get a notification whenever a traveler updates their status on this trip.</span>
      <button onClick={turnOn} disabled={state==='busy'||state==='checking'} style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'#6E1A10', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', opacity:(state==='busy'||state==='checking')?0.6:1 }}>{state==='busy'?'…':'🔔 Notify me'}</button>
    </div>
  );
}

function ViewerApp({ tripId, token, focusUserId }) {
  const [trip, setTrip] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | ok | notfound | error
  const [updatedAt, setUpdatedAt] = useState(null);
  const [reload, setReload] = useState(0);
  const refresh = () => setReload(r => r + 1);

  useEffect(() => {
    let cancelled = false;
    // Read the one trip this link unlocks, via the token-gated database
    // function — no other trip is reachable from a share link.
    const fetchTrip = async () => {
      try {
        const res = await sharedTripFetch(tripId, token);
        if (cancelled) return;
        if (res.ok) {
          if (res.trip) { setTrip(res.trip); setUpdatedAt(res.updatedAt); setPhase('ok'); }
          else { setPhase(prev => prev === 'ok' ? 'ok' : 'notfound'); }
          return;
        }
        if (!res.missing) throw new Error('bad response');
        // Before the RLS migration has been run: read the old shared blob
        const r = await fetch(SUPA_URL + '/rest/v1/travel_data?id=eq.shared&select=trips,updated_at', { headers: supaHeaders });
        if (!r.ok) throw new Error('bad response');
        const rows = await r.json();
        if (cancelled) return;
        const row = rows && rows[0];
        const t = row ? (row.trips||[]).find(x => x.id === tripId) : null;
        if (t) { setTrip(t); setUpdatedAt(row.updated_at || null); setPhase('ok'); }
        else { setPhase(prev => prev === 'ok' ? 'ok' : 'notfound'); }
      } catch (e) {
        if (!cancelled) setPhase(prev => prev === 'ok' ? 'ok' : 'error');
      }
    };
    fetchTrip();
    const iv = setInterval(fetchTrip, 20000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [tripId, token, reload]);

  const shell = (children) => (
    <div style={{ fontFamily:"var(--font-body)", maxWidth:680, margin:"0 auto", minHeight:"100vh", background:"#F0EBE0", paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
      <div style={{ background:"#5C1A1A", boxShadow:"0 2px 12px rgba(0,0,0,0.18)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"calc(env(safe-area-inset-top, 0px) + 16px) 20px 14px" }}>
          <img src="/logo-travelhub.png" alt="My Travel Hub" width="34" height="34" style={{ borderRadius:8, flexShrink:0, display:"block" }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:800, color:"#F5ECD7", letterSpacing:"0.03em", textTransform:"uppercase", lineHeight:1.1 }}>My Travel Hub</div>
            <div style={{ fontSize:10.5, color:"rgba(245,236,215,0.6)", letterSpacing:"0.1em", textTransform:"uppercase", marginTop:2 }}>Live trip status</div>
          </div>
          <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, fontWeight:700, color:"#A8E6A0", background:"rgba(125,184,122,0.18)", border:"1px solid rgba(125,184,122,0.5)", borderRadius:20, padding:"3px 10px" }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:"#7DB87A", display:"inline-block" }} /> LIVE
          </span>
        </div>
      </div>
      {children}
    </div>
  );

  const centered = (txt, extra) => (
    <div style={{ textAlign:"center", color:"#B54030", padding:"70px 24px" }}>
      <div style={{ fontSize:40, marginBottom:12 }}>🧭</div>
      <p style={{ fontSize:15, margin:0 }}>{txt}</p>
      {extra}
    </div>
  );

  if (phase === 'loading') return shell(centered('Loading trip status…'));
  if (phase === 'notfound') return shell(centered('This status link is invalid, or the trip no longer exists.'));
  if (phase === 'error') return shell(centered('Could not load the status. Check your connection.',
    <button onClick={refresh} style={{ marginTop:14, padding:"8px 18px", borderRadius:8, border:"none", background:"#6E1A10", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>Try again</button>));

  return shell(
    <div style={{ padding:20 }}>
      <h2 style={{ margin:"0 0 2px", fontSize:19, fontWeight:700, color:"#6E1A10" }}>{trip.name || 'Trip'}</h2>
      <div style={{ fontSize:13, color:"#B54030" }}>
        {trip.destination && <span>📍 {trip.destination}</span>}
        {(() => { const r = tripDateRange(trip); return r.start ? <span style={{ marginLeft: trip.destination?8:0 }}>🗓 {fmtDate(r.start)}{r.end && r.end!==r.start ? ` → ${fmtDate(r.end)}` : ''}</span> : null; })()}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", fontSize:11.5, color:"#9A8478", margin:"8px 0 18px" }}>
        <span>{updatedAt ? `Last updated ${fmtDateTime(updatedAt)}` : 'Live view'} · refreshes automatically</span>
        <button onClick={refresh} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid #C8B09A", background:"transparent", color:"#8B2A14", fontSize:11.5, cursor:"pointer" }}>Refresh now</button>
      </div>
      <FollowerNotify tripId={tripId} />
      <StatusTab trip={trip} focusUserId={focusUserId} />
      <div style={{ textAlign:"center", fontSize:11, color:"#B0A091", padding:"18px 0 8px" }}>Read-only view · shared by the traveler</div>
    </div>
  );
}

export default function Root() {
  const params = new URLSearchParams(window.location.search);
  const viewId = params.get('view');
  const focusUserId = params.get('t'); // a traveler's share link shows only that traveler's status
  const token = params.get('k');       // the trip's secret — this is what unlocks a share link
  return viewId ? <ViewerApp tripId={viewId} token={token} focusUserId={focusUserId} /> : <MainApp />;
}
