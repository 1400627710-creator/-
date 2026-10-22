import {defineConfig} from 'vite';
export default defineConfig({publicDir:false,build:{outDir:'.ui-build',emptyOutDir:true,lib:{entry:'ui/main.mjs',name:'CardStudioUnified',formats:['iife'],fileName:()=> 'workbench.js'},minify:true,cssCodeSplit:false}});
