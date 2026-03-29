import React from 'react';
import { AppView, Course, Institution, Submission, ADMIN_EMAIL } from '../types';

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
    savedSchool: { schoolId: string; schoolName: string } | null;
    institutions: Institution[];
    courses: Course[];
    history: Submission[];
    activeCourse: Course | null;
    returnToLanding: () => void;
    navigateTo: (view: AppView) => void;
    handleAuthSuccess: (user: any) => void;
    handleSchoolSelect: (schoolId: string, name: string) => void;
    signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    signUp: (
        email: string,
        password: string,
        displayName: string,
        role: 'student' | 'instructor',
        schoolId?: string,
        schoolName?: string
    ) => Promise<{ success: boolean; error?: string }>;
    resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
    validateInstitutionAccessCode: (institutionId: string, accessCode: string) => Promise<Institution | null>;
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
    institutions,
    courses,
    history,
    activeCourse,
    returnToLanding,
    navigateTo,
    handleAuthSuccess,
    handleSchoolSelect,
    signIn,
    signUp,
    resetPassword,
    validateInstitutionAccessCode,
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
    const activeInstitutionId = savedSchool?.schoolId || user?.schoolId || null;
    const studentVisibleCourses = activeInstitutionId && activeInstitutionId !== 'guest'
        ? courses.filter(course =>
            !course.institutionId ||
            course.institutionId === activeInstitutionId
        )
        : courses;

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
                    institutions={institutions}
                    signIn={signIn}
                    signUp={signUp}
                    resetPassword={resetPassword}
                />
            );

        case AppView.SCHOOL_SELECT:
            return (
                <SchoolSelectView
                    onSchoolSelect={handleSchoolSelect}
                    onBack={() => navigateTo(AppView.UNIFIED_AUTH)}
                    savedSchool={savedSchool}
                    userName={studentName || user?.displayName}
                    institutions={institutions}
                    validateAccessCode={validateInstitutionAccessCode}
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
                    currentInstitution={savedSchool || (user?.schoolId ? { schoolId: user.schoolId, schoolName: user.schoolName } : null)}
                    availableInstitutions={institutions}
                    onAdminPanel={isAdmin ? () => navigateTo(AppView.ADMIN_PANEL) : undefined}
                />
            );

        case AppView.STUDENT_COURSES:
            return (
                <StudentCoursesView
                    courses={studentVisibleCourses}
                    onSelectCourse={(course) => {
                        setActiveCourse(course);
                        navigateTo(AppView.STUDENT_LOGIN);
                    }}
                    onViewHistory={() => navigateTo(AppView.STUDENT_HISTORY)}
                    onBack={returnToLanding}
                    savedSchool={savedSchool}
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
            // Find peer submissions from the same course
            const matchingCourse = courses.find(c =>
                c.name === lastSubmission.courseName ||
                c.submissions.some(s => s.id === lastSubmission.id)
            );
            const peerSubs = matchingCourse
                ? matchingCourse.submissions.filter(s => s.id !== lastSubmission.id)
                : [];
            return (
                <StudentResultsView
                    submission={lastSubmission}
                    peerSubmissions={peerSubs}
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
                    currentInstitution={savedSchool || (user?.schoolId ? { schoolId: user.schoolId, schoolName: user.schoolName } : null)}
                    availableInstitutions={institutions}
                    onAdminPanel={isAdmin ? () => navigateTo(AppView.ADMIN_PANEL) : undefined}
                />
            );

        default:
            return null;
    }
};
