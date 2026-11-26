import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../public/_worker.js';

afterEach(() => vi.unstubAllGlobals());
const env = { SUPABASE_URL: 'https://auth.example.test', SUPABASE_ANON_KEY: 'public-test-key', OPENROUTER_API_KEY: 'local-placeholder', GEMINI_API_KEY: 'local-placeholder' };
describe('AI session verification', () => {
  for (const route of ['/api/llm', '/api/gemini-token']) {
    it(`requires a verified user for ${route}`, async () => {
      const fetchMock = vi.fn();vi.stubGlobal('fetch', fetchMock);
      expect((await worker.fetch(new Request(`https://app.example.test${route}`, { method: 'POST' }), env)).status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
      expect((await worker.fetch(new Request(`https://app.example.test${route}`, { method: 'POST', headers: { Authorization: 'Bearer test-token' } }), env)).status).toBe(401);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it(`forwards requests after verification for ${route}`, async () => {
      const fetchMock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'test-user' }))).mockResolvedValueOnce(new Response('{}'));
      vi.stubGlobal('fetch', fetchMock);
      expect((await worker.fetch(new Request(`https://app.example.test${route}`, { method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: '{}' }), env)).status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][1].headers.Authorization).not.toBe('Bearer test-token');
    });
  }
});
