/**
 * Face Service — Browser-side face detection & liveness checking
 * ================================================================
 * Uses Google MediaPipe FaceLandmarker for:
 *   - Real-time face detection (UI feedback)
 *   - Blink detection via Eye Aspect Ratio (EAR)
 *   - Head movement tracking via nose-tip displacement
 *   - Randomized liveness challenges
 *
 * This service does NOT perform face recognition.
 * Recognition is handled server-side via ArcFace on the HF Docker Space.
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// ---------------------------------------------------------------------------
// Singleton landmarker instance
// ---------------------------------------------------------------------------
let faceLandmarker = null;
let isLoading = false;

/**
 * Lazily initialize the MediaPipe FaceLandmarker.
 * Downloads ~2MB of WASM + model files from CDN on first use.
 */
export async function initFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  if (isLoading) {
    // Wait for the ongoing load
    while (isLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return faceLandmarker;
  }

  isLoading = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 3, // Detect up to 3 faces so we can reject multi-face
      outputFaceBlendshapes: true, // Needed for blink detection
      outputFacialTransformationMatrixes: false,
    });

    return faceLandmarker;
  } catch (err) {
    console.error('Failed to initialize FaceLandmarker:', err);
    // Retry with CPU delegate if GPU fails
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numFaces: 3,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });
      return faceLandmarker;
    } catch (cpuErr) {
      console.error('FaceLandmarker CPU fallback also failed:', cpuErr);
      throw cpuErr;
    }
  } finally {
    isLoading = false;
  }
}

// ---------------------------------------------------------------------------
// Face detection (for UI feedback)
// ---------------------------------------------------------------------------

/**
 * Detect faces in a video frame.
 * @param {HTMLVideoElement} video
 * @returns {{ faceCount: number, landmarks: Array|null, blendshapes: Array|null }}
 */
export function detectFaces(video) {
  if (!faceLandmarker || !video || video.readyState < 2) {
    return { faceCount: 0, landmarks: null, blendshapes: null };
  }

  const now = performance.now();
  const result = faceLandmarker.detectForVideo(video, now);

  return {
    faceCount: result.faceLandmarks?.length || 0,
    landmarks: result.faceLandmarks?.[0] || null,
    blendshapes: result.faceBlendshapes?.[0]?.categories || null,
  };
}

// ---------------------------------------------------------------------------
// Eye Aspect Ratio (EAR) — Blink Detection
// ---------------------------------------------------------------------------

// MediaPipe FaceLandmarker landmark indices for left and right eye
const LEFT_EYE = {
  p1: 33,  p2: 160, p3: 158, p4: 133, p5: 153, p6: 144,
};
const RIGHT_EYE = {
  p1: 362, p2: 385, p3: 387, p4: 263, p5: 380, p6: 373,
};

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Calculate Eye Aspect Ratio for one eye.
 * EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 */
function earForEye(landmarks, eye) {
  const p1 = landmarks[eye.p1];
  const p2 = landmarks[eye.p2];
  const p3 = landmarks[eye.p3];
  const p4 = landmarks[eye.p4];
  const p5 = landmarks[eye.p5];
  const p6 = landmarks[eye.p6];

  const vertical1 = distance(p2, p6);
  const vertical2 = distance(p3, p5);
  const horizontal = distance(p1, p4);

  if (horizontal === 0) return 0.3; // Fallback
  return (vertical1 + vertical2) / (2 * horizontal);
}

/**
 * Compute average EAR across both eyes.
 * @param {Array} landmarks - 468 face landmarks
 * @returns {number} Average EAR
 */
export function computeEAR(landmarks) {
  if (!landmarks || landmarks.length < 400) return 0.3;
  const leftEAR = earForEye(landmarks, LEFT_EYE);
  const rightEAR = earForEye(landmarks, RIGHT_EYE);
  return (leftEAR + rightEAR) / 2;
}

/**
 * Alternative blink detection using MediaPipe Blendshapes.
 * Uses eyeBlinkLeft and eyeBlinkRight scores (0-1, 1 = fully closed).
 * @param {Array} blendshapes - Blendshape categories from FaceLandmarker
 * @returns {number} Average blink score (0-1, higher = more closed)
 */
export function getBlinkScore(blendshapes) {
  if (!blendshapes) return 0;
  const leftBlink = blendshapes.find((b) => b.categoryName === 'eyeBlinkLeft');
  const rightBlink = blendshapes.find((b) => b.categoryName === 'eyeBlinkRight');
  const left = leftBlink?.score || 0;
  const right = rightBlink?.score || 0;
  return (left + right) / 2;
}

// ---------------------------------------------------------------------------
// Head Movement Detection
// ---------------------------------------------------------------------------

// Nose tip landmark index in MediaPipe
const NOSE_TIP = 1;

/**
 * Get normalized nose-tip position for head movement tracking.
 * @param {Array} landmarks
 * @returns {{ x: number, y: number } | null}
 */
export function getNosePosition(landmarks) {
  if (!landmarks || landmarks.length < 5) return null;
  const nose = landmarks[NOSE_TIP];
  return { x: nose.x, y: nose.y };
}

/**
 * Calculate total head movement from a history of nose positions.
 * @param {Array<{x: number, y: number}>} history
 * @returns {number} Total displacement (0-1 normalized coordinates)
 */
