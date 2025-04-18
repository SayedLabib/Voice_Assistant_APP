import asyncio
import os
from dotenv import load_dotenv
from googletrans import Translator

# Load environment variables
load_dotenv()
STT_TIMEOUT = int(os.getenv("STT_TIMEOUT", 7))

class STTService:
    def __init__(self):
        self.translator = Translator()
        self.is_listening = False
        self.timeout = STT_TIMEOUT
        
        # Dictionary for language code mapping
        self.language_map = {
            # Standard language codes
            'en': 'en',
            'de': 'de',
            'bn': 'bn',  # Bengali
            'hi': 'hi',  # Hindi
            'ur': 'ur',  # Urdu
            'ar': 'ar',  # Arabic
            'es': 'es',  # Spanish
            'fr': 'fr',  # French
            'ru': 'ru',  # Russian
            'zh': 'zh-cn',  # Chinese
            'ja': 'ja',  # Japanese
            
            # Region-specific codes that might come from browser
            'en-us': 'en',
            'en-gb': 'en',
            'bn-bd': 'bn',
            'hi-in': 'hi',
            'ur-pk': 'ur',
            # Add more mappings as needed
        }

    async def recognize(self, text, source_lang="auto"):
        """
        Translate text to German if it's not already in German
        """
        # If already German, return as is
        if source_lang.lower() in ["de", "de-de"]:
            return text
        
        # Map language code to format expected by googletrans
        source_lang = source_lang.lower()
        if source_lang != "auto" and source_lang in self.language_map:
            source_lang = self.language_map[source_lang]
        
        try:
            # Let the translator auto-detect language if source is 'auto'
            if source_lang == "auto":
                # Detect the language
                try:
                    detected = await asyncio.to_thread(
                        self.translator.detect, text
                    )
                    source_lang = detected.lang
                except Exception:
                    # Continue with auto if detection fails
                    pass
                    
            # Translate to German
            translation = await asyncio.to_thread(
                self.translator.translate,
                text, dest='de', src=source_lang if source_lang != "auto" else None
            )
            
            return translation.text
            
        except Exception as e:
            return f"Übersetzungsfehler: {str(e)}"

    async def start_recognition(self):
        """Start continuous voice recognition"""
        self.is_listening = True
        return {"status": "gestartet"}

    async def stop_recognition(self):
        """Stop continuous voice recognition"""
        self.is_listening = False
        return {"status": "gestoppt"}