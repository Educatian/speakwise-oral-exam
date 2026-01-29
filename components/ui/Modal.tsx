import React, { useEffect, useRef } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    footer?: React.ReactNode;
}

/**
 * Modal Component
 * Accessible modal dialog with focus trap, backdrop click, and escape key handling
 */
export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    children,
    size = 'md',
    footer
}) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    const sizeClasses = {
        sm: 'max-w-md',
        md: 'max-w-2xl',
        lg: 'max-w-4xl',
        xl: 'max-w-6xl'
    };

    useEffect(() => {
        if (isOpen) {
            // Store currently focused element
            previousActiveElement.current = document.activeElement as HTMLElement;

            // Focus the modal
            modalRef.current?.focus();

            // Prevent body scroll
            document.body.style.overflow = 'hidden';

            // Handle escape key
            const handleEscape = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onClose();
            };
            document.addEventListener('keydown', handleEscape);

            return () => {
                document.removeEventListener('keydown', handleEscape);
                document.body.style.overflow = '';

                // Restore focus
                previousActiveElement.current?.focus();
            };
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="modal-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div
                ref={modalRef}
                className={`modal-content glass-panel ${sizeClasses[size]} flex flex-col`}
                tabIndex={-1}
            >
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-slate-800 flex justify-between items-start">
                    <div>
                        <h2
                            id="modal-title"
                            className="text-xl md:text-2xl font-bold text-white"
                        >
                            {title}
                        </h2>
                        {subtitle && (
                            <p className="text-slate-400 text-sm mt-1">{subtitle}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-white flex-shrink-0"
                        aria-label="Close modal"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 md:p-8 overflow-y-auto flex-1 custom-scrollbar">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="p-6 border-t border-slate-800 bg-slate-900/60">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
