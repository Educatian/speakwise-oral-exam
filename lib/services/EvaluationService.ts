import { createFeedbackPrompt } from '../prompts/interviewerSystem';
import {
    TranscriptionItem,
    Submission,
    RubricBreakdown,
    LatencyMetrics,
    BargeInEvent,
    DialogueMetrics,
    ArgumentGraph,
    ReasoningRubric,
    RawTranscriptTurn
} from '../../types';
import { chatCompleteJson, DEFAULT_MODEL } from './aiClient';

// Version stamps written onto every Submission so an exported cohort row can be
// traced back to the exact analytics pipeline + prompt that produced it. Bump
// these whenever the scoring logic or feedback prompt changes materially.
const ANALYSIS_VERSION = '2.4.0';
const PROMPT_VERSION = 'feedback+toulmin-v1';

// Thresholds for the human-review triage. Kept here (not magic numbers inline)
// so the policy is auditable and tunable in one place.
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const SCORE_DISAGREEMENT_THRESHOLD = 30; // points, on a 0-100 scale
const MIN_STUDENT_TURNS = 3;

interface EvaluationPayload {
    courseName: string;
    studentName: string;
    transcriptions: TranscriptionItem[];
    latencyMetrics: LatencyMetrics;
    bargeInEvents: BargeInEvent[];
    rawTranscriptTurns: RawTranscriptTurn[];
    failedTranscriptions: RawTranscriptTurn[];
    dialogueMetrics: DialogueMetrics;
    argumentGraph: ArgumentGraph;
    reasoningRubric: ReasoningRubric;
}

interface FeedbackResponse {
    score?: number;
    feedback?: string;
    confidenceScore?: number;
    confidenceRationale?: string;
    rubricBreakdown?: RubricBreakdown;
    toulminClassification?: {
        claim?: { count?: number; examples?: string[] };
        data?: { count?: number; examples?: string[] };
        warrant?: { count?: number; examples?: string[] };
        backing?: { count?: number; examples?: string[] };
        qualifier?: { count?: number; examples?: string[] };
        rebuttal?: { count?: number; examples?: string[] };
    };
}

const sanitizeTranscript = (text: string) => {
    return text.replace(/\[\/?(thought|reflection)\]/g, '').trim();
};

// OpenRouter's json_object mode enforces valid JSON but does not enforce a
// schema. The structured instruction lives in the prompt itself — the base
// prompt in interviewerSystem.ts already lists score / feedback /
// rubricBreakdown; we only append the Toulmin block.
const TOULMIN_PROMPT_ADDENDUM = `

Additionally, include a "toulminClassification" field with these six keys, each containing detected examples and counts from the transcript:
{
  "toulminClassification": {
    "claim":     { "count": <int>, "examples": ["quote", ...] },
    "data":      { "count": <int>, "examples": ["quote", ...] },
    "warrant":   { "count": <int>, "examples": ["quote", ...] },
    "backing":   { "count": <int>, "examples": ["quote", ...] },
    "qualifier": { "count": <int>, "examples": ["quote", ...] },
    "rebuttal":  { "count": <int>, "examples": ["quote", ...] }
  }
}

Return the full object (score, feedback, confidenceScore, confidenceRationale, rubricBreakdown, toulminClassification) as one valid JSON document. Do not wrap it in markdown fences.`;

