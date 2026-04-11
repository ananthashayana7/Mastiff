import { describe, expect, it } from 'vitest';

import { computeAdaptiveViewportProfile } from '../src/lib/adaptiveViewport';

describe('adaptive viewport profile', () => {
  it('shrinks dense compact laptop layouts slightly', () => {
    const profile = computeAdaptiveViewportProfile({
      width: 1366,
      height: 768,
      devicePixelRatio: 1.75,
    });

    expect(profile.density).toBe('compact');
    expect(profile.zoom).toBeLessThan(1);
  });

  it('expands roomy low-density monitor layouts slightly', () => {
    const profile = computeAdaptiveViewportProfile({
      width: 2560,
      height: 1440,
      devicePixelRatio: 1,
    });

    expect(profile.density).toBe('roomy');
    expect(profile.zoom).toBeGreaterThan(1);
  });
});
