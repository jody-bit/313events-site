'use strict';
const assert = require('assert');
const fs = require('fs');
const root = process.env.REPO_DIR || process.cwd();
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
delete process.env.RESEND_API_KEY;
const handler = require(root + '/api/submit.js');
const base = {title:'A public concert',category:'music',startDate:'2027-01-29',venue:'New venue',orgName:'Organizer',contactEmail:'owner@example.com',elapsedMs:5000,addressFormat:'structured'};
let inserted;
global.fetch = async (url, opts={}) => {
 if (url.includes('/rest/v1/venues')) return {ok:true,json:async()=>[]};
 if (url.includes('/rest/v1/events') && opts.method==='POST') { inserted=JSON.parse(opts.body);return {ok:true,json:async()=>[{id:'new-event'}]}; }
 throw new Error('Unexpected request '+url);
};
async function send(fields){ inserted=null;const res={status(n){this.code=n;return this},json(v){this.body=v;return this}};await handler({method:'POST',body:{...base,...fields},headers:{}},res);return res; }
(async()=>{
 let r=await send({address:'1501 Holden St',city:' Detroit ',region:'MI',postalCode:'48208',country:'US'});
 assert.equal(r.code,201);assert.equal(inserted.venue_city_raw,'Detroit');assert.equal(inserted.venue_address_raw,'1501 Holden St, Detroit, MI 48208, United States');assert.equal(inserted.status,'pending_review');
 r=await send({address:'138 University Avenue West',city:'Windsor',region:'Ontario',postalCode:'n9a5p4',country:'CA'});
 assert.equal(r.code,201);assert.equal(inserted.venue_city_raw,'Windsor');assert.equal(inserted.venue_address_raw,'138 University Avenue West, Windsor, Ontario N9A 5P4, Canada');
 for (const fields of [{country:'CA',region:'Ontario',postalCode:'48202'},{country:'US',city:'Detroit',region:'MI',postalCode:'N9A5P4'},{country:'US',city:'Detroit'},{country:'XX',city:'Windsor',region:'ON'}]) {r=await send(fields);assert.equal(r.code,400);assert.equal(inserted,null);}
 r=await send({venueTba:true,country:'CA'});assert.equal(r.code,201);assert.equal(inserted.venue_city_raw,null);assert.match(inserted.venue_name_raw,/address TBA/);
 r=await send({addressFormat:undefined,address:'1501 Holden St, Detroit, MI'});assert.equal(r.code,201);assert.equal(inserted.venue_city_raw,'Detroit');
 const html=fs.readFileSync(root+'/submit.html','utf8');for(const id of ['city','region','postalCode','country']) {assert(html.includes('id="'+id+'"'));assert(html.includes("data.get('"+id+"')"));}assert(!html.includes('placeholder="e.g. 1501 Holden St, Detroit, MI"'));
 console.log('PASS: real submission handler preserves separate US/Canadian city, formatted address, postal validation, TBA and legacy clients; form sends each explicit field');
})().catch(e=>{console.error(e);process.exitCode=1});
