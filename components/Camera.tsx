import React, { useEffect, useRef } from 'react';

interface CameraProps {
  isActive: boolean;
}

export const Camera: React.FC<CameraProps> = ({ isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      if (isActive && videoRef.current) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, 
            audio: false 
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Error accessing webcam:", err);
        }
      }
    };

    if (isActive) {
      startCamera();
    } else {
      // Stop tracks if not active
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isActive]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black rounded-2xl shadow-2xl border border-slate-800">
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
          カメラ停止中
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`}
      />
      {/* Overlay Gradient for text readability if we place text over video */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />
    </div>
  );
};