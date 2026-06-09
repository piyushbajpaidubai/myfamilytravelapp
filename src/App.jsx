import { useState, useEffect } from "react";

const TABS = ["Schedule", "Budget", "Packing", "Locations"];
const CATEGORIES = ["Transport", "Hotel", "Food", "Sightseeing", "Other"];
const BUDGET_CATS = ["Transport", "Accommodation", "Food", "Activities", "Shopping", "Other"];
const PACK_CATS = ["Documents", "Clothing", "Toiletries", "Electronics", "Other"];

const uid = () =u003e Math.random().toString(36).slice(2, 9);

const defaultTrip = () =u003e ({
  id: uid(), name: "", destination: "", startDate: "", endDate: "",
  days: [], expenses: [], packItems: [], locations: [],
  budget: ""
});

function Modal({ title, onClose, children }) {
  return (
    u003cdiv style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center" }}u003e
      u003cdiv style={{ background:"#fff",borderRadius:12,padding:24,minWidth:320,maxWidth:480,width:"90%",boxShadow:"0 8px 32px rgba(0,0,0,0.12)" }}u003e
        u003cdiv style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}u003e
          u003ch3 style={{ margin:0,fontSize:16,fontWeight:600 }}u003e{title}u003c/h3u003e
          u003cbutton onClick={onClose} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888" }}u003e×u003c/buttonu003e
        u003c/divu003e
        {children}
      u003c/divu003e
    u003c/divu003e
  );
}

function Input({ label, ...props }) {
  return (
    u003cdiv style={{ marginBottom:12 }}u003e
      {label u0026u0026 u003clabel style={{ display:"block",fontSize:12,color:"#666",marginBottom:4 }}u003e{label}u003c/labelu003e}
      u003cinput {...props} style={{ width:"100%",padding:"8px 10px",border:"1px solid #e0e0e0",borderRadius:7,fontSize:14,boxSizing:"border-box",...props.style }} /u003e
    u003c/divu003e
  );
}

function Select({ label, options, ...props }) {
  return (
    u003cdiv style={{ marginBottom:12 }}u003e
      {label u0026u0026 u003clabel style={{ display:"block",fontSize:12,color:"#666",marginBottom:4 }}u003e{label}u003c/labelu003e}
      u003cselect {...props} style={{ width:"100%",padding:"8px 10px",border:"1px solid #e0e0e0",borderRadius:7,fontSize:14,boxSizing:"border-box" }}u003e
        {options.map(o =u003e u003coption key={o} value={o}u003e{o}u003c/optionu003e)}
      u003c/selectu003e
    u003c/divu003e
  );
}

function Btn({ children, variant="primary", ...props }) {
  const base = { padding:"8px 16px",borderRadius:7,fontSize:13,fontWeight:500,cursor:"pointer",border:"none" };
  const styles = {
    primary: { ...base, background:"#2d2d2d",color:"#fff" },
    ghost: { ...base, background:"transparent",color:"#555",border:"1px solid #e0e0e0" },
    danger: { ...base, background:"#fee2e2",color:"#b91c1c" },
    soft: { ...base, background:"#f3f4f6",color:"#333" },
  };
  return u003cbutton {...props} style={{ ...styles[variant],...props.style }}u003e{children}u003c/buttonu003e;
}

