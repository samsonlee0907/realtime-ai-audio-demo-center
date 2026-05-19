# Realtime AI Audio Demo Center

## Overview

Realtime AI Audio Demo Center is a local testing portal for three Azure OpenAI realtime scenarios:

- normal audio-to-audio assistant interaction with `gpt-realtime-1.5` or `gpt-realtime-2`
- continuous speech translation with `gpt-realtime-translate`
- live transcription with `gpt-realtime-whisper`

The portal accepts two source types:

- microphone
- uploaded audio or video

The app separates source monitoring from model output, so you can mute the original source media locally while still streaming that media audio into the model session.

---

## Prerequisites

### Local software

- Node.js 20 or later
- npm

### Azure requirements

- an Azure OpenAI resource or Foundry-backed Azure OpenAI endpoint
- a valid API key for that resource
- deployed realtime model names for any modes you want to test:
  - assistant: `gpt-realtime-1.5`, `gpt-realtime-2`, or another compatible realtime deployment name
  - translation: `gpt-realtime-translate`
  - transcription: `gpt-realtime-whisper`

### Browser capabilities

- microphone permission for microphone mode
- media playback support for uploaded or proxied media
- WebRTC support for assistant and transcription modes

---

## Run The Demo

### 1. Install backend dependencies

```powershell
cd backend
npm install
```

### 2. Install frontend dependencies

```powershell
cd frontend
npm install
```

### 3. Start the backend

```powershell
cd backend
npm run dev
```

Default backend URL:

- `http://127.0.0.1:8780`

### 4. Start the frontend

```powershell
cd frontend
npm run dev
```

Default frontend URL:

- `http://127.0.0.1:5173`

### 5. Enter connection settings in the UI

The demo does not require a `.env` file for normal use. Enter the following values directly in the page:

- Azure endpoint
- API key
- assistant deployment
- translate deployment
- whisper deployment

Optional backend environment variables can still be used to prefill deployment names:

- `AZURE_OPENAI_ASSISTANT_DEPLOYMENT`
- `AZURE_OPENAI_TRANSLATE_DEPLOYMENT`
- `AZURE_OPENAI_WHISPER_DEPLOYMENT`
- `PORT`

---

## Use The Demo

### Choose a mode

- `Assistant` for audio-in, audio-out conversation
- `Translate` for continuous speech translation
- `Transcribe` for low-latency transcript generation

### Choose a source

- `Mic` captures live microphone audio
- `Upload` plays a local audio or video file and routes that media audio into the model

### Source monitoring toggle

`Play source audio locally` controls whether you hear the original source media on your speakers.

- enabled: you hear the source media locally
- disabled: the source media stays muted locally, but the model still receives it

This toggle does not mute model output audio.

---

## Technical Architecture

### Frontend

The frontend is a React + TypeScript single-page application that:

- collects media from microphone capture or a media element
- converts source media into a `MediaStream`
- routes audio into either a WebRTC session or a backend WebSocket proxy
- renders transcripts, translated text, model output, and event logs
- keeps the Azure endpoint and API key in the browser session only

### Backend

The backend is a small Node.js service that:

- normalizes Azure endpoints to the Azure OpenAI-compatible host shape
- creates short-lived client secrets for browser WebRTC sessions
- proxies realtime translation WebSocket traffic

---

## Model-Specific Implementation

## Assistant mode

### Purpose

Assistant mode restores the standard speech-to-speech experience for realtime voice models such as `gpt-realtime-1.5` and `gpt-realtime-2`.

### Session pattern

1. The frontend sends the endpoint, API key, assistant deployment, selected voice, and assistant instructions to the backend.
2. The backend requests a short-lived client secret from Azure OpenAI.
3. The browser creates a WebRTC peer connection and data channel.
4. The source audio stream is attached as a local track.
5. The browser posts the SDP offer to `/openai/v1/realtime/calls?webrtcfilter=on`.
6. The returned remote audio track is played in the UI audio control.
7. A `session.update` configures instructions, turn detection, selected voice, and optional input transcription.

### Notes

- assistant mode is intended for audio-in, audio-out interaction
- if a whisper deployment is supplied, the session can also display input transcription events
- remote assistant audio is separate from source media monitoring

## Translate mode

### Purpose

Translate mode uses `gpt-realtime-translate` for continuous low-latency translation from source audio to translated text and translated speech.

### Session pattern

1. The frontend captures source audio from mic or media playback.
2. The frontend opens a browser-to-backend WebSocket.
3. The backend opens a server WebSocket to `/openai/v1/realtime/translations?model=<deployment>`.
4. The frontend streams base64 PCM16 audio chunks to the backend proxy.
5. The backend forwards those events to Azure OpenAI.
6. The frontend renders transcript deltas and plays returned audio deltas.

### Notes

- target language is set through session audio output language
- optional source transcript support is enabled by supplying a whisper deployment and language hint
- this mode is intentionally proxied through the backend instead of using the browser-only client-secret flow

## Transcribe mode

### Purpose

Transcribe mode uses `gpt-realtime-whisper` to generate low-latency transcript updates from a live audio stream.

### Session pattern

1. The frontend sends endpoint, API key, whisper deployment, and optional language hint to the backend.
2. The backend creates a transcription client secret.
3. The browser creates a WebRTC session to Azure OpenAI.
4. The source audio stream is attached as a local track.
5. The browser receives transcription events over the realtime data channel.
6. The UI shows the latest segment in the left panel and accumulates completed transcript segments in the right panel.

### Notes

- transcription uses a transcription session rather than the general assistant conversation shape
- language hint is optional but strongly recommended for Japanese, Korean, and Chinese tests

---

## Character Handling And Transcript Quality

### What the app does

The app tries to preserve text correctly by:

- treating all realtime events as UTF-8 text events
- rendering transcript text directly without manual re-encoding
- normalizing displayed transcript strings to Unicode NFC
- using multilingual UI font fallbacks for Simplified Chinese, Traditional Chinese, Japanese, and Korean
- logging when replacement characters (`�`) already exist in the upstream payload

### What the app cannot fix

If the event payload already contains replacement characters, the text was malformed before rendering. This is usually not a local font-pack issue.

Common causes:

- incorrect upstream transcript generation for that audio segment
- language mismatch or weak language detection
- noisy source audio
- mixed-language content or subtitle-heavy media that reduces transcription quality

### Recommended mitigations

- set `Language hint` explicitly for Japanese, Korean, Simplified Chinese, or Traditional Chinese tests
- test cleaner audio sources with less background music
- prefer uploaded media over browser-tab capture when you want more stable input
- compare the same media through assistant, translate, and transcribe modes to isolate whether corruption is specific to one model path

---

## Project Layout

```text
backend/
  package.json
  server.mjs
frontend/
  package.json
  tsconfig.json
  vite.config.ts
  src/
    App.tsx
    main.tsx
    styles.css
```
