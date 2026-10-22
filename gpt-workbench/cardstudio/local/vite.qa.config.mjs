import {defineConfig} from 'vite';
export default defineConfig({publicDir:false,build:{outDir:'.local-qa-build',emptyOutDir:true,lib:{entry:'local/self-check.mjs',name:'CardStudioLocalCheck',formats:['iife'],fileName:()=> 'check.js'},minify:true,target:'esnext'}});
