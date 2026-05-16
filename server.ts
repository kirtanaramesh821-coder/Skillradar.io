import express from "express";
import path from "path";
import multer from "multer";
// @ts-ignore
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import mammoth from "mammoth";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

interface MulterRequest extends express.Request {
  file?: Express.Multer.File;
}

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });

// --- AI Service ---
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// --- Endpoints ---

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Resume Analysis
app.post("/api/analyze-resume", upload.single('resume'), async (req: express.Request, res: express.Response) => {
  console.log("Received upload request. File:", (req as MulterRequest).file ? (req as MulterRequest).file?.originalname : "No file");
  try {
    const mReq = req as MulterRequest;
    let text = "";
    if (mReq.file) {
      console.log("Processing file:", mReq.file.originalname, "Mime:", mReq.file.mimetype);
      if (mReq.file.mimetype === "application/pdf") {
        const data = await pdf(mReq.file.buffer);
        text = data.text;
      } else if (mReq.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ buffer: mReq.file.buffer });
        text = result.value;
      } else {
        console.warn("Unsupported file type:", mReq.file.mimetype);
      }
    } else {
      text = req.body.text;
    }

    if (!text) {
      console.warn("No text extracted from resume.");
      return res.status(400).json({ error: "No resume content provided or unsupported file format." });
    }

    console.log("Analyzing text with AI...");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following resume and suggest 5 suitable career paths/roles for a student. For each role, provide:
      1. Role Title
      2. Match Percentage (0-100)
      3. Brief explanation why it matches.
      4. Skills found in resume that match this role.
      5. Essential skills missing from the resume for this role.
      6. Overall Readiness Percentage (0-100).
      
      Resume content:
      ${text}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            roles: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  matchPercentage: { type: Type.NUMBER },
                  matchReason: { type: Type.STRING },
                  existingSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  readinessPercentage: { type: Type.NUMBER }
                },
                required: ["title", "matchPercentage", "matchReason", "existingSkills", "missingSkills", "readinessPercentage"]
              }
            }
          }
        }
      }
    });

    res.json(JSON.parse(response.text));
  } catch (error) {
    console.error("Resume Analysis Error:", error);
    res.status(500).json({ error: "Failed to analyze resume" });
  }
});

// Roadmap Generation
app.post("/api/generate-roadmap", async (req, res) => {
  const { role, currentSkills, missingSkills } = req.body;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Create a highly accurate 30-day learning roadmap for a student to become a "${role}".
      They currently have these skills: ${currentSkills.join(", ")}
      They need to acquire: ${missingSkills.join(", ")}
      
      Structure the roadmap by week (4 weeks).
      IMPORTANT: Each week MUST contain exactly 7-8 unique daily goals. Total should be 30 days.
      Each day item MUST have:
      - day: specific number (1-30)
      - goal: a clear learning objective
      - resource: an actual URL to a free learning resource. PREFER YouTube (channels like Traversy Media, Fireship, etc.), NPTEL, or MDN. DO NOT use Coursera.
      
      At the end of each week, provide a "weeklySimulation" which is a MINI-PROJECT or SPECIFIC SCENARIO based STRICTLY on that week's focus.
      
      Respond with ONLY the JSON object.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["weeks"],
          properties: {
            weeks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["weekNumber", "focus", "days", "weeklySimulation"],
                properties: {
                  weekNumber: { type: Type.NUMBER },
                  focus: { type: Type.STRING },
                  days: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      required: ["day", "goal", "resource"],
                      properties: {
                        day: { type: Type.NUMBER },
                        goal: { type: Type.STRING },
                        resource: { type: Type.STRING }
                      }
                    }
                  },
                  weeklySimulation: {
                    type: Type.OBJECT,
                    required: ["title", "description"],
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    res.json(JSON.parse(response.text));
  } catch (error) {
    console.error("Roadmap Generation Error:", error);
    res.status(500).json({ error: "Failed to generate roadmap" });
  }
});

// Simulation Builder
app.post("/api/get-simulation", async (req, res) => {
  const { role } = req.body;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate 6 practical job simulation scenarios for the role: "${role}".
      Each scenario should have:
      1. Scenario Title
      2. Detailed Situation
      3. Multiple Choice Options (4) for how to handle it.
      4. Correct Answer Index
      5. Feedback for each option.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scenarios: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  situation: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.NUMBER },
                  feedbacks: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            }
          }
        }
      }
    });

    res.json(JSON.parse(response.text));
  } catch (error) {
    console.error("Simulation Generation Error:", error);
    res.status(500).json({ error: "Failed to generate simulation" });
  }
});

// API 404 Handler - Catch all non-matched API routes
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
});

// --- Vite Middleware ---
export default app;

async function startServer() {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    if (process.env.VERCEL) return; // Don't start standalone server on Vercel
    
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.error("Failed to start Vite server:", err);
    }
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();
