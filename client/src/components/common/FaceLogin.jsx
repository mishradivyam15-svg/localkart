/**
 * FaceLogin — Face authentication login component
 * ==================================================
 * Flow: Enter email → Camera → Liveness → Verify → JWT → Redirect
 */

import { useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ScanFace,
  Mail,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import FaceCamera from './FaceCamera';
import { LivenessChecker, captureFrame } from '../../services/faceService';
import { faceLogin, getMe, clearError } from '../../features/authSlice';

const STEPS = {
  EMAIL: 'email',
  CAMERA: 'camera',
  LIVENESS: 'liveness',
  VERIFYING: 'verifying',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * @param {Object} props
 * @param {Function} props.onClose - Called when modal/component is closed
 */
export default function FaceLogin({ onClose }) {
  const [step, setStep] = useState(STEPS.EMAIL);
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [livenessProgress, setLivenessProgress] = useState(null);
  const [challenge, setChallenge] = useState(null);

  const livenessRef = useRef(null);
  const videoRef = useRef(null);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const from = location.state?.from?.pathname || '/';

  // --------------------------------------------------
  // Email step → Camera
  // --------------------------------------------------
  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || !/^\S+@\S+$/i.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setError(null);
    livenessRef.current = new LivenessChecker();
    setChallenge(livenessRef.current.challenge);
    setStep(STEPS.CAMERA);
  };

  // --------------------------------------------------
  // Handle each video frame
  // --------------------------------------------------
  const handleFrame = useCallback(
    ({ faceCount, landmarks, blendshapes, video }) => {
      if (step !== STEPS.CAMERA && step !== STEPS.LIVENESS) return;

      videoRef.current = video;

      if (faceCount !== 1) return;

      if (step === STEPS.CAMERA) {
        setStep(STEPS.LIVENESS);
      }

      if (livenessRef.current && step === STEPS.LIVENESS) {
        const result = livenessRef.current.processFrame(landmarks, blendshapes);
        setLivenessProgress(result.progress);
        setChallenge(result.challenge);

        if (result.status === 'passed') {
          handleLivenessPassed(video);
        } else if (result.status === 'timeout') {
          setError('Liveness check timed out. Please try again.');
          setStep(STEPS.ERROR);
        }
      }
    },
    [step]
  );

  // --------------------------------------------------
  // Liveness passed → verify with backend
  // --------------------------------------------------
  const handleLivenessPassed = async (video) => {
    setStep(STEPS.VERIFYING);

    const frame = captureFrame(video);

    // Clear old cached data
    queryClient.clear();
    dispatch(clearError());

    const result = await dispatch(faceLogin({ email, image: frame }));

    if (faceLogin.fulfilled.match(result)) {
      setStep(STEPS.SUCCESS);

      // Fetch fresh profile
      await dispatch(getMe());

      toast.success('Welcome back!');

      const role = result.payload.data.role;
      const dashMap = {
        customer: '/dashboard',
        farmer: '/farmer/dashboard',
        delivery: '/delivery/dashboard',
        admin: '/admin/dashboard',
      };

      // Short delay for success animation, then navigate
      setTimeout(() => {
        navigate(from !== '/' ? from : dashMap[role] || '/dashboard');
      }, 800);
    } else {
      const errMsg = result.payload || 'Face authentication failed';
      const code = result.payload?.code;
      setError(errMsg);
      setErrorCode(code);
      setStep(STEPS.ERROR);
    }
  };

  // --------------------------------------------------
  // Retry
  // --------------------------------------------------
  const retry = () => {
    setError(null);
    setErrorCode(null);
    livenessRef.current = new LivenessChecker();
    setChallenge(livenessRef.current.challenge);
    setStep(STEPS.CAMERA);
  };

  const goBackToEmail = () => {
    setError(null);
    setErrorCode(null);
    setStep(STEPS.EMAIL);
  };

  // --------------------------------------------------
  // Liveness indicators
  // --------------------------------------------------
  const renderLivenessIndicators = () => {
    if (!livenessProgress) return null;

    const checks = [
      { label: 'Face detected', done: livenessProgress.facePresence > 0.5 },
      { label: 'Blink detected', done: livenessProgress.blinkDetected },
      { label: 'Head movement', done: livenessProgress.headMovement },
      {
        label: challenge?.instruction || 'Challenge',
        done: livenessProgress.challengeCompleted,
      },
    ];

    return (
      <div className="absolute bottom-3 left-3 right-3">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg p-3 space-y-1.5">
          {checks.map((check, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-white">
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
                Login with Face
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
            {/* EMAIL STEP */}
            {step === STEPS.EMAIL && (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="text-center mb-2">
                  <p className="text-sm text-neutral-500">
                    Enter your email to identify your account, then verify with
                    your face.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`input pl-11 ${error ? 'input-error' : ''}`}
                      placeholder="you@example.com"
                      autoFocus
                    />
                  </div>
                  {error && (
                    <p className="text-red-500 text-xs mt-1">{error}</p>
                  )}
                </div>

                <button type="submit" className="btn-primary w-full !py-3">
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="btn-ghost w-full text-neutral-500"
                >
                  Use password instead
                </button>
              </form>
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={goBackToEmail}
                    className="btn-ghost text-sm text-neutral-500"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Change email
                  </button>
                  <span className="text-xs text-neutral-400 ml-auto">
                    {email}
                  </span>
                </div>
              </div>
            )}

            {/* VERIFYING */}
            {step === STEPS.VERIFYING && (
              <div className="text-center py-8 space-y-4">
                <div className="w-12 h-12 border-3 border-sky-400/30 border-t-sky-400 rounded-full animate-spin mx-auto" />
                <div>
                  <p className="font-semibold text-neutral-900">
                    Verifying your identity...
                  </p>
                  <p className="text-sm text-neutral-500 mt-1">
                    Comparing face embedding with ArcFace model
                  </p>
                </div>
              </div>
            )}

            {/* SUCCESS */}
            {step === STEPS.SUCCESS && (
              <div className="text-center py-8 space-y-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto"
                >
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </motion.div>
                <div>
                  <h4 className="text-lg font-bold text-neutral-900">
                    Identity Verified!
                  </h4>
                  <p className="text-sm text-neutral-500 mt-1">
                    Logging you in...
                  </p>
                </div>
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
                    Authentication Failed
                  </h4>
                  <p className="text-sm text-neutral-500 mt-1">{error}</p>
                </div>

                {errorCode === 'NOT_ENROLLED' ? (
                  <div className="bg-sky-50 rounded-xl p-4 text-sm text-sky-700">
                    <p>
                      Face login hasn't been set up yet. Please log in with your
                      password, then enable face authentication from your
                      Profile settings.
                    </p>
                  </div>
                ) : null}

                <div className="flex gap-3 justify-center">
                  {errorCode !== 'NOT_ENROLLED' && (
                    <button onClick={retry} className="btn-primary !py-2.5">
                      Try Again
                    </button>
                  )}
                  <button onClick={onClose} className="btn-secondary !py-2.5">
                    Use Password
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
