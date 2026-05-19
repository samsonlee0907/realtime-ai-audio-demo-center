import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "assistant" | "translate" | "transcribe";
type SourceType = "microphone" | "upload";

type BackendConfig = {
  endpoint: string;
  assistantDeployment: string;
  translateDeployment: string;
  whisperDeployment: string;
};

const TRANSLATE_LANGUAGE_OPTIONS: Array<[string, string]> = [
  ["af", "Afrikaans"], ["ar", "Arabic"], ["az", "Azerbaijani"], ["be", "Belarusian"], ["bg", "Bulgarian"],
  ["bs", "Bosnian"], ["ca", "Catalan"], ["cs", "Czech"], ["cy", "Welsh"], ["da", "Danish"],
  ["de", "German"], ["el", "Greek"], ["en", "English"], ["es", "Spanish"], ["et", "Estonian"],
  ["fa", "Persian"], ["fi", "Finnish"], ["fr", "French"], ["gl", "Galician"], ["he", "Hebrew"],
  ["hi", "Hindi"], ["hr", "Croatian"], ["hu", "Hungarian"], ["hy", "Armenian"], ["id", "Indonesian"],
  ["is", "Icelandic"], ["it", "Italian"], ["iw", "Hebrew (legacy code)"], ["ja", "Japanese"], ["kk", "Kazakh"],
  ["kn", "Kannada"], ["ko", "Korean"], ["lt", "Lithuanian"], ["lv", "Latvian"], ["mi", "Maori"],
  ["mk", "Macedonian"], ["mr", "Marathi"], ["ms", "Malay"], ["ne", "Nepali"], ["nl", "Dutch"],
  ["no", "Norwegian"], ["pl", "Polish"], ["pt", "Portuguese"], ["ro", "Romanian"], ["ru", "Russian"],
  ["sk", "Slovak"], ["sl", "Slovenian"], ["sr", "Serbian"], ["sv", "Swedish"], ["sw", "Swahili"],
  ["ta", "Tamil"], ["th", "Thai"], ["tl", "Tagalog"], ["tr", "Turkish"], ["uk", "Ukrainian"],
  ["ur", "Urdu"], ["vi", "Vietnamese"], ["zh", "Chinese"]
];

const WHISPER_LANGUAGE_OPTIONS: Array<[string, string]> = [["", "Auto detect"], ...TRANSLATE_LANGUAGE_OPTIONS];
const VOICE_OPTIONS = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"];
const TRANSCRIPTION_DELAY_OPTIONS: Array<[string, string]> = [
  ["", "Default"],
  ["minimal", "Minimal"],
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["xhigh", "Extra high"]
];

function httpBaseUrl() {
  return window.location.origin.replace(/\/$/, "");
}

function wsBaseUrl() {
  const url = new URL(httpBaseUrl());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString().replace(/\/$/, "");
}

