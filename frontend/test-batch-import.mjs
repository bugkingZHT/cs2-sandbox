import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hash: '#' + 'b'.repeat(64) };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
let library = [], requestCount = 0, importCount = 0, nextSkipped = [], nextDuplicates = [];
const uploaded = [];
globalThis.fetch = async (url, init) => {
  requestCount++;
  assert.equal(init.headers['X-Local-Token'], 'b'.repeat(64));
  if (url === '/api/library') return Response.json(library);
  if (url === '/api/rename') {
    const body = JSON.parse(init.body);
    assert.ok(body.alias_name);
    const st = library.find(s => s.id === body.id);
    st.alias_name = body.alias_name;
    return Response.json(st);
  }
  if (url === '/api/import') {
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], undefined, 'browser owns multipart boundary');
    assert.ok(init.body instanceof FormData);
    const files = init.body.getAll('files');
    uploaded.push(...files.map(f => f.name));
    importCount++;
    const items = files.map((file, i) => ({id: `${importCount}-${i}`, name: file.name.endsWith('.zip') ? 'nested.dem' : file.name, uploadName: file.name.endsWith('.zip') ? file.name : '', status: 'queued', message: '等待解析', progress: 0, rounds: [], meta: null}));
    library.push(...items);
    return Response.json({items, skipped: nextSkipped, duplicates: nextDuplicates});
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
  const repeated = mergeImportFiles(first.files,[duplicate,sameNameNewFile]);
  assert.deepEqual(repeated.files,[dem,zip]);
  assert.deepEqual(repeated.duplicates,['one.DEM','one.DEM']);
  const known = mergeImportFiles([], [sameNameNewFile,zip], ['one.DEM']);
  assert.deepEqual(known.files,[zip]);
  assert.deepEqual(known.parsed,['one.DEM']);
  assert.equal(mergeImportFiles([], [dem], ['one.dem']).files.length,1,'filenames are compared exactly');

  const { useReplayData } = await server.ssrLoadModule('/src/composables/useReplayData.ts');
  const data = useReplayData();
  await data.waitForInitialLoad();
  const initialRequests = requestCount;
  await assert.rejects(data.parseDemo([]));
  assert.equal(requestCount,initialRequests,'empty selection must not send a request');
  await data.parseDemo([dem,zip]);
  assert.equal(data.parsing.value,true);
  assert.equal(data.replayList.value.length,2);
  assert.equal(data.replayList.value[1].alias_name,'one');
  await data.renameDemo('1-0','我的比赛');
  assert.equal(data.replayList.value.find(s=>s.id==='1-0').alias_name,'我的比赛');
  assert.equal(data.replayList.value.find(s=>s.id==='1-0').fileName,'one');
  assert.ok(data.knownImportNames.value.includes('one.DEM'));
  assert.ok(data.knownImportNames.value.includes('batch.zip'));
  assert.ok(!data.knownImportNames.value.includes('我的比赛'));
  nextSkipped = ['already.dem']; nextDuplicates = ['twice.dem'];
  const report = await data.parseDemo([sameNameNewFile]);
  assert.deepEqual(report,{skipped:['already.dem'],duplicates:['twice.dem']});
  nextSkipped = []; nextDuplicates = [];
  assert.equal(importCount,2,'must allow adding another batch while parsing');
  assert.deepEqual(uploaded,['one.DEM','batch.zip','one.DEM']);
  library[0].status = 'ready'; library[0].progress = 100;
  // ZIP children are already queued independently in the import response.
  library.find(s=>s.id==='1-1').status = 'parsing';
  library.find(s=>s.id==='1-1').progress = 37;
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(data.replayList.value.find(s=>s.id==='1-0').status,1,'earlier completion must be refreshed');
  assert.equal(data.replayList.value.find(s=>s.id==='1-1').parsingProgress,37);
  assert.equal(data.replayList.value.some(s=>s.fileName==='batch.zip'),false);
  assert.equal(data.parsing.value,true);
  for (const st of library) { st.status='error'; st.message='bad demo'; }
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(data.parsing.value,false);
  assert.ok(data.replayList.value.every(s=>s.status===-1));
  assert.deepEqual(data.knownImportNames.value,[],'failed files can be retried');
  // A drained queue can start a fresh polling loop.
  await data.parseDemo([dem]);
  assert.equal(data.parsing.value,true);
  for (const st of library) st.status='ready';
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(data.parsing.value,false);
  console.log('PASS: multi-file selection/drop accumulation, validation, multipart transport, enqueue while busy, ZIP expansion updates and queue polling restart');
} finally { await server.close(); }
