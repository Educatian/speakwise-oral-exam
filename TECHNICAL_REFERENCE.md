# SpeakWise 2.1: AI-Mediated Oral Examination Platform
## Technical Specification for Educational Technology Research

**Version**: 2.1.0 (Learning Analytics Enhanced)  
**Last Updated**: 2026-01-28  
**Implementation Status**: ✅ Core LA Features Implemented

---

## Abstract

SpeakWise는 Gemini 2.5 Flash Native Audio API를 활용한 AI 기반 실시간 구술 시험 플랫폼이다. 본 문서는 시스템의 기술적 구현 세부사항, 설계 결정의 이론적 근거, 그리고 **학습 분석(Learning Analytics)** 연구를 위한 데이터 수집 구조를 상세히 기술한다. 특히, **과정(Process)** 중심의 학습 데이터 수집을 통해 인지 부하, 메타인지, 대화 역학 등의 연구 확장성을 지원한다.

**Keywords**: AI-Mediated Dialogue, Oral Examination, Voice User Interface, Real-time Transcription, Formative Assessment, Learning Analytics, Cognitive Load, Prosodic Analysis, Scaffolding, Gemini Live API

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Architecture](#2-system-architecture)
3. [Voice Pipeline Specification](#3-voice-pipeline-specification)
4. [Learning Analytics Design](#4-learning-analytics-design) ✅ **IMPLEMENTED**
5. [Educational Scaffolding Logic](#5-educational-scaffolding-logic) ✅ **IMPLEMENTED**
6. [Data Model & Schema](#6-data-model--schema)
7. [Prompt Engineering](#7-prompt-engineering)
8. [Security Architecture](#8-security-architecture)
9. [Human-in-the-Loop & Ethics](#9-human-in-the-loop--ethics)
10. [Accessibility & UX](#10-accessibility--ux)
11. [Deployment & Configuration](#11-deployment--configuration)
12. [Appendices](#appendices)

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

### 2.1 High-Level Architecture (Research-Enhanced)

```
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
│  ──────────────────────────────────────────────────────────────────────────│
│  📊 Research Value: 인지 부하, 유창성, 불안도 측정 지표 추출                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             STORAGE LAYER                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Supabase PostgreSQL + Transcription Metadata                         │  │
│  │  - transcript[]     : 대화 내용                                        │  │
│  │  - latencyMetrics   : 응답 지연 시간                                   │  │
│  │  - bargeInEvents[]  : 끼어들기 이벤트                                   │  │
│  │  - confidenceScore  : AI 평가 확신도                                    │  │
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
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ──────────────────────────────────────────────────────────────────────────│
│  📊 Research Value: 평가의 투명성 및 타당성 확보, 메타인지 데이터 수집       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Module Decomposition

| Module | File | Responsibility | Lines |
|--------|------|----------------|-------|
| App Router | `App.tsx` | View navigation, global state | 258 |
| Voice Session | `useGeminiLive.ts` | Audio I/O, Gemini connection, **latency tracking** | 308 |
| Course Management | `useCourseStorage.ts` | CRUD operations | ~200 |
| Student History | `useStudentHistory.ts` | Local/cloud history sync | ~120 |
| PIN Security | `lib/utils/pinHash.ts` | SHA-256 hashing, rate limiting | 128 |
| System Prompts | `lib/prompts/interviewerSystem.ts` | AI persona, feedback generation, **scaffolding logic** | 155 |

---

## 3. Voice Pipeline Specification

### 3.1 Audio Configuration

```typescript
interface AudioPipelineConfig {
    inputSampleRate: 16000;        // Hz (Gemini requirement)
    outputSampleRate: 24000;       // Hz (Gemini output)
    bufferSize: 4096;              // samples per frame
    channels: 1;                   // mono audio
    encoding: 'PCM_FLOAT32';       // Web Audio native format
}
```

### 3.2 Voice Activity Detection (VAD) — Research-Enhanced

| Parameter | Value | Rationale | Research Application |
|-----------|-------|-----------|---------------------|
| `startOfSpeechSensitivity` | LOW | 오탐(false positive) 최소화 | 정확한 발화 시작 시점 기록 |
| `endOfSpeechSensitivity` | LOW | 사용자 사고 시간 확보 | Wait Time 측정 정확도 |
| `prefixPaddingMs` | 300 | 발화 시작 전 컨텍스트 보존 | 음성 품질 확보 |
| `silenceDurationMs` | 1200 | 1.2초 침묵 후 턴 종료 판정 | 인지 부하 지표 수집 |
| `activityHandling` | INTERRUPTS | Barge-in 허용 | 끼어들기 빈도 추적 |

### 3.3 Prosodic Feature Collection (Future Enhancement)

> ⚠️ **미구현**: Gemini 2.5 Native Audio는 운율 정보를 인식하나, 명시적 API로 제공되지 않음. 향후 연구 확장을 위한 설계 참조용.

```typescript
interface ProsodicFeatures {
    speechRate: number;           // 분당 음절 수 (syllables/min)
    pitchVariation: number;       // Hz 변화량
    volumeLevel: 'low' | 'normal' | 'high';
    hesitationMarkers: number;    // "음...", "어..." 카운트
    voiceTremor: boolean;         // 목소리 떨림 감지 (불안도 지표)
}

// 연구적 활용:
// - speechRate 급감: 인지 부하 증가 구간
// - voiceTremor: 불안도(Anxiety) 추정
// - hesitationMarkers: 불확실성 신호
```

### 3.4 Available Voice Personas

| Voice ID | Characteristic | Gender | Use Case |
|----------|----------------|--------|----------|
| `Kore` | Firm, Professional | F | **기본값** - 학술적 어조 |
| `Charon` | Informative | M | 설명 중심 면접 |
| `Puck` | Upbeat | M | 친근한 분위기 |
| `Aoede` | Breezy | F | 편안한 대화 |
| `Leda` | Youthful | F | 저연령 학습자 |
| `Orus` | Firm | M | 엄격한 평가 분위기 |

---

## 4. Learning Analytics Design ✅ IMPLEMENTED

> 💡 **핵심 원칙**: 학습과학 연구자들은 결과(점수)보다 **과정(Process)**에 열광합니다.

> ✅ **구현 상태**: `useGeminiLive.ts`에서 실시간 추적, `types.ts`에 타입 정의 완료

### 4.1 Wait Time (Response Latency) Analysis ✅ IMPLEMENTED

```typescript
// 구현 위치: types.ts, useGeminiLive.ts
interface LatencyMetrics {
    initialLatency: number;       // 질문 끝 → 학생 발화 시작 (ms)
    thinkingPauses: number;       // 발화 중간 침묵 횟수
    avgPauseLength: number;       // 평균 침묵 길이 (ms)
    totalSpeakingTime: number;    // 총 발화 시간 (ms)
    turnTakingRatio: number;      // 학생 발화 / AI 발화 비율
}
```

**연구적 해석**:

| Metric | High Value Interpretation | Low Value Interpretation |
|--------|---------------------------|--------------------------|
| `initialLatency` | 높은 인지 부하, 심층 사고 중 | 자동적 지식 인출, 또는 추측 |
| `thinkingPauses` | 복잡한 개념 재구성 중 | 유창한 지식 표현 |
| `turnTakingRatio` | 적극적 참여, 자신감 | 수동적 응답, 불안감 |

### 4.2 Barge-in Event Tracking ✅ IMPLEMENTED

```typescript
// 구현 위치: types.ts, useGeminiLive.ts (detectBargeIn 함수)
interface BargeInEvent {
    timestamp: number;            // 발생 시점
    interruptedContent: string;   // AI가 말하던 내용
    studentUtterance: string;     // 학생이 끼어든 발화
    interpretationType: 'confidence' | 'hasty_generalization' | 'correction' | 'unknown';
}
```

**교육적 활용**:
- **높은 자신감**: 정답을 알고 있어 빠르게 응답 시도
- **성급한 일반화**: 질문을 끝까지 듣지 않고 성급하게 추측
- **자기 교정**: 이전 답변의 오류를 인지하고 수정 시도

### 4.3 Enhanced TranscriptionItem Structure ✅ IMPLEMENTED

```typescript
// 구현 위치: types.ts
// 기존 구조 (v1.0)
interface TranscriptionItem_v1 {
    speaker: 'user' | 'interviewer';
    text: string;
    timestamp: number;
}

// ✅ 학습 분석 강화 버전 (v2.1 IMPLEMENTED)
interface TranscriptionItem {
    speaker: 'user' | 'interviewer';
    text: string;
    timestamp: number;
    
    // 🆕 Learning Analytics Fields
    latency?: number;             // 이전 발화 끝 → 현재 발화 시작 (ms)
    duration?: number;            // 발화 지속 시간 (ms)
    pauseCount?: number;          // 발화 중 침묵 횟수
    isBargeIn?: boolean;          // 끼어들기 여부
    bloomsLevel?: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate';  // AI 질문 레벨
    
    // 🆕 Prosodic Hints (Future)
    speechRate?: number;          // 분당 음절 수
    confidenceLevel?: 'low' | 'medium' | 'high';  // 음성 기반 자신감 추정
}
```

### 4.4 Research Data Collection Matrix

| Data Point | Type | Collection Method | Research Application |
|------------|------|-------------------|----------------------|
| Initial Latency | Number (ms) | `timestamp[n+1] - timestamp[n]` | 인지 부하 추정 |
| Thinking Pauses | Count | Silence detection during speech | 개념 재구성 분석 |
| Barge-in Events | Array | `activityHandling: INTERRUPTS` 시 이벤트 로깅 | 자신감/성급함 분석 |
| Turn Duration | Number (ms) | Derived from timestamps | 참여도 측정 |
| Speech Rate | Number | External prosodic analysis (future) | 유창성/불안도 |
| Bloom's Level | Enum | AI가 질문 생성 시 태깅 | 인지 수준 분포 분석 |
| Rubric Scores | Object | AI 평가 후 분해 저장 | 세부 역량 분석 |

### 4.5 Advanced Reasoning Analytics ✅ IMPLEMENTED

> 🧠 **핵심 목표**: 학생의 추론 품질을 구조화된 방식으로 정량화

#### Reasoning Rubric (4차원 평가)

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

#### Dialogue Metrics (실시간 대화 지표)

```typescript
// 구현 위치: types.ts, useGeminiLive.ts
interface DialogueMetrics {
  turnInitiatives: number;      // 학생 주도 대화 횟수
  rephrasingEvents: number;     // 재구성 시도 횟수
  followUpDepth: number[];      // 확장 설명 길이 배열
  latencyVariation: number;     // 응답 지연 시간 표준편차
  questionResponseRatio: number; // 질문 대비 응답 비율
}
```

#### Argument Graph (논증 구조 모델링)

```typescript
// 구현 위치: lib/reasoning/argumentGraph.ts
interface ArgumentGraph {
  nodes: ArgumentNode[];  // claim, evidence, counterargument, justification
  edges: ArgumentEdge[];  // supports, refutes, extends, responds_to
  coherenceScore: number; // 논리적 일관성 (0-100)
  complexity: number;     // 그래프 복잡도
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

#### NLP 패턴 라이브러리

```typescript
// 구현 위치: lib/reasoning/patterns.ts
// 영어 + 한국어 패턴 지원

CAUSAL_PATTERNS: ["because", "therefore", "때문에", "그래서", ...]
JUSTIFICATION_PATTERNS: ["evidence shows", "for example", "예를 들어", ...]
GENERALIZATION_PATTERNS: ["in general", "typically", "일반적으로", ...]
COUNTER_PATTERNS: ["however", "on the other hand", "하지만", "그러나", ...]
```

---

## 5. Educational Scaffolding Logic ✅ IMPLEMENTED

### 5.1 Layered Hinting System

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

### 5.2 Scaffolding Prompt Template

```typescript
// lib/prompts/interviewerSystem.ts 에 추가

const SCAFFOLDING_INSTRUCTIONS = `
## 🛠️ SCAFFOLDING PROTOCOL (3단계 힌트 시스템)

학생이 "잘 모르겠어요", 침묵(3초 이상), 또는 불완전한 답변을 할 경우:

### Level 1: 개념적 힌트 (Conceptual Hint)
- "이 개념에서 가장 중요한 특징이 무엇일까요?"
- "다른 각도에서 생각해보면..."
- ❌ 정답을 직접적으로 언급하지 않음

### Level 2: 사례 기반 힌트 (Example Hint)
- "예를 들어, [구체적 상황]의 경우를 생각해보세요."
- "만약 [가상 시나리오]라면 어떻게 될까요?"
- ❌ 여전히 정답을 직접 주지 않음

### Level 3: 단계적 하위 질문 (Guided Subquestion)
- 원래 질문을 더 작은 단위로 분해
- "먼저, [부분 개념]부터 설명해볼까요?"
- 이 단계 후에도 어려워하면, 다음 질문으로 부드럽게 전환

**⚠️ 절대 규칙**: 정답을 직접 알려주지 않음. 학생이 스스로 도달하도록 유도.
`;
```

### 5.3 Scaffolding Event Logging

```typescript
interface ScaffoldingEvent {
    questionNumber: number;
    originalQuestion: string;
    scaffoldLevel: 1 | 2 | 3;
    hintType: 'conceptual' | 'example' | 'subquestion';
    hintContent: string;
    studentResponseAfterHint: string;
    wasSuccessful: boolean;       // 힌트 후 정답에 도달했는지
    timestamp: number;
}
```

---

## 6. Data Model & Schema

### 6.1 Enhanced Entity Relationship Diagram

```
┌─────────────────────────┐
│         Course          │
├─────────────────────────┤        ┌─────────────────────────────────────────┐
│ id (PK)                 │───┐    │              Submission                  │
│ name                    │   │    ├─────────────────────────────────────────┤
│ instructor_name         │   │    │ id (PK)                                 │
│ instructor_pin_hash     │   │    │ course_id (FK)                          │◄─┘
│ password                │   └───▶│ student_name                            │
│ prompt                  │        │ timestamp                               │
│ created_at              │        │                                         │
└─────────────────────────┘        │ // Core Data                            │
                                   │ transcript[]                            │
                                   │ score                                   │
                                   │ feedback                                │
                                   │                                         │
                                   │ // 🆕 Learning Analytics                │
                                   │ latencyMetrics: LatencyMetrics          │
                                   │ bargeInEvents: BargeInEvent[]           │
                                   │ scaffoldingEvents: ScaffoldingEvent[]   │
                                   │ confidenceScore: number                 │  ◄── AI 확신도
                                   │ rubricBreakdown: RubricEvidence         │
                                   │                                         │
                                   │ // 🆕 Post-Reflection                   │
                                   │ reflectionPrompt?: string               │
                                   │ reflectionResponse?: string             │
                                   └─────────────────────────────────────────┘
```

### 6.2 Enhanced Submission Interface ✅ IMPLEMENTED

```typescript
// 구현 위치: types.ts
interface Submission {
    id: string;
    studentName: string;
    timestamp: number;
    courseName?: string;
    
    // Core Assessment
    transcript: TranscriptionItem[];
    score: number;                    // 0-100
    feedback: string;
    
    // 🆕 Learning Analytics
    latencyMetrics: {
        avgInitialLatency: number;    // 평균 초기 응답 지연
        maxLatency: number;           // 최대 지연 (어려운 질문 식별)
        totalThinkingTime: number;    // 총 사고 시간
        turnTakingRatio: number;      // 발화 비율
    };
    bargeInCount: number;             // 끼어들기 횟수
    scaffoldingUsed: number;          // 스캐폴딩 발동 횟수
    
    // 🆕 AI Confidence (Human-in-the-Loop)
    confidenceScore: number;          // 0.0 ~ 1.0 (AI 평가 확신도)
    confidenceRationale?: string;     // 확신도 근거
    
    // 🆕 Rubric Evidence
    rubricBreakdown: {
        conceptualUnderstanding: { score: number; evidence: string[] };
        communicationClarity: { score: number; evidence: string[] };
        criticalThinking: { score: number; evidence: string[] };
        engagement: { score: number; evidence: string[] };
    };
    
    // 🆕 Metacognition
    reflectionPrompt?: string;        // "가장 아쉬웠던 점은?"
    reflectionResponse?: string;      // 학생 성찰 응답
}
```

### 6.3 Supabase Schema Update

```sql
-- submissions 테이블 확장
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS
    latency_metrics JSONB DEFAULT '{}';

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS
    barge_in_count INTEGER DEFAULT 0;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS
    scaffolding_used INTEGER DEFAULT 0;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS
    confidence_score FLOAT DEFAULT NULL;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS
    rubric_breakdown JSONB DEFAULT '{}';

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS
    reflection_response TEXT DEFAULT NULL;

-- 인덱스 (연구 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_submissions_confidence 
    ON submissions(confidence_score) 
    WHERE confidence_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_scaffolding 
    ON submissions(scaffolding_used);
```

---

## 7. Prompt Engineering

### 7.1 Enhanced Interviewer System Prompt

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Section 1: PERSONA DEFINITION                                           │
│ - Role: Dr. SpeakWise (Expert Oral Examiner)                           │
│ - Tone: Professional, encouraging, pedagogically aware                  │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Section 2: INTERVIEW PROTOCOL                                           │
│ - Phase 1: Opening (15-20 sec)                                         │
│ - Phase 2: Core Assessment (4-5 questions with Bloom's tagging)        │
│ - Phase 3: Conclusion                                                   │
│ - 🆕 Phase 4: Reflection Prompt (성찰 유도)                             │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 🆕 Section 3: SCAFFOLDING PROTOCOL                                      │
│ - Level 1: 개념적 힌트                                                  │
│ - Level 2: 사례 기반 힌트                                                │
│ - Level 3: 단계적 하위 질문                                              │
│ - ❌ Never reveal answers directly                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 🆕 Section 4: REFLECTION PHASE                                          │
│ 인터뷰 종료 후, 점수를 보여주기 전:                                       │
│ "수고하셨습니다. 방금 본인의 답변 중 가장 아쉬웠던 점은 무엇인가요?"     │
│ (메타인지 유도 - 1-2문장 응답 유도)                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Question Taxonomy with Bloom's Tagging

```typescript
interface QuestionTemplate {
    bloomsLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
    stemPattern: string;
    expectedDifficulty: 1 | 2 | 3 | 4 | 5;
}

const QUESTION_TAXONOMY: QuestionTemplate[] = [
    { bloomsLevel: 'remember',    stemPattern: "Can you define...?",                    expectedDifficulty: 1 },
    { bloomsLevel: 'understand',  stemPattern: "Explain the concept of...",             expectedDifficulty: 2 },
    { bloomsLevel: 'apply',       stemPattern: "How would you apply... in...",          expectedDifficulty: 3 },
    { bloomsLevel: 'analyze',     stemPattern: "What are the differences between...",   expectedDifficulty: 4 },
    { bloomsLevel: 'evaluate',    stemPattern: "In your opinion, which approach is...", expectedDifficulty: 5 },
];
```

### 7.3 Feedback Generation with Confidence Score

```typescript
interface FeedbackOutput {
    score: number;                    // 0-100
    feedback: string;                 // 상세 피드백
    rubricBreakdown: RubricEvidence;
    
    // 🆕 AI Self-Assessment
    confidenceScore: number;          // 0.0 ~ 1.0
    confidenceRationale: string;      // "학생의 응답이 일관되어 평가에 확신을 가짐"
                                      // or "짧은 응답으로 인해 정확한 평가 어려움"
}

// Instructor Dashboard 활용:
// confidenceScore < 0.6 → "재검토 필요" 플래그 표시
```

---

## 8. Security Architecture

### 8.1 Authentication Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Instructor  │     │  PIN Entry   │     │  Dashboard   │
│  Login View  │ ──▶ │  Modal       │ ──▶ │  Access      │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ SHA-256 Hash │
                     │ Verification │
                     │ (courseId    │
                     │  as salt)    │
                     └──────────────┘
```

### 8.2 Rate Limiting

```typescript
interface RateLimitConfig {
    MAX_ATTEMPTS: 5;
    LOCKOUT_DURATION: 15 * 60 * 1000;  // 15분
    STORAGE_KEY: 'speakwise_pin_attempts';
}
```

---

## 9. Human-in-the-Loop & Ethics

### 9.1 Confidence-Based Review Workflow

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

### 9.2 Data Privacy

- 학생 식별 데이터 최소 수집 (이름만, 이메일/ID 불필요)
- `device_id`는 익명 추적용 UUID (재식별 불가)
- PIN 해시 저장 (평문 저장 안 함)
- **음성 원본 미저장**: Transcript만 보관

### 9.3 IRB Considerations

본 시스템을 연구에 사용할 경우:

1. **참여자 동의서**: AI 면접관 사용 명시
2. **데이터 수집 범위 공개**:
   - 수집 항목: 발화 내용, 응답 시간, 대화 메타데이터
   - 미수집 항목: 음성 원본, 개인 식별 정보
3. **탈퇴권(Right to Withdraw)**: 언제든지 데이터 삭제 요청 가능
4. **AI 평가의 한계 고지**: 최종 평가는 교수자 확인 권장

---

## 10. Accessibility & UX

### 10.1 WCAG 2.2 Compliance

| Criterion | Implementation |
|-----------|----------------|
| 2.4.7 Focus Visible | 3px solid outline + 6px glow shadow |
| 4.1.3 Status Messages | `role="alert"` + `aria-live="assertive"` |
| 2.3.3 Animation | `prefers-reduced-motion` media query |
| 2.4.1 Bypass Blocks | Skip to main content link |

### 10.2 Error Handling

```typescript
class ErrorBoundary extends React.Component {
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }
    // Graceful degradation with retry/reload options
}
```

---

## 11. Deployment & Configuration

### 11.1 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GEMINI_API_KEY` | ✅ | Gemini API authentication |
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `VITE_INSTRUCTOR_CODE` | ✅ | Instructor portal access code |

### 11.2 Build Commands

```bash
npm install          # 의존성 설치
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
```

---

## Appendices

### Appendix A: API Reference

```typescript
// Gemini Live Connection
const session = await ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    config: LiveConnectConfig
});

await session.sendRealtimeInput({ media: pcmBlob });
session.close();
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
| Prosodic Features | 음성의 운율적 특징 (억양, 속도, 리듬) |

### Appendix C: Research Output Examples

**1. Latency Analysis Report**
```
Session: 2026-01-28_student_001
Average Initial Latency: 2.3s
Max Latency Question: Q3 (Analyze level) - 8.1s
Interpretation: Q3 triggered significant cognitive processing
```

**2. Scaffolding Effectiveness Report**
```
Total Sessions: 42
Scaffolding Triggered: 28 (67%)
   - Level 1 successful: 18 (64%)
   - Level 2 required: 7 (25%)
   - Level 3 required: 3 (11%)
```

---

*Document Version: 2.1.0 (Learning Analytics Enhanced)*  
*Last Updated: 2026-01-28*  
*Author: SpeakWise Development Team*
