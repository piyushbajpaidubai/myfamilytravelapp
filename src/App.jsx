import { useState, useEffect } from "react";

const TABS = ["Schedule", "Budget", "Packing", "Locations"];
const CATEGORIES = ["Transport", "Hotel", "Food", "Sightseeing", "Other"];
const BUDGET_CATS = ["Transport", "Accommodation", "Food", "Activities", "Shopping", "Other"];
const PACK_CATS = ["Documents", "Clothing", "Toiletries", "Electronics", "Other"];

const uid = () => Math.random().toString(36).slice(2, 9);

const defaultTrip = () => ({
  id: uid(), name: "", destination: "", startDate: "", endDate: "",
  days: [], expenses: [], packItems: [], locations: [],
  budget: ""
});

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:"#F0EBE0",borderRadius:12,padding:24,minWidth:320,maxWidth:480,width:"90%",boxShadow:"0 8px 32px rgba(44,24,16,0.15)" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
          <h3 style={{ margin:0,fontSize:16,fontWeight:600 }}>{title}</h3>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#8B6355" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom:12 }}>
      {label && <label style={{ display:"block",fontSize:12,color:"#6B4535",marginBottom:4 }}>{label}</label>}
      <input {...props} style={{ width:"100%",padding:"8px 10px",border:"1px solid #C8B09A",borderRadius:7,fontSize:14,boxSizing:"border-box",...props.style }} />
    </div>
  );
}

