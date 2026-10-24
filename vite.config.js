import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// jsoneditor is loaded on demand; listing it avoids a dev-server re-optimisation on first use.
export default defineConfig({ plugins: [react()], optimizeDeps: { include: ['jsoneditor'] } });
