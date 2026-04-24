import { supabase, isSupabaseConfigured } from '../supabase/client';
import {
    TranscriptionItem,
    Submission,
    LatencyMetrics,
    BargeInEvent,
    DialogueMetrics,
    ArgumentGraph,
    ReasoningRubric,
} from '../../types';

// All scoring + persistence now happens server-side in the submit-exam Edge
// Function. The client no longer needs a Gemini API key.

interface SubmitExamPayload {
    courseId: string;
    courseName: string;
    coursePassword: string;
    studentName: string;
    transcriptions: TranscriptionItem[];
    latencyMetrics: LatencyMetrics;
    bargeInEvents: BargeInEvent[];
    dialogueMetrics: DialogueMetrics;
    argumentGraph: ArgumentGraph;
    reasoningRubric: ReasoningRubric;
    deviceId?: string;
}

export class EvaluationService {
    static async submitExam(payload: SubmitExamPayload): Promise<Submission> {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        }

        const { data, error } = await supabase.functions.invoke('submit-exam', {
            body: {
                courseId: payload.courseId,
                coursePassword: payload.coursePassword,
                courseName: payload.courseName,
                studentName: payload.studentName,
                transcriptions: payload.transcriptions,
                latencyMetrics: payload.latencyMetrics,
                bargeInEvents: payload.bargeInEvents,
                dialogueMetrics: payload.dialogueMetrics,
                argumentGraph: payload.argumentGraph,
                reasoningRubric: payload.reasoningRubric,
                deviceId: payload.deviceId,
            },
        });

        if (error) {
            throw new Error(error.message || 'submit-exam failed');
        }
        const sub = data?.submission;
        if (!sub) {
            throw new Error('submit-exam returned no submission');
        }
        return sub as Submission;
    }
}

export default EvaluationService;
