/**
 * LLM integration for pre-visit and post-visit summaries.
 *
 * Design goal from the brief: "LLM failures must be handled gracefully,
 * the system should not break." So every public function here ALWAYS
 * resolves (never throws) - on any error it falls back to a deterministic,
 * rule-based summary and tags the result with `source: "fallback"` so the
 * UI/DB can show that it wasn't AI-generated.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const API_KEY = process.env.ANTHROPIC_API_KEY;
const API_URL = "https://api.anthropic.com/v1/messages";

const URGENT_KEYWORDS = [
  "chest pain", "difficulty breathing", "shortness of breath", "severe bleeding",
  "unconscious", "seizure", "stroke", "can't breathe", "suicidal", "severe pain",
  "high fever", "blue lips", "paralysis"
];
const MEDIUM_KEYWORDS = [
  "fever", "vomiting", "persistent", "worsening", "infection", "swelling",
  "dizziness", "rash spreading", "moderate pain"
];

function ruleBasedPreVisit(symptomsText) {
  const text = (symptomsText || "").toLowerCase();
  let urgency = "Low";
  if (URGENT_KEYWORDS.some((k) => text.includes(k))) urgency = "High";
  else if (MEDIUM_KEYWORDS.some((k) => text.includes(k))) urgency = "Medium";

  const chiefComplaint = (symptomsText || "Not specified").split(/[.\n]/)[0].slice(0, 140);

  return {
    urgency,
    chief_complaint: chiefComplaint || "Not specified",
    suggested_questions: [
      "When did the symptoms start and have they changed over time?",
      "Are there any related symptoms the patient hasn't mentioned yet?",
      "Any relevant medical history, medications, or allergies?"
    ],
    source: "fallback"
  };
}

function ruleBasedPostVisit(notesText) {
  return {
    summary: (notesText || "").slice(0, 600) || "The doctor has recorded notes from your visit. Please contact the clinic for a detailed explanation.",
    medication_schedule: [],
    follow_up_steps: ["Contact the clinic if symptoms persist or worsen."],
    source: "fallback"
  };
}

async function callClaude(systemPrompt, userPrompt) {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text content in Anthropic response");
  return textBlock.text;
}

function safeParseJSON(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

/**
 * Prompt from the brief:
 * "Analyse these symptoms and return: urgency level (Low / Medium / High),
 *  chief complaint, and three suggested questions for the doctor.
 *  Symptoms: <symptoms>"
 */
async function generatePreVisitSummary(symptomsText) {
  try {
    const system =
      "You are a clinical intake assistant. You NEVER diagnose. You return ONLY " +
      "strict JSON, no prose, no markdown fences, matching this shape: " +
      '{"urgency":"Low|Medium|High","chief_complaint":"string","suggested_questions":["q1","q2","q3"]}';
    const user = `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptomsText}`;
    const raw = await callClaude(system, user);
    const parsed = safeParseJSON(raw);
    if (!parsed.urgency || !parsed.chief_complaint) throw new Error("Malformed LLM response");
    return { ...parsed, source: "llm" };
  } catch (err) {
    console.warn("[llm.service] pre-visit summary fell back to rule-based:", err.message);
    return ruleBasedPreVisit(symptomsText);
  }
}

/**
 * Prompt from the brief:
 * "Convert these clinical notes into a patient-friendly summary with
 *  medication schedule and follow-up steps: <notes>"
 */
async function generatePostVisitSummary(notesText, prescription) {
  try {
    const system =
      "You are a patient communication assistant. Translate clinical notes into " +
      "warm, plain-language guidance a non-medical person can follow. Return ONLY " +
      "strict JSON, no prose, no markdown fences, matching this shape: " +
      '{"summary":"string","medication_schedule":[{"medication":"string","instructions":"string"}],"follow_up_steps":["step1","step2"]}';
    const prescriptionText = prescription && prescription.length
      ? prescription.map((p) => `${p.name} ${p.dosage || ""} - ${p.frequency_per_day || "?"}x/day for ${p.duration_days || "?"} days`).join("; ")
      : "None prescribed";
    const user = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${notesText}\n\nPrescription: ${prescriptionText}`;
    const raw = await callClaude(system, user);
    const parsed = safeParseJSON(raw);
    if (!parsed.summary) throw new Error("Malformed LLM response");
    return { ...parsed, source: "llm" };
  } catch (err) {
    console.warn("[llm.service] post-visit summary fell back to rule-based:", err.message);
    return ruleBasedPostVisit(notesText);
  }
}

module.exports = { generatePreVisitSummary, generatePostVisitSummary };
