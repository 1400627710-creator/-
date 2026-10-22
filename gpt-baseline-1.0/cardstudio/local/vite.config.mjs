import {defineConfig} from 'vite';
export default defineConfig({publicDir:false,build:{outDir:'.local-build',emptyOutDir:true,lib:{entry:'local/main.mjs',name:'CardStudioLocal',formats:['iife'],fileName:()=> 'local.js'},minify:true,cssCodeSplit:false}});
