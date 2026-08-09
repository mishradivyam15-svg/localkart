/**
 * FaceEnrollment — Modal for enrolling face authentication
 * ===========================================================
 * Flow: Camera → Face Detection → Liveness Check → Capture → Upload → Done
 */

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ShieldCheck,
  ScanFace,
  CheckCircle,
  AlertCircle,
  Loader,
} from 'lucide-react';
import toast from 'react-hot-toast';
import FaceCamera from './FaceCamera';
import { LivenessChecker, captureFrame } from '../../services/faceService';
import { faceAPI } from '../../api';

const STEPS = {
  INTRO: 'intro',
  CAMERA: 'camera',
  LIVENESS: 'liveness',
  CAPTURING: 'capturing',
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * @param {Object} props
 * @param {Function} props.onClose - Called when modal is closed
 * @param {Function} props.onSuccess - Called after successful enrollment
 */
export default function FaceEnrollment({ onClose, onSuccess }) {
  const [step, setStep] = useState(STEPS.INTRO);
  const [error, setError] = useState(null);
  const [livenessProgress, setLivenessProgress] = useState(null);
  const [challenge, setChallenge] = useState(null);

  const livenessRef = useRef(null);
  const capturedFrameRef = useRef(null);
  const videoRef = useRef(null);

  // --------------------------------------------------
  // Start the enrollment flow
  // --------------------------------------------------
  const startEnrollment = () => {
    setStep(STEPS.CAMERA);
    setError(null);
    livenessRef.current = new LivenessChecker();
    setChallenge(livenessRef.current.challenge);
  };

  // --------------------------------------------------
  // Handle each video frame from FaceCamera
  // --------------------------------------------------
  const handleFrame = useCallback(
    ({ faceCount, landmarks, blendshapes, video }) => {
      if (step !== STEPS.CAMERA && step !== STEPS.LIVENESS) return;

      videoRef.current = video;

      // Wait for exactly 1 face
      if (faceCount !== 1) return;

      // Switch to liveness checking once face is detected
      if (step === STEPS.CAMERA) {
        setStep(STEPS.LIVENESS);
      }

      // Process liveness
      if (livenessRef.current && step === STEPS.LIVENESS) {
        const result = livenessRef.current.processFrame(landmarks, blendshapes);
        setLivenessProgress(result.progress);
        setChallenge(result.challenge);

        if (result.status === 'passed') {
          handleLivenessPassed(video);
        } else if (result.status === 'timeout') {
          setError(
            'Liveness check timed out. Please ensure good lighting and try again.'
          );
          setStep(STEPS.ERROR);
        }
      }
    },
    [step]
  );

  // --------------------------------------------------
  // Liveness passed → capture and upload
  // --------------------------------------------------
  const handleLivenessPassed = async (video) => {
    setStep(STEPS.CAPTURING);

    // Capture frame
    const frame = captureFrame(video);
    capturedFrameRef.current = frame;

    // Upload to backend
    setStep(STEPS.UPLOADING);
    try {
      const { data } = await faceAPI.enroll({ image: frame });
      if (data.success) {
        setStep(STEPS.SUCCESS);
        toast.success('Face authentication enrolled!');
        if (onSuccess) onSuccess();
      } else {
        throw new Error(data.message || 'Enrollment failed');
      }
    } catch (err) {
      const msg =
        err.response?.data?.message || err.message || 'Enrollment failed';
      setError(msg);
      setStep(STEPS.ERROR);
    }
  };

  // --------------------------------------------------
  // Retry from error
  // --------------------------------------------------
  const retry = () => {
    setError(null);
    livenessRef.current = new LivenessChecker();
    setChallenge(livenessRef.current.challenge);
    setStep(STEPS.CAMERA);
  };

  // --------------------------------------------------
  // Liveness progress UI
  // --------------------------------------------------
  const renderLivenessIndicators = () => {
    if (!livenessProgress) return null;

    const checks = [
      {
        label: 'Face detected',
        done: livenessProgress.facePresence > 0.5,
      },
      {
        label: 'Blink detected',
        done: livenessProgress.blinkDetected,
      },
      {
        label: 'Head movement',
        done: livenessProgress.headMovement,
      },
      {
        label: challenge?.instruction || 'Challenge',
        done: livenessProgress.challengeCompleted,
      },
    ];

    return (
      <div className="absolute bottom-3 left-3 right-3">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg p-3 space-y-1.5">
          {checks.map((check, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs text-white"
            >
              {check.done ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-white/40 flex-shrink-0" />
              )}
              <span className={check.done ? 'text-emerald-300' : 'text-white/70'}>
                {check.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl shadow-elevated w-full max-w-lg overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <ScanFace className="w-5 h-5 text-sky-500" />
              <h3 className="text-lg font-bold text-neutral-900">
                Set Up Face Login
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
            >
              <X className="w-5 h-5 text-neutral-500" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6">
            {/* INTRO */}
            {step === STEPS.INTRO && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-100 to-emerald-100 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-8 h-8 text-sky-600" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-neutral-900 mb-2">
                    Enable Face Authentication
                  </h4>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    Use your face to quickly sign in to Farm2Door. We'll need
                    camera access to capture your facial features. Your face
                    data is securely encrypted and never stored as an image.
                  </p>
                </div>
                <div className="bg-sky-50 rounded-xl p-4 text-left">
                  <p className="text-xs font-semibold text-sky-800 mb-2">
                    What to expect:
                  </p>
                  <ul className="text-xs text-sky-700 space-y-1">
                    <li>• Camera will open for a few seconds</li>
                    <li>• You'll be asked to blink or move your head</li>
                    <li>• A secure facial signature is generated</li>
                    <li>• No photographs are saved</li>
                  </ul>
                </div>
                <button onClick={startEnrollment} className="btn-primary w-full !py-3">
                  <ScanFace className="w-5 h-5" />
                  Start Setup
                </button>
              </div>
            )}

            {/* CAMERA / LIVENESS */}
            {(step === STEPS.CAMERA || step === STEPS.LIVENESS) && (
              <div className="space-y-3">
                <FaceCamera
                  active={true}
                  onFrame={handleFrame}
                  statusMessage={
                    step === STEPS.CAMERA
                      ? 'Position your face in the frame'
                      : challenge
                      ? `${challenge.icon} ${challenge.instruction}`
                      : 'Performing liveness check...'
                  }
                  statusType={step === STEPS.CAMERA ? 'info' : 'warning'}
                >
                  {step === STEPS.LIVENESS && renderLivenessIndicators()}
                </FaceCamera>
                <p className="text-xs text-neutral-400 text-center">
                  Ensure good lighting • Keep your face centered • Follow the
                  instructions
                </p>
              </div>
            )}

            {/* CAPTURING / UPLOADING */}
            {(step === STEPS.CAPTURING || step === STEPS.UPLOADING) && (
              <div className="text-center py-8 space-y-4">
                <div className="w-12 h-12 border-3 border-sky-400/30 border-t-sky-400 rounded-full animate-spin mx-auto" />
                <div>
                  <p className="font-semibold text-neutral-900">
                    {step === STEPS.CAPTURING
                      ? 'Capturing face...'
                      : 'Enrolling your face...'}
                  </p>
                  <p className="text-sm text-neutral-500 mt-1">
                    {step === STEPS.UPLOADING
                      ? 'Generating secure facial embedding via ArcFace model'
                      : 'Please wait'}
                  </p>
                </div>
              </div>
            )}

            {/* SUCCESS */}
            {step === STEPS.SUCCESS && (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-neutral-900">
                    Face Login Enabled!
                  </h4>
                  <p className="text-sm text-neutral-500 mt-1">
                    You can now sign in using your face. Your password login
                    remains active as a backup.
                  </p>
                </div>
                <button onClick={onClose} className="btn-primary !py-2.5">
                  Done
                </button>
              </div>
            )}

            {/* ERROR */}
            {step === STEPS.ERROR && (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-neutral-900">
                    Enrollment Failed
                  </h4>
                  <p className="text-sm text-neutral-500 mt-1">{error}</p>
                </div>
                <div className="flex gap-3 justify-center">
                  <button onClick={retry} className="btn-primary !py-2.5">
                    Try Again
                  </button>
                  <button onClick={onClose} className="btn-secondary !py-2.5">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
