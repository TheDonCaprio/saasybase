import { describe, expect, it } from 'vitest';
import { shouldDisableLandingDemoTilt } from '@/lib/landing-demo-tilt';

describe('shouldDisableLandingDemoTilt', () => {
  it('disables tilt for older macOS Safari', () => {
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15';

    expect(shouldDisableLandingDemoTilt(userAgent)).toBe(true);
  });

  it('disables tilt for Safari 17 on macOS', () => {
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_7_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';

    expect(shouldDisableLandingDemoTilt(userAgent)).toBe(true);
  });

  it('keeps tilt enabled for Safari 18 on macOS', () => {
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_7_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15';

    expect(shouldDisableLandingDemoTilt(userAgent)).toBe(false);
  });

  it('keeps tilt enabled for iPad Safari', () => {
    const userAgent = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

    expect(shouldDisableLandingDemoTilt(userAgent)).toBe(false);
  });

  it('keeps tilt enabled for Chrome on macOS', () => {
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

    expect(shouldDisableLandingDemoTilt(userAgent)).toBe(false);
  });
});