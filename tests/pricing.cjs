// Requires jsdom 26.1.0: NODE_PATH=<dependency directory> node tests/pricing.cjs
const {JSDOM}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const activity=(title,type,price,extra={})=>({id:title,title,pricing_type:type,base_price_usd:price,is_active:true,min_guests:1,max_guests:null,package_size:null,schedules:[{time_slot:'09:00:00'}],...extra});
const fixtures=[activity('Party Boat','per_person',55,{id:'8d727961-b436-4e2f-b72f-b398090a01d6'}),...[1,2,3].map((n,i)=>activity('Parasailing '+['Single','Double','Triple'][i],'fixed_package',[75,110,130][i],{package_size:n,min_guests:n,max_guests:n})),...[750,650,1200].map((p,i)=>activity('Deep Sea Fishing - Charter '+['4h AM','4h PM','8h'][i],'private_charter',p))];
(async()=>{
 let rows=structuredClone(fixtures),orders=[];
 const dom=new JSDOM(html,{url:'https://example.test/?ref=villa-test',runScripts:'outside-only'}),w=dom.window,doc=w.document;
 w.fetch=async(url,options)=>{
  if(url.includes('get-activity-catalog'))return {ok:true,json:async()=>({activities:structuredClone(rows)})};
  if(url.includes('create-paypal-order')){orders.push(JSON.parse(options.body));return {ok:true,text:async()=>JSON.stringify({orderID:'test-order',approvalUrl:'#approved'})}}
  throw Error('Unexpected request '+url);
 };
 w.eval(html.match(/<script>\n([\s\S]*)<\/script>/)[1]);await new Promise(setImmediate);
 const card=title=>{
  const direct=[...doc.querySelectorAll('.card')].find(c=>c.querySelector('h2').textContent===title);if(direct)return direct;
  const select=[...doc.querySelectorAll('.variant')].find(s=>[...s.options].some(o=>o.value===title));
  assert.ok(select,'Variant found: '+title);select.value=title;select.dispatchEvent(new w.Event('change'));
  return [...doc.querySelectorAll('.variant')].find(s=>s.value===title).closest('.card');
 };
 assert.equal(doc.querySelectorAll('.card').length,3);assert.equal(doc.querySelectorAll('.pic img').length,3);
 assert.equal(doc.querySelectorAll('.variant').length,2);
 assert.ok(doc.querySelector('.variant').textContent.includes('2 people fly together'));
 const setPax=(c,n)=>{c.querySelector('.pax').value=String(n);c.querySelector('.pax').dispatchEvent(new w.Event('change'))};
 const total=c=>c.querySelector('.total').textContent;
 const party=card('Party Boat');setPax(party,3);assert.equal(total(party),'Total: US$165.00');assert.equal(party.querySelector('.pax').options.length,8);
 for(const [i,name] of ['Single','Double','Triple'].entries()){
  const c=card('Parasailing '+name);assert.equal(c.querySelector('.pax').disabled,true);assert.equal(c.querySelector('.pax').value,String(i+1));assert.equal(total(c),'Total: US$'+[75,110,130][i]+'.00');assert.equal(w.pricing(fixtures[i+1],i+2),null);
 }
 for(const a of fixtures.slice(4)){
  assert.equal(card(a.title).querySelector('.book').disabled,true);
  for(const max of [null,0,-1,1.5,'oops'])assert.equal(w.pricing({...a,max_guests:max},1),null);
  for(const pax of [1,4,6])assert.equal(w.pricing({...a,max_guests:6},pax).total,a.base_price_usd);
  assert.equal(w.pricing({...a,max_guests:6},7),null);
 }
 await card('Parasailing Double').querySelector('.pay').onclick();assert.equal(orders[0].paxCount,2);assert.equal(orders[0].activityId,'Parasailing Double');assert.equal(orders[0].hostRef,'villa-test');assert.ok(orders[0].returnUrl.includes('ref=villa-test'));assert.equal(JSON.parse(w.sessionStorage.getItem('bws_pending')).orderID,'test-order');
 rows[4].max_guests=6;await w.loadCatalog();const charter=card(rows[4].title);setPax(charter,6);assert.equal(total(charter),'Total: US$750.00');assert.ok(charter.textContent.includes('Up to 6 guests'));
 rows[4].max_guests=null;await charter.querySelector('.pay').onclick();assert.equal(orders.length,1);assert.ok(doc.querySelector('#notice').textContent.includes('unavailable'));
 await w.loadCatalog();rows[0].base_price_usd=65;await card('Party Boat').querySelector('.pay').onclick();assert.equal(orders.length,1);assert.ok(doc.querySelector('#notice').textContent.includes('price has changed'));
 rows[4].max_guests=6;rows[4].schedules=[];await w.loadCatalog();assert.equal(card(rows[4].title).querySelector('.book').disabled,true);
 assert.ok(!/pricing_type|package_size|hostRef|commission|tracking/.test(doc.querySelector('#catalog').textContent));
 assert.equal(new URL(doc.querySelector('#contactGeneral').href).pathname,'/18098993790');
 for(const img of doc.querySelectorAll('.pic img')){assert.ok(fs.existsSync(img.getAttribute('src')));assert.equal(img.getAttribute('loading'),'lazy')}
 w.QRCode=function(){};w.QRCode.CorrectLevel={M:0};
 w.fetch=async()=>({ok:true,text:async()=>JSON.stringify({booking:{booking_code:'BWS-TEST-42',total_amount_usd:110,pax_count:2,activity:{title:'Parasailing Double'}}})});
 await w.loadTicket('BWS-TEST-42','order-test');
 const support=new URL(doc.querySelector('#bookingSupport').href);assert.equal(support.pathname,'/18098993790');assert.ok(support.searchParams.get('text').includes('BWS-TEST-42'));
 assert.ok(doc.querySelector('#wa').href.startsWith('https://wa.me/?text='));assert.ok(doc.querySelector('#ticket').classList.contains('show'));
 rows=structuredClone(fixtures);
 w.fetch=async(url,options)=>url.includes('get-activity-catalog')?{ok:true,json:async()=>({activities:structuredClone(rows)})}:{ok:true,text:async()=>{orders.push(JSON.parse(options.body));return JSON.stringify({orderID:'variant-order',approvalUrl:'#approved'})}};
 await w.loadCatalog();
 for(const [i,name] of ['Single','Double','Triple'].entries()){
  const c=card('Parasailing '+name);await c.querySelector('.pay').onclick();assert.equal(orders.at(-1).activityId,'Parasailing '+name);assert.equal(orders.at(-1).paxCount,i+1);
 }
 rows.slice(4).forEach((a,i)=>{a.max_guests=6;a.schedules=[{time_slot:['09:00:00','14:00:00','08:00:00'][i]}]});await w.loadCatalog();
 for(const [i,a] of rows.slice(4).entries()){
  const c=card(a.title);setPax(c,4);assert.equal(total(c),'Total: US'+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(a.base_price_usd));
  await c.querySelector('.pay').onclick();assert.equal(orders.at(-1).activityId,a.id);assert.equal(orders.at(-1).paxCount,4);assert.equal(orders.at(-1).timeSlot,['09:00','14:00','08:00'][i]);
 }
 assert.equal(doc.querySelectorAll('.card').length,3);
 w.fetch=async()=>{throw Error('offline')};await w.loadCatalog();assert.equal(doc.querySelectorAll('.pay').length,0);
 console.log('PASS: totals, package controls, guest bounds, missing/invalid capacity, missing charter schedules, refreshed price/capacity, PayPal payload, villa attribution, pending order and catalog failure.');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});
