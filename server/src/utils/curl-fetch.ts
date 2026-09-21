/**
 * GET through the system `curl`. Some sites sit behind a bot check that keys on the TLS
 * fingerprint of the client: Node's (axios, fetch) is challenged with a 403, curl's is not.
 * Only pages that need this go through here; media hosts are fetched normally.
 */

import { execFile } from 'node:child_process';

const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl';

/** Marks where the body ends and the status code begins in curl's output. */
const STATUS_MARK = '\n__curl_status__:';

export interface CurlOptions {
    headers?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
}

/**
 * The status is read from curl itself instead of using `--fail`, which reports only "an error
 * happened": a bot-check 403, a 404 and a missing binary all need different fixes, and this
 * runs on hosts where the only evidence is the log line.
 */
export function curlGet(url: string, { headers = {}, timeoutMs = 25000, signal }: CurlOptions = {}): Promise<string> {
    const args = ['-sS', '-L', '--compressed', '--max-time', String(Math.ceil(timeoutMs / 1000)), '-w', `${STATUS_MARK}%{http_code}`];
    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    args.push(url);

    return new Promise((resolve, reject) => {
        execFile(CURL, args, { maxBuffer: 32 * 1024 * 1024, encoding: 'utf8', signal, windowsHide: true }, (err, stdout, stderr) => {
            const where = `curl ${url.slice(0, 80)}`;
            if (err) {
                const code: unknown = (err as { code?: unknown }).code;
                const detail = code === 'ENOENT' ? 'curl is not installed' : (stderr || err.message).trim();
                return reject(new Error(`${where}: ${detail}`));
            }

            const cut = stdout.lastIndexOf(STATUS_MARK);
            const status = cut === -1 ? 0 : parseInt(stdout.slice(cut + STATUS_MARK.length), 10);
            const body = cut === -1 ? stdout : stdout.slice(0, cut);
            if (!(status >= 200 && status < 300)) return reject(new Error(`${where}: HTTP ${status || '???'}`));
            resolve(body);
        });
    });
}

/** First line of `curl --version`, for diagnostics. */
export function curlVersion(): Promise<string> {
    return new Promise((resolve) => {
        execFile(CURL, ['--version'], { encoding: 'utf8', windowsHide: true }, (err, stdout) =>
            resolve(err ? `unavailable (${(err as { code?: unknown }).code ?? err.message})` : stdout.split('\n')[0].trim())
        );
    });
}
