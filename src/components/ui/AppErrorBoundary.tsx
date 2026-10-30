import React from 'react';
import i18n from '../../i18n';

interface AppErrorBoundaryState {
    failed: boolean;
}

/**
 * Last-resort screen when rendering fails (e.g. a page's code could not be loaded after a new
 * deployment): a message and a reload instead of a blank page.
 */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, AppErrorBoundaryState> {
    // The project's React typings do not declare `props` on class components
    declare readonly props: Readonly<{ children: React.ReactNode }>;
    state: AppErrorBoundaryState = { failed: false };

    static getDerivedStateFromError(): AppErrorBoundaryState {
        return { failed: true };
    }

    componentDidCatch(error: unknown): void {
        console.error('[app] Rendering failed', error);
    }

    render(): React.ReactNode {
        if (!this.state.failed) return this.props.children;
        return (
            <div role="alert" className="min-h-screen bg-canvas flex items-center justify-center p-6">
                <div className="max-w-sm w-full bg-card border border-subtle rounded-2xl p-6 text-center space-y-4">
                    <h1 className="text-lg font-bold text-primary">{i18n.t('common:errors.appCrashTitle')}</h1>
                    <p className="text-sm text-secondary">{i18n.t('common:errors.appCrashDescription')}</p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="w-full py-2.5 rounded-xl bg-primary text-inverted font-semibold text-sm hover:opacity-90"
                    >
                        {i18n.t('common:errors.appCrashReload')}
                    </button>
                </div>
            </div>
        );
    }
}
