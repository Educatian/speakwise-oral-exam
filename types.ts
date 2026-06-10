// Types & Interfaces for SpeakWise Platform

// Admin email - single super admin
export const ADMIN_EMAIL = 'jewoong.moon@gmail.com';

// Instructor emails - users with instructor privileges
// TODO: Move to Supabase database for dynamic management
export const INSTRUCTOR_EMAILS = [
  'jewoong.moon@gmail.com',
  'yongju017@gmail.com',
];

// Check if an email has instructor privileges
export function isInstructorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase().trim();
  return INSTRUCTOR_EMAILS.some(e => e.toLowerCase() === normalizedEmail);
}

// Check if an email has admin privileges
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase();
}

// User role hierarchy (higher = more permissions)
export enum UserRole {
  STUDENT = 'student',
  INSTRUCTOR = 'instructor',
  MODERATOR = 'moderator',
  ADMIN = 'admin'
}

export interface Institution {
  id: string;
  name: string;
  accessCode?: string;
  domain?: string;
  logoUrl?: string;
  primaryColor?: string;
  isActive?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  schoolId?: string;
  schoolName?: string;
  createdAt?: string;
}

export enum AppView {
  LANDING = 'LANDING',
  // New unified auth flow
  UNIFIED_AUTH = 'UNIFIED_AUTH',
  SCHOOL_SELECT = 'SCHOOL_SELECT',
  // Admin panel
  ADMIN_PANEL = 'ADMIN_PANEL',
  // Instructor flow
  INSTRUCTOR_LOGIN = 'INSTRUCTOR_LOGIN',
  INSTRUCTOR_DASHBOARD = 'INSTRUCTOR_DASHBOARD',
  // Student flow
  STUDENT_COURSES = 'STUDENT_COURSES',
  STUDENT_LOGIN = 'STUDENT_LOGIN',
  STUDENT_INTERVIEW = 'STUDENT_INTERVIEW',
  STUDENT_RESULTS = 'STUDENT_RESULTS',
  STUDENT_HISTORY = 'STUDENT_HISTORY',
  MANAGER_DASHBOARD = 'MANAGER_DASHBOARD' // Legacy alias
}

export enum InterviewStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  LIVE = 'LIVE',
  ENDED = 'ENDED',
  ERROR = 'ERROR'
}

// ─────────────────────────────────────────────────────────────────────────────
// Learning Analytics Types
// ─────────────────────────────────────────────────────────────────────────────

/** Bloom's Taxonomy levels for question classification */
export type BloomsLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';

/** Enhanced transcription item with LA metadata */
export interface TranscriptionItem {
  speaker: 'user' | 'interviewer';
  text: string;
  timestamp: number;            // Unix timestamp (ms)

  // Learning Analytics fields
  latency?: number;             // Time since previous turn ended (ms)
  duration?: number;            // Speaking duration (ms)
  pauseCount?: number;          // Number of pauses during speech
  isBargeIn?: boolean;          // Did user interrupt AI?
  bloomsLevel?: BloomsLevel;    // Question difficulty level (for interviewer)
}

/** Barge-in event tracking */
export interface BargeInEvent {
  timestamp: number;
  interruptedContent: string;   // What AI was saying
  studentUtterance: string;     // What student said
  interpretationType: 'confidence' | 'hasty_generalization' | 'correction' | 'unknown';
  recoveredFromTranscript?: boolean;
}

export type RawTranscriptTurnStatus = 'pending' | 'transcribed' | 'failed' | 'too_short' | 'empty';

export interface RawTranscriptTurn {
  id: string;
  speaker: 'user';
  timestamp: number;
  durationMs: number;
  sampleCount: number;
  audioBase64: string;
  status: RawTranscriptTurnStatus;
  transcriptText?: string;
  error?: string;
  latency?: number;
  isBargeIn?: boolean;
}

/** Response latency metrics */
export interface LatencyMetrics {
  avgInitialLatency: number;    // Average time to start responding (ms)
  maxLatency: number;           // Longest response delay (ms)
  minLatency: number;           // Shortest response delay (ms)
  totalThinkingTime: number;    // Sum of all response delays (ms)
  turnCount: number;            // Number of student turns
  turnTakingRatio: number;      // Student speaking time / AI speaking time
}

