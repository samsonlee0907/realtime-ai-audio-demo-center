# Realtime AI Audio Demo Center

## Overview

Realtime AI Audio Demo Center is a local browser portal for testing three Azure OpenAI realtime audio scenarios:

- speech-to-speech assistant conversations with `gpt-realtime-1.5`, `gpt-realtime-2`, or another compatible realtime assistant deployment
- continuous live translation with `gpt-realtime-translate`
- live transcription with `gpt-realtime-whisper`

The demo supports two source types:

- microphone capture
- uploaded audio or video files

The application is intentionally shaped to reduce the most common setup errors:

- it keeps the Azure endpoint and API key as UI inputs instead of requiring a local `.env` for normal use
- it normalizes Azure Foundry-style endpoint input to the Azure OpenAI-compatible host shape
- it keeps assistant, translate, and transcribe on their correct realtime transport patterns
- it shows both a readable event log and a raw event inspector for payload debugging

---

## What This Demo Tests

| Mode | Primary model | Input | Output | Transport pattern |
| --- | --- | --- | --- | --- |
| Assistant | `gpt-realtime-1.5`, `gpt-realtime-2`, or compatible realtime assistant deployment | audio or optional typed follow-up prompts | audio plus transcript text | browser WebRTC with backend-issued client secret |
| Translate | `gpt-realtime-translate` | streaming source audio | translated audio plus transcript deltas | backend WebSocket proxy to translation endpoint |
| Transcribe | `gpt-realtime-whisper` | streaming source audio | live transcript deltas plus completed transcript segments | browser WebRTC with backend-issued transcription client secret |

---

## Before You Start

### Local software

- Node.js 20 or later
- npm
- a modern Chromium-based browser or another browser with working WebRTC support

### Azure prerequisites

You need all of the following:

- an Azure OpenAI resource
- a valid API key for that resource
- the deployed model names for the modes you plan to test

Recommended deployment names:

- assistant deployment: `gpt-realtime-1.5`, `gpt-realtime-2`, or your own assistant deployment name
- translate deployment: `gpt-realtime-translate`
- whisper deployment: `gpt-realtime-whisper`

Important notes for `gpt-realtime-2`:

- `gpt-realtime-2` is currently documented by Microsoft as a public preview model
- Microsoft states that preview features have no SLA and are not recommended for production workloads
- the connection and usage pattern is the same as earlier realtime assistant models, so existing WebRTC, WebSocket, or SIP integration patterns still apply

Important:

- enter the **deployment name**, not just the base model family name, if your Azure deployment uses a custom name
- prefer the Azure OpenAI-compatible endpoint shape:
  - `https://<resource>.openai.azure.com`
- do not paste a Foundry project path such as:
  - `https://<resource>.services.ai.azure.com/api/projects/<project>`

The app does normalize `services.ai.azure.com` hostnames to `openai.azure.com`, but users should still enter the Azure OpenAI endpoint directly whenever possible.

### Browser requirements

- microphone permission for `Mic` mode
- local media playback support for `Upload` mode
- WebRTC support for `Assistant` and `Transcribe`

---

## Install And Run

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

### 5. Open the portal and enter the runtime settings

The app does not require a `.env` file for normal use. Enter the connection values directly in the UI.

Optional backend environment variables can still prefill deployment names:

- `AZURE_OPENAI_ASSISTANT_DEPLOYMENT`
- `AZURE_OPENAI_TRANSLATE_DEPLOYMENT`
- `AZURE_OPENAI_WHISPER_DEPLOYMENT`
- `PORT`

---

## First-Time Setup Checklist

Before clicking `Start`, confirm these items:

1. `Azure endpoint` is your Azure OpenAI resource URL, ideally `https://<resource>.openai.azure.com`
2. `API key` belongs to the same Azure OpenAI resource as the deployments you plan to test
3. `Assistant deployment`, `Translate deployment`, and `Whisper deployment` are deployment names that actually exist on that resource
4. `Mode` matches the deployment you supplied
5. for `Translate`, `Target language` is a simple language code such as `en`, not a region value such as `en-US`
6. for `Transcribe`, `Language hint` is either `Auto detect` or a plain ISO-639-1 code such as `ja`, `ko`, or `zh`

