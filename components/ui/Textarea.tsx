import React, { forwardRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    helperText?: string;
}

/**
 * Textarea Component
 * Accessible textarea with label, error, and helper text support
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
    label,
    error,
    helperText,
    id,
    className = '',
    ...props
}, ref) => {
    const inputId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = helperText ? `${inputId}-helper` : undefined;

    return (
        <div className="w-full">
            {label && (
                <label
                    htmlFor={inputId}
                    className="block text-sm font-medium text-slate-300 mb-2"
                >
                    {label}
                </label>
            )}
            <textarea
                ref={ref}
                id={inputId}
                className={`input textarea ${error ? 'input-error' : ''} ${className}`}
                aria-invalid={!!error}
                aria-describedby={[errorId, helperId].filter(Boolean).join(' ') || undefined}
                {...props}
            />
            {error && (
                <p
                    id={errorId}
                    className="mt-2 text-sm text-red-400 flex items-center gap-1"
                    role="alert"
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {error}
                </p>
            )}
            {helperText && !error && (
                <p
                    id={helperId}
                    className="mt-2 text-xs text-slate-500"
                >
                    {helperText}
                </p>
            )}
        </div>
    );
});

Textarea.displayName = 'Textarea';

export default Textarea;
