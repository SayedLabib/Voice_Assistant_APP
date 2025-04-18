import os
import aiohttp
import base64
import json
from dotenv import load_dotenv

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
        
        if not self.api_key:
            print("WARNING: GROQ_API_KEY not found in environment variables. Whisper service will not work correctly.")
    
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
        # Check if API key is configured
        if not self.api_key:
            return {"text": "Error: GROQ_API_KEY not configured. Please set it in the .env file.", "detected_language": "unknown"}
            
        # Process language parameter
        whisper_language = None
        
        if language and language != "auto":
            # Extract just the language code without region if it contains a hyphen
            if '-' in language:
                language = language.split('-')[0].lower()
            else:
                language = language.lower()
            
            # Find the language code if it's in our mapping
            if language in LANGUAGE_CODES:
                whisper_language = language
        
        try:
            # Decode the base64 audio data
            audio_bytes = base64.b64decode(audio_data_base64)
            
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
            
            # Only specify language if we're certain about it
            if language != "auto" and whisper_language:
                form_data.add_field('language', whisper_language)
            
            # Add additional parameters for better performance
            form_data.add_field('response_format', 'json')
            form_data.add_field('temperature', '0.0')
            
            # Send the request to the Groq API
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_url,
                    headers=headers,
                    data=form_data,
                    timeout=30
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        return {
                            "text": result.get('text', ''),
                            "detected_language": result.get('language', language or 'unknown')
                        }
                    else:
                        error_text = await response.text()
                        error_details = "Unknown error"
                        try:
                            error_json = json.loads(error_text)
                            error_details = error_json.get('error', {}).get('message', error_text[:100])
                        except:
                            error_details = error_text[:100]
                        
                        return {
                            "text": f"API Error: {response.status} - {error_details}",
                            "detected_language": "unknown"
                        }
                        
        except Exception as e:
            return {
                "text": f"Transcription error: {str(e)}", 
                "detected_language": "unknown"
            }
    
    async def transcribe_live_audio(self, audio_chunks, language=None):
        """
        Process a stream of audio chunks for near-real-time transcription
        """
        combined_audio = b''.join(audio_chunks)
        base64_audio = base64.b64encode(combined_audio).decode('utf-8')
        
        return await self.transcribe_audio(base64_audio, language)