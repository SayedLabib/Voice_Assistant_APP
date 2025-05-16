# Voice Assistant with Speech-to-Text and Text-to-Speech

A lightweight industry-focused voice assistant built with FastAPI that:
- Converts speech to German text (from any language)
- Uses contextual translation with Groq AI for more natural translations
- Reads the generated text back with text-to-speech

## Features

- Speech recognition with multilingual support (converts to German)
- Contextual translation using Groq's Llama 3 70B model
- Special handling for cultural and religious content (including Quranic text)
- Text-to-Speech for German language
- Responsive UI with an animated microphone button
- WebSocket-based continuous listening with 7-second inactivity timeout
- Modern, responsive design

## Requirements

- Python 3.8+
- Libraries listed in requirements.txt
- Groq API key (for contextual translation)

## Quick Start with Docker

1. **Build and run with Docker Compose:**

```bash
docker-compose up --build
```

2. The app will be available at [http://localhost:8000](http://localhost:8000)

3. Make sure to create a `.env` file in the root directory with the following variables:

```
TTS_LANGUAGE=de
STT_TIMEOUT=7
GROQ_API_KEY=your_groq_api_key
USE_GROQ=true
USE_WHISPER=true
```

## Manual Installation (without Docker)

1. Clone this repository
2. Install the required dependencies:

```bash
pip install -r requirements.txt
```

3. Create a `.env` file in the root directory as shown above.

4. Run the application from the root directory:

```bash
uvicorn main:app --reload
```

5. Open your browser and go to [http://localhost:8000](http://localhost:8000)

## Usage

- Click on the microphone button to start speaking. The application will:
  - Listen to your speech
  - Convert it to text in the original language
  - Translate it to German using contextual understanding (not just word-for-word)
  - Read the German text back using text-to-speech
- The listening will automatically stop after 7 seconds of silence, or you can click the microphone button again to stop manually.

## Contextual Translation

This app uses Groq's Llama 3 70B model to provide contextual translations that:
- Understand the full meaning of your speech, not just individual words
- Maintain cultural nuances and contextual information
- Properly handle specialized content like religious text (including Quranic verses)
- Produce more natural-sounding translations

## Configuration

You can customize the following parameters in the `.env` file:

```
TTS_LANGUAGE=de
STT_TIMEOUT=7
GROQ_API_KEY=your_groq_api_key
USE_GROQ=true  # Set to false to use basic translation instead
USE_WHISPER=true  # For OpenAI Whisper-based transcription
```

## Troubleshooting

If you encounter issues with audio recording:
- Ensure your microphone is properly connected and set as default
- Check that your browser allows microphone access
- If you encounter issues with sounddevice, make sure you have PortAudio installed on your system:
  - On Windows: pip install pipwin && pipwin install pyaudio (as an alternative)
  - On Mac: brew install portaudio
  - On Linux: sudo apt-get install libportaudio2

If you see errors related to Groq:
- Make sure your GROQ_API_KEY is correctly set in the .env file
- Check that you have the latest version of the groq library installed

## Project Structure
```
voice-assistant-fastapi
├── main.py                # Entry point of the FastAPI application
├── src
│   ├── api
│   │   ├── __init__.py    # API package initializer
│   │   └── routes.py      # API routes for voice assistant
│   ├── services
│   │   ├── __init__.py    # Services package initializer
│   │   ├── stt_service.py      # Speech-to-Text service implementation
│   │   ├── tts_service.py      # Text-to-Speech service implementation
│   │   ├── groq_translation_service.py  # Contextual translation with Groq
│   │   └── whisper_stt_service.py       # Whisper API integration
│   ├── static
│   │   ├── css
│   │   │   └── style.css       # CSS styles for the UI
│   │   └── js
│   │       └── app.js          # JavaScript for UI functionality
│   └── templates
│       └── index.html          # Main HTML template for the UI
├── requirements.txt            # Project dependencies
├── Dockerfile                  # Docker build instructions
├── docker-compose.yml          # Docker Compose configuration
├── README.md                   # Project documentation
└── .env                        # Environment variables for configuration
```

## Contributing
Contributions are welcome! Please feel free to submit a pull request or open an issue for any suggestions or improvements.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.