// ---- Schedule Tab ----
function ScheduleTab({ trip, update }) {
  const [showDay, setShowDay] = useState(false);
  const [showEvent, setShowEvent] = useState(null); // dayId
  const [dayForm, setDayForm] = useState({ date:"", label:"" });
  const [evForm, setEvForm] = useState({ time:"", title:"", location:"", category:"Sightseeing", notes:"" });

  const addDay = () =u003e {
    if (!dayForm.date) return;
    const days = [...(trip.days||[]), { id:uid(), ...dayForm, events:[] }]
      .sort((a,b) =u003e a.date.localeCompare(b.date));
    update({ days });
    setShowDay(false); setDayForm({ date:"", label:"" });
  };

  const addEvent = (dayId) =u003e {
    if (!evForm.title) return;
    const days = trip.days.map(d =u003e d.id===dayId
      ? { ...d, events:[...(d.events||[]), { id:uid(), ...evForm }].sort((a,b)=u003ea.time.localeCompare(b.time)) }
      : d);
    update({ days });
    setShowEvent(null); setEvForm({ time:"", title:"", location:"", category:"Sightseeing", notes:"" });
  };

  const delDay = (id) =u003e update({ days: trip.days.filter(d=u003ed.id!==id) });
  const delEvent = (dayId, evId) =u003e update({ days: trip.days.map(d =u003e d.id===dayId ? { ...d, events:d.events.filter(e=u003ee.id!==evId) } : d) });

  return (
    u003cdivu003e
      u003cdiv style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}u003e
        u003cspan style={{ fontWeight:600 }}u003eDaysu003c/spanu003e
        u003cBtn onClick={()=u003esetShowDay(true)}u003e+ Add Dayu003c/Btnu003e
      u003c/divu003e
      {(!trip.days||trip.days.length===0) u0026u0026 u003cp style={{ color:"#aaa",textAlign:"center",marginTop:40 }}u003eNo days yet. Add your first day!u003c/pu003e}
      {(trip.days||[]).map(day =u003e (
        u003cdiv key={day.id} style={{ background:"#fafafa",border:"1px solid #efefef",borderRadius:10,marginBottom:14,overflow:"hidden" }}u003e
          u003cdiv style={{ padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#f3f4f6" }}u003e
            u003cdivu003e
              u003cspan style={{ fontWeight:600,fontSize:14 }}u003e{day.date}u003c/spanu003e
              {day.label u0026u0026 u003cspan style={{ marginLeft:8,color:"#666",fontSize:13 }}u003e{day.label}u003c/spanu003e}
            u003c/divu003e
            u003cdiv style={{ display:"flex",gap:6 }}u003e
              u003cBtn variant="ghost" style={{ padding:"4px 10px",fontSize:12 }} onClick={()=u003e{ setShowEvent(day.id); setEvForm({ time:"",title:"",location:"",category:"Sightseeing",notes:"" }); }}u003e+ Eventu003c/Btnu003e
              u003cBtn variant="danger" style={{ padding:"4px 10px",fontSize:12 }} onClick={()=u003edelDay(day.id)}u003e✕u003c/Btnu003e
            u003c/divu003e
          u003c/divu003e
          {(day.events||[]).length===0 u0026u0026 u003cp style={{ color:"#bbb",fontSize:13,padding:"10px 14px",margin:0 }}u003eNo eventsu003c/pu003e}
          {(day.events||[]).map(ev =u003e (
            u003cdiv key={ev.id} style={{ padding:"10px 14px",borderTop:"1px solid #efefef",display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}u003e
              u003cdivu003e
                u003cdiv style={{ display:"flex",alignItems:"center",gap:8 }}u003e
                  {ev.time u0026u0026 u003cspan style={{ fontSize:12,color:"#888" }}u003e{ev.time}u003c/spanu003e}
                  u003cspan style={{ fontSize:13,fontWeight:500 }}u003e{ev.title}u003c/spanu003e
                  u003cspan style={{ fontSize:11,background:"#e9ecef",borderRadius:4,padding:"1px 6px",color:"#555" }}u003e{ev.category}u003c/spanu003e
                u003c/divu003e
                {ev.location u0026u0026 u003cdiv style={{ fontSize:12,color:"#888",marginTop:2 }}u003e📍 {ev.location}u003c/divu003e}
                {ev.notes u0026u0026 u003cdiv style={{ fontSize:12,color:"#999",marginTop:2 }}u003e{ev.notes}u003c/divu003e}
              u003c/divu003e
              u003cBtn variant="danger" style={{ padding:"2px 8px",fontSize:12 }} onClick={()=u003edelEvent(day.id,ev.id)}u003e✕u003c/Btnu003e
            u003c/divu003e
          ))}
        u003c/divu003e
      ))}

      {showDay u0026u0026 (
        u003cModal title="Add Day" onClose={()=u003esetShowDay(false)}u003e
          u003cInput label="Date" type="date" value={dayForm.date} onChange={e=u003esetDayForm({...dayForm,date:e.target.value})} /u003e
          u003cInput label="Label (optional)" placeholder="e.g. Arrival Day" value={dayForm.label} onChange={e=u003esetDayForm({...dayForm,label:e.target.value})} /u003e
          u003cdiv style={{ display:"flex",gap:8,justifyContent:"flex-end" }}u003e
            u003cBtn variant="ghost" onClick={()=u003esetShowDay(false)}u003eCancelu003c/Btnu003e
            u003cBtn onClick={addDay}u003eAddu003c/Btnu003e
          u003c/divu003e
        u003c/Modalu003e
      )}
      {showEvent u0026u0026 (
        u003cModal title="Add Event" onClose={()=u003esetShowEvent(null)}u003e
          u003cInput label="Time" type="time" value={evForm.time} onChange={e=u003esetEvForm({...evForm,time:e.target.value})} /u003e
          u003cInput label="Title *" value={evForm.title} onChange={e=u003esetEvForm({...evForm,title:e.target.value})} /u003e
          u003cInput label="Location" value={evForm.location} onChange={e=u003esetEvForm({...evForm,location:e.target.value})} /u003e
          u003cSelect label="Category" options={CATEGORIES} value={evForm.category} onChange={e=u003esetEvForm({...evForm,category:e.target.value})} /u003e
          u003cInput label="Notes" value={evForm.notes} onChange={e=u003esetEvForm({...evForm,notes:e.target.value})} /u003e
          u003cdiv style={{ display:"flex",gap:8,justifyContent:"flex-end" }}u003e
            u003cBtn variant="ghost" onClick={()=u003esetShowEvent(null)}u003eCancelu003c/Btnu003e
            u003cBtn onClick={()=u003eaddEvent(showEvent)}u003eAddu003c/Btnu003e
          u003c/divu003e
        u003c/Modalu003e
      )}
    u003c/divu003e
  );
}

// ---- Budget Tab ----
function BudgetTab({ trip, update }) {
  const [showExp, setShowExp] = useState(false);
  const [form, setForm] = useState({ desc:"", amount:"", category:"Food" });

  const total = (trip.expenses||[]).reduce((s,e)=u003es+parseFloat(e.amount||0),0);
  const budget = parseFloat(trip.budget||0);

  const addExp = () =u003e {
    if (!form.desc||!form.amount) return;
    update({ expenses:[...(trip.expenses||[]), { id:uid(), ...form }] });
    setShowExp(false); setForm({ desc:"", amount:"", category:"Food" });
  };
  const delExp = (id) =u003e update({ expenses: trip.expenses.filter(e=u003ee.id!==id) });

  const bycat = BUDGET_CATS.map(c =u003e ({
    cat:c, total:(trip.expenses||[]).filter(e=u003ee.category===c).reduce((s,e)=u003es+parseFloat(e.amount||0),0)
  })).filter(x=u003ex.totalu003e0);

  return (
    u003cdivu003e
      u003cdiv style={{ background:"#fafafa",border:"1px solid #efefef",borderRadius:10,padding:16,marginBottom:16 }}u003e
        u003cdiv style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}u003e
          u003cspan style={{ fontSize:13,color:"#666" }}u003eTrip Budgetu003c/spanu003e
          u003cinput value={trip.budget||""} onChange={e=u003eupdate({budget:e.target.value})} placeholder="0.00" type="number"
            style={{ width:120,padding:"4px 8px",border:"1px solid #e0e0e0",borderRadius:6,fontSize:14,textAlign:"right" }} /u003e
        u003c/divu003e
        u003cdiv style={{ display:"flex",justifyContent:"space-between" }}u003e
          u003cspan style={{ fontSize:13,color:"#666" }}u003eSpentu003c/spanu003e
          u003cspan style={{ fontWeight:600,color: budgetu0026u0026totalu003ebudget?"#b91c1c":"#2d2d2d" }}u003e${total.toFixed(2)}u003c/spanu003e
        u003c/divu003e
        {budgetu003e0 u0026u0026 (
          u003cu003e
            u003cdiv style={{ marginTop:10,height:6,background:"#e9ecef",borderRadius:3,overflow:"hidden" }}u003e
              u003cdiv style={{ height:"100%",background: totalu003ebudget?"#ef4444":"#2d2d2d",width:`${Math.min(100,(total/budget)*100)}%`,transition:"width .3s" }} /u003e
            u003c/divu003e
            u003cdiv style={{ display:"flex",justifyContent:"space-between",marginTop:4,fontSize:12,color:"#888" }}u003e
              u003cspanu003eRemaining: ${Math.max(0,budget-total).toFixed(2)}u003c/spanu003e
              u003cspanu003e{budgetu003e0?Math.round((total/budget)*100):0}%u003c/spanu003e
            u003c/divu003e
          u003c/u003e
        )}
      u003c/divu003e

      {bycat.lengthu003e0 u0026u0026 (
        u003cdiv style={{ marginBottom:16 }}u003e
          u003cdiv style={{ fontSize:12,color:"#888",marginBottom:8 }}u003eBy Categoryu003c/divu003e
          {bycat.map(x=u003e(
            u003cdiv key={x.cat} style={{ display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderBottom:"1px solid #f3f4f6" }}u003e
              u003cspanu003e{x.cat}u003c/spanu003eu003cspan style={{ fontWeight:500 }}u003e${x.total.toFixed(2)}u003c/spanu003e
            u003c/divu003e
          ))}
        u003c/divu003e
      )}

      u003cdiv style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}u003e
        u003cspan style={{ fontWeight:600 }}u003eExpensesu003c/spanu003e
        u003cBtn onClick={()=u003esetShowExp(true)}u003e+ Add Expenseu003c/Btnu003e
      u003c/divu003e
      {(trip.expenses||[]).length===0 u0026u0026 u003cp style={{ color:"#aaa",textAlign:"center",marginTop:24 }}u003eNo expenses logged yet.u003c/pu003e}
      {(trip.expenses||[]).map(e=u003e(
        u003cdiv key={e.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f3f4f6" }}u003e
          u003cdivu003e
            u003cdiv style={{ fontSize:13,fontWeight:500 }}u003e{e.desc}u003c/divu003e
            u003cdiv style={{ fontSize:11,color:"#888" }}u003e{e.category}u003c/divu003e
          u003c/divu003e
          u003cdiv style={{ display:"flex",alignItems:"center",gap:10 }}u003e
            u003cspan style={{ fontWeight:600 }}u003e${parseFloat(e.amount).toFixed(2)}u003c/spanu003e
            u003cBtn variant="danger" style={{ padding:"2px 8px",fontSize:12 }} onClick={()=u003edelExp(e.id)}u003e✕u003c/Btnu003e
          u003c/divu003e
        u003c/divu003e
      ))}

      {showExp u0026u0026 (
        u003cModal title="Add Expense" onClose={()=u003esetShowExp(false)}u003e
          u003cInput label="Description *" value={form.desc} onChange={e=u003esetForm({...form,desc:e.target.value})} /u003e
          u003cInput label="Amount *" type="number" value={form.amount} onChange={e=u003esetForm({...form,amount:e.target.value})} /u003e
          u003cSelect label="Category" options={BUDGET_CATS} value={form.category} onChange={e=u003esetForm({...form,category:e.target.value})} /u003e
          u003cdiv style={{ display:"flex",gap:8,justifyContent:"flex-end" }}u003e
            u003cBtn variant="ghost" onClick={()=u003esetShowExp(false)}u003eCancelu003c/Btnu003e
            u003cBtn onClick={addExp}u003eAddu003c/Btnu003e
          u003c/divu003e
        u003c/Modalu003e
      )}
    u003c/divu003e
  );
}

// ---- Packing Tab ----
function PackingTab({ trip, update }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:"", category:"Clothing" });

  const addItem = () =u003e {
    if (!form.name) return;
    update({ packItems:[...(trip.packItems||[]), { id:uid(), packed:false, ...form }] });
    setShowAdd(false); setForm({ name:"", category:"Clothing" });
  };
  const toggle = (id) =u003e update({ packItems: trip.packItems.map(p=u003ep.id===id?{...p,packed:!p.packed}:p) });
  const del = (id) =u003e update({ packItems: trip.packItems.filter(p=u003ep.id!==id) });

  const packed = (trip.packItems||[]).filter(p=u003ep.packed).length;
  const total = (trip.packItems||[]).length;

  const grouped = PACK_CATS.map(c=u003e({ cat:c, items:(trip.packItems||[]).filter(p=u003ep.category===c) })).filter(x=u003ex.items.lengthu003e0);
  const uncatted = (trip.packItems||[]).filter(p=u003e!PACK_CATS.includes(p.category));

  return (
    u003cdivu003e
      u003cdiv style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}u003e
        u003cdivu003e
          u003cspan style={{ fontWeight:600 }}u003ePacking Listu003c/spanu003e
          {totalu003e0 u0026u0026 u003cspan style={{ fontSize:12,color:"#888",marginLeft:8 }}u003e{packed}/{total} packedu003c/spanu003e}
        u003c/divu003e
        u003cBtn onClick={()=u003esetShowAdd(true)}u003e+ Add Itemu003c/Btnu003e
      u003c/divu003e
      {totalu003e0 u0026u0026 (
        u003cdiv style={{ height:4,background:"#e9ecef",borderRadius:2,marginBottom:16,overflow:"hidden" }}u003e
          u003cdiv style={{ height:"100%",background:"#2d2d2d",width:`${total?Math.round((packed/total)*100):0}%`,transition:"width .3s" }} /u003e
        u003c/divu003e
      )}
      {total===0 u0026u0026 u003cp style={{ color:"#aaa",textAlign:"center",marginTop:40 }}u003eNothing to pack yet!u003c/pu003e}
      {grouped.map(({ cat, items })=u003e(
        u003cdiv key={cat} style={{ marginBottom:14 }}u003e
          u003cdiv style={{ fontSize:12,fontWeight:600,color:"#888",marginBottom:6,textTransform:"uppercase",letterSpacing:".05em" }}u003e{cat}u003c/divu003e
          {items.map(item=u003e(
            u003cdiv key={item.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #f3f4f6" }}u003e
              u003cinput type="checkbox" checked={item.packed} onChange={()=u003etoggle(item.id)} style={{ accentColor:"#2d2d2d",width:15,height:15 }} /u003e
              u003cspan style={{ flex:1,fontSize:13,textDecoration:item.packed?"line-through":"none",color:item.packed?"#bbb":"#333" }}u003e{item.name}u003c/spanu003e
              u003cBtn variant="danger" style={{ padding:"2px 8px",fontSize:12 }} onClick={()=u003edel(item.id)}u003e✕u003c/Btnu003e
            u003c/divu003e
          ))}
        u003c/divu003e
      ))}
      {uncatted.map(item=u003e(
        u003cdiv key={item.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #f3f4f6" }}u003e
          u003cinput type="checkbox" checked={item.packed} onChange={()=u003etoggle(item.id)} style={{ accentColor:"#2d2d2d" }} /u003e
          u003cspan style={{ flex:1,fontSize:13,textDecoration:item.packed?"line-through":"none",color:item.packed?"#bbb":"#333" }}u003e{item.name}u003c/spanu003e
          u003cBtn variant="danger" style={{ padding:"2px 8px",fontSize:12 }} onClick={()=u003edel(item.id)}u003e✕u003c/Btnu003e
        u003c/divu003e
      ))}

      {showAdd u0026u0026 (
        u003cModal title="Add Item" onClose={()=u003esetShowAdd(false)}u003e
          u003cInput label="Item Name *" value={form.name} onChange={e=u003esetForm({...form,name:e.target.value})} /u003e
          u003cSelect label="Category" options={PACK_CATS} value={form.category} onChange={e=u003esetForm({...form,category:e.target.value})} /u003e
          u003cdiv style={{ display:"flex",gap:8,justifyContent:"flex-end" }}u003e
            u003cBtn variant="ghost" onClick={()=u003esetShowAdd(false)}u003eCancelu003c/Btnu003e
            u003cBtn onClick={addItem}u003eAddu003c/Btnu003e
          u003c/divu003e
        u003c/Modalu003e
      )}
    u003c/divu003e
  );
}

