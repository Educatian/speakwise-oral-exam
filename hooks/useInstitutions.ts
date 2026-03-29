import { useCallback, useEffect, useState } from 'react';
import { Institution } from '../types';
import { getInstitutions, validateInstitutionAccessCode } from '../lib/supabase';

interface UseInstitutionsReturn {
    institutions: Institution[];
    loading: boolean;
    validateAccessCode: (institutionId: string, accessCode: string) => Promise<Institution | null>;
}

export function useInstitutions(): UseInstitutionsReturn {
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadInstitutions() {
            setLoading(true);
            try {
                const availableInstitutions = await getInstitutions();
                setInstitutions(availableInstitutions);
            } catch (error) {
                console.error('Failed to load institutions:', error);
                setInstitutions([]);
            } finally {
                setLoading(false);
            }
        }

        loadInstitutions();
    }, []);

    const validateAccessCode = useCallback(async (institutionId: string, accessCode: string) => {
        return validateInstitutionAccessCode(institutionId, accessCode);
    }, []);

    return {
        institutions,
        loading,
        validateAccessCode
    };
}

export default useInstitutions;
