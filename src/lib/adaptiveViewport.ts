export interface AdaptiveViewportInput {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface AdaptiveViewportProfile {
  zoom: number;
  density: 'compact' | 'balanced' | 'roomy';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeAdaptiveViewportProfile(input: AdaptiveViewportInput): AdaptiveViewportProfile {
  const width = Number.isFinite(input.width) ? Math.max(320, input.width) : 1280;
  const height = Number.isFinite(input.height) ? Math.max(480, input.height) : 800;
  const devicePixelRatio = Number.isFinite(input.devicePixelRatio) ? Math.max(1, input.devicePixelRatio) : 1;
  const area = width * height;

  let zoom = 1;

  if (width >= 2050 || area >= 2600000) {
    zoom += 0.1;
  } else if (width >= 1700 || area >= 2000000) {
    zoom += 0.06;
  } else if (width >= 1450 || area >= 1600000) {
    zoom += 0.03;
  }

  if (devicePixelRatio <= 1.15) {
    zoom += 0.04;
  } else if (devicePixelRatio >= 1.8 && width <= 1500) {
    zoom -= 0.03;
  }

  if (width <= 1280 || height <= 820) {
    zoom -= 0.06;
  } else if (width <= 1440 || height <= 900) {
    zoom -= 0.02;
  }

  const normalizedZoom = Number(clamp(Number(zoom.toFixed(2)), 0.9, 1.14).toFixed(2));
  const density = normalizedZoom < 0.98 ? 'compact' : normalizedZoom > 1.04 ? 'roomy' : 'balanced';

  return {
    zoom: normalizedZoom,
    density,
  };
}
