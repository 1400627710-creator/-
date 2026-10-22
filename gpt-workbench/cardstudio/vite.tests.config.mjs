import {defineConfig} from 'vite';import {resolve} from 'node:path';
export default defineConfig({publicDir:false,resolve:{alias:{'cloudflare:workers':resolve('tests/runtime-env.mjs')}},build:{ssr:'tests/service-entry.ts',outDir:'.test-build',emptyOutDir:true,rollupOptions:{external:['node:sqlite','node:fs'],output:{entryFileNames:'service.js'}},minify:false}});
