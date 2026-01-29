import React, { useState, useEffect } from 'react';
import { Button, Input } from '../ui';

interface School {
    id: string;
    name: string;
}

interface SchoolSelectViewProps {
    onSchoolSelect: (schoolId: string, schoolName: string) => void;
    onBack: () => void;
    savedSchool?: { schoolId: string; schoolName: string } | null;
    userName?: string;
}

// Demo schools (will be replaced with Supabase data)
const DEMO_SCHOOLS: School[] = [
    { id: 'ua', name: 'University of Alabama' },
    { id: 'demo', name: 'Demo Institution' },
    { id: 'guest', name: 'Guest Access (No School)' }
];

// Demo passcodes (will be replaced with Supabase validation)
const DEMO_PASSCODES: Record<string, string> = {
    'ua': 'ROLL2025',
    'demo': 'DEMO',
    'guest': '' // No passcode needed
};

/**
 * School Selection View
 * Allows users to select their school and enter passcode
 * Remembers last selection for returning users
 */
export const SchoolSelectView: React.FC<SchoolSelectViewProps> = ({
    onSchoolSelect,
    onBack,
    savedSchool,
    userName
}) => {
    const [selectedSchool, setSelectedSchool] = useState<string>(savedSchool?.schoolId || '');
    const [passcode, setPasscode] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPasscodeField, setShowPasscodeField] = useState(false);

    // If user has saved school, auto-show passcode field
    useEffect(() => {
        if (savedSchool?.schoolId && savedSchool.schoolId !== 'guest') {
            setSelectedSchool(savedSchool.schoolId);
            setShowPasscodeField(true);
        }
    }, [savedSchool]);

    const handleSchoolChange = (schoolId: string) => {
        setSelectedSchool(schoolId);
        setPasscode('');
        setError('');
        setShowPasscodeField(schoolId !== 'guest');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!selectedSchool) {
            setError('Please select a school');
            return;
        }

        // Guest access - no passcode needed
        if (selectedSchool === 'guest') {
            onSchoolSelect('guest', 'Guest Access');
            return;
        }

        // Validate passcode
        const expectedPasscode = DEMO_PASSCODES[selectedSchool];
        if (passcode.toUpperCase() !== expectedPasscode.toUpperCase()) {
            setError('Invalid passcode. Please contact your instructor.');
            return;
        }

        setIsLoading(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500));

        const school = DEMO_SCHOOLS.find(s => s.id === selectedSchool);
        onSchoolSelect(selectedSchool, school?.name || 'Unknown School');

        setIsLoading(false);
    };

    const selectedSchoolName = DEMO_SCHOOLS.find(s => s.id === selectedSchool)?.name;

    return (
        <div className="w-full max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20">
                    <span className="text-3xl">🏫</span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Select Your School</h2>
                <p className="text-slate-400 text-sm">
                    {userName ? `Welcome, ${userName}!` : 'Choose your institution to access courses'}
                </p>
            </div>

            {/* Saved School Quick Access */}
            {savedSchool && savedSchool.schoolId !== 'guest' && (
                <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-emerald-400 font-bold uppercase mb-1">Last Used</p>
                            <p className="text-white font-medium">{savedSchool.schoolName}</p>
                        </div>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                                setSelectedSchool(savedSchool.schoolId);
                                setShowPasscodeField(true);
                            }}
                        >
                            Use Again →
                        </Button>
                    </div>
                </div>
            )}

            {/* School Selection Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* School Dropdown */}
                <div>
                    <label htmlFor="school" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Institution
                    </label>
                    <select
                        id="school"
                        value={selectedSchool}
                        onChange={(e) => handleSchoolChange(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                        disabled={isLoading}
                    >
                        <option value="">-- Select your school --</option>
                        {DEMO_SCHOOLS.map(school => (
                            <option key={school.id} value={school.id}>
                                {school.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Passcode Field */}
                {showPasscodeField && selectedSchool !== 'guest' && (
                    <div className="animate-fadeIn">
                        <label htmlFor="passcode" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            School Passcode 🔑
                        </label>
                        <Input
                            id="passcode"
                            type="text"
                            value={passcode}
                            onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                            placeholder="Enter passcode from instructor"
                            maxLength={20}
                            disabled={isLoading}
                            className="uppercase tracking-widest font-mono"
                        />
                        <p className="mt-2 text-xs text-slate-600">
                            💡 Your instructor will provide this code
                        </p>
                    </div>
                )}

                {/* Guest Access Info */}
                {selectedSchool === 'guest' && (
                    <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
                        <p className="text-slate-400 text-sm">
                            ℹ️ <strong>Guest Access</strong> allows you to explore the platform with demo content.
                            No passcode required.
                        </p>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
                        ⚠️ {error}
                    </div>
                )}

                {/* Submit Button */}
                <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={isLoading || !selectedSchool}
                >
                    {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Verifying...
                        </span>
                    ) : (
                        <>Continue to Courses →</>
                    )}
                </Button>
            </form>

            {/* Back Button */}
            <div className="mt-6 text-center">
                <button
                    onClick={onBack}
                    className="text-slate-600 hover:text-slate-400 text-sm transition-colors"
                >
                    ← Back
                </button>
            </div>

            {/* Help Text */}
            <div className="mt-8 text-center">
                <p className="text-slate-600 text-xs">
                    Don't see your school? Contact <span className="text-slate-500">support@speakwise.edu</span>
                </p>
            </div>
        </div>
    );
};

export default SchoolSelectView;