---

## UI Parameter Reference

This section explains every runtime field in the portal and when it matters.

### Connection parameters

| Field | Required | Used by | What to enter | Notes |
| --- | --- | --- | --- | --- |
| `Azure endpoint` | Yes | all modes | Azure OpenAI resource endpoint | Prefer `https://<resource>.openai.azure.com` |
| `API key` | Yes | all modes | Azure OpenAI API key | Must belong to the same resource as the deployments |
| `Assistant deployment` | Assistant mode | assistant | assistant-capable realtime deployment name | Example: `gpt-realtime-1.5`, `gpt-realtime-2`, or a custom deployment name |
| `Translate deployment` | Translate mode | translate | translation deployment name | Use the actual Azure deployment name |
| `Whisper deployment` | Transcribe mode, optional helper for Assistant and Translate | transcribe, optional transcript support elsewhere | whisper realtime deployment name | Required for `Transcribe`; optional when you also want source transcript support in other modes |

### Mode-specific parameters

| Field | Used by | What it does | Recommended starting value |
| --- | --- | --- | --- |
| `Voice` | Assistant | selects assistant output voice | `alloy` |
| `Assistant reasoning` | Assistant | optional `reasoning.effort` control for `gpt-realtime-2` | `Default` for `gpt-realtime-1.5`; try `minimal` or `low` for `gpt-realtime-2` |
| `Target language` | Translate | sets translated output language | `en` for English testing |
| `Language hint` | Transcribe, optional Assistant transcript help, optional Translate source transcript help | improves transcription accuracy and latency when known | `Auto detect` first, then a specific code for difficult languages |
| `Whisper live delay` | Transcribe | controls how early partial text is emitted versus transcript quality | `Default` first; try `minimal` only after basic flow works |
| `Instructions` | Assistant | assistant system behavior | keep concise and task-specific |
| `Assistant text prompt` | Assistant | optional typed follow-up prompt inside an already running assistant session | leave blank unless you want to supplement audio input |
| `Play source audio locally` | all modes with media input | controls whether you hear the original source on your machine | off if you only want model output audio |

Additional note for `gpt-realtime-2`:

- Microsoft documents built-in reasoning for `gpt-realtime-2`, including a `reasoning.effort` control with `minimal`, `low`, `medium`, and `high`
- this demo currently uses `gpt-realtime-2` through the same assistant transport path as other realtime assistant models and does not expose a separate `reasoning.effort` UI control yet

### Source parameters

| Source | What happens |
| --- | --- |
| `Mic` | the browser captures live microphone audio and streams it directly into the selected mode |
| `Upload` | a local audio or video file is played in the page, converted to a `MediaStream`, and its audio is routed into the model |

---

## Supported Language Codes

This section focuses on the codes exposed by the demo UI so that users do not need to guess the acceptable values.

### Translate target language

The app currently exposes these target language codes for `Translate` mode:

`af`, `ar`, `az`, `be`, `bg`, `bs`, `ca`, `cs`, `cy`, `da`, `de`, `el`, `en`, `es`, `et`, `fa`, `fi`, `fr`, `gl`, `he`, `hi`, `hr`, `hu`, `hy`, `id`, `is`, `it`, `iw`, `ja`, `kk`, `kn`, `ko`, `lt`, `lv`, `mi`, `mk`, `mr`, `ms`, `ne`, `nl`, `no`, `pl`, `pt`, `ro`, `ru`, `sk`, `sl`, `sr`, `sv`, `sw`, `ta`, `th`, `tl`, `tr`, `uk`, `ur`, `vi`, `zh`

Practical guidance:

