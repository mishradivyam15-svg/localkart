const express = require('express');
const router = express.Router();
const {
  enrollFace,
  verifyFace,
  unenrollFace,
  getFaceStatus
} = require('../controllers/face.controller');
const { protect } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

// Enroll face — requires authentication (user must be logged in)
router.post('/enroll', protect, validate(schemas.faceEnroll), enrollFace);

// Verify face — public endpoint (used for login, rate-limited in app.js)
router.post('/verify', validate(schemas.faceVerify), verifyFace);

// Remove face enrollment — requires authentication
router.delete('/enroll', protect, unenrollFace);

// Get face enrollment status — requires authentication
router.get('/status', protect, getFaceStatus);

module.exports = router;
