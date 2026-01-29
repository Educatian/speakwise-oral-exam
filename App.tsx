import React, { useState, useEffect, useCallback } from 'react';
import { AppView, Course, Submission, ADMIN_EMAIL } from './types';
import { useCourseStorage, useStudentHistory, useAuth } from './hooks';
import { isSupabaseConfigured } from './lib/supabase';

// Views
import {
  StudentLoginView,
  StudentHistoryView,
  InterviewSessionView,
  ManagerDashboardView,
  UnifiedAuthView,
  SchoolSelectView,
  AdminPanelView
} from './components/views';
import { LandingView } from './components/views/LandingView';
import { InstructorLoginView } from './components/views/InstructorLoginView';
import { StudentCoursesView } from './components/views/StudentCoursesView';

// Modals
import { SubmissionDetailModal } from './components/modals';

// Accessibility
import { SkipLink } from './components/ui';

/**
 * SpeakWise - AI-Powered Oral Examination Platform
 * 
 * A professional platform for conducting AI-driven oral exams with:
 * - Real-time voice interaction using Gemini 2.5 Native Audio
 * - Automatic transcription and feedback generation
 * - Course management for instructors (Supabase PostgreSQL)
 * - Student history and performance tracking
 */
const App: React.FC = () => {
  // Navigation state - Start from Landing page
  const [view, setView] = useState<AppView>(AppView.LANDING);

  // Session state
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [studentName, setStudentName] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [userRole, setUserRole] = useState<'student' | 'instructor'>('student');

  // Auth hook
  const { user, isAuthenticated, savedSchool, setSchool, signOut } = useAuth();

  // Custom hooks for data management (with Supabase)
  const { courses, loading: coursesLoading, addCourse, updateCourse, deleteCourse, addSubmission, deleteSubmission } = useCourseStorage();
  const { history, loading: historyLoading, addToHistory } = useStudentHistory();

  const isLoading = coursesLoading || historyLoading;

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleStudentLogin = (course: Course, name: string) => {
    setActiveCourse(course);
    setStudentName(name);
    setView(AppView.STUDENT_INTERVIEW);
  };

  const handleInterviewComplete = (submission: Submission) => {
    // Save to course submissions
    if (activeCourse) {
      addSubmission(activeCourse.id, submission);
    }
    // Save to student history
    addToHistory(submission);
  };

  const handleAddCourse = (courseData: Omit<Course, 'id' | 'submissions'>) => {
    addCourse(courseData);
  };

  const returnToLanding = useCallback(() => {
    setView(AppView.LANDING);
    setActiveCourse(null);
    setStudentName('');
  }, []);

  // Navigate with history (supports optional role for auth flow)
  const navigateTo = useCallback((newView: AppView, role?: 'student' | 'instructor') => {
    window.history.pushState({ view: newView }, '', `#${newView.toLowerCase()}`);
    setView(newView);
    // Set user role if provided (for auth flow)
    if (role) {
      setUserRole(role);
    }
  }, []);

  // Handle auth success
  const handleAuthSuccess = useCallback((authUser: { id: string; email: string; displayName: string; role: 'student' | 'instructor' }) => {
    setStudentName(authUser.displayName);
    setUserRole(authUser.role);

    // Instructor goes directly to dashboard
    if (authUser.role === 'instructor') {
      navigateTo(AppView.INSTRUCTOR_DASHBOARD);
    } else {
      // Student goes to school selection (or courses if school saved)
      if (savedSchool) {
        navigateTo(AppView.STUDENT_COURSES);
      } else {
        navigateTo(AppView.SCHOOL_SELECT);
      }
    }
  }, [navigateTo, savedSchool]);

  // Handle school selection
  const handleSchoolSelect = useCallback((schoolId: string, schoolName: string) => {
    setSchool(schoolId, schoolName);
    navigateTo(AppView.STUDENT_COURSES);
  }, [setSchool, navigateTo]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.view) {
        setView(event.state.view);
      } else {
        setView(AppView.LANDING);
        setActiveCourse(null);
      }
    };

    window.addEventListener('popstate', handlePopState);

    // Set initial state
    window.history.replaceState({ view: AppView.LANDING }, '', '#landing');

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // View Rendering
  // ─────────────────────────────────────────────────────────────────────────

  const renderCurrentView = () => {
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
        // Check if user is admin - supports both Supabase auth and localStorage
        const storedUser = localStorage.getItem('speakwise_user');
        const storedEmail = storedUser ? JSON.parse(storedUser)?.email : null;
        const currentEmail = user?.email || storedEmail;
        const isAdmin = currentEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        return (
          <ManagerDashboardView
            courses={courses}
            onAddCourse={handleAddCourse}
            onUpdateCourse={updateCourse}
            onDeleteCourse={deleteCourse}
            onDeleteSubmission={deleteSubmission}
            onSelectSubmission={setSelectedSubmission}
            onBack={returnToLanding}
            currentUserEmail={currentEmail}
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

      case AppView.MANAGER_DASHBOARD:
        const storedUserMgr = localStorage.getItem('speakwise_user');
        const storedEmailMgr = storedUserMgr ? JSON.parse(storedUserMgr)?.email : null;
        const currentEmailMgr = user?.email || storedEmailMgr;
        const isAdminMgr = currentEmailMgr?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        return (
          <ManagerDashboardView
            courses={courses}
            onAddCourse={handleAddCourse}
            onUpdateCourse={updateCourse}
            onDeleteCourse={deleteCourse}
            onDeleteSubmission={deleteSubmission}
            onSelectSubmission={setSelectedSubmission}
            onBack={returnToLanding}
            currentUserEmail={currentEmailMgr}
            onAdminPanel={isAdminMgr ? () => navigateTo(AppView.ADMIN_PANEL) : undefined}
          />
        );

      default:
        return null;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 lg:p-12 flex flex-col items-center">
      {/* Skip Link for Accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Platform Header */}
      <header className="w-full max-w-6xl flex justify-between items-center mb-8 md:mb-12">
        <div className="flex items-center gap-3 md:gap-4">
          {/* Logo */}
          <div
            className="w-9 h-9 md:w-10 md:h-10 bg-gradient-to-br from-emerald-400 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 cursor-pointer"
            onClick={returnToLanding}
            aria-label="Return to home"
          >
            <span className="text-white font-black text-lg md:text-xl italic">W</span>
          </div>

          {/* Brand Name */}
          <h1 className="text-2xl md:text-3xl font-black tracking-tight cursor-pointer" onClick={returnToLanding}>
            <span className="text-gradient-white">SpeakWise</span>
            <span className="text-emerald-500">.</span>
          </h1>
        </div>

        {/* Status Badges & User Info */}
        <div className="flex items-center gap-3">
          {/* User Badge */}
          {isAuthenticated && user && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700">
              <span className="text-slate-400 text-xs">{user.displayName}</span>
              <button
                onClick={() => {
                  signOut();
                  returnToLanding();
                }}
                className="text-slate-500 hover:text-red-400 text-xs transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}

          {/* Context Badge */}
          {view === AppView.MANAGER_DASHBOARD && (
            <div className="badge badge-accent">
              Manager Console
            </div>
          )}
          {view === AppView.INSTRUCTOR_DASHBOARD && (
            <div className="badge badge-accent">
              Instructor Dashboard
            </div>
          )}
          {view === AppView.STUDENT_INTERVIEW && (
            <div className="badge badge-live">
              <span className="live-indicator mr-2" />
              Live Session
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="w-full flex-1 flex flex-col items-center">
        {renderCurrentView()}
      </main>

      {/* Submission Detail Modal */}
      <SubmissionDetailModal
        submission={selectedSubmission}
        onClose={() => setSelectedSubmission(null)}
      />

      {/* Footer */}
      <footer className="mt-auto pt-12 pb-6 text-center">
        <p className="text-slate-800 text-[10px] font-bold tracking-[0.3em] uppercase">
          Gemini 2.5 Native Voice Pipeline • SpeakWise Educational Technology
        </p>
      </footer>
    </div>
  );
};

export default App;
