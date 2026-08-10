import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ps1 = path.join(__dirname, 'kill-port.ps1');
const platform = process.platform;

try {
    if (platform === 'win32') {
        execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, {
            stdio: 'ignore',
            timeout: 5000,
        });
    } else {
        execSync(`kill $(lsof -ti:3001) 2>/dev/null || true`, {
            stdio: 'ignore',
            timeout: 5000,
        });
    }
} catch {
    // Ignore failures — port may already be free or script may not have permissions
}
