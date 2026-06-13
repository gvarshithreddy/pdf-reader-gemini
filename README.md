# Neural PDF Reader & Kokoro TTS Backend (v1.0.0)

A high-performance interactive PDF content reader and text-to-speech speaker. It processes PDF documents locally, matches character dimensions, and streams synthesized speech chunks gaplessly using Web Audio API scheduling.

## Project Structure

- **`/frontend`**: React + Vite + TypeScript application for the PDF reader and visual text highlighter.
- **`/backend`**: FastAPI TTS engine powered by Kokoro-82M.

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- Python 3.11+

---

### Running the Backend (FastAPI + Kokoro)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Activate the virtual environment:
   ```bash
   .venv\Scripts\activate
   ```
3. Run the backend server:
   ```bash
   python server.py
   ```
   *Note: The server will run on `0.0.0.0:8000` (accessible locally and on your local network).*

---

### Running the Frontend (Vite)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
   *Note: The dev server will run on `0.0.0.0:3000` (accessible locally and on your local network).*

---

## Configuration

When launching the app, enter your local network IP (e.g. `192.168.29.195:8000`) in the server setup prompt to connect the frontend reader to the neural TTS synthesizer backend. Alternatively, type `mock` to run offline using browser-synthesized demo audio.
