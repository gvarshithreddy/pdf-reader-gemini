import asyncio
import logging
import os
import io
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import uvicorn

from tts_wrapper import KokoroTTSWrapper
from models import _build_voice_maps

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get available voices
_internal_voices, _ = _build_voice_maps()
VALID_VOICES = tuple(sorted(_internal_voices.keys()))

# Initialize FastAPI app
app = FastAPI(
    title="Kokoro TTS API",
    description="Text-to-Speech API with concurrent request handling",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "*"], # Added "*" to ensure mobile Wi-Fi IPs don't get blocked
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize TTS wrapper globally
tts_engine: Optional[KokoroTTSWrapper] = None

# Create a thread pool for CPU-intensive TTS operations
executor = ThreadPoolExecutor(max_workers=6)


class TTSRequest(BaseModel):
    """Request model for TTS synthesis"""
    text: str = Field(..., description="Text to synthesize")
    voice: Literal[VALID_VOICES] = Field(default="af_bella", description="Voice to use")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Speed multiplier (0.5-2.0)")
    pitch: float = Field(default=1.0, ge=0.5, le=2.0, description="Pitch multiplier (0.5-2.0)")
    sample_rate: int = Field(default=24000, description="Sample rate in Hz")


@app.on_event("startup")
async def startup_event():
    """Initialize TTS engine on startup"""
    global tts_engine
    try:
        logger.info("Initializing Kokoro TTS engine...")
        tts_engine = KokoroTTSWrapper()
        logger.info(f"TTS engine initialized successfully with {len(VALID_VOICES)} voices")
    except Exception as e:
        logger.error(f"Failed to initialize TTS engine: {e}")
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    global tts_engine
    logger.info("Shutting down TTS server...")
    tts_engine = None


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    if tts_engine is None:
        raise HTTPException(status_code=503, detail="TTS engine not initialized")
    return {"status": "healthy", "engine": "Kokoro TTS"}


@app.post("/synthesize")
async def synthesize_text(request: TTSRequest) -> StreamingResponse:
    """
    Synthesize text to speech asynchronously.
    """
    if tts_engine is None:
        raise HTTPException(status_code=503, detail="TTS engine not initialized")
    
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    logger.info(f"Processing TTS POST request: text='{request.text[:50]}...', voice={request.voice}")
    
    try:
        loop = asyncio.get_event_loop()
        
        audio_data = await loop.run_in_executor(
            executor,
            _synthesize_audio,
            request.text,
            request.voice,
            request.speed,
            request.pitch,
            request.sample_rate
        )
        
        return StreamingResponse(
            io.BytesIO(audio_data),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=output.wav"}
        )
    
    except Exception as e:
        logger.error(f"TTS synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


# ---> THE FIXED GET ROUTE <---
@app.get("/synthesize")
async def synthesize_get(
    text: str, 
    voice: str = "af_bella", 
    speed: float = 1.0, 
    pitch: float = 1.0,
    sample_rate: int = 24000
) -> StreamingResponse:
    """
    Synthesize text to speech asynchronously via GET request for Native Mobile Downloaders.
    """
    if tts_engine is None:
        raise HTTPException(status_code=503, detail="TTS engine not initialized")
    
    if not text or len(text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    logger.info(f"Processing TTS GET request: text='{text[:50]}...', voice={voice}")
    
    try:
        loop = asyncio.get_event_loop()
        
        audio_data = await loop.run_in_executor(
            executor,
            _synthesize_audio,
            text,
            voice,
            speed,
            pitch,
            sample_rate
        )
        
        return StreamingResponse(
            io.BytesIO(audio_data),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=output.wav"}
        )
    
    except Exception as e:
        logger.error(f"TTS synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


def _synthesize_audio(text: str, voice: str, speed: float, pitch: float, sample_rate: int) -> bytes:
    """
    Perform actual TTS synthesis (runs in thread pool).
    This function blocks and is meant to run in executor.
    """
    global tts_engine
    
    try:
        segments = [(text, [voice], None)]
        
        audio_results, _ = tts_engine.synthesize(
            segments=segments,
            speed=speed,
            pitch=pitch,
            sample_rate=sample_rate,
            output_format='WAV'
        )
        
        if not audio_results:
            raise ValueError("No audio generated")
        
        _, _, audio_array, _ = audio_results[0]
        
        import soundfile as sf
        import numpy as np
        
        buffer = io.BytesIO()
        sf.write(buffer, audio_array, sample_rate, format='WAV')
        buffer.seek(0)
        
        return buffer.read()
    
    except Exception as e:
        logger.error(f"Audio synthesis failed: {e}")
        raise


@app.post("/batch")
async def synthesize_batch(requests: list[TTSRequest]) -> list[dict]:
    """
    Synthesize multiple texts in parallel.
    Returns status for each request.
    """
    if tts_engine is None:
        raise HTTPException(status_code=503, detail="TTS engine not initialized")
    
    if len(requests) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 requests per batch")
    
    logger.info(f"Processing batch of {len(requests)} requests")
    
    tasks = [
        asyncio.create_task(_process_batch_item(req))
        for req in requests
    ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    return [
        {
            "text": requests[i].text[:30],
            "status": "success" if isinstance(results[i], bytes) else "error",
            "message": "Audio generated" if isinstance(results[i], bytes) else str(results[i])
        }
        for i in range(len(requests))
    ]


async def _process_batch_item(request: TTSRequest) -> bytes:
    """Process a single batch item asynchronously"""
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            executor,
            _synthesize_audio,
            request.text,
            request.voice,
            request.speed,
            request.pitch,
            request.sample_rate
        )
    except Exception as e:
        logger.error(f"Batch item failed: {e}")
        raise


if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        workers=1,
        log_level="info"
    )