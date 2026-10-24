import './validate.mjs';
import {cp,rm,mkdir} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
console.log('已构建：dist/（纯静态文件）');
