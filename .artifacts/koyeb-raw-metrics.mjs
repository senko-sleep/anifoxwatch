import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import YAML from 'yaml';
const config=YAML.parse(readFileSync(homedir()+'/.koyeb.yaml','utf8'));
const base=new URL(config.url || 'https://app.koyeb.com');
if(base.protocol!=='https:' || base.hostname!=='app.koyeb.com') throw new Error('Unexpected Koyeb API host');
const instanceId=process.argv[2] || '9d5b1017-780c-5a10-2145-928e3a531680';
const start=process.argv[3] || '2026-10-14T02:36:00Z';
const end=process.argv[4] || '2026-10-14T02:38:00Z';
const replies=await Promise.all(['CPU_TOTAL_PERCENT','MEM_RSS','HTTP_RESPONSE_TIME_MAX'].map(async name=>{
 const url=new URL('/v1/streams/metrics',base);
 url.search=new URLSearchParams({name,instance_id:instanceId,start,end,step:'1m'});
 const response=await fetch(url,{headers:{Authorization:'Bearer '+config.token},signal:AbortSignal.timeout(10000)});
 const reply=await response.json();
 return {name,status:response.status,reply};
}));
writeFileSync('.artifacts/koyeb-raw-instance-metrics-'+instanceId+'.json',JSON.stringify({instanceId,start,end,queriedAt:new Date().toISOString(),replies},null,2));
console.log(JSON.stringify(replies,null,2));
