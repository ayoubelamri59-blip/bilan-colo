import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { jsPDF } from "jspdf";
import {
  Sun, Utensils, Users, Heart, Wrench, MessageCircle, Moon, Sunrise,
  Tent, Sparkles, Lightbulb, ShieldCheck, ChevronLeft, ChevronRight, Check,
  Printer, Lock, Smile, RotateCcw, BarChart3, ListChecks, Share2, Plus, Trash2,
  ArrowUp, ArrowDown, Copy, Type, AlignLeft, Star, CircleDot, Calendar, Mail, Download
} from "lucide-react";

/* =========================================================================
   BILAN DE COLO — prise de température, questionnaire 100% personnalisable
   - Mode Jeune : formulaire pas à pas, généré depuis la config des questions
   - Mode Anim  : Rapport (adaptatif) · Questions (ajout/suppr/ordre) · Partager (QR)
   Données en mémoire ici. Pour Supabase : answers stocké en jsonb (voir chat).
   ========================================================================= */

const CODE_ANIM = "colo";

const today = new Date();
// date locale (et non UTC) pour éviter tout décalage d'un jour près de minuit
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const yesterday = iso(new Date(today.getTime() - 86400000));
const dayBefore = iso(new Date(today.getTime() - 2 * 86400000));
const frDate = (s) =>
  new Date(s + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });

const LVL = {
  5: { bg:"bg-emerald-100", ring:"ring-emerald-400", text:"text-emerald-700", bar:"bg-emerald-500" },
  4: { bg:"bg-lime-100",    ring:"ring-lime-400",    text:"text-lime-700",    bar:"bg-lime-500" },
  3: { bg:"bg-amber-100",   ring:"ring-amber-400",   text:"text-amber-700",   bar:"bg-amber-500" },
  2: { bg:"bg-orange-100",  ring:"ring-orange-400",  text:"text-orange-700",  bar:"bg-orange-500" },
  1: { bg:"bg-rose-100",    ring:"ring-rose-400",    text:"text-rose-700",    bar:"bg-rose-500" },
};
const GENERIC_SCALE = [
  { v:5, emoji:"🤩", label:"Au top" },
  { v:4, emoji:"😄", label:"Bien" },
  { v:3, emoji:"🙂", label:"Moyen" },
  { v:2, emoji:"😕", label:"Bof" },
  { v:1, emoji:"😩", label:"Nul" },
];
const EMOJIS = ["🤩","😍","🥳","😎","😄","😌","🙂","😐","😴","🥱","😬","😕","😞","😡","🤔","🫠"];

const ICONS = { Sun, Utensils, Users, Heart, Wrench, MessageCircle, Moon, Sunrise,
  Tent, Sparkles, Lightbulb, ShieldCheck, Smile, Star };
const TYPE_META = {
  rating:   { label:"Note /5",     icon: Star,      color:"text-amber-600" },
  emoji:    { label:"Emoji",       icon: Smile,     color:"text-pink-600" },
  choice:   { label:"Choix",       icon: CircleDot, color:"text-teal-600" },
  text:     { label:"Texte court", icon: Type,      color:"text-sky-600" },
  textlong: { label:"Texte long",  icon: AlignLeft, color:"text-indigo-600" },
};

