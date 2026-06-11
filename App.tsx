import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { AppView, Course, InstructorReview, Submission } from './types';
import { useCourseStorage, useStudentHistory, useAuth, useInstitutions } from './hooks';
import { isSupabaseConfigured } from './lib/supabase';
import { AppRouter } from './components/AppRouter';
import { ToastProvider, useToastContext } from './contexts/ToastContext';
import { findCourseForSubmission, getPeerSubmissions } from './lib/utils/peerSubmissions';

/**
 * Surfaces course-storage failures (e.g. a Supabase write rejected) as a calm
 * toast instead of letting them die in the console. Lives INSIDE ToastProvider
 * so it can use the context; clears the error after notifying so an identical
 * follow-up failure re-notifies.
 */
const StorageErrorNotifier: React.FC<{ error: string | null; onClear: () => void }> = ({ error, onClear }) => {
  const toast = useToastContext();
  useEffect(() => {
    if (error) {
      toast.error(error);
      onClear();
    }
  }, [error, onClear, toast]);
  return null;
};

const SubmissionDetailModal = lazy(() =>
  import('./components/modals').then((module) => ({ default: module.SubmissionDetailModal }))
);

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
  const [lastSubmission, setLastSubmission] = useState<Submission | null>(null);
  const [userRole, setUserRole] = useState<'student' | 'instructor'>('student');

  // Auth hook
  const { user, isAuthenticated, savedSchool, setSchool, signOut, signIn, signUp, resetPassword } = useAuth();
  const { institutions, loading: institutionsLoading, validateAccessCode } = useInstitutions();

  // Custom hooks for data management (with Supabase)
  const {
    courses,
    loading: coursesLoading,
    error: storageError,
    clearError: clearStorageError,
    addCourse,
    updateCourse,
    deleteCourse,
    addSubmission,
    deleteSubmission,
    updateSubmissionReview
  } = useCourseStorage();
  const { history, loading: historyLoading, addToHistory } = useStudentHistory();

  const isLoading = coursesLoading || historyLoading || institutionsLoading;
  const activeInstitution = institutions.find((institution) =>
    institution.id === (savedSchool?.schoolId || user?.schoolId)
  ) || (savedSchool ? {
    id: savedSchool.schoolId,
    name: savedSchool.schoolName
  } : null);

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleStudentLogin = (course: Course, name: string) => {
    setActiveCourse(course);
    setStudentName(name);
    setView(AppView.STUDENT_INTERVIEW);
  };

  const handleInterviewComplete = async (submission: Submission) => {
    if (import.meta.env.DEV) {
      console.log('[App] handleInterviewComplete called:', {
        hasTranscript: submission.transcript?.length,
        studentName: submission.studentName,
        courseName: submission.courseName,
        score: submission.score,
        hasFeedback: !!submission.feedback,
        hasArgumentGraph: !!submission.argumentGraph
      });
    }

    // Save to course submissions. A failed server write surfaces via the
    // storage-error toast (useCourseStorage sets `error`); the student still
    // proceeds to their results with the in-session copy.
    if (activeCourse) {
      try {
        await addSubmission(activeCourse.id, submission);
        if (import.meta.env.DEV) {
          console.log('[App] Submission saved to course:', activeCourse.id);
        }
      } catch (e) {
        console.error('[App] Failed to save submission to course:', e);
      }
    } else {
      console.warn('[App] No activeCourse — submission not saved to course!');
    }

    // Save to student history
    try {
      await addToHistory(submission);
      if (import.meta.env.DEV) {
        console.log('[App] Submission saved to student history');
      }
    } catch (e) {
      console.error('[App] Failed to save to history:', e);
    }

    // Store and navigate to results
    setLastSubmission(submission);
    navigateTo(AppView.STUDENT_RESULTS);
  };

  const handleAddCourse = (courseData: Omit<Course, 'id' | 'submissions'>) => {
    addCourse(courseData);
  };

  const handleUpdateSubmissionReview = useCallback(async (
    courseId: string,
    submissionId: string,
    review: InstructorReview
  ) => {
    await updateSubmissionReview(courseId, submissionId, review);

    setSelectedSubmission((current) =>
      current?.id === submissionId
        ? { ...current, instructorReview: review }
        : current
    );

    setLastSubmission((current) =>
      current?.id === submissionId
        ? { ...current, instructorReview: review }
        : current
    );
  }, [updateSubmissionReview]);

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
    const storedUserRaw = localStorage.getItem('speakwise_user');
    const persistedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
    const resolvedUser = persistedUser?.email ? persistedUser : authUser;

    setStudentName(resolvedUser.displayName);
    setUserRole(resolvedUser.role);

    // Save user to localStorage for session persistence (critical for course ownership!)
    localStorage.setItem('speakwise_user', JSON.stringify({
      id: resolvedUser.id,
      email: resolvedUser.email.toLowerCase(),
      displayName: resolvedUser.displayName,
      role: resolvedUser.role,
      // Raw user_profiles.role (e.g. 'admin'/'moderator') — the DB-backed
      // authority that admin gating reads (see lib/utils/adminAccess.ts).
      profileRole: resolvedUser.profileRole,
      schoolId: resolvedUser.schoolId,
      schoolName: resolvedUser.schoolName
    }));

    // Instructor also gets session marker
    if (resolvedUser.role === 'instructor') {
      sessionStorage.setItem('speakwise_instructor', 'true');
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

  // Auto-redirect if already logged in
  useEffect(() => {
    // Skip if still loading or already navigated
    if (view !== AppView.LANDING) return;

    // Check for existing session in localStorage
    const storedUser = localStorage.getItem('speakwise_user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        if (userData.email) {
          setStudentName(userData.displayName || userData.email.split('@')[0]);
          setUserRole(userData.role || 'student');

          // Auto-navigate based on role
          if (userData.role === 'instructor') {
            navigateTo(AppView.INSTRUCTOR_DASHBOARD);
          } else {
            navigateTo(AppView.STUDENT_COURSES);
          }
        }
      } catch (e) {
        // Invalid stored data, clear it
        localStorage.removeItem('speakwise_user');
      }
    }
  }, []); // Run once on mount

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

    // Set initial state only if not auto-redirected
    if (view === AppView.LANDING) {
      window.history.replaceState({ view: AppView.LANDING }, '', '#landing');
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [view]);

  // ─────────────────────────────────────────────────────────────────────────
  // View Rendering
  // ─────────────────────────────────────────────────────────────────────────

  const renderCurrentView = () => {
    return (
      <AppRouter
        view={view}
        isLoading={isLoading}
        isSupabaseConfigured={isSupabaseConfigured}
        user={user}
        userRole={userRole}
        studentName={studentName}
        savedSchool={savedSchool}
        institutions={institutions}
        courses={courses}
        history={history}
        activeCourse={activeCourse}
        returnToLanding={returnToLanding}
        navigateTo={navigateTo}
        handleAuthSuccess={handleAuthSuccess}
        handleSchoolSelect={handleSchoolSelect}
        signIn={signIn}
        signUp={signUp}
        resetPassword={resetPassword}
        validateInstitutionAccessCode={validateAccessCode}
        handleStudentLogin={handleStudentLogin}
        handleInterviewComplete={handleInterviewComplete}
        handleAddCourse={handleAddCourse}
        updateCourse={updateCourse}
        deleteCourse={deleteCourse}
        deleteSubmission={deleteSubmission}
        setSelectedSubmission={setSelectedSubmission}
        setActiveCourse={setActiveCourse}
        lastSubmission={lastSubmission}
      />
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <ToastProvider>
    <StorageErrorNotifier error={storageError} onClear={clearStorageError} />
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 lg:p-12 flex flex-col items-center">
      {/* Skip Link for Accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Platform Header */}
      <header className="w-full max-w-6xl flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-8 md:mb-12">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          {/* Logo */}
          <div
            className="w-9 h-9 md:w-10 md:h-10 rounded-xl overflow-hidden shadow-lg shadow-emerald-500/20 cursor-pointer ring-1 ring-white/10"
            onClick={returnToLanding}
            aria-label="Return to home"
          >
            <img src="/logo.png" alt="SpeakWise" className="w-full h-full object-cover" />
          </div>

          {/* Brand Name */}
          <h1 className="text-2xl md:text-3xl font-black tracking-tight cursor-pointer truncate" onClick={returnToLanding}>
            <span className="text-gradient-white">SpeakWise</span>
            <span className="text-emerald-500">.</span>
          </h1>

          {activeInstitution && (
            <div className="hidden lg:flex flex-col pl-4 border-l border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-600">
                Institution
              </span>
              <span className="text-sm text-slate-300 font-medium">
                {activeInstitution.name}
              </span>
            </div>
          )}
        </div>

        {/* Status Badges & User Info */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-end">
          {activeInstitution && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/70 rounded-xl border border-slate-700 max-w-full">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: activeInstitution.primaryColor || '#10b981' }}
              />
              <span className="text-xs text-slate-400 truncate max-w-[180px] sm:max-w-none">
                {activeInstitution.name}
              </span>
            </div>
          )}

          {/* User Badge */}
          {isAuthenticated && user && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700 max-w-full">
              <span className="text-slate-400 text-xs truncate max-w-[120px] sm:max-w-[180px]">{user.displayName}</span>
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
      {selectedSubmission && (() => {
        const peerCourse = findCourseForSubmission(courses, selectedSubmission);
        const peers = getPeerSubmissions(peerCourse, selectedSubmission.id);
        const matchedSubmission = peerCourse?.submissions.find((submission) => submission.id === selectedSubmission.id) || selectedSubmission;
        const canEditReview = view === AppView.INSTRUCTOR_DASHBOARD || view === AppView.MANAGER_DASHBOARD || userRole === 'instructor';
        const reviewerName = user?.displayName || studentName || 'Instructor';
        const reviewerEmail = user?.email || undefined;
        return (
          <Suspense fallback={null}>
            <SubmissionDetailModal
              submission={matchedSubmission}
              peerSubmissions={peers}
              canEditReview={canEditReview}
              currentReviewerName={reviewerName}
              currentReviewerEmail={reviewerEmail}
              onUpdateReview={
                peerCourse
                  ? (submissionId, review) => handleUpdateSubmissionReview(peerCourse.id, submissionId, review)
                  : undefined
              }
              onClose={() => setSelectedSubmission(null)}
            />
          </Suspense>
        );
      })()}

      {/* Footer */}
      <footer className="mt-auto pt-12 pb-6 text-center">
        <p className="text-slate-800 text-[10px] font-bold tracking-[0.3em] uppercase">
          Gemini 2.5 Native Voice Pipeline • SpeakWise Educational Technology
        </p>
      </footer>
    </div>
    </ToastProvider>
  );
};

export default App;
