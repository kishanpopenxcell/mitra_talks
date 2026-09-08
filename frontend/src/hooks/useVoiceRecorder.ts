import { useCallback, useRef, useState } from 'react';
import type { RecordingState } from '../types';

interface UseVoiceRecorderResult {
  recordingState: RecordingState;
  isSupported: boolean;
  errorMessage: string | null;
  /** Starts recording and resolves with the live MediaStream (e.g. to attach a voice-activity detector). */
  startRecording: () => Promise<MediaStream | null>;
  /** Stop recording and resolve with the recorded audio blob. */
  stopRecording: () => Promise<Blob | null>;
  /** Cancel the recording in progress without producing a result. */
  cancelRecording: () => void;
  /** Reset recorder state back to idle (e.g. after processing completes or an error is dismissed). */
  resetToIdle: () => void;
}

function pickMimeType(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useVoiceRecorder(): UseVoiceRecorderResult {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined';

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async (): Promise<MediaStream | null> => {
    if (!isSupported) {
      setErrorMessage('Voice recording is not supported in this browser.');
      setRecordingState('error');
      return null;
    }
    setErrorMessage(null);
    cancelledRef.current = false;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start();
      setRecordingState('recording');
      return stream;
    } catch (err) {
      cleanupStream();
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        setErrorMessage('Microphone access was denied. Please allow microphone permission to use voice input.');
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setErrorMessage('No microphone was found on this device.');
      } else {
        setErrorMessage('Could not start recording. Please try again.');
      }
      setRecordingState('error');
      return null;
    }
  }, [isSupported, cleanupStream]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        cleanupStream();
        if (cancelledRef.current) {
          chunksRef.current = [];
          setRecordingState('idle');
          resolve(null);
          return;
        }
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        setRecordingState('processing');
        resolve(blob.size > 0 ? blob : null);
      };

      try {
        recorder.stop();
      } catch {
        cleanupStream();
        resolve(null);
      }
    });
  }, [cleanupStream]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    } else {
      cleanupStream();
      setRecordingState('idle');
    }
  }, [cleanupStream]);

  const resetToIdle = useCallback(() => {
    setRecordingState('idle');
    setErrorMessage(null);
  }, []);

  return {
    recordingState,
    isSupported,
    errorMessage,
    startRecording,
    stopRecording,
    cancelRecording,
    resetToIdle,
  };
}
