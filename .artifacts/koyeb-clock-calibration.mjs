const out=[];
for(let i=0;i<3;i++){
 const sent=Date.now();
 const r=await fetch('https://poor-marne-sssssenko-05a416b4.koyeb.app/health',{signal:AbortSignal.timeout(5000)});
 const h=await r.json();
 const received=Date.now();
 out.push({sentAt:new Date(sent).toISOString(),receivedAt:new Date(received).toISOString(),serverTimestamp:h.timestamp,latencyMs:received-sent,serverOffsetFromClientMidpointMs:Date.parse(h.timestamp)-(sent+received)/2,uptime:h.uptime});
}
console.log(JSON.stringify(out,null,2));
