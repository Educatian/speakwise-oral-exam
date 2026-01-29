import React, { useState, useEffect } from 'react';
import { Button, Input } from '../ui';
import { UserRole, ADMIN_EMAIL } from '../../types';

interface UserProfile {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    schoolId?: string;
    schoolName?: string;
    createdAt: string;
}

interface AdminPanelViewProps {
    currentUserEmail?: string;
    onBack: () => void;
}

// Demo users for local development (will be replaced with Supabase)
const DEMO_USERS: UserProfile[] = [
    { id: '1', email: 'jewoong.moon@gmail.com', displayName: 'Dr. Moon', role: UserRole.ADMIN, createdAt: '2025-01-01' },
    { id: '2', email: 'instructor@ou.edu', displayName: 'Prof. Smith', role: UserRole.INSTRUCTOR, schoolName: 'University of Oklahoma', createdAt: '2025-01-15' },
    { id: '3', email: 'mod@speakwise.edu', displayName: 'Moderator Jane', role: UserRole.MODERATOR, createdAt: '2025-01-20' },
    { id: '4', email: 'student@ua.edu', displayName: 'John Student', role: UserRole.STUDENT, schoolName: 'University of Alabama', createdAt: '2025-01-25' },
];

/**
 * Admin Panel View
 * Only accessible to admin (jewoong.moon@gmail.com)
 * Allows viewing and managing user roles
 */
export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
    currentUserEmail,
    onBack
}) => {
    const [users, setUsers] = useState<UserProfile[]>(DEMO_USERS);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    // Check if current user is admin
    const isAdmin = currentUserEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    // Filter users based on search
    const filteredUsers = users.filter(user =>
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.displayName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Handle role change
    const handleRoleChange = async (userId: string, newRole: UserRole) => {
        // Prevent changing own role or admin role
        const targetUser = users.find(u => u.id === userId);
        if (targetUser?.email === ADMIN_EMAIL) {
            return;
        }

        setIsLoading(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500));

        setUsers(prev => prev.map(user =>
            user.id === userId ? { ...user, role: newRole } : user
        ));

        setSuccessMessage(`Role updated to ${newRole}`);
        setTimeout(() => setSuccessMessage(''), 3000);
        setIsLoading(false);
    };

    // Role badge colors
    const getRoleBadgeClass = (role: UserRole) => {
        switch (role) {
            case UserRole.ADMIN: return 'bg-red-500/20 text-red-400 border-red-500/30';
            case UserRole.MODERATOR: return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
            case UserRole.INSTRUCTOR: return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
            case UserRole.STUDENT: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
        }
    };

    // If not admin, show access denied
    if (!isAdmin) {
        return (
            <div className="w-full max-w-2xl mx-auto text-center py-20">
                <div className="w-20 h-20 mx-auto mb-6 bg-red-500/10 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
                <p className="text-slate-400 mb-6">Only administrators can access this panel.</p>
                <Button variant="ghost" onClick={onBack}>← Return to Dashboard</Button>
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto space-y-6 animate-slide-in-up">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <span className="text-3xl">👑</span>
                        Admin Panel
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">Manage user roles and permissions</p>
                </div>
                <Button variant="ghost" onClick={onBack}>
                    ← Back to Dashboard
                </Button>
            </div>

            {/* Success Message */}
            {successMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
                    ✓ {successMessage}
                </div>
            )}

            {/* Search */}
            <div className="glass-panel p-4 rounded-2xl">
                <Input
                    placeholder="Search users by email or name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-md"
                />
            </div>

            {/* User List */}
            <div className="glass-panel rounded-3xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                        Registered Users ({filteredUsers.length})
                    </h3>
                </div>

                <div className="divide-y divide-slate-800">
                    {filteredUsers.map(user => (
                        <div
                            key={user.id}
                            className="p-4 hover:bg-slate-800/30 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                        >
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    <p className="text-white font-medium">{user.displayName}</p>
                                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${getRoleBadgeClass(user.role)}`}>
                                        {user.role}
                                    </span>
                                    {user.email === ADMIN_EMAIL && (
                                        <span className="text-xs text-yellow-400">👑 Super Admin</span>
                                    )}
                                </div>
                                <p className="text-slate-500 text-sm">{user.email}</p>
                                {user.schoolName && (
                                    <p className="text-slate-600 text-xs mt-1">🏫 {user.schoolName}</p>
                                )}
                            </div>

                            {/* Role Selector */}
                            {user.email !== ADMIN_EMAIL && (
                                <div className="flex items-center gap-2">
                                    <select
                                        value={user.role}
                                        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                                        disabled={isLoading}
                                        className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value={UserRole.STUDENT}>Student</option>
                                        <option value={UserRole.INSTRUCTOR}>Instructor</option>
                                        <option value={UserRole.MODERATOR}>Moderator</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    ))}

                    {filteredUsers.length === 0 && (
                        <div className="p-8 text-center text-slate-600">
                            No users found matching "{searchTerm}"
                        </div>
                    )}
                </div>
            </div>

            {/* Role Descriptions */}
            <div className="glass-panel p-6 rounded-2xl">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Role Permissions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                        <p className="text-emerald-400 font-bold mb-1">Student</p>
                        <p className="text-slate-500 text-xs">View courses, take interviews, access history</p>
                    </div>
                    <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                        <p className="text-indigo-400 font-bold mb-1">Instructor</p>
                        <p className="text-slate-500 text-xs">Create courses, view own students' submissions</p>
                    </div>
                    <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                        <p className="text-purple-400 font-bold mb-1">Moderator</p>
                        <p className="text-slate-500 text-xs">View all submissions, manage courses</p>
                    </div>
                    <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                        <p className="text-red-400 font-bold mb-1">Admin</p>
                        <p className="text-slate-500 text-xs">Full access, manage user roles</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanelView;