function normalizeAzureEndpoint(endpoint: string) {
  const value = endpoint.trim().replace(/\/$/, "");
  if (!value) {
    throw new Error("Azure endpoint is required.");
  }
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Azure endpoint must use https.");
  }
  if (url.hostname.endsWith(".services.ai.azure.com")) {
    url.hostname = url.hostname.replace(/\.services\.ai\.azure\.com$/, ".openai.azure.com");
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function hasReplacementChar(value: string) {
  return value.includes("\uFFFD");
}

function normalizeTranscriptText(value: string) {
  return value.replace(/\u0000/g, "").normalize("NFC");
}

function encodePcm16(float32Array: Float32Array) {
  const pcm16 = new Int16Array(float32Array.length);
  for (let index = 0; index < float32Array.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[index]));
    pcm16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

function decodePcm16(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Int16Array(bytes.buffer);
}

function downsampleTo24k(input: Float32Array, inputRate: number) {
  if (inputRate === 24000) {
    return new Float32Array(input);
  }
  const ratio = inputRate / 24000;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  let inputOffset = 0;
  for (let index = 0; index < outputLength; index += 1) {
    const nextOffset = Math.min(input.length, Math.round((index + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let inner = inputOffset; inner < nextOffset; inner += 1) {
      sum += input[inner];
      count += 1;
    }
    output[index] = count ? sum / count : input[Math.min(inputOffset, input.length - 1)] || 0;
    inputOffset = nextOffset;
  }
  return output;
}

export default function App() {
  const [azureEndpoint, setAzureEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [mode, setMode] = useState<Mode>("assistant");
  const [sourceType, setSourceType] = useState<SourceType>("microphone");
  const [assistantDeployment, setAssistantDeployment] = useState("");
  const [translateDeployment, setTranslateDeployment] = useState("");
  const [whisperDeployment, setWhisperDeployment] = useState("");
  const [voice, setVoice] = useState("alloy");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful voice assistant. Respond clearly and concisely.");
  const [assistantTextPrompt, setAssistantTextPrompt] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [languageHint, setLanguageHint] = useState("");
  const [transcriptionDelay, setTranscriptionDelay] = useState("");
  const [playSourceAudio, setPlaySourceAudio] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaName, setMediaName] = useState("");
  const [status, setStatus] = useState("Idle");
  const [running, setRunning] = useState(false);
  const [assistantChannelOpen, setAssistantChannelOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [logs, setLogs] = useState("");
  const [rawInspector, setRawInspector] = useState("");

  const logRef = useRef<HTMLPreElement | null>(null);
  const rawInspectorRef = useRef<HTMLPreElement | null>(null);
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const inputStreamRef = useRef<MediaStream | null>(null);
  const mediaAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const translateAudioContextRef = useRef<AudioContext | null>(null);
  const captureAudioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const captureSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteNodeRef = useRef<GainNode | null>(null);
  const playbackTimeRef = useRef(0);
  const uploadObjectUrlRef = useRef<string | null>(null);
  const assistantCommittedTargetRef = useRef("");
  const assistantLiveTargetRef = useRef("");

  const currentSourceLabel = useMemo(() => {
    if (sourceType === "microphone") return "Microphone";
    return mediaName || "Uploaded media";
  }, [mediaName, sourceType]);

  useEffect(() => {
    async function loadConfig() {
      const response = await fetch(`${httpBaseUrl()}/api/config`);
      const data = (await response.json()) as BackendConfig;
      setAzureEndpoint(data.endpoint || "");
      setAssistantDeployment(data.assistantDeployment || "");
      setTranslateDeployment(data.translateDeployment || "");
      setWhisperDeployment(data.whisperDeployment || "");
    }

    loadConfig().catch((error: Error) => {
      appendLog(`config load failed: ${error.message}`);
    });

    return () => {
      stopSession().catch(() => {});
      if (uploadObjectUrlRef.current) {
        URL.revokeObjectURL(uploadObjectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (rawInspectorRef.current) {
      rawInspectorRef.current.scrollTop = rawInspectorRef.current.scrollHeight;
    }
  }, [rawInspector]);

  useEffect(() => {
    if (monitorGainRef.current) {
      monitorGainRef.current.gain.value = playSourceAudio ? 1 : 0;
    }
  }, [playSourceAudio]);

  function appendLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((current) => `${current}[${timestamp}] ${message}\n`);
  }

  function appendRawEvent(source: string, payload: unknown) {
    const timestamp = new Date().toLocaleTimeString();
    let serialized = "";
    if (typeof payload === "string") {
      serialized = payload;
    } else {
      try {
        serialized = JSON.stringify(payload, null, 2) ?? String(payload);
      } catch {
        serialized = String(payload);
      }
    }
    const malformedMarker = serialized.includes("\uFFFD") || serialized.includes("\\ufffd")
      ? " [replacement-char detected]"
      : "";
    const entry = `[${timestamp}] ${source}${malformedMarker}\n${serialized}\n\n`;
    setRawInspector((current) => {
      const next = `${current}${entry}`;
      return next.length > 120000 ? next.slice(next.length - 120000) : next;
    });
  }

  function inspectTextQuality(text: string, label: string) {
    if (text && hasReplacementChar(text)) {
      appendLog(`${label} contains replacement characters; upstream text is already malformed before rendering.`);
    }
  }

  function resetOutputs() {
    setSourceText("");
    setTargetText("");
    assistantCommittedTargetRef.current = "";
    assistantLiveTargetRef.current = "";
  }

  function clearDiagnostics() {
    setLogs("");
    setRawInspector("");
    resetOutputs();
  }

  function setAssistantRenderedTarget(committed: string, live: string) {
    const committedBlocks = committed.trim();
    const liveBlock = live.trim();
    if (committedBlocks && liveBlock) {
      setTargetText(`${committedBlocks}\n\n${liveBlock}`);
      return;
    }
    setTargetText(committedBlocks || liveBlock);
  }

  async function ensureTranslatePlaybackContext() {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) {
      throw new Error("AudioContext is not available.");
    }
    if (!translateAudioContextRef.current) {
      translateAudioContextRef.current = new AudioCtor();
      playbackTimeRef.current = translateAudioContextRef.current.currentTime;
    }
    if (translateAudioContextRef.current.state === "suspended") {
      await translateAudioContextRef.current.resume();
    }
    return translateAudioContextRef.current;
  }

  async function playTranslateAudio(base64: string) {
    if (!base64) {
      return;
    }
    const audioContext = await ensureTranslatePlaybackContext();
    const pcm16 = decodePcm16(base64);
    const floats = new Float32Array(pcm16.length);
    for (let index = 0; index < pcm16.length; index += 1) {
      floats[index] = pcm16[index] / 0x8000;
    }
    const buffer = audioContext.createBuffer(1, floats.length, 24000);
    buffer.copyToChannel(floats, 0);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    const startAt = Math.max(audioContext.currentTime + 0.05, playbackTimeRef.current);
    source.start(startAt);
    playbackTimeRef.current = startAt + buffer.duration;
  }

  async function ensureMediaAudioGraph(mediaElement: HTMLMediaElement) {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) {
      throw new Error("AudioContext is not available.");
    }
    if (!mediaAudioContextRef.current) {
      mediaAudioContextRef.current = new AudioCtor();
    }
    if (mediaAudioContextRef.current.state === "suspended") {
      await mediaAudioContextRef.current.resume();
    }
    if (!mediaSourceNodeRef.current) {
      mediaSourceNodeRef.current = mediaAudioContextRef.current.createMediaElementSource(mediaElement);
      mediaStreamDestinationRef.current = mediaAudioContextRef.current.createMediaStreamDestination();
      monitorGainRef.current = mediaAudioContextRef.current.createGain();
      monitorGainRef.current.gain.value = playSourceAudio ? 1 : 0;
      mediaSourceNodeRef.current.connect(mediaStreamDestinationRef.current);
      mediaSourceNodeRef.current.connect(monitorGainRef.current);
      monitorGainRef.current.connect(mediaAudioContextRef.current.destination);
    }
    return mediaStreamDestinationRef.current!.stream;
  }

  async function prepareInputStream() {
    if (sourceType === "microphone") {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      inputStreamRef.current = stream;
      appendLog("microphone attached");
      return stream;
    }

    const mediaElement = mediaRef.current;
    if (!mediaElement || !mediaUrl) {
      throw new Error("Select uploaded media before starting.");
    }
    mediaElement.pause();
    mediaElement.currentTime = 0;
    mediaElement.load();
    const stream = await ensureMediaAudioGraph(mediaElement);
    inputStreamRef.current = stream;
    appendLog(`media source prepared: ${currentSourceLabel}`);
    return stream;
  }

  async function startMediaPlaybackIfNeeded() {
    if (sourceType === "microphone") {
      return;
    }
    const mediaElement = mediaRef.current;
    if (!mediaElement) {
      return;
    }
    try {
      await mediaElement.play();
      appendLog("source media playback started");
    } catch (error) {
      appendLog(`source media playback blocked: ${(error as Error).message}`);
    }
  }

  async function startTranslateAudioPipeline(stream: MediaStream) {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) {
      throw new Error("AudioContext is not available.");
    }
    captureAudioContextRef.current = new AudioCtor();
    if (captureAudioContextRef.current.state === "suspended") {
      await captureAudioContextRef.current.resume();
    }
    captureSourceRef.current = captureAudioContextRef.current.createMediaStreamSource(stream);
    processorRef.current = captureAudioContextRef.current.createScriptProcessor(4096, 1, 1);
    muteNodeRef.current = captureAudioContextRef.current.createGain();
    muteNodeRef.current.gain.value = 0;
    processorRef.current.onaudioprocess = (event) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const input = event.inputBuffer.getChannelData(0);
      const downsampled = downsampleTo24k(input, captureAudioContextRef.current!.sampleRate);
      socket.send(
        JSON.stringify({
          type: "session.input_audio_buffer.append",
          audio: encodePcm16(downsampled)
        })
      );
    };
    captureSourceRef.current.connect(processorRef.current);
    processorRef.current.connect(muteNodeRef.current);
    muteNodeRef.current.connect(captureAudioContextRef.current.destination);
    appendLog(`translate pipeline ready (${captureAudioContextRef.current.sampleRate} Hz input context)`);
  }

  function handleTranslateEvent(event: any) {
    if (event.type === "session.input_transcript.delta" || event.type === "conversation.item.input_audio_transcription.delta") {
      const delta = normalizeTranscriptText(event.delta || "");
      inspectTextQuality(delta, "translate source delta");
      setSourceText((current) => current + delta);
      return;
    }
    if (event.type === "session.output_transcript.delta" || event.type === "response.output_audio_transcript.delta") {
      const delta = normalizeTranscriptText(event.delta || "");
      inspectTextQuality(delta, "translate target delta");
      setTargetText((current) => current + delta);
      return;
    }
    if (event.type === "session.output_audio.delta" || event.type === "response.output_audio.delta" || event.type === "response.translation_audio.delta") {
      playTranslateAudio(event.delta || event.audio || "").catch((error: Error) => appendLog(`audio playback error: ${error.message}`));
      return;
    }
    if (event.type === "error") {
      appendLog(`translate error: ${event.error?.code ? `code=${event.error.code} ` : ""}${event.error?.message || "unknown error"}`);
    }
  }

  function handleWhisperEvent(event: any) {
    if (event.type === "input_audio_buffer.speech_started") {
      setSourceText("Listening...");
      return;
    }
    if (event.type === "input_audio_buffer.speech_stopped") {
      setSourceText((current) => (current && current !== "Listening..." ? current : "Processing..."));
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      const delta = normalizeTranscriptText(event.delta || "");
      inspectTextQuality(delta, "whisper live transcript");
      setSourceText((current) => {
        if (!current || current === "Listening..." || current === "Processing...") {
          return delta;
        }
        return current + delta;
      });
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = normalizeTranscriptText(event.transcript || "");
      if (transcript) {
        inspectTextQuality(transcript, "whisper completed transcript");
        setSourceText(transcript);
        setTargetText((current) => `${current}${current ? "\n\n" : ""}${transcript}`);
      }
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.failed") {
      appendLog(`whisper transcription failed: ${event.error?.message || "unknown error"}`);
      return;
    }
    if (event.type === "error") {
      appendLog(`whisper error: ${event.error?.code ? `code=${event.error.code} ` : ""}${event.error?.message || "unknown error"}`);
    }
  }

  function handleAssistantEvent(event: any) {
    if (event.type === "response.done") {
      const finalText = assistantLiveTargetRef.current.trim();
      if (finalText) {
        assistantCommittedTargetRef.current = `${assistantCommittedTargetRef.current}${assistantCommittedTargetRef.current ? "\n\n" : ""}${finalText}`;
        setTargetText(assistantCommittedTargetRef.current);
        assistantLiveTargetRef.current = "";
      }
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.completed" || event.type === "conversation.item.audio_transcription.completed") {
      const transcript = normalizeTranscriptText(event.transcript || event.item?.content?.[0]?.transcript || "");
      if (transcript) {
        inspectTextQuality(transcript, "assistant source transcript");
        setSourceText((current) => `${current}${current ? "\n\n" : ""}${transcript}`);
      }
      assistantLiveTargetRef.current = "";
      return;
    }
    if (event.type === "conversation.item.created" && event.item?.role === "user") {
      const textPrompt = normalizeTranscriptText(
        event.item?.content
          ?.filter((content: any) => content?.type === "input_text" || content?.type === "text")
          .map((content: any) => content.text || "")
          .join(" ")
          || ""
      );
      if (textPrompt) {
        inspectTextQuality(textPrompt, "assistant text prompt echo");
      }
      return;
    }
    if (event.type === "response.output_text.delta" || event.type === "response.output_audio_transcript.delta") {
      const delta = normalizeTranscriptText(event.delta || "");
      inspectTextQuality(delta, "assistant output delta");
      assistantLiveTargetRef.current += delta;
      setAssistantRenderedTarget(assistantCommittedTargetRef.current, assistantLiveTargetRef.current);
      return;
    }
    if (event.type === "response.output_text.done" || event.type === "response.output_audio_transcript.done") {
      const finalText = assistantLiveTargetRef.current.trim();
      if (finalText) {
        assistantCommittedTargetRef.current = `${assistantCommittedTargetRef.current}${assistantCommittedTargetRef.current ? "\n\n" : ""}${finalText}`;
        setTargetText(assistantCommittedTargetRef.current);
        assistantLiveTargetRef.current = "";
      }
      return;
    }
    if (event.type === "error" || event.type === "session.error") {
      appendLog(`assistant error: ${event.error?.code ? `code=${event.error.code} ` : ""}${event.error?.message || event.message || "unknown error"}`);
    }
  }

  function tokenValue(data: any) {
    return data?.value || data?.client_secret?.value || "";
  }

  async function createClientSecret(payload: Record<string, unknown>) {
    const response = await fetch(`${httpBaseUrl()}/api/session/client-secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`client secret failed (${response.status}): ${text || "empty response"}`);
    }
    const data = JSON.parse(text);
    const token = tokenValue(data);
    if (!token) {
      throw new Error(`client secret returned no token: ${text}`);
    }
    return token;
  }

  function sendAssistantTextPrompt() {
    const prompt = normalizeTranscriptText(assistantTextPrompt.trim());
    const dataChannel = dataChannelRef.current;
    if (!prompt) {
      appendLog("Enter a text prompt before sending.");
      return;
    }
    if (mode !== "assistant" || !dataChannel || dataChannel.readyState !== "open") {
      appendLog("Assistant text prompts require an active assistant session.");
      return;
    }
    dataChannel.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
            }
          ]
        }
      })
    );
    dataChannel.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["text", "audio"]
        }
      })
    );
    setSourceText((current) => `${current}${current ? "\n\n" : ""}Text prompt: ${prompt}`);
    setAssistantTextPrompt("");
    appendLog("assistant text prompt sent");
  }

  async function startWhisper(stream: MediaStream) {
    const normalizedEndpoint = normalizeAzureEndpoint(azureEndpoint);
    let clientSecret = "";
    try {
      clientSecret = await createClientSecret({
        mode: "transcribe",
        endpoint: azureEndpoint,
        apiKey,
        whisperDeployment,
        languageHint,
        transcriptionDelay
      });
    } catch (error) {
      if (!transcriptionDelay) {
        throw error;
      }
      appendLog(`whisper delay "${transcriptionDelay}" was rejected during client secret creation; retrying with default session settings`);
      clientSecret = await createClientSecret({
        mode: "transcribe",
        endpoint: azureEndpoint,
        apiKey,
        whisperDeployment,
        languageHint
      });
    }
    appendLog("whisper client secret received");
    appendLog(`normalized endpoint: ${normalizedEndpoint}`);

    const peerConnection = new RTCPeerConnection();
    peerConnectionRef.current = peerConnection;
    stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
    peerConnection.onconnectionstatechange = () => {
      appendLog(`peerState=${peerConnection.connectionState}`);
      if (peerConnection.connectionState === "connected") {
        setRunning(true);
        setStatus("Streaming");
        startMediaPlaybackIfNeeded().catch(() => {});
      }
    };

    const dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannelRef.current = dataChannel;
    dataChannel.onopen = () => appendLog("data channel open");
    dataChannel.onmessage = (message) => {
      appendRawEvent("whisper.data_channel", message.data);
      const event = JSON.parse(message.data);
      appendLog(`event=${event.type}`);
      handleWhisperEvent(event);
    };
    dataChannel.onclose = () => appendLog("data channel closed");

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    const response = await fetch(`${normalizedEndpoint}/openai/v1/realtime/calls?webrtcfilter=on`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp"
      },
      body: offer.sdp
    });
    const answer = await response.text();
    if (!response.ok) {
      throw new Error(`whisper SDP exchange failed (${response.status}): ${answer || "empty response"}`);
    }
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });
  }

  async function startAssistant(stream: MediaStream) {
    const normalizedEndpoint = normalizeAzureEndpoint(azureEndpoint);
    const clientSecret = await createClientSecret({
      mode: "assistant",
      endpoint: azureEndpoint,
      apiKey,
      assistantDeployment,
      voice,
      systemPrompt
    });
    appendLog("assistant client secret received");
    appendLog(`normalized endpoint: ${normalizedEndpoint}`);

    const peerConnection = new RTCPeerConnection();
    peerConnectionRef.current = peerConnection;
    stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
    peerConnection.onconnectionstatechange = () => {
      appendLog(`peerState=${peerConnection.connectionState}`);
      if (peerConnection.connectionState === "connected") {
        setRunning(true);
        setStatus("Streaming");
        startMediaPlaybackIfNeeded().catch(() => {});
      }
    };
    peerConnection.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams?.[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
      appendLog("remote audio track received");
    };

    const dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannelRef.current = dataChannel;
    dataChannel.onopen = () => {
      setAssistantChannelOpen(true);
      appendLog("data channel open");
      const session: Record<string, unknown> = {
        type: "realtime",
        instructions: systemPrompt || "You are a helpful voice assistant. Respond clearly and concisely.",
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 200,
          create_response: true
        },
        audio: {
          output: {
            voice
          }
        }
      };
      if (whisperDeployment.trim()) {
        const transcription: Record<string, string> = {
          model: whisperDeployment.trim()
        };
        if (languageHint.trim()) {
          transcription.language = languageHint.trim();
        }
        session.input_audio_transcription = transcription;
      }
      dataChannel.send(JSON.stringify({ type: "session.update", session }));
      appendLog("session.update sent");
    };
    dataChannel.onmessage = (message) => {
      appendRawEvent("assistant.data_channel", message.data);
      const event = JSON.parse(message.data);
      appendLog(`event=${event.type}`);
      handleAssistantEvent(event);
    };
    dataChannel.onclose = () => {
      setAssistantChannelOpen(false);
      appendLog("data channel closed");
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    const response = await fetch(`${normalizedEndpoint}/openai/v1/realtime/calls?webrtcfilter=on`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp"
      },
      body: offer.sdp
    });
    const answer = await response.text();
    if (!response.ok) {
      throw new Error(`assistant SDP exchange failed (${response.status}): ${answer || "empty response"}`);
    }
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });
  }

  async function startTranslate(stream: MediaStream) {
    const socket = new WebSocket(`${wsBaseUrl()}/api/ws/translate`);
    socketRef.current = socket;
    appendLog(`connecting websocket: ${wsBaseUrl()}/api/ws/translate`);

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: "proxy.configure",
          endpoint: azureEndpoint,
          apiKey,
          targetLanguage,
          translateDeployment,
          whisperDeployment,
          sourceLanguage: languageHint
        })
      );
      appendLog("proxy.configure sent");
    };

    socket.onmessage = async (message) => {
      appendRawEvent("translate.websocket", message.data);
      const event = JSON.parse(message.data);
      if (event.type === "proxy.ready") {
        appendLog(`proxy ready (${event.mode})`);
        setRunning(true);
        setStatus("Streaming");
        await startTranslateAudioPipeline(stream);
        await startMediaPlaybackIfNeeded();
        return;
      }
      if (event.type === "proxy.error") {
        appendLog(`proxy error: ${event.message || "unknown backend error"}`);
        setStatus("Error");
        return;
      }
      appendLog(`event=${event.type}`);
      handleTranslateEvent(event);
    };

    socket.onerror = () => {
      appendLog("websocket transport error");
      setStatus("Error");
    };

    socket.onclose = (event) => {
      appendLog(`websocket closed (${event.code})`);
      setRunning(false);
      setStatus("Stopped");
    };
  }

  async function startSession() {
    await stopSession();
    clearDiagnostics();
    setStatus("Preparing source...");
    setAssistantChannelOpen(false);

    if (!azureEndpoint.trim()) {
      appendLog("Azure endpoint is required.");
      setStatus("Error");
      return;
    }
    if (!apiKey.trim()) {
      appendLog("API key is required.");
      setStatus("Error");
      return;
    }
    if (mode === "assistant" && !assistantDeployment.trim()) {
      appendLog("Assistant deployment is required.");
      setStatus("Error");
      return;
    }
    if (mode === "translate" && !translateDeployment.trim()) {
      appendLog("Translate deployment is required.");
      setStatus("Error");
      return;
    }
    if (mode === "transcribe" && !whisperDeployment.trim()) {
      appendLog("Whisper deployment is required.");
      setStatus("Error");
      return;
    }

    try {
      const inputStream = await prepareInputStream();
      if (mode === "assistant") {
        await startAssistant(inputStream);
      } else if (mode === "translate") {
        await startTranslate(inputStream);
      } else {
        await startWhisper(inputStream);
      }
    } catch (error) {
      appendLog((error as Error).message);
      setStatus("Error");
      await stopSession();
    }
  }

  async function stopSession() {
    try {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "session.close" }));
      }
    } catch {}
    try {
      socketRef.current?.close();
    } catch {}
    try {
      dataChannelRef.current?.close();
    } catch {}
    try {
      peerConnectionRef.current?.close();
    } catch {}
    try {
      processorRef.current?.disconnect();
    } catch {}
    try {
      captureSourceRef.current?.disconnect();
    } catch {}
    try {
      muteNodeRef.current?.disconnect();
    } catch {}
    try {
      await captureAudioContextRef.current?.close();
    } catch {}

    if (sourceType === "microphone") {
      inputStreamRef.current?.getTracks().forEach((track) => track.stop());
    } else {
      mediaRef.current?.pause();
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    socketRef.current = null;
    dataChannelRef.current = null;
    peerConnectionRef.current = null;
    processorRef.current = null;
    captureSourceRef.current = null;
    muteNodeRef.current = null;
    captureAudioContextRef.current = null;
    inputStreamRef.current = null;
    assistantCommittedTargetRef.current = "";
    assistantLiveTargetRef.current = "";
    setAssistantChannelOpen(false);
    setRunning(false);
    setStatus("Stopped");
  }

  function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (uploadObjectUrlRef.current) {
      URL.revokeObjectURL(uploadObjectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    uploadObjectUrlRef.current = url;
    setMediaUrl(url);
    setMediaName(file.name);
    appendLog(`loaded upload: ${file.name}`);
  }

  const sourceHeading = mode === "translate" ? "Source transcript" : mode === "assistant" ? "Conversation transcript" : "Live / latest transcript";
  const targetHeading = mode === "assistant" ? "Assistant output" : mode === "translate" ? "Translated output" : "Completed transcript";
  const assistantPromptDisabled = mode !== "assistant" || !assistantChannelOpen;

  return (
    <div className="shell">
      <aside className="panel sidebar">
        <div className="hero">
          <p className="eyebrow">Realtime Media Portal</p>
          <h1>Realtime AI Audio Demo Center</h1>
          <p className="lede">
            Test assistant audio-to-audio, live translation, and live transcription with mic or uploaded media.
          </p>
        </div>

        <div className="stack">
          <div className="grid2">
            <label>
              Azure endpoint
              <input
                value={azureEndpoint}
                onChange={(event) => setAzureEndpoint(event.target.value)}
                placeholder="https://your-resource.openai.azure.com"
              />
            </label>
            <label>
              API key
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="KEY1 or KEY2"
              />
            </label>
          </div>
          <div className="grid2">
            <label>
              Assistant deployment
              <input value={assistantDeployment} onChange={(event) => setAssistantDeployment(event.target.value)} placeholder="gpt-realtime-1.5 or gpt-realtime-2" />
            </label>
            <label>
              Translate deployment
              <input value={translateDeployment} onChange={(event) => setTranslateDeployment(event.target.value)} />
            </label>
          </div>
          <div className="grid2">
            <label>
              Whisper deployment
              <input value={whisperDeployment} onChange={(event) => setWhisperDeployment(event.target.value)} />
            </label>
            <label>
              Voice
              <select value={voice} onChange={(event) => setVoice(event.target.value)} disabled={mode !== "assistant"}>
                {VOICE_OPTIONS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="stack">
          <label>Mode</label>
          <div className="segmented triple">
            <button className={mode === "assistant" ? "active" : ""} onClick={() => setMode("assistant")} type="button">Assistant</button>
            <button className={mode === "translate" ? "active" : ""} onClick={() => setMode("translate")} type="button">Translate</button>
            <button className={mode === "transcribe" ? "active" : ""} onClick={() => setMode("transcribe")} type="button">Transcribe</button>
          </div>
        </div>

        <div className="stack">
          <label>Source</label>
          <div className="segmented">
            <button className={sourceType === "microphone" ? "active" : ""} onClick={() => setSourceType("microphone")} type="button">Mic</button>
            <button className={sourceType === "upload" ? "active" : ""} onClick={() => setSourceType("upload")} type="button">Upload</button>
          </div>
        </div>

        <div className="grid2">
          <label>
            Target language
            <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} disabled={mode !== "translate"}>
              {TRANSLATE_LANGUAGE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label} ({value})</option>
              ))}
            </select>
          </label>
          <label>
            Language hint
            <select value={languageHint} onChange={(event) => setLanguageHint(event.target.value)}>
              {WHISPER_LANGUAGE_OPTIONS.map(([value, label]) => (
                <option key={value || "auto"} value={value}>{value ? `${label} (${value})` : label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid2">
          <label>
            Whisper live delay
            <select value={transcriptionDelay} onChange={(event) => setTranscriptionDelay(event.target.value)} disabled={mode !== "transcribe"}>
              {TRANSCRIPTION_DELAY_OPTIONS.map(([value, label]) => (
                <option key={value || "default"} value={value}>{value ? `${label} (${value})` : label}</option>
              ))}
            </select>
          </label>
          <p className="note">
            Lower delay emits earlier partial text in the live panel. Higher delay can improve accuracy for the completed segment.
          </p>
        </div>

        <label>
          Instructions
          <textarea
            className="prompt"
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder="Assistant instructions for normal audio-to-audio mode"
            disabled={mode !== "assistant"}
          />
        </label>

        <div className="stack">
          <label>
            Assistant text prompt
            <textarea
              className="prompt prompt-compact"
              value={assistantTextPrompt}
              onChange={(event) => setAssistantTextPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  sendAssistantTextPrompt();
                }
              }}
              placeholder="Optional follow-up text prompt for assistant mode. Start the session first, then send with Ctrl+Enter."
              disabled={mode !== "assistant"}
            />
          </label>
          <div className="inline-actions">
            <button
              className="secondary"
              onClick={() => sendAssistantTextPrompt()}
              type="button"
              disabled={assistantPromptDisabled || !assistantTextPrompt.trim()}
            >
              Send Text Prompt
            </button>
            <p className="note">
              {assistantPromptDisabled ? "Available after the assistant data channel opens." : "Ctrl+Enter also sends the prompt."}
            </p>
          </div>
        </div>

        <label className="toggle">
          <input type="checkbox" checked={playSourceAudio} onChange={(event) => setPlaySourceAudio(event.target.checked)} />
          <span>Play source audio locally</span>
        </label>

        {sourceType === "upload" && (
          <label>
            Upload media
            <input type="file" accept="audio/*,video/*" onChange={handleUpload} />
          </label>
        )}

        <div className="controls">
          <button className="primary" onClick={() => startSession()} type="button">Start</button>
          <button className="secondary" onClick={() => stopSession()} type="button">Stop</button>
          <button className="ghost" onClick={() => clearDiagnostics()} type="button">Clear</button>
        </div>

        <div className="status-card">
          <span className={`dot ${running ? "ok" : ""}`} />
          <div>
            <strong>{status}</strong>
            <p>
              {mode === "assistant"
                ? "Audio-to-audio assistant via WebRTC"
                : mode === "translate"
                  ? "Backend translation proxy"
                  : "Whisper transcription via WebRTC"}
            </p>
          </div>
        </div>
      </aside>

      <main className="panel main">
        <section className="grid">
          <article className="card">
            <h2>{sourceHeading}</h2>
            <pre className="card-body">{sourceText || "No transcript yet."}</pre>
          </article>
          <article className="card">
            <h2>{targetHeading}</h2>
            <pre className="card-body">{targetText || "No output yet."}</pre>
          </article>
        </section>

        <section className="grid media-grid">
          <article className="card">
            <h2>Source media</h2>
            {sourceType === "microphone" ? (
              <div className="placeholder">
                <strong>Microphone mode</strong>
                <p>Live mic input will be streamed directly to the model.</p>
              </div>
            ) : (
              <div className="media-shell">
                <video
                  ref={mediaRef}
                  className="media-player"
                  controls
                  src={mediaUrl}
                  playsInline
                  preload="metadata"
                />
                <div className="media-meta">
                  <strong>{currentSourceLabel}</strong>
                  <span>Uploaded local media</span>
                </div>
              </div>
            )}
          </article>
          <article className="card">
            <h2>{mode === "assistant" ? "Model audio and summary" : "Stream summary"}</h2>
            {mode === "assistant" ? (
              <audio ref={remoteAudioRef} className="audio-player" controls autoPlay />
            ) : null}
            <div className="summary">
              <div><span>Azure endpoint</span><strong>{azureEndpoint || "not set"}</strong></div>
              <div><span>Mode</span><strong>{mode}</strong></div>
              <div><span>Source</span><strong>{sourceType}</strong></div>
              <div><span>Current media</span><strong>{currentSourceLabel}</strong></div>
              {mode === "assistant" ? <div><span>Voice</span><strong>{voice}</strong></div> : null}
              <div><span>Target language</span><strong>{mode === "translate" ? targetLanguage : "n/a"}</strong></div>
            </div>
          </article>
        </section>

        <section className="grid diagnostics-grid">
          <article className="card log-card">
            <h2>Event log</h2>
            <pre ref={logRef} className="card-body log-body">{logs || "Logs will appear here."}</pre>
          </article>
          <article className="card log-card">
            <h2>Raw event inspector</h2>
            <pre ref={rawInspectorRef} className="card-body log-body raw-body">{rawInspector || "Raw JSON events will appear here for payload debugging."}</pre>
          </article>
        </section>
      </main>
    </div>
  );
}
