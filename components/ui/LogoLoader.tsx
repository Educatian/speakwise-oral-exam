import React from 'react';

/**
 * Brand loading animation: the SpeakWise logo breathing inside a spinning
 * brand-gradient ring (emerald → cyan → indigo). Used for app-level loading
 * and route Suspense fallbacks.
 */
export const LogoLoader: React.FC<{ label?: string; className?: string }> = ({
    label = 'Loading…',
    className = ''
}) => (
    <div className={`flex flex-col items-center justify-center gap-5 ${className}`} role="status" aria-live="polite">
        <div className="sw-loader">
            <div className="sw-loader__ring" aria-hidden="true" />
            <img src="/logo.png" alt="" className="sw-loader__logo" />
        </div>
        {label && <p className="text-slate-500 text-sm tracking-wide animate-pulse">{label}</p>}
    </div>
);

export default LogoLoader;
