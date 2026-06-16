import type { RegistrySnapshot } from './registry';

const snapshot: RegistrySnapshot = {
  version: '1.0.0',
  bundledVersion: '2026-06-15',
  components: {
    Button: {
      allowedProps: ['variant', 'size', 'asChild'],
      disallowedProps: ['className'],
    },
    Badge: {
      allowedProps: ['variant'],
      disallowedProps: ['className'],
    },
    Card: {
      allowedProps: [],
      disallowedProps: ['className'],
    },
    Input: {
      allowedProps: ['type', 'placeholder', 'disabled'],
      disallowedProps: ['className'],
    },
    Avatar: {
      allowedProps: [],
      disallowedProps: ['className'],
    },
  },
};

export default snapshot;
