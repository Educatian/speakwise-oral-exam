import React, { useEffect, useState } from 'react';
import { AppView } from '../../types';
import { checkInstructorStatus } from '../../lib/supabase/database';

interface LandingViewProps {
    onNavigate: (view: AppView, role?: 'student' | 'instructor') => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onNavigate }) => {
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

        alert('Instructor access requires an instructor-approved account.');
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
                <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] animate-float-slow" />
                <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-emerald-600/15 rounded-full blur-[100px] animate-float-slow-reverse" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-cyan-600/10 rounded-full blur-[80px] animate-pulse-slow" />
                <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
                <div className="absolute inset-0 noise-overlay opacity-[0.015]" />
            </div>

            <div className="text-center mb-10 animate-slide-in-up max-w-3xl">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-800 bg-slate-900/60 mb-6">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">
                        Institution-ready voice assessment
                    </span>
                </div>

                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-emerald-400 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-500/25">
                    <span className="text-white text-3xl font-black italic">W</span>
                </div>

                <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3 tracking-tight">
                    SpeakWise
                </h1>
                <p className="text-slate-400 text-lg leading-relaxed">
                    Launch oral interviews by institution, guide students through a calmer voice workflow,
                    and give instructors a clearer review experience.
                </p>

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
                <div className="glass-panel-light rounded-2xl p-4 text-left">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Institution control</p>
                    <p className="text-sm text-slate-300">Organize access by campus, program, or deployment workspace.</p>
                </div>
                <div className="glass-panel-light rounded-2xl p-4 text-left">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Live interviews</p>
                    <p className="text-sm text-slate-300">Run spoken assessments with transcript capture and AI scoring.</p>
                </div>
                <div className="glass-panel-light rounded-2xl p-4 text-left">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Review workflow</p>
                    <p className="text-sm text-slate-300">Give instructors a cleaner path from course setup to submission review.</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 w-full max-w-3xl animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
                <button
                    onClick={handleInstructorClick}
                    className="role-card flex-1 glass-panel p-8 rounded-3xl text-left group hover:border-indigo-500/50 transition-all duration-300"
                    aria-label="Enter Instructor Workspace"
                >
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center group-hover:scale-110 transition-transform">
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
                    className="role-card flex-1 glass-panel p-8 rounded-3xl text-left group hover:border-emerald-500/50 transition-all duration-300"
                    aria-label="Enter Student Workspace"
                >
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center group-hover:scale-110 transition-transform">
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
