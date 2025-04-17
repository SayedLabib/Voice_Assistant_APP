# Voice Assistant with Speech-to-Text and Text-to-Speech

A lightweight industry-focused voice assistant built with FastAPI that:
- Converts speech to German text (from any language)
- Reads the generated text back with text-to-speech

## Features

- Speech recognition with multilingual support (converts to German)
- Text-to-Speech for German language
- Responsive UI with an animated microphone button
- WebSocket-based continuous listening with 7-second inactivity timeout
- Modern, responsive design

## Requirements

- Python 3.8+
- Libraries listed in requirements.txt

## Installation

1. Clone this repository
2. Install the required dependencies:

```bash
pip install -r requirements.txt
```

## Usage

1. Navigate to the src directory:

```bash
cd src
```

2. Run the application:

```bash
uvicorn main:app --reload
```

3. Open your browser and go to http://localhost:8000

4. Click on the microphone button to start speaking. The application will:
   - Listen to your speech
   - Convert it to German text
   - Read the text back using text-to-speech

5. The listening will automatically stop after 7 seconds of silence, or you can click the microphone button again to stop manually.

## Configuration

You can customize the following parameters in the `.env` file:

```
TTS_LANGUAGE=de
STT_TIMEOUT=7
```

## Troubleshooting

If you encounter issues with audio recording:
- Ensure your microphone is properly connected and set as default
- Check that your browser allows microphone access
- If you encounter issues with sounddevice, make sure you have PortAudio installed on your system:
  - On Windows: pip install pipwin && pipwin install pyaudio (as an alternative)
  - On Mac: brew install portaudio
  - On Linux: sudo apt-get install libportaudio2

## Project Structure
```
voice-assistant-fastapi
├── src
│   ├── main.py                # Entry point of the FastAPI application
│   ├── api
│   │   ├── __init__.py        # API package initializer
│   │   └── routes.py          # API routes for voice assistant
│   ├── services
│   │   ├── __init__.py        # Services package initializer
│   │   ├── stt_service.py      # Speech-to-Text service implementation
│   │   └── tts_service.py      # Text-to-Speech service implementation
│   ├── static
│   │   ├── css
│   │   │   └── style.css       # CSS styles for the UI
│   │   └── js
│   │       └── app.js          # JavaScript for UI functionality
│   └── templates
│       └── index.html          # Main HTML template for the UI
├── requirements.txt            # Project dependencies
├── README.md                   # Project documentation
└── .env                        # Environment variables for configuration
```

## Contributing
Contributions are welcome! Please feel free to submit a pull request or open an issue for any suggestions or improvements.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.