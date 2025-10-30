import React, { useMemo, useState } from "react";

/**
 * Exam Variant Builder – minimal working prototype (+ image authoring)
 *
 * Features
 * - Problem bank with JSON editing
 * - Fixed MC options; numeric parameters vary by seeded RNG (α, β, γ…)
 * - Correct option recomputed per variant from an expression
 * - Add images per problem (upload, reorder, resize %, align)
 * - Live layout mode to tweak images in preview
 * - Export self‑contained HTML (embeds images as data URLs)
 */

// ---------- Utility: seeded RNG (mulberry32) ----------
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Greek superscripts for variant markers
const GREEK = [
  "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ", "ν", "ξ", "ο", "π", "ρ", "σ", "τ", "υ", "φ", "χ", "ψ", "ω",
];

// ---------- Problem schema ----------
/**
 * Problem shape used here:
 * {
 *   id: string,
 *   stem: string,                 // may contain {{placeholders}}
 *   params: { name: string, min: number, max: number, step?: number }[]
 *   options: string[],            // fixed options (text/number strings)
 *   answerExpr: string,           // JS-like expression producing the numeric/text answer
 *   selectRule?: {                // optional rule to match answer to an option
 *     match: "numeric" | "string",
 *     rounding?: number           // decimals for numeric compare
 *   }
 *
 *   // NEW: optional images rendered after the stem (before options)
 *   images?: Array<{
 *     src: string;               // Data URL or absolute URL
 *     alt?: string;
 *     widthPct?: number;         // 20..100 (% of content width)
 *     align?: "left" | "center" | "right";
 *   }>
 * }
 */

const DEMO_BANK = [
  {
    id: "ohm1",
    stem:
      "A copper wire has resistance R = {{R}} Ω. A battery of V = {{V}} V is applied. The steady current is closest to:",
    params: [
      { name: "R", min: 4, max: 12, step: 1 },
      { name: "V", min: 6, max: 24, step: 2 },
    ],
    options: ["0.2 A", "0.4 A", "0.5 A", "1.0 A", "2.0 A"], // fixed order
    answerExpr: "V / R", // amperes
    selectRule: { match: "numeric", rounding: 1 },
    images: [],
  },
  {
    id: "capRC1",
    stem:
      "An RC circuit has R = {{R}} kΩ and C = {{C}} μF. The time constant τ is:",
    params: [
      { name: "R", min: 5, max: 25, step: 5 },
      { name: "C", min: 2, max: 12, step: 2 },
    ],
    options: ["10 ms", "50 ms", "100 ms", "120 ms", "250 ms"],
    answerExpr: "(R*1e3) * (C*1e-6)", // seconds
    selectRule: { match: "numeric", rounding: 2 },
    images: [],
  },
];

// ---------- Helpers ----------
function pickParam(rand, min, max, step = 1) {
  const nSteps = Math.floor((max - min) / step) + 1;
  const k = Math.floor(rand() * nSteps);
  return min + k * step;
}

function renderTemplate(stem, bindings) {
  return stem.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => String(bindings[name] ?? ""));
}

function roundTo(x, d = 0) {
  const p = Math.pow(10, d);
  return Math.round(x * p) / p;
}

function numericFromOption(opt) {
  // Extract first numeric-like token from a string (e.g., "0.5 A" -> 0.5)
  const m = String(opt).match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}

function chooseCorrectIndex(problem, bindings) {
  // Evaluate answer expression in a sandboxed scope
  const scope = { ...bindings, Math };
  const answer = Function(...Object.keys(scope), `return (${problem.answerExpr});`)(...Object.values(scope));

  if (problem.selectRule?.match === "numeric") {
    const r = problem.selectRule.rounding ?? 2;
    const target = roundTo(Number(answer), r);
    // Find option with numeric value matching target at same rounding
    let bestIdx = -1;
    for (let i = 0; i < problem.options.length; i++) {
      const v = numericFromOption(problem.options[i]);
      if (!Number.isFinite(v)) continue;
      if (roundTo(v, r) === target) {
        bestIdx = i;
        break;
      }
    }
    return { index: bestIdx, numericAnswer: target };
  }
  // Fallback: string match
  const idx = problem.options.findIndex((o) => String(o).trim() === String(answer).trim());
  return { index: idx, numericAnswer: undefined };
}

