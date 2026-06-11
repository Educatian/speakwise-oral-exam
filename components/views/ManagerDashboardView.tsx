import React from 'react';
import { Button, PinVerifyModal } from '../ui';
import { useManagerDashboard } from '../../hooks/useManagerDashboard';
import { useCourseContext } from '../../contexts/CourseContext';
import { useInstitutionContext } from '../../contexts/InstitutionContext';
import {
    AnalyticsSection,
    CourseCreateForm,
    CourseList,
    CoursePromptModal,
    DashboardStats,
    GuidancePanel,
    SubmissionsPanel
} from './manager';

interface ManagerDashboardViewProps {
    onBack: () => void;
    currentUserEmail?: string; // For access control
    currentInstitution?: { schoolId: string; schoolName: string } | null;
    onAdminPanel?: () => void; // Admin-only panel access
}

/**
 * Manager Dashboard View
 * Course management, creation, and submission review interface
 *
 * Thin composition shell — state/orchestration live in useManagerDashboard,
 * and each dashboard region is a focused sub-component under ./manager/.
 * Course data/CRUD and the institution directory come from the app-root
 * contexts (previously drilled App → AppRouter → here as props).
 */
export const ManagerDashboardView: React.FC<ManagerDashboardViewProps> = ({
    onBack,
    currentUserEmail,
    currentInstitution,
    onAdminPanel
}) => {
    const {
        courses,
        addCourse: onAddCourse,
        updateCourse: onUpdateCourse,
        deleteCourse: onDeleteCourse,
        deleteSubmission: onDeleteSubmission,
        setSelectedSubmission: onSelectSubmission
    } = useCourseContext();
    const { institutions: availableInstitutions } = useInstitutionContext();
    const {
        isAdmin,
        visibleCourses,
        allSubmissions,
        totalSubmissions,
        currentInstitutionName,
        averageScore,
        coursesWithoutSubmissions,
        flaggedForReview,
        instructorPriorities,
        leftPanelMode,
        setLeftPanelMode,
        form,
        docImport,
        templates,
        viewing,
        pin
    } = useManagerDashboard({
        courses,
        onAddCourse,
        onDeleteCourse,
        currentUserEmail,
        currentInstitution,
        availableInstitutions
    });

    return (
        <div className="w-full max-w-6xl mx-auto space-y-8 animate-slide-in-up pb-20">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Course Manager Dashboard</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            Operating in {currentInstitutionName}
                        </p>
                    </div>
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

            <DashboardStats
                currentInstitutionName={currentInstitutionName}
                visibleCourseCount={visibleCourses.length}
                totalSubmissions={totalSubmissions}
                averageScore={averageScore}
            />

            <GuidancePanel
                coursesWithoutSubmissions={coursesWithoutSubmissions}
                flaggedForReview={flaggedForReview}
                totalSubmissions={totalSubmissions}
                instructorPriorities={instructorPriorities}
            />

            <AnalyticsSection
                courses={visibleCourses}
                totalSubmissions={totalSubmissions}
                onSelectSubmission={onSelectSubmission}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column - Create Course & List */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="glass-panel-light rounded-2xl p-2 flex gap-2">
                        <button
                            type="button"
                            onClick={() => setLeftPanelMode('create')}
                            className={`flex-1 dashboard-tab ${leftPanelMode === 'create' ? 'dashboard-tab-active' : ''}`}
                        >
                            Build Course
                        </button>
                        <button
                            type="button"
                            onClick={() => setLeftPanelMode('library')}
                            className={`flex-1 dashboard-tab ${leftPanelMode === 'library' ? 'dashboard-tab-active' : ''}`}
                        >
                            Course Library
                        </button>
                    </div>

                    {leftPanelMode === 'create' && (
                        <CourseCreateForm
                            form={form}
                            docImport={docImport}
                            templates={templates}
                            availableInstitutions={availableInstitutions}
                        />
                    )}

                    {leftPanelMode === 'library' && (
                        <CourseList
                            visibleCourses={visibleCourses}
                            verifiedCourses={pin.verifiedCourses}
                            onSaveAsTemplate={templates.handleSaveCourseAsTemplate}
                            onPinAction={pin.handlePinAction}
                        />
                    )}
                </div>

                {/* Right Column - Submissions Feed */}
                <div className="lg:col-span-8">
                    <SubmissionsPanel
                        isAdmin={isAdmin}
                        visibleCourseCount={visibleCourses.length}
                        allSubmissions={allSubmissions}
                        totalSubmissions={totalSubmissions}
                        onSelectSubmission={onSelectSubmission}
                        onDeleteSubmission={onDeleteSubmission}
                    />
                </div>
            </div>

            {/* Course Prompt Modal */}
            <CoursePromptModal
                viewingCourse={viewing.viewingCourse}
                setViewingCourse={viewing.setViewingCourse}
                onUpdateCourse={onUpdateCourse}
                onSelectSubmission={onSelectSubmission}
                onDeleteSubmission={onDeleteSubmission}
            />

            {/* PIN Verification Modal */}
            <PinVerifyModal
                isOpen={!!pin.pinModalCourse}
                onClose={pin.closePinModal}
                onVerified={pin.handlePinVerified}
                courseId={pin.pinModalCourse?.id || ''}
                courseName={pin.pinModalCourse?.name || ''}
                instructorPinHash={pin.pinModalCourse?.instructorPinHash || ''}
                title={pin.pinModalAction === 'delete' ? 'Confirm Deletion' : 'View Submissions'}
                description={
                    pin.pinModalAction === 'delete'
                        ? 'Enter the instructor PIN to delete this course.'
                        : 'Enter your instructor PIN to view submissions.'
                }
            />
        </div>
    );
};

export default ManagerDashboardView;
