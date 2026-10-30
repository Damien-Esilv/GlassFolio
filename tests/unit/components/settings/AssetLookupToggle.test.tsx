import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../../src/i18n';
import { AssetLookupToggle } from '../../../../src/components/settings/AssetLookupToggle';
import { isAssetLookupEnabled, setAssetLookupEnabled } from '../../../../src/services/assetClassifier';

describe('AssetLookupToggle', () => {
  beforeEach(() => localStorage.clear());

  it('shows the device preference and flips it', () => {
    setAssetLookupEnabled(true);
    render(<AssetLookupToggle />);
    const toggle = screen.getByRole('switch', { name: 'Recognise assets automatically' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(isAssetLookupEnabled()).toBe(false);
    fireEvent.click(toggle);
    expect(isAssetLookupEnabled()).toBe(true);
  });
});
