import { useEffect, useRef, useState } from "react";
import { getCustomerInitials } from "../utils/customerPhoto";

export default function CustomerPhotoField({ photo, fullName, onChange }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");

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

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is not supported on this device.");
        return;
      }

      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
      });

      streamRef.current = stream;
      setCameraOpen(true);
      setCameraError("");
    } catch (error) {
      setCameraError("Unable to access the camera. Please allow camera permission.");
    }
  };

  const cancelCamera = () => {
    stopCamera();
    setCameraOpen(false);
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
              <button className="button" type="button" onClick={capturePhoto}>
                Capture photo
              </button>
              <button className="button button--ghost" type="button" onClick={cancelCamera}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="camera-capture__actions">
            <button className="button button--ghost" type="button" onClick={startCamera}>
              Open camera
            </button>
            {photo ? (
              <button className="button button--ghost" type="button" onClick={startCamera}>
                Retake
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
