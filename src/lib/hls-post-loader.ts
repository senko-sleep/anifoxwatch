import Hls from 'hls.js';

interface LoadStats {
  trequest: number;
  tfirst?: number;
  tload?: number;
  retry: number;
}

/**
 * Custom HLS loader that uses POST requests for proxied URLs
 * This solves Cloudflare Workers URL length limitations
 */
export class PostProxyLoader extends Hls.DefaultConfig.loader {
  private proxyBaseUrl: string;

  constructor(config: Hls.LoaderConfiguration) {
    super(config);
    // Extract proxy base URL from the first load
    this.proxyBaseUrl = '';
  }

  load(
    context: Hls.LoaderContext,
    config: Hls.LoaderConfiguration,
    callbacks: Hls.LoaderCallbacks<Hls.LoaderContext>
  ): void {
    const url = context.url;

    // Check if this is a proxied URL
    const isProxied = url.includes('/api/stream/proxy?url=');
    
    if (isProxied) {
      // Extract the actual URL from the proxy parameter
      const urlMatch = url.match(/\/api\/stream\/proxy\?url=(.+)/);
      if (urlMatch) {
        const encodedUrl = urlMatch[1];
        const actualUrl = decodeURIComponent(encodedUrl);
        
        // Extract proxy base (everything before ?url=)
        const proxyBase = url.substring(0, url.indexOf('?url='));
        
        // Use POST request for long URLs (>1000 chars to be safe)
        if (actualUrl.length > 1000) {
          this.loadViaPost(proxyBase, actualUrl, context, config, callbacks);
          return;
        }
      }
    }

    // Fall back to default loader for non-proxied or short URLs
    super.load(context, config, callbacks);
  }

  private loadViaPost(
    proxyUrl: string,
    actualUrl: string,
    context: Hls.LoaderContext,
    config: Hls.LoaderConfiguration,
    callbacks: Hls.LoaderCallbacks<Hls.LoaderContext>
  ): void {
    const xhr = new XMLHttpRequest();
    const stats: LoadStats = { trequest: performance.now(), retry: 0 };

    xhr.open('POST', proxyUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    if (context.rangeEnd) {
      xhr.setRequestHeader('Range', `bytes=${context.rangeStart}-${context.rangeEnd}`);
    }

    xhr.timeout = config.timeout || 30000;
    xhr.responseType = context.responseType || 'text';

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        stats.tfirst = Math.max(performance.now(), stats.trequest);
        stats.tload = performance.now();
        
        callbacks.onSuccess(
          {
            url: context.url,
            data: xhr.response,
            code: xhr.status
          },
          stats,
          context
        );
      } else {
        callbacks.onError(
          {
            code: xhr.status,
            text: xhr.statusText
          },
          context
        );
      }
    };

    xhr.onerror = () => {
      callbacks.onError(
        {
          code: xhr.status,
          text: 'Network error'
        },
        context
      );
    };

    xhr.ontimeout = () => {
      callbacks.onTimeout(stats, context);
    };

    // Send POST request with URL in body
    xhr.send(JSON.stringify({ url: actualUrl }));
  }
}
