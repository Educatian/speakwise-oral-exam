export const MIC_PERMISSION_TIMEOUT_MS = 20_000;

interface MicrophoneRequestOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}

/** getUserMedia cannot be cancelled, so stop any stream granted after cancellation. */
export function requestMicrophone(
    constraints: MediaStreamConstraints,
    { signal, timeoutMs = MIC_PERMISSION_TIMEOUT_MS }: MicrophoneRequestOptions = {}
): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const release = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        };
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            release();
            reject(error);
        };
        const abort = () => fail(new DOMException('Microphone request cancelled.', 'AbortError'));
        if (signal?.aborted) {
            abort();
            return;
        }
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => fail(new DOMException(
            'Microphone permission timed out. Allow microphone access in your browser, then retry.',
            'TimeoutError'
        )), timeoutMs);
        try {
            navigator.mediaDevices.getUserMedia(constraints).then(stream => {
                if (settled) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                settled = true;
                release();
                resolve(stream);
            }, fail);
        } catch (error) {
            fail(error);
        }
    });
}

export function microphoneErrorMessage(error: unknown): string {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'TimeoutError') return 'Microphone permission timed out. Allow microphone access in your browser, then retry.';
    if (name === 'NotAllowedError') return 'Microphone access denied. Please allow microphone access in your browser and retry.';
    if (name === 'NotFoundError') return 'No microphone found. Please connect a microphone and retry.';
    if (name === 'NotReadableError') return 'Microphone is unavailable. Close other apps using it and retry.';
    return 'Could not start microphone audio. Check your microphone and browser permissions, then retry.';
}
