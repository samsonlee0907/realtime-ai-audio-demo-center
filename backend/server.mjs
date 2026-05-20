import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import WebSocket, { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const frontendDist = path.join(repoRoot, "frontend", "dist");


function normalizeEndpoint(endpoint) {
  const value = (endpoint || "").trim().replace(/\/$/, "");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error("AZURE_OPENAI_ENDPOINT must use https.");
  }
  if (parsed.hostname.endsWith(".services.ai.azure.com")) {
    parsed.hostname = parsed.hostname.replace(/\.services\.ai\.azure\.com$/, ".openai.azure.com");
  }
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}


function settings() {
  return {
    endpoint: (process.env.AZURE_OPENAI_ENDPOINT || "").trim(),
    apiKey: (process.env.AZURE_OPENAI_API_KEY || "").trim(),
    assistantDeployment: (process.env.AZURE_OPENAI_ASSISTANT_DEPLOYMENT || "").trim(),
    translateDeployment: (process.env.AZURE_OPENAI_TRANSLATE_DEPLOYMENT || "").trim(),
    whisperDeployment: (process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT || "").trim(),
    port: Number(process.env.PORT || 8780)
  };
}


function resolveConnection({ endpoint, apiKey }, current) {
  const resolvedEndpoint = normalizeEndpoint((endpoint || current.endpoint || "").trim());
  const resolvedApiKey = (apiKey || current.apiKey || "").trim();
  if (!resolvedApiKey) {
    throw new Error("API key is required.");
  }
  return {
    endpoint: resolvedEndpoint,
    apiKey: resolvedApiKey
  };
}


function translationWsUrl(endpoint, deployment) {
  if (!deployment) {
    throw new Error("Translate deployment is required.");
  }
  const parsed = new URL(normalizeEndpoint(endpoint));
  return `wss://${parsed.host}/openai/v1/realtime/translations?model=${encodeURIComponent(deployment)}`;
}


function clientSecretsUrl(endpoint) {
  return `${normalizeEndpoint(endpoint)}/openai/v1/realtime/client_secrets`;
}


function whisperClientSecretSession(languageHint, whisperDeployment, transcriptionDelay) {
  const transcription = { model: whisperDeployment };
  if (languageHint) {
    transcription.language = languageHint;
  }
  if (transcriptionDelay) {
    transcription.delay = transcriptionDelay;
  }
  return {
    type: "transcription",
    audio: {
      input: {
        format: { type: "audio/pcm", rate: 24000 },
        transcription,
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        }
      }
    }
  };
}


function assistantClientSecretSession({ assistantDeployment, voice, systemPrompt, whisperDeployment, languageHint, reasoningEffort }) {
  if (!assistantDeployment) {
    throw new Error("Assistant deployment is required.");
  }
  const session = {
    type: "realtime",
    model: assistantDeployment,
    instructions: systemPrompt || "You are a helpful voice assistant. Respond clearly and concisely.",
    audio: {
      output: {
        voice: voice || "alloy"
      }
    }
  };
  if (whisperDeployment) {
    session.input_audio_transcription = { model: whisperDeployment };
    if (languageHint) {
      session.input_audio_transcription.language = languageHint;
    }
  }
  if (reasoningEffort) {
    session.reasoning = { effort: reasoningEffort };
  }
  return session;
}


function translateSessionUpdate({ targetLanguage, sourceLanguage, whisperDeployment }) {
  const session = {
    audio: {
      input: {
        noise_reduction: { type: "near_field" }
      },
      output: {
        language: targetLanguage || "en"
      }
    }
  };
  if (whisperDeployment) {
    session.audio.input.transcription = { model: whisperDeployment };
    if (sourceLanguage) {
      session.audio.input.transcription.language = sourceLanguage;
    }
  }
  return { type: "session.update", session };
}


