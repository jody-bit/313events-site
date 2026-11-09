"use strict";
const assert = require("assert");
const { deriveEventRow } = require("../scripts/ra-sync");
const { promoteRaCandidates } = require("../scripts/ra-candidate-promotion");
const raw = {id:"ra-9999999",title:"ART 8 HOUSE",description:"Art and house music",startDate:"2026-11-07T15:00:00",endDate:"2026-11-08T00:00:00",venueName:"Andy Arts",address:"3000 Fenkell Ave, Detroit, MI 48238"};
assert.equal(deriveEventRow(raw,new Map()).row.category,"visual");
assert.equal(deriveEventRow({...raw,venueName:".cf0{font-family:Segoe UI;} James R. Hartman Theatre"},new Map()).row.venue_name_raw,"James R. Hartman Theatre");
(async()=>{
  const before=process.env.RA_CANDIDATE_PROMOTION_ENABLED;
  process.env.RA_CANDIDATE_PROMOTION_ENABLED="true";
  const sent=[];
  try {
    await promoteRaCandidates({SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"test",getLatestRaSessionFn:async()=>({id:"run",allNewIds:[raw.id],listingMetadata:{[raw.id]:{title:"ART 8 HOUSE",date:"2026-11-07",venueName:"<b>Andy Arts</b>"}}}),lookupExistingRowsFn:async()=>new Map(),lookupKnownSourceIdsFn:async()=>new Set(),findConservativeDuplicateFn:async()=>null,insertCandidateRowFn:async(u,k,row)=>{sent.push(row);return true;},now:new Date("2026-11-07T15:00:00Z")});
  } finally {
    if(before===undefined) delete process.env.RA_CANDIDATE_PROMOTION_ENABLED;
    else process.env.RA_CANDIDATE_PROMOTION_ENABLED=before;
  }
  assert.equal(sent.length,1);
  assert.equal(sent[0].category,"visual");
  assert.equal(sent[0].venue_name_raw,"Andy Arts");
  assert.equal(sent[0].status,"pending_review");
  assert.ok(!sent[0].venue_city_raw,"never infer a missing city");
  console.log("ok RA direct insertion and promotion policy coverage");
})().catch(e=>{console.error(e);process.exit(1);});
