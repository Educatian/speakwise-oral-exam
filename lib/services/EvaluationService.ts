import { GoogleGenAI, Type } from '@google/genai';
import { createFeedbackPrompt } from '../prompts/interviewerSystem';
import { TranscriptionItem, Submission, RubricBreakdown, LatencyMetrics, BargeInEvent, DialogueMetrics, ArgumentGraph, ReasoningRubric } from '../../types';

interface EvaluationPayload {
    courseName: string;
    studentName: string;
    transcriptions: TranscriptionItem[];
    latencyMetrics: LatencyMetrics;
    bargeInEvents: BargeInEvent[];
    dialogueMetrics: DialogueMetrics;
    argumentGraph: ArgumentGraph;
    reasoningRubric: ReasoningRubric;
}

const sanitizeTranscript = (text: string) => {
    return text.replace(/\[\/?(thought|reflection)\]/g, '').trim();
};

/** Schema for a single Toulmin component in LLM response */
const TOULMIN_COMPONENT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        count: { type: Type.NUMBER },
        examples: { type: Type.ARRAY, items: { type: Type.STRING } }
    }
};

export class EvaluationService {
    static async evaluateTranscripts(payload: EvaluationPayload): Promise<Submission> {
        const {
            courseName,
            studentName,
            transcriptions,
            latencyMetrics,
            bargeInEvents,
            dialogueMetrics,
            argumentGraph,
            reasoningRubric
        } = payload;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        const transcriptStr = transcriptions
            .map((t: TranscriptionItem) => `${t.speaker}: ${sanitizeTranscript(t.text)}`)
            .join('\n');

        const feedbackPrompt = createFeedbackPrompt(courseName, transcriptStr);

        const res = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: feedbackPrompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        score: { type: Type.NUMBER },
                        feedback: { type: Type.STRING },
                        confidenceScore: { type: Type.NUMBER },
                        confidenceRationale: { type: Type.STRING },
                        rubricBreakdown: {
                            type: Type.OBJECT,
                            properties: {
                                conceptualUnderstanding: {
                                    type: Type.OBJECT,
                                    properties: {
                                        score: { type: Type.NUMBER },
                                        evidence: { type: Type.ARRAY, items: { type: Type.STRING } }
                                    }
                                },
                                communicationClarity: {
                                    type: Type.OBJECT,
                                    properties: {
                                        score: { type: Type.NUMBER },
                                        evidence: { type: Type.ARRAY, items: { type: Type.STRING } }
                                    }
                                },
                                criticalThinking: {
                                    type: Type.OBJECT,
                                    properties: {
                                        score: { type: Type.NUMBER },
                                        evidence: { type: Type.ARRAY, items: { type: Type.STRING } }
                                    }
                                },
                                engagement: {
                                    type: Type.OBJECT,
                                    properties: {
                                        score: { type: Type.NUMBER },
                                        evidence: { type: Type.ARRAY, items: { type: Type.STRING } }
                                    }
                                }
                            }
                        },
                        // Toulmin 2nd-pass classification by LLM
                        toulminClassification: {
                            type: Type.OBJECT,
                            properties: {
                                claim: TOULMIN_COMPONENT_SCHEMA,
                                data: TOULMIN_COMPONENT_SCHEMA,
                                warrant: TOULMIN_COMPONENT_SCHEMA,
                                backing: TOULMIN_COMPONENT_SCHEMA,
                                qualifier: TOULMIN_COMPONENT_SCHEMA,
                                rebuttal: TOULMIN_COMPONENT_SCHEMA
                            }
                        }
                    },
                    required: ['score', 'feedback']
                }
            }
        });

        const analysis = JSON.parse(res.text || '{}');

        // ── Merge LLM Toulmin with pattern-based Toulmin ──
        // LLM provides context-aware classification; pattern-based provides real-time baseline
        const mergedRubric: ReasoningRubric = { ...reasoningRubric };

        if (analysis.toulminClassification) {
            const llmToulmin = analysis.toulminClassification;
            const patternToulmin = reasoningRubric.toulminAnalysis;

            // Build merged Toulmin: prefer LLM counts (context-aware) but keep pattern examples as fallback
            const mergeComponent = (
                llmComp: { count?: number; examples?: string[] } | undefined,
                patternComp: { detected: boolean; count: number; examples: string[] } | undefined
            ) => ({
                detected: (llmComp?.count ?? 0) > 0 || (patternComp?.detected ?? false),
                count: llmComp?.count ?? patternComp?.count ?? 0,
                examples: [
                    ...(llmComp?.examples || []),
                    ...(patternComp?.examples || [])
                ].slice(0, 5) // Limit to 5 examples
            });

            const mergedClaim = mergeComponent(llmToulmin.claim, patternToulmin?.claim);
            const mergedData = mergeComponent(llmToulmin.data, patternToulmin?.data);
            const mergedWarrant = mergeComponent(llmToulmin.warrant, patternToulmin?.warrant);
            const mergedBacking = mergeComponent(llmToulmin.backing, patternToulmin?.backing);
            const mergedQualifier = mergeComponent(llmToulmin.qualifier, patternToulmin?.qualifier);
            const mergedRebuttal = mergeComponent(llmToulmin.rebuttal, patternToulmin?.rebuttal);

            // Recalculate completeness with merged data
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

        // Build extended submission with LA data
        const submission: Submission = {
            id: Math.random().toString(36).substr(2, 9),
            studentName,
            courseName: courseName,
            timestamp: Date.now(),
            transcript: transcriptions,
            score: Math.min(100, Math.max(0, Math.round(analysis.score || 0))),
            feedback: analysis.feedback || 'No feedback generated.',

            // Learning Analytics
            latencyMetrics,
            bargeInEvents,

            // Advanced Reasoning Analytics (with merged Toulmin)
            dialogueMetrics,
            argumentGraph,
            reasoningRubric: mergedRubric,

            // AI Confidence & Rubric
            confidenceScore: analysis.confidenceScore,
            confidenceRationale: analysis.confidenceRationale,
            rubricBreakdown: analysis.rubricBreakdown as RubricBreakdown
        };

        return submission;
    }
}
