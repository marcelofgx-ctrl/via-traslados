import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/create-wrangler.mjs',import.meta.url));
const base={VIA_D1_DATABASE_ID:'123e4567-e89b-12d3-a456-426614174000',VIA_RESEND_FROM:'Vía Traslados <reservas@ejemplo.com>'};
function run(overrides={}){return spawnSync(process.execPath,[script],{env:{...process.env,...base,...overrides},encoding:'utf8',cwd:'/tmp'})}
test('producción rechaza origen QA de Vercel',()=>{const r=run({VIA_PUBLIC_ORIGIN:'https://via-traslados-inicial.vercel.app/'});assert.notEqual(r.status,0);assert.match(r.stderr,/nunca Vercel QA/)});
test('producción requiere origen HTTPS',()=>{const r=run({VIA_PUBLIC_ORIGIN:'http://via.example/'});assert.notEqual(r.status,0);assert.match(r.stderr,/VIA_PUBLIC_ORIGIN/)});
test('producción requiere UUID D1 válido',()=>{const r=run({VIA_D1_DATABASE_ID:'not-a-uuid',VIA_PUBLIC_ORIGIN:'https://via.example/'});assert.notEqual(r.status,0);assert.match(r.stderr,/VIA_D1_DATABASE_ID/)});
test('producción requiere remitente definido',()=>{const r=run({VIA_RESEND_FROM:'reservas',VIA_PUBLIC_ORIGIN:'https://via.example/'});assert.notEqual(r.status,0);assert.match(r.stderr,/VIA_RESEND_FROM/)});
