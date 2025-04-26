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
            'ar-sa': 'ar',
            'es-es': 'es',
            'fr-fr': 'fr',
            'de-de': 'de',
            'ru-ru': 'ru',
            'zh-cn': 'zh-cn',
            'ja-jp': 'ja',
            # Add more mappings as needed
        }

    async def recognize(self, text, source_lang="auto", target_lang="en"):
        """
        Translate text from source language to target language
        
        Parameters:
        - text: The text to translate
        - source_lang: Source language code (or "auto" for auto-detection)
        - target_lang: Target language code
        
        Returns:
        - Translated text
        """
        # If source and target languages are the same, return the original text
        if source_lang != "auto":
            source_lang_normalized = source_lang.lower().split('-')[0]
            target_lang_normalized = target_lang.lower().split('-')[0]
            if source_lang_normalized == target_lang_normalized:
                return text
        
        # Map language codes to format expected by googletrans
        source_lang = source_lang.lower()
        target_lang = target_lang.lower()
        
        if source_lang != "auto" and source_lang in self.language_map:
            source_lang = self.language_map[source_lang]
            
        if target_lang in self.language_map:
            target_lang = self.language_map[target_lang]
        
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
                    
            # Translate to target language
            translation = await asyncio.to_thread(
                self.translator.translate,
                text, dest=target_lang, src=source_lang if source_lang != "auto" else None
            )
            
            return translation.text
            
        except Exception as e:
            return f"Translation error: {str(e)}"

    async def start_recognition(self):
        """Start continuous voice recognition"""
        self.is_listening = True
        return {"status": "started"}

    async def stop_recognition(self):
        """Stop continuous voice recognition"""
        self.is_listening = False
        return {"status": "stopped"}