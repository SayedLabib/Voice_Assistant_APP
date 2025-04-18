import pyttsx3
from io import BytesIO
import base64
import tempfile
import os
import asyncio
import threading

class TTSService:
    def __init__(self, language='de'):
        self.language = language
        # Initialize the TTS engine in a separate thread
        self.engine_ready = threading.Event()
        threading.Thread(target=self._setup_engine).start()
        
    def _setup_engine(self):
        """Set up the TTS engine with a male voice"""
        self.engine = pyttsx3.init()
        
        # Get available voices
        voices = self.engine.getProperty('voices')
        
        # Set male voice - look for a male voice in the requested language
        male_voice = None
        for voice in voices:
            # Check if this is a male voice and matches our language
            if self.language in voice.id.lower() and ('male' in voice.id.lower() or not 'female' in voice.id.lower()):
                male_voice = voice.id
                break
        
        # If we found a language-specific male voice, use it
        if male_voice:
            self.engine.setProperty('voice', male_voice)
        # Otherwise, try to find any male voice
        else:
            # Look for any male voice
            for voice in voices:
                if 'male' in voice.id.lower() or not 'female' in voice.id.lower():
                    male_voice = voice.id
                    break
            
            # Use the first male voice found or default to the first voice
            if male_voice:
                self.engine.setProperty('voice', male_voice)
            elif voices:
                self.engine.setProperty('voice', voices[0].id)
            
        # Set speech rate and volume for better quality
        self.engine.setProperty('rate', 150)    # Speed of speech
        self.engine.setProperty('volume', 0.9)  # Volume (0.0 to 1.0)
        
        # Signal that the engine is ready
        self.engine_ready.set()

    async def convert(self, text):
        """Convert text to speech using a male voice and return base64 encoded audio data"""
        # Make sure the engine is ready
        if not self.engine_ready.is_set():
            await asyncio.sleep(0.5)
            if not self.engine_ready.is_set():
                # If still not ready after timeout, wait for it
                self.engine_ready.wait()
        
        # Create a temporary file to store the audio
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_file:
            temp_path = temp_file.name
        
        # Use the TTS engine to generate audio
        def generate_audio():
            self.engine.save_to_file(text, temp_path)
            self.engine.runAndWait()
        
        # Run in a separate thread to avoid blocking
        await asyncio.get_event_loop().run_in_executor(None, generate_audio)
        
        # Read the generated audio file
        with open(temp_path, 'rb') as audio_file:
            audio_data = audio_file.read()
        
        # Clean up the temporary file
        try:
            os.unlink(temp_path)
        except:
            pass
        
        # Convert to base64 for easier transmission
        base64_audio = base64.b64encode(audio_data).decode('utf-8')
        return base64_audio