function Select({ label, options, ...props }) {
  return (
    <div style={{ marginBottom:12 }}>
      {label && <label style={{ display:"block",fontSize:12,color:"#6B4535",marginBottom:4 }}>{label}</label>}
      <select {...props} style={{ width:"100%",padding:"8px 10px",border:"1px solid #C8B09A",borderRadius:7,fontSize:14,boxSizing:"border-box" }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Btn({ children, variant="primary", ...props }) {
  const base = { padding:"8px 16px",borderRadius:7,fontSize:13,fontWeight:500,cursor:"pointer",border:"none" };
  const styles = {
    primary: { ...base, background:"#2C1810",color:"#fff" },
    ghost: { ...base, background:"transparent",color:"#4A2F20",border:"1px solid #C8B09A" },
    danger: { ...base, background:"#F5E0D8",color:"#8B2A14" },
    soft: { ...base, background:"#E8E2D4",color:"#2C1810" },
  };
  return <button {...props} style={{ ...styles[variant],...props.style }}>{children}</button>;
}

// ---- Schedule Tab ----
function ScheduleTab({ trip, update }) {
  const [showDay, setShowDay] = useState(false);
  const [showEvent, setShowEvent] = useState(null); // dayId
  const [dayForm, setDayForm] = useState({ date:"", label:"" });
  const [evForm, setEvForm] = useState({ time:"", title:"", location:"", category:"Sightseeing", notes:"" });

  const addDay = () => {
    if (!dayForm.date) return;
    const days = [...(trip.days||[]), { id:uid(), ...dayForm, events:[] }]
      .sort((a,b) => a.date.localeCompare(b.date));
    update({ days });
    setShowDay(false); setDayForm({ date:"", label:"" });
  };

  const addEvent = (dayId) => {
    if (!evForm.title) return;
    const days = trip.days.map(d => d.id===dayId
      ? { ...d, events:[...(d.events||[]), { id:uid(), ...evForm }].sort((a,b)=>a.time.localeCompare(b.time)) }
      : d);
    update({ days });
    setShowEvent(null); setEvForm({ time:"", title:"", location:"", category:"Sightseeing", notes:"" });
  };

  const delDay = (id) => update({ days: trip.days.filter(d=>d.id!==id) });
  const delEvent = (dayId, evId) => update({ days: trip.days.map(d => d.id===dayId ? { ...d, events:d.events.filter(e=>e.id!==evId) } : d) });

  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
        <span style={{ fontWeight:600 }}>Days</span>
        <Btn onClick={()=>setShowDay(true)}>+ Add Day</Btn>
      </div>
      {(!trip.days||trip.days.length===0) && <p style={{ color:"#A88070",textAlign:"center",marginTop:40 }}>No days yet. Add your first day!</p>}
      {(trip.days||[]).map(day => (
        <div key={day.id} style={{ background:"#EDE7D9",border:"1px solid #D4BFB0",borderRadius:10,marginBottom:14,overflow:"hidden" }}>
          <div style={{ padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#E8E2D4" }}>
            <div>
              <span style={{ fontWeight:600,fontSize:14 }}>{day.date}</span>
              {day.label && <span style={{ marginLeft:8,color:"#6B4535",fontSize:13 }}>{day.label}</span>}
            </div>
            <div style={{ display:"flex",gap:6 }}>
              <Btn variant="ghost" style={{ padding:"4px 10px",fontSize:12 }} onClick={()=>{ setShowEvent(day.id); setEvForm({ time:"",title:"",location:"",category:"Sightseeing",notes:"" }); }}>+ Event</Btn>
              <Btn variant="danger" style={{ padding:"4px 10px",fontSize:12 }} onClick={()=>delDay(day.id)}>✕</Btn>
            </div>
          </div>
          {(day.events||[]).length===0 && <p style={{ color:"#C0A090",fontSize:13,padding:"10px 14px",margin:0 }}>No events</p>}
          {(day.events||[]).map(ev => (
            <div key={ev.id} style={{ padding:"10px 14px",borderTop:"1px solid #D4BFB0",display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
              <div>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  {ev.time && <span style={{ fontSize:12,color:"#8B6355" }}>{ev.time}</span>}
                  <span style={{ fontSize:13,fontWeight:500 }}>{ev.title}</span>
                  <span style={{ fontSize:11,background:"#DDD8CB",borderRadius:4,padding:"1px 6px",color:"#4A2F20" }}>{ev.category}</span>
                </div>
                {ev.location && <div style={{ fontSize:12,color:"#8B6355",marginTop:2 }}>📍 {ev.location}</div>}
                {ev.notes && <div style={{ fontSize:12,color:"#9B7365",marginTop:2 }}>{ev.notes}</div>}
              </div>
              <Btn variant="danger" style={{ padding:"2px 8px",fontSize:12 }} onClick={()=>delEvent(day.id,ev.id)}>✕</Btn>
            </div>
          ))}
        </div>
      ))}

      {showDay && (
        <Modal title="Add Day" onClose={()=>setShowDay(false)}>
          <Input label="Date" type="date" value={dayForm.date} onChange={e=>setDayForm({...dayForm,date:e.target.value})} />
          <Input label="Label (optional)" placeholder="e.g. Arrival Day" value={dayForm.label} onChange={e=>setDayForm({...dayForm,label:e.target.value})} />
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setShowDay(false)}>Cancel</Btn>
            <Btn onClick={addDay}>Add</Btn>
          </div>
        </Modal>
      )}
      {showEvent && (
        <Modal title="Add Event" onClose={()=>setShowEvent(null)}>
          <Input label="Time" type="time" value={evForm.time} onChange={e=>setEvForm({...evForm,time:e.target.value})} />
          <Input label="Title *" value={evForm.title} onChange={e=>setEvForm({...evForm,title:e.target.value})} />
          <Input label="Location" value={evForm.location} onChange={e=>setEvForm({...evForm,location:e.target.value})} />
          <Select label="Category" options={CATEGORIES} value={evForm.category} onChange={e=>setEvForm({...evForm,category:e.target.value})} />
          <Input label="Notes" value={evForm.notes} onChange={e=>setEvForm({...evForm,notes:e.target.value})} />
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setShowEvent(null)}>Cancel</Btn>
            <Btn onClick={()=>addEvent(showEvent)}>Add</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---- Budget Tab ----
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
          <span style={{ fontSize:13,color:"#6B4535" }}>Trip Budget</span>
          <input value={trip.budget||""} onChange={e=>update({budget:e.target.value})} placeholder="0.00" type="number"
            style={{ width:120,padding:"4px 8px",border:"1px solid #C8B09A",borderRadius:6,fontSize:14,textAlign:"right" }} />
        </div>
        <div style={{ display:"flex",justifyContent:"space-between" }}>
          <span style={{ fontSize:13,color:"#6B4535" }}>Spent</span>
          <span style={{ fontWeight:600,color: budget&&total>budget?"#8B2A14":"#2C1810" }}>${total.toFixed(2)}</span>
        </div>
        {budget>0 && (
          <>
            <div style={{ marginTop:10,height:6,background:"#DDD8CB",borderRadius:3,overflow:"hidden" }}>
              <div style={{ height:"100%",background: total>budget?"#C04428":"#2C1810",width:`${Math.min(100,(total/budget)*100)}%`,transition:"width .3s" }} />
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",marginTop:4,fontSize:12,color:"#8B6355" }}>
              <span>Remaining: ${Math.max(0,budget-total).toFixed(2)}</span>
              <span>{budget>0?Math.round((total/budget)*100):0}%</span>
            </div>
          </>
        )}
      </div>

      {bycat.length>0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12,color:"#8B6355",marginBottom:8 }}>By Category</div>
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
      {(trip.expenses||[]).length===0 && <p style={{ color:"#A88070",textAlign:"center",marginTop:24 }}>No expenses logged yet.</p>}
      {(trip.expenses||[]).map(e=>(
        <div key={e.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f3f4f6" }}>
          <div>
            <div style={{ fontSize:13,fontWeight:500 }}>{e.desc}</div>
            <div style={{ fontSize:11,color:"#8B6355" }}>{e.category}</div>
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
          {total>0 && <span style={{ fontSize:12,color:"#8B6355",marginLeft:8 }}>{packed}/{total} packed</span>}
        </div>
        <Btn onClick={()=>setShowAdd(true)}>+ Add Item</Btn>
      </div>
      {total>0 && (
        <div style={{ height:4,background:"#DDD8CB",borderRadius:2,marginBottom:16,overflow:"hidden" }}>
          <div style={{ height:"100%",background:"#2C1810",width:`${total?Math.round((packed/total)*100):0}%`,transition:"width .3s" }} />
        </div>
      )}
      {total===0 && <p style={{ color:"#A88070",textAlign:"center",marginTop:40 }}>Nothing to pack yet!</p>}
      {grouped.map(({ cat, items })=>(
        <div key={cat} style={{ marginBottom:14 }}>
          <div style={{ fontSize:12,fontWeight:600,color:"#8B6355",marginBottom:6,textTransform:"uppercase",letterSpacing:".05em" }}>{cat}</div>
          {items.map(item=>(
            <div key={item.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #f3f4f6" }}>
              <input type="checkbox" checked={item.packed} onChange={()=>toggle(item.id)} style={{ accentColor:"#2C1810",width:15,height:15 }} />
              <span style={{ flex:1,fontSize:13,textDecoration:item.packed?"line-through":"none",color:item.packed?"#C0A090":"#2C1810" }}>{item.name}</span>
              <Btn variant="danger" style={{ padding:"2px 8px",fontSize:12 }} onClick={()=>del(item.id)}>✕</Btn>
            </div>
          ))}
        </div>
      ))}
      {uncatted.map(item=>(
        <div key={item.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #f3f4f6" }}>
          <input type="checkbox" checked={item.packed} onChange={()=>toggle(item.id)} style={{ accentColor:"#2C1810" }} />
          <span style={{ flex:1,fontSize:13,textDecoration:item.packed?"line-through":"none",color:item.packed?"#C0A090":"#2C1810" }}>{item.name}</span>
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
function LocationsTab({ trip, update }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:"", address:"", type:"Hotel", notes:"" });
  const LOC_TYPES = ["Hotel","Airport","Restaurant","Attraction","Transport","Other"];

  const addLoc = () => {
    if (!form.name) return;
    update({ locations:[...(trip.locations||[]), { id:uid(), ...form }] });
    setShowAdd(false); setForm({ name:"", address:"", type:"Hotel", notes:"" });
  };
  const del = (id) => update({ locations: trip.locations.filter(l=>l.id!==id) });

  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
        <span style={{ fontWeight:600 }}>Locations</span>
        <Btn onClick={()=>setShowAdd(true)}>+ Add Location</Btn>
      </div>
      {(trip.locations||[]).length===0 && <p style={{ color:"#A88070",textAlign:"center",marginTop:40 }}>No locations added yet.</p>}
      {(trip.locations||[]).map(loc=>(
        <div key={loc.id} style={{ background:"#EDE7D9",border:"1px solid #D4BFB0",borderRadius:10,padding:14,marginBottom:12 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                <span style={{ fontWeight:600,fontSize:14 }}>{loc.name}</span>
                <span style={{ fontSize:11,background:"#DDD8CB",borderRadius:4,padding:"1px 6px",color:"#4A2F20" }}>{loc.type}</span>
              </div>
              {loc.address && (
                <a href={`https://maps.google.com/?q=${encodeURIComponent(loc.address)}`} target="_blank" rel="noreferrer"
                  style={{ fontSize:12,color:"#B5341C",textDecoration:"none" }}>
                  📍 {loc.address}
                </a>
              )}
              {loc.notes && <div style={{ fontSize:12,color:"#8B6355",marginTop:4 }}>{loc.notes}</div>}
            </div>
            <Btn variant="danger" style={{ padding:"4px 10px",fontSize:12,marginLeft:8 }} onClick={()=>del(loc.id)}>✕</Btn>
          </div>
        </div>
      ))}

      {showAdd && (
        <Modal title="Add Location" onClose={()=>setShowAdd(false)}>
          <Input label="Name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
          <Input label="Address" placeholder="Opens in Google Maps" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} />
          <Select label="Type" options={LOC_TYPES} value={form.type} onChange={e=>setForm({...form,type:e.target.value})} />
          <Input label="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn onClick={addLoc}>Add</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---- Main App ----
export default function App() {
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeTab, setActiveTab] = useState("Schedule");
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [savedStatus, setSavedStatus] = useState(''); // '', 'saving', 'saved'

  // Load from online store on mount
  useEffect(() => {
    fetch('/.netlify/functions/data')
      .then(r => r.json())
      .then(data => {
        if (data.trips && data.trips.length > 0) { setTrips(data.trips); setActiveTrip(data.trips[0]); }
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

  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"#A88070",fontSize:14 }}>Loading…</div>;

  return (
    <div style={{ fontFamily:"Georgia,'Playfair Display','Times New Roman',serif",maxWidth:680,margin:"0 auto",minHeight:"100vh",background:"#F0EBE0" }}>
      {/* Header */}
      <div style={{ padding:"20px 20px 0",borderBottom:"2px solid #B5341C" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
          <h1 style={{ margin:0,fontSize:20,fontWeight:700 }}>✈️ Travel Planner</h1>
          <Btn onClick={()=>setShowNewTrip(true)}>+ New Trip</Btn>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: savedStatus === 'saved' ? '2px solid #22c55e' : '2px solid #6366f1',
              background: savedStatus === 'saved' ? '#22c55e' : savedStatus === 'saving' ? '#a5b4fc' : '#6366f1',
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
        {/* Trip tabs */}
        <div style={{ display:"flex",gap:4,overflowX:"auto",paddingBottom:0 }}>
          {trips.map(t=>(
            <button key={t.id} onClick={()=>setActiveTrip(t.id)}
              style={{ padding:"7px 14px",borderRadius:"7px 7px 0 0",border:"1px solid",borderBottom:"none",
                borderColor: activeTrip===t.id?"#D4BFB0":"transparent",
                background: activeTrip===t.id?"#F0EBE0":"transparent",
                fontWeight: activeTrip===t.id?600:400,
                fontSize:13,cursor:"pointer",color: activeTrip===t.id?"#2C1810":"#8B6355",whiteSpace:"nowrap" }}>
              {t.name||"Unnamed"}
            </button>
          ))}
        </div>
      </div>

      {/* Trip content */}
      {!trip ? (
        <div style={{ textAlign:"center",marginTop:80,color:"#C0A090" }}>
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
              <div style={{ fontSize:13,color:"#8B6355" }}>
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
                  color: activeTab===tab?"#2C1810":"#8B6355",
                  boxShadow: activeTab===tab?"0 1px 3px rgba(0,0,0,.08)":"none" }}>
                {tab}
              </button>
            ))}
          </div>

          {activeTab==="Schedule" && <ScheduleTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
          {activeTab==="Budget" && <BudgetTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
          {activeTab==="Packing" && <PackingTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
          {activeTab==="Locations" && <LocationsTab trip={trip} update={p=>updateTrip(trip.id,p)} />}
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
