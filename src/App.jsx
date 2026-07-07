import { useState, useEffect } from "react";

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
  budget: ""
});

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
// whole calendar days between two ISO dates (UTC, DST-safe)
const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
// trip-level spans that overlap a given ISO day (string compare works for YYYY-MM-DD)
const spansOnDay = (trip, dayISO) => (trip.spans || []).filter(s =>
  s.startDate && s.endDate && dayISO >= s.startDate && dayISO <= s.endDate);
// which end of the span this day represents
const spanRole = (s, dayISO) => s.startDate === s.endDate ? 'single'
  : dayISO === s.startDate ? 'start' : dayISO === s.endDate ? 'end' : 'mid';
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

// ---- Schedule Tab ----
function ScheduleTab({ trip, update }) {
  const [showDay, setShowDay] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState({}); // { [dayId]: true } when collapsed
  const toggleDayCollapse = (id) => setCollapsedDays(c => ({ ...c, [id]: !c[id] }));
  const [showEvent, setShowEvent] = useState(null); // dayId (or '__edit__' when editing a span)
  const [editSpanId, setEditSpanId] = useState(null); // span being edited, if any
  const [dayForm, setDayForm] = useState({ date:"", label:"" });
  // evForm covers both single-day activities (time/endTime/category) and multi-day spans (startDate/endDate/…)
  // duration = 'single' | 'multi' decides which; type only matters for multi-day spans
  const [evForm, setEvForm] = useState({ duration:"single", type:"Accommodation", time:"", endTime:"", title:"", location:"", category:"Sightseeing", notes:"", startDate:"", startTime:"", endDate:"", spanEndTime:"" });
  // Activity state: { [eventId]: inputText }
  const [activityInput, setActivityInput] = useState({});
  // Which event is showing the activity input box
  const [addingActivityFor, setAddingActivityFor] = useState(null);

  // ── Inline editing of day labels / event titles / activity text ──
  // editing = { kind:'day'|'event'|'activity', dayId, evId?, actId? }
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');
  const editKey = (e) => e ? [e.kind, e.dayId, e.evId||'', e.actId||''].join('|') : '';
  const startEdit = (kind, ids, current) => { setEditing({ kind, ...ids }); setEditVal(current||''); };
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

  // ── Cycle status: not started → active → done → not started ──
  const cycleEventStatus = (dayId, evId) =>
    update(t => ({ days:(t.days||[]).map(d => d.id===dayId
      ? { ...d, events:(d.events||[]).map(e => e.id===evId ? { ...e, status: nextStatus(stOf(e)), done: undefined } : e) } : d) }));
  // Activities are a simple two-state toggle: not started ⇄ done (no "active")
  const cycleActivityStatus = (dayId, evId, actId) =>
    update(t => ({ days:(t.days||[]).map(d => d.id===dayId
      ? { ...d, events:(d.events||[]).map(e => e.id===evId
          ? { ...e, activities:(e.activities||[]).map(a => a.id===actId ? { ...a, status: stOf(a)==='done' ? 'todo' : 'done', done: undefined } : a) } : e) } : d) }));

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

  const blankForm = { duration:"single", type:"Accommodation", time:"", endTime:"", title:"", location:"", category:"Sightseeing", notes:"", startDate:"", startTime:"", endDate:"", spanEndTime:"" };
  const closeModal = () => { setShowEvent(null); setEditSpanId(null); setEvForm(blankForm); };
  // Open "add" modal from a day; prefill span dates to that day
  const openAddEvent = (day) => { setEditSpanId(null); setEvForm({ ...blankForm, startDate:day.date, endDate:day.date }); setShowEvent(day.id); };
  // Open "edit" modal for an existing span
  const openEditSpan = (s) => {
    // normalise any legacy type (Flight/Train/Car) onto the current option set
    const t = SPAN_TYPE_OPTIONS.includes(s.type) ? s.type : ((SPAN_TYPES[s.type]||{}).kind === 'travel' ? 'Travel' : 'Other');
    setEvForm({ duration:"multi", type:t, time:"", endTime:"", title:s.title||"", location:s.location||"", category:"Sightseeing", notes:s.notes||"", startDate:s.startDate||"", startTime:s.startTime||"", endDate:s.endDate||"", spanEndTime:s.endTime||"" });
    setEditSpanId(s.id); setShowEvent('__edit__');
  };

  const addEvent = (dayId) => {
    if (evForm.duration === 'multi') { submitSpan(); return; }
    if (!evForm.title || !evForm.time || !evForm.endTime) {
      alert('Please fill in Title, Start Time and End Time.');
      return;
    }
    const newEvent = { id:uid(), time:evForm.time, endTime:evForm.endTime, title:evForm.title, location:evForm.location, category:evForm.category, notes:evForm.notes, activities:[], docs:[] };
    const days = (trip.days||[]).map(d => d.id===dayId
      ? { ...d, events:[...(d.events||[]), newEvent].sort((a,b)=>a.time>b.time?1:-1) }
      : d);
    update({ days });
    closeModal();
  };

  // ── Multi-day spans (accommodation / travel) ──
  const submitSpan = () => {
    const f = evForm;
    if (!f.title || !f.startDate || !f.endDate) { alert('Please fill in Title, start date and end date.'); return; }
    if (f.endDate < f.startDate) { alert('The end date must be on or after the start date.'); return; }
    const fields = { type:f.type, title:f.title, location:f.location, notes:f.notes, startDate:f.startDate, startTime:f.startTime, endDate:f.endDate, endTime:f.spanEndTime };
    if (editSpanId) {
      update({ spans:(trip.spans||[]).map(s => s.id===editSpanId ? { ...s, ...fields } : s) });
    } else {
      update({ spans:[...(trip.spans||[]), { id:uid(), ...fields, status:'todo', docs:[] }] });
    }
    closeModal();
  };
  const delSpan = (id) => {
    const s = (trip.spans||[]).find(x=>x.id===id);
    if (s && s.docs) s.docs.forEach(d => d.url && deleteFromStorage(d.url));
    update({ spans:(trip.spans||[]).filter(x=>x.id!==id) });
  };
  const cycleSpanStatus = (id) =>
    update(t => ({ spans:(t.spans||[]).map(s => s.id===id ? { ...s, status:nextStatus(stOf(s)), done:undefined } : s) }));
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
    const days = (trip.days||[]).map(d => d.id===dayId
      ? { ...d, events:(d.events||[]).filter(e=>e.id!==evId) }
      : d);
    update({ days });
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
          <button onClick={()=>onDel(doc.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#C04428',fontSize:13,padding:'0 2px',lineHeight:1 }}>✕</button>
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



  return (
    <div>
      <div style={{ position:"sticky", top:"calc(env(safe-area-inset-top, 0px) + 51px)", zIndex:15, background:"#F0EBE0", margin:"0 -20px 16px", padding:"6px 20px 10px", borderBottom:"2px solid #C4A882", display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <h2 style={{ margin:0,fontSize:16,fontWeight:700 }}>Days</h2>
        <Btn onClick={()=>setShowDay(true)}>+ Add Day</Btn>
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
            <div style={{ display:"flex",gap:6 }}>
              <Btn onClick={()=>openAddEvent(day)} style={{ padding:"4px 10px",fontSize:12 }}>+ Event</Btn>
              <Btn variant="danger" style={{ padding:"4px 8px",fontSize:12 }} onClick={()=>delDay(day.id)}>✕</Btn>
            </div>
          </div>

          {!collapsedDays[day.id] && (<>
          {(!day.events||day.events.length===0) && spansOnDay(trip, day.date).length===0 && (
            <p style={{ color:"#C05040",fontSize:13,padding:"10px 14px",margin:0 }}>No events</p>
          )}

          {/* ── Multi-day spans (hotel stays, flights/trains/cars) that touch this day ── */}
          {spansOnDay(trip, day.date).map(s => (
            <div key={s.id} style={{ padding:"9px 14px",borderTop:"1px solid #D4BFB0",background:"#F3ECDA" }}>
              <div style={{ display:"flex",alignItems:"flex-start",gap:8 }}>
                <StatusBox status={stOf(s)} onClick={()=>cycleSpanStatus(s.id)} size={16} style={{ marginRight:0 }} />
                <span style={{ fontSize:17,lineHeight:1.2,flexShrink:0 }}>{(SPAN_TYPES[s.type]||{}).icon}</span>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                    <span style={{ opacity: stOf(s)==='done'?0.55:1, textDecoration: stOf(s)==='done'?"line-through":"none" }}>
                      {Editable({ kind:'span', ids:{ dayId:day.id, evId:s.id }, value:s.title, placeholder:'(untitled)', spanStyle:{ fontSize:13,fontWeight:700,color:'#6E1A10' }, inputWidth:200 })}
                    </span>
                    <span style={{ fontSize:11,background:"#E4D3B4",borderRadius:4,padding:"1px 6px",color:"#7A4A1A",fontWeight:600 }}>{s.type}</span>
                  </div>
                  <div style={{ fontSize:11.5,color:'#9A6A2A',fontWeight:700,marginTop:3,textTransform:'uppercase',letterSpacing:'0.04em' }}>{spanSegLabel(s, day.date)}</div>
                  {s.location && <div style={{ fontSize:12,color:"#A83020",marginTop:2 }}>📍 {s.location}</div>}
                  {s.notes && <div style={{ fontSize:12,color:"#C05040",marginTop:2 }}>{s.notes}</div>}
                  <div style={{ fontSize:10.5,color:'#B0967A',marginTop:3 }}>
                    {fmtDate(s.startDate)}{s.startTime?` · ${s.startTime}`:''} → {fmtDate(s.endDate)}{s.endTime?` · ${s.endTime}`:''}
                  </div>
                  <DocList docs={s.docs||[]} onAdd={(file)=>attachSpanDoc(s.id,file)} onDel={(docId)=>delSpanDoc(s.id,docId)} />
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:8 }}>
                  <span style={{ width:54,display:"flex",justifyContent:"flex-end" }}><StatusBadge status={stOf(s)} /></span>
                  <label title="Attach document" style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,cursor:'pointer',color:'#8B2A14',background:'rgba(139,42,20,0.08)',flexShrink:0 }}>
                    <span style={{ fontSize:15, lineHeight:1 }}>📎</span>
                    <input type="file" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) attachSpanDoc(s.id,e.target.files[0]); e.target.value=''; }} />
                  </label>
                  <button title="Edit" onClick={()=>openEditSpan(s)} style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,border:'none',cursor:'pointer',color:'#8B2A14',background:'rgba(139,42,20,0.08)',fontSize:13,lineHeight:1,flexShrink:0 }}>✎</button>
                  <button title="Delete" onClick={()=>delSpan(s.id)} style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,border:'none',cursor:'pointer',color:'#8B2A14',background:'#F5E0D8',fontSize:13,lineHeight:1,flexShrink:0 }}>✕</button>
                </div>
              </div>
            </div>
          ))}

          {(day.events||[]).map(ev => (
            <div key={ev.id} style={{ padding:"10px 14px",borderTop:"1px solid #D4BFB0" }}>
              {/* ── Event Header ── */}
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                <StatusBox status={stOf(ev)} onClick={()=>cycleEventStatus(day.id,ev.id)} size={16} style={{ marginRight:8 }} />
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                    <span style={{ fontSize:12,color:"#B54030",fontWeight:600,display:"inline-flex",alignItems:"center",gap:4 }}>
                      {Editable({ kind:'startTime', ids:{ dayId:day.id, evId:ev.id }, value:ev.time, placeholder:'--:--', spanStyle:{ fontSize:12,color:'#B54030',fontWeight:600 }, inputType:'time', inputWidth:108 })}
                      <span style={{ color:'#C8A090' }}>–</span>
                      {Editable({ kind:'endTime', ids:{ dayId:day.id, evId:ev.id }, value:ev.endTime, placeholder:'--:--', spanStyle:{ fontSize:12,color:'#B54030',fontWeight:600 }, inputType:'time', inputWidth:108 })}
                    </span>
                    <span style={{ opacity: stOf(ev)==='done'?0.55:1, textDecoration: stOf(ev)==='done'?"line-through":"none" }}>
                      {Editable({ kind:'event', ids:{ dayId:day.id, evId:ev.id }, value:ev.title, placeholder:'(untitled)', spanStyle:{ fontSize:13, fontWeight:500 }, inputWidth:200 })}
                    </span>
                    <span style={{ fontSize:11,background:"#DDD8CB",borderRadius:4,padding:"1px 6px",color:"#8B2A14" }}>{ev.category}</span>
                  </div>
                  {ev.location && <div style={{ fontSize:12,color:"#A83020",marginTop:2 }}>📍 {ev.location}</div>}
                  {ev.notes && <div style={{ fontSize:12,color:"#C05040",marginTop:2 }}>{ev.notes}</div>}
                </div>
                {/* right-aligned action columns: status · attach · delete */}
                <div style={{ display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:8 }}>
                  <span style={{ width:54,display:"flex",justifyContent:"flex-end" }}><StatusBadge status={stOf(ev)} /></span>
                  <label title="Attach document" style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,cursor:'pointer',color:'#8B2A14',background:'rgba(139,42,20,0.08)',flexShrink:0 }}>
                    <span style={{ fontSize:15, lineHeight:1 }}>📎</span>
                    <input type="file" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) attachDoc(day.id,ev.id,null,e.target.files[0]); e.target.value=''; }} />
                  </label>
                  <button title="Delete event" onClick={()=>delEvent(day.id,ev.id)} style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,border:'none',cursor:'pointer',color:'#8B2A14',background:'#F5E0D8',fontSize:13,lineHeight:1,flexShrink:0 }}>✕</button>
                </div>
              </div>

              {/* ── Documents for Event ── */}
              <DocList
                docs={ev.docs||[]}
                onAdd={(file)=>attachDoc(day.id,ev.id,null,file)}
                onDel={(docId)=>delDoc(day.id,ev.id,null,docId)}
              />

              {/* ── Activities ── */}
              {(ev.activities||[]).length > 0 && (
                <div style={{ marginTop:10,paddingLeft:12,borderLeft:"2px solid #D4BFB0" }}>
                  {(ev.activities||[]).map(act => (
                    <div key={act.id} style={{ marginBottom:6 }}>
                      <div style={{ display:"flex",alignItems:"flex-start",gap:6 }}>
                        <StatusBox status={stOf(act)} onClick={()=>cycleActivityStatus(day.id,ev.id,act.id)} size={14} style={{ marginTop:2 }} />
                        <div style={{ flex:1 }}>
                          <span style={{ display:"inline-block", opacity: stOf(act)==='done'?0.55:1, textDecoration: stOf(act)==='done'?"line-through":"none" }}>
                            {Editable({ kind:'activity', ids:{ dayId:day.id, evId:ev.id, actId:act.id }, value:act.text, placeholder:'(empty)', spanStyle:{ fontSize:13, color:'#6E1A10' }, inputWidth:240 })}
                          </span>
                          {/* Docs for this activity */}
                          <DocList
                            docs={act.docs||[]}
                            onAdd={(file)=>attachDoc(day.id,ev.id,act.id,file)}
                            onDel={(docId)=>delDoc(day.id,ev.id,act.id,docId)}
                          />
                        </div>
                        {/* right-aligned action columns: status · attach · delete */}
                        <div style={{ display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:8 }}>
                          <span style={{ width:54,display:"flex",justifyContent:"flex-end" }}><StatusBadge status={stOf(act)} /></span>
                          <label title="Attach document" style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,cursor:'pointer',color:'#8B2A14',background:'rgba(139,42,20,0.08)',flexShrink:0 }}>
                            <span style={{ fontSize:15, lineHeight:1 }}>📎</span>
                            <input type="file" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) attachDoc(day.id,ev.id,act.id,e.target.files[0]); e.target.value=''; }} />
                          </label>
                          <button title="Delete activity" onClick={()=>delActivity(day.id,ev.id,act.id)} style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,border:'none',cursor:'pointer',color:'#8B2A14',background:'#F5E0D8',fontSize:13,lineHeight:1,flexShrink:0 }}>✕</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Add Activity ── */}
              {addingActivityFor === ev.id ? (
                <div style={{ display:'flex',gap:6,marginTop:8,alignItems:'center' }}>
                  <input
                    autoFocus
                    placeholder="Describe the activity…"
                    value={activityInput[ev.id]||''}
                    onChange={e=>setActivityInput(prev=>({...prev,[ev.id]:e.target.value}))}
                    onKeyDown={e=>{ if(e.key==='Enter') addActivity(day.id,ev.id); if(e.key==='Escape') setAddingActivityFor(null); }}
                    style={{ flex:1,padding:'5px 9px',border:'1px solid #C8B09A',borderRadius:6,fontSize:13,background:'#F0EBE0',color:'#6E1A10',outline:'none' }}
                  />
                  <Btn style={{ padding:'4px 10px',fontSize:12 }} onClick={()=>addActivity(day.id,ev.id)}>Add</Btn>
                  <Btn variant="ghost" style={{ padding:'4px 8px',fontSize:12 }} onClick={()=>setAddingActivityFor(null)}>Cancel</Btn>
                </div>
              ) : (
                <button
                  onClick={()=>setAddingActivityFor(ev.id)}
                  style={{ marginTop:8,background:'none',border:'1px dashed #C8B09A',borderRadius:6,padding:'3px 10px',fontSize:12,color:'#8B2A14',cursor:'pointer',fontWeight:500 }}
                >
                  + Activity
                </button>
              )}
            </div>
          ))}
          </>)}
        </div>
      ))}

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
        <Modal title={editSpanId ? `Edit ${evForm.type}` : 'Add to Itinerary'} onClose={closeModal}>
          <Select label="Duration" value={evForm.duration}
            onChange={e=>setEvForm({...evForm, duration:e.target.value})}
            options={["single","multi"]}
            renderOption={o => o==='single' ? 'Single day' : 'Multi-day'} />

          {evForm.duration === 'multi' ? (
            // ── Multi-day span: accommodation (check-in/out) / travel (depart/arrive) / other ──
            <>
              <Select label="Type" value={evForm.type}
                onChange={e=>setEvForm({...evForm, type:e.target.value})}
                options={SPAN_TYPE_OPTIONS} />
              {(() => { const m = SPAN_TYPES[evForm.type] || SPAN_TYPES.Other; return (
                <>
                  <Input label="Title *" value={evForm.title} onChange={e=>setEvForm({...evForm,title:e.target.value})}
                    placeholder={evForm.type==='Accommodation' ? 'e.g. Taj Hotel, Rishikesh' : evForm.type==='Travel' ? 'e.g. AI 865  Delhi → Dehradun' : 'e.g. Yoga retreat'} />
                  <div style={{ display:"flex", gap:10 }}>
                    <div style={{ flex:1.4 }}><Input label={`${m.startLabel} date *`} type="date" value={evForm.startDate} onChange={e=>setEvForm({...evForm,startDate:e.target.value})} /></div>
                    <div style={{ flex:1 }}><Input label={`${m.startLabel} time`} type="time" value={evForm.startTime} onChange={e=>setEvForm({...evForm,startTime:e.target.value})} /></div>
                  </div>
                  <div style={{ display:"flex", gap:10 }}>
                    <div style={{ flex:1.4 }}><Input label={`${m.endLabel} date *`} type="date" value={evForm.endDate} onChange={e=>setEvForm({...evForm,endDate:e.target.value})} /></div>
                    <div style={{ flex:1 }}><Input label={`${m.endLabel} time`} type="time" value={evForm.spanEndTime} onChange={e=>setEvForm({...evForm,spanEndTime:e.target.value})} /></div>
                  </div>
                  <Input label="Location" value={evForm.location} onChange={e=>setEvForm({...evForm,location:e.target.value})}
                    placeholder={evForm.type==='Accommodation' ? 'e.g. Laxman Jhula Rd' : evForm.type==='Travel' ? 'e.g. Terminal 3' : 'Optional'} />
                  <Input label="Notes" value={evForm.notes} onChange={e=>setEvForm({...evForm,notes:e.target.value})} placeholder="Booking ref, PNR, room type…" />
                </>
              ); })()}
              <div style={{ display:"flex",gap:8,marginTop:8 }}>
                <Btn onClick={submitSpan}>{editSpanId ? 'Save Changes' : 'Add'}</Btn>
                <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
              </div>
            </>
          ) : (
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
              <div style={{ display:"flex",gap:8,marginTop:8 }}>
                <Btn onClick={()=>addEvent(showEvent)}>Add Event</Btn>
                <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function BudgetTab({ trip, update }) {
  const [showExp, setShowExp] = useState(false);
  const [form, setForm] = useState({ desc:"", amount:"", category:"Food" });

  const total = (trip.expenses||[]).reduce((s,e)=>s+parseFloat(e.amount||0),0);
  const budget = parseFloat(trip.budget||0);

  const addExp = () => {
    if (!form.desc||!form.amount) return;
    update({ expenses:[...(trip.expenses||[]), { id:uid(), ...form }] });
    setShowExp(false); setForm({ desc:"", amount:"", category:"Food" });
  };
  const delExp = (id) => update({ expenses: trip.expenses.filter(e=>e.id!==id) });

  const bycat = BUDGET_CATS.map(c => ({
    cat:c, total:(trip.expenses||[]).filter(e=>e.category===c).reduce((s,e)=>s+parseFloat(e.amount||0),0)
  })).filter(x=>x.total>0);

  return (
    <div>
      <div style={{ background:"#EDE7D9",border:"1px solid #D4BFB0",borderRadius:10,padding:16,marginBottom:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
          <span style={{ fontSize:13,color:"#A83020" }}>Trip Budget</span>
          <input value={trip.budget||""} onChange={e=>update({budget:e.target.value})} placeholder="0.00" type="number"
            style={{ width:120,padding:"4px 8px",border:"1px solid #C8B09A",borderRadius:6,fontSize:14,textAlign:"right" }} />
        </div>
        <div style={{ display:"flex",justifyContent:"space-between" }}>
          <span style={{ fontSize:13,color:"#A83020" }}>Spent</span>
          <span style={{ fontWeight:600,color: budget&&total>budget?"#8B2A14":"#6E1A10" }}>${total.toFixed(2)}</span>
        </div>
        {budget>0 && (
          <>
            <div style={{ marginTop:10,height:6,background:"#DDD8CB",borderRadius:3,overflow:"hidden" }}>
              <div style={{ height:"100%",background: total>budget?"#C04428":"#6E1A10",width:`${Math.min(100,(total/budget)*100)}%`,transition:"width .3s" }} />
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",marginTop:4,fontSize:12,color:"#B54030" }}>
              <span>Remaining: ${Math.max(0,budget-total).toFixed(2)}</span>
              <span>{budget>0?Math.round((total/budget)*100):0}%</span>
            </div>
          </>
        )}
      </div>

      {bycat.length>0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12,color:"#B54030",marginBottom:8 }}>By Category</div>
          {bycat.map(x=>(
            <div key={x.cat} style={{ display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderBottom:"1px solid #f3f4f6" }}>
              <span>{x.cat}</span><span style={{ fontWeight:500 }}>${x.total.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
        <span style={{ fontWeight:600 }}>Expenses</span>
        <Btn onClick={()=>setShowExp(true)}>+ Add Expense</Btn>
      </div>
      {(trip.expenses||[]).length===0 && <p style={{ color:"#C86050",textAlign:"center",marginTop:24 }}>No expenses logged yet.</p>}
      {(trip.expenses||[]).map(e=>(
        <div key={e.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f3f4f6" }}>
          <div>
            <div style={{ fontSize:13,fontWeight:500 }}>{e.desc}</div>
            <div style={{ fontSize:11,color:"#B54030" }}>{e.category}</div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontWeight:600 }}>${parseFloat(e.amount).toFixed(2)}</span>
            <Btn variant="danger" style={{ padding:"2px 8px",fontSize:12 }} onClick={()=>delExp(e.id)}>✕</Btn>
          </div>
        </div>
      ))}

      {showExp && (
        <Modal title="Add Expense" onClose={()=>setShowExp(false)}>
          <Input label="Description *" value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} />
          <Input label="Amount *" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} />
          <Select label="Category" options={BUDGET_CATS} value={form.category} onChange={e=>setForm({...form,category:e.target.value})} />
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


// ---- Status Tab ----  (read-only rollup of event/activity statuses per day)
function StatusTab({ trip, shareUrl }) {
  const days = trip.days || [];
  const [copied, setCopied] = useState(false);
  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      window.prompt('Copy this read-only status link:', shareUrl);
    }
  };

  const STATUS_WORD = { todo:'not started', active:'ongoing', done:'complete' };
  const LINE = '#3D0C02';

  // overall counts across the whole trip
  const total = { todo:0, active:0, done:0 };
  days.forEach(d => (d.events||[]).forEach(ev => {
    total[stOf(ev)]++;
    (ev.activities||[]).forEach(a => { total[stOf(a)]++; });
  }));
  (trip.spans||[]).forEach(s => { total[stOf(s)]++; }); // each span counts once
  const totalItems = total.todo + total.active + total.done;

  // flatten a day into timeline items (spans that touch it, then each event + activities)
  const dayItems = (day) => {
    const out = [];
    spansOnDay(trip, day.date).forEach(s => {
      const meta = SPAN_TYPES[s.type] || {};
      out.push({ key:s.id+'_'+day.id, status:stOf(s), time:spanSegLabel(s, day.date), name:`${meta.icon||''} ${s.title || '(untitled)'}`.trim() });
    });
    (day.events||[]).forEach(ev => {
      out.push({ key:ev.id, status:stOf(ev),
        time: ev.time ? `${ev.time}${ev.endTime ? ` to ${ev.endTime}` : ''}` : 'event',
        name: ev.title || '(untitled)' });
      (ev.activities||[]).forEach(a => {
        out.push({ key:a.id, status:stOf(a), time:'activity', name:a.text || '(activity)' });
      });
    });
    return out;
  };

  // DAY number = calendar days since the trip's earliest day + 1 (21 Jun = DAY 1, 04 Jul = DAY 14)
  const parseDay = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s||''); return m ? Date.UTC(+m[1], +m[2]-1, +m[3]) : null; };
  const baseMs = days.reduce((min, d) => { const t = parseDay(d.date); return (t != null && (min == null || t < min)) ? t : min; }, null);

  return (
    <div>
      {shareUrl && (
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:16, background:'#F5EFE2', border:'1px dashed #D4BFB0', borderRadius:10, padding:'10px 14px' }}>
          <span style={{ fontSize:12.5, color:'#8B5A3C', flex:1, minWidth:150, lineHeight:1.4 }}>Share a live, read-only link so anyone can follow this trip's status.</span>
          <button onClick={copyShare} style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'#6E1A10', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>{copied ? '✓ Link copied' : 'Share status'}</button>
        </div>
      )}
      {/* Overall counts */}
      {totalItems>0 && (
        <div style={{ fontSize:12.5, display:'flex', gap:12, flexWrap:'wrap', marginBottom:26 }}>
          <span style={{ color: STATUS_META.done.color, fontWeight:600 }}>{total.done} complete</span>
          <span style={{ color: STATUS_META.active.color, fontWeight:600 }}>{total.active} ongoing</span>
          <span style={{ color: STATUS_META.todo.color, fontWeight:600 }}>{total.todo} not started</span>
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
            <div style={{ display:'flex', alignItems:'center', marginBottom:30 }}>
            {/* Left: day label */}
            <div style={{ width:100, flexShrink:0, textAlign:'right', paddingRight:16 }}>
              <div style={{ fontSize:21, fontWeight:400, letterSpacing:'0.14em', color:'#2E2320', lineHeight:1.05 }}>DAY {dayNum}</div>
              <div style={{ fontSize:10.5, fontWeight:500, letterSpacing:'0.12em', color:'#7A685F', marginTop:4 }}>{fmtDate(day.date).toUpperCase()}</div>
              {day.label && <div style={{ fontSize:11, color:'#8B2A14', marginTop:4, fontStyle:'italic' }}>{day.label}</div>}
            </div>

            {/* Right: timeline */}
            <div style={{ flex:1, minWidth:0 }}>
              {items.length===0 && <div style={{ fontSize:13, color:'#C05040', padding:'2px 0' }}>No events</div>}
              {items.map((it, idx) => {
                const first = idx===0, last = idx===items.length-1;
                return (
                  <div key={it.key} style={{ display:'flex', gap:12, alignItems:'stretch' }}>
                    <div style={{ position:'relative', width:16, flexShrink:0 }}>
                      {!first && <div style={{ position:'absolute', left:7, top:0, height:10, width:2, background:LINE }} />}
                      {!last && <div style={{ position:'absolute', left:7, top:10, bottom:0, width:2, background:LINE }} />}
                      <div style={{ position:'absolute', left:2, top:4, width:12, height:12, borderRadius:'50%', boxSizing:'border-box', border:`2px solid ${LINE}`, background: it.status==='done' ? LINE : '#F0EBE0', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {it.status==='active' && <span style={{ width:4, height:4, borderRadius:'50%', background:LINE }} />}
                      </div>
                    </div>
                    <div style={{ width:80, flexShrink:0, paddingBottom: last?0:28, fontSize:12, letterSpacing:'0.03em', color:'#4A3B34', textTransform:'uppercase', lineHeight:1.35 }}>{it.time}</div>
                    <div style={{ flex:1, minWidth:0, paddingBottom: last?0:28, fontSize:13.5, color:'#2E2320', lineHeight:1.4 }}>
                      {it.name} <span style={{ color: STATUS_META[it.status].color, fontWeight:600 }}>{STATUS_WORD[it.status]}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        );
      })}
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

function MainApp() {
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeTab, setActiveTab] = useState("Schedule");
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [showToday, setShowToday] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
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

  // Load from online store on mount
  useEffect(() => {
    // Try cloud first, fallback to localStorage
    loadFromCloud().then(cloudData => {
      if (cloudData && cloudData.trips && cloudData.trips.length > 0) {
        setTrips(cloudData.trips);
        setActiveTrip(cloudData.trips[0].id);
        if (cloudData.header_note) setHeaderNote(cloudData.header_note);
        // Also update localStorage cache
        try { localStorage.setItem('travelPlannerData', JSON.stringify({ trips: cloudData.trips })); } catch(e) {}
      } else {
        // Fallback to localStorage
        try {
          const sv = localStorage.getItem('travelPlannerData');
          if (sv) { const { trips: t } = JSON.parse(sv); if (t && t.length) { setTrips(t); setActiveTrip(t[0].id); } }
        } catch(e) {}
      }
    });
  }, [])

  // Auto-save: debounce 2s after any change to trips
  useEffect(() => {
    if (trips.length === 0) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem('travelPlannerData', JSON.stringify({ trips })); } catch(e) {}
      saveToCloud(trips, headerNote);
    }, 2000);
    return () => clearTimeout(timer);
  }, [trips, headerNote]);

  const handleSave = () => {
    setSavedStatus('saving');
    // Save to localStorage immediately
    try { localStorage.setItem('travelPlannerData', JSON.stringify({ trips })); } catch(e) {}
    // Save to cloud
    saveToCloud(trips, headerNote).then(() => {
      setSavedStatus('saved');
      setTimeout(() => setSavedStatus(''), 2500);
    }).catch(() => {
      setSavedStatus('saved');
      setTimeout(() => setSavedStatus(''), 2500);
    });
  };
  const [tripForm, setTripForm] = useState({ name:"", destination:"", startDate:"", endDate:"" });

  const createTrip = () => {
    if (!tripForm.name) return;
    recordHistory();
    const t = { ...defaultTrip(), ...tripForm };
    const updated = [...trips, t];
    setTrips(updated);
    setActiveTrip(t.id);
    setShowNewTrip(false);
    setTripForm({ name:"", destination:"", startDate:"", endDate:"" });
  };

  const deleteTrip = (id) => {
    recordHistory();
    const updated = trips.filter(t=>t.id!==id);
    setTrips(updated);
    setActiveTrip(updated.length>0 ? updated[0].id : null);
  };

  const updateTrip = (id, patch) => {
    recordHistory();
    // patch may be a plain object (most tabs) or an updater fn (Pictures tab)
    setTrips(prev => prev.map(t =>
      t.id===id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t
    ));
  };

  const saveProfile = (p) => {
    setProfile(p);
    try { localStorage.setItem('travelerProfile', JSON.stringify(p)); } catch(e){}
    setShowProfile(false);
  };

  const goToTrip = (id) => { setActiveTrip(id); setActiveTab('Schedule'); setShowSearch(false); };

  const trip = trips.find(t=>t.id===activeTrip);

  // Local calendar date as YYYY-MM-DD, for the Today's Plan view
  const todayISO = (() => { const d = new Date(); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })();
  const dateRange = trip ? tripDateRange(trip) : { start:"", end:"" };


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
              <p style={{ margin:0,fontSize:10.5,color:"rgba(245,236,215,0.6)",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:500,marginTop:3 }}>Your trips, all in one place</p>
            </div>
          </div>
        </div>
        {/* Row 2: action toolbar */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px 6px" }}>
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
              onClick={()=>setShowProfile(true)}
              aria-label="Settings and profile"
              title="Traveler profile"
              style={{ width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,border:"1.5px solid rgba(245,236,215,0.28)",background:"rgba(245,236,215,0.08)",color:"#F5ECD7",padding:0,cursor:"pointer",transition:"all 0.3s",overflow:"hidden" }}
            >
              {profile && profile.pic
                ? <img src={profile.pic} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>}
            </button>
          </div>
        {/* Header note */}
        <div style={{ padding:"0 20px 10px" }}>
          <textarea value={headerNote} onChange={e=>setHeaderNote(e.target.value)} placeholder="Add a trip note or travel tagline…" rows={1} style={{ width:"100%",boxSizing:"border-box",resize:"none",padding:"7px 12px",border:"1px solid rgba(245,236,215,0.2)",borderRadius:7,background:"rgba(0,0,0,0.15)",color:"rgba(245,236,215,0.85)",fontSize:12,fontFamily:"inherit",outline:"none",lineHeight:1.5,letterSpacing:"0.01em" }} />
        </div>
        {/* Trip tabs */}
        <div style={{ display:"flex",gap:2,overflowX:"auto",padding:"0 20px",paddingBottom:0 }}>
          {trips.map(t=>(
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
              {t.name||"Unnamed"}
            </button>
          ))}
          {/* New Trip tab */}
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
        </div>
      </div>

      {/* Trip content */}
      {!trip ? (
        <div style={{ textAlign:"center",marginTop:80,color:"#D47060" }}>
          <div style={{ fontSize:48,marginBottom:12 }}>🗺️</div>
          <p style={{ fontSize:15 }}>No trips yet. Create your first one!</p>
          <Btn onClick={()=>setShowNewTrip(true)} style={{ marginTop:8 }}>+ New Trip</Btn>
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
            </div>
            <Btn variant="danger" style={{ fontSize:12,padding:"4px 10px" }} onClick={()=>deleteTrip(trip.id)}>Delete Trip</Btn>
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

          {activeTab==="Schedule" && <ScheduleTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
          {activeTab==="Budget" && <BudgetTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
          {activeTab==="Packing" && <PackingTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
          {activeTab==="Status" && <StatusTab trip={trip} shareUrl={`https://mytravelhub.netlify.app/?view=${trip.id}`} />}
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
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setShowNewTrip(false)}>Cancel</Btn>
            <Btn onClick={createTrip}>Create Trip</Btn>
          </div>
        </Modal>
      )}

      {showToday && (
        <TodayView trips={trips} todayISO={todayISO} updateTrip={updateTrip} onClose={()=>setShowToday(false)} />
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

// ---- Today's Plan (focused view of the current date across all trips) ----
function TodayView({ trips, todayISO, updateTrip, onClose }) {
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
    ? { ...d, events:(d.events||[]).map(e => e.id===evId ? { ...e, status: nextStatus(stOf(e)), done: undefined } : e) } : d) }));
  const toggleAct = (tripId, dayId, evId, actId) => updateTrip(tripId, t => ({ days:(t.days||[]).map(d => d.id===dayId
    ? { ...d, events:(d.events||[]).map(e => e.id===evId
        ? { ...e, activities:(e.activities||[]).map(a => a.id===actId ? { ...a, status: stOf(a)==='done'?'todo':'done', done: undefined } : a) } : e) } : d) }));
  const toggleSpan = (tripId, spanId) => updateTrip(tripId, t => ({ spans:(t.spans||[]).map(s => s.id===spanId ? { ...s, status:nextStatus(stOf(s)), done:undefined } : s) }));

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
                <StatusBox status={stOf(s)} onClick={()=>toggleSpan(trip.id, s.id)} size={18} style={{ marginTop:2 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontSize:16 }}>{(SPAN_TYPES[s.type]||{}).icon}</span>
                    <span style={{ fontSize:14, fontWeight:700, color:'#2E2320', textDecoration: stOf(s)==='done'?'line-through':'none', opacity: stOf(s)==='done'?0.55:1 }}>{s.title || '(untitled)'}</span>
                    <span style={{ fontSize:11, background:'#E4D3B4', borderRadius:4, padding:'1px 6px', color:'#7A4A1A', fontWeight:700 }}>{spanSegLabel(s, todayISO)}</span>
                    <StatusBadge status={stOf(s)} />
                  </div>
                  {s.location && <div style={{ fontSize:12.5, color:'#A83020', marginTop:3 }}>📍 {s.location}</div>}
                  {s.notes && <div style={{ fontSize:12.5, color:'#7A685F', marginTop:3 }}>{s.notes}</div>}
                  {docLinks(s.docs)}
                </div>
              </div>
            ))}

            {(day.events||[]).map(ev => (
              <div key={ev.id} style={{ display:'flex', gap:12, padding:'12px 0', borderTop:'1px solid #E2D8C8' }}>
                <StatusBox status={stOf(ev)} onClick={()=>cycleEvent(trip.id, day.id, ev.id)} size={18} style={{ marginTop:2 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    {(ev.time || ev.endTime) && <span style={{ fontSize:12.5, fontWeight:600, color:'#B54030' }}>{ev.time}{ev.endTime?` – ${ev.endTime}`:''}</span>}
                    <span style={{ fontSize:14, fontWeight:600, color:'#2E2320', textDecoration: stOf(ev)==='done'?'line-through':'none', opacity: stOf(ev)==='done'?0.55:1 }}>{ev.title || '(untitled)'}</span>
                    {ev.category && <span style={{ fontSize:11, background:'#E4DED0', borderRadius:4, padding:'1px 6px', color:'#8B2A14' }}>{ev.category}</span>}
                    <StatusBadge status={stOf(ev)} />
                  </div>
                  {ev.location && <div style={{ fontSize:12.5, color:'#A83020', marginTop:3 }}>📍 {ev.location}</div>}
                  {ev.notes && <div style={{ fontSize:12.5, color:'#7A685F', marginTop:3 }}>{ev.notes}</div>}
                  {docLinks(ev.docs)}
                  {(ev.activities||[]).length > 0 && (
                    <div style={{ marginTop:10, borderLeft:'2px solid #E2D8C8' }}>
                      {(ev.activities||[]).map(act => (
                        <div key={act.id} style={{ display:'flex', gap:10, alignItems:'flex-start', paddingLeft:8, marginBottom:8 }}>
                          <StatusBox status={stOf(act)} onClick={()=>toggleAct(trip.id, day.id, ev.id, act.id)} size={14} style={{ marginTop:2 }} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <span style={{ fontSize:13.5, color:'#2E2320', textDecoration: stOf(act)==='done'?'line-through':'none', opacity: stOf(act)==='done'?0.55:1 }}>{act.text || '(activity)'}</span>
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
            if ((a.text || '').toLowerCase().includes(query)) add(a.text, `${trip.name} · ${fmtDate(day.date)} · activity`);
            (a.docs || []).forEach(d => { if ((d.name || '').toLowerCase().includes(query)) add(d.name, `${trip.name} · attachment`); });
          });
        });
      });
      (trip.spans || []).forEach(s => {
        if ([s.title, s.location, s.notes, s.type].filter(Boolean).join(' ').toLowerCase().includes(query)) add(s.title || s.type, `${trip.name} · ${s.type} · ${fmtDate(s.startDate)}`);
        (s.docs || []).forEach(d => { if ((d.name || '').toLowerCase().includes(query)) add(d.name, `${trip.name} · ${s.type} · attachment`); });
      });
    });
  }
  return (
    <Modal title="Search" onClose={onClose}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search trips, events, activities, docs…"
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

// ---- Documents repository: every attachment across a trip ----
function DocsView({ trip, onClose }) {
  const items = [];
  (trip.days || []).forEach(day => (day.events || []).forEach(ev => {
    (ev.docs || []).forEach(d => items.push({ doc: d, ctx: `${fmtDate(day.date)} · ${ev.title || 'event'}` }));
    (ev.activities || []).forEach(a => (a.docs || []).forEach(d => items.push({ doc: d, ctx: `${fmtDate(day.date)} · ${ev.title || 'event'} · ${a.text || 'activity'}` })));
  }));
  (trip.spans || []).forEach(s => (s.docs || []).forEach(d => items.push({ doc: d, ctx: `${s.type} · ${s.title || ''} · ${fmtDate(s.startDate)}` })));
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
            <div style={{ fontSize:12, color:'rgba(245,236,215,0.65)', marginTop:2 }}>{trip.name} · {items.length} file{items.length===1?'':'s'}</div>
          </div>
        </div>
      </div>
      <div style={{ maxWidth:680, margin:'0 auto', padding:'16px 20px' }}>
        {items.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 10px', color:'#B54030' }}>
            <div style={{ fontSize:44, marginBottom:12 }}>📎</div>
            <p style={{ fontSize:15, margin:0 }}>No documents attached yet.</p>
            <p style={{ fontSize:13, color:'#8A7A6D', marginTop:8 }}>Attach files to events or activities in the Schedule tab.</p>
          </div>
        ) : items.map((it, i) => (
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
    </div>
  );
}

// ---- Export a trip's itinerary as a downloadable HTML file ----
function exportTripHtml(trip) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
  let body = '';
  (trip.days || []).forEach(day => {
    body += `<h2>${esc(fmtDate(day.date))}${day.label ? ` — ${esc(day.label)}` : ''}</h2>`;
    (day.events || []).forEach(ev => {
      const tm = ev.time ? `${esc(ev.time)}${ev.endTime ? '–' + esc(ev.endTime) : ''} ` : '';
      body += `<div class="ev"><strong>${tm}${esc(ev.title || '')}</strong> <span class="cat">${esc(ev.category || '')}</span> <span class="st">[${esc(stOf(ev))}]</span>`;
      if (ev.location) body += `<div class="loc">📍 ${esc(ev.location)}</div>`;
      if (ev.notes) body += `<div class="note">${esc(ev.notes)}</div>`;
      (ev.activities || []).forEach(a => { body += `<div class="act">• ${esc(a.text || '')} <span class="st">[${esc(stOf(a))}]</span></div>`; });
      body += `</div>`;
    });
  });
  const r = tripDateRange(trip);
  const dateLine = r.start ? ` &nbsp;•&nbsp; ${esc(fmtDate(r.start))}${r.end && r.end !== r.start ? ' → ' + esc(fmtDate(r.end)) : ''}` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(trip.name)} — itinerary</title>` +
    `<style>body{font-family:Arial,Helvetica,sans-serif;color:#3D0C02;max-width:720px;margin:24px auto;padding:0 18px;line-height:1.5;}h1{color:#6E1A10;margin-bottom:4px;}h2{color:#8B2A14;border-bottom:1px solid #D4BFB0;padding-bottom:4px;margin-top:26px;font-size:18px;}.ev{margin:10px 0 14px;padding-left:10px;border-left:3px solid #D4BFB0;}.cat{color:#8B2A14;font-size:12px;}.st{color:#999;font-size:11px;text-transform:uppercase;}.loc{color:#A83020;font-size:13px;}.note{color:#6b5a52;font-size:13px;}.act{margin-left:14px;color:#555;font-size:13px;}.sub{color:#8B5A3C;}</style>` +
    `</head><body><h1>${esc(trip.name || 'Trip')}</h1><p class="sub">${esc(trip.destination || '')}${dateLine}</p>${body || '<p>No days scheduled.</p>'}</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(trip.name || 'trip').replace(/[^a-z0-9]+/gi, '_')}-itinerary.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---- Read-only Viewer (shared status link: ?view=<tripId>) ----
const fmtDateTime = (iso) => {
  try { return new Date(iso).toLocaleString(undefined, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); }
  catch(e){ return ''; }
};

function ViewerApp({ tripId }) {
  const [trip, setTrip] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | ok | notfound | error
  const [updatedAt, setUpdatedAt] = useState(null);
  const [reload, setReload] = useState(0);
  const refresh = () => setReload(r => r + 1);

  useEffect(() => {
    let cancelled = false;
    const fetchTrip = async () => {
      try {
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
  }, [tripId, reload]);

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
      <StatusTab trip={trip} />
      <div style={{ textAlign:"center", fontSize:11, color:"#B0A091", padding:"18px 0 8px" }}>Read-only view · shared by the traveler</div>
    </div>
  );
}

export default function Root() {
  const viewId = new URLSearchParams(window.location.search).get('view');
  return viewId ? <ViewerApp tripId={viewId} /> : <MainApp />;
}
