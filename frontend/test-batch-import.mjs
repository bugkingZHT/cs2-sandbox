import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hash: '#' + 'b'.repeat(64) };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
let library = [], requestCount = 0, importCount = 0;
const uploaded = [];
globalThis.fetch = async (url, init) => {
  requestCount++;
  assert.equal(init.headers['X-Local-Token'], 'b'.repeat(64));
  if (url === '/api/library') return Response.json(library);
  if (url === '/api/import') {
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], undefined, 'browser owns multipart boundary');
    assert.ok(init.body instanceof FormData);
    const files = init.body.getAll('files');
    uploaded.push(...files.map(f => f.name));
    importCount++;
    const items = files.map((file, i) => ({id: `${importCount}-${i}`, name: file.name, status: 'queued', message: '等待解析', progress: 0, rounds: [], meta: null}));
    library.push(...items);
    return Response.json({items});
  }
  throw new Error('Unexpected URL: ' + url);
};
const server = await createServer({configFile:'vite.local.config.ts',server:{middlewareMode:true},appType:'custom'});
try {
  const { mergeImportFiles } = await server.ssrLoadModule('/src/local/importFiles.ts');
  const dem = new File(['dem'], 'one.DEM', {lastModified:1});
  const zip = new File(['zip'], 'batch.zip', {lastModified:2});
  const other = new File(['x'], 'notes.txt');
  const first = mergeImportFiles([], [dem,zip,other]);
  assert.deepEqual(first.files,[dem,zip]);
  assert.deepEqual(first.rejected,['notes.txt']);
  const duplicate = new File(['dem'], 'one.DEM', {lastModified:1});
  const sameNameNewFile = new File(['different'], 'one.DEM', {lastModified:3});
  assert.deepEqual(mergeImportFiles(first.files,[duplicate,sameNameNewFile]).files,[dem,zip,sameNameNewFile]);

  const { useReplayData } = await server.ssrLoadModule('/src/composables/useReplayData.ts');
  const data = useReplayData();
  await data.waitForInitialLoad();
  const initialRequests = requestCount;
  await assert.rejects(data.parseDemo([]));
  assert.equal(requestCount,initialRequests,'empty selection must not send a request');
  await data.parseDemo([dem,zip]);
  assert.equal(data.parsing.value,true);
  assert.equal(data.replayList.value.length,2);
  await data.parseDemo([sameNameNewFile]);
  assert.equal(importCount,2,'must allow adding another batch while parsing');
  assert.deepEqual(uploaded,['one.DEM','batch.zip','one.DEM']);
  library[0].status = 'ready'; library[0].progress = 100;
  // ZIP is replaced with independently queued Demo entries between polls.
  library = library.filter(s=>s.name!=='batch.zip');
  library.push({id:'extracted',name:'nested.dem',status:'parsing',message:'读取帧',progress:37,rounds:[],meta:null});
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(data.replayList.value.find(s=>s.id==='1-0').status,1,'earlier completion must be refreshed');
  assert.equal(data.replayList.value.find(s=>s.id==='extracted').parsingProgress,37);
  assert.equal(data.replayList.value.some(s=>s.fileName==='batch.zip'),false);
  assert.equal(data.parsing.value,true);
  for (const st of library) { st.status='error'; st.message='bad demo'; }
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(data.parsing.value,false);
  assert.ok(data.replayList.value.every(s=>s.status===-1));
  // A drained queue can start a fresh polling loop.
  await data.parseDemo([dem]);
  assert.equal(data.parsing.value,true);
  for (const st of library) st.status='ready';
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(data.parsing.value,false);
  console.log('PASS: multi-file selection/drop accumulation, validation, multipart transport, enqueue while busy, ZIP expansion updates and queue polling restart');
} finally { await server.close(); }
