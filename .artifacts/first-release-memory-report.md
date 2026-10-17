# First release memory observations

Revision: b3fdce426209b700cea30dba576ea0bd8dfb76e3
Deployment: 9307e260-0234-4e7a-b36c-6247baa1bc5c
Instance: 9d5b1017-780c-5a10-2145-928e3a531680

Raw instance API samples (step=1m) around the failed playback attempt:

| UTC sample | CPU_TOTAL_PERCENT | MEM_RSS bytes | MEM_RSS MiB |
| --- | ---: | ---: | ---: |
| 2026-10-14 02:36:00 | 0 | 163549184 | 155.9727 |
| 2026-10-14 02:37:00 | 3.999904394 | 179290112 | 170.9844 |
| 2026-10-14 02:38:00 | 1.999914527 | 179269632 | 170.9648 |

A later query spanning activation through 02:47:46 UTC reported a sampled instance RSS maximum
of 184709120 bytes (176.1523 MiB). Its startup CPU sample at 02:35:46 UTC was 453.697998%.
The free instance is allocated 0.1 vCPU. CPU_TOTAL_PERCENT uses that allocation as its
normalization denominator; it must not be confused with percent of a whole CPU core.

Node's reported peak RSS through this period was 131248128 bytes (125.1680 MiB). This
process-only peak excludes the Rust proxy. Linux cgroup current/peak/limit files were
unavailable and are reported as null, so an exact instantaneous total-container peak
cannot be claimed. No process uptime reset was observed.

The external harness recorded one 7587 ms health request; matched server health handler
logs consistently reported 1-2 ms. The local client clock later measured about 2707 ms
ahead of the server clock, so absolute client/server UTC timestamps cannot be directly
subtracted to locate the delay. This evidence supports a fast observed Node handler,
not a definitive location for the external delay.

References:

- https://www.koyeb.com/docs/run-and-scale/metrics documents response time in milliseconds,
  estimates based on a five-minute average, and CPU usage normalized to instance CPU limit.
- https://www.koyeb.com/docs/reference/instances documents free resources: 512 MB and 0.1 vCPU.
- https://github.com/koyeb/koyeb-cli/blob/v5.12.0/pkg/koyeb/metrics_get.go shows CLI raw sample
  values passed unchanged, while per-series labels are dropped in the JSON renderer.
- The official Go API client exposes a step query parameter, default 5m; direct requests
  here use 1m and preserve labels.instance_id to distinguish rollout instances.

Artifacts: koyeb-raw-instance-metrics.json, koyeb-metrics-released-9307e260-0234-4e7a-b36c-6247baa1bc5c.json,
production-memory-monitor.jsonl, koyeb-first-release-health-spike.log.
