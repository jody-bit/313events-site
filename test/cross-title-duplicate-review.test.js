"use strict";
const assert = require("assert");
const {planConsolidation} = require("../scripts/duplicate-consolidation");
const description = "WHERE ART MEETS BEAT Get ready for an electrifying event fusing visual art house music enticing cuisine and nonstop energy Experience powerful artwork immersive visuals and a high energy dance floor talented house music DJs";
const a={id:"ra",title:"ART 8 HOUSE",start_date:"2026-11-07",end_date:"2026-11-08",time_display:"3:00 PM–12:00 AM",status:"approved",source:"Resident Advisor",venue_name_raw:"Andy Arts",venue_address_raw:"3000 Fenkell Ave",venue_city_raw:"Detroit",description};
const b={...a,id:"vd",title:"Art & House Music Event",source:"VisitDetroit",venue_name_raw:"ANDY ARTS CENTER",end_date:null,time_display:"3:00 PM – 11:59 PM",description:"ART 8 HOUSE "+description};
let plan=planConsolidation([a,b]);
assert.equal(plan.merges.length,0);
assert.equal(plan.reviews.length,1);
for (const patch of [
  {start_date:"2026-11-08"},{time_display:"7:00 PM"},{time_display:null},
  {venue_address_raw:"3100 Fenkell Ave"},{venue_city_raw:"Chicago"},
  {description:"Art and music"},{status:"rejected"},
  {internal_note:"DUP_DISTINCT | v1 | other=ra"},
]) assert.equal(planConsolidation([a,{...b,...patch}]).reviews.length,0,JSON.stringify(patch));
console.log("ok cross-title candidates are review-only");
