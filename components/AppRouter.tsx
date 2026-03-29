import React, { Suspense, lazy } from 'react';
import { AppView, Course, Institution, Submission, ADMIN_EMAIL } from '../types';

const LandingView = lazy(() =>
    import('./views/LandingView').then((module) => ({ default: module.LandingView }))
);
const InstructorLoginView = lazy(() =>
    import('./views/InstructorLoginView').then((module) => ({ default: module.InstructorLoginView }))
);
const StudentCoursesView = lazy(() =>
    import('./views/StudentCoursesView').then((module) => ({ default: module.StudentCoursesView }))
);
const UnifiedAuthView = lazy(() =>
    import('./views/UnifiedAuthView').then((module) => ({ default: module.UnifiedAuthView }))
);
const SchoolSelectView = lazy(() =>
    import('./views/SchoolSelectView').then((module) => ({ default: module.SchoolSelectView }))
);
const AdminPanelView = lazy(() =>
    import('./views/AdminPanelView').then((module) => ({ default: module.AdminPanelView }))
);
const ManagerDashboardView = lazy(() =>
    import('./views/ManagerDashboardView').then((module) => ({ default: module.ManagerDashboardView }))
);
const StudentLoginView = lazy(() =>
    import('./views/StudentLoginView').then((module) => ({ default: module.StudentLoginView }))
);
const StudentHistoryView = lazy(() =>
    import('./views/StudentHistoryView').then((module) => ({ default: module.StudentHistoryView }))
);
const InterviewSessionView = lazy(() =>
    import('./views/InterviewSessionView').then((module) => ({ default: module.InterviewSessionView }))
);
const StudentResultsView = lazy(() =>
    import('./views/StudentResultsView').then((module) => ({ default: module.StudentResultsView }))
);

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
    navigateTo: (view: AppView, role?: 'student' | 'instructor') => void;
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
    updateCourse: (courseId: string, updates: Partial<Course>) => void;
    deleteCourse: (id: string) => void;
    deleteSubmission: (courseId: string, submissionId: string) => void;
    setSelectedSubmission: (submission: Submission | null) => void;
    setActiveCourse: (course: Course | null) => void;
    lastSubmission: Submission | null;
}

const RouteFallback: React.FC = () => (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Loading workspace...</p>
    </div>
);

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

    const checkIsAdmin = (currentEmail: string | undefined | null) =>
        currentEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    const storedUser = localStorage.getItem('speakwise_user');
    const storedEmail = storedUser ? JSON.parse(storedUser)?.email : null;
    const resolvedEmail = user?.email || storedEmail;
    const isAdmin = checkIsAdmin(resolvedEmail);
    const activeInstitutionId = savedSchool?.schoolId || user?.schoolId || null;
    const studentVisibleCourses =
        activeInstitutionId && activeInstitutionId !== 'guest'
            ? courses.filter((course) => !course.institutionId || course.institutionId === activeInstitutionId)
            : courses;

    let viewNode: React.ReactNode = null;

    switch (view) {
        case AppView.LANDING:
            viewNode = <LandingView onNavigate={navigateTo} />;
            break;

        case AppView.UNIFIED_AUTH:
            viewNode = (
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
            break;

        case AppView.SCHOOL_SELECT:
            viewNode = (
                <SchoolSelectView
                    onSchoolSelect={handleSchoolSelect}
                    onBack={() => navigateTo(AppView.UNIFIED_AUTH)}
                    savedSchool={savedSchool}
                    userName={studentName || user?.displayName}
                    institutions={institutions}
                    validateAccessCode={validateInstitutionAccessCode}
                />
            );
            break;

        case AppView.INSTRUCTOR_LOGIN:
            viewNode = (
                <InstructorLoginView
                    onLogin={() => navigateTo(AppView.INSTRUCTOR_DASHBOARD)}
                    onBack={returnToLanding}
                />
            );
            break;

        case AppView.ADMIN_PANEL:
            viewNode = (
                <AdminPanelView
                    currentUserEmail={user?.email}
                    onBack={() => navigateTo(AppView.INSTRUCTOR_DASHBOARD)}
                />
            );
            break;

        case AppView.INSTRUCTOR_DASHBOARD:
        case AppView.MANAGER_DASHBOARD:
            viewNode = (
                <ManagerDashboardView
                    courses={courses}
                    onAddCourse={handleAddCourse}
                    onUpdateCourse={updateCourse}
                    onDeleteCourse={deleteCourse}
                    onDeleteSubmission={deleteSubmission}
                    onSelectSubmission={setSelectedSubmission}
                    onBack={returnToLanding}
                    currentUserEmail={resolvedEmail}
                    currentInstitution={
                        savedSchool || (user?.schoolId ? { schoolId: user.schoolId, schoolName: user.schoolName } : null)
                    }
                    availableInstitutions={institutions}
                    onAdminPanel={isAdmin ? () => navigateTo(AppView.ADMIN_PANEL) : undefined}
                />
            );
            break;

        case AppView.STUDENT_COURSES:
            viewNode = (
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
            break;

        case AppView.STUDENT_LOGIN:
            viewNode = (
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
            break;

        case AppView.STUDENT_HISTORY:
            viewNode = (
                <StudentHistoryView
                    submissions={history}
                    onSelectSubmission={setSelectedSubmission}
                    onBack={returnToLanding}
                />
            );
            break;

        case AppView.STUDENT_INTERVIEW:
            viewNode = activeCourse ? (
                <InterviewSessionView
                    course={activeCourse}
                    studentName={studentName}
                    onComplete={handleInterviewComplete}
                    onBack={returnToLanding}
                />
            ) : null;
            break;

        case AppView.STUDENT_RESULTS: {
            if (!lastSubmission) {
                viewNode = null;
                break;
            }

            const matchingCourse = courses.find(
                (course) =>
                    course.name === lastSubmission.courseName ||
                    course.submissions.some((submission) => submission.id === lastSubmission.id)
            );
            const peerSubs = matchingCourse
                ? matchingCourse.submissions.filter((submission) => submission.id !== lastSubmission.id)
                : [];

            viewNode = (
                <StudentResultsView
                    submission={lastSubmission}
                    peerSubmissions={peerSubs}
                    onBack={returnToLanding}
                />
            );
            break;
        }

        default:
            viewNode = null;
    }

    return <Suspense fallback={<RouteFallback />}>{viewNode}</Suspense>;
};
