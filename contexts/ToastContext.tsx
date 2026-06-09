import React, { createContext, useContext } from 'react';
import { useToast } from '../components/ui';

/**
 * App-wide toast notifications.
 *
 * The existing `useToast` hook is component-local; this context lifts it to the
 * app root so any view can raise a calm, non-blocking notification instead of a
 * native `alert()` (which violates the "calm / academic atmosphere" principle).
 *
 * Usage:
 *   const toast = useToastContext();
 *   toast.warning('Instructor access requires an approved account');
 */

type ToastApi = Pick<ReturnType<typeof useToast>, 'success' | 'error' | 'warning' | 'info' | 'addToast' | 'dismissToast'>;

const ToastContext = createContext<ToastApi | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { success, error, warning, info, addToast, dismissToast, ToastContainer } = useToast();
  return (
    <ToastContext.Provider value={{ success, error, warning, info, addToast, dismissToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

/**
 * Access the app-wide toast API. Falls back to a no-op-with-console shim if used
 * outside the provider, so a stray call can never crash a view.
 */
export function useToastContext(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  const noop = (message: string) => {
    if (typeof console !== 'undefined') console.warn('[toast: no provider]', message);
    return '';
  };
  return { success: noop, error: noop, warning: noop, info: noop, addToast: noop, dismissToast: () => {} };
}

export default ToastContext;