export function calculateHeadMovement(history) {
  if (history.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < history.length; i++) {
    total += distance(history[i], history[i - 1]);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Liveness Challenge System
// ---------------------------------------------------------------------------

const CHALLENGES = [
  { type: 'blink', instruction: 'Please blink your eyes', icon: '👁️' },
  { type: 'turn_left', instruction: 'Turn your head slightly left', icon: '↩️' },
  { type: 'turn_right', instruction: 'Turn your head slightly right', icon: '↪️' },
];

/**
 * Get a random liveness challenge.
 */
export function getRandomChallenge() {
  return CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
}

// ---------------------------------------------------------------------------
// Liveness Checker Class
// ---------------------------------------------------------------------------

/**
 * Manages the entire liveness detection flow.
 *
 * Checks:
 * 1. Face present across ≥80% of frames over 3 seconds
 * 2. Blink detected (EAR drops below threshold or blendshape score high)
 * 3. Head movement detected (nose displacement > threshold)
 * 4. Challenge-response (random action requested and verified)
 */
export class LivenessChecker {
  constructor() {
    this.reset();
  }

  reset() {
    this.frameCount = 0;
    this.faceFrameCount = 0;
    this.blinkDetected = false;
    this.blinkFrameCount = 0;
    this.headMovementDetected = false;
    this.noseHistory = [];
    this.earHistory = [];
    this.blinkScoreHistory = [];
    this.challengeCompleted = false;
    this.challenge = getRandomChallenge();
    this.startTime = Date.now();

    // Thresholds
    this.EAR_BLINK_THRESHOLD = 0.2;
    this.BLINK_SCORE_THRESHOLD = 0.5; // Blendshape-based
    this.BLINK_CONSEC_FRAMES = 2;
    this.HEAD_MOVEMENT_THRESHOLD = 0.03; // Normalized coords
    this.MIN_FACE_PRESENCE_RATIO = 0.8;
    this.MIN_FRAMES = 30; // ~1 second at 30fps
    this.MAX_TIME_MS = 15000; // 15 second timeout
  }

  /**
   * Process a single frame for liveness signals.
   * @param {Array} landmarks - 468 face landmarks
   * @param {Array} blendshapes - Blendshape categories
   * @returns {{ status: string, progress: object, challenge: object }}
   */
  processFrame(landmarks, blendshapes) {
    this.frameCount++;

    if (landmarks) {
      this.faceFrameCount++;

      // EAR-based blink detection
      const ear = computeEAR(landmarks);
      this.earHistory.push(ear);

      if (ear < this.EAR_BLINK_THRESHOLD) {
        this.blinkFrameCount++;
        if (this.blinkFrameCount >= this.BLINK_CONSEC_FRAMES) {
          this.blinkDetected = true;
        }
      } else {
        this.blinkFrameCount = 0;
      }

      // Blendshape-based blink detection (more robust)
      const blinkScore = getBlinkScore(blendshapes);
      this.blinkScoreHistory.push(blinkScore);
      if (blinkScore > this.BLINK_SCORE_THRESHOLD) {
        this.blinkDetected = true;
      }

      // Head movement tracking
      const nose = getNosePosition(landmarks);
      if (nose) {
        this.noseHistory.push(nose);
        // Keep last 60 positions (~2 seconds)
        if (this.noseHistory.length > 60) {
          this.noseHistory.shift();
        }
        const movement = calculateHeadMovement(this.noseHistory);
        if (movement > this.HEAD_MOVEMENT_THRESHOLD) {
          this.headMovementDetected = true;
        }
      }
    }

    // Check challenge completion based on type
    if (this.challenge.type === 'blink' && this.blinkDetected) {
      this.challengeCompleted = true;
    } else if (this.challenge.type === 'turn_left' || this.challenge.type === 'turn_right') {
      if (this.headMovementDetected) {
        this.challengeCompleted = true;
      }
    }

    // Build progress report
    const facePresenceRatio = this.frameCount > 0
      ? this.faceFrameCount / this.frameCount
      : 0;

    const elapsed = Date.now() - this.startTime;
    const timedOut = elapsed > this.MAX_TIME_MS;

    const progress = {
      facePresence: facePresenceRatio,
      blinkDetected: this.blinkDetected,
      headMovement: this.headMovementDetected,
      challengeCompleted: this.challengeCompleted,
      framesProcessed: this.frameCount,
      elapsed,
    };

    // Determine status
    let status = 'checking';

    if (timedOut) {
      status = 'timeout';
    } else if (
      this.frameCount >= this.MIN_FRAMES &&
      facePresenceRatio >= this.MIN_FACE_PRESENCE_RATIO &&
      this.blinkDetected &&
      this.headMovementDetected &&
      this.challengeCompleted
    ) {
      status = 'passed';
    }

    return {
      status,
      progress,
      challenge: this.challenge,
    };
  }
}

// ---------------------------------------------------------------------------
// Frame Capture
// ---------------------------------------------------------------------------

/**
 * Capture a single frame from a video element as base64 JPEG.
 * @param {HTMLVideoElement} video
 * @param {number} quality - JPEG quality 0-1 (default 0.85)
 * @returns {string} Base64-encoded JPEG (without data URI prefix)
 */
export function captureFrame(video, quality = 0.85) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  // Return base64 without prefix — backend handles both formats
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl;
}

// ---------------------------------------------------------------------------
// Camera Utilities
// ---------------------------------------------------------------------------

/**
 * Request camera access.
 * @returns {Promise<MediaStream>}
 */
export async function getCameraStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera is not supported in this browser');
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user', // Front camera
      },
      audio: false,
    });
    return stream;
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      throw new Error('Camera permission denied. Please allow camera access to use face authentication.');
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      throw new Error('No camera found. Please connect a camera to use face authentication.');
    }
    if (err.name === 'NotReadableError') {
      throw new Error('Camera is in use by another application. Please close other apps using the camera.');
    }
    throw new Error('Failed to access camera: ' + err.message);
  }
}

/**
 * Stop all tracks on a media stream.
 * @param {MediaStream} stream
 */
export function stopCameraStream(stream) {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
}
