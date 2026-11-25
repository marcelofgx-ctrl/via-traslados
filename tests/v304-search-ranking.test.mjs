import test from 'node:test';
import assert from 'node:assert/strict';
import {viaRank,viaKm,viaDistanceLabel} from '../addons/v304-search-ranking.mjs';
const p={lat:-34.85,lng:-56.02},near={name:'Costa Urbana Shopping',kind:'place',lat:-34.86,lng:-56.02},far={...near,lat:-34.92},street={street:'COSTA RICA',lat:-34.851,lng:-56.02};
test('exact POI first, unrelated street excluded, proximity within same relevance',()=>{assert.deepEqual(viaRank('Costa urbana',[street,far,near],p),[near,far]);assert.deepEqual(viaRank('Costa urbana',[street,far,near],p,true),[street,far,near]);assert.deepEqual(viaRank('Costa urbana',[far,near],null),[far,near]);});
test('distance calculated locally and invalid coordinates omitted',()=>{assert(Math.abs(viaKm(p,near)-1.112)<.01);assert.equal(viaKm(p,{lat:null,lng:null}),null);assert.equal(viaDistanceLabel(null),'');assert.equal(viaDistanceLabel(.23),'≈ 230 m');assert.equal(viaDistanceLabel(1.23),'≈ 1,2 km')});
