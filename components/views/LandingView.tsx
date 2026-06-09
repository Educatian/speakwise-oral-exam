import React, { useEffect, useState } from 'react';
import { AppView } from '../../types';
import { checkInstructorStatus } from '../../lib/supabase/database';
import { useToastContext } from '../../contexts/ToastContext';

interface LandingViewProps {
    onNavigate: (view: AppView, role?: 'student' | 'instructor') => void;
}

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

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden">
            <div className="absolute inset-0 -z-10">
                <div className="scientific-ambient-bg absolute inset-0" />
                <div className="scientific-ambient-grid absolute inset-0" />
                <div className="scientific-ambient-rings absolute inset-0" />
                <div className="scientific-ambient-points absolute inset-0" />
                <div className="absolute top-[18%] left-[10%] w-[28rem] h-[28rem] rounded-full bg-cyan-500/8 blur-[120px] animate-float-slow" />
                <div className="absolute bottom-[12%] right-[8%] w-[30rem] h-[30rem] rounded-full bg-emerald-500/8 blur-[140px] animate-float-slow-reverse" />
                <div className="absolute top-[52%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[22rem] h-[22rem] rounded-full border border-slate-800/70 opacity-70" />
                <div className="absolute inset-0 noise-overlay opacity-[0.02]" />
            </div>

            <div className="text-center mb-10 animate-slide-in-up max-w-3xl">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-500/15 bg-slate-950/70 mb-6 shadow-[0_0_40px_-28px_rgba(34,211,238,0.8)]">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">
                        Scientific oral assessment workspace
                    </span>
                </div>

                <div className="relative w-24 h-24 mx-auto mb-6 rounded-[2rem] overflow-hidden ring-1 ring-cyan-400/20 shadow-[0_0_70px_-28px_rgba(56,189,248,0.85)]">
                    <img src="/logo.png" alt="SpeakWise" className="w-full h-full object-cover" />
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
                    SpeakWise
                </h1>
                <p className="text-slate-300 text-lg leading-relaxed max-w-2xl mx-auto">
                    A calmer voice-assessment platform for institutions that want measured AI interviews,
                    structured reasoning review, and a more focused academic atmosphere.
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    <span>Low-noise motion</span>
                    <span className="w-1 h-1 rounded-full bg-slate-700" />
                    <span>Institution-ready workflows</span>
                    <span className="w-1 h-1 rounded-full bg-slate-700" />
                    <span>Ambient scientific UI</span>
                </div>

                {loggedInUser && (
                    <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        <span className="text-emerald-400 text-sm font-medium">
                            Signed in as {loggedInUser.email}
                        </span>
                    </div>
                )}

                {savedInstitution && (
                    <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-indigo-300 font-bold">
                            Last workspace
                        </span>
                        <span className="text-sm text-indigo-100">
                            {savedInstitution.schoolName}
                        </span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-4xl mb-8 animate-slide-in-up" style={{ animationDelay: '0.05s' }}>
                <div className="glass-panel-light rounded-2xl p-4 text-left border border-cyan-500/10">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Institution control</p>
                    <p className="text-sm text-slate-300">Organize access by campus, program, or deployment workspace.</p>
                </div>
                <div className="glass-panel-light rounded-2xl p-4 text-left border border-cyan-500/10">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Live interviews</p>
                    <p className="text-sm text-slate-300">Run spoken assessments with transcript capture and AI scoring.</p>
                </div>
                <div className="glass-panel-light rounded-2xl p-4 text-left border border-cyan-500/10">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Review workflow</p>
                    <p className="text-sm text-slate-300">Give instructors a cleaner path from course setup to submission review.</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 w-full max-w-3xl animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
                <button
                    onClick={handleInstructorClick}
                    className="role-card flex-1 glass-panel p-8 rounded-3xl text-left group hover:border-cyan-400/35 transition-all duration-300 bg-slate-950/55"
                    aria-label="Enter Instructor Workspace"
                >
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-[linear-gradient(135deg,rgba(14,116,144,0.95),rgba(59,130,246,0.75))] flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_30px_-18px_rgba(56,189,248,0.9)]">
                            <span className="text-2xl">I</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Instructor Workspace</h2>
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
                >
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-[linear-gradient(135deg,rgba(5,150,105,0.92),rgba(45,212,191,0.7))] flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_30px_-18px_rgba(16,185,129,0.9)]">
                            <span className="text-2xl">S</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Student Workspace</h2>
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

            <div className="mt-12 text-center text-slate-600 text-xs animate-slide-in-up" style={{ animationDelay: '0.2s' }}>
                <p>Powered by Google Gemini live audio workflows</p>
            </div>
        </div>
    );
};

export default LandingView;
