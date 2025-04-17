import asyncio
import os
import json
import traceback
from dotenv import load_dotenv
from translate import Translator

# Load environment variables
load_dotenv()
STT_TIMEOUT = int(os.getenv("STT_TIMEOUT", 7))

class STTService:
    def __init__(self):
        self.translator = Translator(to_lang="de")
        self.is_listening = False
        self.timeout = STT_TIMEOUT

    async def recognize(self, text, source_lang="auto"):
        """
        Translate text to German if it's not already in German
        """
        try:
            if source_lang == "de":
                return text
            
            # Translate to German using the translate library
            translated_text = self.translator.translate(text)
            return translated_text
        except Exception as e:
            traceback.print_exc()
            return f"Übersetzungsfehler: {str(e)}"

    async def start_recognition(self):
        """Start continuous voice recognition"""
        self.is_listening = True
        return {"status": "gestartet"}

    async def stop_recognition(self):
        """Stop continuous voice recognition"""
        self.is_listening = False
        return {"status": "gestoppt"}