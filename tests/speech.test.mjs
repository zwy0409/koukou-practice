import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseEnglishVoice} from '../public/js/speech.js';

const remote={name:'Online US',lang:'en-US',localService:false};
const localUS={name:'Local US',lang:'en-US',localService:true};
const localGB={name:'Local GB',lang:'en-GB',localService:true};
test('本地英语优先于列表中的在线美式语音',()=>{
  assert.equal(chooseEnglishVoice([remote,localGB]),localGB);
  assert.equal(chooseEnglishVoice([remote,localGB,localUS]),localUS);
});
test('离线不选择在线语音，没有英语本地语音则明确返回空',()=>{
  assert.equal(chooseEnglishVoice([remote],true),null);
  assert.equal(chooseEnglishVoice([remote,localGB],true),localGB);
  assert.equal(chooseEnglishVoice([{lang:'zh-CN',localService:true}],true),null);
});
test('联网可回退在线英语，空列表交给系统默认引擎',()=>{
  assert.equal(chooseEnglishVoice([remote]),remote);
  assert.equal(chooseEnglishVoice([]),null);
});