- use simple language codes such as `en`, `ja`, `ko`, or `zh`
- avoid region-tag values such as `en-US`, `en-GB`, or `zh-TW`
- if you want English output, use `en`

### Whisper language hint

The `Language hint` dropdown uses the same language-code set as the UI locale list above, plus:

- empty value for `Auto detect`

Practical guidance:

- leave it on `Auto detect` for mixed-language or uncertain input
- set it explicitly for Japanese, Korean, Simplified Chinese, or Traditional Chinese testing
- use plain ISO-639-1 style values such as `ja`, `ko`, `zh`, `en`, `fr`

### Assistant voice options

The demo currently exposes these assistant voice values:

- `alloy`
- `ash`
- `ballad`
- `coral`
- `echo`
- `sage`
- `shimmer`
- `verse`

### Whisper live delay options

The transcribe UI exposes these delay values:

- `Default`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`

Practical guidance:

- `Default` is the safest first test
- lower delay aims for earlier partial text
- higher delay can improve transcript quality at the cost of slower live updates
- if client secret creation fails after changing this field, return to `Default`

---

## Recommended Getting Started Path

Users should test the modes in this order to isolate setup issues quickly.

### Step 1: Verify assistant mode first

Use these starter values:

- `Mode`: `Assistant`
- `Source`: `Mic`
- `Assistant deployment`: your assistant deployment
- `Voice`: `alloy`
- `Instructions`: a short instruction such as `Be concise and answer in English.`

Expected result:

- the event log shows client secret creation and WebRTC connection activity
- the remote audio player receives assistant output
- the top panels show transcript and assistant response text

### Step 2: Verify transcribe mode

Use these starter values:

- `Mode`: `Transcribe`
- `Source`: `Mic` or `Upload`
- `Whisper deployment`: your whisper deployment
- `Language hint`: `Auto detect` first
- `Whisper live delay`: `Default`

Expected result:

- the left panel shows live or latest transcript text
- the right panel accumulates completed transcript segments
- the raw event inspector shows the realtime transcription events

### Step 3: Verify translate mode

Use these starter values:

- `Mode`: `Translate`
- `Source`: `Mic` or `Upload`
- `Translate deployment`: your translate deployment
- `Target language`: `en`
- optional `Whisper deployment`: only if you also want source transcript support

Expected result:

- translated text appears in the right panel
- translated audio plays back in the browser
- if whisper support is enabled, source transcript text appears in the left panel

---

## Common Errors And How To Avoid Them

### 1. `401 invalid subscription key or wrong API endpoint`

Usually means one of these:

- the endpoint is not the Azure OpenAI-compatible host
- the API key belongs to a different resource
- the deployment is not on the resource identified by the endpoint and key

What to do:

- use `https://<resource>.openai.azure.com`
- verify the key from that exact resource
- verify the deployment names on that same resource

### 2. `400 InvalidSessionType`

This usually appears when a mode is being routed to the wrong realtime path or when a payload shape does not match the session type.

What to do:

- use `Assistant` only for assistant-capable realtime deployments
- use `Translate` only with `gpt-realtime-translate`
- use `Transcribe` only with `gpt-realtime-whisper`
- do not try to reuse one deployment value across all three modes

### 3. `500 Internal server error` during transcribe client secret creation

This can happen when Azure rejects a newer transcription session option.

What to do:

- leave `Whisper live delay` on `Default` first
- confirm `Whisper deployment` is the correct deployment name
- verify the endpoint and key pair again if the error persists

### 4. Translate outputs the wrong language

Common cause:

- target language entered as a region code instead of a supported simple language code

What to do:

- use `en`, not `en-US`
- use the dropdown rather than typing a value manually

### 5. Transcript shows `�` replacement characters

This usually means the payload was already malformed before rendering.

What to try:

- set `Language hint` explicitly
- test cleaner audio with less background music or overlapping speech
- compare `Mic` and `Upload`
- inspect the raw event inspector to see whether the malformed character was already present in the incoming event

### 6. No live transcript, only completed transcript

What to check:

