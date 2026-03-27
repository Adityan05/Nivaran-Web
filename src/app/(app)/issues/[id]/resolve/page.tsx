"use client";

import Link from "next/link";
import {
  notFound,
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";

const MOBILE_USER_AGENT_PATTERN =
  /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Opera Mini/i;

export default function ResolveIssueCameraPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const issueId = params.id;

  const sessionUser = useAppStore((s) => s.sessionUser);
  const issues = useAppStore((s) => s.issues);
  const resolveIssueWithEvidence = useAppStore(
    (s) => s.resolveIssueWithEvidence,
  );

  const issue = issues.find((item) => item.id === issueId);

  const initialNote = useMemo(
    () => searchParams.get("note") ?? "",
    [searchParams],
  );

  const [note, setNote] = useState(initialNote);
  const [isCheckingDevice, setIsCheckingDevice] = useState(true);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }

    for (const track of stream.getTracks()) {
      track.stop();
    }

    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!isMobileDevice || capturedBlob) {
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setCameraError(
        "Camera access is blocked because this page is not secure. Open the app over HTTPS (or localhost on the same device).",
      );
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        "Camera API is unavailable in this browser context. Use latest Chrome over HTTPS.",
      );
      return;
    }

    stopCamera();
    setIsStartingCamera(true);
    setCameraError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraReady(true);
    } catch (error) {
      console.error("Camera permission or access failed", error);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setCameraError(
          "Camera permission denied or blocked by site security settings. Allow camera permission and use a secure origin.",
        );
      } else if (
        error instanceof DOMException &&
        error.name === "NotFoundError"
      ) {
        setCameraError("No camera device was found on this phone.");
      } else if (
        error instanceof DOMException &&
        error.name === "NotReadableError"
      ) {
        setCameraError(
          "Camera is busy in another app. Close other camera apps and try again.",
        );
      } else {
        setCameraError(
          "Unable to access camera. Allow camera permission and refresh this page.",
        );
      }
      stopCamera();
    } finally {
      setIsStartingCamera(false);
    }
  }, [capturedBlob, isMobileDevice, stopCamera]);

  useEffect(() => {
    if (typeof navigator === "undefined") {
      setIsCheckingDevice(false);
      return;
    }

    const userAgent = navigator.userAgent ?? "";
    const isTouchDevice = navigator.maxTouchPoints > 1;
    setIsMobileDevice(
      MOBILE_USER_AGENT_PATTERN.test(userAgent) || isTouchDevice,
    );
    setIsCheckingDevice(false);
  }, []);

  useEffect(() => {
    if (
      !isCheckingDevice &&
      isMobileDevice &&
      !capturedBlob &&
      !streamRef.current
    ) {
      void startCamera();
    }
  }, [capturedBlob, isCheckingDevice, isMobileDevice, startCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    return () => {
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
      }
    };
  }, [capturedPreviewUrl]);

  if (!issue) {
    notFound();
  }

  if (!sessionUser) {
    return (
      <div className="ui-card p-6">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Session required
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to continue with resolution evidence capture.
        </p>
        <Link href="/login" className="ui-btn-primary mt-4">
          Go to login
        </Link>
      </div>
    );
  }

  if (sessionUser.role !== "engineer") {
    return (
      <div className="ui-card p-6">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Engineer only action
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          This page is restricted to engineers resolving assigned issues.
        </p>
        <Link href={`/issues/${issue.id}`} className="ui-btn-soft mt-4">
          Back to issue
        </Link>
      </div>
    );
  }

  if (issue.status === "Resolved") {
    return (
      <div className="ui-card p-6">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Issue already resolved
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          This issue is already marked as Resolved.
        </p>
        <Link href={`/issues/${issue.id}`} className="ui-btn-soft mt-4">
          Back to issue
        </Link>
      </div>
    );
  }

  const capturePhoto = async () => {
    if (!videoRef.current || !isCameraReady) {
      setCameraError("Camera is not ready yet.");
      return;
    }

    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Could not initialize image capture.");
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setCameraError("Could not capture image. Try again.");
      return;
    }

    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
    }

    const nextUrl = URL.createObjectURL(blob);
    setCapturedPreviewUrl(nextUrl);
    setCapturedBlob(blob);
    setCameraError("");
    stopCamera();
  };

  const retakePhoto = async () => {
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
    }
    setCapturedPreviewUrl("");
    setCapturedBlob(null);
    setSubmitError("");
    await startCamera();
  };

  const completeResolution = async () => {
    if (!capturedBlob || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    const result = await resolveIssueWithEvidence(
      issue.id,
      sessionUser.id,
      capturedBlob,
      note.trim(),
    );

    if (!result.ok) {
      setSubmitError(result.message);
      setIsSubmitting(false);
      return;
    }

    router.replace(`/issues/${issue.id}`);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <article className="ui-card p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Resolution Evidence
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Capture completion photo for {issue.id}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Engineers must capture a live mobile photo to mark this issue as
          resolved. File upload from gallery is not allowed.
        </p>

        {!isCheckingDevice && !isMobileDevice ? (
          <div className="mt-4 rounded-xl border border-amber-300/65 bg-amber-50/80 p-3 text-sm text-amber-900">
            Open this page on a mobile device with camera access to continue.
          </div>
        ) : null}

        {!isCheckingDevice &&
        isMobileDevice &&
        typeof window !== "undefined" &&
        !window.isSecureContext ? (
          <div className="mt-4 rounded-xl border border-amber-300/65 bg-amber-50/80 p-3 text-sm text-amber-900">
            This page is running on an insecure origin. Camera requires HTTPS on
            mobile browsers.
          </div>
        ) : null}

        {cameraError ? (
          <div className="mt-4 rounded-xl border border-rose-300/65 bg-rose-50/85 p-3 text-sm text-rose-900">
            {cameraError}
          </div>
        ) : null}

        {submitError ? (
          <div className="mt-4 rounded-xl border border-rose-300/65 bg-rose-50/85 p-3 text-sm text-rose-900">
            {submitError}
          </div>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-300/50 bg-slate-900/95">
          {capturedPreviewUrl ? (
            <img
              src={capturedPreviewUrl}
              alt="Captured resolution evidence"
              className="h-90 w-full object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-90 w-full object-cover"
            />
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {capturedBlob ? (
            <button
              type="button"
              className="ui-btn-soft"
              onClick={() => {
                void retakePhoto();
              }}
              disabled={isSubmitting}
            >
              Retake Photo
            </button>
          ) : (
            <button
              type="button"
              className="ui-btn-accent"
              onClick={() => {
                void capturePhoto();
              }}
              disabled={!isMobileDevice || isStartingCamera || !isCameraReady}
            >
              {isStartingCamera ? "Starting Camera..." : "Capture Photo"}
            </button>
          )}

          <button
            type="button"
            className="ui-btn-primary"
            onClick={() => {
              void completeResolution();
            }}
            disabled={!capturedBlob || isSubmitting}
          >
            {isSubmitting ? "Resolving..." : "Upload and Mark Resolved"}
          </button>
        </div>

        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          placeholder="Optional resolution note"
          className="ui-textarea mt-3"
        />

        <div className="mt-4">
          <Link href={`/issues/${issue.id}`} className="ui-btn-soft">
            Back to issue
          </Link>
        </div>
      </article>
    </div>
  );
}
