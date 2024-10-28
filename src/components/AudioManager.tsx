import React, { useCallback, useEffect, useState, useRef } from "react";
import axios from "axios";
import Modal from "./modal/Modal";
import { UrlInput } from "./modal/UrlInput";
import AudioPlayer from "./AudioPlayer";
import { TranscribeButton } from "./TranscribeButton";
import Constants from "../utils/Constants";
import { Transcriber } from "../hooks/useTranscriber";
import Progress from "./Progress";
import AudioRecorder from "./AudioRecorder";

export enum AudioSource {
    URL = "URL",
    FILE = "FILE",
    RECORDING = "RECORDING",
}

interface Props {
    transcriber: Transcriber;
    onTranscriptionComplete?: (text: string) => void;
}

export function AudioManager({ transcriber, onTranscriptionComplete }: Props) {
    const [progress, setProgress] = useState<number | undefined>(undefined);
    const [audioData, setAudioData] = useState<{
        buffer: AudioBuffer;
        url: string;
        source: AudioSource;
        mimeType: string;
    } | undefined>(undefined);
    const [audioDownloadUrl, setAudioDownloadUrl] = useState<string | undefined>(undefined);
    const [showUrlModal, setShowUrlModal] = useState(false);
    const [showRecordModal, setShowRecordModal] = useState(false);
    const lastTranscriptionRef = useRef<string | null>(null);
    const isTranscriptionHandledRef = useRef(false);

    const isAudioLoading = progress !== undefined;

    const resetAudio = () => {
        setAudioData(undefined);
        setAudioDownloadUrl(undefined);
        isTranscriptionHandledRef.current = false;
    };

    // Watch for transcription completion
    useEffect(() => {
        if (transcriber.output && !transcriber.isBusy && onTranscriptionComplete) {
            // Only handle the transcription if it hasn't been handled yet
            if (!isTranscriptionHandledRef.current) {
                console.log('Handling transcription:', transcriber.output.text);
                isTranscriptionHandledRef.current = true;
                onTranscriptionComplete(transcriber.output.text);
                resetAudio();
            }
        }
    }, [transcriber.output, transcriber.isBusy, onTranscriptionComplete]);

    // Reset the transcription handling state when starting a new recording/upload
    useEffect(() => {
        if (!audioData) {
            isTranscriptionHandledRef.current = false;
        }
    }, [audioData]);

    const setAudioFromDownload = async (data: ArrayBuffer, mimeType: string) => {
        const audioCTX = new AudioContext({ sampleRate: Constants.SAMPLING_RATE });
        const blobUrl = URL.createObjectURL(new Blob([data], { type: "audio/*" }));
        const decoded = await audioCTX.decodeAudioData(data);
        setAudioData({
            buffer: decoded,
            url: blobUrl,
            source: AudioSource.URL,
            mimeType: mimeType,
        });
    };

    const setAudioFromRecording = async (data: Blob) => {
        resetAudio();
        setProgress(0);
        const blobUrl = URL.createObjectURL(data);
        const fileReader = new FileReader();
        fileReader.onprogress = (event) => {
            setProgress(event.loaded / event.total || 0);
        };
        fileReader.onloadend = async () => {
            const audioCTX = new AudioContext({ sampleRate: Constants.SAMPLING_RATE });
            const arrayBuffer = fileReader.result as ArrayBuffer;
            const decoded = await audioCTX.decodeAudioData(arrayBuffer);
            setProgress(undefined);
            setAudioData({
                buffer: decoded,
                url: blobUrl,
                source: AudioSource.RECORDING,
                mimeType: data.type,
            });
            setShowRecordModal(false);
        };
        fileReader.readAsArrayBuffer(data);
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const blobUrl = URL.createObjectURL(file);
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            if (!arrayBuffer) return;

            const audioCTX = new AudioContext({ sampleRate: Constants.SAMPLING_RATE });
            const decoded = await audioCTX.decodeAudioData(arrayBuffer);
            transcriber.onInputChange();
            setAudioData({
                buffer: decoded,
                url: blobUrl,
                source: AudioSource.FILE,
                mimeType: file.type,
            });
        };
        reader.readAsArrayBuffer(file);
    };

    const downloadAudioFromUrl = async (requestAbortController: AbortController) => {
        if (audioDownloadUrl) {
            try {
                setAudioData(undefined);
                setProgress(0);
                const { data, headers } = await axios.get(audioDownloadUrl, {
                    signal: requestAbortController.signal,
                    responseType: "arraybuffer",
                    onDownloadProgress(progressEvent) {
                        setProgress(progressEvent.progress || 0);
                    },
                });

                let mimeType = headers["content-type"];
                if (!mimeType || mimeType === "audio/wave") {
                    mimeType = "audio/wav";
                }
                setAudioFromDownload(data, mimeType);
                setShowUrlModal(false);
            } catch (error) {
                console.error("Request failed or aborted", error);
            } finally {
                setProgress(undefined);
            }
        }
    };

    useEffect(() => {
        if (audioDownloadUrl) {
            const requestAbortController = new AbortController();
            downloadAudioFromUrl(requestAbortController);
            return () => {
                requestAbortController.abort();
            };
        }
    }, [audioDownloadUrl]);

    const handleTranscribeClick = useCallback(() => {
        if (!audioData) return;
        isTranscriptionHandledRef.current = false;
        transcriber.onInputChange(); // Reset transcriber state
        transcriber.start(audioData.buffer);
    }, [audioData, transcriber]);

    return (
        <div className="space-y-6">
            {!audioData && (
                <div className="flex flex-col items-center gap-4">
                    <button
                        onClick={() => setShowRecordModal(true)}
                        className="w-full max-w-md px-6 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all text-lg font-semibold flex items-center justify-center gap-3"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Start Recording
                    </button>
                    
                    <div className="flex gap-4 w-full max-w-md">
                        <button
                            onClick={() => setShowUrlModal(true)}
                            className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                            </svg>
                            From URL
                        </button>
                        
                        <label className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Upload File
                            <input
                                type="file"
                                accept="audio/*"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                        </label>
                    </div>
                </div>
            )}

            {isAudioLoading && (
                <div className="w-full bg-gray-200 rounded-full h-1">
                    <div
                        className="bg-blue-600 h-1 rounded-full transition-all duration-100"
                        style={{ width: `${Math.round(progress! * 100)}%` }}
                    />
                </div>
            )}

            {audioData && (
                <div className="space-y-4">
                    <AudioPlayer audioUrl={audioData.url} mimeType={audioData.mimeType} />
                    
                    <div className="flex items-center justify-between gap-4">
                        <TranscribeButton
                            onClick={handleTranscribeClick}
                            isModelLoading={transcriber.isModelLoading}
                            isTranscribing={transcriber.isBusy}
                        />
                        
                        <button
                            onClick={resetAudio}
                            className="px-4 py-2 text-red-500 hover:text-red-600 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>

                    {transcriber.progressItems.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-sm text-slate-600">
                                Loading model files... (only run once)
                            </label>
                            {transcriber.progressItems.map((data) => (
                                <Progress
                                    key={data.file}
                                    text={data.file}
                                    percentage={data.progress}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            <Modal
                show={showUrlModal}
                title="Add Audio from URL"
                content={
                    <>
                        <p className="mb-4">Enter the URL of the audio file you want to transcribe.</p>
                        <UrlInput
                            onChange={(e) => setAudioDownloadUrl(e.target.value)}
                            value={audioDownloadUrl || Constants.DEFAULT_AUDIO_URL}
                        />
                    </>
                }
                onClose={() => setShowUrlModal(false)}
                submitText="Load Audio"
                onSubmit={() => {}}
            />

            <Modal
                show={showRecordModal}
                title="Record Audio"
                content={
                    <AudioRecorder onRecordingComplete={setAudioFromRecording} />
                }
                onClose={() => setShowRecordModal(false)}
                onSubmit={() => {}}
            />
        </div>
    );
}