/** Scaffolding event tracking */
export interface ScaffoldingEvent {
  questionNumber: number;
  originalQuestion: string;
  scaffoldLevel: 1 | 2 | 3;
  hintType: 'conceptual' | 'example' | 'subquestion';
  hintContent: string;
  studentResponseAfterHint: string;
  wasSuccessful: boolean;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reasoning Analytics Types (Advanced)
// ─────────────────────────────────────────────────────────────────────────────

/** Reasoning Rubric - 4 Dimension Assessment + Toulmin Model */
export interface ReasoningRubric {
  /** 근거/사실 기반 설명 */
  explicitJustification: {
    score: number;           // 0-5
    count: number;           // 근거 제시 횟수
    examples: string[];      // 감지된 문장들
  };
  /** 원인-결과 관계 설명 */
  causalExplanation: {
    score: number;
    patterns: string[];      // "because", "therefore" 패턴
  };
  /** 반론/질문에 대한 논리적 재구성 */
  counterArgumentHandling: {
    score: number;
    attempts: number;        // 반론 처리 시도 횟수
  };
  /** 단일 사례→일반화 시도 */
  abstractionGeneralization: {
    score: number;
    instances: string[];     // 일반화 시도 문장
  };
  /** Toulmin 모델 분석 (Claim/Data/Warrant/Backing/Qualifier/Rebuttal) */
  toulminAnalysis?: {
    claim: { detected: boolean; count: number; examples: string[] };
    data: { detected: boolean; count: number; examples: string[] };
    warrant: { detected: boolean; count: number; examples: string[] };
    backing: { detected: boolean; count: number; examples: string[] };
    qualifier: { detected: boolean; count: number; examples: string[] };
    rebuttal: { detected: boolean; count: number; examples: string[] };
    completenessScore: number;
    missingComponents: string[];
  };
  /** 종합 점수 */
  overallReasoningScore: number; // 0-100
}

/** Real-Time Dialogue Metrics */
export interface DialogueMetrics {
  turnInitiatives: number;        // 학생 주도 대화 횟수
  rephrasingEvents: number;       // 재구성 시도 횟수
  followUpDepth: number[];        // AI 질문 후 확장 설명 길이 (chars)
  avgFollowUpDepth: number;       // 평균 확장 설명 길이
  latencyVariation: number;       // 지연 시간 표준편차
  questionResponseRatio: number;  // 질문 대비 응답 비율
}

/** Argument Graph Node */
export interface ArgumentNode {
  id: string;
  type: 'claim' | 'evidence' | 'counterargument' | 'justification' | 'question';
  content: string;
  speaker: 'user' | 'interviewer';
  timestamp: number;
  metadata?: { conceptType?: string; [key: string]: any };
}

/** Argument Graph Edge */
export interface ArgumentEdge {
  from: string;
  to: string;
  relation: string;
  type?: string;
}

/** Argument Structure Graph */
export interface ArgumentGraph {
  nodes: ArgumentNode[];
  edges: ArgumentEdge[];
  coherenceScore: number;         // 논리적 일관성 점수
  complexity: number;             // 그래프 복잡도 (노드 수 + 엣지 수)
}

/** Rubric breakdown with evidence */
export interface RubricBreakdown {
  conceptualUnderstanding: { score: number; evidence: string[] };
  communicationClarity: { score: number; evidence: string[] };
  criticalThinking: { score: number; evidence: string[] };
  engagement: { score: number; evidence: string[] };
}

export type InstructorReviewStatus = 'pending' | 'validated' | 'overridden';

export interface InstructorReview {
  status: InstructorReviewStatus;
  reviewerName: string;
  reviewerEmail?: string;
  reviewedAt: number;
  overrideScore?: number | null;
  notes?: string;
}

export type SubmissionAnnotationCategory = 'strength' | 'concern' | 'evidence' | 'follow_up';

export interface SubmissionAnnotation {
  id: string;
  submissionId: string;
  transcriptIndex: number;
  category: SubmissionAnnotationCategory;
  note: string;
  authorName: string;
  authorEmail?: string;
  createdAt: number;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  description: string;
  targetType: 'course' | 'submission' | 'review' | 'user' | 'template' | 'institution';
  targetId: string;
  actorName?: string;
  actorEmail?: string;
  institutionId?: string;
  createdAt: number;
  metadata?: Record<string, any>;
}

export interface CourseTemplate {
  id: string;
  name: string;
  prompt: string;
  instructorName: string;
  institutionId?: string;
  institutionName?: string;
  sourceCourseId?: string;
  createdByEmail?: string;
  createdAt: number;
  interviewSettings?: CourseInterviewSettings;
}

export interface CourseInterviewSettings {
  silenceThresholdMs: number;
  minTurnDurationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Data Types
// ─────────────────────────────────────────────────────────────────────────────

/** Extended submission with LA data */
export interface Submission {
  id: string;
  studentName: string;
  timestamp: number;
  transcript: TranscriptionItem[];
  score: number;
  feedback: string;
  courseName?: string;

  // Learning Analytics (Basic)
  latencyMetrics?: LatencyMetrics;
  bargeInEvents?: BargeInEvent[];
  scaffoldingEvents?: ScaffoldingEvent[];
  rawTranscriptTurns?: RawTranscriptTurn[];
  failedTranscriptions?: RawTranscriptTurn[];

  // Human-in-the-Loop
  confidenceScore?: number;         // AI's confidence in evaluation (0.0-1.0)
  confidenceRationale?: string;     // Why AI is confident/uncertain
  rubricBreakdown?: RubricBreakdown;
  instructorReview?: InstructorReview;
  annotations?: SubmissionAnnotation[];

