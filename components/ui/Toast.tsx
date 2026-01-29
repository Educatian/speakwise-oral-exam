import React, { useState, useEffect, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
    id: string;
    message: string;
    type?: ToastType;
    duration?: number;
    onDismiss: (id: string) => void;
}

interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
    duration: number;
}

/**
 * Individual Toast Component
 */
const Toast: React.FC<ToastProps> = ({
    id,
    message,
    type = 'info',
    duration = 4000,
    onDismiss
}) => {
    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => onDismiss(id), duration);
            return () => clearTimeout(timer);
        }
    }, [id, duration, onDismiss]);

    const iconMap = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    const colorMap = {
        success: 'toast-success',
        error: 'toast-error',
        warning: 'toast-warning',
        info: 'toast-info'
    };

    return (
        <div
            className={`toast ${colorMap[type]}`}
            role="alert"
            aria-live="polite"
            aria-atomic="true"
        >
            <span className="toast-icon" aria-hidden="true">{iconMap[type]}</span>
            <span className="toast-message">{message}</span>
            <button
                className="toast-dismiss"
                onClick={() => onDismiss(id)}
                aria-label="Dismiss notification"
            >
                ✕
            </button>
        </div>
    );
};

/**
 * Toast Container - Manages multiple toasts
 */
export const ToastContainer: React.FC<{ toasts: ToastItem[]; onDismiss: (id: string) => void }> = ({
    toasts,
    onDismiss
}) => {
    if (toasts.length === 0) return null;

    return (
        <div
            className="toast-container"
            aria-label="Notifications"
            role="region"
        >
            {toasts.map(toast => (
                <Toast
                    key={toast.id}
                    id={toast.id}
                    message={toast.message}
                    type={toast.type}
                    duration={toast.duration}
                    onDismiss={onDismiss}
                />
            ))}
        </div>
    );
};

/**
 * useToast Hook - Easy toast management
 */
export function useToast() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const addToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setToasts(prev => [...prev, { id, message, type, duration }]);
        return id;
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const success = useCallback((message: string, duration?: number) =>
        addToast(message, 'success', duration), [addToast]);

    const error = useCallback((message: string, duration?: number) =>
        addToast(message, 'error', duration), [addToast]);

    const warning = useCallback((message: string, duration?: number) =>
        addToast(message, 'warning', duration), [addToast]);

    const info = useCallback((message: string, duration?: number) =>
        addToast(message, 'info', duration), [addToast]);

    return {
        toasts,
        addToast,
        dismissToast,
        success,
        error,
        warning,
        info,
        ToastContainer: () => <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    };
}

export default Toast;