const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  try {
    const current = settings();
    res.json({
      ok: true,
      endpointConfigured: Boolean(current.endpoint),
      apiKeyConfigured: Boolean(current.apiKey),
      assistantDeployment: current.assistantDeployment,
      translateDeployment: current.translateDeployment,
      whisperDeployment: current.whisperDeployment
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/config", (_req, res) => {
  const current = settings();
  res.json({
    endpoint: current.endpoint,
    assistantDeployment: current.assistantDeployment,
    translateDeployment: current.translateDeployment,
    whisperDeployment: current.whisperDeployment
  });
});

app.post("/api/session/client-secret", async (req, res) => {
  try {
    const current = settings();
    const connection = resolveConnection(req.body, current);
    const mode = (req.body.mode || "").trim();
    let session;

    if (mode === "assistant") {
      session = assistantClientSecretSession({
        assistantDeployment: (req.body.assistantDeployment || current.assistantDeployment || "").trim(),
        voice: (req.body.voice || "").trim(),
        systemPrompt: (req.body.systemPrompt || "").trim(),
        whisperDeployment: (req.body.whisperDeployment || current.whisperDeployment || "").trim(),
        languageHint: (req.body.languageHint || "").trim(),
        reasoningEffort: (req.body.reasoningEffort || "").trim()
      });
    } else if (mode === "transcribe") {
      const whisperDeployment = (req.body.whisperDeployment || current.whisperDeployment || "").trim();
      if (!whisperDeployment) {
        res.status(400).json({ error: "Whisper deployment is required." });
        return;
      }
      session = whisperClientSecretSession(
        (req.body.languageHint || "").trim(),
        whisperDeployment,
        (req.body.transcriptionDelay || "").trim()
      );
    } else {
      res.status(400).json({ error: "Unsupported client-secret mode." });
      return;
    }

    const response = await fetch(clientSecretsUrl(connection.endpoint), {
      method: "POST",
      headers: {
        "api-key": connection.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ session })
    });

    const text = await response.text();
    res.status(response.status);
    res.type(response.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path === "/health") {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (browserWs) => {
  let azureWs = null;
  let configured = false;

  browserWs.on("message", async (raw) => {
    try {
        const payload = JSON.parse(raw.toString());

        if (!configured) {
        if (payload.type !== "proxy.configure") {
          browserWs.send(JSON.stringify({ type: "proxy.error", message: "First frame must be proxy.configure." }));
          browserWs.close();
          return;
        }

        const current = settings();
        const connection = resolveConnection(payload, current);
        const translateDeployment = (payload.translateDeployment || current.translateDeployment || "").trim();
        const whisperDeployment = (payload.whisperDeployment || current.whisperDeployment || "").trim();
        const azureUrl = translationWsUrl(connection.endpoint, translateDeployment);
        const initialEvent = translateSessionUpdate({
          targetLanguage: payload.targetLanguage,
          sourceLanguage: payload.sourceLanguage,
          whisperDeployment
        });

        azureWs = new WebSocket(azureUrl, {
          headers: { "api-key": connection.apiKey }
        });

        azureWs.on("open", () => {
          configured = true;
          azureWs.send(JSON.stringify(initialEvent));
          browserWs.send(JSON.stringify({ type: "proxy.ready", mode: "translate", azureUrl }));
        });

        azureWs.on("message", (message) => {
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(message.toString());
          }
        });

        azureWs.on("error", (error) => {
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(JSON.stringify({ type: "proxy.error", message: error.message }));
          }
        });

        azureWs.on("close", () => {
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.close();
          }
        });

        return;
      }

      if (azureWs && azureWs.readyState === WebSocket.OPEN) {
        azureWs.send(JSON.stringify(payload));
      }
    } catch (error) {
      if (browserWs.readyState === WebSocket.OPEN) {
        browserWs.send(JSON.stringify({ type: "proxy.error", message: error.message }));
      }
    }
  });

  browserWs.on("close", () => {
    if (azureWs && azureWs.readyState === WebSocket.OPEN) {
      azureWs.close();
    }
  });
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname !== "/api/ws/translate") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.listen(settings().port, "127.0.0.1", () => {
  console.log(`Backend listening on http://127.0.0.1:${settings().port}`);
});
