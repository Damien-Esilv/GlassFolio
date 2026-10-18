import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { ScrollToTop } from '../../../components/ui/ScrollToTop';

describe('<ScrollToTop />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  it('calls window.scrollTo with top: 0 and behavior: "instant" on initial mount', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <ScrollToTop />
        <div>Page Content</div>
      </MemoryRouter>
    );

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
  });

  it('calls window.scrollTo upon route pathname transition', () => {
    const TestComponent = () => (
      <div>
        <ScrollToTop />
        <Link to="/welcome/legal">Go to Legal</Link>
        <Routes>
          <Route path="/welcome" element={<div>Welcome Page</div>} />
          <Route path="/welcome/legal" element={<div>Legal Page</div>} />
        </Routes>
      </div>
    );

    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <TestComponent />
      </MemoryRouter>
    );

    expect(window.scrollTo).toHaveBeenCalledTimes(1);

    const link = screen.getByText('Go to Legal');
    fireEvent.click(link);

    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(window.scrollTo).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
  });
});
