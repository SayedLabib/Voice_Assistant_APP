from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import json
import os
import traceback  # Add the missing traceback import
from dotenv import load_dotenv
from services.stt_service import STTService
from services.tts_service import TTSService
from services.whisper_stt_service import WhisperSTTService

# Load environment variables
load_dotenv()
USE_WHISPER = os.getenv("USE_WHISPER", "false").lower() == "true"

router = APIRouter()

# Initialize services
stt_service = STTService()
tts_service = TTSService(language=os.getenv("TTS_LANGUAGE", "de"))
whisper_stt_service = WhisperSTTService() if USE_WHISPER else None

# Pydantic models for request validation
class TextToSpeechRequest(BaseModel):
    text: str

class SpeechToTextRequest(BaseModel):
    text: str
    source_language: str = "auto"

class AudioToTextRequest(BaseModel):
    audio_data: str  # Base64 encoded audio data
    language: str = "auto"

# Active WebSocket connections
active_connections = {}

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time communication with the client"""
    await websocket.accept()
    client_id = id(websocket)
    active_connections[client_id] = websocket
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("action") == "process_speech":
                # Get the recognized text from the client
                text = message.get("text", "")
                source_lang = message.get("language", "auto")
                
                if text:
                    try:
                        # Translate to German if needed
                        german_text = await stt_service.recognize(text, source_lang)
                        
                        # Convert German text to speech
                        audio_data = await tts_service.convert(german_text)
                        
                        # Send the processed data back to the client
                        await websocket.send_json({
                            "type": "processed_speech",
                            "original_text": text,
                            "translated_text": german_text,
                            "audio_data": audio_data
                        })
                    except Exception as e:
                        await websocket.send_json({
                            "type": "error",
                            "message": str(e)
                        })
            
            elif message.get("action") == "process_audio":
                # This is for Whisper-based speech recognition
                audio_data = message.get("audio_data", "")
                source_lang = message.get("language", "auto")
                
                if audio_data and whisper_stt_service:
                    try:
                        # Log language information
                        print(f"Processing audio with Whisper in language: {source_lang}")
                        
                        # Transcribe audio using Whisper
                        result = await whisper_stt_service.transcribe_audio(audio_data, source_lang)
                        text = result.get("text", "")
                        detected_language = result.get("detected_language", source_lang)
                        
                        # Check if text is empty or error message
                        if not text or text.startswith("API Error") or text.startswith("Transcription error"):
                            raise Exception(f"Failed to transcribe audio: {text}")
                        
                        # Log the transcription result
                        print(f"Whisper transcription: {text[:50]}... in language: {detected_language}")
                        
                        # Translate to German if needed (in case Whisper doesn't return German directly)
                        german_text = await stt_service.recognize(text, detected_language)
                        
                        # Check if we have text to convert to speech
                        if not german_text or len(german_text.strip()) == 0:
                            raise Exception("No text to send to TTS API - translation returned empty result")
                        
                        # Convert German text to speech
                        audio_data = await tts_service.convert(german_text)
                        
                        # Send the processed data back to the client with detected language
                        await websocket.send_json({
                            "type": "processed_speech",
                            "original_text": text,
                            "translated_text": german_text,
                            "audio_data": audio_data,
                            "detected_language": detected_language  # Send detected language to frontend
                        })
                    except Exception as e:
                        print(f"Error in process_audio: {str(e)}")
                        traceback.print_exc()
                        await websocket.send_json({
                            "type": "error",
                            "message": str(e)
                        })
                elif not whisper_stt_service:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Whisper service is not enabled. Set USE_WHISPER=true in .env file."
                    })
            
            elif message.get("action") == "tts":
                # Text-to-speech request
                text = message.get("text", "")
                if text:
                    try:
                        audio_data = await tts_service.convert(text)
                        await websocket.send_json({
                            "type": "audio",
                            "text": text,
                            "audio_data": audio_data
                        })
                    except Exception as e:
                        await websocket.send_json({
                            "type": "error",
                            "message": str(e)
                        })
    
    except WebSocketDisconnect:
        print(f"Client #{client_id} disconnected")
        if client_id in active_connections:
            del active_connections[client_id]
    except Exception as e:
        print(f"Error in WebSocket connection #{client_id}: {str(e)}")
        if client_id in active_connections:
            try:
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })
            except:
                pass
            del active_connections[client_id]

@router.post("/transcribe_audio", response_model=dict)
async def transcribe_audio(request: AudioToTextRequest):
    """Endpoint to transcribe audio using Whisper API"""
    if not whisper_stt_service:
        return JSONResponse(
            status_code=400,
            content={
                "success": False, 
                "error": "Whisper service is not enabled. Set USE_WHISPER=true in .env file."
            }
        )
    
    try:
        text = await whisper_stt_service.transcribe_audio(
            request.audio_data, request.language
        )
        return {"success": True, "text": text}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

@router.post("/tts", response_model=dict)
async def text_to_speech(request: TextToSpeechRequest):
    """Fallback HTTP endpoint for text-to-speech"""
    try:
        audio_data = await tts_service.convert(request.text)
        return {"success": True, "audio_data": audio_data}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )