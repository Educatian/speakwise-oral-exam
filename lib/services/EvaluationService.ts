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
                        }
                    },
                    required: ['score', 'feedback']
                }
            }
        });

        const analysis = JSON.parse(res.text || '{}');

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

            // Advanced Reasoning Analytics
            dialogueMetrics,
            argumentGraph,
            reasoningRubric,

            // AI Confidence & Rubric
            confidenceScore: analysis.confidenceScore,
            confidenceRationale: analysis.confidenceRationale,
            rubricBreakdown: analysis.rubricBreakdown as RubricBreakdown
        };

        return submission;
    }
}
