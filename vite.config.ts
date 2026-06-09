import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

// Dev-only mirror of public/_worker.js so `npm run dev` has the same /api/*
// proxy endpoints. Keys are read from .env.local and stay server-side (Node) —
// they are never sent to the browser.
function devApiProxy(env: Record<string, string>) {
    const readBody = (req: any): Promise<string> =>
        new Promise((resolve) => {
            let b = '';
            req.on('data', (c: any) => (b += c));
            req.on('end', () => resolve(b));
        });
    return {
        name: 'speakwise-dev-api-proxy',
        configureServer(server: any) {
            server.middlewares.use(async (req: any, res: any, next: any) => {
                const url: string = req.url || '';
                try {
                    if (url.startsWith('/api/llm')) {
                        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
                        const key = env.OPENROUTER_API_KEY || env.VITE_OPENROUTER_API_KEY;
                        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'SpeakWise' },
                            body: await readBody(req)
                        });
                        res.statusCode = r.status;
                        res.setHeader('Content-Type', 'application/json');
                        return res.end(await r.text());
                    }
                    if (url.startsWith('/api/gemini-token')) {
                        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
                        const r = await fetch(`https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${env.GEMINI_API_KEY}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ uses: 1 })
                        });
                        const data: any = await r.json();
                        res.statusCode = r.ok ? 200 : r.status;
                        res.setHeader('Content-Type', 'application/json');
                        return res.end(JSON.stringify(r.ok ? { token: data.name } : { error: data }));
                    }
                } catch (e: any) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ error: String(e?.message || e) }));
                }
                next();
            });
        }
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
        server: { port: 3000, host: '0.0.0.0' },
        plugins: [react(), devApiProxy(env)],
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (!id.includes('node_modules')) return undefined;
                        if (id.includes('@supabase')) return 'supabase-vendor';
                        if (id.includes('@google/genai')) return 'gemini-vendor';
                        if (id.includes('mammoth')) return 'document-vendor';
                        if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor';
                        return 'vendor';
                    }
                }
            }
        },
        // NOTE: API keys are intentionally NOT defined into the client bundle.
        // They live server-side (Pages env vars / dev proxy) behind /api/*.
        resolve: { alias: { '@': path.resolve(__dirname, '.') } }
    };
});
