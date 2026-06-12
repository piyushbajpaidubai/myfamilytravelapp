import { useState, useEffect } from "react";

const TABS = ["Schedule", "Budget", "Packing", "Pictures"];
const CATEGORIES = ["Transport", "Hotel", "Food", "Sightseeing", "Other"];
const BUDGET_CATS = ["Transport", "Accommodation", "Food", "Activities", "Shopping", "Other"];
const PACK_CATS = ["Documents", "Clothing", "Toiletries", "Electronics", "Other"];

const uid = () => Math.random().toString(36).slice(2, 9);

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

// ---- Schedule Tab ----
function ScheduleTab({ trip, update }) {
  const [showDay, setShowDay] = useState(false);
  const [showEvent, setShowEvent] = useState(null); // dayId
  const [dayForm, setDayForm] = useState({ date:"", label:"" });
  const [evForm, setEvForm] = useState({ time:"", title:"", location:"", category:"Sightseeing", notes:"" });
  // Activity state: { [eventId]: inputText }
  const [activityInput, setActivityInput] = useState({});
  // Which event is showing the activity input box
  const [addingActivityFor, setAddingActivityFor] = useState(null);

  const addDay = () => {
    if (!dayForm.date) return;
    update({ days: [...(trip.days||[]), { id:uid(), date:dayForm.date, label:dayForm.label, events:[] }].sort((a,b)=>a.date>b.date?1:-1) });
    setShowDay(false); setDayForm({ date:"", label:"" });
  };

  const delDay = (id) => update({ days: (trip.days||[]).filter(d=>d.id!==id) });

  const addEvent = (dayId) => {
    if (!evForm.title) return;
    const newEvent = { id:uid(), ...evForm, activities:[], docs:[] };
    const days = (trip.days||[]).map(d => d.id===dayId
      ? { ...d, events:[...(d.events||[]), newEvent].sort((a,b)=>a.time>b.time?1:-1) }
      : d);
    update({ days });
    setShowEvent(null); setEvForm({ time:"", title:"", location:"", category:"Sightseeing", notes:"" });
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

  // Attach a document (file) to an event or activity
  const attachDoc = (dayId, evId, actId, file) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const doc = { id:uid(), name:file.name, size:file.size, type:file.type, data:evt.target.result };
      const days = (trip.days||[]).map(d => d.id===dayId
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
      update({ days });
    };
    reader.readAsDataURL(file);
  };

  const delDoc = (dayId, evId, actId, docId) => {
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

  function openPreview(doc) {
    setPreview(doc);
  }

  const isPdf = doc => doc.name && doc.name.toLowerCase().endsWith('.pdf');
  const isImage = doc => doc.data && doc.data.startsWith('data:image');

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
        <div onClick={()=>setPreview(null)}
          style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px' }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:'#fff',borderRadius:12,overflow:'hidden',boxShadow:'0 8px 40px rgba(0,0,0,0.5)',display:'flex',flexDirection:'column',maxWidth:'90vw',maxHeight:'90vh',minWidth:'320px' }}>
            {/* Header */}
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'#3D0C02',color:'#fff' }}>
              <span style={{ fontFamily:"'Jost','Futura PT',sans-serif",fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60vw' }}>{preview.name}</span>
              <div style={{ display:'flex',gap:8,flexShrink:0 }}>
                <a href={preview.data} download={preview.name}
                  style={{ fontSize:12,padding:'4px 12px',borderRadius:6,background:'rgba(255,255,255,0.15)',color:'#fff',textDecoration:'none',fontFamily:"'Jost',sans-serif",cursor:'pointer' }}>
                  ⬇ Download
                </a>
                <button onClick={()=>setPreview(null)}
                  style={{ background:'rgba(255,255,255,0.15)',border:'none',borderRadius:6,color:'#fff',cursor:'pointer',fontSize:16,width:28,height:28,lineHeight:'28px',textAlign:'center',padding:0 }}>×</button>
              </div>
            </div>
            {/* Preview pane */}
            <div style={{ flex:1,overflow:'auto',background:'#F5F0E8',display:'flex',alignItems:'center',justifyContent:'center',minHeight:'300px' }}>
              {isPdf(preview) ? (
                <iframe src={preview.data} title={preview.name}
                  style={{ width:'80vw',height:'75vh',maxWidth:'900px',border:'none' }} />
              ) : isImage(preview) ? (
                <img src={preview.data} alt={preview.name}
                  style={{ maxWidth:'85vw',maxHeight:'75vh',objectFit:'contain',display:'block' }} />
              ) : (
                <div style={{ textAlign:'center',padding:'40px',fontFamily:"'Jost',sans-serif",color:'#6E1A10' }}>
                  <div style={{ fontSize:48,marginBottom:12 }}>📄</div>
                  <p style={{ fontSize:14,marginBottom:16 }}>Preview not available for this file type.</p>
                  <a href={preview.data} download={preview.name}
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
              <strong style={{ fontSize:14 }}>{day.date}</strong>
              {day.label && <span style={{ marginLeft:8,fontSize:13,color:"#8B2A14" }}>{day.label}</span>}
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
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                    {ev.time && <span style={{ fontSize:12,color:"#B54030",fontWeight:600 }}>{ev.time}</span>}
                    <span style={{ fontSize:13,fontWeight:500 }}>{ev.title}</span>
                    <span style={{ fontSize:11,background:"#DDD8CB",borderRadius:4,padding:"1px 6px",color:"#8B2A14" }}>{ev.category}</span>
                  </div>
                  {ev.location && <div style={{ fontSize:12,color:"#A83020",marginTop:2 }}>📍 {ev.location}</div>}
                  {ev.notes && <div style={{ fontSize:12,color:"#C05040",marginTop:2 }}>{ev.notes}</div>}
                </div>
                <label title="Attach document" style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:6,cursor:'pointer',color:'#8B2A14',background:'rgba(139,42,20,0.08)',flexShrink:0,marginLeft:6 }}>
                  <span style={{ fontSize:15, lineHeight:1 }}>📎</span>
                  <input type="file" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) attachDoc(day.id,ev.id,null,e.target.files[0]); e.target.value=''; }} />
                </label>
                <Btn variant="danger" style={{ padding:"2px 8px",fontSize:12,flexShrink:0,marginLeft:8 }} onClick={()=>delEvent(day.id,ev.id)}>✕</Btn>
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
                        <span style={{ fontSize:12,color:"#8B2A14",marginTop:1 }}>▸</span>
                        <div style={{ flex:1 }}>
                          <span style={{ fontSize:13,color:"#6E1A10" }}>{act.text}</span>
                          {/* Docs for this activity */}
                          <DocList
                            docs={act.docs||[]}
                            onAdd={(file)=>attachDoc(day.id,ev.id,act.id,file)}
                            onDel={(docId)=>delDoc(day.id,ev.id,act.id,docId)}
                          />
                        </div>
                        <label title="Attach document" style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:22,height:22,borderRadius:5,cursor:'pointer',color:'#8B2A14',background:'rgba(139,42,20,0.08)',flexShrink:0,marginTop:2 }}>
                        <span style={{ fontSize:12, lineHeight:1 }}>📎</span>
                        <input type="file" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) attachDoc(day.id,ev.id,act.id,e.target.files[0]); e.target.value=''; }} />
                      </label>
                      <button onClick={()=>delActivity(day.id,ev.id,act.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#C04428',fontSize:12,padding:'0 2px',lineHeight:1,flexShrink:0,marginTop:2 }}>✕</button>
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
          <Input label="Time" type="time" value={evForm.time} onChange={e=>setEvForm({...evForm,time:e.target.value})} />
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
  const pics = trip.pictures || [];

  function addPics(e) {
    const files = Array.from(e.target.files);
    let loaded = 0;
    const newPics = [];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        newPics.push({ id: 'pic_' + Date.now() + '_' + Math.random().toString(36).slice(2), name: file.name, data: ev.target.result });
        loaded++;
        if (loaded === files.length) {
          update(t => ({ ...t, pictures: [...(t.pictures || []), ...newPics] }));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function delPic(id) {
    update(t => ({ ...t, pictures: (t.pictures || []).filter(p => p.id !== id) }));
    if (lightbox && lightbox.id === id) setLightbox(null);
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#3D0C02', fontFamily: "'Jost','Futura PT','Century Gothic',sans-serif", fontSize: '18px', fontWeight: 600 }}>Trip Pictures</h3>
        <label style={{ background: '#3D0C02', color: '#fff', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontFamily: "'Jost','Futura PT','Century Gothic',sans-serif", fontSize: '14px', fontWeight: 500 }}>
          + Upload Photos
          <input type="file" accept="image/*" multiple onChange={addPics} style={{ display: 'none' }} />
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
              <img src={pic.data} alt={pic.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
            <img src={lightbox.data} alt={lightbox.name} style={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain' }} />
            <div style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '10px 16px', fontFamily: "'Jost','Futura PT',sans-serif", fontSize: '13px' }}>{lightbox.name}</div>
            <button onClick={() => setLightbox(null)}
              style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', border: '2px solid #fff', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', cursor: 'pointer', fontSize: '18px', lineHeight: '28px', textAlign: 'center', padding: 0 }}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeTab, setActiveTab] = useState("Schedule");
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [headerNote, setHeaderNote] = useState('');
  const [savedStatus, setSavedStatus] = useState(''); // '', 'saving', 'saved'

  // Load from online store on mount
  useEffect(() => {
    fetch('/.netlify/functions/data')
      .then(r => r.json())
      .then(data => {
        if (data.trips && data.trips.length > 0) { setTrips(data.trips); setActiveTrip(data.trips[0].id); }
        else {
          try {
            const sv = localStorage.getItem('travelPlannerData');
            if (sv) { const { trips: t } = JSON.parse(sv); if (t && t.length) { setTrips(t); setActiveTrip(t[0].id); } }
          } catch(e) {}
        }
      })
      .catch(() => {
        // Fallback to localStorage if offline
        try {
          const saved = localStorage.getItem('travelPlannerData');
          if (saved) { const { trips: t } = JSON.parse(saved); if (t && t.length > 0) setTrips(t); }
        } catch (e) {}
      });
  }, []);

  // Auto-save: debounce 2s after any change to trips
  useEffect(() => {
    if (trips.length === 0) return;
    setSavedStatus('saving');
    const timer = setTimeout(() => {
      fetch('/.netlify/functions/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trips })
      })
        .then(r => r.json())
        .then(() => {
          localStorage.setItem('travelPlannerData', JSON.stringify({ trips }));
          setSavedStatus('saved');
          setTimeout(() => setSavedStatus(''), 2500);
        })
        .catch(() => {
          try { localStorage.setItem('travelPlannerData', JSON.stringify({ trips })); } catch(e) {}
          setSavedStatus('saved');
          setTimeout(() => setSavedStatus(''), 2500);
        });
    }, 2000);
    return () => clearTimeout(timer);
  }, [trips]);

  const handleSave = () => {
    setSavedStatus('saving');
    fetch('/.netlify/functions/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trips })
    })
      .then(r => r.json())
      .then(() => {
        localStorage.setItem('travelPlannerData', JSON.stringify({ trips }));
        setSavedStatus('saved');
        setTimeout(() => setSavedStatus(''), 2500);
      })
      .catch(() => {
        try { localStorage.setItem('travelPlannerData', JSON.stringify({ trips })); } catch(e) {}
        setSavedStatus('saved');
        setTimeout(() => setSavedStatus(''), 2500);
      });
  };
  const [tripForm, setTripForm] = useState({ name:"", destination:"", startDate:"", endDate:"" });
  const [loading, setLoading] = useState(true);

  // Load from storage
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("trips");
        if (res?.value) {
          const data = JSON.parse(res.value);
          setTrips(data);
          if (data.length>0) setActiveTrip(data[0].id);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Save to storage
  const saveTrips = async (updated) => {
    setTrips(updated);
    try { await window.storage.set("trips", JSON.stringify(updated)); } catch {}
  };

  const createTrip = () => {
    if (!tripForm.name) return;
    const t = { ...defaultTrip(), ...tripForm };
    const updated = [...trips, t];
    saveTrips(updated);
    setActiveTrip(t.id);
    setShowNewTrip(false);
    setTripForm({ name:"", destination:"", startDate:"", endDate:"" });
  };

  const deleteTrip = (id) => {
    const updated = trips.filter(t=>t.id!==id);
    saveTrips(updated);
    setActiveTrip(updated.length>0 ? updated[0].id : null);
  };

  const updateTrip = (id, patch) => {
    const updated = trips.map(t=>t.id===id?{...t,...patch}:t);
    saveTrips(updated);
  };

  const trip = trips.find(t=>t.id===activeTrip);

  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"#C86050",fontSize:14 }}>Loading…</div>;

  return (
    <div style={{ fontFamily:"'Jost','Futura PT','Century Gothic','Trebuchet MS',sans-serif",maxWidth:680,margin:"0 auto",minHeight:"100vh",background:"#F0EBE0" }}>
      {/* Header */}
      <div style={{ padding:"20px 20px 0",borderBottom:"2px solid #B5341C" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
          <h1 style={{ margin:0,fontSize:20,fontWeight:700 }}>✈️ My Travel Hub</h1>
          <Btn onClick={()=>setShowNewTrip(true)}>+ New Trip</Btn>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: savedStatus === 'saved' ? '2px solid #5B8A4A' : '2px solid #B5341C',
              background: savedStatus === 'saved' ? '#5B8A4A' : savedStatus === 'saving' ? '#C88070' : '#B5341C',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.3s',
              marginLeft: 8,
              minWidth: 90,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {savedStatus === 'saved' ? '✓ Saved' : savedStatus === 'saving' ? '...' : '💾 Save'}
          </button>
        </div>
                {/* Header note textarea */}
        <textarea value={headerNote} onChange={e=>setHeaderNote(e.target.value)} placeholder="Add a note, quote or travel tagline…" rows={2} style={{ width:"100%",boxSizing:"border-box",resize:"vertical",padding:"8px 12px",marginBottom:12,border:"1px solid #D4BFB0",borderRadius:8,background:"#F0EBE0",color:"#6E1A10",fontSize:13,fontFamily:"inherit",outline:"none",lineHeight:1.5 }} />
        {/* Trip tabs */}
        <div style={{ display:"flex",gap:4,overflowX:"auto",paddingBottom:0 }}>
          {trips.map(t=>(
            <button key={t.id} onClick={()=>setActiveTrip(t.id)}
              style={{ padding:"7px 14px",borderRadius:"7px 7px 0 0",border:"1px solid",borderBottom:"none",
                borderColor: activeTrip===t.id?"#D4BFB0":"transparent",
                background: activeTrip===t.id?"#F0EBE0":"transparent",
                fontWeight: activeTrip===t.id?600:400,
                fontSize:13,cursor:"pointer",color: activeTrip===t.id?"#6E1A10":"#B54030",whiteSpace:"nowrap" }}>
              {t.name||"Unnamed"}
            </button>
          ))}
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
                {trip.startDate && <span style={{ marginLeft:8 }}>🗓 {trip.startDate}{trip.endDate?` → ${trip.endDate}`:""}</span>}
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
