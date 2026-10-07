import { createRequire } from 'node:module';
import { parseDemo, type BuiltMatch, type Columns } from '@skybox/shared/parse';

const require = createRequire(import.meta.url);
// Packaged desktop builds ship the native parser outside the bundle and point to it via SKYBOX_DEMOPARSER.
const parser = require(process.env.SKYBOX_DEMOPARSER ?? '@laihoe/demoparser2') as typeof import('@laihoe/demoparser2');

export function parseDemoFile(path: string, fileName: string, onStage: (stage: string) => void): BuiltMatch {
  return parseDemo(
    {
      parseHeader: () => parser.parseHeader(path),
      parseEvents: (events, playerProps, otherProps) => parser.parseEvents(path, events, playerProps, otherProps) as any[],
      parseTicks: (props, ticks) => parser.parseTicks(path, props, ticks, null, true) as Columns,
      parseGrenades: () => parser.parseGrenades(path, null, false) as any[],
    },
    fileName,
    onStage,
  );
}
