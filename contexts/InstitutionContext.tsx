import React, { createContext, useContext, useMemo } from 'react';
import { Institution } from '../types';
import { useInstitutions } from '../hooks';

/**
 * App-wide institution directory.
 *
 * Wraps the existing `useInstitutions` hook exactly ONCE at the app root so
 * the institution list is fetched a single time and shared by the header,
 * auth/school-select views, and the manager dashboard (previously drilled as
 * `institutions` / `validateInstitutionAccessCode` props).
 */
interface InstitutionContextValue {
    institutions: Institution[];
    loading: boolean;
    validateAccessCode: (institutionId: string, accessCode: string) => Promise<Institution | null>;
}

const InstitutionContext = createContext<InstitutionContextValue | null>(null);

export const InstitutionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { institutions, loading, validateAccessCode } = useInstitutions();

    const value = useMemo<InstitutionContextValue>(() => ({
        institutions,
        loading,
        validateAccessCode
    }), [institutions, loading, validateAccessCode]);

    return <InstitutionContext.Provider value={value}>{children}</InstitutionContext.Provider>;
};

/** Access the app-wide institution directory. Must be used inside <InstitutionProvider>. */
export function useInstitutionContext(): InstitutionContextValue {
    const ctx = useContext(InstitutionContext);
    if (!ctx) {
        throw new Error('useInstitutionContext must be used within an <InstitutionProvider>. Wrap your component tree (see App.tsx).');
    }
    return ctx;
}

export default InstitutionContext;
