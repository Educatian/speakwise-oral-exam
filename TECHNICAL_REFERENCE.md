# SpeakWise 2.3: AI-Mediated Oral Examination Platform
## Technical Specification for Educational Technology Research

**Version**: 2.3.0 (Full Auth + Reasoning Analytics)  
**Last Updated**: 2026-01-29  
**Implementation Status**: ✅ Production Ready

---

## Abstract

SpeakWise는 Gemini 2.5 Flash Native Audio API를 활용한 AI 기반 실시간 구술 시험 플랫폼이다. 본 문서는 시스템의 기술적 구현 세부사항, 설계 결정의 이론적 근거, 그리고 **학습 분석(Learning Analytics)** 연구를 위한 데이터 수집 구조를 상세히 기술한다. 특히, **과정(Process)** 중심의 학습 데이터 수집을 통해 인지 부하, 메타인지, 대화 역학 등의 연구 확장성을 지원한다.

**Keywords**: AI-Mediated Dialogue, Oral Examination, Voice User Interface, Real-time Transcription, Formative Assessment, Learning Analytics, Cognitive Load, Prosodic Analysis, Scaffolding, Gemini Live API

---

## Implementation Status Summary

| Feature | Status | Module |
|---------|--------|--------|
| Supabase Auth System | ✅ IMPLEMENTED | `lib/supabase/auth.ts` |
| 4-Tier Role Hierarchy | ✅ IMPLEMENTED | `types.ts` |
| Database Instructor Whitelist | ✅ IMPLEMENTED | `lib/supabase/database.ts` |
| Unified Auth Flow | ✅ IMPLEMENTED | `UnifiedAuthView.tsx` |
| School Management | ✅ IMPLEMENTED | `SchoolSelectView.tsx` |
| Admin Panel | ✅ IMPLEMENTED | `AdminPanelView.tsx` |
| Learning Analytics | ✅ IMPLEMENTED | `useGeminiLive.ts` |
| Reasoning Engine | ✅ IMPLEMENTED | `lib/reasoning/` |
| Causal Concept Map | ✅ IMPLEMENTED | `argumentGraph.ts` |
| Educational Scaffolding | ✅ IMPLEMENTED | `interviewerSystem.ts` |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Architecture](#2-system-architecture) ✅ **ENHANCED**
3. [Authentication & Authorization](#3-authentication--authorization) ✅ **NEW**
4. [Voice Pipeline Specification](#4-voice-pipeline-specification)
5. [Learning Analytics Design](#5-learning-analytics-design) ✅ **IMPLEMENTED**
6. [Reasoning Analytics Engine](#6-reasoning-analytics-engine) ✅ **NEW**
7. [Educational Scaffolding Logic](#7-educational-scaffolding-logic) ✅ **IMPLEMENTED**
8. [Data Model & Schema](#8-data-model--schema)
9. [Prompt Engineering](#9-prompt-engineering)
10. [Security Architecture](#10-security-architecture)
11. [Human-in-the-Loop & Ethics](#11-human-in-the-loop--ethics)
12. [Accessibility & UX](#12-accessibility--ux)
13. [Deployment & Configuration](#13-deployment--configuration)
14. [Appendices](#appendices)

---

## 1. Introduction

### 1.1 Research Context

전통적인 구술 시험은 평가자 가용성, 일관성 확보, 확장성 문제에 직면해 있다. AI 기반 구술 시험 시스템은 이러한 한계를 극복하면서도 자연스러운 대화형 평가 환경을 제공할 수 있다.

### 1.2 Design Objectives

| Objective | Description | Research Value |
|-----------|-------------|----------------|
| **Low Latency** | 실시간 대화를 위한 200ms 이하 응답 시간 | 자연스러운 상호작용 데이터 수집 |
| **Natural Interaction** | 자연어 처리 기반 적응형 후속 질문 | 대화 역학(Turn-taking) 분석 |
| **Scalability** | 동시 다중 세션 지원 | 대규모 데이터셋 구축 |
| **Process Data** | 결과뿐 아니라 **과정** 데이터 수집 | 인지 부하, 유창성, 불안도 측정 |
| **Role-Based Access** | 4-tier 권한 체계 | 기관 수준 확장성 |

### 1.3 Theoretical Framework

본 시스템은 다음 교육학적 이론에 기반한다:

| Theory | Application in SpeakWise |
|--------|-------------------------|
| **Bloom's Taxonomy (Revised)** | 질문 설계: 기억 → 이해 → 적용 → 분석 단계로 점진적 심화 |
| **Socratic Dialogue** | AI 면접관이 학습자 응답 기반 탐색적 질문 생성 |
| **Evidence-Centered Design (ECD)** | 평가 목표 → 증거 수집 → 과제 모델 연계 |
| **Cognitive Load Theory** | 응답 지연시간(Wait Time)으로 인지 부하 추정 |
| **Vygotsky's ZPD** | 다단계 힌트 시스템으로 스캐폴딩 구현 |
| **Metacognition** | 사후 성찰(Post-interview Reflection) 단계 |

---

## 2. System Architecture

### 2.1 High-Level Architecture (v2.3 Enhanced)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION LAYER ✅ NEW                          │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Supabase Auth + 4-Tier Role Hierarchy                                 │ │
│  │  ───────────────────────────────────────────────────────────────────── │ │
│  │  Student → Instructor → Moderator → Admin                              │ │
│  │  📊 Research Value: 기관 수준 데이터 분리 및 접근 제어                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CAPTURE LAYER                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Raw Audio Stream (PCM 16kHz)                                          │ │
│  │  ───────────────────────────────────────────────────────────────────── │ │
│  │  📊 Research Value: 비언어적 표현 데이터 (운율, 음높이, 속도) 확보      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             ANALYSIS LAYER                                   │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐ │
│  │  Real-time VAD        │  │  Gemini 2.5 Native    │  │  Latency Tracker│ │
│  │  - Speech detection   │  │  Audio API            │  │  - Wait Time    │ │
│  │  - Barge-in events    │  │  - Transcription      │  │  - Turn Duration│ │
│  │  - Silence duration   │  │  - Prosodic hints     │  │  - Pause Count  │ │
│  └───────────────────────┘  └───────────────────────┘  └─────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  ✅ NEW: Reasoning Analytics Engine                                    │ │
│  │  - ArgumentGraphBuilder: 인과 관계 추출                                 │ │
│  │  - Pattern Matching: 한/영 NLP 패턴 라이브러리                          │ │
│  │  - Keyword Extraction: 핵심 개념 추출                                   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│  ──────────────────────────────────────────────────────────────────────────│
│  📊 Research Value: 인지 부하, 유창성, 논증 구조 분석                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             STORAGE LAYER                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Supabase PostgreSQL + Real-time Subscriptions                        │  │
│  │  - courses: 코스 메타데이터 + ownerEmail                               │  │
│  │  - submissions: 학생 제출 데이터 + LA 메트릭스                          │  │
│  │  - instructors: 데이터베이스 기반 강사 화이트리스트 ✅ NEW               │  │
│  │  - user_profiles: 사용자 역할 및 학교 정보 ✅ NEW                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ──────────────────────────────────────────────────────────────────────────│
│  📊 Research Value: 대화 패턴의 정량적 분석 가능 (재현성 확보)               │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OUTPUT LAYER                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Feedback + Score + Rubric Evidence + Reflection Prompt                │  │
│  │  - 4개 평가 기준 (이해도, 소통, 비판적 사고, 참여도)                    │  │
│  │  - AI 확신도(Confidence Score) 표시                                    │  │
│  │  - 사후 성찰 질문 (메타인지 유도)                                       │  │
│  │  - ✅ NEW: ArgumentGraph (논증 구조 시각화 데이터)                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ──────────────────────────────────────────────────────────────────────────│
│  📊 Research Value: 평가의 투명성 및 타당성 확보, 메타인지 데이터 수집       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Module Decomposition

| Module | File | Responsibility | Lines |
|--------|------|----------------|-------|
| App Router | `App.tsx` | View navigation, global state | 418 |
| Voice Session | `useGeminiLive.ts` | Audio I/O, Gemini connection, **LA tracking**, **reasoning analysis** | 633 |
| Course Management | `useCourseStorage.ts` | CRUD operations | ~200 |
| Student History | `useStudentHistory.ts` | Local/cloud history sync | ~120 |
| **Auth System** ✅ NEW | `useAuth.ts` | Authentication hook | 140 |
| **Supabase Auth** ✅ NEW | `lib/supabase/auth.ts` | SignUp/SignIn/SignOut/ResetPassword | 277 |
| **Database Layer** ✅ NEW | `lib/supabase/database.ts` | CRUD + Instructor whitelist | 477 |
| **Reasoning Engine** ✅ NEW | `lib/reasoning/argumentGraph.ts` | Causal relationship extraction | 272 |
| **NLP Patterns** ✅ NEW | `lib/reasoning/patterns.ts` | Korean/English reasoning patterns | ~220 |
| System Prompts | `lib/prompts/interviewerSystem.ts` | AI persona, feedback generation, **scaffolding** | 238 |

### 2.3 View Components

| Component | File | Responsibility |
|-----------|------|----------------|
| **LandingView** | `views/LandingView.tsx` | Entry point, role selection |
| **UnifiedAuthView** ✅ NEW | `views/UnifiedAuthView.tsx` | Sign In / Sign Up / Password Reset |
| **SchoolSelectView** ✅ NEW | `views/SchoolSelectView.tsx` | Institution selection |
| **AdminPanelView** ✅ NEW | `views/AdminPanelView.tsx` | Super admin dashboard |
| **InstructorLoginView** | `views/InstructorLoginView.tsx` | Instructor access |
| **ManagerDashboardView** | `views/ManagerDashboardView.tsx` | Course & submission management |
| **StudentLoginView** | `views/StudentLoginView.tsx` | Student course access |
| **StudentCoursesView** | `views/StudentCoursesView.tsx` | Available courses list |
| **InterviewSessionView** | `views/InterviewSessionView.tsx` | Live interview UI |
| **StudentHistoryView** | `views/StudentHistoryView.tsx` | Past submissions |

---

## 3. Authentication & Authorization ✅ NEW

### 3.1 4-Tier Role Hierarchy

```typescript
// 구현 위치: types.ts
export enum UserRole {
  STUDENT = 'student',       // 기본 학생 권한
  INSTRUCTOR = 'instructor', // 코스 관리 + 제출물 검토
  MODERATOR = 'moderator',   // 다중 코스 감독 (예정)
  ADMIN = 'admin'            // 전체 시스템 관리
}
```

### 3.2 Supabase Auth Integration

```typescript
// 구현 위치: lib/supabase/auth.ts
interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: 'student' | 'instructor';
  schoolId?: string;
  schoolName?: string;
}

// 지원 기능
signUp(email, password, displayName, role): Promise<AuthResult>
signIn(email, password): Promise<AuthResult>
signOut(): Promise<void>
resetPassword(email): Promise<AuthResult>
getCurrentUser(): Promise<AuthUser | null>
updateUserSchool(userId, schoolId, schoolName): Promise<boolean>
```

### 3.3 Database-Backed Instructor Whitelist

```typescript
// 구현 위치: lib/supabase/database.ts

// 강사 권한 확인 (DB 우선, 폴백으로 하드코딩 리스트)
checkInstructorStatus(email: string): Promise<boolean>

// 강사 추가 (Admin 전용)
addInstructor(email: string, addedBy: string): Promise<boolean>

// 전체 강사 목록 조회
getAllInstructors(): Promise<string[]>

// 폴백 화이트리스트 (DB 장애 시)
const FALLBACK_INSTRUCTORS = [
  'jewoong.moon@gmail.com',
  'yongju017@gmail.com',
];
```

### 3.4 Access Control Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                        LANDING PAGE                                   │
│                                                                       │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐            │
│   │   Student   │     │ Instructor  │     │    Admin    │            │
│   │   Access    │     │   Access    │     │   Access    │            │
│   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘            │
│          │                   │                   │                    │
└──────────┼───────────────────┼───────────────────┼────────────────────┘
           │                   │                   │
           ▼                   ▼                   ▼
    ┌──────────────┐   ┌───────────────────┐   ┌──────────────┐
    │ UNIFIED AUTH │   │ INSTRUCTOR LOGIN  │   │ ADMIN PANEL  │
    │              │   │                   │   │              │
    │ SignIn/SignUp│   │ Email + Password  │   │ System Mgmt  │
    │              │   │ OR VITE_CODE      │   │              │
    └──────┬───────┘   └────────┬──────────┘   └──────────────┘
           │                    │
           ▼                    ▼
    ┌──────────────┐   ┌───────────────────┐
    │ SCHOOL SELECT│   │ DB Whitelist Check│
    │              │   │                   │
    │ Institution  │   │ checkInstructor() │
    └──────┬───────┘   └────────┬──────────┘
           │                    │
           ▼                    ▼
    ┌──────────────┐   ┌───────────────────┐
    │STUDENT COURSES│   │MANAGER DASHBOARD │
    │              │   │                   │
    │ Course List  │   │ Course + Students │
    └──────────────┘   └───────────────────┘
```

---

## 4. Voice Pipeline Specification

### 4.1 Audio Configuration

```typescript
interface AudioPipelineConfig {
    inputSampleRate: 16000;        // Hz (Gemini requirement)
    outputSampleRate: 24000;       // Hz (Gemini output)
    bufferSize: 4096;              // samples per frame
    channels: 1;                   // mono audio
    encoding: 'PCM_FLOAT32';       // Web Audio native format
}
```

### 4.2 Voice Activity Detection (VAD) — Research-Enhanced

| Parameter | Value | Rationale | Research Application |
|-----------|-------|-----------|---------------------|
| `startOfSpeechSensitivity` | LOW | 오탐(false positive) 최소화 | 정확한 발화 시작 시점 기록 |
| `endOfSpeechSensitivity` | LOW | 사용자 사고 시간 확보 | Wait Time 측정 정확도 |
| `prefixPaddingMs` | 300 | 발화 시작 전 컨텍스트 보존 | 음성 품질 확보 |
| `silenceDurationMs` | 1200 | 1.2초 침묵 후 턴 종료 판정 | 인지 부하 지표 수집 |
| `activityHandling` | INTERRUPTS | Barge-in 허용 | 끼어들기 빈도 추적 |

### 4.3 Available Voice Personas

| Voice ID | Characteristic | Gender | Use Case |
|----------|----------------|--------|----------|
| `Kore` | Firm, Professional | F | **기본값** - 학술적 어조 |
| `Charon` | Informative | M | 설명 중심 면접 |
| `Puck` | Upbeat | M | 친근한 분위기 |
| `Aoede` | Breezy | F | 편안한 대화 |
| `Leda` | Youthful | F | 저연령 학습자 |
| `Orus` | Firm | M | 엄격한 평가 분위기 |

---

## 5. Learning Analytics Design ✅ IMPLEMENTED

> 💡 **핵심 원칙**: 학습과학 연구자들은 결과(점수)보다 **과정(Process)**에 열광합니다.

> ✅ **구현 상태**: `useGeminiLive.ts` (633 lines)에서 실시간 추적, `types.ts`에 타입 정의 완료

### 5.1 Wait Time (Response Latency) Analysis ✅ IMPLEMENTED

```typescript
// 구현 위치: types.ts, useGeminiLive.ts
interface LatencyMetrics {
    avgInitialLatency: number;    // 평균 초기 응답 지연 (ms)
    maxLatency: number;           // 최대 지연 (ms)
    minLatency: number;           // 최소 지연 (ms)
    totalThinkingTime: number;    // 총 사고 시간 (ms)
    turnCount: number;            // 학생 턴 횟수
    turnTakingRatio: number;      // 학생 발화 / AI 발화 비율
}
```

**연구적 해석**:

| Metric | High Value Interpretation | Low Value Interpretation |
|--------|---------------------------|-----------------------------|
| `avgInitialLatency` | 높은 인지 부하, 심층 사고 중 | 자동적 지식 인출, 또는 추측 |
| `turnCount` | 활발한 대화 참여 | 수동적 응답 |
| `turnTakingRatio` | 적극적 참여, 자신감 | 수동적 응답, 불안감 |

### 5.2 Barge-in Event Tracking ✅ IMPLEMENTED

```typescript
// 구현 위치: types.ts, useGeminiLive.ts
interface BargeInEvent {
    timestamp: number;            // 발생 시점
    interruptedContent: string;   // AI가 말하던 내용
    studentUtterance: string;     // 학생이 끼어든 발화
    interpretationType: 'confidence' | 'hasty_generalization' | 'correction' | 'unknown';
}
```

### 5.3 Enhanced TranscriptionItem Structure ✅ IMPLEMENTED

```typescript
// 구현 위치: types.ts
interface TranscriptionItem {
    speaker: 'user' | 'interviewer';
    text: string;
    timestamp: number;
    
    // 🆕 Learning Analytics Fields
    latency?: number;             // 이전 발화 끝 → 현재 발화 시작 (ms)
    duration?: number;            // 발화 지속 시간 (ms)
    pauseCount?: number;          // 발화 중 침묵 횟수
    isBargeIn?: boolean;          // 끼어들기 여부
    bloomsLevel?: BloomsLevel;    // AI 질문 레벨
}
```

---

## 6. Reasoning Analytics Engine ✅ NEW

> 🧠 **핵심 목표**: 학생의 추론 품질을 구조화된 방식으로 정량화

### 6.1 ArgumentGraphBuilder ✅ IMPLEMENTED

```typescript
// 구현 위치: lib/reasoning/argumentGraph.ts

class ArgumentGraphBuilder {
    private nodes: ArgumentNode[] = [];
    private edges: ArgumentEdge[] = [];
    private keywordNodes: Map<string, string> = new Map();

    // 키워드 노드 생성/조회
    getOrCreateKeywordNode(keyword: string, timestamp: number): string;
    
    // 면접관 질문 추가
    addQuestion(content: string, timestamp: number): string;
    
    // 사용자 발화 처리 - 키워드 및 인과관계 추출
    processUserUtterance(text: string, timestamp: number, lastQuestionId?: string): string;
    
    // 논리적 일관성 점수 계산
    calculateCoherence(): number;
    
    // 완성된 그래프 반환
    getGraph(): ArgumentGraph;
}
```

### 6.2 Causal Pattern Library (Korean + English) ✅ IMPLEMENTED

```typescript
// 구현 위치: lib/reasoning/argumentGraph.ts

const CAUSAL_PATTERNS = [
    // Cause-Effect (English)
    { pattern: /(.+?)\s+(causes?|caused)\s+(.+)/gi, relation: 'causes' },
    { pattern: /(.+?)\s+(leads? to|led to)\s+(.+)/gi, relation: 'leads to' },
    { pattern: /(.+?)\s+(results? in)\s+(.+)/gi, relation: 'results in' },
    { pattern: /because of\s+(.+?),?\s+(.+)/gi, relation: 'because of' },
    { pattern: /due to\s+(.+?),?\s+(.+)/gi, relation: 'due to' },
    
    // Conditional (English)
    { pattern: /if\s+(.+?),?\s+then\s+(.+)/gi, relation: 'if-then' },
    
    // Contrast (English)
    { pattern: /(.+?)\s+(but|however)\s+(.+)/gi, relation: 'contrasts' },
    
    // Korean patterns
    { pattern: /(.+?)(?:이|가)\s*(.+?)(?:을|를)?\s*(?:초래|야기)/g, relation: 'causes' },
    { pattern: /(.+?)(?:때문에|으로 인해)\s*(.+)/g, relation: 'because' },
    { pattern: /(.+?)(?:이|가)\s*(.+?)에\s*영향/g, relation: 'affects' },
    { pattern: /만약\s*(.+?)(?:이|가|라면),?\s*(.+)/g, relation: 'if-then' },
];
```

### 6.3 Reasoning Rubric (4차원 평가) ✅ IMPLEMENTED

```typescript
// 구현 위치: types.ts
interface ReasoningRubric {
  explicitJustification: { score: number; count: number; examples: string[] };
  causalExplanation: { score: number; patterns: string[] };
  counterArgumentHandling: { score: number; attempts: number };
  abstractionGeneralization: { score: number; instances: string[] };
  overallReasoningScore: number;  // 0-100 종합 점수
}
```

| 차원 | 측정 방법 | 연구적 의미 |
|------|----------|-------------|
| **Explicit Justification** | "because", "evidence shows" 패턴 | 근거 기반 사고력 |
| **Causal Explanation** | "therefore", "results in" 패턴 | 인과적 추론 능력 |
| **Counter-Argument** | "however", "on the other hand" 패턴 | 비판적 사고력 |
| **Abstraction** | "in general", "typically" 패턴 | 일반화 능력 |

### 6.4 Dialogue Metrics ✅ IMPLEMENTED

```typescript
// 구현 위치: types.ts, useGeminiLive.ts
interface DialogueMetrics {
  turnInitiatives: number;      // 학생 주도 대화 횟수
  rephrasingEvents: number;     // 재구성 시도 횟수
  followUpDepth: number[];      // 확장 설명 길이 배열
  avgFollowUpDepth: number;     // 평균 확장 설명 길이
  latencyVariation: number;     // 응답 지연 시간 표준편차
  questionResponseRatio: number; // 질문 대비 응답 비율
}
```

### 6.5 Argument Graph Structure ✅ IMPLEMENTED

```typescript
// 구현 위치: types.ts
interface ArgumentNode {
  id: string;
  type: 'claim' | 'evidence' | 'counterargument' | 'justification' | 'question';
  content: string;
  speaker: 'user' | 'interviewer';
  timestamp: number;
}

interface ArgumentEdge {
  from: string;
  to: string;
  relation: 'supports' | 'refutes' | 'extends' | 'responds_to';
}

interface ArgumentGraph {
  nodes: ArgumentNode[];
  edges: ArgumentEdge[];
  coherenceScore: number;  // 논리적 일관성 (0-100)
  complexity: number;      // 그래프 복잡도
}
```

```
논증 그래프 예시:
┌──────────────┐     supports     ┌──────────────┐
│   CLAIM      │◄────────────────│   EVIDENCE   │
│ "AI is..."   │                  │ "Research    │
└──────┬───────┘                  │  shows..."   │
       │ responds_to              └──────────────┘
       ▼
┌──────────────┐     refutes      ┌──────────────┐
│   QUESTION   │                  │ COUNTER-ARG  │
│ "Can you...?"│                  │ "However..." │
└──────────────┘                  └──────────────┘
```

---

## 7. Educational Scaffolding Logic ✅ IMPLEMENTED

### 7.1 Layered Hinting System

> **목표**: 단순한 질의응답을 넘어 '교육적 개입'이 일어나는 지점을 설계
>
> ✅ **구현 상태**: `interviewerSystem.ts`에 3단계 프롬프트 적용 완료

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      STUDENT RESPONSE DETECTED                          │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
            ┌───────────┐  ┌───────────┐  ┌───────────┐
            │ Correct/  │  │ Partial/  │  │ Silence/  │
            │ Good      │  │ Vague     │  │ "I don't  │
            │           │  │           │  │  know"    │
            └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
                  │              │              │
                  ▼              │              ▼
            ┌───────────┐        │        ┌───────────────────────────────┐
            │ Positive  │        │        │ SCAFFOLDING LADDER            │
            │ Feedback  │        │        │                               │
            │ + Next Q  │        │        │ Level 1: Conceptual Hint      │
            └───────────┘        │        │ "이 개념의 핵심 특징을 생각해  │
                                 │        │  보세요..."                    │
                                 ▼        │          ↓                    │
                          ┌───────────┐   │ Level 2: Example Hint         │
                          │ Probing   │   │ "예를 들어, A의 경우를 생각해  │
                          │ Question  │   │  보면..."                      │
                          │ for Depth │   │          ↓                    │
                          └───────────┘   │ Level 3: Guided Subquestion   │
                                          │ "먼저, X와 Y의 차이점부터      │
                                          │  말해볼까요?"                   │
                                          └───────────────────────────────┘
```

### 7.2 Scaffolding Prompt Template (Implemented)

```typescript
// lib/prompts/interviewerSystem.ts 에서 발췌

## 🛠️ SCAFFOLDING PROTOCOL (3-Level Hint System)

When the student says "I don't know", remains silent for 5+ seconds, 
or gives an incomplete/vague answer:

### Level 1: Conceptual Hint
- Ask about the core concept without revealing the answer
- ❌ DO NOT reveal the answer

### Level 2: Example-Based Hint
- Provide a concrete example or scenario to guide thinking
- ❌ DO NOT reveal the answer

### Level 3: Guided Sub-question
- Break down the original question into smaller, manageable parts
- After this level, if still struggling, move to the next question gracefully

**⚠️ CRITICAL RULE**: NEVER directly reveal the correct answer.
```

---

## 8. Data Model & Schema

### 8.1 Enhanced Entity Relationship Diagram

```
┌─────────────────────────┐      ┌─────────────────────────┐
│       user_profiles     │      │       instructors       │
│      (Supabase Auth)    │      │    (Whitelist Table)    │
├─────────────────────────┤      ├─────────────────────────┤
│ id (PK)                 │      │ id (PK)                 │
│ email                   │      │ email (UNIQUE)          │
│ display_name            │      │ added_by                │
│ role                    │      │ created_at              │
│ school_id               │      └─────────────────────────┘
│ school_name             │
└─────────────────────────┘
           │
           │ 1:N (owner_email)
           ▼
┌─────────────────────────┐
│         Course          │
├─────────────────────────┤        ┌─────────────────────────────────────────┐
│ id (PK)                 │───┐    │              Submission                  │
│ name                    │   │    ├─────────────────────────────────────────┤
│ instructor_name         │   │    │ id (PK)                                 │
│ instructor_pin_hash     │   │    │ course_id (FK)                          │◄─┘
│ password                │   └───▶│ student_name                            │
│ prompt                  │        │ timestamp                               │
│ owner_email ✅ NEW       │        │                                         │
│ created_at              │        │ // Core Data                            │
└─────────────────────────┘        │ transcript[]                            │
                                   │ score                                   │
                                   │ feedback                                │
                                   │                                         │
                                   │ // 🆕 Learning Analytics                │
                                   │ latencyMetrics: LatencyMetrics          │
                                   │ bargeInEvents: BargeInEvent[]           │
                                   │ scaffoldingEvents: ScaffoldingEvent[]   │
                                   │ confidenceScore: number                 │
                                   │ rubricBreakdown: RubricEvidence         │
                                   │                                         │
                                   │ // 🆕 Reasoning Analytics               │
                                   │ reasoningRubric: ReasoningRubric        │
                                   │ dialogueMetrics: DialogueMetrics        │
                                   │ argumentGraph: ArgumentGraph            │
                                   │                                         │
                                   │ // 🆕 Metacognition                     │
                                   │ reflectionPrompt?: string               │
                                   │ reflectionResponse?: string             │
                                   └─────────────────────────────────────────┘
```

### 8.2 UseGeminiLiveReturn Interface ✅ IMPLEMENTED

```typescript
// 구현 위치: types.ts
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

  // Advanced Analytics ✅ NEW
  dialogueMetrics: DialogueMetrics;
  argumentGraph: ArgumentGraph;
  getReasoningRubric: () => ReasoningRubric;

  // Session control
  startSession: () => Promise<void>;
  endSession: () => void;
}
```

---

## 9. Prompt Engineering

### 9.1 Multi-Language Support ✅ IMPLEMENTED

```typescript
// interviewerSystem.ts 에서 발췌

## 🌍 LANGUAGE POLICY (CRITICAL)
**You MUST respond in the SAME LANGUAGE the student uses.**
- If the student speaks in Korean (한국어), you MUST respond entirely in Korean
- If the student speaks in English, respond in English
- If the student switches languages mid-conversation, follow their lead
```

### 9.2 Interview Protocol (4 Phases)

| Phase | Duration | Activities |
|-------|----------|------------|
| **Opening** | 15-20 sec | Greeting, introduction |
| **Core Assessment** | 4-5 min | 4-5 questions with Bloom's progression |
| **Reflection** | 30 sec | Optional metacognitive prompt |
| **Conclusion** | 20-30 sec | Summary, closing message with `[END_INTERVIEW]` |

### 9.3 Feedback Generation with Confidence Score

```typescript
// Feedback output structure
interface FeedbackOutput {
    score: number;                    // 0-100
    feedback: string;                 // 상세 피드백
    confidenceScore: number;          // 0.0 ~ 1.0
    confidenceRationale: string;      // AI 확신도 근거
    rubricBreakdown: {
        conceptualUnderstanding: { score: number; evidence: string[] };
        communicationClarity: { score: number; evidence: string[] };
        criticalThinking: { score: number; evidence: string[] };
        engagement: { score: number; evidence: string[] };
    };
}
```

---

## 10. Security Architecture

### 10.1 Authentication Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Landing    │     │ Unified Auth │     │   Role-Based │
│   Page       │ ──▶ │ (Supabase)   │ ──▶ │   Dashboard  │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  DB Check:   │
                     │  instructors │
                     │  table       │
                     └──────────────┘
```

### 10.2 Security Features

| Feature | Implementation |
|---------|---------------|
| Password Hashing | Supabase Auth (bcrypt) |
| PIN Hashing | SHA-256 with courseId salt |
| Instructor Whitelist | Database-backed with fallback |
| Rate Limiting | 5 attempts, 15-minute lockout |
| Session Management | localStorage + Supabase session |

### 10.3 Input Sanitization ✅ IMPLEMENTED

```typescript
// 구현 위치: lib/security/sanitize.ts
// HTML, SQL, NoSQL injection 방지
```

---

## 11. Human-in-the-Loop & Ethics

### 11.1 Confidence-Based Review Workflow

```
┌───────────────────────────────────────────────────────────────────────┐
│                    INSTRUCTOR DASHBOARD                                │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  📊 Submissions Overview                                               │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ Student    │ Score │ Confidence │ Scaffolding │ Review Status   │ │
│  ├────────────┼───────┼────────────┼─────────────┼─────────────────┤ │
│  │ 김민수     │  85   │ 🟢 0.92    │ 0회         │ Auto-approved   │ │
│  │ 이지원     │  72   │ 🟡 0.65    │ 2회         │ ⚠️ Review       │ │
│  │ 박서연     │  58   │ 🔴 0.38    │ 4회         │ 🚨 Manual Check │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  🔍 Filter: [Show Low Confidence Only ▼]                              │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

### 11.2 Data Privacy

- 학생 식별 데이터 최소 수집 (이름만, 이메일/ID 불필요 for students)
- `device_id`는 익명 추적용 UUID (재식별 불가)
- PIN 해시 저장 (평문 저장 안 함)
- **음성 원본 미저장**: Transcript만 보관

---

## 12. Accessibility & UX

### 12.1 WCAG 2.2 Compliance

| Criterion | Implementation |
|-----------|----------------|
| 2.4.7 Focus Visible | 3px solid outline + 6px glow shadow |
| 4.1.3 Status Messages | `role="alert"` + `aria-live="assertive"` |
| 2.3.3 Animation | `prefers-reduced-motion` media query |
| 2.4.1 Bypass Blocks | Skip to main content link |

---

## 13. Deployment & Configuration

### 13.1 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GEMINI_API_KEY` | ✅ | Gemini API authentication |
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `VITE_INSTRUCTOR_CODE` | ✅ | Instructor portal access code (fallback) |

### 13.2 Build Commands

```bash
npm install          # 의존성 설치
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
```

---

## Appendices

### Appendix A: File Structure

```
speakwise-oral-exam/
├── App.tsx                      # Main application (418 lines)
├── types.ts                     # Type definitions (327 lines)
├── index.tsx                    # Entry point
├── index.css                    # Styles (~43KB)
│
├── components/
│   ├── views/
│   │   ├── LandingView.tsx          # Landing page
│   │   ├── UnifiedAuthView.tsx      # Auth (Sign In/Up/Reset)
│   │   ├── SchoolSelectView.tsx     # School selection
│   │   ├── AdminPanelView.tsx       # Admin dashboard
│   │   ├── InstructorLoginView.tsx  # Instructor auth
│   │   ├── ManagerDashboardView.tsx # Course management
│   │   ├── StudentLoginView.tsx     # Student course access
│   │   ├── StudentCoursesView.tsx   # Course list
│   │   ├── InterviewSessionView.tsx # Live interview
│   │   └── StudentHistoryView.tsx   # Past submissions
│   ├── modals/                      # Modal components
│   └── ui/                          # Reusable UI components
│
├── hooks/
│   ├── useAuth.ts               # Auth hook (140 lines)
│   ├── useGeminiLive.ts         # Voice session (633 lines)
│   ├── useCourseStorage.ts      # Course CRUD
│   └── useStudentHistory.ts     # History management
│
├── lib/
│   ├── supabase/
│   │   ├── auth.ts              # Auth functions (277 lines)
│   │   ├── database.ts          # DB operations (477 lines)
│   │   └── client.ts            # Supabase client
│   ├── reasoning/
│   │   ├── argumentGraph.ts     # Graph builder (272 lines)
│   │   └── patterns.ts          # NLP patterns
│   ├── prompts/
│   │   └── interviewerSystem.ts # AI prompts (238 lines)
│   └── security/
│       └── sanitize.ts          # Input sanitization
│
└── utils/
    ├── audioHelpers.ts          # Audio utilities
    └── audioPipeline.ts         # Audio processing
```

### Appendix B: Glossary

| Term | Definition |
|------|------------|
| VAD | Voice Activity Detection - 음성 활동 감지 |
| PCM | Pulse Code Modulation - 디지털 오디오 인코딩 |
| Barge-in | 사용자가 AI 응답 중 끼어들기 |
| Turn-taking | 대화에서 화자가 교대하는 패턴 |
| ECD | Evidence-Centered Design - 증거 중심 설계 |
| Wait Time | 질문 후 학생이 응답하기까지의 지연 시간 |
| Scaffolding | 학습을 돕기 위한 임시적 지원 구조 |
| Metacognition | 자신의 인지 과정에 대한 인식 |
| ZPD | Zone of Proximal Development - 근접 발달 영역 |
| ArgumentGraph | 논증 구조를 노드와 엣지로 모델링한 그래프 |

### Appendix C: API Reference

```typescript
// Gemini Live Connection
const session = await ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    config: LiveConnectConfig
});

await session.sendRealtimeInput({ media: pcmBlob });
session.close();

// Supabase Auth
import { signUp, signIn, signOut, getCurrentUser } from './lib/supabase/auth';

// Reasoning Analytics
import { ArgumentGraphBuilder, analyzeReasoningPatterns } from './lib/reasoning';
```

---

*Document Version: 2.3.0 (Full Auth + Reasoning Analytics)*  
*Last Updated: 2026-01-29*  
*Author: SpeakWise Development Team*


---

## 19. Documentation & Tutorial Video Pipeline (2026-06-11)

The walkthrough guide (speakwise-guide.pages.dev) ships narrated tutorial videos generated from code, so they can be regenerated whenever the UI changes.

| Script | Role |
|---|---|
| `playwright/tutorial-scenes.mjs` | Single source of truth: per-scene narration text + Playwright actions (student 8 scenes, instructor 9 scenes) |
| `playwright/narrate.mjs` | ElevenLabs TTS per scene (voice: Alice, `eleven_multilingual_v2`), measures durations with ffprobe, caches by text hash in `narration-manifest.json` |
| `playwright/tutorial.mjs` | Records the screencast with an injected software cursor (follows the real mouse, click ripple), paces each scene to its narration length, writes scene start times to `<flow>-timing.json` |
| `playwright/mux.mjs` | ffmpeg: `adelay`s each narration clip to its measured scene start, `amix` + loudnorm, transcodes to H.264/AAC mp4 (`student-tutorial.mp4`, `instructor-tutorial.mp4`) |

Run order:

```bash
ELEVENLABS_API_KEY=... node playwright/narrate.mjs
node playwright/tutorial.mjs        # BASE_URL / FLOW=student|instructor|both
node playwright/mux.mjs
```

Sync model: narration starts exactly at each scene's measured start; a scene never ends before its narration does (runner waits out the remainder + 1s pad). Demo accounts and codes are read from env (`STUDENT_EMAIL`, `INSTRUCTOR_EMAIL`, `COURSE_PASSCODE`, ...), with speakwise-test.com demo defaults.

---

## 20. Mobile Browsers (iOS Safari / Android Chrome) Hardening (2026-06-11)

Mobile browsers enforce stricter audio/lifecycle policies than desktop. The voice pipeline handles them in four layers (all feature-detected; nothing throws on browsers lacking an API):

### 20.1 Audio gesture unlock

iOS Safari only lets an `AudioContext` start (and audio playback begin) inside a user gesture. `useGeminiLive.startSession()` therefore calls `AudioStreamService.unlock()` **synchronously at the top of the Start-button click**, before the token fetch / WebSocket awaits:

- `unlock()` creates BOTH contexts (capture: native rate; playback: 24 kHz, with webkit/options-bag fallbacks), fires `resume()` without awaiting, and plays a zero-length buffer on the playback context so later examiner-TTS chunks (which arrive over the network, outside any gesture) are allowed.
- `initialize()` (run after the socket opens) **reuses** the unlocked contexts instead of creating new ones.
- iOS's non-standard `state === 'interrupted'` (phone call / Siri): a `statechange` watcher arms a one-shot `touchend`/`click` listener that re-`resume()`s the contexts on the next gesture.

### 20.2 Screen wake lock

While a session is LIVE, the hook requests `navigator.wakeLock.request('screen')` (try/catch, no-op where unsupported) so the phone can't sleep mid-exam and kill the mic/WS. The OS releases the lock when the page hides; it is re-acquired on `visibilitychange → visible`, and released in `cleanup()`.

### 20.3 Visibility & device interruptions

- Going hidden does **not** tear anything down. On return to visible: audio contexts are re-kicked, the wake lock re-acquired, and the socket health-checked via `GeminiWebsocketClient.isLikelyAlive()` (own close flag + defensive `readyState` introspection). A dead socket enters the **existing** `attemptReconnect` backoff path (guarded by `reconnectingRef`/`intentionalCloseRef`, so close-event-driven reconnects never double-fire).
- Mic-track `ended` + `devicechange` (headphones unplugged, incoming call): `AudioStreamService.restartCapture()` re-acquires the mic on the same unlocked contexts behind a calm notice; only an unrecoverable failure surfaces the error/retry UX.

### 20.4 Viewport & touch

- `index.html` viewport meta: `viewport-fit=cover, interactive-widget=resizes-content`.
- Interview/login full-height panes use `dvh` (not `vh`) so the collapsing URL bar can't clip the layout (`min-h` px floors remain the fallback for non-dvh browsers).
- Primary action buttons (Start / Done Speaking / End and Submit / mic test) have ≥44 px touch targets and `touch-action: manipulation` (no 300 ms double-tap-zoom delay).
- `MicTest` no longer calls `getUserMedia` on mount (out-of-gesture prompts can be auto-denied on iOS); device labels are refreshed after the first successful in-gesture test, and a stale `deviceId: exact` retries once with the default mic.

Known limitation (needs a real device to verify): zombie sockets that still report `readyState === OPEN` after backgrounding can't be detected without a ping; recovery then relies on the deferred close event, which mobile browsers deliver on foregrounding.
