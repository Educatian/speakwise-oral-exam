import React, { useEffect, useState } from 'react';
import { AppView } from '../../types';
import { checkInstructorStatus } from '../../lib/supabase/database';
import { useToastContext } from '../../contexts/ToastContext';

interface LandingViewProps {
    onNavigate: (view: AppView, role?: 'student' | 'instructor') => void;
}

const GUIDE_URL = 'https://speakwise-guide.pages.dev';
const REPO_URL = 'https://github.com/Educatian/speakwise-oral-exam';

export const LandingView: React.FC<LandingViewProps> = ({ onNavigate }) => {
    const toast = useToastContext();
    const [loggedInUser, setLoggedInUser] = useState<{ email: string; role: string } | null>(null);
    const [savedInstitution, setSavedInstitution] = useState<{ schoolName: string } | null>(null);
    const [checkingRole, setCheckingRole] = useState(false);

    useEffect(() => {
        const storedUser = localStorage.getItem('speakwise_user');
        const storedSchool = localStorage.getItem('speakwise_school');

        if (storedUser) {
            try {
                const userData = JSON.parse(storedUser);
                if (userData.email) {
                    setLoggedInUser({ email: userData.email, role: userData.role || 'student' });
                }
            } catch (error) {
                localStorage.removeItem('speakwise_user');
            }
        }

        if (storedSchool) {
            try {
                const schoolData = JSON.parse(storedSchool);
                if (schoolData.schoolName) {
                    setSavedInstitution({ schoolName: schoolData.schoolName });
                }
            } catch (error) {
                localStorage.removeItem('speakwise_school');
            }
        }
    }, []);

    const handleInstructorClick = async () => {
        if (!loggedInUser) {
            onNavigate(AppView.UNIFIED_AUTH, 'instructor');
            return;
        }

        setCheckingRole(true);
        const hasInstructorAccess = await checkInstructorStatus(loggedInUser.email);
        setCheckingRole(false);

        if (hasInstructorAccess) {
            const updatedUser = { ...JSON.parse(localStorage.getItem('speakwise_user') || '{}'), role: 'instructor' };
            localStorage.setItem('speakwise_user', JSON.stringify(updatedUser));
            onNavigate(AppView.INSTRUCTOR_DASHBOARD);
            return;
        }

        toast.warning('Instructor access requires an instructor-approved account.');
        onNavigate(AppView.UNIFIED_AUTH, 'instructor');
    };

    const handleStudentClick = () => {
        if (loggedInUser) {
            onNavigate(AppView.STUDENT_COURSES);
            return;
        }

        onNavigate(AppView.UNIFIED_AUTH, 'student');
    };

    const scrollTo = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="relative min-h-screen overflow-x-clip bg-[#070b16] text-slate-200">
            {/* ───────────────────────── ambient backdrop ───────────────────────── */}
            <div className="absolute inset-0 -z-10 pointer-events-none">
                <img
                    src="/landing/hero.webp"
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 w-full h-[120vh] object-cover opacity-70"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/hero-ambient.webp'; }}
                />
                <div className="absolute inset-x-0 top-0 h-[120vh] bg-gradient-to-b from-[#070b16]/40 via-[#070b16]/70 to-[#070b16]" />
                <div className="scientific-ambient-grid absolute inset-x-0 top-0 h-[110vh] opacity-60" />
                <div className="absolute inset-0 noise-overlay opacity-[0.02]" />
            </div>

            {/* ───────────────────────── top nav ───────────────────────── */}
            <header className="sticky top-0 z-40 backdrop-blur-md bg-[#070b16]/70 border-b border-slate-800/60">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-6">
                    <div className="flex items-center gap-3 mr-auto">
                        <div className="w-9 h-9 rounded-xl overflow-hidden ring-1 ring-cyan-400/25">
                            <img src="/logo.png" alt="SpeakWise" className="w-full h-full object-cover" />
                        </div>
                        <span className="text-white font-bold tracking-tight text-lg">SpeakWise<span className="text-cyan-400">.</span></span>
                    </div>
                    <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
                        <button onClick={() => scrollTo('features')} className="hover:text-slate-200 transition-colors">Evidence</button>
                        <button onClick={() => scrollTo('how-it-works')} className="hover:text-slate-200 transition-colors">How it works</button>
                        <button onClick={() => scrollTo('trust')} className="hover:text-slate-200 transition-colors">Trust</button>
                        <a href={GUIDE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-slate-200 transition-colors">Guide</a>
                    </nav>
                    <button
                        onClick={handleStudentClick}
                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500/90 hover:bg-emerald-400 text-slate-950 transition-colors shadow-[0_0_30px_-12px_rgba(16,185,129,0.9)]"
                        style={{ touchAction: 'manipulation' }}
                    >
                        Open workspace
                    </button>
                </div>
            </header>

            {/* ───────────────────────── hero ───────────────────────── */}
            <section className="relative max-w-6xl mx-auto px-6 pt-20 pb-12 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-500/15 bg-slate-950/70 mb-8 shadow-[0_0_40px_-28px_rgba(34,211,238,0.8)] animate-slide-in-up">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">
                        Institution-ready AI oral assessment
                    </span>
                </div>

                <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[1.05] animate-slide-in-up">
                    Oral exams, measured.
                    <span className="block mt-2 bg-gradient-to-r from-emerald-300 via-cyan-300 to-indigo-300 bg-clip-text text-transparent">
                        Evidence, not vibes.
                    </span>
                </h1>

                <p className="mt-6 text-slate-300 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto animate-slide-in-up" style={{ animationDelay: '0.05s' }}>
                    SpeakWise runs calm, structured AI voice interviews for real coursework — then shows
                    instructors the transcript evidence, reasoning analytics, and concept map behind every score.
                    A human always has the final word.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
                    <button
                        onClick={handleStudentClick}
                        className="w-full sm:w-auto px-8 py-4 rounded-2xl font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-colors shadow-[0_0_50px_-15px_rgba(16,185,129,0.9)]"
                        style={{ touchAction: 'manipulation' }}
                        aria-label="Enter Student Workspace"
                    >
                        Student Workspace {loggedInUser ? '→ courses' : '→'}
                    </button>
                    <button
                        onClick={handleInstructorClick}
                        className="w-full sm:w-auto px-8 py-4 rounded-2xl font-semibold text-white border border-indigo-400/40 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
                        style={{ touchAction: 'manipulation' }}
                        aria-label="Enter Instructor Workspace"
                    >
                        {checkingRole ? 'Checking access…' : 'Instructor Workspace →'}
                    </button>
                </div>

                {(loggedInUser || savedInstitution) && (
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        {loggedInUser && (
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                                <span className="text-emerald-400 text-sm font-medium">Signed in as {loggedInUser.email}</span>
                            </div>
                        )}
                        {savedInstitution && (
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                                <span className="text-[10px] uppercase tracking-[0.2em] text-indigo-300 font-bold">Last workspace</span>
                                <span className="text-sm text-indigo-100">{savedInstitution.schoolName}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* product shot in a browser frame */}
                <div className="mt-14 max-w-5xl mx-auto animate-slide-in-up" style={{ animationDelay: '0.15s' }}>
                    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 shadow-[0_30px_120px_-40px_rgba(34,211,238,0.35)] overflow-hidden backdrop-blur-sm">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-950/80">
                            <span className="w-3 h-3 rounded-full bg-rose-500/70" />
                            <span className="w-3 h-3 rounded-full bg-amber-400/70" />
                            <span className="w-3 h-3 rounded-full bg-emerald-400/70" />
                            <span className="ml-3 text-[11px] text-slate-500 font-mono truncate">speakwise-oral-exam.pages.dev — Course Manager Dashboard</span>
                        </div>
                        <img src="/landing/shot-dashboard.webp" alt="SpeakWise instructor dashboard" loading="eager" className="w-full block" />
                    </div>
                </div>

                {/* stats strip */}
                <dl className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
                    {[
                        ['4', 'rubric dimensions scored per interview'],
                        ['6', 'Toulmin roles mapped in every argument'],
                        ['100%', 'submissions carry transcript evidence'],
                        ['1', 'human review before any grade stands'],
                    ].map(([n, label]) => (
                        <div key={label} className="glass-panel-light rounded-2xl px-5 py-4 border border-slate-700/40">
                            <dt className="sr-only">{label}</dt>
                            <dd>
                                <span className="text-2xl font-bold text-white">{n}</span>
                                <span className="block mt-1 text-xs text-slate-400 leading-snug">{label}</span>
                            </dd>
                        </div>
                    ))}
                </dl>
            </section>

            {/* ───────────────────────── how it works ───────────────────────── */}
            <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-20 scroll-mt-20">
                <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-400/80 font-bold text-center">How it works</p>
                <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white text-center tracking-tight">From course code to defensible grade</h2>
                <div className="mt-12 grid md:grid-cols-3 gap-6">
                    {[
                        {
                            step: '01',
                            title: 'Publish a course',
                            body: 'Instructors write or AI-generate the examiner brief — or import questions straight from a PDF/Word syllabus. Set a passcode, and it is live for your institution.',
                            img: '/landing/shot-dashboard.webp',
                            alt: 'Course creation dashboard'
                        },
                        {
                            step: '02',
                            title: 'Students interview',
                            body: 'A calm, turn-based voice interview with a mic check first, supportive pauses, and automatic transcription. No trick UI, no pressure mechanics.',
                            img: '/landing/shot-preinterview.webp',
                            alt: 'Calm pre-interview screen with microphone test'
                        },
                        {
                            step: '03',
                            title: 'Review the evidence',
                            body: 'Scores arrive with rubric breakdowns, reasoning analytics, and a concept map. Flagged submissions queue for human review — instructors validate or override.',
                            img: '/landing/shot-analytics.webp',
                            alt: 'Class analytics with cohort statistics'
                        },
                    ].map((s) => (
                        <div key={s.step} className="glass-panel rounded-3xl border border-slate-700/40 overflow-hidden flex flex-col">
                            <img src={s.img} alt={s.alt} loading="lazy" className="w-full aspect-[16/10] object-cover object-top border-b border-slate-800" />
                            <div className="p-6 flex-1">
                                <span className="text-[11px] font-mono text-cyan-400/80">{s.step}</span>
                                <h3 className="mt-1 text-lg font-bold text-white">{s.title}</h3>
                                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{s.body}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ───────────────────────── evidence feature ───────────────────────── */}
            <section id="features" className="max-w-6xl mx-auto px-6 py-20 scroll-mt-20">
                <div className="grid lg:grid-cols-2 gap-10 items-center">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-400/80 font-bold">Evidence over mystery</p>
                        <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
                            Every score has a map behind it
                        </h2>
                        <p className="mt-4 text-slate-400 leading-relaxed">
                            SpeakWise turns the spoken interview into a radial argument map — claims at the centre,
                            evidence, warrants and rebuttals around them, coloured by their Toulmin role.
                            Gold rings mark the concepts that actually drove the score, so the path from
                            map to grade is traceable.
                        </p>
                        <ul className="mt-6 space-y-3 text-sm text-slate-300">
                            {[
                                'Radial / force layouts with semantic edge colours (supports · causal · counter · responds)',
                                'Toulmin completeness strip: Claim, Data, Warrant, Backing, Qualifier, Rebuttal',
                                'Weak-structure flags and turn-by-turn timeline replay',
                                'LLM ↔ pattern score agreement with confidence calibration',
                            ].map((t) => (
                                <li key={t} className="flex gap-3">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                    <span>{t}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="rounded-2xl border border-slate-700/60 overflow-hidden shadow-[0_30px_100px_-50px_rgba(16,185,129,0.5)]">
                        <img src="/landing/shot-toulmin.webp" alt="Radial concept map in Toulmin colour mode" loading="lazy" className="w-full block" />
                    </div>
                </div>
            </section>

            {/* ───────────────────────── voice band ───────────────────────── */}
            <section className="relative py-24 my-4 overflow-hidden">
                <img src="/landing/wave.webp" alt="" aria-hidden="true" loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover opacity-50"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                <div className="absolute inset-0 bg-gradient-to-b from-[#070b16] via-transparent to-[#070b16]" />
                <div className="relative max-w-3xl mx-auto px-6 text-center">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-400/80 font-bold">Calm before clever</p>
                    <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white tracking-tight">A voice pipeline built for exam day</h2>
                    <p className="mt-4 text-slate-300 leading-relaxed">
                        Live Gemini voice with turn-based pacing, automatic reconnect with backoff if the network blips,
                        transcription retries with honest fallbacks, and screen-reader announcements at every phase.
                        A dropped packet should never end an exam.
                    </p>
                </div>
            </section>

            {/* ───────────────────────── trust ───────────────────────── */}
            <section id="trust" className="max-w-6xl mx-auto px-6 py-20 scroll-mt-20">
                <p className="text-[11px] uppercase tracking-[0.3em] text-indigo-300/80 font-bold text-center">Operational trust</p>
                <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white text-center tracking-tight">Built like infrastructure, not a demo</h2>
                <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {[
                        ['Institution isolation', 'Supabase Auth + Row Level Security: a signed-in user sees only their institution’s courses and submissions.'],
                        ['Human review, by design', 'Low-confidence or disagreeing scores are flagged with reasons and queue for instructor validation or override.'],
                        ['Keys stay server-side', 'LLM calls go through a Cloudflare worker proxy; the voice session uses single-use ephemeral tokens. Nothing in the bundle.'],
                        ['Reproducible exports', 'CSV/JSON cohort exports carry analysis, prompt, and model version stamps so results can be audited later.'],
                    ].map(([title, body]) => (
                        <div key={title} className="glass-panel-light rounded-2xl p-6 border border-slate-700/40">
                            <h3 className="text-white font-bold text-sm">{title}</h3>
                            <p className="mt-2 text-sm text-slate-400 leading-relaxed">{body}</p>
                        </div>
                    ))}
                </div>
                <p className="mt-8 text-center text-xs text-slate-500">
                    React 19 · TypeScript · Supabase RLS · Cloudflare Pages · CI-gated (type-check / lint / 117 tests / build)
                </p>
            </section>

            {/* ───────────────────────── final CTA role cards ───────────────────────── */}
            <section className="max-w-5xl mx-auto px-6 py-20">
                <h2 className="text-3xl sm:text-4xl font-bold text-white text-center tracking-tight mb-3">Choose your workspace</h2>
                <p className="text-center text-slate-400 mb-10">Watch the <a className="text-cyan-300 hover:text-cyan-200 underline underline-offset-4" href={GUIDE_URL} target="_blank" rel="noopener noreferrer">narrated walkthrough</a> first, or jump straight in.</p>
                <div className="flex flex-col sm:flex-row gap-6 w-full">
                    <button
                        onClick={handleInstructorClick}
                        className="role-card flex-1 glass-panel p-8 rounded-3xl text-left group hover:border-cyan-400/35 transition-all duration-300 bg-slate-950/55"
                        aria-label="Enter Instructor Workspace"
                        style={{ touchAction: 'manipulation' }}
                    >
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-[linear-gradient(135deg,rgba(14,116,144,0.95),rgba(59,130,246,0.75))] flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_30px_-18px_rgba(56,189,248,0.9)]">
                                <img src="/role-instructor.png" alt="" aria-hidden="true" className="w-7 h-7 object-contain" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Instructor Workspace</h3>
                                <p className="text-indigo-300 text-sm font-medium">Course operations and review</p>
                            </div>
                        </div>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            Build institution-scoped courses, upload source materials, and review every submission with analytics.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <span className="badge badge-accent">Course setup</span>
                            <span className="badge badge-accent">Submission review</span>
                            <span className="badge badge-accent">Institution rollout</span>
                        </div>
                        <div className="mt-6 flex items-center text-indigo-400 text-sm font-medium group-hover:translate-x-2 transition-transform">
                            <span>{checkingRole ? 'Checking access...' : (loggedInUser ? 'Continue to dashboard ->' : 'Enter workspace ->')}</span>
                        </div>
                    </button>

                    <button
                        onClick={handleStudentClick}
                        className="role-card flex-1 glass-panel p-8 rounded-3xl text-left group hover:border-emerald-400/35 transition-all duration-300 bg-slate-950/55"
                        aria-label="Enter Student Workspace"
                        style={{ touchAction: 'manipulation' }}
                    >
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-[linear-gradient(135deg,rgba(5,150,105,0.92),rgba(45,212,191,0.7))] flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_30px_-18px_rgba(16,185,129,0.9)]">
                                <img src="/role-student.png" alt="" aria-hidden="true" className="w-7 h-7 object-contain" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Student Workspace</h3>
                                <p className="text-emerald-300 text-sm font-medium">Guided interview and results</p>
                            </div>
                        </div>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            Join your institution, start a voice interview, and review results in a cleaner structure.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <span className="badge badge-primary">Institution entry</span>
                            <span className="badge badge-primary">Live practice</span>
                            <span className="badge badge-primary">Structured results</span>
                        </div>
                        <div className="mt-6 flex items-center text-emerald-400 text-sm font-medium group-hover:translate-x-2 transition-transform">
                            <span>{loggedInUser ? 'Continue to courses ->' : 'Start practice ->'}</span>
                        </div>
                    </button>
                </div>
            </section>

            {/* ───────────────────────── footer ───────────────────────── */}
            <footer className="border-t border-slate-800/60 bg-slate-950/60">
                <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center gap-4 text-xs text-slate-500">
                    <div className="flex items-center gap-2 mr-auto">
                        <div className="w-6 h-6 rounded-lg overflow-hidden ring-1 ring-slate-700">
                            <img src="/logo.png" alt="" aria-hidden="true" className="w-full h-full object-cover" />
                        </div>
                        <span>SpeakWise — institution-ready AI oral assessment</span>
                    </div>
                    <nav className="flex items-center gap-5">
                        <a href={GUIDE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">Walkthrough guide</a>
                        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">GitHub</a>
                        <span>Powered by Google Gemini live audio</span>
                    </nav>
                </div>
            </footer>
        </div>
    );
};

export default LandingView;
