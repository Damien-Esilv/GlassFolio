import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserAvatar, isValidAvatarUrl } from '../../../../src/components/ui/UserAvatar';

describe('<UserAvatar />', () => {
  it('renders initials when no avatar is provided', () => {
    render(<UserAvatar name="Damien B" email="damien@example.com" size="sm" />);
    expect(screen.getByText('DB')).toBeDefined();
  });

  it('renders initials from single word name or email fallback', () => {
    render(<UserAvatar name="Investor" />);
    expect(screen.getByText('IN')).toBeDefined();
  });

  it('renders image when avatar url is valid', () => {
    render(<UserAvatar name="Demo User" avatar="/avatars/demo-user.jpg" />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('/avatars/demo-user.jpg');
  });

  it('ignores pravatar URLs and falls back to clean initials', () => {
    render(<UserAvatar name="Legacy User" avatar="https://i.pravatar.cc/150?u=legacy" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('LU')).toBeDefined();
  });

  it('falls back to initials if image errors out', () => {
    render(<UserAvatar name="Alice Smith" avatar="https://example.com/broken.jpg" />);
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('AS')).toBeDefined();
  });

  describe('avatar source allow-list (CodeQL js/xss-through-dom)', () => {
    it.each([
      '/avatars/demo-user.jpg',
      'https://lh3.googleusercontent.com/a/photo=s96-c',
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/jpeg;base64,/9j/4AAQ',
      'blob:http://localhost:3000/1234',
    ])('accepts %s', (url) => expect(isValidAvatarUrl(url)).toBe(true));

    it.each([
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'http://example.com/a.png',
      '//evil.example/a.png',
      'ftp://example.com/a.png',
      '   ',
    ])('rejects %s', (url) => expect(isValidAvatarUrl(url)).toBe(false));

    it('falls back to initials for a disallowed source', () => {
      render(<UserAvatar name="Eve Mallory" avatar="javascript:alert(1)" />);
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.getByText('EM')).toBeDefined();
    });
  });
});
