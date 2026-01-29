import React, { useEffect, useState } from 'react';
import { AppView } from '../../types';

interface LandingViewProps {
    onNavigate: (view: AppView, role?: 'student' | 'instructor') => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onNavigate }) => {
    // Check for existing login session
    const [loggedInUser, setLoggedInUser] = useState<{ email: string; role: string } | null>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('speakwise_user');
        if (storedUser) {
            try {
                const userData = JSON.parse(storedUser);
                if (userData.email) {
                    setLoggedInUser({ email: userData.email, role: userData.role || 'student' });
                }
            } catch (e) {
                // Invalid data
            }
        }
    }, []);

    // Smart navigation: if logged in, go directly to dashboard
    const handleInstructorClick = () => {
        // Check if logged in user is an instructor
        if (loggedInUser?.role === 'instructor') {
            onNavigate(AppView.INSTRUCTOR_DASHBOARD);
        } else if (loggedInUser?.role === 'student') {
            // Students cannot access instructor dashboard - show message or redirect to auth
            alert('Instructor access requires instructor credentials. Please sign in as an instructor.');
            onNavigate(AppView.UNIFIED_AUTH, 'instructor');
        } else {
            // Not logged in - go to auth
            onNavigate(AppView.UNIFIED_AUTH, 'instructor');
        }
    };

    const handleStudentClick = () => {
        if (loggedInUser) {
            // Both students and instructors can access student courses
            onNavigate(AppView.STUDENT_COURSES);
        } else {
            onNavigate(AppView.UNIFIED_AUTH, 'student');
        }
    };

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 -z-10">
                {/* Gradient Orbs */}
                <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] animate-float-slow" />
                <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] animate-float-slow-reverse" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-600/10 rounded-full blur-[80px] animate-pulse-slow" />

                {/* Grid Pattern Overlay */}
                <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />

                {/* Subtle Noise Texture */}
                <div className="absolute inset-0 noise-overlay opacity-[0.015]" />
            </div>

            {/* Logo & Branding */}
            <div className="text-center mb-12 animate-slide-in-up">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-emerald-400 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-500/25">
                    <span className="text-white text-3xl font-black italic">W</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3 tracking-tight">
                    SpeakWise
                </h1>
                <p className="text-slate-400 text-lg max-w-md mx-auto">
                    AI-Powered Oral Examination Platform
                </p>
                {/* Logged in indicator */}
                {loggedInUser && (
                    <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        <span className="text-emerald-400 text-sm font-medium">
                            Signed in as {loggedInUser.email}
                        </span>
                    </div>
                )}
            </div>

            {/* Role Selection Cards */}
            <div className="flex flex-col sm:flex-row gap-6 w-full max-w-2xl animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
                {/* Instructor Card */}
                <button
                    onClick={handleInstructorClick}
                    className="role-card flex-1 glass-panel p-8 rounded-3xl text-left group hover:border-indigo-500/50 transition-all duration-300"
                    aria-label="Enter Instructor Portal"
                >
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <span className="text-2xl">👨‍🏫</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Instructor</h2>
                            <p className="text-indigo-400 text-sm font-medium">Portal</p>
                        </div>
                    </div>
                    <p className="text-slate-400 text-sm leading-relaxed">
                        Create and manage oral exam courses. View student submissions and performance analytics.
                    </p>
                    <div className="mt-6 flex items-center text-indigo-400 text-sm font-medium group-hover:translate-x-2 transition-transform">
                        <span>{loggedInUser ? 'Continue to Dashboard →' : 'Enter Dashboard'}</span>
                        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </button>

                {/* Student Card */}
                <button
                    onClick={handleStudentClick}
                    className="role-card flex-1 glass-panel p-8 rounded-3xl text-left group hover:border-emerald-500/50 transition-all duration-300"
                    aria-label="Enter Student Portal"
                >
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <span className="text-2xl">👨‍🎓</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Student</h2>
                            <p className="text-emerald-400 text-sm font-medium">Portal</p>
                        </div>
                    </div>
                    <p className="text-slate-400 text-sm leading-relaxed">
                        Practice oral exams with AI feedback. Track your progress and improve your skills.
                    </p>
                    <div className="mt-6 flex items-center text-emerald-400 text-sm font-medium group-hover:translate-x-2 transition-transform">
                        <span>{loggedInUser ? 'Continue to Courses →' : 'Start Practice'}</span>
                        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </button>
            </div>

            {/* Footer */}
            <div className="mt-12 text-center text-slate-600 text-xs animate-slide-in-up" style={{ animationDelay: '0.2s' }}>
                <p>Powered by Google Gemini 2.5 Native Audio</p>
            </div>
        </div>
    );
};

export default LandingView;
