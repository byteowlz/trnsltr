# Real-Time Translator

A real-time speech-to-text translation application that uses the ears websocket server for speech recognition and AI SDK with local LLM for translation.

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Speech Recognition**: ears websocket server
- **Translation**: AI SDK with local LLM (Ollama)

## Prerequisites

- Bun package manager
- ears websocket server running
- Ollama with a model installed (e.g., llama3.2)

## Setup

1. Install dependencies:

```bash
bun install
```

2. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`:

```env
VITE_EARS_WS_URL=ws://localhost:8765
VITE_LLM_BASE_URL=http://localhost:11434/v1
VITE_LLM_MODEL=llama3.2
```

## Running

Start the development server:

```bash
bun dev
```

Build for production:

```bash
bun run build
```

Preview production build:

```bash
bun run preview
```

## ears Websocket Server

The application expects messages from the ears server in the following format:

```json
{
  "type": "interim" | "transcription" | "error",
  "text": "transcribed text",
  "is_final": true | false,
  "error": "error message"
}
```

Message types:

- `interim`: Partial transcription (not final)
- `transcription`: Final transcription when `is_final` is true
- `error`: Error message from the server

## Translation Flow

1. User clicks the microphone button to start listening
2. App sends `{"type": "start"}` to ears websocket server
3. ears server streams transcriptions back
4. When a final transcription is received, the app uses AI SDK to translate via local LLM
5. Both original and translated text are displayed in the UI

## Configuration

All configuration is handled through environment variables:

- `VITE_EARS_WS_URL`: WebSocket URL for ears server
- `VITE_LLM_BASE_URL`: Base URL for local LLM API (Ollama compatible)
- `VITE_LLM_MODEL`: Model name to use for translation
