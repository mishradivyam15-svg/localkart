const { Client } = require('@gradio/client');
const User = require('../models/User');
const FaceBiometric = require('../models/FaceBiometric');
const { sendTokenResponse } = require('./auth.controller');
const { asyncHandler } = require('../utils/helpers');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const HF_SPACE_NAME = process.env.HF_SPACE_NAME; // e.g. "username/farm2door-face"
const HF_TOKEN = process.env.HF_TOKEN;            // Free HF User Access Token
const FACE_MATCH_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD) || 0.45;

// ---------------------------------------------------------------------------
// Singleton Gradio client (reuse connection across requests)
// ---------------------------------------------------------------------------
let gradioClient = null;

async function getGradioClient() {
  if (gradioClient) return gradioClient;

  if (!HF_SPACE_NAME) {
    throw new Error('Face recognition service is not configured. Set HF_SPACE_NAME in environment.');
  }

  try {
    gradioClient = await Client.connect(HF_SPACE_NAME, {
      hf_token: HF_TOKEN || undefined,
    });
    return gradioClient;
  } catch (error) {
    // Reset so next attempt tries again
    gradioClient = null;
    const err = new Error(
      'Unable to connect to face recognition service. It may be starting up — please try again in 30 seconds.'
    );
    err.code = 'SERVICE_UNAVAILABLE';
    throw err;
  }
}

/**
 * Call the Hugging Face Gradio Space to extract a face embedding.
 *
 * @param {string} base64Image - Base64-encoded JPEG/PNG image
 * @returns {Promise<{embedding: number[], face_score: number}>}
 */
async function getEmbeddingFromHFSpace(base64Image) {
  let client;
  try {
    client = await getGradioClient();
  } catch (error) {
    throw error; // Already formatted above
  }

  let result;
  try {
    result = await client.predict("/predict", {
      image_b64: base64Image,
    });
  } catch (error) {
    // Connection lost — reset client for next attempt
    gradioClient = null;

    if (error.message && error.message.includes('timed out')) {
      const err = new Error('Face recognition service timed out. It may be warming up — please try again in 30 seconds.');
      err.code = 'TIMEOUT';
      throw err;
    }

    const err = new Error('Unable to reach face recognition service. Please try again later.');
    err.code = 'SERVICE_UNAVAILABLE';
    throw err;
  }

  // Gradio returns result.data as the function's return value
  const data = result.data;

  if (!data || !data.success) {
    const errMsg = data?.error || 'Unknown error from face service';
    const err = new Error(errMsg);
    err.code = data?.code || 'HF_ERROR';
    throw err;
  }

  return {
    embedding: data.embedding,
    face_score: data.face_score,
  };
}

