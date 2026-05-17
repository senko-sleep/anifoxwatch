import { SourceManager } from '../server/src/services/source-manager.js';

console.log('SourceManager Prototype:', Object.getOwnPropertyNames(SourceManager.prototype));
const sm = new SourceManager();
console.log('sm instance keys:', Object.keys(sm));
console.log('init type:', typeof (sm as any).init);
