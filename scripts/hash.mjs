import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const file=process.argv[2];
if(!file) throw Error('用法：node scripts/hash.mjs public/courses/文件.json');
console.log(createHash('sha256').update(await readFile(file)).digest('hex'));