/**
 * Compute cosine similarity between two L2-normalized vectors.
 * For L2-normalized vectors, cosine similarity = dot product.
 *
 * @param {number[]} a - First embedding (512-dim)
 * @param {number[]} b - Second embedding (512-dim)
 * @returns {number} Similarity score in range [-1, 1]
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Embedding dimension mismatch');
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

// ================================
// @desc    Enroll face for authenticated user
// @route   POST /api/v1/face/enroll
// @access  Private (requires JWT)
// ================================
exports.enrollFace = asyncHandler(async (req, res) => {
  const { image } = req.body;

  if (!image) {
    return res.status(400).json({
      success: false,
      message: 'Face image is required',
    });
  }

  // Check if already enrolled
  const existing = await FaceBiometric.findOne({ userId: req.user._id });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: 'Face authentication is already enrolled. Please remove the existing enrollment first.',
      code: 'ALREADY_ENROLLED',
    });
  }

  // Get embedding from HF Space
  let embeddingData;
  try {
    embeddingData = await getEmbeddingFromHFSpace(image);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: error.code || 'EMBEDDING_FAILED',
    });
  }

  // Validate embedding dimensions
  if (!embeddingData.embedding || embeddingData.embedding.length !== 512) {
    return res.status(500).json({
      success: false,
      message: 'Invalid embedding received from face service',
    });
  }

  // Store embedding in FaceBiometric collection
  await FaceBiometric.create({
    userId: req.user._id,
    embedding: embeddingData.embedding,
  });

  // Update user flag
  await User.findByIdAndUpdate(req.user._id, { faceAuthEnabled: true });

  res.status(201).json({
    success: true,
    message: 'Face authentication enrolled successfully',
    data: {
      faceAuthEnabled: true,
      face_score: embeddingData.face_score,
    },
  });
});

// ================================
// @desc    Verify face and login (issues JWT)
// @route   POST /api/v1/face/verify
// @access  Public (rate-limited)
// ================================
exports.verifyFace = asyncHandler(async (req, res) => {
  const { email, image } = req.body;

  if (!email || !image) {
    return res.status(400).json({
      success: false,
      message: 'Email and face image are required',
    });
  }

  // Find user by email
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Generic message to prevent email enumeration
    return res.status(401).json({
      success: false,
      message: 'Face authentication failed',
    });
  }

  // Check if user account is active
  if (!user.isActive) {
    return res.status(403).json({
      success: false,
      message: 'Your account has been suspended',
    });
  }

  // Check if user has face auth enabled
  if (!user.faceAuthEnabled) {
    return res.status(400).json({
      success: false,
      message: 'Face authentication is not set up for this account. Please log in with your password and enroll your face first.',
      code: 'NOT_ENROLLED',
    });
  }

  // Check if email is verified
  if (!user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your email before logging in',
      needsVerification: true,
      email: user.email,
    });
  }

  // Load the stored embedding (explicitly select the hidden field)
  const biometric = await FaceBiometric.findOne({ userId: user._id }).select('+embedding');
  if (!biometric || !biometric.embedding) {
    // Data inconsistency — flag should be set but no biometric found
    await User.findByIdAndUpdate(user._id, { faceAuthEnabled: false });
    return res.status(400).json({
      success: false,
      message: 'Face enrollment data not found. Please re-enroll your face.',
      code: 'ENROLLMENT_DATA_MISSING',
    });
  }

  // Get embedding for the submitted face from HF Space
  let probeData;
  try {
    probeData = await getEmbeddingFromHFSpace(image);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: error.code || 'EMBEDDING_FAILED',
    });
  }

  // Compute cosine similarity
  const similarity = cosineSimilarity(
    biometric.embedding,
    probeData.embedding
  );

  // Log the similarity for debugging (never log the actual embeddings)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Face verify: email=${email}, similarity=${similarity.toFixed(4)}, threshold=${FACE_MATCH_THRESHOLD}`);
  }

  // Check if similarity exceeds threshold
  if (similarity < FACE_MATCH_THRESHOLD) {
    return res.status(401).json({
      success: false,
      message: 'Face authentication failed. The face does not match the enrolled face.',
      code: 'FACE_MISMATCH',
    });
  }

  // Success! Use the existing sendTokenResponse to issue JWT
  // This is the EXACT same function used by password login
  sendTokenResponse(user, 200, res);
});

// ================================
// @desc    Remove face enrollment
// @route   DELETE /api/v1/face/enroll
// @access  Private (requires JWT)
// ================================
exports.unenrollFace = asyncHandler(async (req, res) => {
  // Delete biometric record
  const result = await FaceBiometric.findOneAndDelete({ userId: req.user._id });

  // Update user flag
  await User.findByIdAndUpdate(req.user._id, { faceAuthEnabled: false });

  if (!result) {
    return res.status(404).json({
      success: false,
      message: 'No face enrollment found',
    });
  }

  res.json({
    success: true,
    message: 'Face authentication removed successfully',
    data: { faceAuthEnabled: false },
  });
});

// ================================
// @desc    Get face enrollment status
// @route   GET /api/v1/face/status
// @access  Private (requires JWT)
// ================================
exports.getFaceStatus = asyncHandler(async (req, res) => {
  const biometric = await FaceBiometric.findOne({ userId: req.user._id });

  res.json({
    success: true,
    data: {
      enrolled: !!biometric,
      faceAuthEnabled: req.user.faceAuthEnabled,
      enrolledAt: biometric?.enrolledAt || null,
    },
  });
});
