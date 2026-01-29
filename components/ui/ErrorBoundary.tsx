import React from 'react';
import { Button } from './Button';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 * 
 * Note: This uses a wrapper pattern to work around TypeScript strict mode issues
 * with class component inheritance.
 */
class ErrorBoundaryClass extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState;
    public props!: ErrorBoundaryProps;

    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
        this.handleReset = this.handleReset.bind(this);
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        // Use inherited setState from React.Component
        (this as React.Component<ErrorBoundaryProps, ErrorBoundaryState>).setState({ errorInfo });
    }

    handleReset(): void {
        // Use inherited setState from React.Component
        (this as React.Component<ErrorBoundaryProps, ErrorBoundaryState>).setState({
            hasError: false,
            error: null,
            errorInfo: null
        });
    }

    handleReload = (): void => {
        window.location.reload();
    };

    render(): React.ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
                    <div className="glass-panel p-8 rounded-3xl max-w-md w-full text-center space-y-6">
                        {/* Error Icon */}
                        <div className="w-20 h-20 mx-auto rounded-2xl bg-red-500/20 flex items-center justify-center">
                            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>

                        {/* Message */}
                        <div>
                            <h2 className="text-xl font-bold text-white mb-2">Oops! Something went wrong</h2>
                            <p className="text-slate-400 text-sm">
                                An unexpected error occurred. Please try refreshing the page.
                            </p>
                        </div>

                        {/* Error Details (Development Only) */}
                        {import.meta.env.DEV && this.state.error && (
                            <div className="text-left p-4 bg-slate-900 rounded-xl border border-slate-800">
                                <p className="text-red-400 text-xs font-mono mb-2">
                                    {this.state.error.toString()}
                                </p>
                                {this.state.errorInfo && (
                                    <pre className="text-slate-500 text-[10px] overflow-x-auto max-h-32">
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                            <Button
                                variant="ghost"
                                onClick={this.handleReset}
                                className="flex-1"
                            >
                                Try Again
                            </Button>
                            <Button
                                variant="primary"
                                onClick={this.handleReload}
                                className="flex-1"
                            >
                                Reload Page
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Export with the expected name
export const ErrorBoundary = ErrorBoundaryClass;
export default ErrorBoundary;
