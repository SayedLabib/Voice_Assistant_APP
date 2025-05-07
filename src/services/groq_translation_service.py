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
        
        # Dictionary of Quranic address forms with their German translations
        self.quranic_addresses = {
            "يا أيها النبي": "O Prophet (Friede sei mit ihm)",
            "يا محمد": "O Muhammad (Friede sei mit ihm)",
            "يا أيها الناس": "O ihr Menschen",
            "يا أيها الذين آمنوا": "O ihr, die glauben",
            "يا عباد": "O Meine Diener",
            "يا عبادي": "O Meine Diener",
            "يا بني آدم": "O Kinder Adams",
            "يا أيها الرسول": "O Gesandter (Friede sei mit ihm)",
            "يا أيها المدثر": "O du Zugedeckter (Friede sei mit ihm)",
            "يا أيها المزمل": "O du Eingehüllter (Friede sei mit ihm)",
            "قل": "Sprich",
            "يا جبريل": "O Gabriel",
            "يا عيسى": "O Jesus (Friede sei mit ihm)",
            "يا موسى": "O Moses (Friede sei mit ihm)",
            "يا نوح": "O Noah (Friede sei mit ihm)",
            "يا إبراهيم": "O Abraham (Friede sei mit ihm)",
            "يا داوود": "O David (Friede sei mit ihm)",
            "يا سليمان": "O Solomon (Friede sei mit ihm)",
            "يا يحيى": "O Johannes (Friede sei mit ihm)",
            "يا زكريا": "O Zacharias (Friede sei mit ihm)"
        }
        
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
            
        # Additional heuristics for identifying Quranic text including various forms of address
        address_patterns = [
            "يا أيها النبي",  # O Prophet
            "يا محمد",        # O Muhammad
            "يا أيها الناس",  # O mankind/people
            "يا أيها الذين",  # O you who (believe)
            "يا عباد",        # O servants
            "يا بني آدم",     # O children of Adam
            "يا أيها الرسول", # O Messenger
            "يا جبريل",       # O Gabriel/Jibreel
            "قل",             # Say (command form often used by Allah to address the Prophet)
            "يا عيسى",        # O Jesus
            "يا موسى",        # O Moses
            "يا نوح",         # O Noah
            "يا إبراهيم"      # O Abraham
        ]
        
        for pattern in address_patterns:
            if pattern in text:
                return True
                
        if "قرآن" in text or "آيات" in text or "سورة" in text:
            return True
            
        return False
    
    def find_addresses_in_text(self, text):
        """Find all Quranic addresses in the given text and return a list of found addresses"""
        found_addresses = []
        
        for address in self.quranic_addresses.keys():
            if address in text:
                found_addresses.append((address, self.quranic_addresses[address]))
                
        return found_addresses
    
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
        
        # Find any specific addresses in the text
        found_addresses = self.find_addresses_in_text(text) if is_quranic and source_lang == "ar" else []
        
        # Create specific instructions about the addresses found
        address_instructions = ""
        if found_addresses:
            address_instructions = "\nThe text contains the following divine addresses that MUST be preserved exactly in the translation:\n"
            for arabic, german in found_addresses:
                address_instructions += f"- \"{arabic}\" must be translated as \"{german}\"\n"
        
        # Define the base system prompt
        system_prompt = """You are a skilled translator with expertise in linguistic nuances and cultural context. 
Follow these guidelines:
1. Provide a contextual, natural-sounding translation that captures the full meaning
2. Consider cultural nuances and implicit context when translating
3. Aim for a translation that sounds natural to native speakers
4. Preserve the original tone and intended message
5. Do NOT add any prefixes like "Translation:" or "Here's the translation:"
6. Return only the final translation text, nothing more"""

        # Add specialized instructions for Quranic text
        if is_quranic:
            system_prompt += f"""
7. IMPORTANT: This appears to be Quranic text or Islamic religious content. For this content:
   - Maintain ABSOLUTE FIDELITY to the original text's theological meaning
   - DO NOT add interpretations, explanations, or embellishments to Quranic content
   - Preserve the EXACT theological meaning without alteration
   - ALL divine addresses MUST be explicitly preserved (e.g., "O Prophet", "O Mankind")
   - NEVER omit any form of address in your translation - this is CRITICAL
   - The relationship between Allah (the speaker) and the addressee is sacred and MUST be maintained
   - Include appropriate honorifics such as "Friede sei mit ihm" for prophets
   - Imperatives like "قل" ("Say") are divine commands and must be preserved as "Sprich:" in German
   - Unlike regular text, Quranic verses must be translated with utmost precision{address_instructions}"""
        
        # Craft prompt for contextual translation
        if source_lang == "auto":
            user_prompt = f"""Translate the following text into {target_lang_name}, providing a contextual, natural-sounding translation:

{text}"""
        else:
            user_prompt = f"""Translate the following {source_lang_name} text into {target_lang_name}, providing a contextual, natural-sounding translation:

{text}"""

        try:
            # Prepare request payload
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.1,  # Lower temperature for more precise translations
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
                        
                        # Post-process to ensure addresses are preserved
                        if found_addresses and is_quranic:
                            for arabic, german in found_addresses:
                                # Check if the German translation contains the appropriate form of address
                                if german.split(' ')[0:2] not in translated_text and german.split(' ')[0] not in translated_text:
                                    # If not found, try to correct by prepending it
                                    # This is a fallback in case the model still omits the address
                                    translated_text = f"{german}: {translated_text}"
                            
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