// --- Questionnaire par défaut : couvre toute la journée de colo ---
const DEFAULT_QUESTIONS = [
  { id:"prenom", type:"text", title:"Ton prénom (ou laisse vide pour rester anonyme)", moment:"Toi", icon:"Smile", required:false },
  { id:"emoji", type:"emoji", title:"1 emoji pour résumer hier", moment:"Général", icon:"Smile", required:true },
  { id:"note_journee", type:"rating", title:"La journée en général", moment:"Général", icon:"Sun", required:true,
    scale:[{v:5,emoji:"🤩",label:"Incroyable"},{v:4,emoji:"😄",label:"Super"},{v:3,emoji:"🙂",label:"Sympa"},{v:2,emoji:"😕",label:"Bof"},{v:1,emoji:"😩",label:"Nul"}] },
  { id:"note_reveil", type:"rating", title:"Le réveil et le matin", moment:"Matin", icon:"Sunrise", required:false,
    scale:[{v:5,emoji:"😃",label:"En forme"},{v:4,emoji:"🙂",label:"Ça allait"},{v:3,emoji:"😐",label:"Moyen"},{v:2,emoji:"🥱",label:"Dur"},{v:1,emoji:"😩",label:"Trop tôt"}] },
  { id:"note_repas", type:"rating", title:"Les repas", moment:"Repas", icon:"Utensils", required:true,
    scale:[{v:5,emoji:"😋",label:"Un régal"},{v:4,emoji:"😀",label:"Très bon"},{v:3,emoji:"🙂",label:"Correct"},{v:2,emoji:"😕",label:"Bof"},{v:1,emoji:"🤢",label:"Pas bon"}] },
  { id:"note_activites", type:"rating", title:"Les activités", moment:"Activités", icon:"Sparkles", required:true,
    scale:[{v:5,emoji:"🤩",label:"Dingues"},{v:4,emoji:"😄",label:"Cool"},{v:3,emoji:"🙂",label:"Sympas"},{v:2,emoji:"😕",label:"Bof"},{v:1,emoji:"😴",label:"Ennuyeuses"}] },
  { id:"note_veillee", type:"rating", title:"La veillée du soir", moment:"Veillée", icon:"Moon", required:false,
    scale:[{v:5,emoji:"🥳",label:"La meilleure"},{v:4,emoji:"😄",label:"Très bien"},{v:3,emoji:"🙂",label:"Sympa"},{v:2,emoji:"😕",label:"Bof"},{v:1,emoji:"😴",label:"Pas ouf"}] },
  { id:"note_ambiance", type:"rating", title:"L'ambiance du groupe", moment:"Groupe", icon:"Users", required:true,
    scale:[{v:5,emoji:"🥳",label:"Au top"},{v:4,emoji:"😎",label:"Cool"},{v:3,emoji:"🙂",label:"Ça va"},{v:2,emoji:"😬",label:"Tendue"},{v:1,emoji:"😞",label:"Pas ouf"}] },
  { id:"note_sommeil", type:"rating", title:"Ta nuit et le dortoir", moment:"Nuit", icon:"Moon", required:false,
    scale:[{v:5,emoji:"😴",label:"Très bien dormi"},{v:4,emoji:"🙂",label:"Bien"},{v:3,emoji:"😐",label:"Bof"},{v:2,emoji:"🥱",label:"Mal dormi"},{v:1,emoji:"😣",label:"Nuit horrible"}] },
  { id:"bien_etre", type:"choice", title:"Tu t'es senti(e) bien hier ?", moment:"Groupe", icon:"ShieldCheck", required:true,
    options:["Oui, tranquille","Moyen","Pas trop — j'aimerais en parler à un anim"] },
  { id:"plus_aime", type:"text", title:"Ce que tu as préféré", moment:"Général", icon:"Heart", required:false },
  { id:"points_ameliorer", type:"textlong", title:"Un truc à améliorer ?", moment:"Général", icon:"Wrench", required:false },
  { id:"idee", type:"textlong", title:"Une idée d'activité ou de veillée", moment:"Général", icon:"Lightbulb", required:false },
  { id:"mot_equipe", type:"textlong", title:"Un mot pour les anims", moment:"Général", icon:"MessageCircle", required:false },
];


/* ----------------------------- Couche données ----------------------------- */
function useDb() {
  const [responses, setResponses] = useState([]);
  const [questions, setQuestions] = useState(DEFAULT_QUESTIONS);
  const [activeDate, setActiveDateState] = useState(yesterday);
  const [loading, setLoading] = useState(true);

  // chargement initial : config (questions + jour évalué) + réponses
  useEffect(() => {
    (async () => {
      const { data: cfg } = await supabase
        .from("config").select("questions, jour_actif").eq("id", 1).single();
      if (cfg?.questions) setQuestions(cfg.questions);
      if (cfg?.jour_actif) setActiveDateState(cfg.jour_actif);

      const { data: rows } = await supabase
        .from("reponses").select("*").order("created_at", { ascending: true });
      setResponses(rows || []);
      setLoading(false);
    })();
  }, []);

  // l'anim change la journée évaluée -> écrit sur le serveur, pas juste en local
  const setActiveDate = async (date) => {
    setActiveDateState(date);
    await supabase.from("config").update({ jour_actif: date }).eq("id", 1);
  };

  // l'anim modifie les questions -> écrit sur le serveur
  const setQuestionsAndSave = async (qs) => {
    setQuestions(qs);
    await supabase.from("config").update({ questions: qs }).eq("id", 1);
  };

  // un jeune envoie sa réponse : on relit jour_actif au dernier moment
  // (anti onglet resté ouvert depuis hier)
  const submitReponse = async (answers) => {
    const { data: cfg } = await supabase
      .from("config").select("jour_actif").eq("id", 1).single();
    const date = cfg?.jour_actif || activeDate;
    const { data, error } = await supabase
      .from("reponses")
      .insert({ date_journee: date, answers })
      .select()
      .single();
    if (!error && data) setResponses((p) => [...p, data]);
  };

  // l'anim supprime une réponse (erreur, test, doublon)
  const deleteReponse = async (id) => {
    await supabase.from("reponses").delete().eq("id", id);
    setResponses((p) => p.filter((r) => r.id !== id));
  };

  const fetchReponses = (date) => responses.filter((r) => r.date_journee === date);
  const dates = useMemo(
    () => [...new Set(responses.map((r) => r.date_journee))].sort().reverse(),
    [responses]
  );

  return {
    questions, setQuestions: setQuestionsAndSave,
    activeDate, setActiveDate,
    submitReponse, deleteReponse, fetchReponses, dates, loading,
  };
}

