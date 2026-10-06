// Worker entry: loader hooks of the main thread are not inherited by workers, so tsx is
// registered here before loading the TypeScript worker module.
import { workerData } from 'node:worker_threads';
import { register } from 'tsx/esm/api';

register();
await import(workerData.entry);
