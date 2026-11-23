/* Vía Traslados V29.1.16: release gate validates actual successful QA run,
 * exact audited source commit and no source changes between QA and production.
 * Read-only GitHub API; no other system is altered. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const marker=readFileSync('release/VIA_V29116_QA_APPROVED','utf8');
const id=marker.match(/^QA_RUN_ID=(\d+)$/m)?.[1];
const sha=marker.match(/^QA_SOURCE_SHA=([0-9a-f]{40})$/m)?.[1];
assert(id&&sha,'Approval must specify successful QA run ID and tested source SHA');
const token=process.env.GITHUB_TOKEN,repo=process.env.GITHUB_REPOSITORY;
assert(token&&repo,'Read-only GitHub Actions token/repo missing');
const res=await fetch('https://api.github.com/repos/'+repo+'/actions/runs/'+id,{
 headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
 'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(25000)
});
assert(res.ok,'Cannot read QA workflow run '+res.status);
const qa=await res.json();
assert(qa.status==='completed'&&qa.conclusion==='success','QA run is not green');
assert(qa.head_sha===sha,'Approved source hash differs from completed QA run');
assert(qa.head_branch==='via-ui-date-map-v29116-20261123','QA run is from another branch');
assert(qa.path==='.github/workflows/via-v29116-qa.yml','Wrong QA workflow');
const changed=execFileSync('git',['diff','--name-only',sha+'..HEAD'],{encoding:'utf8'})
 .trim().split(/\r?\n/).filter(Boolean);
const allow=[
 /^release\/VIA_V29116_QA_APPROVED$/,
 /^docs\//,
 /^scripts\/via-v29116-(?:qa-proof|date-qa-ios|map-qa-ios)\.mjs$/,
 /^\.github\/workflows\/via-v29116-(?:prod|webkit-qa)\.yml$/
];
const unexpected=changed.filter(p=>!allow.some(re=>re.test(p)));
assert(unexpected.length===0,'Source changed after QA: '+unexpected.join(', '));
console.log('VIA_V29116_QA_PROOF_PASS '+JSON.stringify({
 qaRun:Number(id),testedCommit:sha,unchangedVisualSources:true,
 postQaChanges:changed,approvedRelease:true
}));
