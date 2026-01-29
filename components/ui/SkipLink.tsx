import React from 'react';

/**
 * SkipLink Component
 * Accessibility feature for keyboard users to skip navigation
 * Only visible on focus for screen readers and keyboard navigation
 */
export const SkipLink: React.FC = () => {
    return (
        <a
            href="#main-content"
            className="skip-link"
            aria-label="Skip to main content"
        >
            Skip to main content
        </a>
    );
};

export default SkipLink;
