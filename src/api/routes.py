from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import json
import os
from dotenv import load_dotenv
from services.stt_service import STTService
from services.tts_service import TTSService

# Load environment variables
load_dotenv()

router = APIRouter()

# Initialize services
stt_service = STTService()
tts_service = TTSService(language=os.getenv("TTS_LANGUAGE", "de"))

# Pydantic models for request validation
class TextToSpeechRequest(BaseModel):
    text: str

class SpeechToTextRequest(BaseModel):
    text: str
    source_language: str = "auto"

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