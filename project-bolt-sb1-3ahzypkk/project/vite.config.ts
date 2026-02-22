import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // Adding base ensures assets are found even when nested in subfolders
  base: './', 
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // Ensure the build process respects the production URL
  define: {
    'process.env': {}
  }
});
