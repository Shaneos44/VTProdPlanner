import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  doc, setDoc, onSnapshot
} from "firebase/firestore";

// Lighten color for completed
function lightenColor(color, percent) {
  // color: #RRGGBB, percent: 0.0 - 1.0
  let num = parseInt(color.slice(1),16),
      amt = Math.round(2.55 * percent * 100),
      R = (num >> 16) + amt,
      G = (num >> 8 & 0x00FF) + amt,
      B = (num & 0x0000FF) + amt;
  return "#" + (
    0x1000000
    + (R < 255 ? (R < 1 ? 0 : R) : 255)*0x10000
    + (G < 255 ? (G < 1 ? 0 : G) : 255)*0x100
    + (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1);
}

// Helpers for dates etc
function getMonthDays(year, month) {
  const days = [];
  const last = new Date(year, month + 1, 0);
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}
function formatDateKey(date) {
  return date.toISOString().split("T")[0];
}
function getMonthName(month) {
  return [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ][month];
}
function getRandomColor() {
  return "#" + Math.floor(Math.random() * 16777215).toString(16);
}

const processTemplate = [
  "Plasma Treatment",
  "Enzyme Dipcoating",
  "QC",
  "Packaging",
];

const DATA_DOC = "calendar/live";

const initialData = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  toSchedule: [],
  batchColors: {},
  events: {},
};

async function saveData(data) {
  await setDoc(doc(db, DATA_DOC), data);
}

function ensureCompleted(block) {
  // Patch for legacy blocks missing .completed
  return { ...block, completed: typeof block.completed === "boolean" ? block.completed : false };
}

