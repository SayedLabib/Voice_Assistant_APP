import os
import asyncio
import aiohttp
import base64
import json
from dotenv import load_dotenv
import traceback

# Load environment variables
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# Language code mapping for Whisper API
LANGUAGE_CODES = {
    "en": "english",
    "de": "german",
    "bn": "bengali",
    "hi": "hindi",
    "ur": "urdu",
    "ar": "arabic",
    "es": "spanish",
    "fr": "french",
    "ru": "russian",
    "zh": "chinese",
    "ja": "japanese"
}

class WhisperSTTService:
    """
    Speech-to-text service using Groq's API with whisper-large-v3-turbo model
    for enhanced accuracy and multilingual support.
    """
    
    def __init__(self):
        self.api_key = GROQ_API_KEY
        self.api_url = "https://api.groq.com/openai/v1/audio/transcriptions"
        
        # Check if the API key is configured
        if not self.api_key:
            print("WARNING: GROQ_API_KEY not found in environment variables. Whisper service will not work correctly.")
        else:
            print("Initializing WhisperSTT with Groq API - whisper-large-v3-turbo model")
    
    async def transcribe_audio(self, audio_data_base64, language=None):
        """
        Transcribe audio using Groq's whisper-large-v3-turbo model
        
        Parameters:
        - audio_data_base64: Base64 encoded audio data
        - language: Optional language code to specify the spoken language
                   If not provided, Whisper will detect the language automatically
        
        Returns:
        - Dictionary with transcription text and detected language
        """
        try:
            # Check if API key is configured
            if not self.api_key:
                return {"text": "Error: GROQ_API_KEY not configured. Please set it in the .env file.", "detected_language": "unknown"}
                
            # Process language parameter - ensure it's in correct format for Whisper API
            whisper_language = None
            full_language_name = None
            
            if language and language != "auto":
                # Extract just the language code without region if it contains a hyphen
                if '-' in language:
                    language = language.split('-')[0].lower()
                else:
                    language = language.lower()
                
                # Find the full language name for better results with Whisper API
                if language in LANGUAGE_CODES:
                    whisper_language = language
                    full_language_name = LANGUAGE_CODES[language]
                
            print(f"Starting transcription with Groq API, requested language={language}, using={whisper_language} ({full_language_name})")
            
            # Decode the base64 audio data
            audio_bytes = base64.b64decode(audio_data_base64)
            print(f"Audio length in bytes: {len(audio_bytes)}")
            
            headers = {
                "Authorization": f"Bearer {self.api_key}"
            }
            
            # Prepare form data with the audio file
            form_data = aiohttp.FormData()
            form_data.add_field(
                name='file',
                value=audio_bytes,
                content_type='audio/webm',
                filename='audio.webm'
            )
            form_data.add_field('model', 'whisper-large-v3-turbo')
            
            # Important: For proper language detection, we usually DON'T want to specify
            # the language parameter when we want Whisper to detect the language
            # Only specify language if we're certain about it
            if language != "auto" and whisper_language:
                form_data.add_field('language', whisper_language)
                print(f"Specifying language for Whisper API: {whisper_language}")
            else:
                print("Auto-detecting language with Whisper API")
            
            # Add additional parameters for better performance
            form_data.add_field('response_format', 'json')
            form_data.add_field('temperature', '0.0')  # More deterministic results
                        
            print(f"Sending audio to Groq API for transcription...")
            
            # Send the request to the Groq API
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_url,
                    headers=headers,
                    data=form_data,
                    timeout=30  # Increase timeout for larger audio files
                ) as response:
                    print(f"Groq API response status: {response.status}")
                    if response.status == 200:
                        result = await response.json()
                        transcribed_text = result.get('text', '')
                        
                        # Extract detected language - default to selected if not provided
                        detected_language = result.get('language', language or 'unknown')
                        
                        print(f"Detected language: {detected_language}")
                        print(f"Transcription successful: {transcribed_text[:50]}...")
                        
                        return {
                            "text": transcribed_text,
                            "detected_language": detected_language
                        }
                    else:
                        error_text = await response.text()
                        error_details = "Unknown error"
                        try:
                            error_json = json.loads(error_text)
                            error_details = error_json.get('error', {}).get('message', error_text[:100])
                        except:
                            error_details = error_text[:100]
                        
                        print(f"Groq API error: {response.status}, {error_details}")
                        return {
                            "text": f"API Error: {response.status} - {error_details}",
                            "detected_language": "unknown"
                        }
                        
        except Exception as e:
            traceback.print_exc()
            print(f"Error in Groq transcription: {str(e)}")
            return {
                "text": f"Transcription error: {str(e)}", 
                "detected_language": "unknown"
            }
    
    async def transcribe_live_audio(self, audio_chunks, language=None):
        """
        Process a stream of audio chunks for near-real-time transcription
        """
        # Currently Groq API doesn't support streaming for audio transcription, 
        # so we need to combine chunks and process as one
        combined_audio = b''.join(audio_chunks)
        base64_audio = base64.b64encode(combined_audio).decode('utf-8')
        
        return await self.transcribe_audio(base64_audio, language)