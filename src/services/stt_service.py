import asyncio
import os
import traceback
from dotenv import load_dotenv
from googletrans import Translator, LANGUAGES

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
        try:
            # Convert to lowercase for consistent matching
            source_lang = source_lang.lower()
            
            # If already German, return as is
            if source_lang == "de" or source_lang == "de-de":
                return text
            
            # Map language code to format expected by googletrans
            if source_lang != "auto" and source_lang in self.language_map:
                source_lang = self.language_map[source_lang]
            
            # For debugging purposes
            print(f"Translating text from {source_lang} to German: {text[:30]}...")
            
            # Let the translator auto-detect language if source is 'auto'
            if source_lang == "auto":
                # First detect the language
                try:
                    detected = await asyncio.to_thread(
                        self.translator.detect, text
                    )
                    print(f"Detected language: {detected.lang} (confidence: {detected.confidence})")
                    source_lang = detected.lang
                except Exception as e:
                    print(f"Language detection error: {str(e)}")
                    # Continue with auto if detection fails
                    
            # Translate to German
            translation = await asyncio.to_thread(
                self.translator.translate,
                text, dest='de', src=source_lang if source_lang != "auto" else None
            )
            
            print(f"Translation complete: {translation.text[:30]}...")
            return translation.text
            
        except Exception as e:
            traceback.print_exc()
            print(f"Translation error: {str(e)}")
            return f"Übersetzungsfehler: {str(e)}"

    async def start_recognition(self):
        """Start continuous voice recognition"""
        self.is_listening = True
        return {"status": "gestartet"}

    async def stop_recognition(self):
        """Stop continuous voice recognition"""
        self.is_listening = False
        return {"status": "gestoppt"}