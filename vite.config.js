import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [
    {
      name: 'strip-crossorigin-for-file-protocol',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin(?=[\s>])/g, '');
      }
    }
  ],
  build: {
    outDir: '../dist-ui',
    emptyOutDir: true,
    target: 'chrome130',
    sourcemap: false
  }
});

