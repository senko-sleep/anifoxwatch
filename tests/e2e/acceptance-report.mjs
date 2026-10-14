/**
 * Summarises production-acceptance JSONL files: pass streak, first-frame latency, seek/resume
 * timing, and the Node process's CPU and RSS as sampled by each run's /health polling.
 *
 *   node tests/e2e/acceptance-report.mjs .artifacts/acceptance-171d1b9.jsonl .artifacts/acceptance-4daffe6.jsonl
 */
import { readFileSync } from 'node:fs';

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const fmt = (n, d = 0) => Number.isFinite(n) ? n.toFixed(d) : '-';

for (const file of process.argv.slice(2)) {
    const runs = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.steps);
    let streak = 0, best = 0;
    for (const r of runs) { streak = r.pass ? streak + 1 : 0; best = Math.max(best, streak); }
    const ok = runs.filter((r) => r.pass);
    const ttff = ok.map((r) => r.firstFrameMs);
    const resumeFrame = ok.map((r) => r.steps.resume?.firstFrame?.ms).filter(Number.isFinite);
    const stalls = ok.map((r) => r.steps.play?.maxStall ?? 0);
    // Node CPU share and RSS between consecutive /health samples of a run (other visitors add noise).
    const cpuShares = [], rss = [];
    for (const r of runs) {
        const h = (r.health || []).filter((s) => s.resources?.node?.cpuMicroseconds && s.uptime);
        for (const s of h) rss.push(s.resources.node.rss / 1048576);
        for (let i = 1; i < h.length; i++) {
            const a = h[i - 1], b = h[i];
            const wall = (b.uptime - a.uptime) * 1e6;
            if (wall <= 0) continue; // instance restarted between samples
            const cpu = (b.resources.node.cpuMicroseconds.user + b.resources.node.cpuMicroseconds.system)
                - (a.resources.node.cpuMicroseconds.user + a.resources.node.cpuMicroseconds.system);
            cpuShares.push((cpu / wall) * 100);
        }
    }
    const peakNodeRss = Math.max(...runs.flatMap((r) => (r.health || []).map((s) => (s.resources?.node?.peakRssBytes ?? 0) / 1048576)));
    const healthMs = runs.flatMap((r) => (r.health || []).map((s) => s.ms)).filter(Number.isFinite);
    console.log(`\n${file}`);
    console.log(`  runs ${runs.length}, passed ${ok.length}, failed ${runs.length - ok.length}, best consecutive streak ${best}, final streak ${streak}`);
    console.log(`  first decoded frame ms  p50 ${fmt(pct(ttff, 0.5))}  p90 ${fmt(pct(ttff, 0.9))}  max ${fmt(Math.max(...ttff))}  (run 1: ${fmt(runs[0]?.firstFrameMs)})`);
    console.log(`  reload→first frame ms   p50 ${fmt(pct(resumeFrame, 0.5))}  max ${fmt(Math.max(...resumeFrame))}`);
    console.log(`  60s playback max stall  ${fmt(Math.max(...stalls), 1)}s`);
    console.log(`  Node CPU % of one core  p50 ${fmt(pct(cpuShares, 0.5), 2)}  p90 ${fmt(pct(cpuShares, 0.9), 2)}  max ${fmt(Math.max(...cpuShares), 2)}  (${cpuShares.length} intervals)`);
    console.log(`  Node RSS MB             p50 ${fmt(pct(rss, 0.5), 1)}  max ${fmt(Math.max(...rss), 1)}  process peak ${fmt(peakNodeRss, 1)}`);
    console.log(`  external /health ms     p50 ${fmt(pct(healthMs, 0.5))}  max ${fmt(Math.max(...healthMs))}`);
    for (const r of runs.filter((x) => !x.pass)) console.log(`  FAIL run ${r.run} @ ${r.at}: ${r.failure?.slice(0, 300)}`);
}
