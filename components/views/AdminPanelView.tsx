import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input } from '../ui';
import { ADMIN_EMAIL, AuditLogEntry, Course, Institution, UserProfile, UserRole } from '../../types';
import { getAllCourses, getAuditLogs, getInstitutions, getUserProfiles, subscribeToAuditLogsRealtime, updateUserRole } from '../../lib/supabase';

interface AdminPanelViewProps {
    currentUserEmail?: string;
    onBack: () => void;
}

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
    currentUserEmail,
    onBack
}) => {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const isAdmin = currentUserEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    useEffect(() => {
        if (!isAdmin) return;

        let isMounted = true;

        async function loadConsoleData() {
            setIsLoading(true);
            try {
                const [profiles, loadedCourses, loadedInstitutions, loadedAuditLogs] = await Promise.all([
                    getUserProfiles(),
                    getAllCourses(),
                    getInstitutions(),
                    getAuditLogs(20)
                ]);

                if (!isMounted) return;
                setUsers(profiles);
                setCourses(loadedCourses);
                setInstitutions(loadedInstitutions);
                setAuditLogs(loadedAuditLogs);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        loadConsoleData();
        return () => {
            isMounted = false;
        };
    }, [isAdmin]);

    useEffect(() => {
        if (!isAdmin) return;
        return subscribeToAuditLogsRealtime((logs) => {
            setAuditLogs(logs);
        }, 20);
    }, [isAdmin]);

    const filteredUsers = useMemo(() => users.filter((user) =>
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.schoolName || '').toLowerCase().includes(searchTerm.toLowerCase())
    ), [searchTerm, users]);

    const roleCounts = useMemo(() => ({
        students: users.filter((user) => user.role === UserRole.STUDENT).length,
        instructors: users.filter((user) => user.role === UserRole.INSTRUCTOR).length,
        moderators: users.filter((user) => user.role === UserRole.MODERATOR).length,
        admins: users.filter((user) => user.role === UserRole.ADMIN).length
    }), [users]);

    const institutionCards = useMemo(() => institutions
        .filter((institution) => institution.id !== 'guest')
        .map((institution) => {
            const scopedUsers = users.filter((user) => user.schoolId === institution.id);
            const scopedCourses = courses.filter((course) => course.institutionId === institution.id);
            const scopedSubmissions = scopedCourses.reduce((sum, course) => sum + course.submissions.length, 0);

            return {
                ...institution,
                userCount: scopedUsers.length,
                courseCount: scopedCourses.length,
                submissionCount: scopedSubmissions
            };
        }), [courses, institutions, users]);

    const handleRoleChange = async (userId: string, newRole: UserRole) => {
        const targetUser = users.find((user) => user.id === userId);
        if (targetUser?.email === ADMIN_EMAIL) {
            return;
        }

        setIsLoading(true);
        const success = await updateUserRole(userId, newRole);
        if (!success) {
            setIsLoading(false);
            setSuccessMessage('');
            return;
        }

        setUsers((current) => current.map((user) =>
            user.id === userId ? { ...user, role: newRole } : user
        ));
        setAuditLogs((current) => [
            {
                id: `local_role_${Date.now()}`,
                action: 'user.role.updated',
                description: `${currentUserEmail || 'Admin'} changed ${targetUser?.email || 'a user'} to ${newRole}.`,
                targetType: 'user',
                targetId: userId,
                actorEmail: currentUserEmail,
                actorName: currentUserEmail || 'Admin',
                createdAt: Date.now(),
                institutionId: targetUser?.schoolId
            },
            ...current
        ].slice(0, 20));

        setSuccessMessage(`Role updated to ${newRole}`);
        window.setTimeout(() => setSuccessMessage(''), 3000);
        setIsLoading(false);
    };

    const getRoleBadgeClass = (role: UserRole) => {
        switch (role) {
            case UserRole.ADMIN: return 'bg-red-500/20 text-red-300 border-red-500/30';
            case UserRole.MODERATOR: return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
            case UserRole.INSTRUCTOR: return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
            case UserRole.STUDENT: return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
            default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
        }
    };

    if (!isAdmin) {
        return (
            <div className="w-full max-w-2xl mx-auto text-center py-20">
                <div className="w-20 h-20 mx-auto mb-6 bg-red-500/10 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Access denied</h2>
                <p className="text-slate-400 mb-6">Only the platform administrator can open the operations console.</p>
                <Button variant="ghost" onClick={onBack}>Return to dashboard</Button>
            </div>
        );
    }

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6 animate-slide-in-up">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Institution Operations Console</h2>
                    <p className="text-slate-400 text-sm mt-1">Monitor institution coverage, assign roles, and review platform activity.</p>
                </div>
                <Button variant="ghost" onClick={onBack}>
                    Back to Dashboard
                </Button>
            </div>

            {successMessage && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                    {successMessage}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="glass-panel-light rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Institutions</p>
                    <p className="text-2xl font-semibold text-white">{institutionCards.length}</p>
                    <p className="text-xs text-slate-500 mt-2">Active workspaces currently visible to the app.</p>
                </div>
                <div className="glass-panel-light rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Users</p>
                    <p className="text-2xl font-semibold text-white">{users.length}</p>
                    <p className="text-xs text-slate-500 mt-2">{roleCounts.instructors} instructors, {roleCounts.students} students</p>
                </div>
                <div className="glass-panel-light rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Courses</p>
                    <p className="text-2xl font-semibold text-white">{courses.length}</p>
                    <p className="text-xs text-slate-500 mt-2">{courses.reduce((sum, course) => sum + course.submissions.length, 0)} submissions stored across active courses.</p>
                </div>
                <div className="glass-panel-light rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Recent audit events</p>
                    <p className="text-2xl font-semibold text-white">{auditLogs.length}</p>
                    <p className="text-xs text-slate-500 mt-2">Latest role changes, review actions, and template operations.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)] gap-6">
                <div className="space-y-6">
                    <div className="glass-panel rounded-3xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800 bg-slate-900/40">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Institution coverage</h3>
                        </div>
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {institutionCards.map((institution) => (
                                <div key={institution.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-white font-semibold">{institution.name}</p>
                                            <p className="text-xs text-slate-500 mt-1">{institution.domain || 'Custom institution workspace'}</p>
                                        </div>
                                        <span
                                            className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                                            style={{ backgroundColor: institution.primaryColor || '#10b981' }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 mt-4">
                                        <div className="rounded-xl bg-slate-950/50 border border-slate-800 px-3 py-2">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600 font-bold">Users</p>
                                            <p className="text-lg font-semibold text-white mt-1">{institution.userCount}</p>
                                        </div>
                                        <div className="rounded-xl bg-slate-950/50 border border-slate-800 px-3 py-2">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600 font-bold">Courses</p>
                                            <p className="text-lg font-semibold text-white mt-1">{institution.courseCount}</p>
                                        </div>
                                        <div className="rounded-xl bg-slate-950/50 border border-slate-800 px-3 py-2">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600 font-bold">Submissions</p>
                                            <p className="text-lg font-semibold text-white mt-1">{institution.submissionCount}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel rounded-3xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">User access</h3>
                                <p className="text-xs text-slate-600 mt-1">Search, filter, and change roles without leaving the console.</p>
                            </div>
                            <Input
                                placeholder="Search by name, email, or institution..."
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                className="md:max-w-sm"
                            />
                        </div>

                        <div className="divide-y divide-slate-800">
                            {filteredUsers.map((user) => (
                                <div
                                    key={user.id}
                                    className="p-4 hover:bg-slate-800/20 transition-colors flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center flex-wrap gap-2">
                                            <p className="text-white font-medium">{user.displayName}</p>
                                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${getRoleBadgeClass(user.role)}`}>
                                                {user.role}
                                            </span>
                                            {user.email === ADMIN_EMAIL && (
                                                <span className="text-[10px] uppercase tracking-[0.18em] text-amber-300">Super admin</span>
                                            )}
                                        </div>
                                        <p className="text-slate-500 text-sm truncate">{user.email}</p>
                                        <p className="text-slate-600 text-xs mt-1">{user.schoolName || 'No institution selected yet'}</p>
                                    </div>

                                    {user.email !== ADMIN_EMAIL && (
                                        <select
                                            value={user.role}
                                            onChange={(event) => handleRoleChange(user.id, event.target.value as UserRole)}
                                            disabled={isLoading}
                                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                                        >
                                            <option value={UserRole.STUDENT}>Student</option>
                                            <option value={UserRole.INSTRUCTOR}>Instructor</option>
                                            <option value={UserRole.MODERATOR}>Moderator</option>
                                        </select>
                                    )}
                                </div>
                            ))}

                            {filteredUsers.length === 0 && (
                                <div className="p-8 text-center text-slate-600">
                                    No users found for "{searchTerm}".
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="glass-panel rounded-3xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800 bg-slate-900/40">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Role mix</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            {[
                                { label: 'Students', value: roleCounts.students, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
                                { label: 'Instructors', value: roleCounts.instructors, color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
                                { label: 'Moderators', value: roleCounts.moderators, color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
                                { label: 'Admins', value: roleCounts.admins, color: 'bg-red-500/20 text-red-300 border-red-500/30' }
                            ].map((item) => (
                                <div key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.18em] border ${item.color}`}>
                                        {item.label}
                                    </span>
                                    <span className="text-white font-semibold">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel rounded-3xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800 bg-slate-900/40">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Recent activity</h3>
                        </div>
                        <div className="p-4 space-y-3 max-h-[560px] overflow-y-auto custom-scrollbar">
                            {auditLogs.length === 0 ? (
                                <p className="text-sm text-slate-500">No audit events have been recorded yet.</p>
                            ) : (
                                auditLogs.map((log) => (
                                    <div key={log.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-white">{log.description}</p>
                                                <p className="text-[11px] text-slate-500 mt-1">
                                                    {log.actorEmail || 'System'} • {log.targetType} • {new Date(log.createdAt).toLocaleString()}
                                                </p>
                                            </div>
                                            <span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-[0.18em] border border-slate-800 bg-slate-950/60 text-slate-500">
                                                {log.action}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanelView;
