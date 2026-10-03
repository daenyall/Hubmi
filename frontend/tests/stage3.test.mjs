import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(root, 'node_modules/.cache'); mkdirSync(cache, { recursive:true });
const output = mkdtempSync(join(cache,'hubmi-stage3-tests-'));
for (const name of ['lib/supabase/config','lib/supabase/client','features/submissions/model','features/submissions/service','features/rops/access','features/rops/model','features/rops/service','features/messages/model','features/messages/service','features/auth/return-path']) {
 const dest = join(output,name+'.js'); mkdirSync(dirname(dest),{recursive:true});
 writeFileSync(dest,ts.transpileModule(readFileSync(join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
}
after(()=>rmSync(output,{recursive:true,force:true}));
const require = createRequire(import.meta.url);
const access = require(join(output,'features/rops/access.js'));
const { createRopsService } = require(join(output,'features/rops/service.js'));
const { createMessagesService } = require(join(output,'features/messages/service.js'));
const model = require(join(output,'features/messages/model.js'));
const { safeReturnPath } = require(join(output,'features/auth/return-path.js'));
const author = '11111111-1111-4111-8111-111111111111', rops = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333', msgId = '44444444-4444-4444-8444-444444444444';
const review = { id,user_id:author,title:'Fiszka testowa',problem_description:'Problem',solution_description:'Rozwiązanie',target_group:'Odbiorcy',implementation_stage:'pomysl',institution_name:null,applicant_type:'Nieokreślony',matched_innovation_id:null,status:'nowe',created_at:'2026-10-03T12:00:00Z',official_response:null };
const message = { id:msgId,submission_id:id,sender_id:author,sender_role:'applicant',sender_name:'Autor testowy',message:'Pytanie',created_at:'2026-10-03T12:00:00Z' };
const ok = data => ({data,error:null}), err = code => ({data:null,error:{code}});
const kind = expected => e => {assert.equal(e.kind,expected);return true};
function fixture(queue=[], role='rops_admin', uid=rops) {
 const calls=[]; const user=uid ? {id:uid,app_metadata: role ? {hubmi_role:role} : {},email:'x@rops.krakow.pl',user_metadata:{hubmi_role:'rops_admin'}} : null;
 const client = {auth:{getUser:async()=>{calls.push({auth:true});return {data:{user},error:null}}}, from(table) {
  const call={table,filters:[]};const q={
   select(columns){call.columns=columns;return q}, eq(k,v){call.filters.push([k,v]);return q},is(k,v){call.filters.push([k,v]);return q},
   order(k,v){(call.orders??=[]).push([k,v]);return q}, limit(n){call.limit=n;return q},abortSignal(s){call.signal=s;return q},
   insert(payload){call.insert=payload;return q},update(payload){call.update=payload;return q},single(){return q},maybeSingle(){return q},
   then(resolve,reject){calls.push(call);const next=queue.shift();if(!next)return Promise.reject(new Error('Nieoczekiwane zapytanie')).then(resolve,reject);return Promise.resolve(next).then(resolve,reject)},
  };return q;
 }};
 return { calls,client,user,rops:createRopsService(client,true),messages:createMessagesService(client,true) };
}
test('rola ROPS pochodzi wyłącznie z zaufanego app_metadata, bez domeny i user_metadata',()=>{
 assert.equal(access.roleFromVerifiedUser({app_metadata:{},email:'x@rops.krakow.pl',user_metadata:{hubmi_role:'rops_admin'}}),'applicant');
 assert.equal(access.roleFromVerifiedUser({app_metadata:{hubmi_role:'rops_admin'}}),'rops_admin');
 assert.throws(()=>access.roleFromVerifiedUser({app_metadata:{hubmi_role:'administrator'}}),kind('access'));
});
test('brak uzgodnionego kontraktu blokuje wszystkie operacje przed Auth/DB',async()=>{
 const f=fixture();const r=createRopsService(f.client,false),m=createMessagesService(f.client,false);
 await assert.rejects(r.list(),kind('configuration'));await assert.rejects(r.reply(id,'Odpowiedź',null),kind('configuration'));
 await assert.rejects(m.list(id,'author'),kind('configuration'));await assert.rejects(m.send(id,'author','Pytanie',msgId),kind('configuration'));
 assert.deepEqual(f.calls,[]);
});
test('autor z domeną ROPS i podszytym user_metadata nie odczytuje panelu',async()=>{
 const f=fixture([],null,author);await assert.rejects(f.rops.list(),kind('access'));await assert.rejects(f.rops.changeStatus(id,'zaakceptowane','nowe'),kind('access'));
 assert.ok(f.calls.every(c=>c.auth));
});
test('wygaśnięcie sesji blokuje odczyty i mutacje przed DB',async()=>{
 const f=fixture([],null,null);await assert.rejects(f.rops.get(id),kind('auth'));await assert.rejects(f.messages.send(id,'author','Pytanie',msgId),kind('auth'));assert.ok(f.calls.every(c=>c.auth));
});
test('ROPS filtruje listę tylko po statusach istniejącego kontraktu',async()=>{
 const f=fixture([ok([review])]);assert.deepEqual(await f.rops.list('nowe'),[review]);assert.deepEqual(f.calls.at(-1).filters,[['status','nowe']]);
 await assert.rejects(f.rops.list('zatwierdzone'),kind('validation'));
});
test('szczegóły ROPS odrzucają brak rekordu i rekord o innym ID',async()=>{
 await assert.rejects(fixture([ok(null)]).rops.get(id),kind('not_found'));
 await assert.rejects(fixture([ok({...review,id:msgId})]).rops.get(id),kind('response'));
});
test('zmiana statusu wysyła tylko status, kontroluje poprzednią wartość i wynik',async()=>{
 const f=fixture([ok(review),ok({...review,status:'weryfikacja'})]);const result=await f.rops.changeStatus(id,'weryfikacja','nowe');assert.equal(result.status,'weryfikacja');
 const q=f.calls.at(-1);assert.deepEqual(q.update,{status:'weryfikacja'});assert.deepEqual(q.filters,[['id',id],['status','nowe']]);
 await assert.rejects(fixture([ok(review),ok({...review,status:'odrzucone'})]).rops.changeStatus(id,'weryfikacja','nowe'),kind('response'));
});
test('oficjalna odpowiedź jest oddzielną mutacją, nie wiadomością ani zmianą statusu',async()=>{
 const f=fixture([ok(review),ok({...review,official_response:'Odpowiedź'})]);await f.rops.reply(id,' Odpowiedź ',null);
 assert.deepEqual(f.calls.at(-1).update,{official_response:'Odpowiedź'});assert.ok(!f.calls.some(c=>c.table==='submission_messages'));
 await assert.rejects(f.rops.reply(id,' \n ',null),kind('validation'));
});
test('RLS i konflikt aktualizacji nie pokazują sukcesu',async()=>{
 await assert.rejects(fixture([ok(review),err('42501')]).rops.reply(id,'Odpowiedź',null),kind('access'));
 await assert.rejects(fixture([ok(review),ok(null)]).rops.changeStatus(id,'zaakceptowane','nowe'),kind('response'));
});
test('autor odczytuje oficjalną odpowiedź tylko ze swoim filtrem właściciela',async()=>{
 const f=fixture([ok({id,user_id:author,official_response:'Stanowisko ROPS'})],null,author);assert.equal(await f.rops.ownResponse(id),'Stanowisko ROPS');
 assert.deepEqual(f.calls.at(-1).filters,[['id',id],['user_id',author]]);
 await assert.rejects(fixture([ok({id,user_id:rops,official_response:'Cudze'})],null,author).rops.ownResponse(id),kind('access'));
});
test('wiadomość nie zawiera roli, nazwy ani tożsamości do podszycia',()=>{
 assert.deepEqual(model.messagePayload(msgId,id,' Pytanie '),{id:msgId,submission_id:id,message:'Pytanie'});
 assert.ok(model.validateMessage(' \n '));assert.ok(model.validateMessage('x'.repeat(5001)));
});
test('cudzy wątek autora blokuje odczyt historii i wysłanie wiadomości',async()=>{
 const f=fixture([ok({id,user_id:rops}),ok(null)],null,author);await assert.rejects(f.messages.list(id,'author'),kind('access'));
 await assert.rejects(f.messages.send(id,'author','Pytanie',msgId),kind('access'));assert.ok(!f.calls.some(c=>c.table==='submission_messages'));
});
test('historia ma filtr wątku, porządek chronologiczny i sprawdzenie autora',async()=>{
 const f=fixture([ok({id,user_id:author}),ok([message])],null,author);assert.deepEqual(await f.messages.list(id,'author'),[message]);
 assert.deepEqual(f.calls.at(-1).filters,[['submission_id',id]]);assert.equal(f.calls.at(-1).orders[0][0],'created_at');
 for(const row of [{...message,submission_id:msgId},{...message,sender_id:rops},{...message,sender_role:'mentor'}]){
  await assert.rejects(fixture([ok({id,user_id:author}),ok([row])],null,author).messages.list(id,'author'),kind('response'));
 }
});
test('wysłanie potwierdza serwerowego nadawcę i dokładną treść',async()=>{
 const f=fixture([ok({id,user_id:author}),ok([]),ok(message)],null,author);assert.deepEqual(await f.messages.send(id,'author',' Pytanie ',msgId),message);
 assert.deepEqual(f.calls.at(-1).insert,{id:msgId,submission_id:id,message:'Pytanie'});
 const spoof=fixture([ok({id,user_id:author}),ok([]),ok({...message,sender_role:'rops_admin'})],null,author);
 await assert.rejects(spoof.messages.send(id,'author','Pytanie',msgId),kind('response'));
});
test('pracownik ROPS wysyła wiadomość dopiero po potwierdzeniu roli',async()=>{
 const row={...message,sender_id:rops,sender_role:'rops_admin',sender_name:'ROPS testowy'};
 assert.deepEqual(await fixture([ok({id,user_id:author}),ok([]),ok(row)]).messages.send(id,'rops','Pytanie',msgId),row);
 await assert.rejects(fixture([],null,author).messages.list(id,'rops'),kind('access'));
});
test('brak sender_id nie pozwala wysłać nieistniejącej kolumny ani obejść serwerowej tożsamości',async()=>{
 const f=fixture([ok({id,user_id:author}),err('42703')],null,author);await assert.rejects(f.messages.send(id,'author','Pytanie',msgId),kind('schema'));assert.ok(!f.calls.some(c=>c.insert));
});
test('retry UUID wiadomości potwierdza tylko własny rekord o identycznej treści',async()=>{
 const f=fixture([ok({id,user_id:author}),ok([]),err('23505'),ok(message)],null,author);assert.deepEqual(await f.messages.send(id,'author','Pytanie',msgId),message);
 assert.ok(f.calls.at(-1).filters.some(([k,v])=>k==='sender_id'&&v===author));
 await assert.rejects(fixture([ok({id,user_id:author}),ok([]),err('23505'),ok({...message,message:'Inna'})],null,author).messages.send(id,'author','Pytanie',msgId),kind('response'));
});
test('błąd zapisu, anulowanie i pusta treść nie stają się sukcesem',async()=>{
 const f=fixture([ok({id,user_id:author}),ok([]),err('42501')],null,author);await assert.rejects(f.messages.send(id,'author','Pytanie',msgId),kind('access'));
 const c=new AbortController();c.abort();const empty=fixture([],null,author);await assert.rejects(empty.messages.list(id,'author',c.signal),{name:'AbortError'});
 await assert.rejects(empty.messages.send(id,'author',' ',msgId),kind('validation'));assert.deepEqual(empty.calls,[]);
});
test('logowanie dopuszcza bezpieczny powrót do tras ROPS',()=>{
 assert.equal(safeReturnPath('/rops'),'/rops');assert.equal(safeReturnPath(`/rops/zgloszenia/${id}`),`/rops/zgloszenia/${id}`);
 assert.equal(safeReturnPath('//rops.evil'),'/moje-zgloszenia');
});

test('anonimowe konto Auth nie uzyskuje prywatnego dostępu nawet z polem roli ROPS',async()=>{
 const f=fixture();f.user.is_anonymous=true;
 await assert.rejects(f.rops.list(),kind('auth'));
 await assert.rejects(f.messages.send(id,'author','Pytanie',msgId),kind('auth'));
 assert.ok(f.calls.every(c=>c.auth));
});