function App() {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);

  // Drag and drop
  const [dragBlock, setDragBlock] = useState(null);
  const [dragFrom, setDragFrom] = useState(null);

  // Edit
  const [editBlock, setEditBlock] = useState(null);
  const [editText, setEditText] = useState("");
  const [batch, setBatch] = useState("");

  // Sync from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, DATA_DOC), (docSnap) => {
      if (docSnap.exists()) {
        // Patch for missing .completed (migrate old data)
        let d = docSnap.data();
        d = {
          ...d,
          toSchedule: (d.toSchedule || []).map(ensureCompleted),
          events: Object.fromEntries(
            Object.entries(d.events || {}).map(([k, arr]) => [
              k, arr.map(ensureCompleted)
            ])
          )
        };
        setData(d);
      } else {
        saveData(initialData);
        setData(initialData);
      }
      setLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line
  }, []);

  // Calendar navigation
  const prevMonth = () => {
    const newMonth = data.month === 0 ? 11 : data.month - 1;
    const newYear = data.month === 0 ? data.year - 1 : data.year;
    saveData({ ...data, month: newMonth, year: newYear });
  };
  const nextMonth = () => {
    const newMonth = data.month === 11 ? 0 : data.month + 1;
    const newYear = data.month === 11 ? data.year + 1 : data.year;
    saveData({ ...data, month: newMonth, year: newYear });
  };

  // Batch input
  const handleBatchInput = async () => {
    if (!batch.trim()) return;
    const color = data.batchColors[batch] || getRandomColor();
    const newBatchColors = { ...data.batchColors, [batch]: color };
    const blocks = processTemplate.map(proc => ({
      title: proc,
      batch,
      color,
      completed: false,
      id: Math.random().toString(36).slice(2) + Date.now()
    }));
    await saveData({
      ...data,
      toSchedule: [...data.toSchedule, ...blocks],
      batchColors: newBatchColors,
    });
    setBatch("");
  };

  // Assign block to day
  const handleAssign = async (block, day) => {
    const key = formatDateKey(day);
    const newEvents = { ...data.events, [key]: [...(data.events[key] || []), block] };
    await saveData({
      ...data,
      events: newEvents,
      toSchedule: data.toSchedule.filter(b => b.id !== block.id)
    });
  };

  // Move block between days
  const moveBlockBetweenDays = async (fromKey, index, toDay) => {
    const toKey = formatDateKey(toDay);
    const fromArr = [...(data.events[fromKey] || [])];
    const [block] = fromArr.splice(index, 1);
    const toArr = [...(data.events[toKey] || []), block];
    await saveData({
      ...data,
      events: {
        ...data.events,
        [fromKey]: fromArr,
        [toKey]: toArr
      }
    });
  };

  // Drag handlers
  const onDragStartSidebar = (block) => {
    setDragBlock(block);
    setDragFrom({ type: "sidebar" });
  };
  const onDragStartCalendar = (block, dateKey, index) => {
    setDragBlock(block);
    setDragFrom({ type: "calendar", dateKey, index });
  };
  const onDropOnDay = (day) => {
    if (!dragBlock) return;
    if (dragFrom.type === "sidebar") {
      handleAssign(dragBlock, day);
    } else if (dragFrom.type === "calendar") {
      moveBlockBetweenDays(dragFrom.dateKey, dragFrom.index, day);
    }
    setDragBlock(null);
    setDragFrom(null);
  };

  // Edit handlers
  async function startEdit(block) {
    setEditBlock(block.id);
    setEditText(block.title);
  }
  async function saveEdit(block, location, index = null, dayKey = null) {
    if (location === "sidebar") {
      const newToSchedule = data.toSchedule.map(b =>
        b.id === block.id ? { ...b, title: editText } : b
      );
      await saveData({ ...data, toSchedule: newToSchedule });
    } else if (location === "calendar" && dayKey !== null) {
      const newEvents = {
        ...data.events,
        [dayKey]: data.events[dayKey].map((b, i) =>
          i === index && b.id === block.id ? { ...b, title: editText } : b
        ),
      };
      await saveData({ ...data, events: newEvents });
    }
    setEditBlock(null);
    setEditText("");
  }

  // Delete handlers
  async function deleteFromSidebar(block) {
    const newToSchedule = data.toSchedule.filter(b => b.id !== block.id);
    await saveData({ ...data, toSchedule: newToSchedule });
  }
  async function deleteFromCalendar(dayKey, i) {
    const newEvents = {
      ...data.events,
      [dayKey]: data.events[dayKey].filter((b, j) => j !== i)
    };
    await saveData({ ...data, events: newEvents });
  }

  // Toggle complete
  async function toggleCompleteSidebar(block, checked) {
    const updated = { ...block, completed: checked };
    const newToSchedule = data.toSchedule.map(b => b.id === block.id ? updated : b);
    await saveData({ ...data, toSchedule: newToSchedule });
  }
  async function toggleCompleteCalendar(dayKey, i, checked) {
    const updated = { ...data.events[dayKey][i], completed: checked };
    const newEvents = {
      ...data.events,
      [dayKey]: data.events[dayKey].map((b, j) => j === i ? updated : b)
    };
    await saveData({ ...data, events: newEvents });
  }

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;

  // Render calendar grid
  const days = getMonthDays(data.year, data.month);
  const firstWeekday = new Date(data.year, data.month, 1).getDay();
  const blanks = Array(firstWeekday).fill(null);

  return (
    <div style={{ display: "flex", gap: 24, padding: 24, fontFamily: "sans-serif" }}>
      {/* Sidebar */}
      <div style={{ minWidth: 250 }}>
        <h2>Batch Input</h2>
        <input
          value={batch}
          onChange={e => setBatch(e.target.value)}
          placeholder="Batch number"
          style={{ marginBottom: 8, width: "100%", padding: 6, borderRadius: 6, border: "1px solid #aaa" }}
        />
        <button
          onClick={handleBatchInput}
          style={{ marginBottom: 16, width: "100%", padding: 8, borderRadius: 6, background: "#007bff", color: "#fff", border: "none" }}
        >
          Generate Process Blocks
        </button>
        <h3>To Schedule</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {data.toSchedule.map((block, i) => (
            <li
              key={block.id}
              style={{
                background: block.completed ? lightenColor(block.color, 0.7) : block.color,
                marginBottom: 8,
                padding: 8,
                borderRadius: 6,
                color: block.completed ? "#888" : "#222",
                opacity: dragBlock === block ? 0.5 : 1,
                cursor: "grab",
                display: "flex",
                alignItems: "center"
              }}
              draggable
              onDragStart={() => onDragStartSidebar(block)}
              onDragEnd={() => { setDragBlock(null); setDragFrom(null); }}
            >
              {/* Completed Checkbox */}
              <input
                type="checkbox"
                checked={!!block.completed}
                onChange={e => toggleCompleteSidebar(block, e.target.checked)}
                style={{ marginRight: 8 }}
                title="Mark complete"
              />
              {editBlock === block.id ? (
                <input
                  value={editText}
                  autoFocus
                  style={{ flex: 1, marginRight: 8 }}
                  onChange={e => setEditText(e.target.value)}
                  onBlur={() => saveEdit(block, "sidebar")}
                  onKeyDown={e => {
                    if (e.key === "Enter") saveEdit(block, "sidebar");
                    if (e.key === "Escape") { setEditBlock(null); setEditText(""); }
                  }}
                />
              ) : (
                <>
                  <span style={{
                    flex: 1,
                    textDecoration: block.completed ? "line-through" : "none",
                    color: block.completed ? "#888" : "#222"
                  }}>
                    {block.title} <b>({block.batch})</b>
                  </span>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await deleteFromSidebar(block);
                    }}
                    title="Delete"
                    style={{
                      marginLeft: 6,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "#c00",
                      fontSize: 18
                    }}
                  >🗑️</button>
                  <button
                    onClick={e => { e.stopPropagation(); startEdit(block); }}
                    title="Edit text"
                    style={{
                      marginLeft: 4,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "#333",
                      fontSize: 16
                    }}
                  >✏️</button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
      {/* Calendar */}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <button onClick={prevMonth} style={{ fontSize: 20, marginRight: 8 }}>{"<"}</button>
          <span style={{ fontSize: 22, fontWeight: 600 }}>
            {getMonthName(data.month)} {data.year}
          </span>
          <button onClick={nextMonth} style={{ fontSize: 20, marginLeft: 8 }}>{">"}</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, background: "#eee", borderRadius: 10 }}>
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => (
            <div key={day} style={{ fontWeight: 700, padding: 6, textAlign: "center" }}>{day}</div>
          ))}
          {blanks.map((_, i) => <div key={`blank${i}`}></div>)}
          {days.map(day => {
            const key = formatDateKey(day);
            return (
              <div
                key={key}
                style={{
                  minHeight: 80,
                  background: "#fff",
                  borderRadius: 6,
                  padding: 4,
                  border: "1px solid #ddd",
                  boxShadow: "0 1px 2px #0001"
                }}
                onDragOver={e => { e.preventDefault(); }}
                onDrop={() => onDropOnDay(day)}
              >
                <div style={{ fontWeight: 700, fontSize: 16, color: "#777" }}>{day.getDate()}</div>
                <div>
                  {(data.events[key] || []).map((block, i) => (
                    <div
                      key={block.id}
                      style={{
                        background: block.completed ? lightenColor(block.color, 0.7) : block.color,
                        color: block.completed ? "#888" : "#222",
                        borderRadius: 6,
                        margin: "2px 0",
                        fontSize: 13,
                        padding: "1px 4px",
                        opacity: dragBlock === block ? 0.5 : 1,
                        cursor: "grab",
                        display: "flex",
                        alignItems: "center"
                      }}
                      draggable
                      onDragStart={() => onDragStartCalendar(block, key, i)}
                      onDragEnd={() => { setDragBlock(null); setDragFrom(null); }}
                    >
                      {/* Completed Checkbox */}
                      <input
                        type="checkbox"
                        checked={!!block.completed}
                        onChange={e => toggleCompleteCalendar(key, i, e.target.checked)}
                        style={{ marginRight: 8 }}
                        title="Mark complete"
                      />
                      {editBlock === block.id ? (
                        <input
                          value={editText}
                          autoFocus
                          style={{ flex: 1, marginRight: 8 }}
                          onChange={e => setEditText(e.target.value)}
                          onBlur={() => saveEdit(block, "calendar", i, key)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveEdit(block, "calendar", i, key);
                            if (e.key === "Escape") { setEditBlock(null); setEditText(""); }
                          }}
                        />
                      ) : (
                        <>
                          <span style={{
                            flex: 1,
                            textDecoration: block.completed ? "line-through" : "none",
                            color: block.completed ? "#888" : "#222"
                          }}>
                            {block.title} <b>({block.batch})</b>
                          </span>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await deleteFromCalendar(key, i);
                            }}
                            title="Delete"
                            style={{
                              marginLeft: 6,
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              color: "#c00",
                              fontSize: 18
                            }}
                          >🗑️</button>
                          <button
                            onClick={e => { e.stopPropagation(); startEdit(block); }}
                            title="Edit text"
                            style={{
                              marginLeft: 4,
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              color: "#333",
                              fontSize: 16
                            }}
                          >✏️</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 16, fontSize: 13, color: "#555" }}>
          Drag a process from the sidebar or any day to another day.<br />
          Click &lt; / &gt; to switch months.<br />
          <span style={{ color: "#197" }}>
            Tick the checkbox when a process is complete (it stays visible but changes color).
            <br />Click ✏️ to edit, 🗑️ to delete.
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
