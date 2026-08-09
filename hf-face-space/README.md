---
title: Farm2Door Face Embedding API
emoji: 🔐
colorFrom: blue
colorTo: green
sdk: gradio
sdk_version: "4.40.0"
app_file: app.py
pinned: false
license: mit
---

# Farm2Door Face Embedding API

A Gradio service that uses **InsightFace's ArcFace (buffalo_l)** model to detect faces and extract **512-dimensional embeddings** for biometric authentication.

## Architecture

- **Face Detection**: SCRFD (Sample and Computation Redistribution for Face Detection)
- **Face Recognition**: ArcFace with ResNet-100 backbone
- **Embedding**: 512-dimensional, L2-normalized float vector
- **Framework**: Gradio (CPU-only, no GPU decorator)
- **Runtime**: ONNX Runtime (CPU)

## API Usage

This Space exposes a Gradio API endpoint. Call it from Node.js:

```javascript
const { Client } = require("@gradio/client");

const client = await Client.connect("your-username/farm2door-face", {
  hf_token: "hf_..."
});

const result = await client.predict("/predict", {
  image_b64: "base64-encoded-image-string"
});

console.log(result.data);
// { success: true, embedding: [0.0123, -0.0456, ...], face_score: 0.9987, ... }
```

## Privacy

- Images are processed entirely in memory
- No images are saved to disk or logged
- Only the 512-float embedding is returned
- Embeddings are not logged or stored by this service
