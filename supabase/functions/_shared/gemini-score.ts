// Shared Gemini scoring helper. Both /evaluate and /submit-exam funnel through
// here so the scoring prompt + response shape live in one place and the
// client never sees the raw Gemini API key.

import {
  buildFeedbackPrompt,
  feedbackResponseSchema,
  TranscriptLine,
} from "./prompts.ts";

const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface GeminiScore {
  score: number;
  feedback: string;
  confidenceScore: number | null;
  confidenceRationale: string | null;
  rubricBreakdown: unknown;
  raw: Record<string, unknown>;
}

export async function scoreTranscript(
  courseName: string,
  transcriptions: TranscriptLine[],
  apiKey: string,
): Promise<GeminiScore> {
  const prompt = buildFeedbackPrompt(courseName, transcriptions);

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: feedbackResponseSchema,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("Gemini returned no text");

  let analysis: Record<string, unknown>;
  try {
    analysis = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON text");
  }

  const rawScore = Number(analysis.score ?? 0);
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));
  return {
    score,
    feedback: typeof analysis.feedback === "string"
      ? analysis.feedback
      : "No feedback generated.",
    confidenceScore: typeof analysis.confidenceScore === "number"
      ? analysis.confidenceScore
      : null,
    confidenceRationale: typeof analysis.confidenceRationale === "string"
      ? analysis.confidenceRationale
      : null,
    rubricBreakdown: analysis.rubricBreakdown ?? null,
    raw: analysis,
  };
}

export const SCORING_LIMITS = {
  MAX_TRANSCRIPT_LINES: 500,
  MAX_TRANSCRIPT_CHARS: 50_000,
  MAX_COURSE_NAME_LEN: 200,
  MAX_STUDENT_NAME_LEN: 100,
};

export function validateTranscript(
  input: unknown,
  courseNameIn: unknown,
  studentNameIn: unknown,
): {
  courseName: string;
  studentName: string;
  transcriptions: TranscriptLine[];
} | string {
  if (typeof courseNameIn !== "string" || courseNameIn.length === 0) {
    return "courseName required";
  }
  if (courseNameIn.length > SCORING_LIMITS.MAX_COURSE_NAME_LEN) {
    return "courseName too long";
  }
  if (typeof studentNameIn !== "string" || studentNameIn.length === 0) {
    return "studentName required";
  }
  if (studentNameIn.length > SCORING_LIMITS.MAX_STUDENT_NAME_LEN) {
    return "studentName too long";
  }
  if (!Array.isArray(input) || input.length === 0) {
    return "transcriptions required";
  }
  if (input.length > SCORING_LIMITS.MAX_TRANSCRIPT_LINES) {
    return "too many transcript lines";
  }
  const lines: TranscriptLine[] = [];
  let totalChars = 0;
  for (const item of input) {
    if (!item || typeof item !== "object") return "malformed transcript item";
    const t = item as Record<string, unknown>;
    if (typeof t.speaker !== "string" || typeof t.text !== "string") {
      return "transcript item missing speaker/text";
    }
    totalChars += t.text.length;
    if (totalChars > SCORING_LIMITS.MAX_TRANSCRIPT_CHARS) {
      return "transcript too long";
    }
    lines.push({ speaker: t.speaker, text: t.text });
  }
  return {
    courseName: courseNameIn,
    studentName: studentNameIn,
    transcriptions: lines,
  };
}
