import React, { Suspense, lazy } from 'react';
import { AppView, Course, Submission } from '../types';
import { useAuthContext, AuthSuccessUser } from '../contexts/AuthContext';
import { useCourseContext } from '../contexts/CourseContext';
import { findCourseForSubmission, getPeerSubmissions } from '../lib/utils/peerSubmissions';
import { isAdminIdentity } from '../lib/utils/adminAccess';
import { LogoLoader } from './ui/LogoLoader';

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

// Re-exported for backward compatibility: the type moved next to the auth
// state it belongs to (contexts/AuthContext.tsx).
export type { AuthSuccessUser } from '../contexts/AuthContext';

/**
 * Props that the app shell genuinely computes (routing, session naming, and
 * navigation-coupled handlers). Everything that was pure plumbing — auth
 * state, courses, institutions, selection state — now comes from the
 * Auth/Course/Institution contexts instead of being drilled through here.
 */
interface AppRouterProps {
    view: AppView;
    isLoading: boolean;
    studentName: string;
    history: Submission[];
    returnToLanding: () => void;
    navigateTo: (view: AppView, role?: 'student' | 'instructor') => void;
    handleAuthSuccess: (user: AuthSuccessUser) => void;
    handleStudentLogin: (course: Course, name: string) => void;
    handleInterviewComplete: (submission: Submission) => void;
}

const RouteFallback: React.FC = () => (
    <LogoLoader className="min-h-[40vh]" label="Loading workspace…" />
);

export const AppRouter: React.FC<AppRouterProps> = ({
    view,
    isLoading,
    studentName,
    history,
    returnToLanding,
    navigateTo,
    handleAuthSuccess,
    handleStudentLogin,
    handleInterviewComplete
}) => {
    const { user, role, savedSchool, setSchool } = useAuthContext();
    const {
        courses,
        activeCourse,
        setActiveCourse,
        setSelectedSubmission,
        lastSubmission
    } = useCourseContext();

    if (isLoading) {
        return (
            <LogoLoader className="min-h-[50vh]" label="Loading your workspace…" />
        );
    }

    const storedUser = localStorage.getItem('speakwise_user');
    const storedEmail = storedUser ? JSON.parse(storedUser)?.email : null;
    const resolvedEmail = user?.email || storedEmail;
    // DB-backed user_profiles.role decides when Supabase is configured;
    // the hardcoded email only bootstraps local/demo mode.
    const isAdmin = isAdminIdentity({ email: resolvedEmail, profileRole: user?.profileRole });
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
                    defaultRole={role}
                />
            );
            break;

        case AppView.SCHOOL_SELECT:
            viewNode = (
                <SchoolSelectView
                    onSchoolSelect={(schoolId, schoolName) => {
                        setSchool(schoolId, schoolName);
                        navigateTo(AppView.STUDENT_COURSES);
                    }}
                    onBack={() => navigateTo(AppView.UNIFIED_AUTH)}
                    userName={studentName || user?.displayName}
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
                    onBack={returnToLanding}
                    currentUserEmail={resolvedEmail}
                    currentInstitution={
                        savedSchool || (user?.schoolId ? { schoolId: user.schoolId, schoolName: user.schoolName } : null)
                    }
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
                />
            );
            break;

        case AppView.STUDENT_LOGIN:
            viewNode = (
                <StudentLoginView
                    defaultName={studentName || user?.displayName}
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

            const matchingCourse = findCourseForSubmission(courses, lastSubmission);
            const peerSubs = getPeerSubmissions(matchingCourse, lastSubmission.id);

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
