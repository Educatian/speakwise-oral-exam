import { supabase } from '../supabase/client';

export async function sessionHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sign in before starting an AI session.');
    return { Authorization: `Bearer ${session.access_token}` };
}
