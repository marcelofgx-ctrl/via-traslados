import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const prefix='gps-precision-build/assets/';
const reference=prefix+'reference.js',htmlFile=prefix+'index.html';
let s=await readFile(reference,'utf8');
const hash='a184e955c0d3d4f13c67f858093ae648cc54a60e218ecd6c6c84ab4d8b46868f';
assert.equal(sha(s),hash,'GPS source production changed; abort without deploying');
const anchor="gpsButton?.addEventListener('click',()=>{";
assert.equal(s.split(anchor).length,2,'GPS handler not uniquely found');
const helper=String.raw