from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import json
import os
from dotenv import load_dotenv
from services.stt_service import STTService
from services.whisper_stt_service import WhisperSTTService
import asyncio

# Load environment variables
load_dotenv()
USE_WHISPER = os.getenv("USE_WHISPER", "true").lower() == "true"  # Default to using Whisper

router = APIRouter()

# Initialize services
stt_service = STTService()
whisper_stt_service = WhisperSTTService() if USE_WHISPER else None

# Pydantic models for request validation
class SpeechToTextRequest(BaseModel):
    text: str
    source_language: str = "auto"
    target_language: str = "de"  # Default to German

class AudioToTextRequest(BaseModel):
    audio_data: str  # Base64 encoded audio data
    language: str = "auto"
    target_language: str = "de"  # Default to German

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
                # Always translate to German
                target_lang = "de"
                
                if not text:
                    continue
                
                try:
                    # Translate the text to German
                    translated_text = await stt_service.recognize(text, source_lang, target_lang)
                    
                    # Send the processed data back to the client
                    await websocket.send_json({
                        "type": "processed_speech",
                        "original_text": text,
                        "translated_text": translated_text,
                        "detected_language": source_lang
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e)
                    })
            
            # New action handler for direct text translation requests from the browser's Web Speech API
            elif message.get("action") == "translate_text":
                text = message.get("text", "")
                source_lang = message.get("source_language", "auto")
                target_lang = message.get("target_language", "de")  # Default to German
                is_incremental = message.get("is_incremental", False)  # Check if this is an incremental update
                
                if not text:
                    continue
                
                try:
                    # Translate the text to German
                    translated_text = await stt_service.recognize(text, source_lang, target_lang)
                    
                    # Send only the translation back to the client
                    await websocket.send_json({
                        "type": "translation_only",
                        "translated_text": translated_text,
                        "is_incremental": is_incremental  # Pass back this flag so client knows how to handle it
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e)
                    })
            
            elif message.get("action") == "process_audio" and whisper_stt_service:
                # Whisper-based speech recognition optimized for live transcription
                audio_data = message.get("audio_data", "")
                source_lang = message.get("language", "auto")
                target_lang = "de"  # Always translate to German
                
                if not audio_data:
                    continue
                
                try:
                    # Create background tasks for transcription and translation
                    transcription_task = asyncio.create_task(
                        whisper_stt_service.transcribe_audio(audio_data, source_lang)
                    )
                    
                    # Get transcription result
                    result = await transcription_task
                    text = result.get("text", "")
                    detected_language = result.get("detected_language", source_lang)
                    
                    # Skip processing if transcription failed
                    if not text:
                        continue
                    
                    if text.startswith("API Error") or text.startswith("Transcription error"):
                        await websocket.send_json({
                            "type": "error",
                            "message": text
                        })
                        continue
                    
                    # Start translation in parallel for efficiency
                    translation_task = asyncio.create_task(
                        stt_service.recognize(text, detected_language, target_lang)
                    )
                    
                    # Send intermediate response immediately with just the original text
                    # This provides instant feedback to the user while translation is in progress
                    await websocket.send_json({
                        "type": "interim_speech",
                        "original_text": text,
                        "detected_language": detected_language
                    })
                    
                    # Now wait for translation to complete
                    translated_text = await translation_task
                    
                    if not translated_text:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Translation returned empty result"
                        })
                        continue
                    
                    # Send the final processed data back to the client
                    await websocket.send_json({
                        "type": "processed_speech",
                        "original_text": text,
                        "translated_text": translated_text,
                        "detected_language": detected_language
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e)
                    })
            
            elif message.get("action") == "process_audio" and not whisper_stt_service:
                await websocket.send_json({
                    "type": "error",
                    "message": "Whisper service is not enabled. Set USE_WHISPER=true in .env file."
                })
    
    except WebSocketDisconnect:
        if client_id in active_connections:
            del active_connections[client_id]
    except Exception as e:
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
        # Always translate to German
        target_lang = "de"
        
        result = await whisper_stt_service.transcribe_audio(
            request.audio_data, request.language
        )
        
        text = result.get("text", "")
        detected_language = result.get("detected_language", request.language)
        
        # Translate to German
        translated_text = await stt_service.recognize(text, detected_language, target_lang)
        
        return {
            "success": True, 
            "text": text, 
            "translated_text": translated_text,
            "detected_language": detected_language
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )