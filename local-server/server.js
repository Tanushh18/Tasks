const express = require("express");
const cors = require("cors");

const PORT = Number(process.env.PORT ?? 3000);

// Swap these in once a local engine (e.g. Ollama + a vision model, or Tesseract) is installed.
const OCR_READY = false;
const VOICE_READY = false;

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ocrReady: OCR_READY, voiceReady: VOICE_READY, timestamp: new Date().toISOString() });
});

app.post("/ocr/scan", (req, res) => {
  const { image, target } = req.body ?? {};
  if (!image || !target) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "image and target are required" });
  }
  if (!OCR_READY) {
    return res.status(501).json({
      error: "OCR_ENGINE_NOT_INSTALLED",
      message: "No local OCR engine is installed on this server yet. The app will fall back to cloud OCR.",
    });
  }
  // TODO: run a local OCR engine (e.g. Tesseract, or a local vision model via Ollama) on `image`
  // and return { contact: {name, number} } or { receipt: {amount, merchant, date, category} }
  // depending on `target`, matching the shape of the backend's /api/ocr/scan response.
  res.status(501).json({ error: "NOT_IMPLEMENTED" });
});

app.post("/voice/process", (req, res) => {
  const { text } = req.body ?? {};
  if (!text) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "text is required" });
  }
  if (!VOICE_READY) {
    return res.status(501).json({
      error: "VOICE_ENGINE_NOT_INSTALLED",
      message: "No local voice/LLM engine is installed on this server yet. The app will fall back to the cloud assistant.",
    });
  }
  // TODO: run a local LLM (e.g. via Ollama) to interpret `text` into a task/finance/contact action,
  // then call the existing Render API (using the accessToken the phone sends) to actually perform it.
  res.status(501).json({ error: "NOT_IMPLEMENTED" });
});

app.listen(PORT, () => {
  console.log(`We Three local server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