- start with `Whisper live delay = Default`
- inspect the raw event inspector for `conversation.item.input_audio_transcription.delta`
- if no delta events arrive, the service may still be returning only completed chunks for that session or audio pattern

---

## Model Usage Reference

This section focuses on the three model paths documented explicitly in this demo:

- `gpt-realtime-2`
- `gpt-realtime-translate`
- `gpt-realtime-whisper`

It explains the exact protocol family, endpoint shape, headers, and parameters needed to make requests successfully.

### `gpt-realtime-2`

#### When to use it

Use `gpt-realtime-2` when you want a speech-to-speech assistant rather than a pure translator or pure transcription stream. Microsoft’s current concept page describes GPT Realtime 2 as a speech-to-speech model with built-in reasoning for low-latency interactive voice experiences, and it says the connection and usage patterns are the same as earlier realtime versions. citeturn1search0

#### Protocol used in this demo

This demo uses:

- backend to Azure for client secret creation: HTTPS
- browser to Azure for the live session: WebRTC

That is the same assistant-style realtime pattern used by earlier browser voice sessions: the backend creates a short-lived client secret, then the browser creates a WebRTC session and exchanges SDP with Azure. Azure’s GA WebRTC docs call this the preferred transport for client-side realtime audio streaming. citeturn1view4

#### Azure endpoint format

There are two Azure request shapes involved.

##### 1. Client secret creation

```text
POST https://<resource>.openai.azure.com/openai/v1/realtime/client_secrets
```

Headers:

```text
api-key: <azure-openai-api-key>
Content-Type: application/json
```

##### 2. WebRTC SDP exchange

```text
POST https://<resource>.openai.azure.com/openai/v1/realtime/calls?webrtcfilter=on
```

Headers:

```text
Authorization: Bearer <client-secret>
Content-Type: application/sdp
```

Azure’s GA WebRTC docs identify `/openai/v1/realtime/client_secrets` and `/openai/v1/realtime/calls` as the browser WebRTC endpoints, and Azure’s v1 API guidance says the v1 path removes the old dated `api-version` parameter requirement. citeturn1view4turn1view6

#### Required runtime parameters

| Parameter | Required | Example | Purpose |
| --- | --- | --- | --- |
| `endpoint` | Yes | `https://my-resource.openai.azure.com` | Azure OpenAI resource endpoint |
| `apiKey` | Yes | `...` | Azure API key for that resource |
| `assistantDeployment` | Yes | `gpt-realtime-2` | Azure deployment name for the assistant model |
| `voice` | No | `alloy` | output voice used for assistant speech |
| `systemPrompt` | No | `You are a concise voice assistant.` | assistant behavior instructions |
| `whisperDeployment` | No | `gpt-realtime-whisper` | optional helper model for input transcription events |
| `languageHint` | No | `en` | optional hint for the helper transcription model |

#### Body sent by the app to its backend

```json
{
  "mode": "assistant",
  "endpoint": "https://<resource>.openai.azure.com",
  "apiKey": "<api-key>",
  "assistantDeployment": "gpt-realtime-2",
  "voice": "alloy",
  "systemPrompt": "You are a concise voice assistant."
}
```

#### Body sent by the backend to Azure client secrets

```json
{
  "session": {
    "type": "realtime",
    "model": "gpt-realtime-2",
    "instructions": "You are a concise voice assistant.",
    "audio": {
      "output": {
        "voice": "alloy"
      }
    }
  }
}
```

#### Session update sent by the browser after the data channel opens

```json
{
  "type": "session.update",
  "session": {
    "type": "realtime",
    "instructions": "You are a concise voice assistant.",
    "turn_detection": {
      "type": "server_vad",
      "threshold": 0.5,
      "prefix_padding_ms": 300,
      "silence_duration_ms": 200,
      "create_response": true
    },
    "audio": {
      "output": {
        "voice": "alloy"
      }
    },
    "input_audio_transcription": {
      "model": "<optional-whisper-deployment>",
      "language": "<optional-language-hint>"
    }
  }
}
```

