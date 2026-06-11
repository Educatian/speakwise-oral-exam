import React, { useEffect, useState } from 'react';
import { chatComplete } from '../lib/services/aiClient';
import { extractDocumentText } from '../lib/utils/documentText';
import { extractExamFromText } from '../lib/services/questionExtraction';
import { Course, CourseTemplate, Institution } from '../types';
import { useToastContext } from '../contexts/ToastContext';
import { createCoursePromptGenerator } from '../lib/prompts/interviewerSystem';
import { deleteCourseTemplate, getCourseTemplates, saveCourseTemplate } from '../lib/supabase';
import { hashPin, isValidPin } from '../lib/utils/pinHash';
import { isAdminIdentity } from '../lib/utils/adminAccess';
import {
    countCoursesWithoutSubmissions,
    countFlaggedForReview,
    getAllSubmissions,
    getAverageScore,
    getInstructorPriorities,
    getVisibleCourses
} from '../lib/utils/managerDashboard';

interface UseManagerDashboardArgs {
    courses: Course[];
    onAddCourse: (course: Omit<Course, 'id' | 'submissions'>) => void;
    onDeleteCourse: (id: string) => void;
    currentUserEmail?: string;
    currentInstitution?: { schoolId: string; schoolName: string } | null;
    availableInstitutions: Institution[];
}

/**
 * Shared state + orchestration for the Manager Dashboard.
 *
 * All state that used to live directly in ManagerDashboardView stays hoisted
 * here so it survives the create/library tab switch (those panels unmount),
 * exactly as it did when the view was a single component.
 */
