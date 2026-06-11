
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ui';
import { validateEnv } from './lib/utils/validateEnv';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

/**
 * Minimal configuration-error screen. Rendered INSTEAD of the app when a
 * production build is missing required environment variables — silently
 * booting into localStorage-only mode would scatter submissions across
 * devices while looking like success. Deliberately inline-styled so it does
 * not depend on the app stylesheet, and deliberately free of secrets (it
 * names which variables are missing, never their values).
 */
const ConfigErrorScreen: React.FC<{ missing: string[] }> = ({ missing }) => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#020617',
      color: '#e2e8f0',
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: '24px'
    }}
  >
    <div
      style={{
        maxWidth: '480px',
        width: '100%',
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid #334155',
        borderRadius: '24px',
        padding: '40px 32px',
        textAlign: 'center'
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          margin: '0 auto 20px',
          borderRadius: '50%',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px'
        }}
        aria-hidden="true"
      >
        &#9881;
      </div>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', margin: '0 0 12px' }}>
        SpeakWise is not configured yet
      </h1>
      <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#94a3b8', margin: '0 0 16px' }}>
        This deployment is missing required server configuration, so the platform
        cannot start safely. No student data has been affected.
      </p>
      <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px' }}>
        Missing environment variable{missing.length !== 1 ? 's' : ''}:
      </p>
      <code
        style={{
          display: 'inline-block',
          fontSize: '12px',
          color: '#fbbf24',
          backgroundColor: 'rgba(2, 6, 23, 0.6)',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '8px 12px'
        }}
      >
        {missing.join(', ')}
      </code>
      <p style={{ fontSize: '12px', color: '#64748b', margin: '20px 0 0' }}>
        If you are a student or instructor, please contact your administrator.
      </p>
    </div>
  </div>
);

const root = ReactDOM.createRoot(rootElement);

// Fail closed in production: a misconfigured build must not silently run in
// localStorage-only mode (data never centralizes — see validateEnv). In dev
// validateEnv only warns and the app boots normally.
const envCheck = validateEnv();
if (import.meta.env.PROD && !envCheck.isValid) {
  root.render(
    <React.StrictMode>
      <ConfigErrorScreen missing={envCheck.missing} />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
