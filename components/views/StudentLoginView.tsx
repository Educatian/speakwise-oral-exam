import React, { useState } from 'react';
import { Course } from '../../types';
import { Button, Input, MicTest } from '../ui';
import { sanitizeStudentName } from '../../lib/security/sanitize';

interface StudentLoginViewProps {
    courses: Course[];
    selectedCourse?: Course | null;  // Pre-selected course from StudentCoursesView
    onLogin: (course: Course, studentName: string) => void;
    onViewHistory: () => void;
    onManagerAccess: () => void;
    onBack?: () => void;
}

/**
 * Student Login View
 * Entry point for students to join their interview course
 * Simplified form when course is pre-selected
 */
export const StudentLoginView: React.FC<StudentLoginViewProps> = ({
    courses,
    selectedCourse,
    onLogin,
    onViewHistory,
    onManagerAccess,
    onBack
}) => {
    const [studentName, setStudentName] = useState('');
    const [courseNumber, setCourseNumber] = useState('');
    const [passcode, setPasscode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Check if course is pre-selected (simplified mode)
    const isSimplifiedMode = !!selectedCourse;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validate name
        const trimmedName = sanitizeStudentName(studentName);
        if (!trimmedName) {
            setError('Please enter your name.');
            return;
        }

        if (!passcode) {
            setError('Please enter the entry code.');
            return;
        }

        setIsLoading(true);

        // Simplified mode: verify passcode against selected course
        if (isSimplifiedMode && selectedCourse) {
            if (selectedCourse.password === passcode) {
                onLogin(selectedCourse, trimmedName);
            } else {
                setError('Invalid entry code. Please try again.');
            }
        } else {
            // Full mode: find course by number and passcode
            if (!courseNumber || courseNumber.length !== 6) {
                setError('Course number must be 6 digits.');
                setIsLoading(false);
                return;
            }
            const course = courses.find(c => c.id === courseNumber && c.password === passcode);
            if (course) {
                onLogin(course, trimmedName);
            } else {
                setError('Invalid course number or passcode.');
            }
        }

        setIsLoading(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit(e);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in">
            <form
                onSubmit={handleSubmit}
                className="glass-panel p-8 rounded-3xl w-full max-w-md space-y-6"
            >
                <div className="text-center space-y-2">
                    {isSimplifiedMode ? (
                        <>
                            <h2 className="text-2xl font-bold text-white">Join Interview</h2>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                                <p className="text-emerald-400 text-sm font-medium">
                                    {selectedCourse?.name}
                                </p>
                                <p className="text-slate-500 text-xs mt-1">
                                    Instructor: {selectedCourse?.instructorName}
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <h2 className="text-2xl font-bold text-white">Classroom Entry</h2>
                            <p className="text-slate-400 text-sm">
                                Enter your course number and passcode to join
                            </p>
                        </>
                    )}
                </div>

                <div className="space-y-4">
                    <Input
                        placeholder="Your Full Name"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoComplete="name"
                        aria-label="Student name"
                        required
                    />

                    {/* Course number only in full mode */}
                    {!isSimplifiedMode && (
                        <Input
                            placeholder="Course Number (6 digits)"
                            value={courseNumber}
                            onChange={(e) => setCourseNumber(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            onKeyDown={handleKeyDown}
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            aria-label="Course number"
                            required
                        />
                    )}

                    <Input
                        type="password"
                        placeholder="Entry Code"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoComplete="current-password"
                        aria-label="Entry code"
                        required
                    />

                    {error && (
                        <div
                            className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center"
                            role="alert"
                        >
                            {error}
                        </div>
                    )}

                    {/* Microphone Test */}
                    <MicTest />

                    <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        loading={isLoading}
                        className="w-full"
                    >
                        {isSimplifiedMode ? 'Start Interview' : 'Enter Classroom'}
                    </Button>

                    {/* Back button when in simplified mode */}
                    {isSimplifiedMode && onBack && (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onBack}
                            className="w-full"
                            icon={
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            }
                        >
                            Choose Different Course
                        </Button>
                    )}

                    <div className="pt-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onViewHistory}
                            className="w-full"
                            icon={
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            }
                        >
                            View My History
                        </Button>
                    </div>
                </div>
            </form>

            {!isSimplifiedMode && courses.length === 0 && (
                <div className="mt-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl max-w-sm text-center">
                    <p className="text-indigo-300 text-xs leading-relaxed">
                        No courses found. Go to <strong>Manager Dashboard</strong> to create your first interview course.
                    </p>
                </div>
            )}

            {!isSimplifiedMode && (
                <button
                    onClick={onManagerAccess}
                    className="mt-8 text-slate-500 text-sm hover:text-indigo-400 transition-colors flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Course Manager? Access Dashboard
                </button>
            )}
        </div>
    );
};

export default StudentLoginView;