// ---- Locations Tab ----
function LocationsTab({ trip, update }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:"", address:"", type:"Hotel", notes:"" });
  const LOC_TYPES = ["Hotel","Airport","Restaurant","Attraction","Transport","Other"];

  const addLoc = () =u003e {
    if (!form.name) return;
    update({ locations:[...(trip.locations||[]), { id:uid(), ...form }] });
    setShowAdd(false); setForm({ name:"", address:"", type:"Hotel", notes:"" });
  };
  const del = (id) =u003e update({ locations: trip.locations.filter(l=u003el.id!==id) });

  return (
    u003cdivu003e
      u003cdiv style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}u003e
        u003cspan style={{ fontWeight:600 }}u003eLocationsu003c/spanu003e
        u003cBtn onClick={()=u003esetShowAdd(true)}u003e+ Add Locationu003c/Btnu003e
      u003c/divu003e
      {(trip.locations||[]).length===0 u0026u0026 u003cp style={{ color:"#aaa",textAlign:"center",marginTop:40 }}u003eNo locations added yet.u003c/pu003e}
      {(trip.locations||[]).map(loc=u003e(
        u003cdiv key={loc.id} style={{ background:"#fafafa",border:"1px solid #efefef",borderRadius:10,padding:14,marginBottom:12 }}u003e
          u003cdiv style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}u003e
            u003cdiv style={{ flex:1 }}u003e
              u003cdiv style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}u003e
                u003cspan style={{ fontWeight:600,fontSize:14 }}u003e{loc.name}u003c/spanu003e
                u003cspan style={{ fontSize:11,background:"#e9ecef",borderRadius:4,padding:"1px 6px",color:"#555" }}u003e{loc.type}u003c/spanu003e
              u003c/divu003e
              {loc.address u0026u0026 (
                u003ca href={`https://maps.google.com/?q=${encodeURIComponent(loc.address)}`} target="_blank" rel="noreferrer"
                  style={{ fontSize:12,color:"#2d7ef5",textDecoration:"none" }}u003e
                  📍 {loc.address}
                u003c/au003e
              )}
              {loc.notes u0026u0026 u003cdiv style={{ fontSize:12,color:"#888",marginTop:4 }}u003e{loc.notes}u003c/divu003e}
            u003c/divu003e
            u003cBtn variant="danger" style={{ padding:"4px 10px",fontSize:12,marginLeft:8 }} onClick={()=u003edel(loc.id)}u003e✕u003c/Btnu003e
          u003c/divu003e
        u003c/divu003e
      ))}

      {showAdd u0026u0026 (
        u003cModal title="Add Location" onClose={()=u003esetShowAdd(false)}u003e
          u003cInput label="Name *" value={form.name} onChange={e=u003esetForm({...form,name:e.target.value})} /u003e
          u003cInput label="Address" placeholder="Opens in Google Maps" value={form.address} onChange={e=u003esetForm({...form,address:e.target.value})} /u003e
          u003cSelect label="Type" options={LOC_TYPES} value={form.type} onChange={e=u003esetForm({...form,type:e.target.value})} /u003e
          u003cInput label="Notes" value={form.notes} onChange={e=u003esetForm({...form,notes:e.target.value})} /u003e
          u003cdiv style={{ display:"flex",gap:8,justifyContent:"flex-end" }}u003e
            u003cBtn variant="ghost" onClick={()=u003esetShowAdd(false)}u003eCancelu003c/Btnu003e
            u003cBtn onClick={addLoc}u003eAddu003c/Btnu003e
          u003c/divu003e
        u003c/Modalu003e
      )}
    u003c/divu003e
  );
}

