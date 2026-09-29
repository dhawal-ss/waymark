export interface SeedPreset {
  id: string;
  label: string;
  hex: string;
}

export const SEED_PRESETS: readonly SeedPreset[] = [
  { id: 'teal', label: 'Teal', hex: '#14b8a6' },
  { id: 'indigo', label: 'Indigo', hex: '#4f46e5' },
  { id: 'coral', label: 'Coral', hex: '#f0654f' },
  { id: 'forest', label: 'Forest', hex: '#2e7d32' },
  { id: 'marigold', label: 'Marigold', hex: '#eaa221' },
  { id: 'rose', label: 'Rose', hex: '#e0457b' },
];

export const DEFAULT_SEED = '#14b8a6';
