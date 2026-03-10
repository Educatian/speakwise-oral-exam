import React from 'react';
import { AppView, Course, Submission, ADMIN_EMAIL } from '../types';

import { LandingView } from './views/LandingView';
import { InstructorLoginView } from './views/InstructorLoginView';
import { StudentCoursesView } from './views/StudentCoursesView';

import {
    UnifiedAuthView,
    SchoolSelectView,
    AdminPanelView,
    ManagerDashboardView,
    StudentLoginView,
    StudentHistoryView,
    InterviewSessionView,
    StudentResultsView
} from './views';

interface AppRouterProps {
    view: AppView;
    isLoading: boolean;
    isSupabaseConfigured: () => boolean;
    user: any;
    userRole: 'student' | 'instructor';
    studentName: string;
    savedSchool: string | null;
    courses: Course[];
    history: Submission[];
    activeCourse: Course | null;
    returnToLanding: () => void;
    navigateTo: (view: AppView) => void;
    handleAuthSuccess: (user: any, role: 'student' | 'instructor', name: string) => void;
    handleSchoolSelect: (schoolId: string, name: string) => void;
    handleStudentLogin: (course: Course, name: string) => void;
    handleInterviewComplete: (submission: Submission) => void;
    handleAddCourse: (courseData: Omit<Course, 'id' | 'submissions'>) => void;
    updateCourse: (course: Course) => void;
    deleteCourse: (id: string) => void;
    deleteSubmission: (courseId: string, submissionId: string) => void;
    setSelectedSubmission: (submission: Submission | null) => void;
    setActiveCourse: (course: Course | null) => void;
    lastSubmission: Submission | null;
}

export const AppRouter: React.FC<AppRouterProps> = ({
    view,
    isLoading,
    isSupabaseConfigured,
    user,
    userRole,
    studentName,
    savedSchool,
    courses,
    history,
    activeCourse,
    returnToLanding,
    navigateTo,
    handleAuthSuccess,
    handleSchoolSelect,
    handleStudentLogin,
    handleInterviewComplete,
    handleAddCourse,
    updateCourse,
    deleteCourse,
    deleteSubmission,
    setSelectedSubmission,
    setActiveCourse,
    lastSubmission
}) => {
    // Show loading state while Supabase data loads
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-slate-500 text-sm animate-pulse">
                    Loading from {isSupabaseConfigured() ? 'Supabase' : 'localStorage'}...
                </p>
            </div>
        );
    }

    const checkIsAdmin = (currentEmail: string | undefined | null) => currentEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    const storedUser = localStorage.getItem('speakwise_user');
    const storedEmail = storedUser ? JSON.parse(storedUser)?.email : null;
    const resolvedEmail = user?.email || storedEmail;
    const isAdmin = checkIsAdmin(resolvedEmail);

    switch (view) {
        case AppView.LANDING:
            return (
                <LandingView
                    onNavigate={navigateTo}
                />
            );

        // New unified auth flow
        case AppView.UNIFIED_AUTH:
            return (
                <UnifiedAuthView
                    onAuthSuccess={handleAuthSuccess}
                    onBack={returnToLanding}
                    defaultRole={userRole}
                />
            );

        case AppView.SCHOOL_SELECT:
            return (
                <SchoolSelectView
                    onSchoolSelect={handleSchoolSelect}
                    onBack={() => navigateTo(AppView.UNIFIED_AUTH)}
                    savedSchool={savedSchool}
                    userName={studentName || user?.displayName}
                />
            );

        case AppView.INSTRUCTOR_LOGIN:
            return (
                <InstructorLoginView
                    onLogin={() => navigateTo(AppView.INSTRUCTOR_DASHBOARD)}
                    onBack={returnToLanding}
                />
            );

        case AppView.ADMIN_PANEL:
            return (
                <AdminPanelView
                    currentUserEmail={user?.email}
                    onBack={() => navigateTo(AppView.INSTRUCTOR_DASHBOARD)}
                />
            );

        case AppView.INSTRUCTOR_DASHBOARD:
            return (
                <ManagerDashboardView
                    courses={courses}
                    onAddCourse={handleAddCourse}
                    onUpdateCourse={updateCourse}
                    onDeleteCourse={deleteCourse}
                    onDeleteSubmission={deleteSubmission}
                    onSelectSubmission={setSelectedSubmission}
                    onBack={returnToLanding}
                    currentUserEmail={resolvedEmail}
                    onAdminPanel={isAdmin ? () => navigateTo(AppView.ADMIN_PANEL) : undefined}
                />
            );

        case AppView.STUDENT_COURSES:
            return (
                <StudentCoursesView
                    courses={courses}
                    onSelectCourse={(course) => {
                        setActiveCourse(course);
                        navigateTo(AppView.STUDENT_LOGIN);
                    }}
                    onViewHistory={() => navigateTo(AppView.STUDENT_HISTORY)}
                    onBack={returnToLanding}
                />
            );

        case AppView.STUDENT_LOGIN:
            return (
                <StudentLoginView
                    courses={courses}
                    selectedCourse={activeCourse}
                    onLogin={handleStudentLogin}
                    onViewHistory={() => navigateTo(AppView.STUDENT_HISTORY)}
                    onManagerAccess={() => navigateTo(AppView.MANAGER_DASHBOARD)}
                    onBack={() => {
                        setActiveCourse(null);
                        navigateTo(AppView.STUDENT_COURSES);
                    }}
                />
            );

        case AppView.STUDENT_HISTORY:
            return (
                <StudentHistoryView
                    submissions={history}
                    onSelectSubmission={setSelectedSubmission}
                    onBack={returnToLanding}
                />
            );

        case AppView.STUDENT_INTERVIEW:
            if (!activeCourse) return null;
            return (
                <InterviewSessionView
                    course={activeCourse}
                    studentName={studentName}
                    onComplete={handleInterviewComplete}
                    onBack={returnToLanding}
                />
            );

        case AppView.STUDENT_RESULTS:
            if (!lastSubmission) return null;
            return (
                <StudentResultsView
                    submission={lastSubmission}
                    onBack={returnToLanding}
                />
            );

        case AppView.MANAGER_DASHBOARD:
            return (
                <ManagerDashboardView
                    courses={courses}
                    onAddCourse={handleAddCourse}
                    onUpdateCourse={updateCourse}
                    onDeleteCourse={deleteCourse}
                    onDeleteSubmission={deleteSubmission}
                    onSelectSubmission={setSelectedSubmission}
                    onBack={returnToLanding}
                    currentUserEmail={resolvedEmail}
                    onAdminPanel={isAdmin ? () => navigateTo(AppView.ADMIN_PANEL) : undefined}
                />
            );

        default:
            return null;
    }
};
