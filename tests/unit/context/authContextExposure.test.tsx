import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/i18n';
import { AuthProvider, useAuth } from '../../../src/context/AuthContext';

/** Pages destructure these from useAuth(): a function missing from the provider value only fails at runtime. */
describe('AuthProvider value', () => {
    it('exposes the functions the Google callback page relies on', () => {
        let exposed: ReturnType<typeof useAuth> | undefined;
        const Probe: React.FC = () => {
            exposed = useAuth();
            return null;
        };
        render(
            <MemoryRouter>
                <AuthProvider>
                    <Probe />
                </AuthProvider>
            </MemoryRouter>
        );
        expect(typeof exposed?.loadUserFromRepo).toBe('function');
        expect(typeof exposed?.handleGoogleCallback).toBe('function');
        expect(typeof exposed?.cancelSecondFactor).toBe('function');
    });
});