// ---- Main App ----
export default function App() {
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeTab, setActiveTab] = useState("Schedule");
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [tripForm, setTripForm] = useState({ name:"", destination:"", startDate:"", endDate:"" });
  const [loading, setLoading] = useState(true);

  // Load from storage
  useEffect(() =u003e {
    (async () =u003e {
      try {
        const res = await window.storage.get("trips");
        if (res?.value) {
          const data = JSON.parse(res.value);
          setTrips(data);
          if (data.lengthu003e0) setActiveTrip(data[0].id);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Save to storage
  const saveTrips = async (updated) =u003e {
    setTrips(updated);
    try { await window.storage.set("trips", JSON.stringify(updated)); } catch {}
  };

  const createTrip = () =u003e {
    if (!tripForm.name) return;
    const t = { ...defaultTrip(), ...tripForm };
    const updated = [...trips, t];
    saveTrips(updated);
    setActiveTrip(t.id);
    setShowNewTrip(false);
    setTripForm({ name:"", destination:"", startDate:"", endDate:"" });
  };

  const deleteTrip = (id) =u003e {
    const updated = trips.filter(t=u003et.id!==id);
    saveTrips(updated);
    setActiveTrip(updated.lengthu003e0 ? updated[0].id : null);
  };

  const updateTrip = (id, patch) =u003e {
    const updated = trips.map(t=u003et.id===id?{...t,...patch}:t);
    saveTrips(updated);
  };

  const trip = trips.find(t=u003et.id===activeTrip);

  if (loading) return u003cdiv style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"#aaa",fontSize:14 }}u003eLoading…u003c/divu003e;

  return (
    u003cdiv style={{ fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",maxWidth:680,margin:"0 auto",minHeight:"100vh",background:"#fff" }}u003e
      {/* Header */}
      u003cdiv style={{ padding:"20px 20px 0",borderBottom:"1px solid #efefef" }}u003e
        u003cdiv style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}u003e
          u003ch1 style={{ margin:0,fontSize:20,fontWeight:700 }}u003e✈️ Travel Planneru003c/h1u003e
          u003cBtn onClick={()=u003esetShowNewTrip(true)}u003e+ New Tripu003c/Btnu003e
        u003c/divu003e
        {/* Trip tabs */}
        u003cdiv style={{ display:"flex",gap:4,overflowX:"auto",paddingBottom:0 }}u003e
          {trips.map(t=u003e(
            u003cbutton key={t.id} onClick={()=u003esetActiveTrip(t.id)}
              style={{ padding:"7px 14px",borderRadius:"7px 7px 0 0",border:"1px solid",borderBottom:"none",
                borderColor: activeTrip===t.id?"#efefef":"transparent",
                background: activeTrip===t.id?"#fff":"transparent",
                fontWeight: activeTrip===t.id?600:400,
                fontSize:13,cursor:"pointer",color: activeTrip===t.id?"#2d2d2d":"#888",whiteSpace:"nowrap" }}u003e
              {t.name||"Unnamed"}
            u003c/buttonu003e
          ))}
        u003c/divu003e
      u003c/divu003e

      {/* Trip content */}
      {!trip ? (
        u003cdiv style={{ textAlign:"center",marginTop:80,color:"#bbb" }}u003e
          u003cdiv style={{ fontSize:48,marginBottom:12 }}u003e🗺️u003c/divu003e
          u003cp style={{ fontSize:15 }}u003eNo trips yet. Create your first one!u003c/pu003e
          u003cBtn onClick={()=u003esetShowNewTrip(true)} style={{ marginTop:8 }}u003e+ New Tripu003c/Btnu003e
        u003c/divu003e
      ) : (
        u003cdiv style={{ padding:20 }}u003e
          {/* Trip info */}
          u003cdiv style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}u003e
            u003cdivu003e
              u003ch2 style={{ margin:"0 0 2px",fontSize:18,fontWeight:700 }}u003e{trip.name}u003c/h2u003e
              u003cdiv style={{ fontSize:13,color:"#888" }}u003e
                {trip.destination u0026u0026 u003cspanu003e📍 {trip.destination}u003c/spanu003e}
                {trip.startDate u0026u0026 u003cspan style={{ marginLeft:8 }}u003e🗓 {trip.startDate}{trip.endDate?` → ${trip.endDate}`:""}u003c/spanu003e}
              u003c/divu003e
            u003c/divu003e
            u003cBtn variant="danger" style={{ fontSize:12,padding:"4px 10px" }} onClick={()=u003edeleteTrip(trip.id)}u003eDelete Tripu003c/Btnu003e
          u003c/divu003e

          {/* Inner tabs */}
          u003cdiv style={{ display:"flex",gap:2,marginBottom:20,background:"#f3f4f6",borderRadius:8,padding:3 }}u003e
            {TABS.map(tab=u003e(
              u003cbutton key={tab} onClick={()=u003esetActiveTab(tab)}
                style={{ flex:1,padding:"6px 0",border:"none",borderRadius:6,fontSize:13,cursor:"pointer",fontWeight:500,
                  background: activeTab===tab?"#fff":"transparent",
                  color: activeTab===tab?"#2d2d2d":"#888",
                  boxShadow: activeTab===tab?"0 1px 3px rgba(0,0,0,.08)":"none" }}u003e
                {tab}
              u003c/buttonu003e
            ))}
          u003c/divu003e

          {activeTab==="Schedule" u0026u0026 u003cScheduleTab trip={trip} update={p=u003eupdateTrip(trip.id,p)} /u003e}
          {activeTab==="Budget" u0026u0026 u003cBudgetTab trip={trip} update={p=u003eupdateTrip(trip.id,p)} /u003e}
          {activeTab==="Packing" u0026u0026 u003cPackingTab trip={trip} update={p=u003eupdateTrip(trip.id,p)} /u003e}
          {activeTab==="Locations" u0026u0026 u003cLocationsTab trip={trip} update={p=u003eupdateTrip(trip.id,p)} /u003e}
        u003c/divu003e
      )}

      {/* New Trip Modal */}
      {showNewTrip u0026u0026 (
        u003cModal title="New Trip" onClose={()=u003esetShowNewTrip(false)}u003e
          u003cInput label="Trip Name *" placeholder="e.g. Tokyo Summer 2026" value={tripForm.name} onChange={e=u003esetTripForm({...tripForm,name:e.target.value})} /u003e
          u003cInput label="Destination" placeholder="e.g. Tokyo, Japan" value={tripForm.destination} onChange={e=u003esetTripForm({...tripForm,destination:e.target.value})} /u003e
          u003cInput label="Start Date" type="date" value={tripForm.startDate} onChange={e=u003esetTripForm({...tripForm,startDate:e.target.value})} /u003e
          u003cInput label="End Date" type="date" value={tripForm.endDate} onChange={e=u003esetTripForm({...tripForm,endDate:e.target.value})} /u003e
          u003cdiv style={{ display:"flex",gap:8,justifyContent:"flex-end" }}u003e
            u003cBtn variant="ghost" onClick={()=u003esetShowNewTrip(false)}u003eCancelu003c/Btnu003e
            u003cBtn onClick={createTrip}u003eCreate Tripu003c/Btnu003e
          u003c/divu003e
        u003c/Modalu003e
      )}
    u003c/divu003e
  );
}
