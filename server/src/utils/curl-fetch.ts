/**
 * GET through the system `curl`. Some sites sit behind a bot check that keys on the TLS
 * fingerprint of the client: Node's (axios, fetch) is challenged with a 403, curl's is not.
 * Only pages that need this go through here; media hosts are fetched normally.
 */

import { execFile } from 'node:child_process';

const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl';

export interface CurlOptions {
    headers?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
}

export function curlGet(url: string, { headers = {}, timeoutMs = 25000, signal }: CurlOptions = {}): Promise<string> {
    const args = ['-sS', '-L', '--compressed', '--fail', '--max-time', String(Math.ceil(timeoutMs / 1000))];
    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    args.push(url);

    return new Promise((resolve, reject) => {
        execFile(CURL, args, { maxBuffer: 32 * 1024 * 1024, encoding: 'utf8', signal, windowsHide: true }, (err, stdout, stderr) => {
            if (err) {
                const code: unknown = (err as { code?: unknown }).code;
                const detail = code === 22 ? 'HTTP error' : code === 'ENOENT' ? 'curl is not installed' : (stderr || err.message).trim();
                return reject(new Error(`curl ${url.slice(0, 80)}: ${detail}`));
            }
            resolve(stdout);
        });
    });
}
