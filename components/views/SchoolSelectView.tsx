import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input } from '../ui';
import { useAuthContext } from '../../contexts/AuthContext';
import { useInstitutionContext } from '../../contexts/InstitutionContext';

interface SchoolSelectViewProps {
    onSchoolSelect: (schoolId: string, schoolName: string) => void;
    onBack: () => void;
    userName?: string;
}

export const SchoolSelectView: React.FC<SchoolSelectViewProps> = ({
    onSchoolSelect,
    onBack,
    userName
}) => {
    // Saved school + institution directory come from the app-root contexts
    // (previously drilled App → AppRouter → here as props).
    const { savedSchool } = useAuthContext();
    const { institutions, validateAccessCode } = useInstitutionContext();
    const [selectedSchool, setSelectedSchool] = useState<string>(savedSchool?.schoolId || '');
    const [searchQuery, setSearchQuery] = useState('');
    const [passcode, setPasscode] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (savedSchool?.schoolId) {
            setSelectedSchool(savedSchool.schoolId);
        }
    }, [savedSchool]);

    const filteredInstitutions = useMemo(() => {
        return institutions.filter((institution) =>
            institution.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            institution.domain?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [institutions, searchQuery]);

    const selectedInstitution = institutions.find((institution) => institution.id === selectedSchool);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');

        if (!selectedSchool) {
            setError('Please select an institution.');
            return;
        }

        if (selectedSchool === 'guest') {
            onSchoolSelect('guest', 'Guest Access');
            return;
        }

        setIsLoading(true);
        const validatedInstitution = await validateAccessCode(selectedSchool, passcode);
        setIsLoading(false);

        if (!validatedInstitution) {
            setError('The institution access code did not match. Please check with your instructor.');
            return;
        }

        onSchoolSelect(validatedInstitution.id, validatedInstitution.name);
    };

    return (
        <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 animate-fade-in">
            <section className="glass-panel rounded-3xl p-8 lg:p-10">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-800 bg-slate-900/60 mb-6">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">
                        Institution access
                    </span>
                </div>

                <h2 className="text-3xl font-bold text-white mb-3">Choose your institution workspace</h2>
                <p className="text-slate-400 text-sm leading-relaxed max-w-2xl">
                    {userName
                        ? `Welcome, ${userName}. Select the institution workspace your course belongs to.`
                        : 'Select the correct institution so we can show the courses and permissions that belong to you.'}
                </p>

                {savedSchool && savedSchool.schoolId !== 'guest' && (
                    <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs text-emerald-400 font-bold uppercase tracking-[0.2em] mb-1">Recent workspace</p>
                            <p className="text-white font-medium">{savedSchool.schoolName}</p>
                        </div>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setSelectedSchool(savedSchool.schoolId)}
                        >
                            Use this workspace
                        </Button>
                    </div>
                )}

                <div className="mt-6">
                    <label htmlFor="institution-search" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Search institutions
                    </label>
                    <Input
                        id="institution-search"
                        type="text"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search by institution name or domain"
                    />
                </div>

                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                    {filteredInstitutions.map((institution) => {
                        const isSelected = selectedSchool === institution.id;
                        return (
                            <button
                                key={institution.id}
                                type="button"
                                onClick={() => {
                                    setSelectedSchool(institution.id);
                                    setError('');
                                }}
                                className={`rounded-2xl border p-4 text-left transition-all ${
                                    isSelected
                                        ? 'border-emerald-500/40 bg-emerald-500/10'
                                        : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-white">{institution.name}</p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            {institution.id === 'guest'
                                                ? 'Open demo workspace'
                                                : institution.domain || 'Private institution workspace'}
                                        </p>
                                    </div>
                                    <span
                                        className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                                        style={{ backgroundColor: institution.primaryColor || '#10b981' }}
                                    />
                                </div>
                            </button>
                        );
                    })}
                </div>

                {filteredInstitutions.length === 0 && (
                    <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-center">
                        <p className="text-sm font-medium text-white">No institution matched that search.</p>
                        <p className="text-sm text-slate-400 mt-1">
                            Try a broader name, a domain keyword, or contact support if your institution has not been added yet.
                        </p>
                    </div>
                )}
            </section>

            <aside className="glass-panel-light rounded-3xl p-8 lg:p-10">
                <h3 className="text-xl font-semibold text-white mb-2">
                    {selectedInstitution ? selectedInstitution.name : 'Confirm your workspace'}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                    {selectedInstitution?.id === 'guest'
                        ? 'Guest access opens the demo experience without a restricted institution workspace.'
                        : 'Enter the institution access code provided by your instructor or program admin.'}
                </p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                        <label htmlFor="institution-code" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Institution access code
                        </label>
                        <Input
                            id="institution-code"
                            type="text"
                            value={passcode}
                            onChange={(event) => setPasscode(event.target.value.toUpperCase())}
                            placeholder={selectedInstitution?.id === 'guest' ? 'No code required' : 'Enter the access code'}
                            maxLength={20}
                            disabled={isLoading || selectedInstitution?.id === 'guest'}
                            className="uppercase tracking-widest font-mono"
                        />
                    </div>

                    {selectedInstitution && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Selected workspace</p>
                            <p className="text-white font-medium">{selectedInstitution.name}</p>
                            <p className="text-xs text-slate-500 mt-1">
                                {selectedInstitution.domain || 'Institution-specific course access'}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
                            {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        className="w-full"
                        disabled={isLoading || !selectedSchool}
                    >
                        {isLoading ? 'Verifying...' : 'Continue to Courses'}
                    </Button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-800 space-y-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                        <p className="text-sm font-semibold text-white">Why this step matters</p>
                        <p className="text-sm text-slate-400 mt-1">
                            Institution selection keeps course visibility, permissions, and reporting aligned with the right deployment workspace.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                        <p className="text-sm font-semibold text-white">Need help?</p>
                        <p className="text-sm text-slate-400 mt-1">
                            If your institution is missing or your code does not work, contact your instructor or platform support.
                        </p>
                    </div>
                </div>

                <div className="mt-6 text-center">
                    <button
                        onClick={onBack}
                        className="text-slate-600 hover:text-slate-400 text-sm transition-colors"
                    >
                        Back
                    </button>
                </div>
            </aside>
        </div>
    );
};

export default SchoolSelectView;