  // Metacognition
  reflectionPrompt?: string;        // Question asked after interview
  reflectionResponse?: string;      // Student's reflection answer

  // Reasoning Analytics (Advanced)
  reasoningRubric?: ReasoningRubric;
  dialogueMetrics?: DialogueMetrics;
  argumentGraph?: ArgumentGraph;

  // Evaluation provenance & human-review triage
  scoreAgreement?: number;      // |LLM score − pattern reasoning score| (0-100); lower = more convergent
  needsReview?: boolean;        // true when confidence/agreement/coverage signals warrant a human look
  reviewReasons?: string[];     // human-readable reasons this submission was flagged for review
  analysisVersion?: string;     // analytics-pipeline version stamp (reproducibility/audit)
  promptVersion?: string;       // evaluation-prompt version stamp
  evalModel?: string;           // model id used for the LLM scoring pass
}

export interface Course {
  id: string;
  name: string;
  instructorName: string;      // Instructor display name
  instructorPinHash: string;   // SHA-256 hashed PIN (for submission viewing) — staff-only (secrets RPC); '' for students
  password?: string;           // Student entry passcode — SECRET. Present only for staff (get_staff_course_secrets) or in localStorage-only mode; students verify via the verify_course_entry RPC
  prompt: string;              // Examiner brief — '' in student course lists; delivered at join time through verify_course_entry
  submissions: Submission[];
  createdAt?: number;          // Creation timestamp
  ownerEmail?: string;         // Owner's email for visibility control
  institutionId?: string;      // Institution workspace this course belongs to
  institutionName?: string;
  templateId?: string;
  interviewSettings?: CourseInterviewSettings;
}

export interface InterviewSummary {
  strengths: string[];
  areasOfImprovement: string[];
  overallScore: number;
  detailedFeedback: string;
}

// Gemini Live Session Types
export interface GeminiLiveConfig {
  model: string;
  systemInstruction: string;
  voiceName?: string;
}

export interface AudioContexts {
  input: AudioContext;
  output: AudioContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Return Types
// ─────────────────────────────────────────────────────────────────────────────
//
// NOTE: Per-view prop interfaces (StudentLoginProps, InterviewSessionProps, …)
// were removed — they were unused and had drifted out of sync with the actual
// components, which define their own inline prop types. The hook-return types
// useCourseStorage/useStudentHistory rely on are likewise defined locally in
// their own hook files; only UseGeminiLiveReturn below is consumed from here.

/** Turn phase for turn-based interview flow */
export type TurnPhase = 'ai_speaking' | 'recording' | 'transcribing' | 'idle';

export interface UseGeminiLiveReturn {
  status: InterviewStatus;
  transcriptions: TranscriptionItem[];
  isInterviewerSpeaking: boolean;
  isUserSpeaking: boolean;        // Whether user is currently speaking
  audioLevel: number;             // 0-100 normalized audio level
  pendingUserText: string;        // Real-time partial user transcription
  pendingAIText: string;          // Real-time partial AI transcription
  error: string | null;
  turnPhase: TurnPhase;           // Current turn phase
  isReconnecting: boolean;        // A dropped session is being auto-restored
  recognitionNotice: string | null; // Transient "didn't catch that" hint to the student

  // Learning Analytics (Basic)
  latencyMetrics: LatencyMetrics;
  bargeInEvents: BargeInEvent[];
  rawTranscriptTurns: RawTranscriptTurn[];
  failedTranscriptions: RawTranscriptTurn[];

  // Advanced Analytics
  dialogueMetrics: DialogueMetrics;
  argumentGraph: ArgumentGraph;
  getReasoningRubric: () => ReasoningRubric;

  // Session control
  startSession: () => Promise<void>;
  endSession: () => Promise<TranscriptionItem[]>;
  stopRecording: () => void;      // Manually stop recording (user presses "Done")
}

// ─────────────────────────────────────────────────────────────────────────────
// Group Knowledge Network Types
// ─────────────────────────────────────────────────────────────────────────────

/** Aggregated concept node from multiple students */
export interface GroupNode {
  id: string;
  label: string;
  type: 'claim' | 'evidence' | 'counterargument' | 'justification';
  frequency: number;          // how many students mentioned it
  studentCount: number;       // total students in group
}

/** Aggregated relationship edge */
export interface GroupEdge {
  from: string;
  to: string;
  weight: number;
  relation: string;
}

/** Fused group knowledge network */
export interface GroupNetwork {
  nodes: GroupNode[];
  edges: GroupEdge[];
  totalStudents: number;
}

/** Anonymous peer claim for comparison */
export interface PeerClaimGroup {
  claim: string;
  count: number;             // how many peers share this claim
  isShared: boolean;         // shared with current student?
}
