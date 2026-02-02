import { Buffer } from 'node:buffer';
import EventEmitter from 'node:events';

globalThis.Buffer = Buffer;
// @ts-ignore
globalThis.EventEmitter = EventEmitter;

import stream from 'node:stream';
// @ts-ignore
globalThis.stream = stream;
