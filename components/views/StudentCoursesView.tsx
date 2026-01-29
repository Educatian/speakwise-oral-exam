import React, { useState } from 'react';
import { Course, AppView } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface StudentCoursesViewProps {
    courses: Course[];
    onSelectCourse: (course: Course) => void;
    onViewHistory: () => void;
    onBack: () => void;
}

export const StudentCoursesView: React.FC<StudentCoursesViewProps> = ({
    courses,
    onSelectCourse,
    onViewHistory,
    onBack
}) => {
    const [searchQuery, setSearchQuery] = useState('');

    // Filter courses based on search
    const filteredCourses = courses.filter(course =>
        course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.instructorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.id.includes(searchQuery)
    );

    return (
        <div className="glass-container min-h-screen flex flex-col p-6">
            <div className="w-full max-w-4xl mx-auto animate-slide-in-up">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                        aria-label="Go back"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        <span>Back</span>
                    </button>

                    <Button variant="ghost" onClick={onViewHistory}>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        My History
                    </Button>
                </div>

                {/* Title & Search */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Available Courses</h1>
                    <p className="text-slate-400 mb-6">Select a course to begin your oral examination</p>

                    <div className="max-w-md mx-auto">
                        <Input
                            type="text"
                            placeholder="Search by course name, instructor, or ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="text-center"
                            aria-label="Search courses"
                        />
                    </div>
                </div>

                {/* Course Grid */}
                {filteredCourses.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                            <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-slate-500">
                            {searchQuery ? 'No courses match your search' : 'No courses available yet'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredCourses.map((course, index) => (
                            <button
                                key={course.id}
                                onClick={() => onSelectCourse(course)}
                                className="glass-panel p-6 rounded-2xl text-left hover:border-emerald-500/50 transition-all duration-300 group"
                                style={{ animationDelay: `${index * 0.05}s` }}
                                aria-label={`Join ${course.name}`}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                                            {course.name}
                                        </h3>
                                        <p className="text-sm text-slate-400">
                                            by {course.instructorName}
                                        </p>
                                    </div>
                                    <span className="ml-4 px-3 py-1 bg-slate-800 rounded-lg text-xs font-mono text-indigo-400">
                                        {course.id}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between mt-4">
                                    <span className="text-slate-500 text-sm">
                                        {course.submissions?.length || 0} submissions
                                    </span>
                                    <div className="flex items-center text-emerald-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
                                        <span>Join</span>
                                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
