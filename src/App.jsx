import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";

import {
  SOURCES, LIVE_TENDERS_INITIAL, SEARCH_QUERIES, FRAMEWORKS,
  STATUS_COLORS, SECTOR_COLORS, PIPELINE_STAGES,
  SECTORS, STATUSES, CPV_CODES, STRATEGY_CARDS,
} from "./data";

const API_BASE = "http://localhost:8002";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

function exportCSV(tenders, tracking) {
  const header = ["Org", "Title", "Sector", "Status", "Value", "Published", "Deadline", "Pipeline Stage", "URL", "Public Notes", "My Notes"];
  const rows = tenders.map((t) => {
    const tr = tracking[t.id] || {};
    const stage = PIPELINE_STAGES.find((s) => s.id === (tr.stage || "watching"))?.label || "Watching";
    const deadline = tr.deadline || t.deadline || "";
    return [t.org, t.title, t.sector, t.status, t.value, t.published, deadline, stage, t.url, t.notes, tr.myNotes || ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "erp-tenders.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Overlay({ onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}
      >
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const sc = STATUS_COLORS[status] || STATUS_COLORS["Closed"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: sc.bg, color: sc.text, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

function StageBadge({ stageId }) {
  const stage = PIPELINE_STAGES.find((s) => s.id === stageId) || PIPELINE_STAGES[0];
  return (
    <span style={{ background: stage.bg, color: stage.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
      {stage.icon} {stage.label}
    </span>
  );
}

function DeadlineBadge({ deadline }) {
  const days = daysUntil(deadline);
  if (days === null) return null;
  const color = days < 0 ? "#dc2626" : days < 7 ? "#dc2626" : days < 30 ? "#f59e0b" : "#16a34a";
  const label = days < 0 ? "OVERDUE" : days === 0 ? "Today!" : `${days}d left`;
  return (
    <span style={{ background: `${color}22`, color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
      📅 {label}
    </span>
  );
}

// ─── Modal: Add / Edit Tender ─────────────────────────────────────────────────

function TenderFormModal({ tender, onSave, onClose }) {
  const isNew = !tender?.id;
  const [form, setForm] = useState({
    org: tender?.org || "",
    title: tender?.title || "",
    sector: tender?.sector || "Local Gov",
    status: tender?.status || "Active",
    value: tender?.value || "TBC",
    published: tender?.published || "",
    url: tender?.url || "",
    deadline: tender?.deadline || "",
    notes: tender?.notes || "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const inp = { background: "#0a0f1e", border: "1px solid #334155", borderRadius: 7, padding: "8px 12px", color: "#e2e8f0", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" };
  const lbl = { display: "block", fontSize: 10, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.1em" };

  const handleSave = () => {
    if (!form.org.trim() || !form.title.trim()) return;
    onSave({ ...tender, ...form, id: tender?.id || Date.now(), isCustom: true });
    onClose();
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, color: "#f1f5f9" }}>{isNew ? "➕ Add Tender" : "✏️ Edit Tender"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Organisation *</label>
            <input value={form.org} onChange={(e) => set("org", e.target.value)} placeholder="e.g. Manchester City Council" style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Title *</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Cloud ERP Solution Procurement" style={inp} />
          </div>
          <div>
            <label style={lbl}>Sector</label>
            <select value={form.sector} onChange={(e) => set("sector", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Contract Value</label>
            <input value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="TBC or £2.5M" style={inp} />
          </div>
          <div>
            <label style={lbl}>Published Date</label>
            <input value={form.published} onChange={(e) => set("published", e.target.value)} placeholder="e.g. Jan 2026" style={inp} />
          </div>
          <div>
            <label style={lbl}>Bid Deadline</label>
            <input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Notice URL</label>
            <input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://..." style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Notes</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Key context, requirements, contacts..." rows={3} style={{ ...inp, resize: "vertical" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid #334155", color: "#64748b", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={!form.org.trim() || !form.title.trim()}
            style={{ background: "#4f46e5", border: "none", color: "white", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: (!form.org.trim() || !form.title.trim()) ? 0.5 : 1 }}
          >
            {isNew ? "Add Tender" : "Save Changes"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Modal: Tender Detail ─────────────────────────────────────────────────────

function TenderDetailModal({ tender, tracking, onUpdateTracking, onEdit, onDelete, onClose }) {
  const tr = tracking[tender.id] || {};
  const stageId = tr.stage || "watching";
  const secColor = SECTOR_COLORS[tender.sector] || "#6366f1";
  const [myNotes, setMyNotes] = useState(tr.myNotes || "");
  const [deadline, setDeadline] = useState(tr.deadline || tender.deadline || "");

  const update = (updates) => onUpdateTracking(tender.id, updates);
  const saveNotes = () => update({ myNotes, deadline });

  return (
    <Overlay onClose={onClose}>
      <div>
        {/* Header */}
        <div style={{ borderBottom: "1px solid #1e293b", padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 8 }}>
                <StatusBadge status={tender.status} />
                <span style={{ background: `${secColor}22`, color: secColor, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>{tender.sector}</span>
                <StageBadge stageId={stageId} />
                {(tr.deadline || tender.deadline) && <DeadlineBadge deadline={tr.deadline || tender.deadline} />}
              </div>
              <h2 style={{ margin: "0 0 4px", fontSize: 16, color: "#f1f5f9", lineHeight: 1.3 }}>{tender.org}</h2>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: 13, lineHeight: 1.4 }}>{tender.title}</p>
            </div>
            <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
              <button
                onClick={() => update({ bookmarked: !tr.bookmarked })}
                title={tr.bookmarked ? "Remove bookmark" : "Bookmark"}
                style={{ background: tr.bookmarked ? "rgba(251,191,36,0.15)" : "#1e293b", border: `1px solid ${tr.bookmarked ? "#fbbf24" : "#334155"}`, color: tr.bookmarked ? "#fbbf24" : "#64748b", width: 34, height: 34, borderRadius: 7, cursor: "pointer", fontSize: 16 }}
              >
                {tr.bookmarked ? "★" : "☆"}
              </button>
              <button onClick={onEdit} title="Edit" style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", width: 34, height: 34, borderRadius: 7, cursor: "pointer", fontSize: 14 }}>✏️</button>
              <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 22, lineHeight: 1, width: 34, height: 34 }}>×</button>
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[{ label: "Contract Value", value: tender.value }, { label: "Published", value: tender.published }].map(({ label, value }) => (
              <div key={label} style={{ background: "#0a0f1e", borderRadius: 7, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{value || "—"}</div>
              </div>
            ))}
          </div>

          {tender.notes && (
            <div style={{ background: "#0a0f1e", borderRadius: 7, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Public Notes</div>
              <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{tender.notes}</p>
            </div>
          )}

          {/* Pipeline stage */}
          <div>
            <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Pipeline Stage</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PIPELINE_STAGES.map((stage) => (
                <button
                  key={stage.id}
                  onClick={() => update({ stage: stage.id })}
                  style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${stageId === stage.id ? stage.color : "#334155"}`, background: stageId === stage.id ? stage.bg : "transparent", color: stageId === stage.id ? stage.color : "#64748b", cursor: "pointer", fontSize: 12, fontWeight: stageId === stage.id ? 700 : 400, transition: "all 0.1s" }}
                >
                  {stage.icon} {stage.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bid deadline */}
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7 }}>Bid Deadline</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              style={{ background: "#0a0f1e", border: "1px solid #334155", borderRadius: 7, padding: "8px 12px", color: "#e2e8f0", fontSize: 13, outline: "none" }}
            />
          </div>

          {/* My notes */}
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7 }}>My Notes</label>
            <textarea
              value={myNotes}
              onChange={(e) => setMyNotes(e.target.value)}
              placeholder="Contacts, next actions, key requirements..."
              rows={4}
              style={{ background: "#0a0f1e", border: "1px solid #334155", borderRadius: 7, padding: "8px 12px", color: "#e2e8f0", fontSize: 13, outline: "none", width: "100%", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveNotes} style={{ background: "#4f46e5", border: "none", color: "white", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Save Notes</button>
              {tender.url && (
                <a href={tender.url} target="_blank" rel="noopener noreferrer" style={{ background: "rgba(99,102,241,0.12)", border: "1px solid #4338ca", color: "#a5b4fc", padding: "8px 16px", borderRadius: 7, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>View Notice →</a>
              )}
            </div>
            {tender.isCustom && (
              <button
                onClick={() => { if (confirm("Delete this tender?")) { onDelete(tender.id); onClose(); } }}
                style={{ background: "none", border: "1px solid #dc262644", color: "#dc2626", padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontSize: 12 }}
              >
                🗑️ Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Tab: Tenders ─────────────────────────────────────────────────────────────

function TabTenders({ tenders, tracking, onOpen, onAdd, onExport, onTrackSignal }) {
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterSector, setFilterSector] = useState("All");
  const [filterStage, setFilterStage] = useState("All");
  const [searchText, setSearchText] = useState("");
  const [showBookmarked, setShowBookmarked] = useState(false);
  const [aiSignals, setAiSignals] = useState([]);
  const [showAI, setShowAI] = useState(true);

  useEffect(() => {
    const fetchAI = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/signals?min_score=7&converted=0&limit=100`);
        if (resp.ok) {
          const data = await resp.json();
          setAiSignals(data.signals || []);
        }
      } catch {}
    };
    fetchAI();
    const iv = setInterval(fetchAI, 60000);
    return () => clearInterval(iv);
  }, []);

  // Build AI items, deduplicated against already-tracked tender URLs
  const trackedUrls = new Set(tenders.map((t) => t.url).filter(Boolean));
  const aiItems = aiSignals
    .filter((s) => s.url && !trackedUrls.has(s.url))
    .map((s) => ({
      id: `ai_${s.id}`,
      _type: "ai",
      _signalId: s.id,
      org: s.org || s.source || "Unknown",
      title: s.title,
      sector: s.sector || "Unknown",
      status: s.erp_stage === "active-tender" ? "Active" : s.erp_stage === "pre-market" ? "Pre-Market" : "Active",
      value: "TBC",
      published: s.published || s.detected_at?.slice(0, 10) || "",
      url: s.url,
      score: s.score,
      scoreReason: s.score_reason,
      erp_stage: s.erp_stage,
      source: s.source,
      buyer_intel: s.buyer_intel || null,
      contacts: s.contacts || [],
    }));

  const allItems = [
    ...tenders.map((t) => ({ ...t, _type: "manual" })),
    ...(showAI ? aiItems : []),
  ];

  const sectors = ["All", ...new Set(allItems.map((t) => t.sector).filter(Boolean))];

  const filtered = allItems.filter((t) => {
    const tr = t._type === "manual" ? (tracking[t.id] || {}) : {};
    if (filterStatus !== "All" && t.status !== filterStatus) return false;
    if (filterSector !== "All" && t.sector !== filterSector) return false;
    if (filterStage !== "All") {
      if (t._type === "ai") return false;
      if ((tr.stage || "watching") !== filterStage) return false;
    }
    if (showBookmarked && !tr.bookmarked) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!t.org.toLowerCase().includes(q) && !t.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const manualCount = filtered.filter((t) => t._type === "manual").length;
  const aiCount = filtered.filter((t) => t._type === "ai").length;

  return (
    <div>
      {/* AI Banner */}
      {aiItems.length > 0 && (
        <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 9, padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <span style={{ flex: 1, fontSize: 12, color: "#a5b4fc" }}>
            <strong style={{ color: "#c7d2fe" }}>{aiItems.length} new tender{aiItems.length > 1 ? "s" : ""} detected</strong> by AI (score ≥ 7/10, not yet tracked). Click <strong>Track →</strong> to add to your pipeline.
          </span>
          <button
            onClick={() => setShowAI(!showAI)}
            style={{ background: showAI ? "rgba(99,102,241,0.2)" : "transparent", border: "1px solid #4338ca", color: "#a5b4fc", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}
          >
            {showAI ? "Hide" : "Show"}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search organisation or title..."
          style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 13px", color: "#e2e8f0", fontSize: 13, outline: "none", flex: "1 1 180px", minWidth: 160 }}
        />
        <button onClick={() => setShowBookmarked(!showBookmarked)} style={{ padding: "8px 13px", borderRadius: 7, border: "1px solid", borderColor: showBookmarked ? "#fbbf24" : "#334155", background: showBookmarked ? "rgba(251,191,36,0.12)" : "transparent", color: showBookmarked ? "#fbbf24" : "#64748b", cursor: "pointer", fontSize: 13 }}>★ Bookmarked</button>
        <button onClick={onAdd} style={{ padding: "8px 13px", borderRadius: 7, border: "1px solid #4338ca", background: "rgba(99,102,241,0.12)", color: "#a5b4fc", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>+ Add Tender</button>
        <button onClick={onExport} title="Export to CSV" style={{ padding: "8px 11px", borderRadius: 7, border: "1px solid #334155", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13 }}>⬇️ CSV</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {["All", ...STATUSES].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid", borderColor: filterStatus === s ? "#6366f1" : "#334155", background: filterStatus === s ? "rgba(99,102,241,0.15)" : "transparent", color: filterStatus === s ? "#a5b4fc" : "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>{s}</button>
        ))}
        <span style={{ width: 1, background: "#334155", alignSelf: "stretch", margin: "0 2px" }} />
        {sectors.map((s) => (
          <button key={s} onClick={() => setFilterSector(s)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid", borderColor: filterSector === s ? "#0ea5e9" : "#334155", background: filterSector === s ? "rgba(14,165,233,0.12)" : "transparent", color: filterSector === s ? "#7dd3fc" : "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>{s}</button>
        ))}
        <span style={{ width: 1, background: "#334155", alignSelf: "stretch", margin: "0 2px" }} />
        {PIPELINE_STAGES.map((s) => (
          <button key={s.id} onClick={() => setFilterStage(filterStage === s.id ? "All" : s.id)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid", borderColor: filterStage === s.id ? s.color : "#334155", background: filterStage === s.id ? s.bg : "transparent", color: filterStage === s.id ? s.color : "#64748b", cursor: "pointer", fontSize: 11 }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Count summary */}
      {(manualCount > 0 || aiCount > 0) && (
        <div style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 11, color: "#475569" }}>
          {manualCount > 0 && <span>{manualCount} tracked tender{manualCount > 1 ? "s" : ""}</span>}
          {aiCount > 0 && <span style={{ color: "#818cf8" }}>+ {aiCount} AI-detected</span>}
        </div>
      )}

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {filtered.map((t) => {
          // ── AI-detected tender card ──
          if (t._type === "ai") {
            const sc = SCORE_COLOR(t.score);
            const stage = ERP_STAGE_LABEL[t.erp_stage] || ERP_STAGE_LABEL["unknown"];
            return (
              <div key={t.id} style={{ background: "#0f1729", border: "1px solid #312e81", borderLeft: "3px solid #6366f1", borderRadius: 10, padding: "13px 17px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
                    <span style={{ background: "rgba(99,102,241,0.25)", color: "#a5b4fc", borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em" }}>🤖 AI</span>
                    <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>{sc.label} {t.score}/10</span>
                    <StatusBadge status={t.status} />
                    {stage.label && <span style={{ background: stage.bg, color: stage.color, borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 600 }}>{stage.label}</span>}
                    <span style={{ background: "rgba(71,85,105,0.15)", color: "#475569", borderRadius: 20, padding: "2px 8px", fontSize: 10 }}>{t.source}</span>
                    <span style={{ color: "#334155", fontSize: 10, marginLeft: "auto" }}>{t.published}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9", marginBottom: 2 }}>{t.org}</div>
                  <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>{t.title}</div>
                  {t.scoreReason && (
                    <div style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>💡 {t.scoreReason}</div>
                  )}
                  {t.buyer_intel && (
                    <div style={{ marginTop: 5, background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 6, padding: "5px 9px", fontSize: 11 }}>
                      <span style={{ color: "#a855f7", fontWeight: 700 }}>🔍 Current ERP: </span>
                      <span style={{ color: "#c4b5fd" }}>{t.buyer_intel.current_erp || "Unknown"}</span>
                      {t.buyer_intel.contract_expiry && t.buyer_intel.contract_expiry !== "Unknown" && (
                        <span style={{ color: "#f59e0b", fontWeight: 600 }}> | expires {t.buyer_intel.contract_expiry}</span>
                      )}
                      {t.buyer_intel.notes && (
                        <span style={{ color: "#7c3aed" }}> — {t.buyer_intel.notes}</span>
                      )}
                    </div>
                  )}
                  {t.contacts?.length > 0 && (
                    <div style={{ marginTop: 8, borderTop: "1px solid #1e293b", paddingTop: 8 }}>
                      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>DECISION MAKERS</div>
                      {t.contacts.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(99,102,241,0.2)", color: "#a5b4fc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                            {c.name.split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                            <span style={{ color: "#64748b", fontSize: 11 }}> — {c.title}</span>
                          </div>
                          {c.linkedin_url && (
                            <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ background: "#0077b5", color: "white", padding: "2px 8px", borderRadius: 4, fontSize: 10, textDecoration: "none", fontWeight: 700 }}>in</a>
                          )}
                          {c.email_pattern && (
                            <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(c.email_pattern); alert("Copied: " + c.email_pattern); }} title={c.email_pattern} style={{ background: "transparent", border: "1px solid #334155", color: "#64748b", padding: "2px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>✉</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => onTrackSignal(t)}
                    style={{ background: "rgba(99,102,241,0.2)", border: "1px solid #4338ca", color: "#a5b4fc", padding: "6px 14px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.35)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.2)")}
                  >
                    Track →
                  </button>
                  {t.url && (
                    <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ background: "transparent", border: "1px solid #334155", color: "#64748b", padding: "5px 11px", borderRadius: 7, textDecoration: "none", fontSize: 11, textAlign: "center" }}>Open →</a>
                  )}
                </div>
              </div>
            );
          }

          // ── Manual tracked tender card ──
          const tr = tracking[t.id] || {};
          const stage = PIPELINE_STAGES.find((s) => s.id === (tr.stage || "watching")) || PIPELINE_STAGES[0];
          const secColor = SECTOR_COLORS[t.sector] || "#6366f1";
          const deadline = tr.deadline || t.deadline;
          return (
            <div
              key={t.id}
              onClick={() => onOpen(t)}
              style={{ background: "#111827", border: "1px solid #1e293b", borderLeft: `3px solid ${secColor}`, borderRadius: 10, padding: "13px 17px", display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#131f35")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#111827")}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
                  <StatusBadge status={t.status} />
                  <span style={{ background: `${secColor}22`, color: secColor, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>{t.sector}</span>
                  <span style={{ background: stage.bg, color: stage.color, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>{stage.icon} {stage.label}</span>
                  {deadline && <DeadlineBadge deadline={deadline} />}
                  {tr.bookmarked && <span style={{ color: "#fbbf24", fontSize: 13 }}>★</span>}
                  {t.value !== "TBC" && <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700 }}>💰 {t.value}</span>}
                  <span style={{ color: "#475569", fontSize: 11, marginLeft: "auto" }}>{t.published}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9", marginBottom: 2 }}>{t.org}</div>
                <div style={{ color: "#94a3b8", fontSize: 12 }}>{t.title}</div>
                {tr.myNotes && (
                  <div style={{ color: "#475569", fontSize: 11, marginTop: 4, fontStyle: "italic" }}>📝 {tr.myNotes.slice(0, 90)}{tr.myNotes.length > 90 ? "…" : ""}</div>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "#475569", padding: 48, fontSize: 14 }}>No tenders match your filters.</div>
        )}
      </div>

      <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, fontSize: 11, color: "#6366f1" }}>
        💡 <strong>Click any tracked tender</strong> to set pipeline stage, add notes & deadline. <strong>🤖 AI tenders</strong> are auto-detected every 6h — click <strong>Track →</strong> to add to your pipeline.
      </div>
    </div>
  );
}

// ─── Tab: Pipeline CRM ────────────────────────────────────────────────────────

function TabPipeline({ tenders, tracking, onOpen, onUpdateTracking }) {
  const grouped = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage.id] = tenders.filter((t) => (tracking[t.id]?.stage || "watching") === stage.id);
    return acc;
  }, {});

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage.id} style={{ background: stage.bg, border: `1px solid ${stage.color}44`, borderRadius: 10, padding: "10px 14px", flex: "1 1 70px", minWidth: 70, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: stage.color }}>{grouped[stage.id].length}</div>
            <div style={{ fontSize: 9, color: stage.color, marginTop: 2, opacity: 0.85 }}>{stage.icon} {stage.label}</div>
          </div>
        ))}
      </div>

      {/* Kanban columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage.id} style={{ background: "#0d1525", border: `1px solid ${stage.color}33`, borderTop: `2px solid ${stage.color}`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <span style={{ fontSize: 15 }}>{stage.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: stage.color }}>{stage.label}</span>
              <span style={{ marginLeft: "auto", background: `${stage.color}22`, color: stage.color, borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{grouped[stage.id].length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {grouped[stage.id].map((t) => {
                const tr = tracking[t.id] || {};
                const deadline = tr.deadline || t.deadline;
                const secColor = SECTOR_COLORS[t.sector] || "#6366f1";
                return (
                  <div key={t.id} onClick={() => onOpen(t)} style={{ background: "#111827", border: "1px solid #1e293b", borderLeft: `2px solid ${secColor}`, borderRadius: 8, padding: "10px 11px", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#131f35")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#111827")}
                  >
                    <div style={{ display: "flex", gap: 5, marginBottom: 5, flexWrap: "wrap" }}>
                      <span style={{ background: `${secColor}22`, color: secColor, borderRadius: 20, padding: "1px 8px", fontSize: 10, fontWeight: 600 }}>{t.sector}</span>
                      {deadline && <DeadlineBadge deadline={deadline} />}
                      {tr.bookmarked && <span style={{ color: "#fbbf24" }}>★</span>}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>{t.org}</div>
                    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>{t.title.slice(0, 65)}{t.title.length > 65 ? "…" : ""}</div>
                    {tr.myNotes && <div style={{ fontSize: 10, color: "#475569", marginTop: 5, fontStyle: "italic" }}>📝 {tr.myNotes.slice(0, 55)}…</div>}
                    {/* Quick move buttons */}
                    <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                      {PIPELINE_STAGES.filter((s) => s.id !== stage.id).map((s) => (
                        <button
                          key={s.id}
                          onClick={(e) => { e.stopPropagation(); onUpdateTracking(t.id, { stage: s.id }); }}
                          title={`Move to ${s.label}`}
                          style={{ background: "transparent", border: `1px solid ${s.color}44`, color: s.color, borderRadius: 4, padding: "2px 6px", cursor: "pointer", fontSize: 10, lineHeight: 1.4 }}
                        >
                          → {s.icon}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {grouped[stage.id].length === 0 && (
                <div style={{ textAlign: "center", color: "#334155", fontSize: 11, padding: "14px 0" }}>—</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Sources ─────────────────────────────────────────────────────────────

function TabSources({ copied, onCopy }) {
  const [sourceFilter, setSourceFilter] = useState("All");
  const types = ["All", "Official Portal", "Aggregator", "Regional", "eProcurement", "Sector", "Paid Aggregator", "Social Signal", "Press"];
  const filtered = SOURCES.filter((s) => sourceFilter === "All" || s.type === sourceFilter);

  return (
    <div>
      <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>
        {types.map((t) => (
          <button key={t} onClick={() => setSourceFilter(t)} style={{ padding: "6px 11px", borderRadius: 6, border: "1px solid", borderColor: sourceFilter === t ? "#6366f1" : "#334155", background: sourceFilter === t ? "rgba(99,102,241,0.15)" : "transparent", color: sourceFilter === t ? "#a5b4fc" : "#64748b", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>{t}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {filtered.map((s) => (
          <div key={s.id} style={{ background: "#111827", border: "1px solid #1e293b", borderTop: `2px solid ${s.color}`, borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.type}</div>
              </div>
              <span style={{ background: `${s.color}22`, color: s.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{s.badge}</span>
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>{s.desc}</div>
            <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", background: `${s.color}18`, border: `1px solid ${s.color}55`, color: s.color, padding: "7px 12px", borderRadius: 7, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>Open Portal →</a>
              <button onClick={() => onCopy(s.url, s.id)} style={{ background: "#1e293b", border: "1px solid #334155", color: copied === s.id ? "#16a34a" : "#64748b", padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12 }}>{copied === s.id ? "✓" : "📋"}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Quick Links ─────────────────────────────────────────────────────────

function TabQuickLinks({ copied, onCopy }) {
  return (
    <div>
      <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 18, fontStyle: "italic" }}>Pre-built search URLs — click to open directly, or copy to bookmark.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {SEARCH_QUERIES.map((q, i) => (
          <div key={i} style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 10, padding: "13px 17px", display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap" }}>
            <div style={{ width: 27, height: 27, borderRadius: "50%", background: "rgba(99,102,241,0.15)", border: "1px solid #4338ca", display: "flex", alignItems: "center", justifyContent: "center", color: "#a5b4fc", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#f1f5f9", marginBottom: 2 }}>{q.label}</div>
              <div style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.url}</div>
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <a href={q.url} target="_blank" rel="noopener noreferrer" style={{ background: "rgba(99,102,241,0.12)", border: "1px solid #4338ca", color: "#a5b4fc", padding: "6px 13px", borderRadius: 7, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>Open →</a>
              <button onClick={() => onCopy(q.url, `q${i}`)} style={{ background: "#1e293b", border: "1px solid #334155", color: copied === `q${i}` ? "#16a34a" : "#64748b", padding: "6px 11px", borderRadius: 7, cursor: "pointer", fontSize: 12 }}>{copied === `q${i}` ? "✓ Copied" : "📋 Copy"}</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22, background: "#111827", border: "1px solid #1e293b", borderRadius: 10, padding: 18 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#e2e8f0", fontWeight: 700 }}>🔑 Key CPV Codes to Search on Find a Tender</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))", gap: 7 }}>
          {CPV_CODES.map((c) => (
            <div key={c.code} style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 7, padding: "8px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontFamily: "monospace", color: "#a5b4fc", fontSize: 13, fontWeight: 700 }}>{c.code}</div>
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{c.label}</div>
              </div>
              <button onClick={() => onCopy(c.code, c.code)} style={{ background: "none", border: "none", color: copied === c.code ? "#16a34a" : "#475569", cursor: "pointer", fontSize: 13 }}>{copied === c.code ? "✓" : "📋"}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Frameworks ──────────────────────────────────────────────────────────

function TabFrameworks({ frameworkStatus, onUpdate }) {
  const PRIORITY_COLOR = { High: "#dc2626", Medium: "#f59e0b", Low: "#64748b" };
  const registeredCount = FRAMEWORKS.filter((f) => frameworkStatus[f.id]?.registered).length;

  return (
    <div>
      {/* Progress */}
      <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 10, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Framework Registration Progress</div>
          <div style={{ background: "#1e293b", borderRadius: 20, height: 7, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(90deg, #6366f1, #0ea5e9)", height: "100%", width: `${(registeredCount / FRAMEWORKS.length) * 100}%`, borderRadius: 20, transition: "width 0.4s" }} />
          </div>
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#6366f1" }}>{registeredCount}/{FRAMEWORKS.length}</div>
          <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Registered</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {FRAMEWORKS.map((f) => {
          const fs = frameworkStatus[f.id] || {};
          const isReg = !!fs.registered;
          return (
            <div key={f.id} style={{ background: "#111827", border: `1px solid ${isReg ? "#16a34a44" : "#1e293b"}`, borderLeft: `3px solid ${isReg ? "#16a34a" : PRIORITY_COLOR[f.priority]}`, borderRadius: 10, padding: "15px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
                {/* Checkbox */}
                <button
                  onClick={() => onUpdate(f.id, { ...fs, registered: !isReg, registeredDate: !isReg ? new Date().toISOString().split("T")[0] : undefined })}
                  style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${isReg ? "#16a34a" : "#334155"}`, background: isReg ? "#16a34a" : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 14, marginTop: 1 }}
                >
                  {isReg ? "✓" : ""}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: isReg ? "#86efac" : "#f1f5f9" }}>{f.name}</span>
                    <span style={{ background: `${PRIORITY_COLOR[f.priority]}22`, color: PRIORITY_COLOR[f.priority], borderRadius: 20, padding: "1px 9px", fontSize: 10, fontWeight: 700 }}>{f.priority}</span>
                    {isReg && <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 20, padding: "1px 9px", fontSize: 10, fontWeight: 700 }}>✓ Registered</span>}
                    {isReg && fs.registeredDate && <span style={{ color: "#475569", fontSize: 11 }}>since {fs.registeredDate}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>{f.fullName}</div>
                  <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>{f.desc}</div>
                  <div style={{ marginTop: 9 }}>
                    <input
                      value={fs.notes || ""}
                      onChange={(e) => onUpdate(f.id, { ...fs, notes: e.target.value })}
                      placeholder="Notes: expiry date, contact, reference number…"
                      style={{ background: "#0a0f1e", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#e2e8f0", fontSize: 12, width: "100%", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                </div>
                <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, background: "rgba(99,102,241,0.10)", border: "1px solid #4338ca", color: "#a5b4fc", padding: "6px 12px", borderRadius: 7, textDecoration: "none", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>Register →</a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: Strategy ────────────────────────────────────────────────────────────

function TabStrategy() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
      {STRATEGY_CARDS.map((card, i) => (
        <div key={i} style={{ background: "#111827", border: "1px solid #1e293b", borderTop: `2px solid ${card.color}`, borderRadius: 10, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
            <span style={{ fontSize: 19 }}>{card.icon}</span>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: card.color }}>{card.title}</h3>
          </div>
          <ol style={{ margin: 0, paddingLeft: 17, display: "flex", flexDirection: "column", gap: 7 }}>
            {card.steps.map((step, j) => (
              <li key={j} style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.5 }}>{step}</li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: AI Signals ─────────────────────────────────────────────────────────

const SCORE_COLOR = (score) => {
  if (score >= 9) return { color: "#dc2626", bg: "rgba(220,38,38,0.15)", label: "🔥 Hot" };
  if (score >= 7) return { color: "#f59e0b", bg: "rgba(245,158,11,0.15)", label: "⭐ Strong" };
  if (score >= 5) return { color: "#3b82f6", bg: "rgba(59,130,246,0.15)", label: "📡 Signal" };
  return { color: "#64748b", bg: "rgba(100,116,139,0.1)", label: "📭 Weak" };
};

const ERP_STAGE_LABEL = {
  "awareness":     { label: "Awareness",      color: "#64748b", bg: "rgba(100,116,139,0.1)" },
  "pre-market":    { label: "Pre-Market",      color: "#a855f7", bg: "rgba(168,85,247,0.12)" },
  "selection":     { label: "Selection",       color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  "active-tender": { label: "🎯 Active Tender", color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
  "implementation":{ label: "Implementation",  color: "#16a34a", bg: "rgba(22,163,74,0.12)"  },
  "unknown":       { label: null,              color: null,      bg: null                    },
};

function BackendStatusWidget({ status, onTriggerScan, loading }) {
  const isRunning = status?.scan?.running;
  const lastRun = status?.scan?.last_run;
  const signalsFound = status?.scan?.signals_found || 0;
  const intervalH = status?.interval_hours || 6;
  const error = status?.scan?.error;

  const lastRunLabel = lastRun
    ? new Date(lastRun).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Never";

  return (
    <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: loading ? "#94a3b8" : error ? "#dc2626" : isRunning ? "#f59e0b" : "#16a34a", display: "inline-block", boxShadow: isRunning ? "0 0 6px #f59e0b" : "none" }} />
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          {loading ? "Connecting…" : error ? "Error" : isRunning ? "Scanning…" : "Ready"}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "#475569" }}>Last scan: <span style={{ color: "#94a3b8" }}>{lastRunLabel}</span></div>
      {!loading && !error && <div style={{ fontSize: 11, color: "#475569" }}>Found: <span style={{ color: "#16a34a", fontWeight: 700 }}>{signalsFound}</span> signals</div>}
      {!loading && !error && <div style={{ fontSize: 11, color: "#475569" }}>Auto-scan every <span style={{ color: "#94a3b8" }}>{intervalH}h</span></div>}
      {error && <div style={{ fontSize: 11, color: "#dc2626", flex: 1 }}>⚠ {error.slice(0, 80)}</div>}
      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        {loading && (
          <div style={{ fontSize: 11, color: "#475569", padding: "6px 12px" }}>
            Start backend: <code style={{ color: "#6366f1" }}>cd backend && python main.py</code>
          </div>
        )}
        <button
          onClick={onTriggerScan}
          disabled={isRunning || loading}
          style={{ background: isRunning ? "transparent" : "rgba(99,102,241,0.15)", border: "1px solid #4338ca", color: isRunning ? "#475569" : "#a5b4fc", padding: "6px 14px", borderRadius: 7, cursor: isRunning ? "default" : "pointer", fontSize: 12, fontWeight: 600, opacity: isRunning ? 0.5 : 1 }}
        >
          {isRunning ? "⏳ Scanning…" : "▶ Scan Now"}
        </button>
      </div>
    </div>
  );
}


function EmailDraftModal({ signal, contactIdx, onClose }) {
  const contact = (signal.contacts || [])[contactIdx] || null;
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/email/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal_id: signal.id, contact_idx: contactIdx }),
    })
      .then((r) => r.json())
      .then((d) => { setEmail(d.email || "Could not generate email."); setLoading(false); })
      .catch(() => { setEmail("Error generating email. Check OPENAI_API_KEY."); setLoading(false); });
  }, []);

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>✉ Draft Outreach Email</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
              {signal.org}{contact ? ` → ${contact.name} (${contact.title})` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#475569" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
            <div>Generating personalised email with GPT-4o-mini…</div>
          </div>
        ) : (
          <>
            <textarea
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", minHeight: 260, background: "#0a0f1e", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 8, padding: "12px 14px", fontSize: 12, fontFamily: "monospace", lineHeight: 1.7, resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
              <button
                onClick={() => { navigator.clipboard.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ flex: 1, background: copied ? "rgba(22,163,74,0.2)" : "rgba(99,102,241,0.15)", border: "1px solid " + (copied ? "#16a34a" : "#4338ca"), color: copied ? "#4ade80" : "#a5b4fc", padding: "9px 0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                {copied ? "✓ Copied!" : "📋 Copy to Clipboard"}
              </button>
              {contact && contact.email_pattern && (
                <a
                  href={"mailto:" + contact.email_pattern + "?subject=ERP%20Procurement%20Discussion"}
                  style={{ flex: 1, background: "rgba(14,165,233,0.12)", border: "1px solid #0ea5e9", color: "#7dd3fc", padding: "9px 0", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600, textAlign: "center", display: "block" }}
                >
                  📧 Open in Mail
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}

function SignalCard({ signal, onConvert }) {
  const sc = SCORE_COLOR(signal.score);
  const secColor = SECTOR_COLORS[signal.sector] || "#6366f1";
  const stage = ERP_STAGE_LABEL[signal.erp_stage] || ERP_STAGE_LABEL["unknown"];
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ background: "#111827", border: "1px solid #1e293b", borderLeft: `3px solid ${sc.color}`, borderRadius: 10, padding: "13px 17px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 6, alignItems: "center" }}>
            <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
              {sc.label} {signal.score}/10
            </span>
            <span style={{ background: `${secColor}22`, color: secColor, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>{signal.sector}</span>
            {stage.label && (
              <span style={{ background: stage.bg, color: stage.color, borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 600 }}>{stage.label}</span>
            )}
            <span style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc", borderRadius: 20, padding: "2px 9px", fontSize: 10 }}>{signal.source}</span>
            {signal.converted === 1 && <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>✓ Converted</span>}
            <span style={{ color: "#334155", fontSize: 10, marginLeft: "auto" }}>{signal.published || signal.detected_at?.slice(0, 10)}</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9", marginBottom: 2 }}>{signal.org || "—"}</div>
          <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>{signal.title}</div>
          {signal.score_reason && (
            <div style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>💡 {signal.score_reason}</div>
          )}
          {signal.buyer_intel && (
            <div style={{ marginTop: 5, background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 6, padding: "5px 9px", fontSize: 11 }}>
              <span style={{ color: "#a855f7", fontWeight: 700 }}>🔍 Current ERP: </span>
              <span style={{ color: "#c4b5fd" }}>{signal.buyer_intel.current_erp || "Unknown"}</span>
              {signal.buyer_intel.contract_expiry && signal.buyer_intel.contract_expiry !== "Unknown" && (
                <span style={{ color: "#f59e0b", fontWeight: 600 }}> | expires {signal.buyer_intel.contract_expiry}</span>
              )}
              {signal.buyer_intel.notes && (
                <span style={{ color: "#7c3aed" }}> — {signal.buyer_intel.notes}</span>
              )}
            </div>
          )}

          {signal.contacts?.length > 0 && (
            <div style={{ marginTop: 8, borderTop: "1px solid #1e293b", paddingTop: 8 }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>DECISION MAKERS</div>
              {signal.contacts.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(99,102,241,0.2)", color: "#a5b4fc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                    {c.name.split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                    <span style={{ color: "#64748b", fontSize: 11 }}> — {c.title}</span>
                  </div>
                  {c.linkedin_url && (
                    <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ background: "#0077b5", color: "white", padding: "2px 8px", borderRadius: 4, fontSize: 10, textDecoration: "none", fontWeight: 700 }}>in</a>
                  )}
                  {c.email_pattern && (
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(c.email_pattern); alert("Copied: " + c.email_pattern); }}
                      title={c.email_pattern}
                      style={{ background: "transparent", border: "1px solid #334155", color: "#64748b", padding: "2px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}
                    >✉</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {signal.keywords?.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
              {signal.keywords.slice(0, 6).map((kw) => (
                <span key={kw} style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#6366f1", borderRadius: 4, padding: "1px 7px", fontSize: 10 }}>{kw}</span>
              ))}
            </div>
          )}
          {expanded && signal.summary && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", lineHeight: 1.6, background: "#0a0f1e", borderRadius: 7, padding: "8px 11px" }}>
              {signal.summary}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          {signal.url && (
            <a href={signal.url} target="_blank" rel="noopener noreferrer" style={{ background: "rgba(99,102,241,0.1)", border: "1px solid #4338ca", color: "#a5b4fc", padding: "5px 11px", borderRadius: 7, textDecoration: "none", fontSize: 11, fontWeight: 600, textAlign: "center" }}>→ Open</a>
          )}
          {signal.converted !== 1 && (
            <button
              onClick={() => onConvert(signal)}
              style={{ background: "rgba(22,163,74,0.12)", border: "1px solid #16a34a44", color: "#4ade80", padding: "5px 11px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600 }}
            >
              + Add to Tracker
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ background: "transparent", border: "1px solid #334155", color: "#475569", padding: "4px 10px", borderRadius: 7, cursor: "pointer", fontSize: 10 }}
          >
            {expanded ? "▲ Less" : "▼ More"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabSignals({ onConvertSignal }) {
  const [signals, setSignals] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [minScore, setMinScore] = useState(5);
  const [filterSource, setFilterSource] = useState("All");
  const [filterSector, setFilterSector] = useState("All");

  const fetchSignals = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/signals?min_score=${minScore}&limit=200`);
      if (resp.ok) {
        const data = await resp.json();
        setSignals(data.signals || []);
      }
    } catch {}
  }, [minScore]);

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/status`);
      if (resp.ok) {
        const data = await resp.json();
        setStatus(data);
        setLoading(false);
      }
    } catch {
      setLoading(true);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchSignals();
    const interval = setInterval(() => { fetchStatus(); fetchSignals(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchSignals]);

  const triggerScan = async () => {
    try {
      await fetch(`${API_BASE}/api/scan`, { method: "POST" });
      setTimeout(fetchStatus, 2000);
    } catch {}
  };

  const handleConvert = async (signal) => {
    try {
      await fetch(`${API_BASE}/api/signals/${signal.id}/convert`, { method: "POST" });
      onConvertSignal(signal);
      fetchSignals();
    } catch {
      onConvertSignal(signal);
    }
  };

  const sources = ["All", ...new Set(signals.map((s) => s.source))];
  const sectors = ["All", ...new Set(signals.map((s) => s.sector).filter(Boolean))];

  const filtered = signals.filter((s) => {
    if (filterSource !== "All" && s.source !== filterSource) return false;
    if (filterSector !== "All" && s.sector !== filterSector) return false;
    return true;
  });

  const hotCount = signals.filter((s) => s.score >= 9).length;
  const strongCount = signals.filter((s) => s.score >= 7 && s.score < 9).length;

  return (
    <div>
      <BackendStatusWidget status={status} onTriggerScan={triggerScan} loading={loading} />

      {/* Stats */}
      {!loading && signals.length > 0 && (
        <div style={{ display: "flex", gap: 9, marginBottom: 18, flexWrap: "wrap" }}>
          {[
            { label: "Total Signals", value: signals.length, color: "#6366f1" },
            { label: "🔥 Hot (9-10)", value: hotCount, color: "#dc2626" },
            { label: "⭐ Strong (7-8)", value: strongCount, color: "#f59e0b" },
            { label: "Showing", value: filtered.length, color: "#475569" },
          ].map((s) => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 13px", textAlign: "center", flex: "1 1 80px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#475569" }}>Min score:</span>
          {[4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} onClick={() => setMinScore(n)} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid", borderColor: minScore === n ? "#6366f1" : "#334155", background: minScore === n ? "rgba(99,102,241,0.2)" : "transparent", color: minScore === n ? "#a5b4fc" : "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{n}</button>
          ))}
        </div>
        <span style={{ width: 1, background: "#334155", alignSelf: "stretch" }} />
        {sources.map((s) => (
          <button key={s} onClick={() => setFilterSource(s)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid", borderColor: filterSource === s ? "#0ea5e9" : "#334155", background: filterSource === s ? "rgba(14,165,233,0.1)" : "transparent", color: filterSource === s ? "#7dd3fc" : "#64748b", cursor: "pointer", fontSize: 11 }}>{s}</button>
        ))}
        <span style={{ width: 1, background: "#334155", alignSelf: "stretch" }} />
        {sectors.map((s) => (
          <button key={s} onClick={() => setFilterSector(s)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid", borderColor: filterSector === s ? "#10b981" : "#334155", background: filterSector === s ? "rgba(16,185,129,0.1)" : "transparent", color: filterSector === s ? "#34d399" : "#64748b", cursor: "pointer", fontSize: 11 }}>{s}</button>
        ))}
      </div>

      {/* Signal list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#334155" }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🤖</div>
          <div style={{ fontSize: 15, color: "#475569", marginBottom: 10 }}>Backend not running</div>
          <div style={{ fontSize: 13, color: "#334155", marginBottom: 20 }}>Start the intelligence backend to auto-scan for ERP signals</div>
          <div style={{ background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 8, padding: "14px 20px", display: "inline-block", textAlign: "left" }}>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>Start the backend:</div>
            <code style={{ fontSize: 12, color: "#6366f1", display: "block" }}>cd backend</code>
            <code style={{ fontSize: 12, color: "#6366f1", display: "block" }}>pip install -r requirements.txt</code>
            <code style={{ fontSize: 12, color: "#6366f1", display: "block" }}>python main.py</code>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((signal) => (
            <SignalCard key={signal.id} signal={signal} onConvert={handleConvert} />
          ))}
          {filtered.length === 0 && signals.length === 0 && (
            <div style={{ textAlign: "center", color: "#475569", padding: 48, fontSize: 14 }}>
              No signals yet — click <strong>▶ Scan Now</strong> to start the first scan.
            </div>
          )}
          {filtered.length === 0 && signals.length > 0 && (
            <div style={{ textAlign: "center", color: "#475569", padding: 32, fontSize: 14 }}>No signals match your filters.</div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, fontSize: 11, color: "#6366f1" }}>
        🤖 <strong>AI-powered signals</strong> scraped from Contracts Finder, Find a Tender, BidStats, Google News & more. Scored by GPT-4o-mini for ERP relevance. Auto-scans every {status?.interval_hours || 6}h. Click <strong>+ Add to Tracker</strong> to convert any signal into a tracked tender.
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

// ─── Main App ─────────────────────────────────────────────────────────────────

export default 
function TabAccounts() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [emailDraft, setEmailDraft] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(API_BASE + "/api/signals?limit=500&min_score=5")
      .then((r) => r.json())
      .then((d) => { setSignals(Array.isArray(d) ? d : (d.signals || [])); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const accounts = useMemo(() => {
    const map = {};
    for (const s of signals) {
      const org = (s.org || "").trim() || s.source || "";
      if (!org || org.length < 3) continue;
      if (!map[org]) map[org] = { org, signals: [], maxScore: 0, contacts: [], buyer_intel: null };
      map[org].signals.push(s);
      if (s.score > map[org].maxScore) {
        map[org].maxScore = s.score;
        if (s.buyer_intel) map[org].buyer_intel = s.buyer_intel;
      }
      for (const c of (s.contacts || [])) {
        if (!map[org].contacts.find((x) => x.name === c.name)) map[org].contacts.push(c);
      }
    }
    return Object.values(map).sort((a, b) => b.maxScore - a.maxScore || b.signals.length - a.signals.length);
  }, [signals]);

  const filtered = search ? accounts.filter((a) => a.org.toLowerCase().includes(search.toLowerCase())) : accounts;

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>Loading account intelligence…</div>;

  return (
    <div>
      {emailDraft && <EmailDraftModal signal={emailDraft.signal} contactIdx={emailDraft.contactIdx} onClose={() => setEmailDraft(null)} />}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Account Intelligence</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{filtered.length} organisations with ERP signals</div>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search organisation…"
          style={{ marginLeft: "auto", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 13px", color: "#e2e8f0", fontSize: 13, outline: "none", width: 240 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((acc) => {
          const scoreC = SCORE_COLOR(acc.maxScore);
          const intel = acc.buyer_intel || {};
          const isExp = expanded === acc.org;
          const topSig = acc.signals[0];
          return (
            <div key={acc.org} style={{ background: "#111827", border: "1px solid #1e293b", borderLeft: "3px solid " + scoreC.color, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 5, alignItems: "center" }}>
                      <span style={{ background: scoreC.bg, color: scoreC.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{scoreC.label} {acc.maxScore}/10</span>
                      <span style={{ background: "rgba(71,85,105,0.2)", color: "#94a3b8", borderRadius: 20, padding: "2px 9px", fontSize: 10 }}>{acc.signals.length} signal{acc.signals.length > 1 ? "s" : ""}</span>
                      {acc.contacts.length > 0 && <span style={{ background: "rgba(14,165,233,0.1)", color: "#7dd3fc", borderRadius: 20, padding: "2px 9px", fontSize: 10 }}>👤 {acc.contacts.length} contact{acc.contacts.length > 1 ? "s" : ""}</span>}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9", marginBottom: 3 }}>{acc.org}</div>
                    {intel.current_erp && intel.current_erp !== "Unknown" && (
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: "#a855f7", fontWeight: 600 }}>🔍 {intel.current_erp}</span>
                        {intel.contract_expiry && intel.contract_expiry !== "Unknown" && <span style={{ color: "#f59e0b", fontWeight: 600 }}> | expires {intel.contract_expiry}</span>}
                      </div>
                    )}
                    {intel.notes && <div style={{ fontSize: 11, color: "#475569", fontStyle: "italic", marginTop: 2 }}>{intel.notes}</div>}
                    {acc.contacts.slice(0, 2).map((c, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5 }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(99,102,241,0.2)", color: "#a5b4fc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>
                          {c.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: "#64748b", fontSize: 11 }}> — {c.title}</span>
                        {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ background: "#0077b5", color: "white", padding: "1px 7px", borderRadius: 4, fontSize: 10, textDecoration: "none", fontWeight: 700 }}>in</a>}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    {acc.contacts.length > 0 && topSig && (
                      <button onClick={() => setEmailDraft({ signal: topSig, contactIdx: 0 })}
                        style={{ background: "rgba(14,165,233,0.12)", border: "1px solid rgba(14,165,233,0.4)", color: "#7dd3fc", padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                        ✉ Start Outreach
                      </button>
                    )}
                    <button onClick={() => setExpanded(isExp ? null : acc.org)}
                      style={{ background: "transparent", border: "1px solid #334155", color: "#475569", padding: "6px 14px", borderRadius: 7, cursor: "pointer", fontSize: 11 }}>
                      {isExp ? "▲ Collapse" : "▼ " + acc.signals.length + " signals"}
                    </button>
                  </div>
                </div>
              </div>
              {isExp && (
                <div style={{ borderTop: "1px solid #1e293b", padding: "12px 18px", background: "#0a0f1e" }}>
                  <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>ALL SIGNALS</div>
                  {acc.signals.map((s, i) => {
                    const sc2 = SCORE_COLOR(s.score);
                    return (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: i < acc.signals.length - 1 ? "1px solid #1e293b" : "none" }}>
                        <span style={{ background: sc2.bg, color: sc2.color, borderRadius: 20, padding: "1px 8px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{s.score}/10</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                          <div style={{ fontSize: 10, color: "#475569" }}>{s.source} · {(s.published || (s.detected_at || "").slice(0, 10))}</div>
                        </div>
                        {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "#6366f1", fontSize: 12, textDecoration: "none", flexShrink: 0 }}>→</a>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function App() {
  const [tenders, setTenders] = useLocalStorage("erp_tenders", LIVE_TENDERS_INITIAL);
  const [tracking, setTracking] = useLocalStorage("erp_tracking", {});
  const [frameworkStatus, setFrameworkStatus] = useLocalStorage("erp_frameworks", {});

  const [activeTab, setActiveTab] = useState("tenders");
  const [scanRunning, setScanRunning] = useState(false);
  const [detailTender, setDetailTender] = useState(null);
  const [editTender, setEditTender] = useState(null); // null=closed | {}=new | tender=edit
  const [copied, setCopied] = useState(null);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const saveTender = (data) => {
    setTenders((prev) => {
      const idx = prev.findIndex((t) => t.id === data.id);
      return idx >= 0 ? prev.map((t) => (t.id === data.id ? data : t)) : [...prev, data];
    });
  };

  const deleteTender = (id) => {
    setTenders((prev) => prev.filter((t) => t.id !== id));
    setTracking((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const updateTracking = (tenderId, updates) => {
    setTracking((prev) => ({ ...prev, [tenderId]: { ...(prev[tenderId] || {}), ...updates } }));
  };

  const updateFramework = (id, data) => {
    setFrameworkStatus((prev) => ({ ...prev, [id]: data }));
  };

  // Header stats
  const activeTenders = tenders.filter((t) => t.status === "Active").length;
  const preMkt = tenders.filter((t) => t.status === "Pre-Market").length;
  const ittTenders = tenders.filter((t) => t.status === "ITT Stage").length;
  const inPipeline = tenders.filter((t) => tracking[t.id]?.stage && tracking[t.id].stage !== "watching").length;

  const convertSignalToTender = (signal) => {
    saveTender({
      id: Date.now(),
      org: signal.org || signal.source || "Unknown",
      title: signal.title,
      sector: signal.sector || "Other",
      status: "Active",
      value: "TBC",
      published: signal.published || signal.detected_at?.slice(0, 10) || "",
      url: signal.url || "",
      notes: `Auto-detected via AI scanner. Source: ${signal.source}. Score: ${signal.score}/10. ${signal.score_reason || ""}`.trim(),
      deadline: "",
      isCustom: true,
    });
    setActiveTab("tenders");
  };

  const trackSignal = async (aiItem) => {
    try {
      await fetch(`${API_BASE}/api/signals/${aiItem._signalId}/convert`, { method: "POST" });
    } catch {}
    saveTender({
      id: Date.now(),
      org: aiItem.org,
      title: aiItem.title,
      sector: aiItem.sector,
      status: aiItem.status,
      value: "TBC",
      published: aiItem.published,
      url: aiItem.url,
      notes: `🤖 AI Score: ${aiItem.score}/10 — ${aiItem.scoreReason || ""}`.trim(),
      deadline: "",
      isCustom: true,
    });
  };

  const TABS = [
    { id: "accounts", label: "🏢 Accounts" },
    { id: "signals", label: "🤖 AI Signals" },
    { id: "tenders", label: "📋 Tenders" },
    { id: "pipeline", label: "🎯 Pipeline" },
    { id: "sources", label: "🔗 Sources" },
    { id: "quicklinks", label: "⚡ Quick Links" },
    { id: "frameworks", label: "📋 Frameworks" },
    { id: "strategy", label: "🗺️ Strategy" },
  ];

  const triggerScanGlobal = async () => {
    if (scanRunning) return;
    setScanRunning(true);
    try { await fetch(API_BASE + "/api/scan", { method: "POST" }); } catch {}
    setTimeout(() => setScanRunning(false), 90000);
  };

    return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", fontFamily: "'Georgia', 'Times New Roman', serif", color: "#e2e8f0" }}>
      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)", borderBottom: "1px solid #1e293b", padding: "28px 32px 0", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 20% 50%, rgba(99,102,241,0.08) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(14,165,233,0.06) 0%, transparent 50%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
                <span style={{ fontSize: 20 }}>🇬🇧</span>
                <span style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#6366f1", fontFamily: "monospace", fontWeight: 600 }}>Intelligence Platform</span>
              </div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.02em" }}>UK ERP Tender Tracker</h1>
              <p style={{ margin: "5px 0 0", color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>Monitor public & private sector ERP procurement opportunities</p>
            </div>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              {[
                { label: "Active", value: activeTenders, color: "#16a34a" },
                { label: "Pre-Market", value: preMkt, color: "#ca8a04" },
                { label: "ITT Stage", value: ittTenders, color: "#3b82f6" },
                { label: "In Pipeline", value: inPipeline, color: "#6366f1" },
                { label: "Total", value: tenders.length, color: "#475569" },
              ].map((s) => (
                <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 13px", textAlign: "center", minWidth: 62 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <button onClick={triggerScanGlobal} disabled={scanRunning}
              style={{ alignSelf: "flex-start", background: scanRunning ? "rgba(245,158,11,0.1)" : "rgba(99,102,241,0.15)", border: "1px solid " + (scanRunning ? "#f59e0b" : "#4338ca"), color: scanRunning ? "#f59e0b" : "#a5b4fc", padding: "9px 18px", borderRadius: 9, cursor: scanRunning ? "default" : "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
              {scanRunning ? "⏳ Scanning…" : "▶ Scan Now"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 2, marginTop: 20, flexWrap: "wrap" }}>
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: "8px 14px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: activeTab === tab.id ? "#1e293b" : "transparent", color: activeTab === tab.id ? "#e2e8f0" : "#64748b", borderTop: activeTab === tab.id ? "2px solid #6366f1" : "2px solid transparent", transition: "all 0.15s" }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "22px 32px" }}>
        {activeTab === "accounts" && <TabAccounts />}
        {activeTab === "signals" && (
          <TabSignals onConvertSignal={convertSignalToTender} />
        )}
        {activeTab === "tenders" && (
          <TabTenders
            tenders={tenders}
            tracking={tracking}
            onOpen={(t) => setDetailTender(t)}
            onAdd={() => setEditTender({})}
            onExport={() => exportCSV(tenders, tracking)}
            onTrackSignal={trackSignal}
          />
        )}
        {activeTab === "pipeline" && (
          <TabPipeline
            tenders={tenders}
            tracking={tracking}
            onOpen={(t) => setDetailTender(t)}
            onUpdateTracking={updateTracking}
          />
        )}
        {activeTab === "sources" && <TabSources copied={copied} onCopy={copyToClipboard} />}
        {activeTab === "quicklinks" && <TabQuickLinks copied={copied} onCopy={copyToClipboard} />}
        {activeTab === "frameworks" && <TabFrameworks frameworkStatus={frameworkStatus} onUpdate={updateFramework} />}
        {activeTab === "strategy" && <TabStrategy />}
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: "1px solid #1e293b", padding: "14px 32px", textAlign: "center", color: "#334155", fontSize: 11, marginTop: 16 }}>
        Data sourced from find-tender.service.gov.uk, contractsfinder.service.gov.uk, bidstats.uk • Updated May 2026
      </div>

      {/* MODALS */}
      {detailTender && (
        <TenderDetailModal
          tender={detailTender}
          tracking={tracking}
          onUpdateTracking={updateTracking}
          onEdit={() => { setEditTender(detailTender); setDetailTender(null); }}
          onDelete={deleteTender}
          onClose={() => setDetailTender(null)}
        />
      )}
      {editTender !== null && (
        <TenderFormModal
          tender={editTender?.id ? editTender : null}
          onSave={saveTender}
          onClose={() => setEditTender(null)}
        />
      )}
    </div>
  );
}
