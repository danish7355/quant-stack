import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Import the component
content = content.replace(
  /import \{ positionMonitor \} from '\.\.\/server\/services\/PositionMonitor';/,
  `import { positionMonitor } from '../server/services/PositionMonitor';\nimport { SignalAuditTable } from './components/SignalAuditTable';`
);

// Actually positionMonitor is probably not imported there. Let's find a safe spot for the import.
content = content.replace(
  /import \{ HeatmapView \} from '\.\/components\/HeatmapView';/,
  `import { HeatmapView } from './components/HeatmapView';\nimport { SignalAuditTable } from './components/SignalAuditTable';`
);

// Replace the Under Construction message
content = content.replace(
  /<div className="p-4 flex items-center justify-center h-64 text-gray-400">\s*\[Signals & Rejects Tab Content - Under Construction\]\s*<\/div>/g,
  `<SignalAuditTable />`
);

fs.writeFileSync('src/App.tsx', content);
