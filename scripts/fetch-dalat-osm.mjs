import {writeFileSync} from 'node:fs';
import { mkdirSync } from 'node:fs';
mkdirSync('artifacts', { recursive: true });
const kind = process.argv[2] || 'raw';
const tag = { raw: 'tourism', extra: 'amenity', natural: 'natural' }[kind];
if (!tag) throw new Error('Use raw, extra, or natural');
const query=`[out:json][timeout:25];nwr["name"]["${tag}"](around:20000,11.9404,108.4583);out center tags;`;
let downloaded = false;
for (const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter']) {
 try { const r=await fetch(endpoint+'?data='+encodeURIComponent(query),{headers:{'User-Agent':'DiChungStudentProject/1.0','Accept':'application/json'},signal:AbortSignal.timeout(35000)});if(!r.ok){console.log(endpoint,r.status);continue;}const d=await r.json();if (!Array.isArray(d.elements) || d.remark) throw new Error(d.remark || 'Incomplete OSM response');writeFileSync(`artifacts/dalat-osm-${kind}.json`,JSON.stringify({query,...d},null,2));console.log(d.elements.length);downloaded=true;break;}catch(e){console.log(e.message)}
}
if (!downloaded) throw new Error('No complete OSM snapshot downloaded; existing snapshot left unchanged.');
