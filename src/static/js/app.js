document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const micButton = document.getElementById('mic-button');
    const pulseRing = document.querySelector('.pulse-ring');
    const statusText = document.getElementById('status-text');
    const originalTextElement = document.getElementById('original-text'); // Updated element ID
    const translatedTextElement = document.getElementById('translated-text'); // Updated element ID
    const languageSelectorContainer = document.querySelector('.language-selector-container');

    // State variables
    let isListening = false;
    let autoRestart = true;
    let processingAudio = false;
    
    // Choose whether to use Whisper API (better quality) or Web Speech API (faster)
    const useWhisper = true; // Set to false to use Web Speech API instead
    
    // Audio recording variables for Whisper
    let mediaRecorder = null;
    let audioChunks = [];
    
    // Language selection
    // Define languages we explicitly want to support
    const supportedLanguages = [
        { code: 'en-US', name: 'English', shortCode: 'en' },
        { code: 'de-DE', name: 'Deutsch', shortCode: 'de' },
        { code: 'bn-BD', name: 'বাংলা', shortCode: 'bn' },
        { code: 'hi-IN', name: 'हिन्दी', shortCode: 'hi' },
        { code: 'ur-PK', name: 'اردو', shortCode: 'ur' },
        { code: 'ar-SA', name: 'العربية', shortCode: 'ar' },
        { code: 'es-ES', name: 'Español', shortCode: 'es' },
        { code: 'fr-FR', name: 'Français', shortCode: 'fr' },
        { code: 'ru-RU', name: 'Русский', shortCode: 'ru' },
        { code: 'zh-CN', name: '中文', shortCode: 'zh' },
        { code: 'ja-JP', name: '日本語', shortCode: 'ja' }
    ];
    
    // Get saved preference on startup or default to 0 (English)
    let currentLanguageIndex = parseInt(localStorage.getItem('preferredLanguageIndex') || '0');
    
    // Setup language selector
    createLanguageSelector();
    
    // WebSocket setup
    let socket = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000; // 3 seconds
    
    // Initialize WebSocket connection
    function initializeWebSocket() {
        // Clean up previous socket if it exists
        if (socket) {
            socket.close();
        }
        
        // Get the current host and construct the WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws`;
        
        socket = new WebSocket(wsUrl);
        
        socket.onopen = (event) => {
            console.log('WebSocket connection established');
            statusText.textContent = 'Verbunden. Klicken Sie auf das Mikrofon, um zu sprechen...';
            reconnectAttempts = 0;
            micButton.disabled = false;
        };
        
        socket.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Message from server:', data);
                
                if (data.type === 'processed_speech') {
                    // Get the detected language from the backend response
                    // If not provided, fallback to the selected language
                    const detectedLangCode = data.detected_language || supportedLanguages[currentLanguageIndex].shortCode;
                    console.log(`Detected language: ${detectedLangCode}`);
                    
                    // Display the original text with the detected language's font
                    originalTextElement.className = `text-display original-text lang-${detectedLangCode}`;
                    originalTextElement.textContent = data.original_text;
                    
                    // Display the translated German text
                    translatedTextElement.className = 'text-display translated-text lang-de';
                    translatedTextElement.textContent = data.translated_text;
                    
                    // Update the status to show detected language
                    const detectedLangName = supportedLanguages.find(lang => lang.shortCode === detectedLangCode)?.name || detectedLangCode;
                    showTemporaryMessage(`Detected: ${detectedLangName}`, "info");
                    
                    // Play the audio
                    await playAudio(data.audio_data);
                    
                    // After audio playback, restart listening if enabled
                    if (isListening && autoRestart) {
                        statusText.textContent = 'Zuhören... Sprechen Sie bitte.';
                        if (useWhisper) {
                            processingAudio = false;
                            startWhisperRecording();
                        } else if (recognition) {
                            processingAudio = false;
                            recognition.start();
                        }
                    }
                } else if (data.type === 'audio') {
                    // Play the audio
                    if (data.text) {
                        translatedTextElement.textContent = data.text;
                    }
                    await playAudio(data.audio_data);
                } else if (data.type === 'error') {
                    // Show error message
                    showTemporaryMessage(`Fehler: ${data.message}`, "error");
                    processingAudio = false;
                }
            } catch (error) {
                console.error('Error processing message:', error);
                processingAudio = false;
            }
        };
        
        socket.onclose = (event) => {
            console.log('WebSocket connection closed');
            
            // Attempt to reconnect unless max attempts reached
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                showTemporaryMessage(`Verbindung verloren. Wiederverbindung wird versucht (${reconnectAttempts}/${maxReconnectAttempts})...`, "error");
                micButton.disabled = true;
                
                setTimeout(() => {
                    initializeWebSocket();
                }, reconnectDelay);
            } else {
                statusText.textContent = 'Verbindung konnte nicht hergestellt werden. Bitte laden Sie die Seite neu.';
                micButton.disabled = true;
            }
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            showTemporaryMessage('Verbindungsfehler aufgetreten.', "error");
        };
    }
    
    // Initialize the WebSocket connection when the page loads
    initializeWebSocket();
    
    // Web Speech API setup (fallback for when not using Whisper)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        
        // Configure recognition
        recognition.continuous = false; // Get a single result
        recognition.interimResults = false; // Only final results
        
        // Set the initial language
        recognition.lang = supportedLanguages[currentLanguageIndex].code;
        
        // Handle speech recognition results
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            const confidence = event.results[0][0].confidence;
            
            console.log(`Speech recognized (${recognition.lang}): ${transcript} (Confidence: ${confidence})`);
            
            // If confidence is too low, it might be the wrong language
            if (confidence < 0.5 && currentLanguageIndex < supportedLanguages.length - 1) {
                // Try next language
                currentLanguageIndex++;
                recognition.lang = supportedLanguages[currentLanguageIndex].code;
                showTemporaryMessage(`Versuche ${supportedLanguages[currentLanguageIndex].name}...`, "processing");
                
                if (isListening && !processingAudio) {
                    setTimeout(() => recognition.start(), 300);
                }
                return;
            }
            
            // Show the recognized text temporarily
            showTemporaryMessage(`Erkannt (${supportedLanguages[currentLanguageIndex].name}): "${transcript}"`, "processing");
            
            // Reset language index for next recognition
            currentLanguageIndex = 0;
            recognition.lang = supportedLanguages[currentLanguageIndex].code;
            
            // Process the speech using WebSocket
            processSpeechWithWebSocket(transcript, recognition.lang);
        };
        
        // Handle speech recognition errors
        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error, 'in language', recognition.lang);
            
            if (event.error === 'no-speech') {
                // If no speech was detected for the current language, try another language
                if (currentLanguageIndex < supportedLanguages.length - 1) {
                    currentLanguageIndex++;
                    recognition.lang = supportedLanguages[currentLanguageIndex].code;
                    console.log(`Trying next language: ${recognition.lang}`);
                    
                    if (isListening && autoRestart && !processingAudio) {
                        setTimeout(() => recognition.start(), 300);
                    }
                } else {
                    // We've tried all languages, reset and show message
                    currentLanguageIndex = 0;
                    recognition.lang = supportedLanguages[currentLanguageIndex].code;
                    showTemporaryMessage("Keine Sprache erkannt. Bitte sprechen Sie.", "error");
                    
                    if (isListening && autoRestart && !processingAudio) {
                        setTimeout(() => recognition.start(), 300);
                    }
                }
            } else if (event.error === 'language-not-supported') {
                // If the language is not supported, try the next one
                if (currentLanguageIndex < supportedLanguages.length - 1) {
                    currentLanguageIndex++;
                    recognition.lang = supportedLanguages[currentLanguageIndex].code;
                    console.log(`Language not supported, trying: ${recognition.lang}`);
                    
                    if (isListening && autoRestart && !processingAudio) {
                        setTimeout(() => recognition.start(), 300);
                    }
                }
            } else {
                // For other errors
                statusText.textContent = `Fehler: ${event.error}`;
                if (isListening && autoRestart && !processingAudio) {
                    setTimeout(() => recognition.start(), 1000);
                }
            }
        };
        
        // Handle end of speech recognition
        recognition.onend = () => {
            console.log('Speech recognition ended');
            
            // If we're still in listening mode and not processing audio, restart
            if (isListening && autoRestart && !processingAudio) {
                setTimeout(() => recognition.start(), 300);
            }
        };
    } else {
        console.error('Speech Recognition API not supported in this browser');
        statusText.textContent = 'Spracherkennung wird in diesem Browser nicht unterstützt.';
        if (micButton) {
            micButton.disabled = true;
        }
    }
    
    // Function to start recording audio for Whisper API
    async function startWhisperRecording() {
        if (processingAudio) return;
        
        try {
            // Reset audio chunks
            audioChunks = [];
            
            // Get microphone access if needed
            if (!mediaRecorder) {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 16000
                    } 
                });
                
                // Create media recorder with optimized settings for Whisper
                const options = {
                    mimeType: 'audio/webm',
                    audioBitsPerSecond: 128000
                };
                
                mediaRecorder = new MediaRecorder(stream, options);
                
                // Handle data available event
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };
                
                // Handle recording stop event
                mediaRecorder.onstop = async () => {
                    if (!isListening || audioChunks.length === 0) return;
                    
                    processingAudio = true;
                    showTemporaryMessage(`Processing audio in ${supportedLanguages[currentLanguageIndex].name}...`, "processing");
                    
                    try {
                        // Convert chunks to blob
                        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                        
                        // Convert blob to base64
                        const base64Audio = await blobToBase64(audioBlob);
                        
                        // Send to server for processing with the current language
                        if (socket && socket.readyState === WebSocket.OPEN) {
                            // Get the current language code without region
                            const languageCode = supportedLanguages[currentLanguageIndex].shortCode;
                            console.log(`Sending audio for processing in language: ${supportedLanguages[currentLanguageIndex].name} (${languageCode})`);
                            
                            socket.send(JSON.stringify({
                                action: 'process_audio',
                                audio_data: base64Audio,
                                language: languageCode
                            }));
                        } else {
                            showTemporaryMessage("No connection to server.", "error");
                            processingAudio = false;
                        }
                    } catch (error) {
                        console.error("Error processing recording:", error);
                        showTemporaryMessage(`Fehler bei der Verarbeitung: ${error.message}`, "error");
                        processingAudio = false;
                        
                        // Restart recording if still listening
                        if (isListening && autoRestart) {
                            setTimeout(startWhisperRecording, 1000);
                        }
                    }
                };
            }
            
            // Set up recording duration with a more flexible approach
            const minRecordingDuration = 3000; // Minimum 3 seconds
            const maxRecordingDuration = 8000; // Maximum 8 seconds
            const defaultRecordingDuration = 6000; // Default 6 seconds
            
            // Get recording duration from user preference or use default
            const recordingDuration = localStorage.getItem('whisperRecordingDuration') || defaultRecordingDuration;
            
            // Start recording
            mediaRecorder.start();
            
            // Show recording indicator with countdown and language
            const currentLang = supportedLanguages[currentLanguageIndex].name;
            showTemporaryMessage(`Recording (${Math.round(recordingDuration/1000)}s)... [${currentLang}]`, "processing");
            
            // Stop recording after duration
            setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === "recording") {
                    mediaRecorder.stop();
                }
            }, recordingDuration);
            
        } catch (error) {
            console.error("Error accessing microphone:", error);
            showTemporaryMessage(`Mikrofonfehler: ${error.message}`, "error");
            
            // Fall back to Web Speech API if available
            if (!useWhisper && recognition && isListening) {
                recognition.start();
            }
        }
    }
    
    // Helper function to convert blob to base64
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Remove data URL prefix (data:audio/webm;base64,)
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    // Process speech with WebSocket
    function processSpeechWithWebSocket(text, sourceLanguage) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            showTemporaryMessage('Keine Verbindung zum Server.', "error");
            return;
        }
        
        processingAudio = true;
        
        // Extract language code without region
        const languageCode = sourceLanguage.split('-')[0];
        
        // Send to the server for translation and TTS
        socket.send(JSON.stringify({
            action: 'process_speech',
            text: text,
            language: languageCode
        }));
    }
    
    // Update the UI based on the listening state
    function updateUI(listening) {
        isListening = listening;
        
        if (listening) {
            micButton.classList.add('active');
            pulseRing.classList.add('active');
            statusText.textContent = 'Zuhören... Sprechen Sie bitte.';
            
            // Reset language index when starting fresh
            currentLanguageIndex = 0;
            if (!useWhisper && recognition) {
                recognition.lang = supportedLanguages[currentLanguageIndex].code;
            }
        } else {
            micButton.classList.remove('active');
            pulseRing.classList.remove('active');
            statusText.textContent = 'Klicken Sie auf das Mikrofon, um zu sprechen...';
        }
    }
    
    // Play audio data (base64 encoded)
    function playAudio(base64Audio) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
            
            audio.onplay = () => {
                statusText.textContent = 'Wiedergabe...';
                console.log('Audio playback started');
            };
            
            audio.onended = () => {
                console.log('Audio playback ended');
                resolve();
            };
            
            audio.onerror = (error) => {
                console.error('Audio playback error:', error);
                reject(error);
            };
            
            audio.play().catch(error => {
                console.error('Error playing audio:', error);
                showTemporaryMessage('Fehler beim Abspielen der Audio-Antwort.', "error");
                reject(error);
            });
        });
    }
    
    // Start speech recognition
    function startListening() {
        if (useWhisper) {
            // Using Whisper API
            startWhisperRecording();
        } else if (recognition) {
            // Using Web Speech API
            try {
                // Use the currently selected language
                recognition.lang = supportedLanguages[currentLanguageIndex].code;
                recognition.start();
            } catch (error) {
                console.error('Error starting speech recognition:', error);
                statusText.textContent = `Fehler: ${error.message}`;
                return;
            }
        } else {
            statusText.textContent = 'Spracherkennung wird nicht unterstützt.';
            return;
        }
        
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            showTemporaryMessage('Keine Verbindung zum Server.', "error");
            return;
        }
        
        autoRestart = true;
        processingAudio = false;
        
        // Do NOT reset the language index here - keep the user's selection
        if (!useWhisper && recognition) {
            recognition.lang = supportedLanguages[currentLanguageIndex].code;
        }
        
        updateUI(true);
        
        // Clear previous recognized text
        originalTextElement.textContent = '';
        translatedTextElement.textContent = '';
        
        // Show selected language under mic
        statusText.textContent = `Listening in ${supportedLanguages[currentLanguageIndex].name}...`;
    }
    
    // Stop speech recognition
    function stopListening() {
        autoRestart = false;
        processingAudio = false;
        
        if (useWhisper) {
            // Stop whisper recording
            if (mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
            }
        } else if (recognition) {
            // Stop Web Speech API
            try {
                recognition.stop();
            } catch (error) {
                console.error('Error stopping speech recognition:', error);
            }
        }
        
        updateUI(false);
    }
    
    // Show a temporary message that reverts back after a delay
    function showTemporaryMessage(message, type = "info") {
        const originalText = statusText.textContent;
        const originalClass = statusText.className;
        
        // Add class based on message type
        statusText.className = `status-text ${type}`;
        statusText.textContent = message;
        
        // Revert back after 3 seconds if not in an error state
        if (type !== "error") {
            setTimeout(() => {
                if (isListening) {
                    statusText.textContent = 'Zuhören... Sprechen Sie bitte.';
                } else {
                    statusText.textContent = originalText;
                }
                statusText.className = originalClass;
            }, 3000);
        }
    }
    
    // Add language selector functionality
    function createLanguageSelector() {
        if (!languageSelectorContainer) return;
        
        // Create language selector element
        const selectorHTML = `
            <div class="language-selector">
                <p>Select your language:</p>
                <div class="language-buttons"></div>
                <p id="selected-language-display">Current: ${supportedLanguages[currentLanguageIndex].name}</p>
            </div>
        `;
        
        languageSelectorContainer.innerHTML = selectorHTML;
        
        // Create buttons for each language
        const buttonsContainer = document.querySelector('.language-buttons');
        supportedLanguages.forEach((lang, index) => {
            const button = document.createElement('button');
            button.className = 'language-button ' + (index === currentLanguageIndex ? 'active' : '');
            button.dataset.index = index;
            button.title = lang.name;
            button.textContent = lang.name;
            
            button.addEventListener('click', function() {
                // Update active language
                currentLanguageIndex = parseInt(this.dataset.index);
                
                // Update UI
                document.querySelectorAll('.language-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                this.classList.add('active');
                
                // Update display text
                const displayElement = document.getElementById('selected-language-display');
                if (displayElement) {
                    displayElement.textContent = `Current: ${supportedLanguages[currentLanguageIndex].name}`;
                }
                
                // Store preference
                localStorage.setItem('preferredLanguageIndex', currentLanguageIndex);
                
                // Show confirmation message
                showTemporaryMessage(`Language set to ${supportedLanguages[currentLanguageIndex].name}`, "info");
            });
            
            buttonsContainer.appendChild(button);
        });
    }
    
    // Start or stop listening when the mic button is clicked
    micButton.addEventListener('click', function() {
        if (micButton.disabled) {
            return;
        }
        
        if (!isListening) {
            startListening();
        } else {
            stopListening();
        }
    });
    
    // Handle page visibility changes to manage WebSocket connection
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            // Page is hidden, stop listening if active
            if (isListening) {
                stopListening();
            }
        }
    });
});