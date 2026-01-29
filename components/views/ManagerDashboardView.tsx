import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Course, Submission } from '../../types';
import { Button, Input, Textarea, Modal, PinVerifyModal } from '../ui';
import { createCoursePromptGenerator } from '../../lib/prompts/interviewerSystem';

import { hashPin, isValidPin } from '../../lib/utils/pinHash';

import { ADMIN_EMAIL } from '../../types';

interface ManagerDashboardViewProps {
    courses: Course[];
    onAddCourse: (course: Omit<Course, 'id' | 'submissions'>) => void;
    onUpdateCourse?: (courseId: string, updates: Partial<Course>) => void;
    onDeleteCourse: (id: string) => void;
    onDeleteSubmission: (courseId: string, submissionId: string) => void;
    onSelectSubmission: (submission: Submission) => void;
    onBack: () => void;
    currentUserEmail?: string; // For access control
    onAdminPanel?: () => void; // Admin-only panel access
}

/**
 * Manager Dashboard View
 * Course management, creation, and submission review interface
 */
export const ManagerDashboardView: React.FC<ManagerDashboardViewProps> = ({
    courses,
    onAddCourse,
    onUpdateCourse,
    onDeleteCourse,
    onDeleteSubmission,
    onSelectSubmission,
    onBack,
    currentUserEmail,
    onAdminPanel
}) => {
    // Check if current user is admin
    const isAdmin = currentUserEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    // Form state
    const [courseName, setCourseName] = useState('');
    const [instructorName, setInstructorName] = useState('');
    const [instructorPin, setInstructorPin] = useState('');
    const [coursePassword, setCoursePassword] = useState('');
    const [coursePrompt, setCoursePrompt] = useState('');
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Modal state
    const [viewingCourse, setViewingCourse] = useState<Course | null>(null);

    // Editing state for course prompt
    const [isEditingPrompt, setIsEditingPrompt] = useState(false);
    const [editedPrompt, setEditedPrompt] = useState('');

    // PIN verification state
    const [pinModalCourse, setPinModalCourse] = useState<Course | null>(null);
    const [pinModalAction, setPinModalAction] = useState<'view' | 'delete' | null>(null);
    const [verifiedCourses, setVerifiedCourses] = useState<Set<string>>(new Set());

    // Handle PIN verification action
    const handlePinAction = (course: Course, action: 'view' | 'delete') => {
        // Admin bypasses PIN verification
        if (isAdmin) {
            if (action === 'view') {
                setViewingCourse(course);
            } else {
                onDeleteCourse(course.id);
            }
            return;
        }

        // If already verified for this course, proceed directly
        if (verifiedCourses.has(course.id)) {
            if (action === 'view') {
                setViewingCourse(course);
            } else {
                onDeleteCourse(course.id);
            }
            return;
        }
        // Otherwise, show PIN modal
        setPinModalCourse(course);
        setPinModalAction(action);
    };

    const handlePinVerified = () => {
        if (!pinModalCourse || !pinModalAction) return;

        // Mark this course as verified for this session
        setVerifiedCourses(prev => new Set([...prev, pinModalCourse.id]));

        if (pinModalAction === 'view') {
            setViewingCourse(pinModalCourse);
        } else {
            onDeleteCourse(pinModalCourse.id);
        }

        setPinModalCourse(null);
        setPinModalAction(null);
    };

    // Validate and add course
    const handleAddCourse = async () => {
        setFormError(null);

        if (!courseName.trim()) {
            setFormError('Course name is required.');
            return;
        }
        if (!instructorName.trim()) {
            setFormError('Instructor name is required.');
            return;
        }
        if (!instructorPin.trim()) {
            setFormError('Instructor PIN is required to protect submissions.');
            return;
        }
        if (!isValidPin(instructorPin)) {
            setFormError('Instructor PIN must be exactly 4 digits.');
            return;
        }
        if (!coursePassword.trim()) {
            setFormError('Student passcode is required.');
            return;
        }
        if (coursePassword.length < 4) {
            setFormError('Passcode must be at least 4 characters.');
            return;
        }
        if (!coursePrompt.trim()) {
            setFormError('AI interviewer instruction is required.');
            return;
        }

        // Generate a temporary course ID for hashing
        const tempId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const pinHash = await hashPin(instructorPin, tempId);

        onAddCourse({
            name: courseName.trim(),
            instructorName: instructorName.trim(),
            instructorPinHash: pinHash,
            password: coursePassword,
            prompt: coursePrompt.trim(),
            ownerEmail: currentUserEmail // Set owner for visibility control
        });

        // Reset form
        setCourseName('');
        setInstructorName('');
        setInstructorPin('');
        setCoursePassword('');
        setCoursePrompt('');
    };

    // Generate AI prompt
    const handleGeneratePrompt = async () => {
        if (!courseName.trim()) {
            setFormError('Please enter a course name first.');
            return;
        }

        setIsGeneratingPrompt(true);
        setFormError(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: createCoursePromptGenerator(courseName)
            });

            if (response.text) {
                setCoursePrompt(response.text);
            }
        } catch (err) {
            console.error('Prompt generation failed:', err);
            setFormError('Failed to generate prompt. Please try again.');
        } finally {
            setIsGeneratingPrompt(false);
        }
    };

    // Filter courses based on ownership (admin sees all, others see only their own)
    const visibleCourses = isAdmin
        ? courses
        : courses.filter(c => c.ownerEmail?.toLowerCase() === currentUserEmail?.toLowerCase());

    // Get all submissions sorted by timestamp (only from visible courses)
    const allSubmissions = visibleCourses
        .flatMap(c => c.submissions.map(s => ({ ...s, courseName: c.name })))
        .sort((a, b) => b.timestamp - a.timestamp);

    const totalSubmissions = allSubmissions.length;

    return (
        <div className="w-full max-w-6xl mx-auto space-y-8 animate-slide-in-up pb-20">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold text-white">Course Manager Dashboard</h2>
                    {/* Admin Panel Button - only for admins */}
                    {onAdminPanel && (
                        <button
                            onClick={onAdminPanel}
                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold rounded-lg flex items-center gap-2 transition-all"
                            title="Admin Panel"
                        >
                            👑 Admin Panel
                        </button>
                    )}
                </div>
                <Button variant="ghost" onClick={onBack}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 0118 0z" />
                    </svg>
                    Switch to Student Portal
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column - Create Course & List */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Create Course Form */}
                    <div className="glass-panel p-6 rounded-3xl space-y-4">
                        <h3 className="text-lg font-semibold text-emerald-400">Add New Course</h3>

                        <Input
                            placeholder="Course Name (e.g. Junior Dev Technical Interview)"
                            value={courseName}
                            onChange={(e) => setCourseName(e.target.value)}
                            aria-label="Course name"
                        />

                        <Input
                            placeholder="Your Name (Instructor)"
                            value={instructorName}
                            onChange={(e) => setInstructorName(e.target.value)}
                            aria-label="Instructor name"
                        />

                        <Input
                            type="password"
                            placeholder="Instructor PIN (4 digits) - to view submissions"
                            value={instructorPin}
                            onChange={(e) => setInstructorPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            maxLength={4}
                            aria-label="Instructor PIN"
                        />

                        <Input
                            placeholder="Student Passcode (for students to join)"
                            value={coursePassword}
                            onChange={(e) => setCoursePassword(e.target.value)}
                            aria-label="Student passcode"
                        />

                        <div className="relative">
                            <Textarea
                                placeholder="AI Interviewer System Instruction"
                                value={coursePrompt}
                                onChange={(e) => setCoursePrompt(e.target.value)}
                                className="pr-24"
                                aria-label="AI interviewer instruction"
                            />
                            <button
                                onClick={handleGeneratePrompt}
                                disabled={isGeneratingPrompt}
                                className="absolute right-2 bottom-2 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 text-[10px] font-bold px-2 py-1 rounded border border-indigo-500/30 flex items-center gap-1 transition-all disabled:opacity-50"
                                aria-label="Generate prompt with AI"
                            >
                                {isGeneratingPrompt ? (
                                    <span className="spinner w-3 h-3" />
                                ) : (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                )}
                                AI Generate
                            </button>
                        </div>

                        {formError && (
                            <p className="text-red-400 text-sm" role="alert">{formError}</p>
                        )}

                        <Button
                            onClick={handleAddCourse}
                            variant="accent"
                            className="w-full"
                        >
                            Create Course
                        </Button>
                    </div>

                    {/* Live Courses List */}
                    <div className="glass-panel p-6 rounded-3xl">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">
                            Live Courses
                        </h3>

                        <div className="space-y-3">
                            {visibleCourses.length === 0 ? (
                                <p className="text-slate-600 text-xs italic">No courses created yet.</p>
                            ) : (
                                visibleCourses.map(c => (
                                    <div
                                        key={c.id}
                                        className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex justify-between items-center group"
                                    >
                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-white font-medium text-sm truncate">{c.name}</p>
                                            <p className="text-[10px] text-indigo-400 font-mono">
                                                ID: {c.id} | by {c.instructorName || 'Unknown'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {/* Verified indicator */}
                                            {verifiedCourses.has(c.id) && (
                                                <span className="text-emerald-400 text-xs" title="Verified this session">
                                                    ✓
                                                </span>
                                            )}
                                            <button
                                                onClick={() => handlePinAction(c, 'view')}
                                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-indigo-400 rounded-lg transition-all"
                                                title="View Submissions (PIN required)"
                                                aria-label={`View submissions for ${c.name}`}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handlePinAction(c, 'delete')}
                                                className="p-1.5 bg-slate-800 hover:bg-red-950/40 text-slate-600 hover:text-red-400 rounded-lg transition-all"
                                                title="Delete Course (PIN required)"
                                                aria-label={`Delete ${c.name}`}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column - Submissions Feed */}
                <div className="lg:col-span-8">
                    <div className="glass-panel rounded-3xl overflow-hidden flex flex-col min-h-[500px]">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
                            <h3 className="text-lg font-semibold text-white">Student Submissions</h3>
                            <span className="text-xs text-slate-500">
                                {totalSubmissions} Total Interview{totalSubmissions !== 1 ? 's' : ''}
                            </span>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
                            {/* Check: Admin or course owner can see submissions */}
                            {!isAdmin && visibleCourses.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 py-20">
                                    <svg className="w-16 h-16 mb-4 text-red-500/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    <p className="text-slate-500 font-medium mb-2">No Courses Found</p>
                                    <p className="text-slate-600 text-sm text-center max-w-xs">
                                        Create a course to view student submissions.
                                    </p>
                                </div>
                            ) : totalSubmissions === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 py-20">
                                    <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p>Awaiting student submissions...</p>
                                </div>
                            ) : (
                                allSubmissions.map(sub => (
                                    <button
                                        key={sub.id}
                                        className="w-full bg-slate-900/50 border border-slate-800 p-4 rounded-2xl hover:border-indigo-500/30 transition-all cursor-pointer text-left"
                                        onClick={() => onSelectSubmission(sub)}
                                        aria-label={`View submission from ${sub.studentName}`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-white font-bold">{sub.studentName}</p>
                                                <p className="text-xs text-slate-400">
                                                    {sub.courseName} • {new Date(sub.timestamp).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-xl font-bold ${sub.score >= 80 ? 'text-emerald-400' :
                                                    sub.score >= 60 ? 'text-yellow-400' : 'text-red-400'
                                                    }`}>
                                                    {sub.score}%
                                                </div>
                                                <p className="text-[10px] text-slate-500 uppercase">Assessment Score</p>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Course Prompt Modal */}
            <Modal
                isOpen={!!viewingCourse}
                onClose={() => setViewingCourse(null)}
                title={viewingCourse?.name || ''}
                subtitle={`Instructor: ${viewingCourse?.instructorName || 'Unknown'} | ${viewingCourse?.submissions?.length || 0} Submissions`}
                size="md"
                footer={
                    <div className="flex justify-end">
                        <Button variant="ghost" onClick={() => setViewingCourse(null)}>
                            Close
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    {/* System Prompt - Editable */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase">System Prompt</h4>
                            {!isEditingPrompt ? (
                                <button
                                    onClick={() => {
                                        setIsEditingPrompt(true);
                                        setEditedPrompt(viewingCourse?.prompt || '');
                                    }}
                                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                                >
                                    ✏️ Edit
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            if (viewingCourse && onUpdateCourse && editedPrompt !== viewingCourse.prompt) {
                                                onUpdateCourse(viewingCourse.id, { prompt: editedPrompt });
                                                setViewingCourse({ ...viewingCourse, prompt: editedPrompt });
                                            }
                                            setIsEditingPrompt(false);
                                        }}
                                        className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                                    >
                                        ✓ Save
                                    </button>
                                    <button
                                        onClick={() => setIsEditingPrompt(false)}
                                        className="text-xs text-slate-500 hover:text-slate-400"
                                    >
                                        ✕ Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                        {isEditingPrompt ? (
                            <textarea
                                value={editedPrompt}
                                onChange={(e) => setEditedPrompt(e.target.value)}
                                className="w-full p-4 bg-slate-950/50 border border-indigo-500/50 rounded-xl text-slate-300 text-sm leading-relaxed font-mono min-h-[30vh] max-h-[50vh] resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                placeholder="Enter system prompt..."
                            />
                        ) : (
                            <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-mono max-h-[30vh] overflow-y-auto custom-scrollbar">
                                {viewingCourse?.prompt || <span className="text-slate-600 italic">No prompt set</span>}
                            </div>
                        )}
                    </div>

                    {/* Submissions List */}
                    <div>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Student Submissions</h4>
                        {viewingCourse?.submissions?.length === 0 ? (
                            <p className="text-slate-600 text-sm italic">No submissions yet.</p>
                        ) : (
                            <div className="space-y-2 max-h-[30vh] overflow-y-auto custom-scrollbar">
                                {viewingCourse?.submissions?.map(sub => (
                                    <div
                                        key={sub.id}
                                        className="w-full p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center hover:border-indigo-500/50 transition-all"
                                    >
                                        <button
                                            onClick={() => {
                                                onSelectSubmission(sub);
                                                setViewingCourse(null);
                                            }}
                                            className="flex-1 text-left"
                                        >
                                            <p className="text-white text-sm font-medium">{sub.studentName}</p>
                                            <p className="text-slate-500 text-xs">
                                                {new Date(sub.timestamp).toLocaleDateString()} • Score: {sub.score}/100
                                            </p>
                                        </button>
                                        <div className="flex items-center gap-2">
                                            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm(`Delete submission from ${sub.studentName}?`)) {
                                                        onDeleteSubmission(viewingCourse!.id, sub.id);
                                                    }
                                                }}
                                                className="p-1 hover:bg-red-500/20 rounded-lg transition-colors"
                                                title="Delete submission"
                                            >
                                                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* PIN Verification Modal */}
            <PinVerifyModal
                isOpen={!!pinModalCourse}
                onClose={() => {
                    setPinModalCourse(null);
                    setPinModalAction(null);
                }}
                onVerified={handlePinVerified}
                courseId={pinModalCourse?.id || ''}
                courseName={pinModalCourse?.name || ''}
                instructorPinHash={pinModalCourse?.instructorPinHash || ''}
                title={pinModalAction === 'delete' ? 'Confirm Deletion' : 'View Submissions'}
                description={
                    pinModalAction === 'delete'
                        ? 'Enter the instructor PIN to delete this course.'
                        : 'Enter your instructor PIN to view submissions.'
                }
            />
        </div>
    );
};

export default ManagerDashboardView;
