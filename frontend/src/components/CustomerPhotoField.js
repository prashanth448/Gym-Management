import { useEffect, useRef, useState } from "react";
import { getCustomerInitials } from "../utils/customerPhoto";

export default function CustomerPhotoField({ photo, fullName, onChange }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraFacingMode, setCameraFacingMode] = useState("environment");
  const [cameraLoading, setCameraLoading] = useState(false);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => stopCamera, []);

  const attachStreamToVideo = async (stream) => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = stream;
    await videoRef.current.play().catch(() => {});
  };

  const requestCameraStream = async (preferredFacingMode) => {
    const attempts = [
      { video: { facingMode: { exact: preferredFacingMode } }, audio: false },
      { video: { facingMode: preferredFacingMode }, audio: false },
      { video: true, audio: false }
    ];

    let lastError = null;

    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  };

  const startCamera = async (preferredFacingMode = "environment") => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is not supported on this device.");
        return;
      }

      setCameraLoading(true);
      stopCamera();
      const stream = await requestCameraStream(preferredFacingMode);

      streamRef.current = stream;
      setCameraFacingMode(preferredFacingMode);
      setCameraError("");
      setCameraOpen(true);
      await attachStreamToVideo(stream);
    } catch (error) {
      setCameraError("Unable to access the camera. Please allow camera permission.");
      setCameraOpen(false);
    } finally {
      setCameraLoading(false);
    }
  };

  const cancelCamera = () => {
    stopCamera();
    setCameraOpen(false);
  };

  const switchCamera = async () => {
    const nextFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
    await startCamera(nextFacingMode);
  };

  const capturePhoto = () => {
    if (!videoRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 480;
    const height = video.videoHeight || 640;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      setCameraError("Unable to capture this photo.");
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    onChange(canvas.toDataURL("image/jpeg", 0.85));
    cancelCamera();
  };

  return (
    <div className="photo-field">
      <div className="customer-photo-preview customer-photo-preview--large">
        {photo ? (
          <img src={photo} alt={`${fullName || "Member"} profile`} />
        ) : (
          <span>{getCustomerInitials(fullName)}</span>
        )}
      </div>

      <div className="photo-field__controls">
        <span className="field-label">Profile photo</span>

        {cameraOpen ? (
          <div className="camera-capture">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="camera-capture__actions">
              <button className="button" type="button" onClick={capturePhoto} disabled={cameraLoading}>
                Capture photo
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={switchCamera}
                disabled={cameraLoading}
              >
                {cameraLoading
                  ? "Switching camera..."
                  : cameraFacingMode === "environment"
                    ? "Use front camera"
                    : "Use back camera"}
              </button>
              <button className="button button--ghost" type="button" onClick={cancelCamera}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="camera-capture__actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => startCamera("environment")}
              disabled={cameraLoading}
            >
              {cameraLoading ? "Opening camera..." : "Open back camera"}
            </button>
            {photo ? (
              <button
                className="button button--ghost"
                type="button"
                onClick={() => startCamera("environment")}
                disabled={cameraLoading}
              >
                Retake photo
              </button>
            ) : null}
          </div>
        )}

        {cameraError ? (
          <div className="panel-empty panel-empty--error">{cameraError}</div>
        ) : null}

        {photo ? (
          <button className="text-link" type="button" onClick={() => onChange("")}>
            Remove photo
          </button>
        ) : null}
      </div>
    </div>
  );
}
