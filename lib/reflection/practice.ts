export interface Practice {
    id: string;
    submissionId: string;
    createdAt: number;
    answerId: string;
    original: string;
    prompt: string;
    text: string;
    audio?: Blob;
}

type Operation = 'load' | 'save' | 'delete';

function access(operation: Operation, submissionId: string, item?: Practice): Promise<Practice[]> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open('speakwise-reflection', 1);
        open.onupgradeneeded = () => {
            const store = open.result.createObjectStore('practice', { keyPath: 'id' });
            store.createIndex('submissionId', 'submissionId');
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('practice', operation === 'load' ? 'readonly' : 'readwrite');
            const store = tx.objectStore('practice');
            if (operation === 'save' && item) store.put(item);
            if (operation === 'delete' && item) store.delete(item.id);
            const list = store.index('submissionId').getAll(submissionId);
            tx.oncomplete = () => {
                db.close();
                resolve((list.result as Practice[]).sort((a,b) => b.createdAt - a.createdAt));
            };
            tx.onabort = () => { db.close(); reject(tx.error || new Error('Practice storage unavailable')); };
        };
    });
}
export const readPractice = (id: string) => access('load', id);
export const savePractice = (item: Practice) => access('save', item.submissionId, item);
export const removePractice = (item: Practice) => access('delete', item.submissionId, item);
