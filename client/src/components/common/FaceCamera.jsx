/**
 * FaceCamera — Reusable webcam component with face detection overlay
 * ====================================================================
 * Handles camera permission, video stream, real-time face detection
 * feedback, and proper cleanup on unmount.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, CameraOff, AlertCircle } from 'lucide-react';
import {
  initFaceLandmarker,
  detectFaces,
  getCameraStream,
  stopCameraStream,
} from '../../services/faceService';

/**
 * @param {Object} props
 * @param {Function} props.onFrame - Called each animation frame with { faceCount, landmarks, blendshapes, video }
 * @param {boolean} props.active - Whether the camera should be running
 * @param {string} props.statusMessage - Optional custom status message to display
 * @param {string} props.statusType - 'info' | 'success' | 'warning' | 'error'
 * @param {React.ReactNode} props.children - Optional overlay content
 */
export default function FaceCamera({
  onFrame,
  active = true,
  statusMessage,
  statusType = 'info',
  children,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);

  const [cameraState, setCameraState] = useState('initializing'); // initializing | loading_model | ready | error
  const [error, setError] = useState(null);
  const [faceCount, setFaceCount] = useState(0);

  // --------------------------------------------------
  // Start camera + load model
  // --------------------------------------------------
  const startCamera = useCallback(async () => {
    try {
      setCameraState('initializing');
      setError(null);

      // Request camera
      const stream = await getCameraStream();
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Load MediaPipe model
      setCameraState('loading_model');
      await initFaceLandmarker();

      setCameraState('ready');
    } catch (err) {
      setError(err.message);
      setCameraState('error');
    }
  }, []);

  // --------------------------------------------------
  // Detection loop
  // --------------------------------------------------
  const runDetection = useCallback(() => {
    if (cameraState !== 'ready' || !videoRef.current) return;

    const video = videoRef.current;
    const result = detectFaces(video);

    setFaceCount(result.faceCount);

    // Draw face overlay on canvas
    if (canvasRef.current && video.videoWidth > 0) {
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (result.landmarks) {
        // Draw face mesh outline (jaw line for a clean indicator)
        const jawIndices = [
          10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
          397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
          172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
        ];

        ctx.strokeStyle = result.faceCount === 1 ? '#10b981' : '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();

        jawIndices.forEach((idx, i) => {
          const point = result.landmarks[idx];
          if (!point) return;
          const x = point.x * canvas.width;
          const y = point.y * canvas.height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });

        ctx.closePath();
        ctx.stroke();

        // Draw eye indicators
        const leftEyeCenter = result.landmarks[468] || result.landmarks[159];
        const rightEyeCenter = result.landmarks[473] || result.landmarks[386];

        [leftEyeCenter, rightEyeCenter].forEach((eye) => {
          if (!eye) return;
          ctx.beginPath();
          ctx.arc(
            eye.x * canvas.width,
            eye.y * canvas.height,
            4,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = '#10b981';
          ctx.fill();
        });
      }
    }

    // Notify parent
    if (onFrame) {
      onFrame({
        faceCount: result.faceCount,
        landmarks: result.landmarks,
        blendshapes: result.blendshapes,
        video,
      });
    }

    animFrameRef.current = requestAnimationFrame(runDetection);
  }, [cameraState, onFrame]);

  // --------------------------------------------------
  // Lifecycle
  // --------------------------------------------------
  useEffect(() => {
    if (active) {
      startCamera();
    }

    return () => {
      // Cleanup: stop camera and cancel animation frame
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (streamRef.current) {
        stopCameraStream(streamRef.current);
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [active, startCamera]);

  // Start detection loop when camera is ready
  useEffect(() => {
    if (cameraState === 'ready') {
      animFrameRef.current = requestAnimationFrame(runDetection);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [cameraState, runDetection]);

  // --------------------------------------------------
  // Status indicator styles
  // --------------------------------------------------
  const statusColors = {
    info: 'bg-sky-50 text-sky-700 border-sky-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    error: 'bg-red-50 text-red-700 border-red-200',
  };

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-neutral-950">
      {/* Video + Canvas overlay */}
      <div className="relative aspect-[4/3]">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          style={{ transform: 'scaleX(-1)' }} // Mirror for selfie
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Loading overlay */}
        {cameraState !== 'ready' && cameraState !== 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/80 text-white">
            <div className="w-10 h-10 border-3 border-sky-400/30 border-t-sky-400 rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium">
              {cameraState === 'initializing'
                ? 'Starting camera...'
                : 'Loading face detection...'}
            </p>
          </div>
        )}

        {/* Error overlay */}
        {cameraState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/90 text-white p-6 text-center">
            <CameraOff className="w-12 h-12 text-red-400 mb-4" />
            <p className="text-sm font-medium text-red-300 mb-2">
              Camera Error
            </p>
            <p className="text-xs text-neutral-400 max-w-xs">{error}</p>
            <button
              onClick={startCamera}
              className="mt-4 px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-400 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Face count indicator */}
        {cameraState === 'ready' && (
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${
                faceCount === 1
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : faceCount === 0
                  ? 'bg-neutral-500/20 text-neutral-300 border border-neutral-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              <Camera className="w-3 h-3" />
              {faceCount === 1
                ? 'Face Detected'
                : faceCount === 0
                ? 'No Face'
                : `${faceCount} Faces`}
            </div>
          </div>
        )}

        {/* Children overlay (for liveness UI) */}
        {children}
      </div>

      {/* Status message bar */}
      {statusMessage && (
        <div
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-t ${
            statusColors[statusType] || statusColors.info
          }`}
        >
          {statusType === 'error' ? (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          ) : null}
          {statusMessage}
        </div>
      )}
    </div>
  );
}