This demo does not currently send a `reasoning.effort` field, but Microsoft’s GPT Realtime 2 concept page documents `reasoning.effort` with valid values `minimal`, `low`, `medium`, and `high`. The same concept page also notes stricter instruction following and separate response phases such as commentary and final answer. citeturn1search0

#### Optional text prompt during a running session

Once the assistant data channel is open, the app can also send a typed prompt:

```json
{
  "type": "conversation.item.create",
  "item": {
    "type": "message",
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "Summarize what you just heard."
      }
    ]
  }
}
```

followed by:

```json
{
  "type": "response.create",
  "response": {
    "modalities": ["text", "audio"]
  }
}
```

#### Common success events

Typical assistant events include:

- `conversation.item.input_audio_transcription.completed`
- `response.output_text.delta`
- `response.output_audio_transcript.delta`
- `response.output_text.done`
- `response.output_audio_transcript.done`
- `response.done`

#### Common `gpt-realtime-2` mistakes

- using a translation or transcription endpoint instead of the standard realtime assistant path
- using a deployment that is not actually based on `gpt-realtime-2`
- assuming the protocol changed from earlier realtime assistant models when only the model behavior changed
- over-constraining the prompt; Microsoft notes stricter instruction following in GPT Realtime 2, so prompts sometimes need broader wording than earlier realtime models
- expecting a `reasoning.effort` control in this demo UI even though the current app does not expose that parameter yet

### `gpt-realtime-translate`

#### When to use it

Use `gpt-realtime-translate` when the application should behave like an interpreter, not like a conversational assistant. Official OpenAI guidance treats translation as a dedicated realtime translation session on `/v1/realtime/translations`, separate from the standard voice-agent session on `/v1/realtime`. citeturn1view3turn0search10

#### Protocol used in this demo

This demo uses:

- browser to local backend: WebSocket
- local backend to Azure OpenAI: secure WebSocket

That matches the continuous translation-session model where the client keeps streaming source audio and the service keeps returning translated audio and transcript deltas as the speaker continues. OpenAI’s translation event reference documents `session.update`, `session.input_audio_buffer.append`, and continuous output on the translation socket. citeturn1view1turn1view3

#### Azure endpoint format

The working Azure translation socket shape is:

```text
wss://<resource>.openai.azure.com/openai/v1/realtime/translations?model=<translate-deployment>
```

Rules:

- use `wss://`
- use the Azure OpenAI-compatible host `*.openai.azure.com`
- use the Azure deployment name in `model=...`
- do not append an `api-version` query when using the Azure v1 GA path

Azure’s v1 API guidance says the v1 path removes the old monthly `api-version` requirement. Azure’s general realtime WebSocket docs describe the GA path under `openai/v1/realtime`, and OpenAI’s translation docs define translation as the dedicated `/v1/realtime/translations` path rather than the voice-agent path. citeturn1view6turn1view5turn1view3

#### Required header

The backend-to-Azure translation socket uses:

```text
api-key: <azure-openai-api-key>
```

The Azure key stays server-side in this implementation.

#### Required runtime parameters

| Parameter | Required | Example | Purpose |
| --- | --- | --- | --- |
| `endpoint` | Yes | `https://my-resource.openai.azure.com` | Azure OpenAI resource endpoint |
| `apiKey` | Yes | `...` | Azure API key for that resource |
| `translateDeployment` | Yes | `gpt-realtime-translate` | Azure deployment name for translation |
| `targetLanguage` | Yes | `en` | target output language |
| `whisperDeployment` | No | `gpt-realtime-whisper` | optional model for source transcript deltas |
| `sourceLanguage` | No | `ja` | optional hint for the source transcript model |

#### First frame sent by the browser to the local backend

