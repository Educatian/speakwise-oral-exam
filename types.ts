// Types & Interfaces for SpeakWise Platform

// Admin email - single super admin
export const ADMIN_EMAIL = 'jewoong.moon@gmail.com';

// User role hierarchy (higher = more permissions)
export enum UserRole {
  STUDENT = 'student',
  INSTRUCTOR = 'instructor',
  MODERATOR = 'moderator',
  ADMIN = 'admin'
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

/** Reasoning Rubric - 4 Dimension Assessment */
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
}

/** Argument Graph Edge */
export interface ArgumentEdge {
  from: string;
  to: string;
  relation: 'supports' | 'refutes' | 'extends' | 'responds_to';
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

  // Human-in-the-Loop
  confidenceScore?: number;         // AI's confidence in evaluation (0.0-1.0)
  confidenceRationale?: string;     // Why AI is confident/uncertain
  rubricBreakdown?: RubricBreakdown;

  // Metacognition
  reflectionPrompt?: string;        // Question asked after interview
  reflectionResponse?: string;      // Student's reflection answer

  // Reasoning Analytics (Advanced)
  reasoningRubric?: ReasoningRubric;
  dialogueMetrics?: DialogueMetrics;
  argumentGraph?: ArgumentGraph;
}

export interface Course {
  id: string;
  name: string;
  instructorName: string;      // Instructor display name
  instructorPinHash: string;   // SHA-256 hashed PIN (for submission viewing)
  password: string;            // Student passcode
  prompt: string;
  submissions: Submission[];
  createdAt?: number;          // Creation timestamp
  ownerEmail?: string;         // Owner's email for visibility control
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
// Component Props Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StudentLoginProps {
  onLogin: (course: Course, studentName: string) => void;
  onViewHistory: () => void;
  onManagerAccess: () => void;
  courses: Course[];
}

export interface InterviewSessionProps {
  course: Course;
  studentName: string;
  onEnd: (submission: Submission) => void;
  onBack: () => void;
}

export interface ManagerDashboardProps {
  courses: Course[];
  onAddCourse: (course: Course) => void;
  onDeleteCourse: (id: string) => void;
  onBack: () => void;
}

export interface SubmissionModalProps {
  submission: Submission;
  onClose: () => void;
}

export interface StudentHistoryProps {
  submissions: Submission[];
  onSelectSubmission: (submission: Submission) => void;
  onBack: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Return Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseGeminiLiveReturn {
  status: InterviewStatus;
  transcriptions: TranscriptionItem[];
  isInterviewerSpeaking: boolean;
  isUserSpeaking: boolean;        // Whether user is currently speaking
  audioLevel: number;             // 0-100 normalized audio level
  pendingUserText: string;        // Real-time partial user transcription
  pendingAIText: string;          // Real-time partial AI transcription
  error: string | null;

  // Learning Analytics (Basic)
  latencyMetrics: LatencyMetrics;
  bargeInEvents: BargeInEvent[];

  // Advanced Analytics
  dialogueMetrics: DialogueMetrics;
  argumentGraph: ArgumentGraph;
  getReasoningRubric: () => ReasoningRubric;

  // Session control
  startSession: () => Promise<void>;
  endSession: () => void;
}

export interface UseCourseStorageReturn {
  courses: Course[];
  loading: boolean;
  addCourse: (course: Omit<Course, 'id' | 'submissions'>) => Course;
  deleteCourse: (id: string) => void;
  addSubmission: (courseId: string, submission: Submission) => void;
}

export interface UseStudentHistoryReturn {
  history: Submission[];
  loading: boolean;
  addToHistory: (submission: Submission) => void;
  clearHistory: () => void;
}
