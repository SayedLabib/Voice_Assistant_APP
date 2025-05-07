import os
import aiohttp
import json
import re
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

class GroqTranslationService:
    """
    Service for contextual translation using Groq's language models.
    This provides more natural and context-aware translations compared to
    word-by-word translation services.
    """
    
    def __init__(self):
        # API configuration
        self.api_key = GROQ_API_KEY
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"
        
        # Default to Llama 3 70B for best context-aware translations
        self.model = "llama3-70b-8192"
        
        # Store translation history for better context in ongoing conversations
        self.translation_history = {}
        
        # Language names for better prompting
        self.language_names = {
            "en": "English",
            "de": "German",
            "ar": "Arabic",
            "es": "Spanish",
            "fr": "French",
            "hi": "Hindi",
            "zh": "Chinese",
            "ja": "Japanese",
            "ru": "Russian"
        }
        
        # Define prefixes to remove from translation results
        self.prefixes_to_remove = [
            "Translation:", "Here's the translation:", "Translated text:",
            "Here is the translation:", "Arabic translation:", "English translation:",
            "German translation:", "The translation is:", "Please find the translation below:",
            "Übersetzung:", "Deutsche Übersetzung:", "Die Übersetzung lautet:", "Hier ist die Übersetzung:",
        ]
        
        # Regular expression to identify potential Quranic verses
        self.quran_patterns = [
            r'سورة\s+[\u0600-\u06FF]+',  # Surah mentions in Arabic
            r'بسم\s+الله\s+الرحمن\s+الرحيم',  # Bismillah
            r'قال\s+الله\s+تعالى',  # "Allah said" or similar phrases
            r'قوله\s+تعالى',  # "His saying" referring to Allah
            r'آية',  # Verse/Ayah
        ]
        
        # Combine patterns
        self.quran_regex = re.compile('|'.join(self.quran_patterns))
        
        if not self.api_key:
            print("WARNING: GROQ_API_KEY not found in environment variables. Translation service will not work correctly.")
    
    def clean_translation(self, translated_text):
        """Remove common prefixes and clean up the translation"""
        # Remove quotes if present
        if translated_text.startswith('"') and translated_text.endswith('"'):
            translated_text = translated_text[1:-1]
        
        # Remove any known prefixes
        for prefix in self.prefixes_to_remove:
            if translated_text.startswith(prefix):
                translated_text = translated_text[len(prefix):].lstrip()
        
        # Remove extra whitespace and clean up
        translated_text = translated_text.strip()
        
        return translated_text
    
    def is_likely_quranic(self, text, source_lang):
        """Check if the text is likely to be a Quranic verse"""
        if source_lang != "ar" and source_lang != "ar-sa":
            return False
            
        # Check against our patterns
        if self.quran_regex.search(text):
            return True
            
        # Additional heuristics for identifying Quranic text
        if "قرآن" in text or "آيات" in text or "سورة" in text:
            return True
            
        return False
    
    async def translate(self, text, source_lang="auto", target_lang="de", session_id=None):
        """
        Translate text with contextual understanding using Groq's LLM.
        
        Parameters:
        - text: The text to translate
        - source_lang: Source language code (or "auto" for auto-detection)
        - target_lang: Target language code
        - session_id: Optional session ID to maintain context across translations
        
        Returns:
        - Contextually translated text
        """
        if not text or text.strip() == "":
            return ""
            
        # Check if API key is configured
        if not self.api_key:
            return "Error: GROQ_API_KEY not configured. Please set it in the .env file."
            
        # If languages are the same, return original text
        if source_lang != "auto" and source_lang == target_lang:
            return text
        
        # Get language names for better prompting
        source_lang_name = self.language_names.get(source_lang, source_lang)
        target_lang_name = self.language_names.get(target_lang, target_lang)
        
        # Retrieve conversation history if available
        history = ""
        if session_id and session_id in self.translation_history:
            # Get last 3 exchanges for context
            recent_exchanges = self.translation_history[session_id][-3:]
            if recent_exchanges:
                history = "Previous exchanges to provide context:\n"
                for ex in recent_exchanges:
                    history += f"Original: {ex['original']}\nTranslation: {ex['translation']}\n\n"
        
        # Check if this might be Quranic text
        is_quranic = self.is_likely_quranic(text, source_lang)
        
        # Define the base system prompt
        system_prompt = """You are a precise translator with expertise in linguistic nuances and cultural context. 
Follow these strict guidelines:
1. Translate directly without adding ANYTHING extra - no explanations, comments, or embellishments
2. Preserve the original meaning, tone, and cultural context precisely
3. Provide ONLY the translation, nothing else
4. Do NOT add any prefixes like "Translation:" or "Here's the translation:"
5. Maintain religious and cultural terminology appropriately
6. Return only the final translation text, nothing more"""

        # Add specialized instructions for Quranic text
        if is_quranic:
            system_prompt += """
7. This appears to be Quranic text or Islamic religious content. When translating:
   - Preserve the proper Islamic theological meaning
   - Use established translations of religious terminology
   - Maintain the reverence and spiritual significance
   - Focus on accuracy rather than literary style for sacred text"""
        
        # Craft prompt for contextual translation
        if source_lang == "auto":
            user_prompt = f"""Translate the following text into {target_lang_name}:

{text}"""
        else:
            user_prompt = f"""Translate the following {source_lang_name} text into {target_lang_name}:

{text}"""

        try:
            # Prepare request payload
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.2,
                "max_tokens": 1024
            }
            
            # Set up headers
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            # Make API call using aiohttp for async operation
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_url, 
                    headers=headers, 
                    json=payload,
                    timeout=30
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        translated_text = result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
                        
                        # Clean up the response
                        translated_text = self.clean_translation(translated_text)
                            
                        # Store in history if session_id provided
                        if session_id:
                            if session_id not in self.translation_history:
                                self.translation_history[session_id] = []
                            
                            self.translation_history[session_id].append({
                                "original": text,
                                "translation": translated_text
                            })
                            
                            # Limit history size
                            if len(self.translation_history[session_id]) > 10:
                                self.translation_history[session_id].pop(0)
                        
                        return translated_text
                    else:
                        error_text = await response.text()
                        error_details = "Unknown error"
                        try:
                            error_json = json.loads(error_text)
                            error_details = error_json.get('error', {}).get('message', error_text[:100])
                        except:
                            error_details = error_text[:100]
                        
                        return f"Translation error: {response.status} - {error_details}"
                        
        except Exception as e:
            return f"Translation error: {str(e)}"