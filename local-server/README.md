# We Three — Local Server

Runs OCR (image scanning) and voice-command understanding on this machine instead of the cloud,
so a family member can process scans/voice locally when their laptop is on. Backend data (tasks,
finance, contacts) still lives on Render/MongoDB Atlas — this server only understands images/voice
and, once a real engine is wired in, calls the existing Render API to make changes.

## Run it

```
cd local-server
npm install
npm start
```

Listens on port 3000 by default (`PORT=3001 npm start` to change it). Point your dev tunnel at
whichever port you run it on, then paste that tunnel's public URL into the app under
**Settings → Local AI server**.

## Status

Both `/ocr/scan` and `/voice/process` currently return `501 NOT_IMPLEMENTED` — this is scaffolding
only. The app already knows how to detect this and falls back to the cloud (Gemini-based) OCR and
assistant automatically, so nothing breaks by running this as-is.

To actually make OCR/voice work locally, install a local engine and replace the `TODO`s in
`server.js`:
- **OCR**: easiest is [Tesseract](https://github.com/tesseract-ocr/tesseract) (`brew install
  tesseract`) via a wrapper like `node-tesseract-ocr`, or a local vision model through
  [Ollama](https://ollama.com) (e.g. `ollama pull moondream`).
- **Voice/command understanding**: a small instruction-following model through Ollama (e.g. `ollama
  pull llama3.2`), prompted to return the same structured action shape the cloud assistant already
  uses, then call `https://tasks-g9h1.onrender.com/api/...` with the phone's access token (sent in
  the request body) to actually perform the action.
