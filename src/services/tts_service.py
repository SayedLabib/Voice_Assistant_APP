from gtts import gTTS
from io import BytesIO
import base64

class TTSService:
    def __init__(self, language='de'):
        self.language = language

    async def convert(self, text):
        """Convert text to speech and return base64 encoded audio data"""
        audio_bytes = BytesIO()
        tts = gTTS(text=text, lang=self.language, slow=False)
        tts.write_to_fp(audio_bytes)
        audio_bytes.seek(0)
        
        # Convert to base64 for easier transmission
        base64_audio = base64.b64encode(audio_bytes.read()).decode('utf-8')
        return base64_audio