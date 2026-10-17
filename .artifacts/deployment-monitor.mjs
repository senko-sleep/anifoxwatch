import { appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import YAML from 'yaml';
import { setTimeout as delay } from 'node:timers/promises';
const target = process.argv[2] || '9307e260-0234-4e7a-b36c-6247baa1bc5c';
const activation = process.argv[3] || null;
const config=YAML.parse(readFileSync(homedir()+'/.koyeb.yaml','utf8'));
const service = 'poor-marne/anifoxwatch';
const api = 'https://poor-marne-sssssenko-05a416b4.koyeb.app';
const output = '.artifacts/production-memory-monitor.jsonl';
const stop = '.artifacts/production-memory-monitor.stop';
const started = Date.now();
let previous = null;
let nextMetrics = 0;
let activatedAt = null;
let metricsStartAt = null;
function cli(...args) {
 const raw=execFileSync('C:/Users/Owner/.koyeb-cli/koyeb.exe', [...args, '--output', 'json'], {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']});
 try { return JSON.parse(raw); } catch { return raw.trim().split(/\r?\n/).map(line=>JSON.parse(line)); }
}
for(let n=0; n<180 && !existsSync(stop); n++) {
 const sample = {timestamp:new Date().toISOString(),targetDeploymentId:target};
 try {
  const current=cli('services','get',service);
  const deployment=cli('deployments','get',target);
  Object.assign(sample,{activeDeploymentId:current.active_deployment_id,latestDeploymentId:current.latest_deployment_id,deploymentStatus:deployment.status,messages:deployment.messages});
  if(current.active_deployment_id===target && deployment.status==='HEALTHY') {
   const instances=cli('instances','list').instances.filter(x=>x.xyz_deployment_id===target);
   if(!activatedAt) {
     activatedAt=new Date().toISOString();
     metricsStartAt=activation || instances[0].created_at;
     sample.activationObservedAt=activatedAt;
   }
   sample.instanceIds=instances.map(x=>x.id);
   sample.instanceCreatedAt=instances[0].created_at;
   const before=performance.now();
   const health=await fetch(api+'/health',{signal:AbortSignal.timeout(5000)});
   sample.healthStatus=health.status;
   sample.health=await health.json();
   sample.healthLatencyMs=performance.now()-before;
   const cpu=sample.health?.resources?.node?.cpuMicroseconds;
   if(cpu && previous) sample.nodeCpuPercent=100*((cpu.user+cpu.system)-(previous.cpu.user+previous.cpu.system))/((performance.now()-previous.at)*1000);
   if(cpu) previous={cpu,at:performance.now()};
   if(Date.now()>=nextMetrics) {
    const metrics=await Promise.all(['CPU_TOTAL_PERCENT','MEM_RSS'].map(async name=>{
      const url=new URL('/v1/streams/metrics','https://app.koyeb.com');
      url.search=new URLSearchParams({name,instance_id:instances[0].id,start:metricsStartAt,end:new Date().toISOString(),step:'1m'});
      const response=await fetch(url,{headers:{Authorization:'Bearer '+config.token},signal:AbortSignal.timeout(10000)});
      return {name,status:response.status,reply:await response.json()};
    }));
    writeFileSync('.artifacts/koyeb-metrics-released-'+target+'.json',JSON.stringify({targetDeploymentId:target,activationObservedAt:activatedAt,metricsStartAt,queriedAt:new Date().toISOString(),metrics},null,2));
    nextMetrics=Date.now()+300000;
   }
  }
 } catch(e) { sample.error=String(e.message); }
 appendFileSync(output,JSON.stringify(sample)+'\n');
 const resources=sample.health?.resources;
 console.log(JSON.stringify({timestamp:sample.timestamp,status:sample.deploymentStatus,active:sample.activeDeploymentId===target,latencyMs:sample.healthLatencyMs,nodeRss:resources?.node?.rss,container:resources?.container,error:sample.error}));
 await delay(20000);
}
