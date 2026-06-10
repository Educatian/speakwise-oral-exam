/**
 * Client-side document → plain-text extraction for the course-builder's
 * "Knowledge Source" upload. Supports TXT, DOCX (mammoth) and PDF (pdf.js).
 *
 * PDF text is extracted from the embedded text layer. Scanned/image-only PDFs
 * have no text layer and will yield an empty string — callers should surface a
 * helpful message rather than treating empty as failure.
 */
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a hashed URL and copies the worker into the bundle.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function isSupportedDocument(file: File): boolean {
    const name = file.name.toLowerCase();
    return (
        file.type === 'text/plain' ||
        file.type === 'application/pdf' ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        name.endsWith('.txt') ||
        name.endsWith('.pdf') ||
        name.endsWith('.docx')
    );
}

/** Extract readable text from a single uploaded document. May return '' for
 *  image-only PDFs (no selectable text layer). */
export async function extractDocumentText(file: File): Promise<string> {
    const name = file.name.toLowerCase();

    if (file.type === 'text/plain' || name.endsWith('.txt')) {
        return (await file.text()).trim();
    }

    if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        name.endsWith('.docx')
    ) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return (result.value || '').trim();
    }

    if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
        return extractPdfText(file);
    }

    throw new Error(`Unsupported file type: ${file.name}`);
}

async function extractPdfText(file: File): Promise<string> {
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: string[] = [];
    try {
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const strings = content.items.map((item: any) =>
                item && typeof item.str === 'string' ? item.str : ''
            );
            pages.push(strings.join(' '));
        }
    } finally {
        try { await pdf.cleanup(); } catch { /* no-op */ }
        try { pdf.destroy(); } catch { /* no-op */ }
    }
    return pages.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
}