export class EvaluationService {
    static async evaluateTranscripts(payload: EvaluationPayload): Promise<Submission> {
        const {
            courseName,
            studentName,
            transcriptions,
            latencyMetrics,
            bargeInEvents,
            rawTranscriptTurns,
            failedTranscriptions,
            dialogueMetrics,
            argumentGraph,
            reasoningRubric
        } = payload;

        const transcriptStr = transcriptions
            .map((t: TranscriptionItem) => `${t.speaker}: ${sanitizeTranscript(t.text)}`)
            .join('\n');

        const feedbackPrompt = createFeedbackPrompt(courseName, transcriptStr) + TOULMIN_PROMPT_ADDENDUM;

        const analysis = await chatCompleteJson<FeedbackResponse>(feedbackPrompt);

        // ── Merge LLM Toulmin with pattern-based Toulmin ──
        // LLM provides context-aware classification; pattern-based provides real-time baseline
        const mergedRubric: ReasoningRubric = { ...reasoningRubric };

        if (analysis.toulminClassification) {
            const llmToulmin = analysis.toulminClassification;
            const patternToulmin = reasoningRubric.toulminAnalysis;

            const mergeComponent = (
                llmComp: { count?: number; examples?: string[] } | undefined,
                patternComp: { detected: boolean; count: number; examples: string[] } | undefined
            ) => ({
                detected: (llmComp?.count ?? 0) > 0 || (patternComp?.detected ?? false),
                count: llmComp?.count ?? patternComp?.count ?? 0,
                examples: [
                    ...(llmComp?.examples || []),
                    ...(patternComp?.examples || [])
                ].slice(0, 5)
            });

            const mergedClaim = mergeComponent(llmToulmin.claim, patternToulmin?.claim);
            const mergedData = mergeComponent(llmToulmin.data, patternToulmin?.data);
            const mergedWarrant = mergeComponent(llmToulmin.warrant, patternToulmin?.warrant);
            const mergedBacking = mergeComponent(llmToulmin.backing, patternToulmin?.backing);
            const mergedQualifier = mergeComponent(llmToulmin.qualifier, patternToulmin?.qualifier);
            const mergedRebuttal = mergeComponent(llmToulmin.rebuttal, patternToulmin?.rebuttal);

            const weights = { claim: 0.10, data: 0.25, warrant: 0.25, backing: 0.15, qualifier: 0.10, rebuttal: 0.15 };
            const completenessScore = Math.round(
                ((mergedClaim.detected ? weights.claim : 0) +
                 (mergedData.detected ? weights.data : 0) +
                 (mergedWarrant.detected ? weights.warrant : 0) +
                 (mergedBacking.detected ? weights.backing : 0) +
                 (mergedQualifier.detected ? weights.qualifier : 0) +
                 (mergedRebuttal.detected ? weights.rebuttal : 0)) * 100
            );

            const missingComponents: string[] = [];
            if (!mergedData.detected) missingComponents.push('Data/Evidence');
            if (!mergedWarrant.detected) missingComponents.push('Warrant (logical bridge)');
            if (!mergedBacking.detected) missingComponents.push('Backing (external support)');
            if (!mergedQualifier.detected) missingComponents.push('Qualifier (certainty degree)');
            if (!mergedRebuttal.detected) missingComponents.push('Rebuttal (counter-consideration)');

            mergedRubric.toulminAnalysis = {
                claim: mergedClaim,
                data: mergedData,
                warrant: mergedWarrant,
                backing: mergedBacking,
                qualifier: mergedQualifier,
                rebuttal: mergedRebuttal,
                completenessScore,
                missingComponents
            };
        }

        // ── Confidence calibration against objective session signals ──
        // The LLM self-reports confidence, but it cannot see how much of the
        // session was actually captured. Cap its self-rating using signals it
        // is blind to (dropped transcriptions, a sparse dialogue) so a high
        // self-rating can never mask a thin evidence base. This serves the
        // "evidence over mystery" principle and protects instructor trust.
        const rawConfidence =
            typeof analysis.confidenceScore === 'number'
                ? Math.max(0, Math.min(1, analysis.confidenceScore))
                : undefined;
        const studentTurns = transcriptions.filter((t) => t.speaker === 'user').length;
        const failedCount = failedTranscriptions?.length ?? 0;

        let calibratedConfidence = rawConfidence;
        const calibrationNotes: string[] = [];
        if (rawConfidence != null) {
            if (failedCount > 0) {
                calibratedConfidence = Math.min(calibratedConfidence!, 0.5);
                calibrationNotes.push(`${failedCount} response(s) could not be transcribed`);
            }
            if (studentTurns < MIN_STUDENT_TURNS) {
                calibratedConfidence = Math.min(calibratedConfidence!, 0.6);
                calibrationNotes.push(`only ${studentTurns} student turn(s) captured`);
            }
        }

        // ── LLM ↔ pattern agreement (validity cross-check) ──
        // submission.score comes purely from the LLM; reasoningRubric.overall
        // comes purely from deterministic pattern matching. They measure
        // related-but-distinct things, so a large gap is a signal to look, not
        // proof of error. We surface the gap rather than silently averaging.
        const llmScore = Math.min(100, Math.max(0, Math.round(analysis.score || 0)));
        const patternScore = Math.round(mergedRubric.overallReasoningScore ?? 0);
        const scoreAgreement = Math.abs(llmScore - patternScore);

        // ── Human-review triage ──
        const reviewReasons: string[] = [];
        if (calibratedConfidence != null && calibratedConfidence < LOW_CONFIDENCE_THRESHOLD) {
            reviewReasons.push(`Low model confidence (${Math.round(calibratedConfidence * 100)}%)`);
        }
        if (scoreAgreement > SCORE_DISAGREEMENT_THRESHOLD) {
            reviewReasons.push(
                `LLM score (${llmScore}) and reasoning score (${patternScore}) disagree by ${scoreAgreement} points`
            );
        }
        if (failedCount > 0) {
            reviewReasons.push(`${failedCount} untranscribed response(s) may have lowered the score`);
        }
        if (studentTurns < MIN_STUDENT_TURNS) {
            reviewReasons.push('Very short session — limited evidence for scoring');
        }
        const needsReview = reviewReasons.length > 0;

        const confidenceRationale =
            [
                analysis.confidenceRationale,
                calibrationNotes.length ? `Adjusted for: ${calibrationNotes.join('; ')}.` : ''
            ]
                .filter(Boolean)
                .join(' ')
                .trim() || undefined;

        const submission: Submission = {
            id: Math.random().toString(36).substr(2, 9),
            studentName,
            courseName,
            timestamp: Date.now(),
            transcript: transcriptions,
            score: llmScore,
            feedback: analysis.feedback || 'No feedback generated.',

            latencyMetrics,
            bargeInEvents,
            rawTranscriptTurns,
            failedTranscriptions,

            dialogueMetrics,
            argumentGraph,
            reasoningRubric: mergedRubric,

            confidenceScore: calibratedConfidence,
            confidenceRationale,
            rubricBreakdown: analysis.rubricBreakdown as RubricBreakdown,

            // Review triage + provenance
            scoreAgreement,
            needsReview,
            reviewReasons,
            analysisVersion: ANALYSIS_VERSION,
            promptVersion: PROMPT_VERSION,
            evalModel: DEFAULT_MODEL
        };

        return submission;
    }
}

export default EvaluationService;
