import pyttsx3
from io import BytesIO
import base64
import os
import tempfile
import os
import tempfile

class TTSService:
    def __init__(self, language='de'):
        self.language = language
        
        # Options for male voice variants
        self.male_tld_options = {
            'en': 'co.uk',  # British male voice tends to sound deeper
            'de': 'de',     # German
            'fr': 'fr',     # French
            'es': 'es',     # Spanish
            'it': 'it',     # Italian
            'ja': 'jp',     # Japanese
            'ko': 'kr',     # Korean
            'nl': 'nl',     # Dutch
            'pt': 'pt',     # Portuguese
            'ru': 'ru',     # Russian
            'zh': 'cn',     # Chinese
        }
        
        # Get appropriate TLD for language or default to com
        self.tld = self.male_tld_options.get(language, 'com')
    
    async def convert(self, text):
        """Convert text to speech and return base64 encoded audio data.
        Uses specific TLD parameters to prefer deeper/male-sounding voices."""
        audio_bytes = BytesIO()
        
        # Create a gTTS instance with the appropriate TLD for deeper voice
        tts = gTTS(text=text, lang=self.language, tld=self.tld, slow=False)
        
        # Write to memory buffer
        tts.write_to_fp(audio_bytes)
        audio_bytes.seek(0)
        
        # Convert to base64 for easier transmission
        base64_audio = base64.b64encode(audio_bytes.read()).decode('utf-8')
        return base64_audio