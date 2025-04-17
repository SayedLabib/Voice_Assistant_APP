document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const micButton = document.getElementById('mic-button');
    const pulseRing = document.querySelector('.pulse-ring');
    const statusText = document.getElementById('status-text');
    const recognizedTextElement = document.getElementById('recognized-text');

    // State variables
    let isListening = false;
    let autoRestart = true;
    let processingAudio = false;
    
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
                    // Display the translated text
                    recognizedTextElement.textContent = data.translated_text;
                    
                    // Play the audio
                    await playAudio(data.audio_data);
                    
                    // After audio playback, restart listening if enabled
                    if (isListening && autoRestart) {
                        statusText.textContent = 'Zuhören... Sprechen Sie bitte.';
                        if (recognition) {
                            processingAudio = false;
                            recognition.start();
                        }
                    }
                } else if (data.type === 'audio') {
                    // Play the audio
                    if (data.text) {
                        recognizedTextElement.textContent = data.text;
                    }
                    await playAudio(data.audio_data);
                } else if (data.type === 'error') {
                    // Show error message
                    showTemporaryMessage(`Fehler: ${data.message}`, "error");
                }
            } catch (error) {
                console.error('Error processing message:', error);
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
    
    // Web Speech API setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        
        // Configure recognition
        recognition.continuous = false; // Get a single result
        recognition.interimResults = false; // Only final results
        recognition.lang = 'auto'; // Auto-detect language
        
        // Handle speech recognition results
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            const confidence = event.results[0][0].confidence;
            
            console.log(`Speech recognized: ${transcript} (Confidence: ${confidence})`);
            
            // Show the recognized text temporarily
            showTemporaryMessage(`Erkannt: "${transcript}"`, "processing");
            
            // Process the speech using WebSocket
            processSpeechWithWebSocket(transcript);
        };
        
        // Handle speech recognition errors
        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            
            if (event.error === 'no-speech') {
                showTemporaryMessage("Keine Sprache erkannt. Bitte sprechen Sie.", "error");
                // Restart recognition if we're still in listening mode
                if (isListening && autoRestart && !processingAudio) {
                    setTimeout(() => recognition.start(), 300);
                }
            } else {
                statusText.textContent = `Fehler: ${event.error}`;
                updateUI(false);
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
    
    // Process speech with WebSocket
    function processSpeechWithWebSocket(text) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            showTemporaryMessage('Keine Verbindung zum Server.', "error");
            return;
        }
        
        processingAudio = true;
        
        // Send to the server for translation and TTS
        socket.send(JSON.stringify({
            action: 'process_speech',
            text: text,
            language: 'auto'
        }));
    }
    
    // Update the UI based on the listening state
    function updateUI(listening) {
        isListening = listening;
        
        if (listening) {
            micButton.classList.add('active');
            pulseRing.classList.add('active');
            statusText.textContent = 'Zuhören... Sprechen Sie bitte.';
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
        if (!recognition) {
            statusText.textContent = 'Spracherkennung wird nicht unterstützt.';
            return;
        }
        
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            showTemporaryMessage('Keine Verbindung zum Server.', "error");
            return;
        }
        
        try {
            autoRestart = true;
            processingAudio = false;
            recognition.start();
            updateUI(true);
            
            // Clear previous recognized text
            recognizedTextElement.textContent = '';
        } catch (error) {
            console.error('Error starting speech recognition:', error);
            statusText.textContent = `Fehler: ${error.message}`;
        }
    }
    
    // Stop speech recognition
    function stopListening() {
        if (!recognition) {
            return;
        }
        
        try {
            autoRestart = false;
            processingAudio = false;
            recognition.stop();
            updateUI(false);
        } catch (error) {
            console.error('Error stopping speech recognition:', error);
        }
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