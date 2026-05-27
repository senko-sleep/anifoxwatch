let Cluster: any = null;

class BrowserPool {
    private cluster: any = null;
    private initialized = false;

    async init() {
        if (this.initialized) return;
        
        console.log('🚀 Initializing Puppeteer Cluster...');
        if (!Cluster) {
            const clusterModuleName = 'puppeteer-cluster';
            const clusterModule = await import(clusterModuleName);
            Cluster = clusterModule.Cluster;
        }
        this.cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: 5,
            puppeteerOptions: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ],
            } as any,
        });

        // Error handling
        this.cluster.on('taskerror', (err, data) => {
            console.error(`❌ Cluster error for ${data}: ${err.message}`);
        });

        this.initialized = true;
    }

    async execute<T>(fn: (task: { page: any; data: any }) => Promise<T>, data: any): Promise<T> {
        if (!this.initialized) await this.init();
        return this.cluster!.execute(data, fn);
    }

    async close() {
        if (this.cluster) {
            await this.cluster.idle();
            await this.cluster.close();
        }
    }
}

export const browserPool = new BrowserPool();
