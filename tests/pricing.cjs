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
 const card=title=>[...doc.querySelectorAll('.card')].find(c=>c.querySelector('h2').textContent===title);
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
 w.fetch=async()=>{throw Error('offline')};await w.loadCatalog();assert.equal(doc.querySelectorAll('.pay').length,0);
 console.log('PASS: totals, package controls, guest bounds, missing/invalid capacity, missing charter schedules, refreshed price/capacity, PayPal payload, villa attribution, pending order and catalog failure.');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});
