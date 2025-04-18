document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const micButton = document.getElementById('mic-button');
    const pulseRing = document.querySelector('.pulse-ring');
    const statusText = document.getElementById('status-text');
    const originalTextElement = document.getElementById('original-text');
    const translatedTextElement = document.getElementById('translated-text');
    const languageSelectorContainer = document.querySelector('.language-selector-container');

    // State variables
    let isListening = false;
    let autoRestart = true;
    let processingAudio = false;
    
    // Audio recording variables for Whisper
    let mediaRecorder = null;
    let audioChunks = [];
    
    // Voice detection variables
    let audioContext = null;
    let analyser = null;
    let silenceTimer = null;
    let voiceDetected = false;
    let silenceDuration = 0;
    let audioBufferCache = []; // Keep recent audio levels to detect consistent voice patterns
    const silenceThreshold = -45; // Threshold to be less sensitive to background noise
    const speechConsistencyThreshold = 3; // Number of consecutive frames needed to confirm speech
    const maxRecordingDuration = 15000; // Maximum recording duration (15 seconds)
    const silenceStopDuration = 3000; // Stop after 3 seconds of silence (reduced from 5 seconds)
    
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
                        processingAudio = false;
                        startRecording();
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
    
    // Function to start recording audio for Whisper API
    async function startRecording() {
        if (processingAudio) return;
        
        try {
            // Reset audio chunks and voice detection state
            audioChunks = [];
            voiceDetected = false;
            silenceDuration = 0;
            audioBufferCache = [];
            
            // Initialize audio context if not already created
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 16000 // Optimal for speech recognition
                });
            }
            
            // Get microphone access if needed
            if (!mediaRecorder) {
                // Get microphone stream with enhanced noise cancellation settings
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        channelCount: 1, // Mono for better noise handling
                    } 
                });
                
                // Create audio processing nodes for advanced noise cancellation
                const microphoneSource = audioContext.createMediaStreamSource(stream);
                
                // Create analyzer for voice activity detection
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 2048; // Larger FFT for better frequency resolution
                analyser.smoothingTimeConstant = 0.6; // Less smoothing to respond faster to speech
                
                // Create filters to focus on speech frequencies
                
                // 1. High-pass filter to eliminate low rumble/background noise
                const highPassFilter = audioContext.createBiquadFilter();
                highPassFilter.type = 'highpass';
                highPassFilter.frequency.value = 150; // Cut frequencies below 150Hz
                highPassFilter.Q.value = 0.5;
                
                // 2. Low-pass filter to eliminate high-frequency hiss
                const lowPassFilter = audioContext.createBiquadFilter();
                lowPassFilter.type = 'lowpass';
                lowPassFilter.frequency.value = 6000; // Cut frequencies above 6kHz
                lowPassFilter.Q.value = 0.5;
                
                // 3. Create a dynamics compressor to even out audio levels
                const compressor = audioContext.createDynamicsCompressor();
                compressor.threshold.value = -30;
                compressor.knee.value = 10;
                compressor.ratio.value = 12;
                compressor.attack.value = 0.005;
                compressor.release.value = 0.250;
                
                // Create destination node for processed audio
                const outputDestination = audioContext.createMediaStreamDestination();
                
                // Connect the audio processing chain
                microphoneSource.connect(highPassFilter);
                highPassFilter.connect(lowPassFilter);
                lowPassFilter.connect(compressor);
                compressor.connect(outputDestination);
                
                // Connect analyzer at the end to monitor processed audio
                compressor.connect(analyser);
                
                // Create media recorder with optimized settings using the processed audio stream
                const options = {
                    mimeType: 'audio/webm',
                    audioBitsPerSecond: 128000
                };
                
                mediaRecorder = new MediaRecorder(outputDestination.stream, options);
                
                // Handle data available event
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };
                
                // Handle recording stop event
                mediaRecorder.onstop = async () => {
                    if (!isListening || audioChunks.length === 0) return;
                    
                    // Stop the voice detection timer
                    if (silenceTimer) {
                        clearInterval(silenceTimer);
                        silenceTimer = null;
                    }
                    
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
                            
                            // Restart recording if still listening
                            if (isListening && autoRestart) {
                                setTimeout(startRecording, 1000);
                            }
                        }
                    } catch (error) {
                        console.error("Error processing recording:", error);
                        showTemporaryMessage(`Fehler bei der Verarbeitung: ${error.message}`, "error");
                        processingAudio = false;
                        
                        // Restart recording if still listening
                        if (isListening && autoRestart) {
                            setTimeout(startRecording, 1000);
                        }
                    }
                };
            }
            
            // Start recording
            mediaRecorder.start(1000); // Collect data in 1-second chunks
            
            // Show recording indicator with language
            const currentLang = supportedLanguages[currentLanguageIndex].name;
            showTemporaryMessage(`Recording... [${currentLang}]`, "processing");
            
            // Start voice detection to determine when to stop recording
            startVoiceDetection();
            
            // Set a maximum recording duration as a fallback
            setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === "recording") {
                    mediaRecorder.stop();
                }
            }, maxRecordingDuration);
            
        } catch (error) {
            console.error("Error accessing microphone:", error);
            showTemporaryMessage(`Mikrofonfehler: ${error.message}`, "error");
        }
    }
    
    // Function to detect voice activity and control recording duration
    function startVoiceDetection() {
        if (!analyser) return;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let lastVoiceTime = Date.now();
        let speechConsistencyCounter = 0;
        let speechDetectionStarted = false;
        
        // Function to check if the current audio frame contains speech
        function detectSpeech(audioData, bufferLength) {
            // Calculate energy in different frequency bands with a focus on speech frequencies
            const speechBandStart = Math.floor(300 * bufferLength / audioContext.sampleRate);
            const speechBandEnd = Math.floor(3500 * bufferLength / audioContext.sampleRate);
            
            // Calculate energy in speech band
            let speechBandEnergy = 0;
            for (let i = speechBandStart; i < speechBandEnd; i++) {
                speechBandEnergy += audioData[i];
            }
            speechBandEnergy /= (speechBandEnd - speechBandStart);
            
            // Calculate energy outside speech band (noise)
            let noiseBandEnergy = 0;
            let noiseCount = 0;
            
            // Low frequency noise
            for (let i = 0; i < speechBandStart; i++) {
                noiseBandEnergy += audioData[i];
                noiseCount++;
            }
            
            // High frequency noise
            for (let i = speechBandEnd; i < bufferLength; i++) {
                noiseBandEnergy += audioData[i];
                noiseCount++;
            }
            
            noiseBandEnergy = noiseCount > 0 ? noiseBandEnergy / noiseCount : 0;
            
            // Calculate signal-to-noise ratio (higher is better)
            const snr = speechBandEnergy / (noiseBandEnergy + 0.1); // Avoid division by zero
            
            // Convert main signal to dB
            const dBLevel = 20 * Math.log10(speechBandEnergy / 255);
            
            // Store value to calculate variance
            audioBufferCache.push(dBLevel);
            if (audioBufferCache.length > 10) audioBufferCache.shift(); // Keep last 10 readings
            
            // Calculate variance of audio levels (speech has more variance than steady noise)
            let sum = 0, mean = 0, variance = 0;
            
            // Only calculate variance if we have enough samples
            if (audioBufferCache.length > 3) {
                for (let i = 0; i < audioBufferCache.length; i++) {
                    sum += audioBufferCache[i];
                }
                mean = sum / audioBufferCache.length;
                
                for (let i = 0; i < audioBufferCache.length; i++) {
                    variance += Math.pow(audioBufferCache[i] - mean, 2);
                }
                variance /= audioBufferCache.length;
            }
            
            // Apply multiple criteria to detect speech
            const hasSignificantVolume = dBLevel > silenceThreshold;
            const hasGoodSNR = snr > 1.8; // Speech should be stronger than background
            const hasVariance = variance > 3; // Speech has more variance than steady noise
            
            return {
                isVoice: hasSignificantVolume && (hasGoodSNR || hasVariance),
                dBLevel: dBLevel
            };
        }
        
        // Update the status text with the silence countdown when relevant
        function updateStatusWithSilence() {
            if (silenceDuration > 0 && voiceDetected) {
                const remainingTime = Math.max(0, Math.round((silenceStopDuration - silenceDuration) / 1000));
                const currentLang = supportedLanguages[currentLanguageIndex].name;
                statusText.textContent = `Recording... [${currentLang}] (stops in ${remainingTime}s of silence)`;
            }
        }
        
        // Clear any existing voice detection timer
        if (silenceTimer) {
            clearInterval(silenceTimer);
        }
        
        // Start a new timer to periodically check voice activity
        silenceTimer = setInterval(() => {
            if (!isListening || !mediaRecorder || mediaRecorder.state !== "recording") {
                clearInterval(silenceTimer);
                silenceTimer = null;
                return;
            }
            
            // Get the current audio data
            analyser.getByteFrequencyData(dataArray);
            
            // Apply speech detection
            const speechResult = detectSpeech(dataArray, bufferLength);
            const isVoice = speechResult.isVoice;
            
            // Implement speech consistency check to avoid false positives
            if (isVoice) {
                speechConsistencyCounter++;
                // Only register true speech after several consecutive detections
                if (speechConsistencyCounter >= speechConsistencyThreshold && !speechDetectionStarted) {
                    speechDetectionStarted = true;
                }
            } else {
                // Reset counter if speech wasn't detected
                speechConsistencyCounter = Math.max(0, speechConsistencyCounter - 1);
                if (speechConsistencyCounter === 0) {
                    speechDetectionStarted = false;
                }
            }
            
            // Visual indication of voice detection
            if (isVoice && speechDetectionStarted) {
                if (pulseRing) {
                    pulseRing.style.transform = "scale(1.2)";
                    pulseRing.style.backgroundColor = "rgba(0, 255, 0, 0.3)";
                }
            } else {
                if (pulseRing) {
                    pulseRing.style.transform = "";
                    pulseRing.style.backgroundColor = "";
                }
            }
            
            if (isVoice && speechDetectionStarted) {
                // Voice detected
                voiceDetected = true;
                lastVoiceTime = Date.now();
                silenceDuration = 0;
            } else {
                // Check how long we've had silence
                silenceDuration = Date.now() - lastVoiceTime;
                
                // Update the status with silence countdown
                updateStatusWithSilence();
                
                // If we've had enough silence after voice was detected, stop recording
                if (voiceDetected && silenceDuration >= silenceStopDuration) {
                    clearInterval(silenceTimer);
                    silenceTimer = null;
                    
                    if (mediaRecorder && mediaRecorder.state === "recording") {
                        mediaRecorder.stop();
                    }
                }
            }
        }, 100);
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
        startRecording();
        
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            showTemporaryMessage('Keine Verbindung zum Server.', "error");
            return;
        }
        
        autoRestart = true;
        processingAudio = false;
        
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
        
        // Stop voice detection
        if (silenceTimer) {
            clearInterval(silenceTimer);
            silenceTimer = null;
        }
        
        // Stop recording
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
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