```json
{
  "type": "proxy.configure",
  "endpoint": "https://<resource>.openai.azure.com",
  "apiKey": "<api-key>",
  "translateDeployment": "<translate-deployment>",
  "targetLanguage": "en",
  "whisperDeployment": "<optional-whisper-deployment>",
  "sourceLanguage": "<optional-language-hint>"
}
```

#### First frame sent by the backend to Azure

```json
{
  "type": "session.update",
  "session": {
    "audio": {
      "input": {
        "noise_reduction": {
          "type": "near_field"
        },
        "transcription": {
          "model": "<optional-whisper-deployment>",
          "language": "<optional-language-hint>"
        }
      },
      "output": {
        "language": "en"
      }
    }
  }
}
```

For translation sessions, the supported `session.update` fields are `audio.output.language`, `audio.input.transcription`, and `audio.input.noise_reduction`. OpenAI’s translation client-event reference documents exactly those update fields. citeturn1view1

#### Audio frames sent after configuration

```json
{
  "type": "session.input_audio_buffer.append",
  "audio": "<base64-encoded-24khz-pcm16-mono>"
}
```

The official translation event reference specifies base64 24 kHz PCM16 mono audio for WebSocket translation sessions and recommends appending audio in roughly 200 ms chunks. citeturn1view1

#### Common success events

Typical translation outputs include:

- `session.input_transcript.delta`
- `conversation.item.input_audio_transcription.delta`
- `session.output_transcript.delta`
- `response.output_audio.delta`
- `response.output_audio_transcript.delta`

#### Common translation mistakes

- using `/openai/v1/realtime` instead of `/openai/v1/realtime/translations`
- using the base model family name instead of the Azure deployment name
- sending `en-US` instead of `en`
- putting the Azure key directly in a browser translation socket
- pasting a Foundry project URL instead of the Azure OpenAI resource endpoint

### `gpt-realtime-whisper`

#### When to use it

Use `gpt-realtime-whisper` when you want streaming speech-to-text without assistant speech output. OpenAI’s transcription docs describe it as the low-latency streaming path for transcript deltas, and Microsoft’s GPT Realtime Whisper overview describes it as a streaming transcription model for live audio. citeturn1view2turn0search3

#### Protocol used in this demo

This demo uses:

- backend to Azure for ephemeral session creation: HTTPS
- browser to Azure for the live session: WebRTC

That fits the browser transcription pattern: a protected backend creates a short-lived client secret, then the browser uses that secret to establish the live WebRTC session. OpenAI’s transcription docs say transcription sessions can use WebSocket for server-side audio pipelines or WebRTC for browser audio. Azure’s WebRTC docs say WebRTC is the preferred client-side transport for realtime audio streaming. citeturn1view2turn1view4

#### Azure endpoint format

There are two Azure request shapes involved.

##### 1. Client secret creation

```text
POST https://<resource>.openai.azure.com/openai/v1/realtime/client_secrets
```

Headers:

```text
api-key: <azure-openai-api-key>
Content-Type: application/json
```

##### 2. WebRTC SDP exchange

```text
POST https://<resource>.openai.azure.com/openai/v1/realtime/calls?webrtcfilter=on
```

Headers:

```text
Authorization: Bearer <client-secret>
Content-Type: application/sdp
```

Azure’s GA WebRTC docs call out `/openai/v1/realtime/client_secrets` and `/openai/v1/realtime/calls` for browser WebRTC sessions, and the Azure v1 API docs explain that the v1 path avoids the older `api-version` query requirement. citeturn1view4turn1view6

#### Required runtime parameters

| Parameter | Required | Example | Purpose |
| --- | --- | --- | --- |
| `endpoint` | Yes | `https://my-resource.openai.azure.com` | Azure OpenAI resource endpoint |
| `apiKey` | Yes | `...` | Azure API key for that resource |
| `whisperDeployment` | Yes | `gpt-realtime-whisper` | Azure transcription deployment name |
| `languageHint` | No | `ja` | optional input language hint |
| `transcriptionDelay` | No | `low` | optional latency-versus-quality control for partial text |

