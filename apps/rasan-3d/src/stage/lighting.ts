// Lighting presets: soft studio rigs. Each is data so scenes can name one or override it.

export interface LightDef {
  key: { position: [number, number, number]; intensity: number; color: string };
  fill: { position: [number, number, number]; intensity: number; color: string };
  rim: { position: [number, number, number]; intensity: number; color: string };
  ambient: number;
  envIntensity: number;
  /** Softbox panels baked into the environment map: [x, y, z, w, h, intensity, color] */
  softboxes: [number, number, number, number, number, number, string][];
  shadowOpacity: number;
  exposure: number;
}

export const LIGHTING: Record<string, LightDef> = {
  studio: {
    key: { position: [-2.5, 7, 6], intensity: 1.2, color: '#fff4e6' },
    fill: { position: [5, 2.5, 4], intensity: 0.7, color: '#fff3e0' },
    rim: { position: [2, 4, -5], intensity: 0.7, color: '#fff2dc' },
    ambient: 0.1,
    envIntensity: 1.35,
    softboxes: [
      [-4, 5, 4, 6, 4, 2.2, '#fff6ea'],
      [5, 2, 3, 3, 5, 0.8, '#eef2ff'],
      [0, 6, -4, 8, 2, 1.2, '#ffffff'],
      [0, -3, 3, 10, 2, 0.6, '#ffe9c4'],
      [-6, 1, 0, 3, 6, 0.6, '#fff4e6'],
    ],
    shadowOpacity: 0.34,
    exposure: 1.15,
  },
  warm: {
    key: { position: [-3, 5, 5], intensity: 2.4, color: '#ffe2b8' },
    fill: { position: [5, 2, 3], intensity: 0.4, color: '#ffd9c2' },
    rim: { position: [3, 4, -5], intensity: 1.8, color: '#ffc98a' },
    ambient: 0.1,
    envIntensity: 0.8,
    softboxes: [
      [-4, 5, 4, 6, 4, 2.0, '#ffe7c7'],
      [5, 2, 3, 3, 5, 0.6, '#ffe0cc'],
      [0, 6, -4, 8, 2, 1.4, '#ffd29a'],
    ],
    shadowOpacity: 0.48,
    exposure: 1.0,
  },
  cool: {
    key: { position: [-3, 6, 5], intensity: 2.0, color: '#eef3ff' },
    fill: { position: [5, 2, 4], intensity: 0.7, color: '#dfe8ff' },
    rim: { position: [2, 4, -5], intensity: 1.6, color: '#cfe0ff' },
    ambient: 0.14,
    envIntensity: 0.95,
    softboxes: [
      [-4, 5, 4, 6, 4, 2.0, '#f2f6ff'],
      [5, 2, 3, 3, 5, 0.9, '#e6eeff'],
      [0, 6, -4, 8, 2, 1.2, '#ffffff'],
    ],
    shadowOpacity: 0.38,
    exposure: 1.0,
  },
  dramatic: {
    key: { position: [-5, 5, 2.5], intensity: 3.0, color: '#fff1de' },
    fill: { position: [5, 1, 4], intensity: 0.15, color: '#d8e0ff' },
    rim: { position: [3, 5, -4], intensity: 2.6, color: '#ffe7c2' },
    ambient: 0.04,
    envIntensity: 0.45,
    softboxes: [
      [-5, 5, 2, 4, 4, 2.4, '#fff3e2'],
      [3, 5, -5, 6, 2, 1.6, '#ffffff'],
    ],
    shadowOpacity: 0.55,
    exposure: 0.95,
  },
};

export type LightingName = keyof typeof LIGHTING;
