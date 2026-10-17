import {execFileSync} from 'node:child_process';
import {appendFileSync,existsSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const argumentsOnly=process.argv.slice(2).filter(x=>!x.startsWith('--'));
const deploymentId=argumentsOnly[0] || '4ee279ca-48f1-403e-baa6-326474d3a8a8';
const expectedInstance=argumentsOnly[1] || '5175ae72-e5ac-6364-8ba7-55e119047044';
const stop='.artifacts/cgroup-process-monitor.stop';
const command='cat /sys/fs/cgroup/memory/memory.usage_in_bytes /sys/fs/cgroup/memory/memory.max_usage_in_bytes /sys/fs/cgroup/memory/memory.limit_in_bytes /sys/fs/cgroup/memory/memory.failcnt; cat /proc/self/cgroup; cat /proc/[0-9]*/status';
for(let n=0;n<45 && !existsSync(stop);n++) {
 const sample={timestamp:new Date().toISOString(),deploymentId,expectedInstance};
 try {
  const raw=execFileSync('C:/Users/Owner/.koyeb-cli/koyeb.exe',['services','exec','poor-marne/anifoxwatch','sh','--','-c',command],{encoding:'utf8',timeout:15000,stdio:['inherit','pipe','pipe']});
  const clean=raw.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
  const nums=clean.match(/^\d+\r?$/gm)?.slice(0,4).map(Number);
  sample.cgroup=nums?{currentBytes:nums[0],peakBytes:nums[1],limitBytes:nums[2],failcnt:nums[3]}:null;
  sample.instanceConfirmed=clean.includes(expectedInstance.replaceAll('-','_').slice(0,17));
  sample.processes=clean.split(/(?=Name:\s)/).filter(x=>x.startsWith('Name:')).map(s=>({name:s.match(/^Name:\s*([^\r\n]+)/)?.[1],pid:Number(s.match(/^Pid:\s*(\d+)/m)?.[1]),ppid:Number(s.match(/^PPid:\s*(\d+)/m)?.[1]),rssKiB:Number(s.match(/^VmRSS:\s*(\d+)/m)?.[1]||0),threads:Number(s.match(/^Threads:\s*(\d+)/m)?.[1]||0)}));
  sample.chromiumCount=sample.processes.filter(p=>/chrome|chromium/i.test(p.name)).length;
 } catch(e) {sample.error=String(e.message);}
 appendFileSync('.artifacts/cgroup-process-monitor.jsonl',JSON.stringify(sample)+'\n');
 console.log(JSON.stringify(sample));
 if(process.argv.includes('--once'))break;
 await delay(120000);
}
