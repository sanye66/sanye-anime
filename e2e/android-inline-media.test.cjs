const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('../sanye_client/node_modules/typescript');
function setup(read){const calls=[],cancel=[];class Base{constructor(){this.stats={aborted:false,loading:{start:0,first:0,end:0}}}abort(){}destroy(){}}
const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('sanye_client/src/platform/android/inlineMediaLoader.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:()=>({Capacitor:{isNativePlatform:()=>true,isPluginAvailable:()=>true},registerPlugin:()=>({read(o){calls.push(o);return read(o)},async cancel(o){cancel.push(o)}})}),URL,Error,performance,setTimeout,clearTimeout,atob,Uint8Array,TextDecoder,Date});return {Loader:module.exports.inlineMediaLoader({DefaultConfig:{loader:Base}},{Referer:'https://example.org/'}),calls,cancel,prewarm:module.exports.prewarmInlineManifest,create:headers=>module.exports.inlineMediaLoader({DefaultConfig:{loader:Base}},headers)}}
const value={data:Buffer.from('#EXTM3U').toString('base64'),url:'https://media.example.org/a',status:200};const tick=()=>new Promise(r=>setImmediate(r));
test('大分片字节转换保持零字节与高位字节，不能改写视频载荷',async()=>{
  const bytes=Buffer.alloc(2*1024*1024);for(let i=0;i<bytes.length;i++)bytes[i]=i%256;
  const f=setup(async()=>({...value,data:bytes.toString('base64')})),l=new f.Loader();let result;
  l.load({url:value.url,responseType:'arraybuffer'},{timeout:1000},{onSuccess:r=>result=r,onError:assert.fail});
  await tick();assert.deepEqual(Buffer.from(result.data),bytes);assert.equal(l.stats.loaded,bytes.length);l.destroy();
});
test('普通分片零范围不发送 Range，保留防盗链头并返回媒体字节',async()=>{const f=setup(async()=>value),l=new f.Loader();let result;l.load({url:value.url,responseType:'arraybuffer',rangeStart:0,rangeEnd:0},{timeout:1000},{onSuccess:r=>result=r,onError:assert.fail});await tick();assert.equal(f.calls[0].rangeStart,undefined);assert.equal(f.calls[0].headers.Referer,'https://example.org/');assert.equal(Buffer.from(result.data).toString(),'#EXTM3U');l.destroy()});
test('有效字节范围保留闭开区间；清单返回文本',async()=>{const f=setup(async()=>value),l=new f.Loader();let result;l.load({url:value.url,responseType:'text',rangeStart:5,rangeEnd:10},{timeout:1000},{onSuccess:r=>result=r});await tick();assert.equal(f.calls[0].rangeStart,5);assert.equal(f.calls[0].rangeEnd,10);assert.equal(result.data,'#EXTM3U');l.destroy()});
test('取消后晚到结果不能污染新播放器',async()=>{let resolve;const f=setup(()=>new Promise(r=>resolve=r)),l=new f.Loader();let delivered=false;l.load({url:value.url},{timeout:1000},{onSuccess:()=>delivered=true});l.abort();resolve(value);await tick();assert.equal(delivered,false);assert.equal(f.cancel.length,1)});
test('网络失败交给 HLS 错误回调而不是静默挂起',async()=>{const f=setup(async()=>{throw new Error('403')}),l=new f.Loader();let error;l.load({url:value.url},{timeout:1000},{onError:e=>error=e});await tick();assert.match(error.text,/403/);l.destroy()});


test('清单预热与正式加载共享读取，只预热子清单且请求头隔离',async()=>{let resolve;const f=setup(()=>new Promise(r=>resolve=r));const warm=f.prewarm(value.url,{Referer:'https://example.org/'});const l=new f.Loader();let response;l.load({url:value.url,responseType:'text'},{timeout:1000},{onSuccess:r=>response=r});assert.equal(f.calls.length,1);resolve(value);await warm;await tick();assert.equal(response.data,'#EXTM3U');const Other=f.create({Referer:'https://other.example.org/'}),other=new Other();other.load({url:value.url,responseType:'text'},{timeout:1000},{onSuccess:()=>{}});assert.equal(f.calls.length,2);resolve(value);await tick();l.destroy();other.destroy()});
test('失败清单和直播列表不能粘在缓存里，正常重试再次读取',async()=>{const f=setup(async()=>({...value,data:Buffer.from('<html>error</html>').toString('base64')}));await f.prewarm(value.url);await f.prewarm(value.url);assert.equal(f.calls.length,2);const live=setup(async()=>({...value,data:Buffer.from('#EXTM3U\n#EXTINF:6\na.ts').toString('base64')}));await live.prewarm(value.url);await live.prewarm(value.url);assert.equal(live.calls.length,2)});
test('已完成分片销毁不再发取消，重复中止只取消一次原生读取',async()=>{
  const done=setup(async()=>value),loader=new done.Loader();
  loader.load({url:value.url,responseType:'arraybuffer'},{timeout:1000},{onSuccess:()=>{}});await tick();loader.destroy();
  assert.equal(done.cancel.length,0);
  let resolve;const pending=setup(()=>new Promise(r=>resolve=r)),other=new pending.Loader();
  other.load({url:value.url,responseType:'arraybuffer'},{timeout:1000},{onSuccess:assert.fail});other.abort();other.abort();other.destroy();
  resolve(value);await tick();assert.equal(pending.cancel.length,1);
});
