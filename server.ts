import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import dotenv from "dotenv";

// Explicitly load .env.local (dotenv does not load it by default)
dotenv.config({ path: ".env.local" });

const app = express();
const PORT = process.env.PORT || 3000;

// Increase request size limit to handle client-side compressed base64 image strings
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Initialize Grok (xAI) client - OpenAI compatible
const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || "",
  baseURL: "https://api.x.ai/v1",
});

// Deep health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Image analysis proxy endpoint using Grok (xAI)
app.post("/api/analyze-image", async (req, res) => {
  try {
    const { base64Data, mimeType, questTitle, questDescription } = req.body;
    
    if (!base64Data) {
      return res.status(400).json({ error: "Missing base64Data in request body." });
    }

    // Clean up base64 prefix if present
    let cleanedBase64 = base64Data;
    if (cleanedBase64.includes(";base64,")) {
      cleanedBase64 = cleanedBase64.split(";base64,").pop() || "";
    }

    const promptText = `
You are analyzing a library orientation quest task submission.
Quest Title: "${questTitle || "Library Exploration"}"
Quest Description: "${questDescription || "Go find a library designated location and upload a photo."}"
The user uploaded this photo. Analyze it and leave a witty comment.
`;

    const systemInstruction = `You are a witty, supportive, and enthusiastic library robot companion accompanying a freshman during Library Orientation. 
You will receive an image uploaded by the student as their answer to an orientation quest.
DO NOT grade or judge if the answer is strictly correct or incorrect. Instead:
1. Briefly acknowledge what you see in the picture with enthusiasm.
2. Provide a supportive, or interesting comment related to library life, books, or university adaptation.
3. Keep the response concise (2-3 sentences max) and friendly.
Tone: Supportive peer, light-hearted, slightly geeky but fun.
Language: Traditional Chinese with optional English translation (friendly, supportive and natural tone, e.g., "太棒了！", "這裡非常適合讀書和學習", "加油！"). Avoid heavy colloquial Cantonese slang/dialect structures to keep the commentary widely accessible, while remaining warm and welcoming.`;

    // Call Grok vision model
    const response = await openai.chat.completions.create({
      model: "grok-4-fast-reasoning",
      messages: [
        { role: "system", content: systemInstruction },
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${cleanedBase64}`
              }
            }
          ]
        }
      ],
      temperature: 0.95,
      max_tokens: 400
    });

    const aiComment = response.choices[0]?.message?.content || "做得好！看到你上傳的照片，真的非常有活力呀！ (Great job! Your photo is full of energy!)";
    res.json({ comment: aiComment });
  } catch (error: any) {
    console.error("Grok analysis error:", error);
    // Return more detailed error for debugging
    const errorMessage = error?.response?.data?.error?.message || error?.message || "Failed to analyze image with Grok";
    res.status(500).json({ error: errorMessage });
  }
});

async function startServer() {
  // Vite middleware setup for routing assets in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server fully operational on port ${PORT}`);
  });
}

startServer();
