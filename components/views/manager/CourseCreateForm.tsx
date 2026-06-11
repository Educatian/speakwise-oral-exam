import React from 'react';
import { Institution } from '../../../types';
import { Button, Input, Textarea } from '../../ui';
import { ManagerDashboard } from '../../../hooks/useManagerDashboard';

interface CourseCreateFormProps {
    form: ManagerDashboard['form'];
    docImport: ManagerDashboard['docImport'];
    templates: ManagerDashboard['templates'];
    availableInstitutions: Institution[];
}

/**
 * "Add New Course" panel: course form fields, interview tuning, document-driven
 * question extraction, AI prompt generation, and the reusable-template drawer.
 *
 * All form state lives in useManagerDashboard (passed in via props) so the
 * draft survives switching to the Course Library tab and back.
 */
export const CourseCreateForm: React.FC<CourseCreateFormProps> = ({
    form,
    docImport,
    templates,
    availableInstitutions
}) => {
    const {
        courseName, setCourseName,
        instructorName, setInstructorName,
        instructorPin, setInstructorPin,
        coursePassword, setCoursePassword,
        coursePrompt, setCoursePrompt,
        silenceThresholdMs, setSilenceThresholdMs,
        minTurnDurationMs, setMinTurnDurationMs,
        selectedInstitutionId, setSelectedInstitutionId,
        isGeneratingPrompt,
        formError,
        handleAddCourse,
        handleGeneratePrompt
    } = form;

    const {
        uploadedFiles,
        isDragging, setIsDragging,
        isExtracting,
        extractStatus,
        extractedQuestions,
        showQuestionReview,
        handleDrop,
        handleFileSelect,
        removeFile,
        handleExtractFromFiles,
        handleApproveQuestions,
        updateQuestion,
        removeQuestion,
        addQuestion
    } = docImport;

    const {
        courseTemplates,
        templatesLoading,
        templateError,
        templateDraftName, setTemplateDraftName,
        handleSaveTemplateFromForm,
        handleLoadTemplate,
        handleDeleteTemplate
    } = templates;

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    return (
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

            <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                    Institution Workspace
                </label>
                <select
                    value={selectedInstitutionId}
                    onChange={(e) => setSelectedInstitutionId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                >
                    <option value="">Select institution</option>
                    {availableInstitutions
                        .filter((institution) => institution.id !== 'guest')
                        .map((institution) => (
                            <option key={institution.id} value={institution.id}>
                                {institution.name}
                            </option>
                        ))}
                </select>
                <p className="text-xs text-slate-500">
                    Courses are scoped to an institution so they can be rolled out cleanly by campus or program.
                </p>
            </div>

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

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
                <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Interview tuning</p>
                    <p className="text-xs text-slate-500 mt-1">Adjust how long the system waits before closing a turn and how short a captured response can be.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Silence threshold</span>
                        <div className="mt-2 flex items-center gap-3">
                            <input
                                type="range"
                                min={1000}
                                max={8000}
                                step={250}
                                value={silenceThresholdMs}
                                onChange={(event) => setSilenceThresholdMs(Number(event.target.value))}
                                className="flex-1"
                            />
                            <span className="w-16 text-right text-sm font-mono text-slate-200">{(silenceThresholdMs / 1000).toFixed(1)}s</span>
                        </div>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Minimum turn length</span>
                        <div className="mt-2 flex items-center gap-3">
                            <input
                                type="range"
                                min={300}
                                max={4000}
                                step={100}
                                value={minTurnDurationMs}
                                onChange={(event) => setMinTurnDurationMs(Number(event.target.value))}
                                className="flex-1"
                            />
                            <span className="w-16 text-right text-sm font-mono text-slate-200">{minTurnDurationMs}ms</span>
                        </div>
                    </label>
                </div>
            </div>

            {/* ── Document Upload Section ────────────────────────────── */}
            <div className="border border-dashed border-indigo-500/30 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                    📄 Knowledge Source (Optional)
                    <span className="text-slate-600 font-normal normal-case tracking-normal">Max 2 files</span>
                </h4>

                {/* Dropzone */}
                <div
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${isDragging
                        ? 'border-indigo-400 bg-indigo-500/10'
                        : 'border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/30'
                        }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                    <svg className="w-8 h-8 mx-auto text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-xs text-slate-500">
                        {isDragging ? 'Drop files here' : 'Drop PDF, DOCX, or TXT — or click to browse'}
                    </p>
                </div>

                {/* Uploaded Files */}
                {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                        {uploadedFiles.map((file, i) => (
                            <div key={i} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-indigo-400 text-sm">📎</span>
                                    <span className="text-xs text-slate-300 truncate">{file.name}</span>
                                    <span className="text-[10px] text-slate-600">({(file.size / 1024).toFixed(0)} KB)</span>
                                </div>
                                <button
                                    onClick={() => removeFile(i)}
                                    className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}

                        {!showQuestionReview && (
                            <button
                                onClick={handleExtractFromFiles}
                                disabled={isExtracting}
                                className="w-full py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                            >
                                {isExtracting ? (
                                    <>
                                        <span className="spinner w-3 h-3" />
                                        {extractStatus || 'Analyzing documents…'}
                                    </>
                                ) : (
                                    <>
                                        🔍 Extract Questions from Documents
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}

                {/* Question Review Panel */}
                {showQuestionReview && extractedQuestions.length > 0 && (
                    <div className="space-y-3 border-t border-slate-700 pt-3">
                        <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-emerald-400 uppercase">
                                📋 Extracted Questions ({extractedQuestions.length})
                            </h5>
                            <button
                                onClick={addQuestion}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold"
                            >
                                + Add Question
                            </button>
                        </div>

                        <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                            {extractedQuestions.map((q, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <span className="text-[10px] text-slate-600 mt-2 flex-shrink-0">{i + 1}.</span>
                                    <input
                                        type="text"
                                        value={q}
                                        onChange={(e) => updateQuestion(i, e.target.value)}
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:border-indigo-500/50 focus:outline-none"
                                    />
                                    <button
                                        onClick={() => removeQuestion(i)}
                                        className="text-slate-600 hover:text-red-400 text-xs mt-1 flex-shrink-0"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={handleApproveQuestions}
                            className="w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-xs font-bold rounded-xl transition-all"
                        >
                            ✓ Approve & Generate Prompt
                        </button>
                    </div>
                )}
            </div>

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

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold">Reusable templates</p>
                        <p className="text-xs text-slate-500 mt-1">Save the current draft so future institution rollouts start from a proven prompt.</p>
                    </div>
                    <span className="badge badge-accent">{courseTemplates.length}</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <Input
                        placeholder="Template name"
                        value={templateDraftName}
                        onChange={(e) => setTemplateDraftName(e.target.value)}
                        aria-label="Template name"
                    />
                    <Button onClick={handleSaveTemplateFromForm} variant="ghost" className="sm:w-auto">
                        Save Template
                    </Button>
                </div>

                {templatesLoading ? (
                    <p className="text-xs text-slate-500">Loading templates...</p>
                ) : courseTemplates.length === 0 ? (
                    <p className="text-xs text-slate-600">No templates yet. Save this draft or a live course to seed your reusable library.</p>
                ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {courseTemplates.slice(0, 4).map((template) => (
                            <div key={template.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-white truncate">{template.name}</p>
                                        <p className="text-[11px] text-slate-500 mt-1">
                                            {template.institutionName || 'Shared template'} • {template.instructorName}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteTemplate(template.id)}
                                        className="text-xs text-slate-500 hover:text-red-400"
                                    >
                                        Delete
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    <button
                                        type="button"
                                        onClick={() => handleLoadTemplate(template)}
                                        className="px-3 py-1.5 rounded-full text-[11px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                    >
                                        Load into form
                                    </button>
                                    <span className="px-3 py-1.5 rounded-full text-[11px] border border-slate-800 bg-slate-900/60 text-slate-500">
                                        {template.prompt.length} chars
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {formError && (
                <p className="text-red-400 text-sm" role="alert">{formError}</p>
            )}
            {templateError && (
                <p className="text-amber-400 text-sm" role="status">{templateError}</p>
            )}

            <Button
                onClick={handleAddCourse}
                variant="accent"
                className="w-full"
            >
                Create Course
            </Button>
        </div>
    );
};