export function useManagerDashboard({
    courses,
    onAddCourse,
    onDeleteCourse,
    currentUserEmail,
    currentInstitution,
    availableInstitutions
}: UseManagerDashboardArgs) {
    const toast = useToastContext();

    // Get email from props or fallback to localStorage
    const storedUser = typeof localStorage !== 'undefined' ? localStorage.getItem('speakwise_user') : null;
    const effectiveEmail = currentUserEmail || (storedUser ? JSON.parse(storedUser)?.email : null);

    // Check if current user is admin — DB-backed user_profiles.role when
    // Supabase is configured; bootstrap email only in local/demo mode.
    const isAdmin = isAdminIdentity({ email: effectiveEmail });

    // Form state
    const [courseName, setCourseName] = useState('');
    const [instructorName, setInstructorName] = useState('');
    const [instructorPin, setInstructorPin] = useState('');
    const [coursePassword, setCoursePassword] = useState('');
    const [coursePrompt, setCoursePrompt] = useState('');
    const [silenceThresholdMs, setSilenceThresholdMs] = useState(3000);
    const [minTurnDurationMs, setMinTurnDurationMs] = useState(700);
    const [selectedInstitutionId, setSelectedInstitutionId] = useState(currentInstitution?.schoolId || '');
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [leftPanelMode, setLeftPanelMode] = useState<'create' | 'library'>('create');
    const [courseTemplates, setCourseTemplates] = useState<CourseTemplate[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templateError, setTemplateError] = useState<string | null>(null);
    const [templateDraftName, setTemplateDraftName] = useState('');

    // Modal state
    const [viewingCourse, setViewingCourse] = useState<Course | null>(null);

    // PIN verification state
    const [pinModalCourse, setPinModalCourse] = useState<Course | null>(null);
    const [pinModalAction, setPinModalAction] = useState<'view' | 'delete' | null>(null);
    const [verifiedCourses, setVerifiedCourses] = useState<Set<string>>(new Set());

    // Handle PIN verification action
    const handlePinAction = (course: Course, action: 'view' | 'delete') => {
        // Admin OR course owner bypasses PIN verification
        const isOwner = effectiveEmail && course.ownerEmail &&
            effectiveEmail.toLowerCase() === course.ownerEmail.toLowerCase();

        if (isAdmin || isOwner) {
            if (action === 'view') {
                setViewingCourse(course);
            } else {
                onDeleteCourse(course.id);
            }
            return;
        }

        // If already verified for this course, proceed directly
        if (verifiedCourses.has(course.id)) {
            if (action === 'view') {
                setViewingCourse(course);
            } else {
                onDeleteCourse(course.id);
            }
            return;
        }
        // Otherwise, show PIN modal
        setPinModalCourse(course);
        setPinModalAction(action);
    };

    const handlePinVerified = () => {
        if (!pinModalCourse || !pinModalAction) return;

        // Mark this course as verified for this session
        setVerifiedCourses(prev => new Set([...prev, pinModalCourse.id]));

        if (pinModalAction === 'view') {
            setViewingCourse(pinModalCourse);
        } else {
            onDeleteCourse(pinModalCourse.id);
        }

        setPinModalCourse(null);
        setPinModalAction(null);
    };

    const closePinModal = () => {
        setPinModalCourse(null);
        setPinModalAction(null);
    };

    useEffect(() => {
        let isMounted = true;

        async function loadTemplates() {
            setTemplatesLoading(true);
            setTemplateError(null);
            try {
                const templates = await getCourseTemplates(currentInstitution?.schoolId || selectedInstitutionId || null);
                if (isMounted) {
                    setCourseTemplates(templates);
                }
            } catch (error) {
                console.error('Failed to load course templates:', error);
                if (isMounted) {
                    setTemplateError('Unable to load course templates right now.');
                }
            } finally {
                if (isMounted) {
                    setTemplatesLoading(false);
                }
            }
        }

        loadTemplates();
        return () => {
            isMounted = false;
        };
    }, [currentInstitution?.schoolId, selectedInstitutionId]);

    // File upload state for Document-Driven Course Creation
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractStatus, setExtractStatus] = useState('');

    const [extractedQuestions, setExtractedQuestions] = useState<string[]>([]);
    const [extractedContext, setExtractedContext] = useState('');
    const [showQuestionReview, setShowQuestionReview] = useState(false);

    // Handle file drop
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files).slice(0, 2) as File[];
        const validFiles = files.filter(f =>
            f.type === 'application/pdf' ||
            f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            f.type === 'text/plain' ||
            f.name.endsWith('.txt') || f.name.endsWith('.pdf') || f.name.endsWith('.docx')
        );
        if (validFiles.length > 0) {
            setUploadedFiles(prev => [...prev, ...validFiles].slice(0, 2));
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files).slice(0, 2);
            setUploadedFiles(prev => [...prev, ...files].slice(0, 2));
        }
    };

    const removeFile = (index: number) => {
        setUploadedFiles(prev => prev.filter((_, i) => i !== index));
        setExtractedQuestions([]);
        setExtractedContext('');
        setShowQuestionReview(false);
    };

    // Read uploaded documents (TXT / DOCX / PDF) and extract a knowledge base +
    // oral-exam questions. Long documents are chunked and consolidated (RAG-style)
    // by the extraction service so nothing is silently truncated.
    const handleExtractFromFiles = async () => {
        if (uploadedFiles.length === 0) return;
        setIsExtracting(true);
        setFormError(null);

        try {
            setExtractStatus('Reading documents…');
            const fileContents = await Promise.all(
                uploadedFiles.map(async (file) => {
                    try {
                        return { name: file.name, text: await extractDocumentText(file) };
                    } catch (readErr) {
                        console.error(`Could not read ${file.name}:`, readErr);
                        return { name: file.name, text: '' };
                    }
                })
            );

            const readable = fileContents.filter((fc) => fc.text.trim().length > 0);
            if (readable.length === 0) {
                setFormError(
                    'Could not read any text from the uploaded file(s). If a PDF is scanned (an image), it has no selectable text — please upload a text-based PDF, DOCX, or TXT.'
                );
                return;
            }

            const skipped = fileContents.filter((fc) => fc.text.trim().length === 0);
            setExtractStatus('Analyzing material and drafting questions…');
            const { knowledgeBase, questions } = await extractExamFromText(
                readable,
                courseName || 'Unknown Course'
            );

            setExtractedQuestions(questions);
            setExtractedContext(knowledgeBase);
            setShowQuestionReview(true);
            if (skipped.length > 0) {
                setFormError(
                    `Note: no text could be read from ${skipped.map((s) => s.name).join(', ')} (likely a scanned/image PDF). Questions were generated from the remaining file(s).`
                );
            }
        } catch (err) {
            console.error('Extraction failed:', err);
            setFormError(
                err instanceof Error
                    ? `Extraction failed: ${err.message}`
                    : 'Failed to extract questions. Please check your files and try again.'
            );
        } finally {
            setIsExtracting(false);
            setExtractStatus('');
        }
    };

    // Apply extracted questions to the system prompt
    const handleApproveQuestions = () => {
        const questionsBlock = extractedQuestions
            .map((q, i) => `${i + 1}. ${q}`)
            .join('\n');

        // Only reference a Knowledge Base if one was actually extracted —
        // otherwise the examiner is told to grade against a blank section.
        const kb = extractedContext.trim();
        const kbSection = kb
            ? `## Knowledge Base (from uploaded documents)\n${kb}\n\n`
            : '';
        const evalLine = kb
            ? "Evaluate the student's answers against the Knowledge Base above. Be thorough but encouraging."
            : "Evaluate the student's answers for conceptual understanding and accuracy. Be thorough but encouraging.";

        const prompt = `${kbSection}## Required Interview Questions\nYou MUST ask these questions in order:\n${questionsBlock}\n\n${evalLine}`;

        setCoursePrompt(prompt);
        setShowQuestionReview(false);
    };

    // Edit a question
    const updateQuestion = (index: number, value: string) => {
        setExtractedQuestions(prev => prev.map((q, i) => i === index ? value : q));
    };

    // Remove a question
    const removeQuestion = (index: number) => {
        setExtractedQuestions(prev => prev.filter((_, i) => i !== index));
    };

    // Add a question
    const addQuestion = () => {
        setExtractedQuestions(prev => [...prev, '']);
    };

    const handleSaveTemplateFromForm = async () => {
        if (!coursePrompt.trim()) {
            setTemplateError('Add a prompt before saving a reusable template.');
            return;
        }

        const institution = availableInstitutions.find((item) => item.id === selectedInstitutionId);
        const template: CourseTemplate = {
            id: `template_${Math.random().toString(36).slice(2, 9)}`,
            name: (templateDraftName || courseName || 'Untitled Template').trim(),
            prompt: coursePrompt.trim(),
            instructorName: instructorName.trim() || 'Instructor',
            institutionId: selectedInstitutionId || currentInstitution?.schoolId || '',
            institutionName: institution?.name || currentInstitution?.schoolName || '',
            createdByEmail: effectiveEmail || '',
            createdAt: Date.now(),
            interviewSettings: {
                silenceThresholdMs,
                minTurnDurationMs
            }
        };

        try {
            await saveCourseTemplate(template);
            setCourseTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
            setTemplateDraftName('');
            setTemplateError(null);
            toast.success(`Template "${template.name}" saved to your library.`);
        } catch (error) {
            console.error('Failed to save template:', error);
            setTemplateError('The template could not be saved to the server. Check your connection and try again — your draft is still in the form.');
        }
    };

    const handleSaveCourseAsTemplate = async (course: Course) => {
        const template: CourseTemplate = {
            id: `template_${course.id}_${Date.now().toString(36)}`,
            name: `${course.name} Template`,
            prompt: course.prompt,
            instructorName: course.instructorName,
            institutionId: course.institutionId,
            institutionName: course.institutionName,
            sourceCourseId: course.id,
            createdByEmail: effectiveEmail || course.ownerEmail || '',
            createdAt: Date.now(),
            interviewSettings: course.interviewSettings
        };

        try {
            await saveCourseTemplate(template);
            setCourseTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
            setTemplateError(null);
            toast.success(`"${course.name}" saved as a reusable template.`);
        } catch (error) {
            console.error('Failed to save course as template:', error);
            setTemplateError('The template could not be saved to the server. Check your connection and try again.');
        }
    };

    const handleLoadTemplate = (template: CourseTemplate) => {
        setCourseName(`${template.name.replace(/ Template$/i, '')} Copy`);
        setInstructorName(template.instructorName);
        setCoursePrompt(template.prompt);
        setSelectedInstitutionId(template.institutionId || currentInstitution?.schoolId || '');
        setTemplateDraftName(template.name);
        setSilenceThresholdMs(template.interviewSettings?.silenceThresholdMs || 3000);
        setMinTurnDurationMs(template.interviewSettings?.minTurnDurationMs || 700);
        setLeftPanelMode('create');
        setFormError(null);
    };

    const handleDeleteTemplate = async (templateId: string) => {
        try {
            await deleteCourseTemplate(templateId);
            setCourseTemplates((current) => current.filter((template) => template.id !== templateId));
            setTemplateError(null);
            toast.info('Template deleted.');
        } catch (error) {
            console.error('Failed to delete template:', error);
            setTemplateError('The template could not be deleted on the server. Check your connection and try again.');
        }
    };

    // Validate and add course
    const handleAddCourse = async () => {
        setFormError(null);

        if (!courseName.trim()) {
            setFormError('Add a course name so students can recognize it in their course list.');
            return;
        }
        if (!instructorName.trim()) {
            setFormError('Add the instructor name — it appears on the student-facing course card.');
            return;
        }
        if (!instructorPin.trim()) {
            setFormError('Set a 4-digit instructor PIN. It protects submission access for this course.');
            return;
        }
        if (!isValidPin(instructorPin)) {
            setFormError('The instructor PIN must be exactly 4 digits — adjust it and try again.');
            return;
        }
        if (!coursePassword.trim()) {
            setFormError('Set a student passcode. Students enter it to join this course.');
            return;
        }
        if (!selectedInstitutionId) {
            setFormError('Choose an institution workspace so this course deploys where your students will look for it.');
            return;
        }
        if (coursePassword.length < 4) {
            setFormError('The student passcode needs at least 4 characters — lengthen it and try again.');
            return;
        }
        if (!coursePrompt.trim()) {
            setFormError('Add the AI interviewer instruction, or use AI Generate / a saved template to draft one.');
            return;
        }
        if (silenceThresholdMs < 1000 || silenceThresholdMs > 8000) {
            setFormError('Silence threshold should stay between 1000ms and 8000ms.');
            return;
        }
        if (minTurnDurationMs < 300 || minTurnDurationMs > 4000) {
            setFormError('Minimum turn length should stay between 300ms and 4000ms.');
            return;
        }

        // Generate a temporary course ID for hashing
        const tempId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const pinHash = await hashPin(instructorPin, tempId);

        const selectedInstitution = availableInstitutions.find((institution) => institution.id === selectedInstitutionId);

        onAddCourse({
            name: courseName.trim(),
            instructorName: instructorName.trim(),
            instructorPinHash: pinHash,
            password: coursePassword,
            prompt: coursePrompt.trim(),
            ownerEmail: currentUserEmail, // Set owner for visibility control
            institutionId: selectedInstitutionId,
            institutionName: selectedInstitution?.name || currentInstitution?.schoolName || '',
            interviewSettings: {
                silenceThresholdMs,
                minTurnDurationMs
            }
        });

        toast.success(`Course "${courseName.trim()}" created. Share the course number and passcode with your students.`);

        // Reset form
        setCourseName('');
        setInstructorName('');
        setInstructorPin('');
        setCoursePassword('');
        setCoursePrompt('');
        setSilenceThresholdMs(3000);
        setMinTurnDurationMs(700);
        setSelectedInstitutionId(currentInstitution?.schoolId || '');
        setUploadedFiles([]);
        setExtractedQuestions([]);
        setExtractedContext('');
        setShowQuestionReview(false);
    };

    // Generate AI prompt
    const handleGeneratePrompt = async () => {
        if (!courseName.trim()) {
            setFormError('Enter a course name first — the generator uses it to draft a relevant instruction.');
            return;
        }

        setIsGeneratingPrompt(true);
        setFormError(null);

        try {
            const generated = await chatComplete({
                messages: [
                    { role: 'user', content: createCoursePromptGenerator(courseName) }
                ]
            });
            if (generated.trim()) {
                setCoursePrompt(generated.trim());
            }
        } catch (err) {
            console.error('Prompt generation failed:', err);
            setFormError('The prompt generator did not respond. Check your connection and try again, or write the instruction manually.');
        } finally {
            setIsGeneratingPrompt(false);
        }
    };

    // Filter courses based on ownership (admin sees all, others see only their own)
    if (import.meta.env.DEV) {
        console.log('[DEBUG] effectiveEmail:', effectiveEmail);
        console.log('[DEBUG] courses ownerEmails:', courses.map(c => ({ id: c.id, name: c.name, ownerEmail: c.ownerEmail })));
    }

    const visibleCourses = getVisibleCourses(courses, isAdmin, effectiveEmail, currentInstitution?.schoolId);

    // Get all submissions sorted by timestamp (only from visible courses)
    const allSubmissions = getAllSubmissions(visibleCourses);

    const totalSubmissions = allSubmissions.length;
    const currentInstitutionName = currentInstitution?.schoolName || 'All Institutions';
    const averageScore = getAverageScore(allSubmissions);
    const coursesWithoutSubmissions = countCoursesWithoutSubmissions(visibleCourses);
    const flaggedForReview = countFlaggedForReview(allSubmissions);
    const instructorPriorities = getInstructorPriorities(visibleCourses);

    return {
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
        form: {
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
        },
        docImport: {
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
        },
        templates: {
            courseTemplates,
            templatesLoading,
            templateError,
            templateDraftName, setTemplateDraftName,
            handleSaveTemplateFromForm,
            handleSaveCourseAsTemplate,
            handleLoadTemplate,
            handleDeleteTemplate
        },
        viewing: {
            viewingCourse,
            setViewingCourse
        },
        pin: {
            pinModalCourse,
            pinModalAction,
            verifiedCourses,
            handlePinAction,
            handlePinVerified,
            closePinModal
        }
    };
}

export type ManagerDashboard = ReturnType<typeof useManagerDashboard>;
