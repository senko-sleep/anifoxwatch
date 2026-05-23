import { sourceManager } from './src/services/source-manager.js';
sourceManager.resolveAniListToStreamingId(189046).then(res => {
    console.log("Resolved ID:", res);
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
