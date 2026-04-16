import { useState, useRef } from "react";

// Keys werden sicher aus Vercel Environment Variables geladen
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
const OPENAI_KEY = import.meta.env.VITE_OPENAI_KEY;

const KATEGORIEN = [
  { label: "Lauf-/Stellungsspiel", key: "lauf_stellungsspiel" },
  { label: "Zweikampfbeurteilung", key: "zweikampfbeurteilung" },
  { label: "Disziplinarkontrolle", key: "disziplinarkontrolle" },
  { label: "Abseits", key: "abseits" },
  { label: "Persönlichkeit", key: "persoenlichkeit" },
];

export default function SchiriCoachApp() {
  const [screen, setScreen] = useState("home");
  const [schiri, setSchiri] = useState("");
  const [datum, setDatum] = useState(new Date().toLocaleDateString("de-DE"));
  const [altersklasse, setAltersklasse] = useState("");
  const [liga, setLiga] = useState("");
  const [notizen, setNotizen] = useState([]);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [auswertung, setAuswertung] = useState(null);
  const [generating, setGenerating] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        await transkribiere(blob);
      };
      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      alert("Mikrofon-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      setProcessing(true);
    }
  };

  const transkribiere = async (blob) => {
    try {
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");
      formData.append("model", "whisper-1");
      formData.append("language", "de");

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
        body: formData,
      });

      const data = await res.json();
      const text = data.text?.trim();
      if (text) {
        setNotizen((prev) => [...prev, {
          id: Date.now(),
          text,
          zeit: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        }]);
      }
    } catch (err) {
      alert("Transkription fehlgeschlagen. Bitte nochmal versuchen.");
    } finally {
      setProcessing(false);
    }
  };

  const generiereAuswertung = async () => {
    setGenerating(true);
    const alleNotizen = notizen.map((n) => `[${n.zeit}] ${n.text}`).join("\n");

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `Du bist Assistent für einen Fußball-Schiedsrichter-Coach in Deutschland.
Analysiere folgende Coaching-Beobachtungen für Schiedsrichter ${schiri} (${altersklasse}, ${liga}) vom ${datum}.

Beobachtungen:
${alleNotizen}

Antworte NUR mit einem JSON-Objekt (kein Markdown):
{
  "schwierigkeitsgrad": "einfach oder erhöht oder schwierig",
  "administratives": "i.O. oder n.i.O.",
  "lauf_stellungsspiel": { "bewertung": "-- oder 0 oder + oder ++", "bemerkung": "2-3 Sätze professioneller Fließtext mit konkreten Spielszenen und Minutenangaben, entwicklungsorientiert" },
  "zweikampfbeurteilung": { "bewertung": "-- oder 0 oder + oder ++", "bemerkung": "2-3 Sätze" },
  "disziplinarkontrolle": { "bewertung": "-- oder 0 oder + oder ++", "bemerkung": "2-3 Sätze" },
  "abseits": { "bewertung": "-- oder 0 oder + oder ++", "bemerkung": "2-3 Sätze" },
  "persoenlichkeit": { "bewertung": "-- oder 0 oder + oder ++", "bemerkung": "2-3 Sätze" },
  "positiv_1": "Erste positive Erkenntnis als vollständiger Satz",
  "positiv_2": "Zweite positive Erkenntnis",
  "optimierung_1": "Erstes Optimierungspotential als vollständiger Satz",
  "optimierung_2": "Zweites Optimierungspotential",
  "gesamteindruck": "3-4 Sätze entwicklungsorientierter Gesamteindruck"
}`
          }],
        }),
      });

      const data = await res.json();
      const text = data.content?.[0]?.text?.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text);
      setAuswertung(parsed);
      setScreen("auswertung");
    } catch (err) {
      alert("Auswertung fehlgeschlagen. Bitte nochmal versuchen.");
    } finally {
      setGenerating(false);
    }
  };

  const bewertungFarbe = (w) => {
    if (w === "++") return "#22c55e";
    if (w === "+") return "#86efac";
    if (w === "0") return "#fbbf24";
    if (w === "--") return "#ef4444";
    return "#94a3b8";
  };

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (screen === "home") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif", padding: "2rem" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div style={{ fontSize: "4rem" }}>⚽</div>
        <h1 style={{ color: "#f8fafc", fontSize: "2.5rem", margin: "0.25rem 0", letterSpacing: "-0.02em" }}>SchiriCoach</h1>
        <p style={{ color: "#64748b", fontSize: "0.95rem", margin: 0 }}>Coaching-Bewertungen per Sprache</p>
      </div>

      <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.5rem", padding: "2rem", width: "100%", maxWidth: "400px" }}>
        {[
          ["Name Schiedsrichter/in", schiri, setSchiri],
          ["Datum", datum, setDatum],
          ["Altersklasse (z.B. U15)", altersklasse, setAltersklasse],
          ["Liga (z.B. Kreisliga)", liga, setLiga],
        ].map(([ph, val, set]) => (
          <input key={ph} placeholder={ph} value={val} onChange={(e) => set(e.target.value)}
            style={{ width: "100%", padding: "0.85rem 1rem", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.75rem", color: "#f8fafc", fontSize: "1rem", fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box", marginBottom: "0.75rem" }}
          />
        ))}

        <button onClick={() => schiri && setScreen("session")}
          style={{ marginTop: "0.5rem", width: "100%", padding: "1rem", background: schiri ? "linear-gradient(135deg, #3b82f6, #1d4ed8)" : "#334155", color: "#fff", border: "none", borderRadius: "0.75rem", fontSize: "1.1rem", fontFamily: "Georgia, serif", cursor: schiri ? "pointer" : "not-allowed" }}>
          Sitzung starten →
        </button>
      </div>
    </div>
  );

  // ── SESSION ───────────────────────────────────────────────────────────────
  if (screen === "session") return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "Georgia, serif", color: "#f8fafc" }}>
      <div style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "1rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "1.1rem", fontWeight: "bold" }}>{schiri}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{datum} · {altersklasse} · {liga}</div>
        </div>
        <div style={{ background: "#1e3a5f", borderRadius: "2rem", padding: "0.3rem 0.8rem", fontSize: "0.85rem", color: "#93c5fd" }}>
          {notizen.length} Notiz{notizen.length !== 1 ? "en" : ""}
        </div>
      </div>

      <div style={{ padding: "1rem 1.5rem", maxHeight: "45vh", overflowY: "auto" }}>
        {notizen.length === 0 && (
          <div style={{ color: "#475569", textAlign: "center", padding: "3rem 0" }}>Noch keine Notizen – starte die Aufnahme!</div>
        )}
        {notizen.map((n) => (
          <div key={n.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "0.75rem", padding: "0.75rem 1rem", marginBottom: "0.5rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
            <span style={{ color: "#3b82f6", fontSize: "0.75rem", marginTop: "0.2rem", minWidth: "35px" }}>{n.zeit}</span>
            <span style={{ fontSize: "0.9rem", lineHeight: "1.5", color: "#cbd5e1", flex: 1 }}>{n.text}</span>
            <button onClick={() => setNotizen(prev => prev.filter(x => x.id !== n.id))} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "1.1rem" }}>×</button>
          </div>
        ))}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0f172a", borderTop: "1px solid rgba(255,255,255,0.08)", padding: "1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        {processing && <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>⏳ Transkribiere…</div>}

        <button
          onMouseDown={startRecording} onMouseUp={stopRecording}
          onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
          onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
          disabled={processing}
          style={{ width: "80px", height: "80px", borderRadius: "50%", background: recording ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #3b82f6, #1d4ed8)", border: "none", cursor: processing ? "not-allowed" : "pointer", fontSize: "2rem", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: recording ? "0 0 30px rgba(239,68,68,0.5)" : "0 0 20px rgba(59,130,246,0.3)", transform: recording ? "scale(1.1)" : "scale(1)", transition: "all 0.15s" }}>
          {recording ? "⏹" : "🎙️"}
        </button>

        <div style={{ fontSize: "0.75rem", color: "#475569" }}>
          {recording ? "Loslassen zum Stoppen" : "Halten zum Aufnehmen"}
        </div>

        {notizen.length >= 1 && (
          <button onClick={generiereAuswertung} disabled={generating}
            style={{ width: "100%", padding: "0.85rem", background: generating ? "#334155" : "linear-gradient(135deg, #059669, #047857)", color: "#fff", border: "none", borderRadius: "0.75rem", fontSize: "1rem", fontFamily: "Georgia, serif", cursor: generating ? "not-allowed" : "pointer" }}>
            {generating ? "⏳ Claude analysiert…" : "✅ Abschluss & Auswertung"}
          </button>
        )}
      </div>
    </div>
  );

  // ── AUSWERTUNG ────────────────────────────────────────────────────────────
  if (screen === "auswertung" && auswertung) return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "Georgia, serif", color: "#f8fafc", paddingBottom: "6rem" }}>
      <div style={{ background: "linear-gradient(135deg, #1e3a5f, #0f172a)", padding: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>AUSWERTUNG</div>
        <div style={{ fontSize: "1.3rem", fontWeight: "bold" }}>{schiri}</div>
        <div style={{ fontSize: "0.85rem", color: "#93c5fd" }}>{datum} · {altersklasse} · {liga}</div>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
          <span style={{ background: "#1e3a5f", color: "#93c5fd", borderRadius: "2rem", padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}>
            Schwierigkeit: {auswertung.schwierigkeitsgrad}
          </span>
          <span style={{ background: "#14532d", color: "#86efac", borderRadius: "2rem", padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}>
            Admin: {auswertung.administratives}
          </span>
        </div>
      </div>

      <div style={{ padding: "1rem 1.5rem" }}>

        {/* Bewertungsblöcke */}
        {KATEGORIEN.map(({ label, key }) => {
          const block = auswertung[key];
          if (!block) return null;
          return (
            <div key={key} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1rem", padding: "1rem", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: "bold", color: "#93c5fd" }}>{label}</div>
                <span style={{ background: bewertungFarbe(block.bewertung), color: "#000", borderRadius: "0.4rem", padding: "0.2rem 0.6rem", fontSize: "0.85rem", fontWeight: "bold" }}>
                  {block.bewertung}
                </span>
              </div>
              <p style={{ fontSize: "0.85rem", color: "#94a3b8", lineHeight: "1.6", margin: 0 }}>{block.bemerkung}</p>
            </div>
          );
        })}

        {/* Fazit */}
        <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "1rem", padding: "1rem", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: "bold", color: "#93c5fd", marginBottom: "0.75rem" }}>FAZIT</div>
          <div style={{ marginBottom: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>✅ POSITIV</div>
            <div style={{ fontSize: "0.85rem", color: "#86efac", lineHeight: "1.6" }}>
              1. {auswertung.positiv_1}<br />2. {auswertung.positiv_2}
            </div>
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>🎯 OPTIMIERUNG</div>
            <div style={{ fontSize: "0.85rem", color: "#fbbf24", lineHeight: "1.6" }}>
              1. {auswertung.optimierung_1}<br />2. {auswertung.optimierung_2}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>📋 GESAMTEINDRUCK</div>
            <div style={{ fontSize: "0.85rem", color: "#cbd5e1", lineHeight: "1.6" }}>{auswertung.gesamteindruck}</div>
          </div>
        </div>

        {/* Alle Notizen als Backup */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1rem", padding: "1rem", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: "bold", color: "#93c5fd", marginBottom: "0.75rem" }}>📝 ALLE NOTIZEN</div>
          {notizen.map((n) => (
            <div key={n.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "0.5rem", marginBottom: "0.5rem" }}>
              <span style={{ color: "#3b82f6", fontSize: "0.75rem", marginRight: "0.5rem" }}>{n.zeit}</span>
              <span style={{ fontSize: "0.85rem", color: "#94a3b8", lineHeight: "1.6" }}>{n.text}</span>
            </div>
          ))}
        </div>

      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0f172a", borderTop: "1px solid rgba(255,255,255,0.08)", padding: "1rem 1.5rem", display: "flex", gap: "0.75rem" }}>
        <button onClick={() => { setNotizen([]); setAuswertung(null); setScreen("home"); }}
          style={{ flex: 1, padding: "0.85rem", background: "rgba(255,255,255,0.05)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.75rem", fontSize: "0.9rem", fontFamily: "Georgia, serif", cursor: "pointer" }}>
          Neues Spiel
        </button>
        <button onClick={() => alert("Word-Export folgt im nächsten Schritt!")}
          style={{ flex: 2, padding: "0.85rem", background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", color: "#fff", border: "none", borderRadius: "0.75rem", fontSize: "0.9rem", fontFamily: "Georgia, serif", cursor: "pointer" }}>
          📄 Word-Bogen exportieren
        </button>
      </div>
    </div>
  );

  return null;
}
