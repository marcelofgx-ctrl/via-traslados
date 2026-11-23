/* Vía Traslados ADR-001: metadata-only audit. No bookings, people, coordinates,
 * tokens, OTPs or secrets are read. D1 statements are fixed PRAGMA introspection.
 * Cloudflare worker metadata accessed with GET only. No D1 schema/data writes. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Missing Cloudflare read-only audit credentials');
const api='https://api.cloudflare.com/client/v4/accounts/'+account;
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
async function cf(path,body){
 const r=await fetch(api+path,{
  method:body?'POST':'GET',
  headers:body?{...headers,'Content-Type':'application/json'}:headers,
  body:body?JSON.stringify(body):undefined,
  signal:AbortSignal.timeout(25000)
 });
 assert(r.ok,'Cloudflare metadata read failed HTTP '+r.status);
 const data=await r.json();
 assert(data.success===true,'Cloudflare metadata read rejected');
 return data.result;
}
const [databases,web,backend]=await Promise.all([
 cf('/d1/database?name=via-traslados-db'),
 cf('/workers/scripts/via-traslados-web-prod/deployments'),
 cf('/workers/scripts/via-traslados-api/deployments')
]);
const matches=databases.filter(v=>v.name==='via-traslados-db');
assert(matches.length===1,'Expected exactly one production D1');
const dbId=matches[0].uuid;
function effective(worker){
 const head=worker?.deployments?.[0];
 const versions=head?.versions||[];
 assert(versions.length===1&&Number(versions[0].percentage)===100,'Unexpected multiple Worker traffic versions');
 return versions[0].version_id;
}
const sql=['PRAGMA table_info(bookings)','PRAGMA table_info(booking_routes)',
           'PRAGMA table_info(booking_locations)'];
const metadata={};
for(const statement of sql){
 assert(/^PRAGMA table_info\([a-z_]+\)$/.test(statement),'Non-PRAGMA query blocked');
 const response=await cf('/d1/database/'+dbId+'/query',{sql:statement});
 assert(response?.[0]?.success===true,'D1 schema metadata unavailable');
 const table=statement.match(/\(([^)]+)\)/)[1];
 metadata[table]=(response[0].results||[]).map(x=>x.name);
}
const body=readFileSync('backend/worker.js','utf8');
const route=readFileSync('backend/route-estimate.js','utf8');
const uiGuard=readFileSync('.github/workflows/via-ui-visual-boundary.yml','utf8');
const store=readFileSync('tests/prod-core-invariants.mjs','utf8');
const cols=metadata.bookings;
const result={
 status:'BASELINE_UNIFIED_CONTRACT_NOT_YET_IMPLEMENTED',
 productionMetadataOnly:true,
 webWorker:effective(web),
 apiWorker:effective(backend),
 d1:{
  database:'via-traslados-db',columnsBookCount:cols.length,
  bookingsHasOriginDestinationLabels:['origin','destination'].every(v=>cols.includes(v)),
  bookingsCoordinateColumns:['origin_lat','origin_lng','destination_lat','destination_lng']
    .filter(v=>cols.includes(v)),
  bookingLocationsPresent:metadata.booking_locations.length>0,
  routesCachePresent:metadata.booking_routes.length>0
 },
 repositoryContracts:{
  bookingValidationKeepsOnlyLabels:body.includes('origin:clean(p.origin')&&
    !body.slice(body.indexOf('export function validateBooking'),body.indexOf('const publicRow')).includes('originLocation'),
  publicRoutePreviewReadsOnlyLabels:route.includes('const origin=trim(body?.origin),destination=trim(body?.destination)'),
  browserSmokeHasOneFixedRoute:store.includes('distance-shangrila-airport'),
  visualGuardPRMainOnly:uiGuard.includes('pull_request:')&&uiGuard.includes('branches: [main]')
 },
 action:'DO NOT DEPLOY architectural fixes until API/D1 isolated E2E QA is implemented'
};
console.log('VIA_ARCHITECTURE_PHASE0_METADATA_READONLY '+JSON.stringify(result));
assert(result.d1.bookingsHasOriginDestinationLabels,'Unexpected production D1 schema; review before any changes');
assert(result.d1.routesCachePresent,'Current production D1 route table missing; stop and inspect');
console.log('VIA_ARCHITECTURE_AUDIT_READONLY_COMPLETE');
