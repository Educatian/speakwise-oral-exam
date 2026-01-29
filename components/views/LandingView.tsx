import React from 'react';
import { AppView } from '../../types';

interface LandingViewProps {
    onNavigate: (view: AppView) => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onNavigate }) => {
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

                {/* Floating Particles */}
                <div className="particles-container">
                    {[...Array(6)].map((_, i) => (
                        <div
                            key={i}
                            className="particle"
                            style={{
                                left: `${15 + i * 15}%`,
                                animationDelay: `${i * 0.8}s`,
                                animationDuration: `${8 + i * 2}s`
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* Glass container overlay */}
            <div className="glass-container absolute inset-0 -z-5" />
            {/* Logo & Branding */}
            <div className="text-center mb-12 animate-slide-in-up">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-6 shadow-2xl">
                    <span className="text-4xl font-black text-white">W</span>
                </div>
                <h1 className="text-4xl font-black text-white mb-2">
                    SpeakWise<span className="text-indigo-400">.</span>
                </h1>
                <p className="text-slate-400 text-lg">
                    AI-Powered Oral Examination Platform
                </p>
            </div>

            {/* Role Selection Cards */}
            <div className="flex flex-col sm:flex-row gap-6 w-full max-w-2xl animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
                {/* Instructor Card */}
                <button
                    onClick={() => onNavigate(AppView.UNIFIED_AUTH)}
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
                        <span>Enter Dashboard</span>
                        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </button>

                {/* Student Card */}
                <button
                    onClick={() => onNavigate(AppView.UNIFIED_AUTH)}
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
                        Browse available courses, join interview sessions, and view your submission history.
                    </p>
                    <div className="mt-6 flex items-center text-emerald-400 text-sm font-medium group-hover:translate-x-2 transition-transform">
                        <span>Browse Courses</span>
                        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </button>
            </div>

            {/* Footer */}
            <div className="mt-16 text-center animate-slide-in-up" style={{ animationDelay: '0.2s' }}>
                <p className="text-slate-600 text-sm flex items-center justify-center gap-2">
                    <span>Powered by</span>
                    <span className="text-indigo-400 font-medium">Gemini 2.5 Native Audio</span>
                </p>
            </div>
        </div>
    );
};
