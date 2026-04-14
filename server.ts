import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import axios from "axios";
import { createServer } from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_ML_API = "http://localhost:8000/predict";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:5173", "http://0.0.0.0:5173"],
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  // Configure multer for file uploads
  const upload = multer({ storage: multer.memoryStorage() });

  app.use(express.json());

  // Store for live traffic
  let liveTraffic: any[] = [];
  let packetCounter = 0;

  // Helper to call Python ML API
  const getMLPrediction = async (features: any) => {
    try {
      const response = await axios.post(PYTHON_ML_API, {
        duration: parseFloat(features.duration) || 0,
        src_bytes: parseFloat(features.src_bytes) || 0,
        dst_bytes: parseFloat(features.dst_bytes) || 0,
        count: parseInt(features.count) || 0,
        srv_count: parseInt(features.srv_count) || 0
      });
      console.log(`[*] Prediction: ${response.data.label} | Confidence: ${(response.data.confidence * 100).toFixed(2)}%`);
      return response.data;
    } catch (error) {
      console.error("[-] ML API Error:", error.message);
      // Fallback to simple logic if API is down
      const isAttack = features.src_bytes > 1000000 || features.count > 100;
      return {
        prediction: isAttack ? 1 : 0,
        confidence: 0.5,
        label: isAttack ? "Attack" : "Normal",
        fallback: true
      };
    }
  };

  // API Route for Prediction (CSV Upload)
  app.post("/api/predict", upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const csvData = req.file.buffer.toString();
    const lines = csvData.split("\n").filter(line => line.trim() !== "");
    
    // Skip header if it exists
    const dataLines = lines.length > 1 ? lines.slice(1) : lines;
    const totalRecords = dataLines.length;

    let attackCount = 0;
    
    // Process each line (In a real app, we'd batch this)
    // For the demo, we'll process the first 100 to avoid overloading
    const processLines = dataLines.slice(0, 100);
    
    for (const line of processLines) {
      const parts = line.split(",");
      // Assuming NSL-KDD format or similar
      const features = {
        duration: parts[0],
        src_bytes: parts[4],
        dst_bytes: parts[5],
        count: parts[22],
        srv_count: parts[23]
      };
      
      const result = await getMLPrediction(features);
      if (result.prediction === 1) attackCount++;
    }

    const normalCount = totalRecords - attackCount;
    const attackPercentage = totalRecords > 0 ? (attackCount / totalRecords) * 100 : 0;

    // Static Feature Importance (Mocked from a typical NIDS Random Forest model)
    const featureImportance = [
      { name: "src_bytes", importance: 0.28 },
      { name: "dst_bytes", importance: 0.22 },
      { name: "duration", importance: 0.18 },
      { name: "count", importance: 0.15 },
      { name: "srv_count", importance: 0.12 },
    ];

    res.json({
      totalRecords,
      normalCount,
      attackCount,
      attackPercentage: attackPercentage.toFixed(2),
      featureImportance,
    });
  });

  // Endpoint for external data (e.g., Python Sniffer)
  app.post("/api/external-data", async (req, res) => {
    const { flows } = req.body;
    
    if (!flows || !Array.isArray(flows)) {
      return res.status(400).json({ error: "Invalid flows data" });
    }

    // Respond immediately to the sniffer to avoid blocking
    res.json({ status: "received", count: flows.length });

    // Process flows in parallel to avoid blocking the event loop
    const processFlows = async () => {
      const results = await Promise.all(flows.map(async (features: any) => {
        // Get real prediction from ML API
        const mlResult = await getMLPrediction(features);
        
        // Add to live traffic buffer
        packetCounter++;
        const processedFlow = {
          ...features,
          isAttack: mlResult.prediction === 1,
          confidence: mlResult.confidence,
          label: mlResult.label,
          id: `pkt-${Date.now()}-${packetCounter}`,
          timestamp: new Date().toISOString()
        };

        liveTraffic.unshift(processedFlow);
        
        // Keep only last 50 packets
        if (liveTraffic.length > 50) liveTraffic.pop();

        // Push to all connected clients via WebSockets
        io.emit("new-flow", processedFlow);
        return processedFlow;
      }));
      
      console.log(`[*] Processed batch of ${results.length} flows.`);
    };

    processFlows();
  });

  app.get("/api/live-traffic", (req, res) => {
    res.json(liveTraffic);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