#### Body sent by the app to its backend

```json
{
  "mode": "transcribe",
  "endpoint": "https://<resource>.openai.azure.com",
  "apiKey": "<api-key>",
  "whisperDeployment": "<whisper-deployment>",
  "languageHint": "ja",
  "transcriptionDelay": "low"
}
```

#### Body sent by the backend to Azure client secrets

```json
{
  "session": {
    "type": "transcription",
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "<whisper-deployment>",
          "language": "ja",
          "delay": "low"
        },
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500
        }
      }
    }
  }
}
```

OpenAI’s realtime transcription docs show transcription sessions with `type: "transcription"`, `audio.input.format`, `audio.input.transcription.model`, `audio.input.transcription.language`, and optional `turn_detection`. The transcription-session reference also documents `delay` for `gpt-realtime-whisper`, where lower delay yields earlier partial text and higher delay can improve quality. citeturn1view2turn1view0

#### Common success events

Typical Whisper events include:

- `input_audio_buffer.speech_started`
- `input_audio_buffer.speech_stopped`
- `conversation.item.input_audio_transcription.delta`
- `conversation.item.input_audio_transcription.completed`
- `conversation.item.input_audio_transcription.failed`

#### Common transcription mistakes

- sending an assistant `realtime` session instead of a `transcription` session
- using a non-whisper deployment in the transcription model field
- using a Foundry project URL instead of the Azure OpenAI resource endpoint
- sending `ja-JP` instead of `ja`
- forcing a non-default `delay` value before basic connectivity works
- assuming completed transcript events mean streaming is unsupported; the raw inspector should be checked for delta events first

---

## Technical Notes By Mode

### Assistant

Assistant mode uses a standard realtime voice session:

1. backend creates a client secret
2. browser opens WebRTC
3. browser posts the SDP offer to the Azure OpenAI realtime calls endpoint
4. browser sends `session.update` with assistant instructions, voice, and optional input transcription
5. audio output returns on the remote track

If you point Assistant mode at `gpt-realtime-2`, the transport does not change. Microsoft’s current concept page says GPT Realtime 2 uses the same connection and usage patterns as earlier realtime versions, but adds built-in reasoning, stricter instruction following, response phases such as commentary and final answer, and a larger 256,000-token context window. This means the safest update for existing apps is usually to keep the protocol the same and revisit prompt wording and reasoning controls separately. 

### Translate

Translate mode uses a dedicated translation session through a backend proxy:

1. browser captures source audio
2. browser opens a local WebSocket to the backend
3. backend opens Azure translation WebSocket
4. browser sends base64 PCM16 audio chunks
5. backend forwards them to Azure
6. translated transcript and audio deltas are returned to the browser

### Transcribe

Transcribe mode uses a transcription session rather than an assistant conversation session:

1. backend creates a transcription client secret
2. browser opens WebRTC
3. source audio is attached as the local track
4. transcription events arrive over the realtime data channel
5. live text is shown in the left panel
6. completed segments accumulate in the right panel

---

## Character Handling And Transcript Quality

### What the app does

The app tries to preserve text correctly by:

- treating realtime events as text payloads
- rendering transcript strings directly without manual character-set conversion
- normalizing displayed strings to Unicode NFC
- using multilingual font fallbacks for Simplified Chinese, Traditional Chinese, Japanese, and Korean
- logging when replacement characters (`�`) are already present in the upstream payload

### What the app may not work well on

If the incoming event already contains replacement characters, the browser UI cannot reconstruct the lost original text.

Typical causes:

- noisy or low-quality source audio
- incorrect language detection
- mixed-language speech in a short segment
- background music contaminating the input
- upstream model output already malformed before the UI receives it

### Best practices for multilingual testing

- set `Language hint` explicitly for `ja`, `ko`, or `zh` when the source language is known
- prefer clean uploaded files when validating text quality
- keep the source audio as dry and speech-focused as possible
- use the raw event inspector to distinguish rendering issues from upstream payload issues
