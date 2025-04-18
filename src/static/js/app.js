document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const micButton = document.getElementById('mic-button');
    const pulseRing = document.querySelector('.pulse-ring');
    const statusText = document.getElementById('status-text');
    const originalTextElement = document.getElementById('original-text');
    const translatedTextElement = document.getElementById('translated-text');
    const languageSelectorContainer = document.querySelector('.language-selector-container');

    // Configuration
    const config = {
        audio: {
            silenceThreshold: -40,          // dB threshold for silence detection
            speechConsistencyThreshold: 3,  // Consecutive frames to confirm speech
            maxRecordingTime: 15000,        // Maximum recording duration (15s)
            silenceStopDuration: 3000,      // Stop after 3s silence
            initialTimeout: 3000,           // Initial voice detection timeout (3s)
            sampleRate: 16000,              // Sample rate for speech recognition
        },
        websocket: {
            maxReconnectAttempts: 5,
            reconnectDelay: 3000,
        }
    };

    // State management
    const state = {
        isListening: false,
        processingAudio: false,
        voiceDetected: false,
        audioChunks: [],
        reconnectAttempts: 0,
        currentLanguageIndex: parseInt(localStorage.getItem('preferredLanguageIndex') || '0'),
    };

    // Resources
    let mediaRecorder = null;
    let audioContext = null;
    let analyser = null;
    let silenceTimer = null;
    let initialVoiceDetectionTimeout = null;
    let socket = null;

    // Language selection
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

    // Initialize the app
    createLanguageSelector();
    initializeWebSocket();

    // ==================== WEBSOCKET HANDLING ====================

    function initializeWebSocket() {
        // Clean up existing socket
        if (socket) socket.close();
        
        // Create new connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws`;
        socket = new WebSocket(wsUrl);
        
        // Setup event handlers
        socket.onopen = handleSocketOpen;
        socket.onmessage = handleSocketMessage;
        socket.onclose = handleSocketClose;
        socket.onerror = handleSocketError;
    }

    function handleSocketOpen() {
        statusText.textContent = 'Verbunden. Klicken Sie auf das Mikrofon, um zu sprechen...';
        state.reconnectAttempts = 0;
        micButton.disabled = false;
    }

    async function handleSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'processed_speech') {
                await handleProcessedSpeech(data);
            } else if (data.type === 'audio') {
                if (data.text) translatedTextElement.textContent = data.text;
                await playAudio(data.audio_data);
            } else if (data.type === 'error') {
                showTemporaryMessage(`Fehler: ${data.message}`, "error");
                state.processingAudio = false;
            }
        } catch (error) {
            console.error('Error processing message:', error);
            state.processingAudio = false;
        }
    }

    async function handleProcessedSpeech(data) {
        // Get detected language
        const detectedLangCode = data.detected_language || supportedLanguages[state.currentLanguageIndex].shortCode;
        const detectedLangName = supportedLanguages.find(lang => lang.shortCode === detectedLangCode)?.name || detectedLangCode;
        
        // Update UI
        originalTextElement.className = `text-display original-text lang-${detectedLangCode}`;
        originalTextElement.textContent = data.original_text;
        
        translatedTextElement.className = 'text-display translated-text lang-de';
        translatedTextElement.textContent = data.translated_text;
        
        showTemporaryMessage(`Detected: ${detectedLangName}`, "info");
        
        // Play audio
        await playAudio(data.audio_data);
        
        // After playback finishes
        state.processingAudio = false;
        if (state.isListening) {
            statusText.textContent = 'Zuhören... Sprechen Sie bitte.';
            startRecording();
        }
    }

    function handleSocketClose(event) {
        if (state.reconnectAttempts < config.websocket.maxReconnectAttempts) {
            state.reconnectAttempts++;
            showTemporaryMessage(`Verbindung verloren. Wiederverbindung wird versucht (${state.reconnectAttempts}/${config.websocket.maxReconnectAttempts})...`, "error");
            micButton.disabled = true;
            
            setTimeout(initializeWebSocket, config.websocket.reconnectDelay);
        } else {
            statusText.textContent = 'Verbindung konnte nicht hergestellt werden. Bitte laden Sie die Seite neu.';
            micButton.disabled = true;
        }
    }

    function handleSocketError() {
        showTemporaryMessage('Verbindungsfehler aufgetreten.', "error");
    }

    // ==================== AUDIO RECORDING AND PROCESSING ====================

    async function startRecording() {
        if (state.processingAudio) return;
        
        try {
            // Reset state
            state.audioChunks = [];
            state.voiceDetected = false;
            cleanupAudioResources();
            
            // Initialize audio context if needed
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: config.audio.sampleRate
                });
            }
            
            // Set up audio processing pipeline
            await setupAudioPipeline();
            
            // Start recording
            mediaRecorder.start(1000);
            
            // Show recording indicator
            const currentLang = supportedLanguages[state.currentLanguageIndex].name;
            showTemporaryMessage(`Recording... [${currentLang}]`, "processing");
            
            // Start voice detection
            startVoiceDetection();
            
            // Set maximum recording duration
            setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === "recording") {
                    mediaRecorder.stop();
                }
            }, config.audio.maxRecordingTime);
            
            // Set initial voice detection timeout
            initialVoiceDetectionTimeout = setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === "recording" && !state.voiceDetected) {
                    showTemporaryMessage("No voice detected", "info");
                    stopListening();
                }
            }, config.audio.initialTimeout);
            
        } catch (error) {
            console.error("Error accessing microphone:", error);
            showTemporaryMessage(`Mikrofonfehler: ${error.message}`, "error");
        }
    }

    async function setupAudioPipeline() {
        // Get microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1
            } 
        });
        
        // Create audio nodes
        const micSource = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.7;
        
        // Create filters
        const highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = 'highpass';
        highPassFilter.frequency.value = 180;
        
        const lowPassFilter = audioContext.createBiquadFilter();
        lowPassFilter.type = 'lowpass';
        lowPassFilter.frequency.value = 5500;
        
        // Create destination
        const outputDestination = audioContext.createMediaStreamDestination();
        
        // Connect nodes
        micSource.connect(highPassFilter);
        highPassFilter.connect(lowPassFilter);
        lowPassFilter.connect(outputDestination);
        lowPassFilter.connect(analyser);
        
        // Create MediaRecorder
        const options = { mimeType: 'audio/webm', audioBitsPerSecond: 128000 };
        mediaRecorder = new MediaRecorder(outputDestination.stream, options);
        
        // Set up event handlers
        mediaRecorder.ondataavailable = handleDataAvailable;
        mediaRecorder.onstop = handleRecordingStop;
    }

    function handleDataAvailable(event) {
        if (event.data.size > 0) {
            state.audioChunks.push(event.data);
        }
    }

    async function handleRecordingStop() {
        if (!state.isListening || state.audioChunks.length === 0) return;
        
        // Stop voice detection
        cleanupAudioResources();
        
        // Skip processing if no voice detected
        if (!state.voiceDetected || state.audioChunks.length === 0) {
            return;
        }
        
        state.processingAudio = true;
        showTemporaryMessage(`Processing audio in ${supportedLanguages[state.currentLanguageIndex].name}...`, "processing");
        
        try {
            // Convert chunks to blob
            const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
            const base64Audio = await blobToBase64(audioBlob);
            
            // Send to server
            if (socket && socket.readyState === WebSocket.OPEN) {
                const languageCode = supportedLanguages[state.currentLanguageIndex].shortCode;
                socket.send(JSON.stringify({
                    action: 'process_audio',
                    audio_data: base64Audio,
                    language: languageCode
                }));
            } else {
                showTemporaryMessage("No connection to server.", "error");
                state.processingAudio = false;
            }
        } catch (error) {
            console.error("Error processing recording:", error);
            showTemporaryMessage(`Fehler bei der Verarbeitung: ${error.message}`, "error");
            state.processingAudio = false;
        }
    }

    // ==================== VOICE DETECTION ====================

    function startVoiceDetection() {
        if (!analyser) return;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let lastVoiceTime = Date.now();
        let silenceDuration = 0;
        let speechConsistencyCounter = 0;
        
        // Clean up existing timer
        if (silenceTimer) clearInterval(silenceTimer);
        
        // Create new timer
        silenceTimer = setInterval(() => {
            if (!state.isListening || !mediaRecorder || mediaRecorder.state !== "recording") {
                cleanupAudioResources();
                return;
            }
            
            // Get current audio data
            analyser.getByteFrequencyData(dataArray);
            
            // Check for speech
            const isVoice = isSpeech(dataArray);
            
            // Update speech consistency counter
            if (isVoice) {
                speechConsistencyCounter = Math.min(speechConsistencyCounter + 1, config.audio.speechConsistencyThreshold + 2);
            } else {
                speechConsistencyCounter = Math.max(0, speechConsistencyCounter - 1);
            }
            
            // Visual feedback
            updateVisualFeedback(speechConsistencyCounter >= config.audio.speechConsistencyThreshold);
            
            // Handle voice detection
            if (speechConsistencyCounter >= config.audio.speechConsistencyThreshold) {
                // Voice detected
                state.voiceDetected = true;
                lastVoiceTime = Date.now();
                silenceDuration = 0;
                
                // Clear initial timeout on first detection
                if (initialVoiceDetectionTimeout) {
                    clearTimeout(initialVoiceDetectionTimeout);
                    initialVoiceDetectionTimeout = null;
                }
            } else {
                // Silence - check duration
                silenceDuration = Date.now() - lastVoiceTime;
                
                // Update UI with countdown
                if (silenceDuration > 0 && state.voiceDetected) {
                    const remainingTime = Math.max(0, Math.round((config.audio.silenceStopDuration - silenceDuration) / 1000));
                    const currentLang = supportedLanguages[state.currentLanguageIndex].name;
                    statusText.textContent = `Recording... [${currentLang}] (stops in ${remainingTime}s of silence)`;
                }
                
                // If enough silence after voice, stop recording
                if (state.voiceDetected && silenceDuration >= config.audio.silenceStopDuration) {
                    cleanupAudioResources();
                    if (mediaRecorder && mediaRecorder.state === "recording") {
                        mediaRecorder.stop();
                    }
                }
            }
        }, 100);
    }

    function isSpeech(audioData) {
        const bufferLength = audioData.length;
        
        // Calculate average energy in speech frequency range (300-3500 Hz)
        const speechStart = Math.floor(300 * bufferLength / config.audio.sampleRate * 2);
        const speechEnd = Math.floor(3500 * bufferLength / config.audio.sampleRate * 2);
        
        let sum = 0;
        for (let i = speechStart; i < speechEnd && i < bufferLength; i++) {
            sum += audioData[i];
        }
        
        const average = sum / (speechEnd - speechStart);
        const dBLevel = 20 * Math.log10(average / 255 + 0.01);
        
        return dBLevel > config.audio.silenceThreshold;
    }

    function updateVisualFeedback(isActive) {
        if (!pulseRing) return;
        
        if (isActive) {
            pulseRing.style.transform = "scale(1.2)";
            pulseRing.style.backgroundColor = "rgba(0, 255, 0, 0.3)";
        } else {
            pulseRing.style.transform = "";
            pulseRing.style.backgroundColor = "";
        }
    }

    function cleanupAudioResources() {
        if (silenceTimer) {
            clearInterval(silenceTimer);
            silenceTimer = null;
        }
        
        if (initialVoiceDetectionTimeout) {
            clearTimeout(initialVoiceDetectionTimeout);
            initialVoiceDetectionTimeout = null;
        }
    }

    // ==================== UI FUNCTIONS ====================

    function createLanguageSelector() {
        if (!languageSelectorContainer) return;
        
        // Create selector container
        const selectorHTML = `
            <div class="language-selector">
                <p>Select your language:</p>
                <div class="language-buttons"></div>
                <p id="selected-language-display">Current: ${supportedLanguages[state.currentLanguageIndex].name}</p>
            </div>
        `;
        languageSelectorContainer.innerHTML = selectorHTML;
        
        // Create language buttons
        const buttonsContainer = document.querySelector('.language-buttons');
        supportedLanguages.forEach((lang, index) => {
            const button = document.createElement('button');
            button.className = 'language-button ' + (index === state.currentLanguageIndex ? 'active' : '');
            button.dataset.index = index;
            button.title = lang.name;
            button.textContent = lang.name;
            
            button.addEventListener('click', () => {
                // Update selected language
                state.currentLanguageIndex = parseInt(button.dataset.index);
                
                // Update UI
                document.querySelectorAll('.language-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update display
                const displayElement = document.getElementById('selected-language-display');
                if (displayElement) {
                    displayElement.textContent = `Current: ${supportedLanguages[state.currentLanguageIndex].name}`;
                }
                
                // Save preference
                localStorage.setItem('preferredLanguageIndex', state.currentLanguageIndex);
                
                // Show confirmation
                showTemporaryMessage(`Language set to ${supportedLanguages[state.currentLanguageIndex].name}`, "info");
            });
            
            buttonsContainer.appendChild(button);
        });
    }

    function updateUI(listening) {
        state.isListening = listening;
        
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

    function showTemporaryMessage(message, type = "info") {
        const originalText = statusText.textContent;
        const originalClass = statusText.className;
        
        statusText.className = `status-text ${type}`;
        statusText.textContent = message;
        
        if (type !== "error") {
            setTimeout(() => {
                if (state.isListening) {
                    statusText.textContent = 'Zuhören... Sprechen Sie bitte.';
                } else {
                    statusText.textContent = originalText;
                }
                statusText.className = originalClass;
            }, 3000);
        }
    }

    function startListening() {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            showTemporaryMessage('Keine Verbindung zum Server.', "error");
            return;
        }
        
        state.processingAudio = false;
        updateUI(true);
        
        // Clear previous text
        originalTextElement.textContent = '';
        translatedTextElement.textContent = '';
        
        // Start recording
        startRecording();
    }
    
    function stopListening() {
        state.processingAudio = false;
        cleanupAudioResources();
        
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
        
        updateUI(false);
    }

    // ==================== UTILITY FUNCTIONS ====================

    function playAudio(base64Audio) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
            
            audio.onplay = () => {
                statusText.textContent = 'Wiedergabe...';
            };
            
            audio.onended = resolve;
            audio.onerror = reject;
            
            audio.play().catch(error => {
                showTemporaryMessage('Fehler beim Abspielen der Audio-Antwort.', "error");
                reject(error);
            });
        });
    }
    
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // ==================== EVENT LISTENERS ====================

    micButton.addEventListener('click', function() {
        if (micButton.disabled) return;
        
        if (!state.isListening) {
            startListening();
        } else {
            stopListening();
        }
    });

    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden' && state.isListening) {
            stopListening();
        }
    });
});