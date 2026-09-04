import assert from 'node:assert/strict';
import { writeStateRow } from '../functions/api/_store.js';
const env={SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'};
let revision=4;
globalThis.fetch=async(url,options)=>{
 assert.equal(options.method,'PATCH');
 const expected=Number(new URL(url).searchParams.get('revision').slice(3));
 if(expected!==revision)return Response.json([]);
 revision=JSON.parse(options.body).revision;
 return Response.json([{revision}]);
};
const results=await Promise.allSettled([writeStateRow(env,{revision:5},4),writeStateRow(env,{revision:5},4)]);
assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
await writeStateRow(env,{revision:6},5);
assert.equal(revision,6);
console.log('Conditional store writes: stale writes rejected, fresh retry accepted. No network used.');