/* ------------------------------ Petits blocs UI --------------------------- */
function MomentPill({ moment, icon }) {
  const Icon = ICONS[icon] || Tent;
  return (
    <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
      <Icon className="h-3.5 w-3.5" /> {moment}
    </span>
  );
}
function MoodCard({ option, selected, onSelect }) {
  const s = LVL[option.v];
  return (
    <button onClick={() => onSelect(option.v)}
      className={`w-full flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.98] ${
        selected ? `${s.bg} ${s.ring} ring-4 border-transparent` : "bg-white border-slate-200"}`}>
      <span className="text-3xl leading-none">{option.emoji}</span>
      <span className="flex-1">
        <span className={`block font-bold ${selected ? s.text : "text-slate-800"}`}>{option.v}/5</span>
        <span className="block text-sm text-slate-500">{option.label}</span>
      </span>
      {selected && <Check className={`h-5 w-5 ${s.text}`} />}
    </button>
  );
}

/* ----------------------- Rendu d'une question (jeune) --------------------- */
function QuestionInput({ q, value, onChange }) {
  if (q.type === "rating") {
    const scale = q.scale || GENERIC_SCALE;
    return (
      <div className="space-y-3">
        {scale.map((o) => (
          <MoodCard key={o.v} option={o} selected={value === o.v} onSelect={onChange} />
        ))}
      </div>
    );
  }
  if (q.type === "emoji") {
    return (
      <div className="grid grid-cols-4 gap-3">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => onChange(e)}
            className={`aspect-square rounded-2xl border-2 text-3xl transition-all active:scale-90 ${
              value === e ? "border-pink-400 bg-pink-100 ring-4 ring-pink-200" : "border-slate-200 bg-white"}`}>
            {e}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "choice") {
    return (
      <div className="space-y-3">
        {(q.options || []).map((o) => (
          <button key={o} onClick={() => onChange(o)}
            className={`w-full rounded-2xl border-2 p-4 text-left font-semibold transition-all active:scale-[0.98] ${
              value === o ? "border-teal-400 bg-teal-100 text-teal-800 ring-4 ring-teal-200" : "border-slate-200 bg-white text-slate-700"}`}>
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "textlong") {
    return (
      <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={4}
        placeholder="Écris ici…"
        className="w-full resize-none rounded-2xl border-2 border-slate-200 p-4 text-lg outline-none focus:border-indigo-400" />
    );
  }
  return (
    <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="Écris ici…"
      className="w-full rounded-2xl border-2 border-slate-200 p-4 text-lg outline-none focus:border-sky-400" />
  );
}

/* ----------------------------- Parcours jeune ----------------------------- */
function ParticipantFlow({ questions, date, onSubmit }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [answers, setAnswers] = useState({});
  const q = questions[step];
  const set = (v) => setAnswers((p) => ({ ...p, [q.id]: v }));
  const filled = answers[q.id] !== undefined && answers[q.id] !== "" && answers[q.id] !== 0;
  const canNext = !q.required || filled;
  const last = step === questions.length - 1;
  const Icon = ICONS[q.icon] || Tent;

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-10 w-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-800">C'est envoyé, merci !</h2>
        <p className="mt-2 max-w-xs text-slate-500">Ton avis aide les anims à améliorer la colo. À demain !</p>
        <button onClick={() => { setAnswers({}); setStep(0); setDone(false); }}
          className="mt-8 flex items-center gap-2 rounded-full bg-slate-800 px-6 py-3 font-semibold text-white">
          <RotateCcw className="h-4 w-4" /> Nouvelle réponse
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-xs font-semibold text-slate-400">
          <span>Question {step + 1} / {questions.length}</span>
          <span className="capitalize">{frDate(date)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all duration-300"
            style={{ width: `${((step + 1) / questions.length) * 100}%` }} />
        </div>
      </div>

      <div className="animate-[fadeIn_.25s_ease]">
        {q.moment && <MomentPill moment={q.moment} icon={q.icon} />}
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-800">
            <Icon className="h-6 w-6 text-white" />
          </span>
          <h2 className="pt-1 text-xl font-extrabold leading-tight text-slate-800">
            {q.title}{q.required && <span className="text-rose-500"> *</span>}
          </h2>
        </div>
        <QuestionInput q={q} value={answers[q.id]} onChange={set} />
      </div>

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-1 rounded-full border-2 border-slate-200 px-5 py-3 font-semibold text-slate-600">
            <ChevronLeft className="h-5 w-5" /> Retour
          </button>
        )}
        <button disabled={!canNext}
          onClick={() => { if (last) { onSubmit(answers); setDone(true); } else setStep((s) => s + 1); }}
          className={`flex flex-1 items-center justify-center gap-1 rounded-full px-5 py-3 font-bold text-white transition-all ${
            canNext ? "bg-slate-800 active:scale-[0.98]" : "cursor-not-allowed bg-slate-300"}`}>
          {last ? "Envoyer mon bilan" : "Suivant"}{!last && <ChevronRight className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

/* --------------------------- Export CSV & Email --------------------------- */
function csvEscape(v) {
  const s = (v ?? "").toString().replace(/"/g, '""');
  return /[",\n;]/.test(s) ? `"${s}"` : s;
}
function buildCsv(questions, rows) {
  const headers = ["date", ...questions.map((q) => q.title)];
  const lines = [headers.map(csvEscape).join(";")];
  rows.forEach((r) => {
    const line = [r.date_journee, ...questions.map((q) => r.answers[q.id])];
    lines.push(line.map(csvEscape).join(";"));
  });
  return "\uFEFF" + lines.join("\n"); // BOM pour un Excel français heureux
}
function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function buildTextReport(date, questions, rows) {
  const lines = [];
  lines.push(`BILAN DE COLO — ${frDate(date)}`);
  lines.push(`${rows.length} réponse${rows.length > 1 ? "s" : ""}`);
  lines.push("");
  questions.filter((q) => q.type === "rating").forEach((q) => {
    const vals = rows.map((r) => r.answers[q.id]).filter(Boolean);
    lines.push(`${q.title} : ${avg(vals).toFixed(1)}/5 (${vals.length} réponses)`);
  });
  questions.filter((q) => q.type === "choice").forEach((q) => {
    lines.push(""); lines.push(`${q.title} :`);
    (q.options || []).forEach((o) => {
      const n = rows.filter((r) => r.answers[q.id] === o).length;
      lines.push(`  - ${o} : ${n}`);
    });
  });
  questions.filter((q) => (q.type === "text" || q.type === "textlong") && q.id !== "prenom").forEach((q) => {
    const items = rows.map((r) => ({ who: r.answers.prenom, text: r.answers[q.id] })).filter((x) => x.text && x.text.trim());
    lines.push(""); lines.push(`${q.title.toUpperCase()} (${items.length}) :`);
    if (!items.length) lines.push("  (aucune réponse)");
    items.forEach((x) => lines.push(`  - ${x.who ? x.who + " : " : ""}${x.text}`));
  });
  return lines.join("\n");
}

function tierRgb(score) {
  const v = Math.max(1, Math.min(5, Math.round(score) || 3));
  return { 5:[16,185,129], 4:[132,204,22], 3:[245,158,11], 2:[249,115,22], 1:[244,63,94] }[v];
}

function buildPdf(date, questions, rows) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mx = 16;
  const cw = pageW - mx * 2;
  let y = 0;

  const newPageBand = () => {
    doc.setFillColor(245, 158, 11);
    doc.rect(0, 0, pageW, 2.5, "F");
  };

  const footer = () => {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(mx, pageH - 14, pageW - mx, pageH - 14);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "normal");
    doc.text("Bilan de colo", mx, pageH - 9);
    doc.text(`page ${doc.internal.getNumberOfPages()}`, pageW - mx, pageH - 9, { align: "right" });
  };

  const header = () => {
    newPageBand();
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 2.5, pageW, 29, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Bilan de colo", mx, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(frDate(date), mx, 26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${rows.length} réponse${rows.length > 1 ? "s" : ""}`, pageW - mx, 18, { align: "right" });
    y = 42;
  };

  const ensureSpace = (needed) => {
    if (y + needed > pageH - 18) {
      footer();
      doc.addPage();
      newPageBand();
      y = 14;
    }
  };

  const sectionTitle = (title, color = [30, 41, 59]) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(title, mx, y);
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(0.6);
    doc.line(mx, y + 2.2, mx + cw, y + 2.2);
    doc.setLineWidth(0.2);
    y += 10;
  };

  header();

  // --- Notes (questions de type "rating") ---
  const ratings = questions.filter((q) => q.type === "rating");
  if (ratings.length) {
    sectionTitle("Notes du jour");
    ratings.forEach((q) => {
      const vals = rows.map((r) => r.answers[q.id]).filter(Boolean);
      const a = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      ensureSpace(13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(51, 65, 85);
      doc.text(q.title, mx, y);
      doc.setFont("helvetica", "bold");
      doc.text(`${a.toFixed(1)}/5`, mx + cw, y, { align: "right" });
      y += 3;
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(mx, y, cw, 3.4, 1.5, 1.5, "F");
      const rgb = tierRgb(a);
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.roundedRect(mx, y, Math.max(3, (a / 5) * cw), 3.4, 1.5, 1.5, "F");
      y += 9.5;
    });
    y += 2;
  }

  // --- Questions à choix ---
  questions.filter((q) => q.type === "choice").forEach((q) => {
    sectionTitle(q.title, [13, 148, 136]);
    const total = rows.length || 1;
    (q.options || []).forEach((opt) => {
      const n = rows.filter((r) => r.answers[q.id] === opt).length;
      const pct = Math.round((n / total) * 100);
      const optLines = doc.splitTextToSize(opt, cw - 28);
      ensureSpace(optLines.length * 4.4 + 9);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text(optLines, mx, y);
      doc.setFont("helvetica", "bold");
      doc.text(`${n} (${pct}%)`, mx + cw, y, { align: "right" });
      y += optLines.length * 4.4 + 1;
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(mx, y, cw, 3, 1.4, 1.4, "F");
      doc.setFillColor(20, 184, 166);
      doc.roundedRect(mx, y, Math.max(3, (pct / 100) * cw), 3, 1.4, 1.4, "F");
      y += 8;
    });
    y += 2;
  });

  // --- Réponses textuelles ---
  const textColors = {
    plus_aime: [244, 63, 94], points_ameliorer: [14, 165, 233],
    mot_equipe: [79, 70, 229], idee: [217, 119, 6],
  };
  questions
    .filter((q) => (q.type === "text" || q.type === "textlong") && q.id !== "prenom")
    .forEach((q) => {
      const items = rows
        .map((r) => ({ who: r.answers.prenom, text: r.answers[q.id] }))
        .filter((x) => x.text && x.text.trim());
      const color = textColors[q.id] || [71, 85, 105];
      sectionTitle(`${q.title} (${items.length})`, color);

      if (!items.length) {
        ensureSpace(8);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(148, 163, 184);
        doc.text("Aucune réponse.", mx, y);
        y += 8;
        return;
      }
      items.forEach((it) => {
        const prefix = it.who ? `${it.who} : ` : "";
        const lines = doc.splitTextToSize(prefix + it.text, cw - 6);
        const blockH = lines.length * 4.6 + 4;
        ensureSpace(blockH);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(mx, y - 3.6, cw, blockH - 0.5, 1.5, 1.5, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        doc.text(lines, mx + 3, y);
        y += blockH + 2;
      });
      y += 2;
    });

  footer();
  doc.save(`bilan-colo-${date}.pdf`);
}

function ExportBlock({ date, questions, rows }) {
  const [email, setEmail] = useState("");
  const sendMail = () => {
    const subject = `Bilan de colo — ${frDate(date)}`;
    const body = buildTextReport(date, questions, rows);
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <h4 className="mb-1 font-bold text-slate-700">Transmettre ce rapport</h4>
      <p className="mb-3 text-sm text-slate-400">Le PDF présente tout en un document propre. Le CSV donne les données brutes, le mail un résumé rapide.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button onClick={() => buildPdf(date, questions, rows)}
          className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white">
          <Printer className="h-4 w-4" /> PDF
        </button>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="adresse@email.com"
          className="flex-1 rounded-xl border-2 border-slate-200 p-3 text-sm outline-none focus:border-indigo-400" />
        <button onClick={sendMail} disabled={!email}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white ${email ? "bg-indigo-600" : "bg-slate-300 cursor-not-allowed"}`}>
          <Mail className="h-4 w-4" /> Mail
        </button>
        <button onClick={() => downloadCsv(`bilan-colo-${date}.csv`, buildCsv(questions, rows))}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
          <Download className="h-4 w-4" /> CSV
        </button>
      </div>
    </div>
  );
}


const avg = (nums) => nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;

function Gauge({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className="text-3xl font-black text-slate-800">{value.toFixed(1)}</span>
        <span className="mb-1 text-sm text-slate-400">/5</span>
      </div>
    </div>
  );
}
function DistBars({ q, rows }) {
  const scale = q.scale || GENERIC_SCALE;
  const dist = { 5:0, 4:0, 3:0, 2:0, 1:0 };
  rows.forEach((r) => { const v = r.answers[q.id]; if (dist[v] !== undefined) dist[v]++; });
  const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  const Icon = ICONS[q.icon] || Star;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <h4 className="mb-1 flex items-center gap-2 font-bold text-slate-700"><Icon className="h-4 w-4 text-slate-400" />{q.title}</h4>
      <p className="mb-3 text-sm text-slate-400">Moyenne {avg(rows.map((r) => r.answers[q.id]).filter(Boolean)).toFixed(1)}/5</p>
      <div className="space-y-2">
        {[5,4,3,2,1].map((v) => {
          const opt = scale.find((o) => o.v === v) || { emoji:"" };
          return (
            <div key={v} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-right">{opt.emoji}</span>
              <span className="w-4 font-semibold text-slate-400">{v}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${LVL[v].bar}`} style={{ width: `${(dist[v]/total)*100}%` }} />
              </div>
              <span className="w-6 text-right font-semibold text-slate-500">{dist[v]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function ChoiceBlock({ q, rows }) {
  const counts = {};
  (q.options || []).forEach((o) => (counts[o] = 0));
  rows.forEach((r) => { const v = r.answers[q.id]; if (v in counts) counts[v]++; });
  const total = rows.length || 1;
  const Icon = ICONS[q.icon] || CircleDot;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><Icon className="h-4 w-4 text-slate-400" />{q.title}</h4>
      <div className="space-y-2">
        {(q.options || []).map((o, i) => (
          <div key={i} className="text-sm">
            <div className="mb-1 flex justify-between"><span className="text-slate-600">{o}</span><span className="font-semibold text-slate-500">{counts[o]}</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${(counts[o]/total)*100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function TextBlock({ q, rows }) {
  const Icon = ICONS[q.icon] || MessageCircle;
  const items = rows.map((r) => ({ who: r.answers.prenom, text: r.answers[q.id] })).filter((x) => x.text && x.text.trim());
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 font-bold text-slate-700">
        <Icon className="h-5 w-5 text-slate-400" />{q.title}<span className="text-sm font-normal text-slate-400">({items.length})</span>
      </div>
      {items.length === 0 ? <p className="text-sm text-slate-400">Aucune réponse.</p> : (
        <ul className="space-y-2">
          {items.map((x, i) => (
            <li key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {x.who && <span className="font-semibold text-slate-500">{x.who} · </span>}{x.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
function ResponseList({ rows, onDelete }) {
  const [confirmId, setConfirmId] = useState(null);
  const sorted = [...rows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <h4 className="mb-1 flex items-center gap-2 font-bold text-slate-700">
        <ListChecks className="h-4 w-4 text-slate-400" /> Réponses individuelles ({rows.length})
      </h4>
      <p className="mb-3 text-sm text-slate-400">À utiliser pour retirer un test ou une réponse envoyée par erreur.</p>
      <ul className="space-y-2">
        {sorted.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-xl leading-none">{r.answers.emoji || "🙂"}</span>
            <span className="flex-1 truncate text-sm text-slate-600">
              <span className="font-semibold text-slate-700">{r.answers.prenom || "Anonyme"}</span>
              {r.answers.plus_aime ? <span className="text-slate-400"> · {r.answers.plus_aime}</span> : null}
            </span>
            {confirmId === r.id ? (
              <span className="flex shrink-0 items-center gap-1">
                <button onClick={() => { onDelete(r.id); setConfirmId(null); }}
                  className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-bold text-white">Confirmer</button>
                <button onClick={() => setConfirmId(null)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500">Annuler</button>
              </span>
            ) : (
              <button onClick={() => setConfirmId(r.id)} className="shrink-0 text-slate-300 hover:text-rose-500" title="Supprimer cette réponse">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Report({ dates, fetchReponses, questions, onDelete }) {
  const [date, setDate] = useState(dates[0]);
  const rows = fetchReponses(date);
  const emojiQ = questions.find((q) => q.type === "emoji");
  const emojiCounts = useMemo(() => {
    if (!emojiQ) return [];
    const c = {};
    rows.forEach((r) => { const e = r.answers[emojiQ.id]; if (e) c[e] = (c[e] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [rows, emojiQ]);
  const meteo = emojiCounts[0]?.[0] || "—";
  const ratings = questions.filter((q) => q.type === "rating");

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {dates.map((d) => (
          <button key={d} onClick={() => setDate(d)}
            className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition-all ${
              d === date ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
            {frDate(d)}
          </button>
        ))}
      </div>

      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">Météo du groupe</p>
          <p className="text-4xl">{meteo} <span className="align-middle text-base font-semibold text-slate-500">{rows.length} réponse{rows.length > 1 ? "s" : ""}</span></p>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
          <Printer className="h-4 w-4" /> Imprimer
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">Pas encore de réponse pour ce jour.</div>
      ) : (
        <div className="space-y-5">
          <ExportBlock date={date} questions={questions} rows={rows} />
          {ratings.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {ratings.map((q) => (
                <Gauge key={q.id} label={q.title} icon={ICONS[q.icon] || Star}
                  value={avg(rows.map((r) => r.answers[q.id]).filter(Boolean))} />
              ))}
            </div>
          )}
          {emojiCounts.length > 1 && (
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <h4 className="mb-2 font-bold text-slate-700">Emojis du jour</h4>
              <div className="flex flex-wrap gap-2">
                {emojiCounts.map(([e, n]) => (
                  <span key={e} className="rounded-full bg-slate-100 px-3 py-1 text-lg">{e} <span className="text-sm font-semibold text-slate-500">{n}</span></span>
                ))}
              </div>
            </div>
          )}
          {ratings.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {ratings.map((q) => <DistBars key={q.id} q={q} rows={rows} />)}
            </div>
          )}
          {questions.filter((q) => q.type === "choice").map((q) => <ChoiceBlock key={q.id} q={q} rows={rows} />)}
          {questions.filter((q) => (q.type === "text" || q.type === "textlong") && q.id !== "prenom").map((q) => <TextBlock key={q.id} q={q} rows={rows} />)}
          <ResponseList rows={rows} onDelete={onDelete} />
        </div>
      )}
    </div>
  );
}

/* --------------------------- Éditeur de questions ------------------------- */
function QuestionEditor({ questions, setQuestions }) {
  const [type, setType] = useState("rating");
  const [title, setTitle] = useState("");
  const [moment, setMoment] = useState("Général");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    setQuestions(next);
  };
  const remove = (id) => setQuestions(questions.filter((q) => q.id !== id));
  const add = () => {
    if (!title.trim()) return;
    const q = {
      id: "q_" + Date.now(), type, title: title.trim(), moment: moment.trim() || "Général",
      icon: type === "rating" ? "Star" : type === "emoji" ? "Smile" : type === "choice" ? "CircleDot" : "MessageCircle",
      required,
    };
    if (type === "choice") q.options = options.split(",").map((o) => o.trim()).filter(Boolean);
    setQuestions([...questions, q]);
    setTitle(""); setOptions(""); setRequired(false);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-bold text-slate-700">Questions du formulaire ({questions.length})</h3>
        <ul className="space-y-2">
          {questions.map((q, i) => {
            const meta = TYPE_META[q.type];
            const Icon = meta.icon;
            return (
              <li key={q.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="flex flex-col">
                  <button onClick={() => move(i, -1)} className="text-slate-400 hover:text-slate-700"><ArrowUp className="h-4 w-4" /></button>
                  <button onClick={() => move(i, 1)} className="text-slate-400 hover:text-slate-700"><ArrowDown className="h-4 w-4" /></button>
                </span>
                <Icon className={`h-4 w-4 ${meta.color}`} />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-slate-700">{q.title}{q.required && <span className="text-rose-500"> *</span>}</span>
                  <span className="text-xs text-slate-400">{meta.label}{q.moment ? ` · ${q.moment}` : ""}</span>
                </span>
                <button onClick={() => remove(q.id)} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-4">
        <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><Plus className="h-5 w-5" /> Ajouter une question</h3>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(TYPE_META).map(([k, m]) => (
              <button key={k} onClick={() => setType(k)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                  type === k ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>
                <m.icon className="h-4 w-4" /> {m.label}
              </button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Intitulé de la question"
            className="w-full rounded-xl border-2 border-slate-200 p-3 outline-none focus:border-slate-400" />
          <input value={moment} onChange={(e) => setMoment(e.target.value)} placeholder="Moment (Matin, Repas, Veillée…)"
            className="w-full rounded-xl border-2 border-slate-200 p-3 outline-none focus:border-slate-400" />
          {type === "choice" && (
            <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Options séparées par des virgules"
              className="w-full rounded-xl border-2 border-slate-200 p-3 outline-none focus:border-slate-400" />
          )}
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-4 w-4" /> Obligatoire
          </label>
          <button onClick={add} className="w-full rounded-xl bg-slate-800 py-3 font-bold text-white">Ajouter au formulaire</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Partager --------------------------------- */
function Share() {
  const [url, setUrl] = useState("https://ma-colo.vercel.app");
  const [copied, setCopied] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(url)}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 text-center shadow-sm">
        <h3 className="mb-1 font-bold text-slate-700">Le QR à montrer aux jeunes</h3>
        <p className="mb-4 text-sm text-slate-400">Ils le scannent avec l'appareil photo, ça ouvre le formulaire.</p>
        {imgOk ? (
          <img src={qr} alt="QR code du formulaire" onError={() => setImgOk(false)}
            className="mx-auto rounded-xl border border-slate-100" width={220} height={220} />
        ) : (
          <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
            QR indispo ici — colle ce lien : {url}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <input value={url} onChange={(e) => { setUrl(e.target.value); setImgOk(true); }}
            className="flex-1 rounded-xl border-2 border-slate-200 p-3 text-sm outline-none focus:border-slate-400" />
          <button onClick={copy} className="flex items-center gap-1 rounded-xl bg-slate-800 px-4 font-semibold text-white">
            <Copy className="h-4 w-4" /> {copied ? "Copié" : "Copier"}
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm text-sm text-slate-600">
        <h3 className="mb-2 font-bold text-slate-700">3 façons de le transmettre</h3>
        <p className="mb-2">📺 <b>Au réveil / petit-déj :</b> affiche le QR sur la TV ou le vidéoprojecteur, les jeunes scannent.</p>
        <p className="mb-2">🖨️ <b>Imprimé :</b> colle le QR à l'entrée du réfectoire ou dans chaque dortoir.</p>
        <p>📱 <b>Sans téléphone :</b> laisse une tablette en « mode Jeune », chacun remplit puis touche « Nouvelle réponse ».</p>
      </div>
    </div>
  );
}

/* --------------------------------- App ------------------------------------ */
export default function App() {
  const db = useDb();
  const [mode, setMode] = useState("jeune");
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [tab, setTab] = useState("rapport");

  if (db.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-50 text-slate-400">
        Chargement…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-rose-50">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>

      <header className="sticky top-0 z-10 border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2"><span className="text-2xl">⛺️</span><span className="font-extrabold tracking-tight text-slate-800">Bilan de colo</span></div>
          <div className="flex rounded-full bg-slate-100 p-1 text-sm font-semibold">
            <button onClick={() => setMode("jeune")} className={`rounded-full px-3 py-1.5 ${mode === "jeune" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>Jeune</button>
            <button onClick={() => setMode("anim")} className={`flex items-center gap-1 rounded-full px-3 py-1.5 ${mode === "anim" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}><BarChart3 className="h-4 w-4" /> Anim</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {mode === "jeune" && (
          <div className="mx-auto max-w-md">
            <ParticipantFlow questions={db.questions} date={db.activeDate} onSubmit={db.submitReponse} />
            <p className="mt-6 text-center text-xs text-slate-400">Bilan de la journée du {frDate(db.activeDate)}</p>
          </div>
        )}

        {mode === "anim" && !unlocked && (
          <div className="mx-auto mt-10 max-w-sm rounded-3xl bg-white p-6 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100"><Lock className="h-7 w-7 text-indigo-600" /></div>
            <h2 className="text-lg font-extrabold text-slate-800">Espace animateurs</h2>
            <p className="mt-1 text-sm text-slate-500">Entre le code pour continuer.</p>
            <input value={code} onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && code === CODE_ANIM && setUnlocked(true)}
              placeholder={`Code (démo : ${CODE_ANIM})`}
              className="mt-4 w-full rounded-2xl border-2 border-slate-200 p-3 text-center outline-none focus:border-indigo-400" />
            <button onClick={() => code === CODE_ANIM && setUnlocked(true)} className="mt-3 w-full rounded-2xl bg-indigo-600 py-3 font-bold text-white">Entrer</button>
          </div>
        )}

        {mode === "anim" && unlocked && (
          <div>
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
              <Calendar className="h-5 w-5 text-slate-400" />
              <span className="text-sm font-semibold text-slate-600">Journée évaluée</span>
              <input type="date" value={db.activeDate} max={iso(today)} onChange={(e) => db.setActiveDate(e.target.value)}
                className="ml-auto rounded-xl border-2 border-slate-200 p-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="mb-6 flex gap-2 rounded-full bg-white p-1 shadow-sm">
              {[["rapport","Rapport",BarChart3],["questions","Questions",ListChecks],["partager","Partager",Share2]].map(([k,l,Ic]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold ${
                    tab === k ? "bg-slate-800 text-white" : "text-slate-500"}`}>
                  <Ic className="h-4 w-4" /> {l}
                </button>
              ))}
            </div>
            {tab === "rapport" && <Report dates={db.dates} fetchReponses={db.fetchReponses} questions={db.questions} onDelete={db.deleteReponse} />}
            {tab === "questions" && <QuestionEditor questions={db.questions} setQuestions={db.setQuestions} />}
            {tab === "partager" && <Share />}
          </div>
        )}
      </main>

      <footer className="pb-8 text-center text-xs text-slate-400">Bilan de colo · prends la température en 1 minute</footer>
    </div>
  );
}
