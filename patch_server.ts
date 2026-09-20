import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// Insert the endpoint just before app.post("/api/bot/trade"
content = content.replace(
  /  app\.post\("\/api\/bot\/trade", async \(req, res\) => \{/,
  `  app.get("/api/signal_audit", async (req, res) => {
    try {
      const q = query(collection(db, 'signalAudit'), orderBy('createdAt', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => {
        const data = doc.data();
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
           data.createdAt = data.createdAt.toDate().toISOString();
        }
        return data;
      });
      res.json(logs);
    } catch(e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/bot/trade", async (req, res) => {`
);

// We need limit from firebase/firestore
content = content.replace(
  /import \{ collection, query, where, getDocs, updateDoc, doc, writeBatch, orderBy \} from "firebase\/firestore";/,
  `import { collection, query, where, getDocs, updateDoc, doc, writeBatch, orderBy, limit } from "firebase/firestore";`
);

fs.writeFileSync('server.ts', content);
