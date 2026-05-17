
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to our status files
const TS_FILE_PATH = path.join(__dirname, '../config/source-status.ts');
const JSON_FILE_PATH = path.join(__dirname, '../config/source-status.json');

interface SourceInfo {
    name: string;
    url: string;
    strength?: string;
    status: string;
    notes?: string;
    reason?: string;
}

async function probeSource(url: string): Promise<{ success: boolean; error?: string; duration: number }> {
    const start = Date.now();
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            },
            timeout: 10000,
            validateStatus: () => true
        });
        const duration = Date.now() - start;
        return { success: response.status === 200, duration };
    } catch (error) {
        const duration = Date.now() - start;
        return { success: false, error: (error as any).code || (error as any).message, duration };
    }
}

async function updateSourceStatus() {
    console.log('🔄 STARTING AUTOMATIC SOURCE STATUS UPDATE');
    console.log('==========================================\n');

    // Load current status from JSON (easier to parse)
    const currentStatus = JSON.parse(fs.readFileSync(JSON_FILE_PATH, 'utf-8'));
    
    const newStatus: any = {
        working: [],
        experimental: [],
        obsolete: currentStatus.obsolete // Keep obsolete as is unless we want to re-check
    };

    const allToTest = [...currentStatus.working, ...currentStatus.experimental];

    for (const source of allToTest) {
        process.stdout.write(`📡 Testing ${source.name} (${source.url})... `);
        const result = await probeSource(source.url);

        if (result.success) {
            console.log(`✅ OK (${result.duration}ms)`);
            newStatus.working.push({
                ...source,
                status: 'Stable',
                notes: `Last verified: ${new Date().toISOString().split('T')[0]}`
            });
        } else if (result.error === 'ENOTFOUND' || result.error === 'ECONNREFUSED') {
            console.log(`❌ DEAD (${result.error})`);
            if (!newStatus.obsolete.includes(source.name)) {
                newStatus.obsolete.push(source.name);
            }
        } else {
            console.log(`⚠️  EXPERIMENTAL (${result.error || 'Timeout'})`);
            newStatus.experimental.push({
                ...source,
                status: 'Blocked/Unstable',
                reason: result.error || 'Timeout',
                notes: `Last attempt: ${new Date().toISOString().split('T')[0]}`
            });
        }
    }

    // Write JSON
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(newStatus, null, 2));

    // Generate TS content
    const tsContent = `
/**
 * AUTO-GENERATED SOURCE STATUS
 * Last Updated: ${new Date().toISOString()}
 */

export const SOURCE_STATUS = ${JSON.stringify(newStatus, null, 4)};

export type SourceStatus = typeof SOURCE_STATUS;
`;

    fs.writeFileSync(TS_FILE_PATH, tsContent);

    console.log('\n==========================================');
    console.log('✅ SOURCE STATUS UPDATED SUCCESSFULLY');
    console.log(`📂 Saved to: ${TS_FILE_PATH}`);
    console.log('==========================================');
}

updateSourceStatus().catch(err => {
    console.error('❌ Failed to update sources:', err);
    process.exit(1);
});
