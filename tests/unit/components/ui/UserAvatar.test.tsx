import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserAvatar } from '../../../../components/ui/UserAvatar';

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
});
