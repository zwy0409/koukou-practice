import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {courseProgress,freshState,grade} from '../public/js/core.js';
const {courses}=JSON.parse(await readFile(new URL('../public/courses/builtin-v2.json',import.meta.url)));
test('第一次答对立即增加已练句数，跨三次到期复习后才增加掌握数',()=>{
  const course=courses[0],id=course.sentences[0].id;
  let state=grade(freshState(),courses,id,true,'2026-10-24');
  assert.deepEqual(courseProgress(state,course),{total:10,practiced:1,mastered:0});
  assert.equal(state.items[id].streak,1);
  state=grade(state,courses,id,true,'2026-10-25');
  assert.equal(state.items[id].streak,2);assert.equal(courseProgress(state,course).mastered,0);
  state=grade(state,courses,id,true,'2026-10-28');
  assert.equal(state.items[id].streak,3);assert.deepEqual(courseProgress(state,course),{total:10,practiced:1,mastered:1});
});
test('答错也记为已练，只统计本课程里的题目',()=>{
  let state=grade(freshState(),courses,'dont-01',false,'2026-10-24');
  state=grade(state,courses,'not-01',true,'2026-10-24');
  assert.deepEqual(courseProgress(state,courses[0]),{total:10,practiced:1,mastered:0});
});
