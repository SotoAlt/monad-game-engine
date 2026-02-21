import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Privy-only packages — DON'T assign a manual chunk; let Rollup split them
// naturally via the dynamic import('./PrivyBridge.jsx') boundary.
// Forcing them into a named chunk causes circular deps with 'vendor'.
const PRIVY_ONLY = [
  '@privy-io', 'viem', '@walletconnect', 'wagmi', '@base-org/account', '/ox/',
];

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  esbuild: mode === 'production' ? {
    drop: ['debugger'],
    pure: ['console.log', 'console.warn', 'console.error', 'console.info', 'console.debug', 'console.table', 'console.group', 'console.groupEnd'],
  } : {},
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('three')) return 'vendor-three';
          // Let Privy deps land in the lazy chunk created by dynamic import
          if (PRIVY_ONLY.some(pkg => id.includes(pkg))) return;
          return 'vendor';
        },
      },
    },
  },
}));
