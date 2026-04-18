import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { getApiConfig, getApiFallbackUrl } from '@/lib/api-config';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Activity, CheckCircle2, XCircle, RefreshCw, ExternalLink, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type EndpointResult = {
  name: string;
  url: string;
  ok: boolean | null;
  latencyMs: number;
  detail: string;
  error?: string;
};

async function probeHealth(name: string, baseUrl: string): Promise<EndpointResult> {
  const base = baseUrl.replace(/\/$/, '');
  const url = `${base}/health`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: '*/*' },
      signal: AbortSignal.timeout(10_000),
    });
    const latencyMs = Date.now() - t0;
    const ct = res.headers.get('content-type') || '';
    let detail = '';
    if (ct.includes('application/json')) {
      const j = (await res.json()) as Record<string, unknown>;
      detail = [j.status, j.version, j.environment].filter(Boolean).join(' · ') || JSON.stringify(j).slice(0, 200);
    } else {
      detail = (await res.text()).trim().slice(0, 120);
    }
    return {
      name,
      url,
      ok: res.ok,
      latencyMs,
      detail: detail || (res.ok ? 'OK' : `HTTP ${res.status}`),
    };
  } catch (e) {
    return {
      name,
      url,
      ok: false,
      latencyMs: -1,
      detail: '',
      error: e instanceof Error ? e.message : 'Request failed',
    };
  }
}

const Health = () => {
  useDocumentTitle('Service health');
  const [rows, setRows] = useState<EndpointResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string>('');

  const runChecks = useCallback(async () => {
    setLoading(true);
    const primary = getApiConfig().baseUrl;
    const fallback = getApiFallbackUrl();
    const hianimeBase = (import.meta.env.VITE_ANIWATCH_API_URL as string | undefined)?.trim();

    const tasks: Promise<EndpointResult>[] = [probeHealth('Primary API (AniFox)', primary)];
    if (fallback && fallback !== primary) {
      tasks.push(probeHealth('Fallback API', fallback));
    }
    if (hianimeBase) {
      tasks.push(probeHealth('HiAnime REST (aniwatch-api)', hianimeBase));
    }

    const out = await Promise.all(tasks);
    setRows(out);
    setCheckedAt(new Date().toISOString());
    setLoading(false);
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const allOk = rows.length > 0 && rows.every((r) => r.ok === true);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fox-orange to-orange-600 flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Service health</h1>
            </div>
            <p className="text-muted-foreground text-sm sm:text-base max-w-xl">
              Public checks for the API your browser uses and optional upstream services. For per-source
              streaming status, see{' '}
              <Link to="/status" className="text-fox-orange hover:underline">
                System status
              </Link>
              .
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={() => void runChecks()} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        <div
          className={cn(
            'rounded-2xl border px-4 py-3 mb-8 flex items-center gap-2 text-sm',
            loading
              ? 'border-white/10 bg-fox-surface/30 text-muted-foreground'
              : allOk
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
          )}
        >
          {loading ? (
            <>Running checks…</>
          ) : allOk ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              All probed endpoints returned success.
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-amber-400 shrink-0" />
              One or more checks failed or timed out. Retry or see details below.
            </>
          )}
        </div>

        <ul className="space-y-4">
          {rows.map((r) => (
            <li
              key={r.name}
              className="rounded-2xl border border-white/10 bg-fox-surface/30 p-5 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-semibold">{r.name}</span>
                {r.ok === true ? (
                  <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Up
                  </span>
                ) : r.ok === false ? (
                  <span className="text-xs font-medium text-rose-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Down
                  </span>
                ) : null}
              </div>
              <code className="text-xs text-muted-foreground break-all">{r.url}</code>
              {r.latencyMs >= 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {r.latencyMs} ms
                </p>
              )}
              {r.error ? (
                <p className="text-sm text-rose-300">{r.error}</p>
              ) : (
                <p className="text-sm text-foreground/90">{r.detail}</p>
              )}
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-fox-orange inline-flex items-center gap-1 hover:underline w-fit"
              >
                Open health URL <ExternalLink className="w-3 h-3" />
              </a>
            </li>
          ))}
        </ul>

        {!loading && (
          <p className="mt-8 text-xs text-muted-foreground flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            Last check: {checkedAt}
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Health;
