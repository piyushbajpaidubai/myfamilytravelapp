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

function Select({ label, options, ...props }) {
  return (
    <div style={{ marginBottom:12 }}>
      {label && <label style={{ display:"block",fontSize:12,color:"#A83020",marginBottom:4 }}>{label}</label>}
      <select {...props} style={{ width:"100%",padding:"8px 10px",border:"1px solid #C8B09A",borderRadius:7,fontSize:14,boxSizing:"border-box" }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
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
  const [showEvent, setShowEvent] = useState(null); // dayId
  const [dayForm, setDayForm] = useState({ date:"", label:"" });
  const [evForm, setEvForm] = useState({ time:"", endTime:"", title:"", location:"", category:"Sightseeing", notes:"" });
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

  const addEvent = (dayId) => {
    if (!evForm.title || !evForm.time || !evForm.endTime) {
      alert('Please fill in Title, Start Time and End Time.');
      return;
    }
    const newEvent = { id:uid(), ...evForm, activities:[], docs:[] };
    const days = (trip.days||[]).map(d => d.id===dayId
      ? { ...d, events:[...(d.events||[]), newEvent].sort((a,b)=>a.time>b.time?1:-1) }
      : d);
    update({ days });
    setShowEvent(null); setEvForm({ time:"", endTime:"", title:"", location:"", category:"Sightseeing", notes:"" });
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
              <span style={{ fontFamily:"'Jost','Futura PT',sans-serif",fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60vw' }}>{preview.name}</span>
              <div style={{ display:'flex',gap:8,flexShrink:0 }}>
                <a href={srcOf(preview)} download={preview.name}
                  style={{ fontSize:12,padding:'4px 12px',borderRadius:6,background:'rgba(255,255,255,0.15)',color:'#fff',textDecoration:'none',fontFamily:"'Jost',sans-serif",cursor:'pointer' }}>
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
                    <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px',fontFamily:"'Jost',sans-serif",color:'#6E1A10',gap:16 }}>
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
                      <div style={{ textAlign:'center',padding:'40px',fontFamily:"'Jost',sans-serif",color:'#6E1A10' }}>
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
                <div style={{ textAlign:'center',padding:'40px',fontFamily:"'Jost',sans-serif",color:'#6E1A10' }}>
                  <div style={{ fontSize:48,marginBottom:12 }}>📄</div>
                  <p style={{ fontSize:14,marginBottom:16 }}>Preview not available for this file type.</p>
                  <a href={srcOf(preview)} download={preview.name}
                    style={{ background:'#3D0C02',color:'#fff',padding:'8px 20px',borderRadius:8,textDecoration:'none',fontSize:13,fontFamily:"'Jost',sans-serif" }}>
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
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
        <h2 style={{ margin:0,fontSize:16,fontWeight:700 }}>Days</h2>
        <Btn onClick={()=>setShowDay(true)}>+ Add Day</Btn>
      </div>

      {(!trip.days||trip.days.length===0) && (
        <p style={{ color:"#C05040",fontSize:13,textAlign:"center",padding:"24px 0" }}>No days added yet.</p>
      )}

      {(trip.days||[]).map(day => (
        <div key={day.id} style={{ marginBottom:16,border:"1px solid #D4BFB0",borderRadius:10,overflow:"hidden",background:"#EDE7D9" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"#DDD8CB" }}>
            <div>
              <strong style={{ fontSize:14 }}>{fmtDate(day.date)}</strong>
              <span style={{ marginLeft:8 }}>{Editable({ kind:'day', ids:{ dayId:day.id }, value:day.label, placeholder:'+ add label', spanStyle:{ fontSize:13, color:'#8B2A14' }, inputWidth:160 })}</span>
            </div>
            <div style={{ display:"flex",gap:6 }}>
              <Btn onClick={()=>setShowEvent(day.id)} style={{ padding:"4px 10px",fontSize:12 }}>+ Event</Btn>
              <Btn variant="danger" style={{ padding:"4px 8px",fontSize:12 }} onClick={()=>delDay(day.id)}>✕</Btn>
            </div>
          </div>

          {(!day.events||day.events.length===0) && (
            <p style={{ color:"#C05040",fontSize:13,padding:"10px 14px",margin:0 }}>No events</p>
          )}

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
        <Modal title="Add Event" onClose={()=>setShowEvent(null)}>
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
            <Btn variant="ghost" onClick={()=>setShowEvent(null)}>Cancel</Btn>
          </div>
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
        <h3 style={{ margin: 0, color: '#3D0C02', fontFamily: "'Jost','Futura PT','Century Gothic',sans-serif", fontSize: '18px', fontWeight: 600 }}>Trip Pictures</h3>
        <label style={{ background: uploading ? '#7A5A50' : '#3D0C02', color: '#fff', padding: '8px 18px', borderRadius: '8px', cursor: uploading ? 'default' : 'pointer', fontFamily: "'Jost','Futura PT','Century Gothic',sans-serif", fontSize: '14px', fontWeight: 500 }}>
          {uploading ? 'Uploading…' : '+ Upload Photos'}
          <input type="file" accept="image/*" multiple disabled={uploading} onChange={addPics} style={{ display: 'none' }} />
        </label>
      </div>

      {pics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8B4A3A' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📷</div>
          <p style={{ fontFamily: "'Jost','Futura PT','Century Gothic',sans-serif", fontSize: '15px' }}>No pictures yet. Upload some to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
          {pics.map(pic => (
            <div key={pic.id} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', aspectRatio: '1', background: '#E8E4D9', cursor: 'pointer', boxShadow: '0 2px 8px rgba(61,12,2,0.12)' }}
              onClick={() => setLightbox(pic)}>
              <img src={pic.url || pic.data} alt={pic.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <button onClick={e => { e.stopPropagation(); delPic(pic.id); }}
                style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(61,12,2,0.75)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', color: '#fff', cursor: 'pointer', fontSize: '14px', lineHeight: '24px', textAlign: 'center', padding: 0 }}>×</button>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(61,12,2,0.6))', padding: '18px 6px 6px', fontSize: '11px', color: '#fff', fontFamily: "'Jost','Futura PT',sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pic.name}</div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
            <img src={lightbox.url || lightbox.data} alt={lightbox.name} style={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain' }} />
            <div style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '10px 16px', fontFamily: "'Jost','Futura PT',sans-serif", fontSize: '13px' }}>{lightbox.name}</div>
            <button onClick={() => setLightbox(null)}
              style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', border: '2px solid #fff', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', cursor: 'pointer', fontSize: '18px', lineHeight: '28px', textAlign: 'center', padding: 0 }}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ---- Status Tab ----  (read-only rollup of event/activity statuses per day)
function StatusTab({ trip }) {
  const days = trip.days || [];

  // small read-only status indicator
  const Dot = ({ status }) => {
    const m = STATUS_META[status] || STATUS_META.todo;
    return <span style={{ width:11, height:11, borderRadius:'50%', boxSizing:'border-box',
      background: status==='todo' ? 'transparent' : m.ring, border:`2px solid ${m.ring}`,
      flexShrink:0, display:'inline-block' }} />;
  };

  // collect every event + activity status for a list of events
  const tally = (events) => {
    const counts = { todo:0, active:0, done:0 };
    events.forEach(ev => {
      counts[stOf(ev)]++;
      (ev.activities||[]).forEach(a => { counts[stOf(a)]++; });
    });
    return counts;
  };

  const allEvents = days.flatMap(d => d.events||[]);
  const total = tally(allEvents);
  const totalItems = total.todo + total.active + total.done;

  const Summary = ({ c }) => (
    <span style={{ display:'inline-flex', gap:8, flexWrap:'wrap' }}>
      <span style={{ color: STATUS_META.done.color, fontWeight:600 }}>{c.done} done</span>
      <span style={{ color: STATUS_META.active.color, fontWeight:600 }}>{c.active} active</span>
      <span style={{ color: STATUS_META.todo.color, fontWeight:600 }}>{c.todo} to do</span>
    </span>
  );

  // status worded as a sentence fragment
  const PHRASE = { todo:'is not started yet', active:'is currently ongoing', done:'is complete' };
  const Row = ({ status, label, sub, indent }) => {
    const m = STATUS_META[status] || STATUS_META.todo;
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', paddingLeft: indent?22:0 }}>
        <Dot status={status} />
        <span style={{ flex:1, fontSize:13, color:'#6E1A10', lineHeight:1.5 }}>
          <strong style={{ fontWeight:600 }}>{label}</strong>{' '}
          <span style={{ color:m.color, fontWeight:600 }}>{PHRASE[status] || PHRASE.todo}</span>
          {sub && <span style={{ color:'#B07A4A' }}> · {sub}</span>}
        </span>
      </div>
    );
  };

  return (
    <div>
      {/* Trip-wide summary */}
      <div style={{ background:'#EDE7D9', border:'1px solid #D4BFB0', borderRadius:10, padding:'12px 16px', marginBottom:16,
        display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#6E1A10' }}>Overall</span>
        {totalItems>0 ? <Summary c={total} /> : <span style={{ fontSize:13, color:'#C05040' }}>Nothing scheduled yet.</span>}
      </div>

      {days.length===0 && (
        <p style={{ color:'#C05040', fontSize:13, textAlign:'center', padding:'24px 0' }}>No days added yet.</p>
      )}

      {days.map(day => {
        const events = day.events || [];
        const c = tally(events);
        return (
          <div key={day.id} style={{ marginBottom:16, border:'1px solid #D4BFB0', borderRadius:10, overflow:'hidden', background:'#EDE7D9' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, padding:'10px 14px', background:'#DDD8CB' }}>
              <div>
                <strong style={{ fontSize:14 }}>{fmtDate(day.date)}</strong>
                {day.label && <span style={{ marginLeft:8, fontSize:13, color:'#8B2A14' }}>{day.label}</span>}
              </div>
              <span style={{ fontSize:12 }}><Summary c={c} /></span>
            </div>

            <div style={{ padding:'6px 14px 10px' }}>
              {events.length===0 && <p style={{ color:'#C05040', fontSize:13, margin:'6px 0' }}>No events</p>}
              {events.map(ev => (
                <div key={ev.id}>
                  <Row status={stOf(ev)} label={ev.title || '(untitled)'}
                    sub={ev.time ? `${ev.time}${ev.endTime?`–${ev.endTime}`:''}` : null} />
                  {(ev.activities||[]).map(act => (
                    <Row key={act.id} status={stOf(act)} label={act.text || '(empty)'} indent />
                  ))}
                </div>
              ))}
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

export default function App() {
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeTab, setActiveTab] = useState("Schedule");
  const [showNewTrip, setShowNewTrip] = useState(false);
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

  const trip = trips.find(t=>t.id===activeTrip);


  return (
    <div style={{ fontFamily:"'Jost','Futura PT','Century Gothic','Trebuchet MS',sans-serif",maxWidth:680,margin:"0 auto",minHeight:"100vh",background:"#F0EBE0" }}>
      {/* Header */}
      <div style={{ background:"#5C1A1A",borderBottom:"none",boxShadow:"0 2px 12px rgba(0,0,0,0.18)" }}>
        {/* Top bar: logo + actions */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 20px 10px" }}>
          {/* Logo + Title */}
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="#F5ECD7" style={{flexShrink:0}}><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
            <div>
              <h1 style={{ margin:0,fontSize:22,fontWeight:800,color:"#F5ECD7",letterSpacing:"0.06em",lineHeight:1.1,textTransform:"uppercase" }}>My Travel Hub</h1>
              <p style={{ margin:0,fontSize:11,color:"rgba(245,236,215,0.6)",letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:500,marginTop:2 }}>Your trips, all in one place</p>
            </div>
          </div>
          {/* Actions */}
          <div style={{ display:"flex",gap:8,alignItems:"center" }}>
            <button
              onClick={undo}
              disabled={past.length===0}
              title={past.length ? `Undo last change (${past.length} available)` : 'Nothing to undo'}
              style={{
                padding:"7px 14px",
                borderRadius:7,
                border:"1.5px solid rgba(245,236,215,0.35)",
                background:"rgba(245,236,215,0.1)",
                color:"#F5ECD7",
                fontWeight:600,fontSize:13,
                cursor: past.length ? "pointer" : "not-allowed",
                opacity: past.length ? 1 : 0.45,
                transition:"all 0.3s",letterSpacing:"0.02em"
              }}
            >↶ Undo{past.length ? ` (${past.length})` : ''}</button>
            <button
              onClick={handleSave}
              style={{
                padding:"7px 14px",
                borderRadius:7,
                border: savedStatus==='saved'?'1.5px solid #7DB87A':'1.5px solid rgba(245,236,215,0.35)',
                background: savedStatus==='saved'?'rgba(125,184,122,0.25)':savedStatus==='saving'?'rgba(245,236,215,0.12)':'rgba(245,236,215,0.1)',
                color: savedStatus==='saved'?'#A8E6A0':'#F5ECD7',
                fontWeight:600,fontSize:13,cursor:"pointer",transition:"all 0.3s",minWidth:72,letterSpacing:"0.02em"
              }}
            >{savedStatus==='saved'?'✓ Saved':savedStatus==='saving'?'…':'Save'}</button>
          </div>
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
                {trip.destination && <span>📍 {trip.destination}</span>}
                {trip.startDate && <span style={{ marginLeft:8 }}>🗓 {fmtDate(trip.startDate)}{trip.endDate?` → ${fmtDate(trip.endDate)}`:""}</span>}
              </div>
            </div>
            <Btn variant="danger" style={{ fontSize:12,padding:"4px 10px" }} onClick={()=>deleteTrip(trip.id)}>Delete Trip</Btn>
          </div>

          {/* Inner tabs */}
          <div style={{ display:"flex",gap:2,marginBottom:20,background:"#E8E2D4",borderRadius:8,padding:3 }}>
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

          {activeTab==="Schedule" && <ScheduleTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
          {activeTab==="Budget" && <BudgetTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
          {activeTab==="Packing" && <PackingTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
          {activeTab==="Status" && <StatusTab trip={trip} />}
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
    </div>
  );
}