function generateBindings(problem, seed) {
  const rand = mulberry32(seed);
  const out = {};
  for (const p of problem.params) out[p.name] = pickParam(rand, p.min, p.max, p.step);
  return out;
}

// ---------- Image utilities ----------
async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- UI Components ----------
function ProblemCard({ problem, bindings, correctIndex, onEdit, onImages }) {
  const rendered = renderTemplate(problem.stem, bindings);
  return (
    <div className="border rounded-2xl p-4 shadow-sm mb-4">
      <div className="text-sm text-gray-600 mb-2 flex items-center gap-2">
        <span>Problem ID: {problem.id}</span>
        <span className="text-gray-400">•</span>
        <span>{problem.images?.length || 0} image{(problem.images?.length||0) === 1 ? "" : "s"}</span>
      </div>
      <div className="font-medium mb-2">{rendered}</div>
      {!!(problem.images && problem.images.length) && (
        <div className="flex flex-wrap gap-3 my-2">
          {problem.images.map((img, i) => (
            <div key={i} className="border rounded-xl p-1">
              <img src={img.src} alt={img.alt || ""}
                   style={{ width: `${img.widthPct ?? 50}%`, display: "block",
                            margin: img.align === "center" ? "0 auto" : undefined,
                            float: img.align === "left" ? "left" : img.align === "right" ? "right" : undefined }} />
            </div>
          ))}
        </div>
      )}
      <ol type="a" className="list-[lower-alpha] ml-6 clear-both">
        {problem.options.map((opt, i) => (
          <li key={i} className="my-1">
            <span className={"" + (correctIndex === i ? " font-semibold underline" : "")}>{opt}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
        <button className="px-3 py-1 rounded-xl border" onClick={onEdit}>Edit</button>
        <button className="px-3 py-1 rounded-xl border" onClick={onImages}>Images</button>
      </div>
    </div>
  );
}

function Editor({ model, setModel, onClose }) {
  const [local, setLocal] = useState(JSON.stringify(model, null, 2));
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30">
      <div className="bg-white rounded-2xl p-4 w-full max-w-3xl shadow-xl">
        <div className="text-lg font-semibold mb-2">Problem JSON</div>
        <textarea
          className="w-full h-72 p-2 font-mono text-sm border rounded-lg"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
        />
        <div className="mt-3 flex gap-2 justify-end">
          <button className="px-3 py-1 rounded-xl border" onClick={onClose}>Cancel</button>
          <button
            className="px-3 py-1 rounded-xl border bg-black text-white"
            onClick={() => {
              try {
                const parsed = JSON.parse(local);
                setModel(parsed);
                onClose();
              } catch (e) {
                alert("Invalid JSON: " + e.message);
              }
            }}
          >Apply</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Image Editor (new) ----------
function ImageEditor({ problem, onChange, onClose }) {
  const [files, setFiles] = useState([]);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-40">
      <div className="bg-white rounded-2xl p-4 w-full max-w-4xl shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="text-lg font-semibold">Images for {problem.id}</div>
          <button className="px-3 py-1 rounded-xl border" onClick={onClose}>Close</button>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          <button className="px-3 py-1 rounded-xl border bg-black text-white" onClick={async () => {
            const newImgs = [];
            for (const f of files) {
              const data = await fileToDataUrl(f);
              newImgs.push({ src: String(data), alt: f.name, widthPct: 60, align: "center" });
            }
            onChange([...(problem.images || []), ...newImgs]);
            setFiles([]);
          }}>Add image(s)</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(problem.images || []).map((img, i) => (
            <div key={i} className="border rounded-2xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-600 truncate">{img.alt || `Image ${i+1}`}</div>
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 rounded-lg border" onClick={() => { const next = [...(problem.images||[])]; if (i>0) [next[i-1], next[i]] = [next[i], next[i-1]]; onChange(next); }}>↑</button>
                  <button className="px-2 py-1 rounded-lg border" onClick={() => { const next = [...(problem.images||[])]; if (i<next.length-1) [next[i+1], next[i]] = [next[i], next[i+1]]; onChange(next); }}>↓</button>
                  <button className="px-2 py-1 rounded-lg border" onClick={() => { const next = [...(problem.images||[])]; next.splice(i,1); onChange(next); }}>Remove</button>
                </div>
              </div>
              <img src={img.src} alt={img.alt||""} className="block mx-auto mb-2" style={{ maxWidth: "100%" }} />
              <div className="grid grid-cols-2 gap-3 items-center">
                <label className="text-sm">Width: {img.widthPct ?? 60}%</label>
                <input type="range" min={20} max={100} value={img.widthPct ?? 60} onChange={(e)=>{ const next = [...(problem.images||[])]; next[i] = { ...img, widthPct: Number(e.target.value) }; onChange(next); }} />
                <label className="text-sm">Align</label>
                <select value={img.align || "center"} onChange={(e)=>{ const next = [...(problem.images||[])]; next[i] = { ...img, align: e.target.value }; onChange(next); }}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
                <label className="text-sm">Alt text</label>
                <input className="border rounded-md px-2 py-1" value={img.alt || ""} onChange={(e)=>{ const next = [...(problem.images||[])]; next[i] = { ...img, alt: e.target.value }; onChange(next); }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VariantHeader({ seedIndex, title, subtitle }) {
  const letter = GREEK[seedIndex % GREEK.length] || "α";
  return (
    <div className="flex items-end gap-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      <span className="align-super text-xs">{subtitle} <sup className="ml-1">{letter}</sup></span>
    </div>
  );
}

function ExamView({ bank, seedIndex, showSolutions, layoutMode, onUpdateImages }) {
  const variantSeed = 12345 + seedIndex; // base seed + index
  const rng = mulberry32(variantSeed);

  const rendered = bank.map((p) => {
    const b = generateBindings(p, Math.floor(rng() * 1e9));
    const { index, numericAnswer } = chooseCorrectIndex(p, b);
    return { p, b, index, numericAnswer };
  });

  return (
    <div>
      <div className="mb-4">
        <VariantHeader seedIndex={seedIndex} title="Physics 227" subtitle={showSolutions ? "Practice Exam — Solutions" : "Practice Exam"} />
        <div className="text-sm text-gray-600">Multiple Choice — 10 questions</div>
      </div>

      {rendered.map(({ p, b, index }, qIdx) => (
        <div key={p.id} className="my-4 border-l-4 pl-3">
          <div className="font-medium mb-2">
            <span className="q-label mr-1">[Q{qIdx + 1}]</span>
            {renderTemplate(p.stem, b)}
          </div>

          {!!(p.images && p.images.length) && (
            <div className="mb-2 clear-both">
              {p.images.map((img, i) => (
                <div key={i} className="my-2" style={{ textAlign: img.align || "center" }}>
                  <img src={img.src} alt={img.alt || ""} style={{ width: `${img.widthPct ?? 60}%`, display: "inline-block" }} />
                  {layoutMode && (
                    <div className="flex items-center gap-2 mt-1 text-xs justify-center">
                      <button className="px-2 py-0.5 rounded border" onClick={() => { const next = [...(p.images||[])]; if (i>0) [next[i-1], next[i]] = [next[i], next[i-1]]; onUpdateImages(p.id, next); }}>↑</button>
                      <button className="px-2 py-0.5 rounded border" onClick={() => { const next = [...(p.images||[])]; if (i<next.length-1) [next[i+1], next[i]] = [next[i], next[i+1]]; onUpdateImages(p.id, next); }}>↓</button>
                      <label>W:{img.widthPct ?? 60}%</label>
                      <input type="range" min={20} max={100} value={img.widthPct ?? 60} onChange={(e)=>{ const next = [...(p.images||[])]; next[i] = { ...img, widthPct: Number(e.target.value) }; onUpdateImages(p.id, next); }} />
                      <select className="border rounded px-1" value={img.align || "center"} onChange={(e)=>{ const next = [...(p.images||[])]; next[i] = { ...img, align: e.target.value }; onUpdateImages(p.id, next); }}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="options ml-4">
            {p.options.map((opt, i) => (
              <div key={i} className={"option " + (showSolutions && i === index ? "bg-yellow-100 font-semibold" : "")}>{String.fromCharCode(97 + i)}. {opt}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function downloadHTML(filename, html) {
  const blob = new Blob(["\uFEFF" + html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildStandaloneHTML({ title, bodyHTML, showSolutions }) {
  // Minimal self-contained HTML that reuses class names compatible with your print styles
  // In production, fetch and inline the exact CSS from your templates.
  const baseCss = `
  /* Minimal print-friendly CSS; align class names with your templates */
  body { font-family: 'Times New Roman', Georgia, serif; font-size: 11pt; line-height: 1.4; color: #000; }
  .q-label { color: #2b579a; font-weight: 700; }
  .option { margin: 0.18rem 0; }
  .options { margin-top: 0.35rem; }
  img { page-break-inside: avoid; }
  @media print { @page { size: Letter; margin: 0.5in; } }
  .solutions .option { background: #fff59d; font-weight: 700; }
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>${title}</title>
  <style>${baseCss}</style>
  </head>
  <body class="${showSolutions ? "solutions" : ""}">
    ${bodyHTML}
  </body></html>`;
}

export default function App() {
  const [bank, setBank] = useState(DEMO_BANK);
  const [editing, setEditing] = useState(false);
  const [imageEditorFor, setImageEditorFor] = useState(null); // problem id or null
  const [seedIndex, setSeedIndex] = useState(0);
  const [showSolutions, setShowSolutions] = useState(false);
  const [layoutMode, setLayoutMode] = useState(false);

  const exportNow = () => {
    // Build HTML string directly (mirrors ExamView output)
    const rng = mulberry32(12345 + seedIndex);
    let html = `<div>`;
    const items = bank.map((p, idx) => {
      const b = generateBindings(p, Math.floor(rng() * 1e9));
      const { index } = chooseCorrectIndex(p, b);
      const stem = renderTemplate(p.stem, b);
      const imgs = (p.images||[])
        .map((img) => {
          const style = `style=\"width:${img.widthPct ?? 60}%;display:inline-block;\"`;
          const alignWrapStart = `<div style=\"text-align:${img.align||"center"}\">`;
          const alignWrapEnd = `</div>`;
          return `${alignWrapStart}<img src=\"${img.src}\" alt=\"${img.alt||""}\" ${style}/>${alignWrapEnd}`;
        })
        .join("");
      const opts = p.options
        .map((opt, i) => {
          const cls = showSolutions && i === index ? "option" + " solutions-correct" : "option";
          return `<div class=\"${cls}\">${String.fromCharCode(97 + i)}. ${opt}</div>`;
        })
        .join("");
      return `<div class=\"question\"><div class=\"stem\"><span class=\"q-label\">[Q${idx + 1}]</span> ${stem}</div>${imgs ? `<div class=\"images\">${imgs}</div>` : ""}<div class=\"options\">${opts}</div></div>`;
    });
    html += items.join("") + `</div>`;

    const header = `<div class=\"header\"><h1>Physics 227 <sup>${GREEK[seedIndex % GREEK.length] || "α"}</sup></h1><h2>${
      showSolutions ? "Practice Exam — Solutions" : "Practice Exam"
    }</h2></div>`;

    const full = buildStandaloneHTML({
      title: `Exam Variant ${seedIndex}`,
      bodyHTML: header + html,
      showSolutions,
    });
    downloadHTML(`exam_variant_${seedIndex}${showSolutions ? "_solutions" : ""}.html`, full);
  };

  return (
    <div className="p-6 grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-2xl font-semibold">Exam Variant Builder</div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm">Variant</label>
          <button className="px-3 py-1 rounded-xl border" onClick={() => setSeedIndex((s) => Math.max(0, s - 1))}>
            −
          </button>
          <div className="px-3 py-1 rounded-xl border bg-gray-50 min-w-12 text-center">
            {seedIndex} <sup>{GREEK[seedIndex % GREEK.length] || "α"}</sup>
          </div>
          <button className="px-3 py-1 rounded-xl border" onClick={() => setSeedIndex((s) => s + 1)}>
            +
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="px-3 py-1 rounded-xl border" onClick={() => setEditing(true)}>Edit Problems (JSON)</button>
        <button className="px-3 py-1 rounded-xl border" onClick={() => setLayoutMode(v => !v)}>
          {layoutMode ? "Done Layout" : "Edit Image Layout"}
        </button>
        <button className="px-3 py-1 rounded-xl border" onClick={() => setShowSolutions(v => !v)}>
          {showSolutions ? "Show Exam" : "Show Solutions"}
        </button>
        <button className="px-3 py-1 rounded-xl border bg-black text-white" onClick={exportNow}>
          Export HTML
        </button>
      </div>

      {/* Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-4 rounded-2xl border">
          <div className="text-lg font-semibold mb-2">Preview — {showSolutions ? "Solutions" : "Exam"}</div>
          <ExamView
            bank={bank}
            seedIndex={seedIndex}
            showSolutions={showSolutions}
            layoutMode={layoutMode}
            onUpdateImages={(id, imgs) => setBank(prev => prev.map(p => p.id === id ? { ...p, images: imgs } : p))}
          />
        </div>
        <div className="p-4 rounded-2xl border">
          <div className="text-lg font-semibold mb-2">Problem Bank</div>
          {bank.map((p, idx) => {
            const b = generateBindings(p, idx + 999);
            const { index } = chooseCorrectIndex(p, b);
            return (
              <ProblemCard
                key={p.id}
                problem={p}
                bindings={b}
                correctIndex={index}
                onEdit={() => setEditing(true)}
                onImages={() => setImageEditorFor(p.id)}
              />
            );
          })}
        </div>
      </div>

      {editing && (
        <Editor
          model={bank}
          setModel={(m) => setBank(Array.isArray(m) ? m : bank)}
          onClose={() => setEditing(false)}
        />
      )}

      {imageEditorFor && (
        <ImageEditor
          problem={bank.find(p => p.id === imageEditorFor)}
          onChange={(imgs) => setBank(prev => prev.map(p => p.id === imageEditorFor ? { ...p, images: imgs } : p))}
          onClose={() => setImageEditorFor(null)}
        />
      )}

      <style>{`
        .q-label { color: #2b579a; font-weight: 700; }
        @media print { @page { size: Letter; margin: 0.5in; } }
      `}</style>
    </div>
  );
}

// ---------- Lightweight self-tests (console) ----------
(function runSelfTests() {
  try {
    // Deterministic bindings
    const p = DEMO_BANK[0];
    const s1 = generateBindings(p, 42);
    const s2 = generateBindings(p, 42);
    console.assert(JSON.stringify(s1) === JSON.stringify(s2), "Bindings should be deterministic for same seed");

    // Template render
    const msg = renderTemplate("V={{V}}, R={{R}}", { V: 10, R: 5 });
    console.assert(msg === "V=10, R=5", "Template rendering failed");

    // Correct index selection (Ohm's law: 10V/10Ω=1.0A -> option '1.0 A' is index 3)
    const ohm = DEMO_BANK[0];
    const { index: idx } = chooseCorrectIndex(ohm, { V: 10, R: 10 });
    console.assert(idx === 3, "Correct option index should be 3 for 1.0 A");

    // Export HTML basic sanity
    const html = buildStandaloneHTML({ title: "t", bodyHTML: "<div>ok</div>", showSolutions: false });
    console.assert(typeof html === "string" && html.includes("<style>"), "Export HTML should include inlined style");
  } catch (e) {
    console.warn("Self-tests encountered an error:", e);
  }
})();
