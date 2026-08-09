"""
Farm2Door Face Embedding API (Gradio Space)
=============================================
A Gradio-based service that uses InsightFace's ArcFace (buffalo_l) model
to detect faces and extract 512-dimensional embeddings.

Deployed as a Hugging Face Gradio Space on ZeroGPU (CPU-only mode).
"""

import base64
import logging
import time
from io import BytesIO

import cv2
import gradio as gr
import numpy as np
import spaces
from insightface.app import FaceAnalysis
from PIL import Image

# ---------------------------------------------------------------------------
# Logging — never log image data or embeddings
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("face-api")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MODEL_NAME = "buffalo_l"
DET_SIZE = 640
MIN_DET_SCORE = 0.5
MAX_IMAGE_DIM = 2048
MIN_IMAGE_DIM = 100

# ---------------------------------------------------------------------------
# Load model at startup (CPU-only — inference uses CPUExecutionProvider)
# ---------------------------------------------------------------------------
logger.info("Loading InsightFace model: %s ...", MODEL_NAME)
start = time.time()

face_app = FaceAnalysis(
    name=MODEL_NAME,
    allowed_modules=["detection", "recognition"],
    providers=["CPUExecutionProvider"],
)
face_app.prepare(ctx_id=-1, det_size=(DET_SIZE, DET_SIZE))

elapsed = time.time() - start
logger.info("Model loaded in %.1fs", elapsed)


# ---------------------------------------------------------------------------
# Core embedding extraction function
# ---------------------------------------------------------------------------
@spaces.GPU(duration=15)
def extract_embedding(image_b64: str) -> dict:
    """
    Extract a 512-dimensional ArcFace face embedding from a base64 image.

    Pipeline:
    1. Decode base64 image → numpy array
    2. Detect faces using SCRFD
    3. Validate exactly 1 face is present
    4. Align and crop face
    5. Extract ArcFace embedding (ResNet-100)
    6. Return L2-normalized 512-dim embedding

    The image is processed entirely in memory and never saved to disk.

    Args:
        image_b64: Base64-encoded JPEG or PNG image. May include data URI prefix.

    Returns:
        dict with keys: success, embedding, face_score, bbox, error, code
    """
    # --- Step 1: Decode image ---
    try:
        # Remove data URI prefix if present
        if "," in image_b64 and image_b64.index(",") < 100:
            image_b64 = image_b64.split(",", 1)[1]

        img_bytes = base64.b64decode(image_b64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {
                "success": False,
                "error": "Could not decode image. Ensure it is a valid JPEG or PNG.",
                "code": "INVALID_IMAGE",
                "embedding": None,
                "face_score": 0,
                "bbox": None,
            }
    except Exception as e:
        return {
            "success": False,
            "error": f"Invalid image data: {str(e)}",
            "code": "INVALID_IMAGE",
            "embedding": None,
            "face_score": 0,
            "bbox": None,
        }

    # --- Step 2: Validate dimensions ---
    h, w = img.shape[:2]
    if h < MIN_IMAGE_DIM or w < MIN_IMAGE_DIM:
        return {
            "success": False,
            "error": f"Image too small ({w}x{h}). Minimum dimension is {MIN_IMAGE_DIM}px.",
            "code": "IMAGE_SIZE_ERROR",
            "embedding": None,
            "face_score": 0,
            "bbox": None,
        }

    if h > MAX_IMAGE_DIM or w > MAX_IMAGE_DIM:
        scale = MAX_IMAGE_DIM / max(h, w)
        new_w, new_h = int(w * scale), int(h * scale)
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # --- Step 3: Detect faces ---
    t0 = time.time()
    faces = face_app.get(img)
    det_time = time.time() - t0
    logger.info("Detection took %.3fs, found %d face(s)", det_time, len(faces))

    # --- Step 4: Validate face count ---
    if len(faces) == 0:
        return {
            "success": False,
            "error": "No face detected. Please ensure your face is clearly visible and well-lit.",
            "code": "NO_FACE",
            "embedding": None,
            "face_score": 0,
            "bbox": None,
        }

    if len(faces) > 1:
        return {
            "success": False,
            "error": f"Multiple faces detected ({len(faces)}). Please ensure only your face is in the frame.",
            "code": "MULTIPLE_FACES",
            "embedding": None,
            "face_score": 0,
            "bbox": None,
        }

    face = faces[0]

    # --- Step 5: Check detection confidence ---
    det_score = float(face.det_score)
    if det_score < MIN_DET_SCORE:
        return {
            "success": False,
            "error": "Face detected but confidence is too low. Please improve lighting and face position.",
            "code": "LOW_CONFIDENCE",
            "embedding": None,
            "face_score": det_score,
            "bbox": None,
        }

    # --- Step 6: Extract embedding ---
    embedding = face.normed_embedding
    if embedding is None or len(embedding) == 0:
        return {
            "success": False,
            "error": "Failed to extract face embedding. Please try again.",
            "code": "EMBEDDING_FAILED",
            "embedding": None,
            "face_score": det_score,
            "bbox": None,
        }

    bbox = face.bbox.tolist()

    logger.info(
        "Embedding extracted: dim=%d, det_score=%.3f, det_time=%.3fs",
        len(embedding),
        det_score,
        det_time,
    )

    return {
        "success": True,
        "embedding": embedding.tolist(),
        "face_score": round(det_score, 4),
        "bbox": [round(v, 1) for v in bbox],
        "error": None,
        "code": None,
    }


# ---------------------------------------------------------------------------
# Gradio Interface
# ---------------------------------------------------------------------------
demo = gr.Interface(
    fn=extract_embedding,
    inputs=gr.Textbox(
        label="Base64 Image",
        placeholder="Paste base64-encoded image here...",
        lines=3,
    ),
    outputs=gr.JSON(label="Result"),
    title="Farm2Door Face Embedding API",
    description=(
        "Detects a face in a base64-encoded image using SCRFD and extracts a "
        "512-dimensional ArcFace embedding using ResNet-100. "
        "Images are processed in memory and never saved to disk."
    ),
    examples=[],
    api_name="predict",
)

if __name__ == "__main__":
    demo.launch()
