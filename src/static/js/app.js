document.addEventListener("DOMContentLoaded", function () {
  // DOM elements
  const micButton = document.getElementById("mic-button");
  const pulseRing = document.querySelector(".pulse-ring");
  const statusText = document.getElementById("status-text");
  const originalTextElement = document.getElementById("original-text");
  const translatedTextElement = document.getElementById("translated-text");
  const sourceLangDisplay = document.getElementById("source-language-display");
  const targetLangDisplay = document.getElementById("target-language-display");
  const sourceLangBtn = document.getElementById("source-language-btn");
  const targetLangBtn = document.getElementById("target-language-btn");
  const sourceLangPanel = document.getElementById("source-language-panel");
  const targetLangPanel = document.getElementById("target-language-panel");
  const saveButton = document.getElementById("save-button");
  const originalHeader = document.getElementById("original-header");
  const translationHeader = document.getElementById("translation-header");
  const themeToggle = document.querySelector(".theme-toggle");

  // Check if browser supports speech recognition
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasSpeechRecognition = !!SpeechRecognition;
  
  // Debug mode for troubleshooting
  const DEBUG = true;
  
  function debugLog(...args) {
    if (DEBUG) console.log(...args);
  }
  
  // Create recognition instance
  let recognition = null;
  
  // Configuration
  const config = {
    translation: {
      debounceDelay: 200, // Reduced debounce time for faster translation
    },
    speech: {
      keepFullTranscript: true, // Keep full session transcript
      maxInactivityTime: 1000, // Reduced from 5000ms to 3000ms to create more natural breaks
      maxContinuousListeningTime: 400000, // Increased from 60000ms (1 min) to 300000ms (5 mins)
      errorResetDelay: 10000 // Time to wait before resetting after an error
    }
  };

  // State management
  const state = {
    isListening: false,
    currentLanguageIndex: parseInt(
      localStorage.getItem("preferredLanguageIndex") || "0"
    ),
    targetLanguageIndex: parseInt(
      localStorage.getItem("targetLanguageIndex") || "4" // Default to German
    ),
    darkMode: localStorage.getItem("darkMode") === "true",
    isTranscribing: false,
    pendingTranslation: false,
    lastTranslationText: "", // Store last text that was sent for translation
    recognizedText: "", // Current recognized text
    sessionTranscript: "", // Full session transcript
    interimText: "", // Current interim text
    translateTimer: null, // For debouncing translation requests
    finalTranscriptSent: false, // Track if final transcript has been sent for translation
    recognitionRestartAttempts: 0, // Track restart attempts
    lastSpeechTime: 0, // Track when speech was last detected
    activeSpeechDetected: false, // Currently detecting active speech
    inactivityTimer: null, // Timer to detect speech completion
    continuousTimer: null, // Timer to reset recognition periodically during long sessions
    audioContext: null, // For audio analysis if needed
    errorRecoveryMode: false, // Flag for handling recovery from errors
    lastError: null, // Last error encountered
  };

  // Resources
  let socket = null;

  // Language selection configuration
  const supportedLanguages = [
    { code: "en-US", name: "English", shortCode: "en" },
    { code: "ar-SA", name: "العربية", shortCode: "ar" },
    { code: "es-ES", name: "Español", shortCode: "es" },
    { code: "fr-FR", name: "Français", shortCode: "fr" },
    { code: "de-DE", name: "Deutsch", shortCode: "de" },
    { code: "zh-CN", name: "中文", shortCode: "zh" },
    { code: "hi-IN", name: "हिन्दी", shortCode: "hi" },
    { code: "ja-JP", name: "日本語", shortCode: "ja" },
    { code: "ru-RU", name: "Русский", shortCode: "ru" },
  ];

  // Target languages for translation
  const targetLanguages = [
    { code: "en", name: "English" },
    { code: "ar", name: "Arabic" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "zh", name: "Chinese" },
    { code: "hi", name: "Hindi" },
    { code: "ja", name: "Japanese" },
    { code: "ru", name: "Russian" },
  ];

  function checkBrowserCompatibility() {
    const browserInfo = {
      isChrome: /Chrome/.test(navigator.userAgent) && !/Edge/.test(navigator.userAgent),
      isEdge: /Edg/.test(navigator.userAgent),
      isFirefox: /Firefox/.test(navigator.userAgent),
      isSafari: /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent),
      isOpera: /OPR/.test(navigator.userAgent)
    };
    
    debugLog("Browser detection:", browserInfo);
    
    // Show warning for browsers with limited speech recognition support
    if (!(browserInfo.isChrome || browserInfo.isEdge || browserInfo.isSafari)) {
      const browserNotice = document.getElementById("browser-support-notice");
      if (browserNotice) {
        browserNotice.classList.remove("hidden");
      }
    }
    
    return browserInfo;
  }

  // Initialize the app
  const browserInfo = checkBrowserCompatibility();
  initializeLanguageSelectors();
  initializeWebSocket();
  initializeUI();
  initializeSpeechRecognition();
  initializeEventListeners();

  // ==================== INITIALIZATION ====================

  function initializeUI() {
    // Set initial UI states
    if (state.darkMode) {
      document.body.classList.add("dark-mode");
      themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
      themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    // Update language displays
    updateLanguageDisplays();

    // Set initial status if speech recognition is available
    if (hasSpeechRecognition) {
      statusText.textContent = "Click the mic button to start recording...";
    }
  }

  function initializeLanguageSelectors() {
    // Populate source language grid
    const sourceGrid = sourceLangPanel.querySelector(".language-grid");
    sourceGrid.innerHTML = "";

    supportedLanguages.forEach((lang, index) => {
      const option = document.createElement("button");
      option.className = "language-option";
      option.dataset.index = index;
      option.textContent = lang.name;

      if (index === state.currentLanguageIndex) {
        option.classList.add("active");
      }

      option.addEventListener("click", () => {
        selectSourceLanguage(index);
      });

      sourceGrid.appendChild(option);
    });

    // Populate target language grid - but always select German (targetLanguageIndex)
    const targetGrid = targetLangPanel.querySelector(".language-grid");
    targetGrid.innerHTML = "";

    targetLanguages.forEach((lang, index) => {
      const option = document.createElement("button");
      option.className = "language-option";
      option.dataset.index = index;
      option.textContent = lang.name;

      // Find German index
      const germanIndex = targetLanguages.findIndex(l => l.code === "de");
      if (index === germanIndex) {
        option.classList.add("active");
        state.targetLanguageIndex = germanIndex;
      }

      // Make other language options disabled since we're fixed on German
      if (index !== germanIndex) {
        option.disabled = true;
        option.style.opacity = "0.5";
        option.title = "Currently only German translation is supported";
      }

      targetGrid.appendChild(option);
    });
  }

  function initializeSpeechRecognition() {
    // Always create a fresh instance when initializing
    if (hasSpeechRecognition) {
      // Clean up any existing instance
      if (recognition) {
        try {
          recognition.onend = null;
          recognition.onresult = null;
          recognition.onerror = null;
          recognition.onstart = null;
          recognition.onsoundstart = null;
          recognition.onsoundend = null;
          recognition.onnomatch = null;
          recognition.abort();
        } catch (e) {
          console.error("Error cleaning up previous recognition instance:", e);
        }
      }
      
      // Create new instance
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = supportedLanguages[state.currentLanguageIndex].code;

      // Handle recognition events
      recognition.onstart = () => {
        console.log("Speech recognition started");
        state.isTranscribing = true;
        state.recognitionRestartAttempts = 0;
        state.lastSpeechTime = Date.now();
        state.errorRecoveryMode = false;
        
        // Show visual feedback that we're listening
        if (document.querySelector('.recognition-indicator')) {
          document.querySelector('.indicator-dot').classList.add('active');
          document.querySelector('.indicator-text').textContent = 'Listening...';
        }
        
        // Remove placeholder if present
        const placeholder = originalTextElement.querySelector('.placeholder');
        if (placeholder) {
          placeholder.remove();
        }
        
        // Set up long-running session management
        if (state.continuousTimer) clearTimeout(state.continuousTimer);
        state.continuousTimer = setTimeout(() => {
          console.log("Resetting recognition after long continuous session");
          if (state.isListening) {
            try {
              // Stop and restart to get a fresh recognition session
              recognition.stop();
              setTimeout(() => {
                if (state.isListening) {
                  initializeSpeechRecognition();
                  recognition.start();
                }
              }, 300);
            } catch (e) {
              console.error("Error during long-running session reset:", e);
            }
          }
        }, config.speech.maxContinuousListeningTime);
        
        // Add the pulsing speech indicator to the UI
        updateSpeechActivity(false);
      };

      recognition.onaudiostart = () => {
        console.log("Audio capturing started");
        showTemporaryMessage("Audio capturing started", "info", true);
      };

      recognition.onsoundstart = () => {
        console.log("Some sound detected");
        updateSpeechActivity(true);
      };

      recognition.onsoundend = () => {
        console.log("Sound has stopped");
        updateSpeechActivity(false);
      };

      recognition.onspeechstart = () => {
        console.log("Speech started");
        showTemporaryMessage("Speech detected", "info", true);
        updateSpeechActivity(true);
      };

      recognition.onspeechend = () => {
        console.log("Speech ended");
        updateSpeechActivity(false);
      };

      recognition.onnomatch = () => {
        console.log("No match found");
        showTemporaryMessage("Could not recognize speech", "warning", true);
      };

      recognition.onerror = (event) => {
        const errorMessage = getErrorMessage(event.error);
        console.error("Recognition error", event, errorMessage);
        
        // Reset recovery flag to ensure we try to recover
        state.errorRecoveryMode = true;
        state.lastError = event.error;
        
        showTemporaryMessage(`${errorMessage}`, "error");
        
        // Handle different error types according to spec
        switch(event.error) {
          case "no-speech":
            // No speech was detected - could reset after a timeout
            setTimeout(() => {
              if (state.isListening) {
                try { recognition.start(); } catch(e) { /* suppress */ }
              }
            }, config.speech.errorResetDelay);
            break;
            
          case "audio-capture":
            // Audio capture failed - might be a temporary hardware issue
            showTemporaryMessage("Could not access microphone. Check your device settings.", "error");
            stopListening();
            break;
            
          case "not-allowed":
          case "service-not-allowed":
            // User denied permission or service not allowed
            showTemporaryMessage("Microphone access denied. Please allow microphone access in your browser settings.", "error");
            stopListening();
            break;
            
          case "aborted":
            // Recognition was aborted - can be normal during reset
            if (state.isListening && !state.recognitionRestartAttempts) {
              setTimeout(() => {
                if (state.isListening) {
                  try { recognition.start(); } catch(e) { /* suppress */ }
                }
              }, config.speech.errorResetDelay);
            }
            break;
            
          case "network":
            // Network error - could retry with exponential backoff
            showTemporaryMessage("Network error occurred. Check your connection.", "error");
            if (state.isListening) {
              const backoffDelay = Math.min(1000 * Math.pow(2, state.recognitionRestartAttempts), 10000);
              setTimeout(() => {
                if (state.isListening) {
                  try { recognition.start(); } catch(e) { /* suppress */ }
                }
              }, backoffDelay);
              state.recognitionRestartAttempts++;
            }
            break;
            
          case "language-not-supported":
            // Language not supported
            showTemporaryMessage(`Language ${supportedLanguages[state.currentLanguageIndex].name} is not supported by your browser.`, "error");
            stopListening();
            break;
            
          default:
            // Handle other errors
            if (state.isListening) {
              setTimeout(() => {
                if (state.isListening) {
                  try { recognition.start(); } catch(e) { /* suppress */ }
                }
              }, config.speech.errorResetDelay);
            }
        }
      };

      recognition.onend = () => {
        console.log("Speech recognition ended");
        state.isTranscribing = false;
        
        // Clear continuous timer
        if (state.continuousTimer) {
          clearTimeout(state.continuousTimer);
          state.continuousTimer = null;
        }
        
        // Always restart if we're still supposed to be listening - no timeout
        if (state.isListening) {
          try {
            state.recognitionRestartAttempts++;
            
            // If in error recovery mode, wait a bit longer
            const restartDelay = state.errorRecoveryMode ? 
              config.speech.errorResetDelay : 
              50;
            
            // If too many restart attempts in short succession, reinitialize
            if (state.recognitionRestartAttempts > 3) {
              console.log("Too many restart attempts, reinitializing recognition");
              setTimeout(() => {
                if (state.isListening) {
                  initializeSpeechRecognition();
                  try { recognition.start(); } catch (e) { /* suppress */ }
                }
              }, restartDelay);
              return;
            }
            
            // Restart with appropriate delay
            setTimeout(() => {
              if (state.isListening) {
                try {
                  recognition.start();
                  // Reset error recovery after successful restart
                  state.errorRecoveryMode = false;
                } catch (e) {
                  console.error("Could not restart recognition:", e);
                  
                  // Re-initialize on failure
                  initializeSpeechRecognition();
                  try { recognition.start(); } catch(e2) { /* last resort */ }
                }
              }
            }, restartDelay);
          } catch (e) {
            console.error("Could not restart recognition:", e);
            
            // Only after multiple failures should we stop completely
            if (e.name !== "InvalidStateError") {
              stopListening();
              showTemporaryMessage("Speech recognition failed to restart.", "error");
            } else {
              // If it's just a temporary state issue, try again after a minimal delay
              setTimeout(() => {
                if (state.isListening) {
                  try { recognition.start(); } catch(e2) { 
                    console.error("Failed second restart attempt:", e2);
                    // Re-initialize the recognition instance on failure
                    initializeSpeechRecognition();
                    try { recognition.start(); } catch(e3) { /* last resort failed */ }
                  }
                }
              }, 50);
            }
          }
        } else {
          // If not listening anymore, update visual indicators
          if (document.querySelector('.recognition-indicator')) {
            document.querySelector('.indicator-dot').classList.remove('active');
            document.querySelector('.indicator-text').textContent = 'Ready to detect speech';
          }
        }
      };

      // This is the key event for real-time transcription
      recognition.onresult = (event) => {
        // Reset restart attempts counter since we're successfully getting results
        state.recognitionRestartAttempts = 0;
        state.errorRecoveryMode = false;
        
        // Update speech activity state
        state.lastSpeechTime = Date.now();
        updateSpeechActivity(true);
        
        // Process speech results
        processRecognitionResults(event);
        
        // Start inactivity timer
        if (state.inactivityTimer) {
          clearTimeout(state.inactivityTimer);
        }
        
        state.inactivityTimer = setTimeout(() => {
          updateSpeechActivity(false);
          
          // If we have pending interim text when speech appears complete,
          // consider it as final and append to the session transcript
          if (state.interimText && config.speech.keepFullTranscript) {
            if (state.sessionTranscript && !state.sessionTranscript.endsWith(' ')) {
              state.sessionTranscript += ' ';
            }
            state.sessionTranscript += state.interimText;
            state.interimText = '';
            
            // Update display with full session transcript 
            updateTranscriptText(state.sessionTranscript, true);
            
            // Send for translation
            sendForTranslation(state.sessionTranscript);
          }
        }, config.speech.maxInactivityTime);
      };
    } else {
      // Show error if Speech API is not supported
      statusText.textContent = "Error: Your browser doesn't support speech recognition.";
      statusText.className = "error";
      micButton.disabled = true;
    }
  }

  // Process recognition results more efficiently
  function processRecognitionResults(event) {
    let interimTranscript = '';
    let finalTranscript = '';
    
    // Gather interim and final results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;
      
      if (result.isFinal) {
        finalTranscript += transcript;
        console.log(`Final transcript: "${transcript}" (confidence: ${confidence})`);
      } else {
        interimTranscript += transcript;
      }
    }
    
    // If we have a final transcript part
    if (finalTranscript) {
      // Check if this finalTranscript is the same as our current interimText
      // This prevents duplication when interim text becomes final
      if (state.interimText && finalTranscript.trim() === state.interimText.trim()) {
        // Clear the interim text since it's now being treated as final
        state.interimText = '';
      }
      
      // Append to session transcript if that option is enabled
      if (config.speech.keepFullTranscript) {
        // Add space before appending if needed
        if (state.sessionTranscript && !state.sessionTranscript.endsWith(' ') && !finalTranscript.startsWith(' ')) {
          state.sessionTranscript += ' ';
        }
        
        // Store the final transcript
        state.sessionTranscript += finalTranscript;
        
        // Update the display with just the session transcript
        // No longer adding interim text to avoid duplication
        updateTranscriptText(state.sessionTranscript, true);
        
        // Save the current recognized text
        state.recognizedText = state.sessionTranscript;
        
        // Send ONLY the new segment for translation
        sendForTranslation(finalTranscript, true);
      } else {
        // Original behavior - just use the current final transcript
        updateTranscriptText(finalTranscript, true);
        state.recognizedText = finalTranscript;
        sendForTranslation(finalTranscript, false);
      }
    }
    
    // If we only have interim results
    if (interimTranscript && !finalTranscript) {
      // Only update if the interim text has actually changed
      if (interimTranscript !== state.interimText) {
        state.interimText = interimTranscript;
        
        if (config.speech.keepFullTranscript) {
          // Show full session plus current interim
          // But make sure we don't add duplicate content
          const combinedText = state.sessionTranscript + 
            (state.sessionTranscript && interimTranscript ? " " : "") + 
            interimTranscript;
          updateTranscriptText(combinedText, false);
        } else {
          // Just show current interim
          updateTranscriptText(interimTranscript, false);
        }
      }
    }
  }

  // Helper function to get appropriate error messages
  function getErrorMessage(errorCode) {
    switch(errorCode) {
      case "no-speech":
        return "No speech was detected. Please try again.";
      case "aborted":
        return "Speech recognition was aborted.";
      case "audio-capture":
        return "Could not capture audio. Check your microphone.";
      case "network":
        return "Network error occurred during speech recognition.";
      case "not-allowed":
        return "Microphone access denied. Please allow microphone access.";
      case "service-not-allowed":
        return "Speech recognition service not allowed by your browser.";
      case "language-not-supported":
        return "Selected language is not supported.";
      case "phrases-not-supported":
        return "Your browser does not support phrase detection.";
      default:
        return `Recognition error: ${errorCode || "unknown"}`;
    }
  }

  function updateLanguageDisplays() {
    // Update source language display
    sourceLangDisplay.textContent = supportedLanguages[state.currentLanguageIndex].name;
    originalHeader.textContent = `Original (${supportedLanguages[state.currentLanguageIndex].name})`;

    // Fix target language to German
    targetLangDisplay.textContent = "German";
    translationHeader.textContent = "German Translation";
  }

  function selectSourceLanguage(index) {
    state.currentLanguageIndex = index;
    localStorage.setItem("preferredLanguageIndex", index);

    // Update UI
    sourceLangPanel.classList.remove("visible");
    updateLanguageDisplays();

    // Update speech recognition language
    if (recognition) {
      recognition.lang = supportedLanguages[state.currentLanguageIndex].code;
    }

    // If already listening, restart with new language
    if (state.isListening) {
      stopListening();
      setTimeout(startListening, 300);
    }
  }

  function initializeEventListeners() {
    // Language selector buttons
    sourceLangBtn.addEventListener("click", () => {
      sourceLangPanel.classList.toggle("visible");
      targetLangPanel.classList.remove("visible");

      // Position the panel below the button
      const btnRect = sourceLangBtn.getBoundingClientRect();
      sourceLangPanel.style.top = `${btnRect.bottom + 10}px`;
      sourceLangPanel.style.left = `${btnRect.left}px`;
    });

    targetLangBtn.addEventListener("click", () => {
      targetLangPanel.classList.toggle("visible");
      sourceLangPanel.classList.remove("visible");

      // Position the panel below the button
      const btnRect = targetLangBtn.getBoundingClientRect();
      targetLangPanel.style.top = `${btnRect.bottom + 10}px`;
      targetLangPanel.style.left = `${btnRect.left}px`;
    });

    // Close panels when clicking outside
    document.addEventListener("click", (e) => {
      if (
        !sourceLangBtn.contains(e.target) &&
        !sourceLangPanel.contains(e.target)
      ) {
        sourceLangPanel.classList.remove("visible");
      }

      if (
        !targetLangBtn.contains(e.target) &&
        !targetLangPanel.contains(e.target)
      ) {
        targetLangPanel.classList.remove("visible");
      }
    });

    // Mic button
    micButton.addEventListener("click", function () {
      if (micButton.disabled) return;

      if (!state.isListening) {
        startListening();
      } else {
        stopListening();
      }
    });

    // Save button
    saveButton.addEventListener("click", saveTranscript);

    // Theme toggle
    themeToggle.addEventListener("click", toggleDarkMode);

    // Visibility change (stop recording when page is hidden)
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && state.isListening) {
        stopListening();
      }
    });
  }

  function toggleDarkMode() {
    state.darkMode = !state.darkMode;
    document.body.classList.toggle("dark-mode", state.darkMode);
    themeToggle.innerHTML = state.darkMode
      ? '<i class="fas fa-moon"></i>'
      : '<i class="fas fa-sun"></i>';
    localStorage.setItem("darkMode", state.darkMode);
  }

  // ==================== WEBSOCKET HANDLING ====================

  function initializeWebSocket() {
    // Clean up existing socket
    if (socket) socket.close();

    // Create new connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    
    // Add debugging for WebSocket connection issues
    debugLog("Attempting to connect to WebSocket:", wsUrl);
    
    socket = new WebSocket(wsUrl);

    // Setup event handlers
    socket.onopen = handleSocketOpen;
    socket.onmessage = handleSocketMessage;
    socket.onclose = handleSocketClose;
    socket.onerror = handleSocketError;
  }

  function handleSocketOpen() {
    debugLog("WebSocket connection established successfully");
    if (hasSpeechRecognition) {
      statusText.textContent = "Connected. Click the mic button to start recording...";
      statusText.className = "";
      micButton.disabled = false;
    }
  }

  async function handleSocketMessage(event) {
    try {
      const data = JSON.parse(event.data);
      debugLog("Received WebSocket message:", data);

      if (data.type === "translation_only") {
        // Handle just the translation part
        updateTranslation(data.translated_text, data.is_incremental);
      } else if (data.type === "error") {
        showTemporaryMessage(`Error: ${data.message}`, "error");
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  }

  function handleSocketClose(event) {
    debugLog("WebSocket connection closed:", event);
    showTemporaryMessage("Connection to server lost. Translation will not work.", "error");
    setTimeout(initializeWebSocket, 3000);
  }

  function handleSocketError(event) {
    debugLog("WebSocket connection error:", event);
    showTemporaryMessage("Connection error occurred.", "error");
  }

  // ==================== SPEECH RECOGNITION FUNCTIONS ====================

  async function startListening() {
    if (!hasSpeechRecognition) {
      showTemporaryMessage("Speech recognition is not supported in your browser.", "error");
      return;
    }

    // Check WebSocket connection before proceeding
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      debugLog("WebSocket not connected, attempting to reconnect...");
      showTemporaryMessage("Connection to translation server lost. Attempting to reconnect...", "warning");
      initializeWebSocket();
      // Wait briefly to see if connection establishes
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        showTemporaryMessage("No connection to translation server. Translation may not work properly.", "error");
      }
    }

    // CRITICAL FIX: Check for microphone permission first
    // This is the key part to fix the microphone button activation issue
    try {
      debugLog("Requesting microphone permission explicitly");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      // Keep the stream active briefly to ensure the system recognizes it's being used
      // This helps prevent "audio-capture" errors on some systems
      setTimeout(() => {
        // Stop the stream after a short delay
        stream.getTracks().forEach(track => track.stop());
        debugLog("Microphone permission explicitly granted and stream stopped");
      }, 500);
      
      debugLog("Microphone permission granted");
    } catch (err) {
      debugLog("Microphone permission error:", err);
      showTemporaryMessage("Microphone access denied. Please allow microphone access in browser settings.", "error");
      updateUI(false);
      return;
    }

    try {
      // Reset state variables
      state.pendingTranslation = false;
      state.recognizedText = "";
      state.sessionTranscript = ""; 
      state.interimText = "";
      state.finalTranscriptSent = false;
      state.recognitionRestartAttempts = 0;
      state.errorRecoveryMode = false;
      
      // Clear any existing timers
      if (state.inactivityTimer) {
        clearTimeout(state.inactivityTimer);
        state.inactivityTimer = null;
      }
      
      if (state.continuousTimer) {
        clearTimeout(state.continuousTimer);
        state.continuousTimer = null;
      }
      
      // Clear text areas
      originalTextElement.textContent = "";
      translatedTextElement.textContent = "";

      // Update UI first for instant feedback
      updateUI(true);

      // NEW APPROACH: Create brand new speech recognition instance each time
      if (recognition) {
        try {
          // First clean up any existing instance completely
          recognition.onresult = null;
          recognition.onend = null;
          recognition.onerror = null;
          recognition.onstart = null;
          recognition.onspeechstart = null;
          recognition.onspeechend = null;
          recognition.abort();
          recognition = null;
          debugLog("Successfully cleaned up previous recognition instance");
        } catch (e) {
          debugLog("Error cleaning up previous recognition:", e);
        }
      }
      
      // Create completely fresh recognition instance
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = supportedLanguages[state.currentLanguageIndex].code;
      
      // Set up all event handlers again
      setupRecognitionEventHandlers();
      
      // Start speech recognition with a small delay after UI updates
      // This helps prevent timing issues
      setTimeout(() => {
        try {
          debugLog("Starting speech recognition");
          recognition.start();
          debugLog("Speech recognition started successfully");
        } catch (e) {
          debugLog("Error starting recognition:", e);
          
          // If we can't start, try re-initializing after a short delay
          setTimeout(() => {
            try {
              debugLog("Reinitializing speech recognition completely");
              recognition = new SpeechRecognition();
              recognition.continuous = true;
              recognition.interimResults = true;
              recognition.maxAlternatives = 1;
              recognition.lang = supportedLanguages[state.currentLanguageIndex].code;
              
              setupRecognitionEventHandlers();
              recognition.start();
              debugLog("Recognition restarted successfully after reinitializing");
            } catch (e2) {
              debugLog("Second attempt failed:", e2);
              
              // Check for specific error types
              if (e2.name === "NotAllowedError") {
                showTemporaryMessage("Microphone permission denied. Please allow microphone access in browser settings.", "error");
              } else {
                showTemporaryMessage("Could not start speech recognition. Try reloading the page.", "error");
              }
              
              updateUI(false);
            }
          }, 300);
        }
      }, 100);
    } catch (error) {
      debugLog("Error in startListening:", error);
      showTemporaryMessage(`Error: ${error.message}`, "error");
      updateUI(false);
    }
  }
  
  // New helper function to set up all recognition event handlers
  function setupRecognitionEventHandlers() {
    if (!recognition) return;
    
    // Basic events
    recognition.onstart = () => {
      debugLog("Speech recognition started");
      state.isTranscribing = true;
      state.recognitionRestartAttempts = 0;
      state.lastSpeechTime = Date.now();
      state.errorRecoveryMode = false;
      
      // Show visual feedback that we're listening
      if (document.querySelector('.recognition-indicator')) {
        document.querySelector('.indicator-dot').classList.add('active');
        document.querySelector('.indicator-text').textContent = 'Listening...';
      }
      
      // Remove placeholder if present
      const placeholder = originalTextElement.querySelector('.placeholder');
      if (placeholder) {
        placeholder.remove();
      }
      
      // Set up long-running session management
      if (state.continuousTimer) clearTimeout(state.continuousTimer);
      state.continuousTimer = setTimeout(() => {
        debugLog("Resetting recognition after long continuous session");
        if (state.isListening) {
          try {
            // Stop and restart to get a fresh recognition session
            recognition.stop();
            setTimeout(() => {
              if (state.isListening) {
                startListening();
              }
            }, 300);
          } catch (e) {
            debugLog("Error during long-running session reset:", e);
          }
        }
      }, config.speech.maxContinuousListeningTime);
      
      // Add the pulsing speech indicator to the UI
      updateSpeechActivity(false);
    };
    
    // Audio events
    recognition.onaudiostart = () => {
      debugLog("Audio capturing started");
      showTemporaryMessage("Audio capturing started", "info", true);
    };
    
    recognition.onsoundstart = () => {
      debugLog("Sound detected");
      updateSpeechActivity(true);
    };
    
    recognition.onsoundend = () => {
      debugLog("Sound has stopped");
      updateSpeechActivity(false);
    };
    
    recognition.onspeechstart = () => {
      debugLog("Speech started");
      showTemporaryMessage("Speech detected", "info", true);
      updateSpeechActivity(true);
    };
    
    recognition.onspeechend = () => {
      debugLog("Speech ended");
      updateSpeechActivity(false);
    };
    
    recognition.onnomatch = () => {
      debugLog("No match found");
      showTemporaryMessage("Could not recognize speech", "warning", true);
    };
    
    // Error handling
    recognition.onerror = (event) => {
      const errorMessage = getErrorMessage(event.error);
      debugLog("Recognition error:", event.error, errorMessage);
      
      // Reset recovery flag to ensure we try to recover
      state.errorRecoveryMode = true;
      state.lastError = event.error;
      
      showTemporaryMessage(`${errorMessage}`, "error");
      
      // Handle different error types according to spec
      switch(event.error) {
        case "no-speech":
          // No speech was detected - could reset after a timeout
          setTimeout(() => {
            if (state.isListening) {
              try { recognition.start(); } catch(e) { /* suppress */ }
            }
          }, config.speech.errorResetDelay);
          break;
          
        case "audio-capture":
          // Audio capture failed - might be a temporary hardware issue
          showTemporaryMessage("Could not access microphone. Check your device settings.", "error");
          // Try to restart instead of stopping completely
          setTimeout(() => {
            if (state.isListening) {
              startListening();
            }
          }, 1000);
          break;
          
        case "not-allowed":
        case "service-not-allowed":
          // User denied permission or service not allowed
          showTemporaryMessage("Microphone access denied. Please allow microphone access in your browser settings.", "error");
          stopListening();
          break;
          
        case "aborted":
          // Recognition was aborted - can be normal during reset
          if (state.isListening && !state.recognitionRestartAttempts) {
            setTimeout(() => {
              if (state.isListening) {
                try { recognition.start(); } catch(e) { /* suppress */ }
              }
            }, config.speech.errorResetDelay);
          }
          break;
          
        case "network":
          // Network error - could retry with exponential backoff
          showTemporaryMessage("Network error occurred. Check your connection.", "error");
          if (state.isListening) {
            const backoffDelay = Math.min(1000 * Math.pow(2, state.recognitionRestartAttempts), 10000);
            setTimeout(() => {
              if (state.isListening) {
                try { recognition.start(); } catch(e) { /* suppress */ }
              }
            }, backoffDelay);
            state.recognitionRestartAttempts++;
          }
          break;
          
        case "language-not-supported":
          // Language not supported - fall back to English
          showTemporaryMessage(`Language ${supportedLanguages[state.currentLanguageIndex].name} is not supported, falling back to English.`, "warning");
          state.currentLanguageIndex = 0; // English
          if (state.isListening) {
            stopListening();
            setTimeout(() => startListening(), 500);
          }
          break;
          
        default:
          // Handle other errors
          if (state.isListening) {
            setTimeout(() => {
              if (state.isListening) {
                try { recognition.start(); } catch(e) { /* suppress */ }
              }
            }, config.speech.errorResetDelay);
          }
      }
    };
    
    // Handle end of recognition
    recognition.onend = () => {
      debugLog("Speech recognition ended");
      state.isTranscribing = false;
      
      // Clear continuous timer
      if (state.continuousTimer) {
        clearTimeout(state.continuousTimer);
        state.continuousTimer = null;
      }
      
      // Always restart if we're still supposed to be listening - no timeout
      if (state.isListening) {
        try {
          state.recognitionRestartAttempts++;
          
          // If in error recovery mode, wait a bit longer
          const restartDelay = state.errorRecoveryMode ? 
            config.speech.errorResetDelay : 
            50;
          
          // If too many restart attempts in short succession, reinitialize
          if (state.recognitionRestartAttempts > 3) {
            debugLog("Too many restart attempts, reinitializing recognition");
            setTimeout(() => {
              if (state.isListening) {
                startListening();
              }
            }, restartDelay);
            return;
          }
          
          // Restart with appropriate delay
          setTimeout(() => {
            if (state.isListening) {
              try {
                recognition.start();
                // Reset error recovery after successful restart
                state.errorRecoveryMode = false;
              } catch (e) {
                debugLog("Could not restart recognition:", e);
                
                // Start a completely fresh session on failure
                startListening();
              }
            }
          }, restartDelay);
        } catch (e) {
          debugLog("Could not restart recognition:", e);
          
          // Start a completely fresh session on failure after a short delay
          setTimeout(() => {
            if (state.isListening) {
              startListening();
            }
          }, 300);
        }
      } else {
        // If not listening anymore, update visual indicators
        if (document.querySelector('.recognition-indicator')) {
          document.querySelector('.indicator-dot').classList.remove('active');
          document.querySelector('.indicator-text').textContent = 'Ready to detect speech';
        }
      }
    };
    
    // This is the key event for real-time transcription
    recognition.onresult = (event) => {
      // Reset restart attempts counter since we're successfully getting results
      state.recognitionRestartAttempts = 0;
      state.errorRecoveryMode = false;
      
      // Update speech activity state
      state.lastSpeechTime = Date.now();
      updateSpeechActivity(true);
      
      // Process speech results
      processRecognitionResults(event);
      
      // Start inactivity timer
      if (state.inactivityTimer) {
        clearTimeout(state.inactivityTimer);
      }
      
      state.inactivityTimer = setTimeout(() => {
        updateSpeechActivity(false);
        
        // If we have pending interim text when speech appears complete,
        // consider it as final and append to the session transcript
        if (state.interimText && config.speech.keepFullTranscript) {
          if (state.sessionTranscript && !state.sessionTranscript.endsWith(' ')) {
            state.sessionTranscript += ' ';
          }
          state.sessionTranscript += state.interimText;
          state.interimText = '';
          
          // Update display with full session transcript 
          updateTranscriptText(state.sessionTranscript, true);
          
          // Send for translation
          sendForTranslation(state.sessionTranscript);
        }
      }, config.speech.maxInactivityTime);
    };
  }

  // Update transcript text with progressive display - word by word animation
  function updateTranscriptText(text, isFinal, langCode = null) {
    const langClass = langCode ? `lang-${langCode}` : `lang-${supportedLanguages[state.currentLanguageIndex].shortCode}`;
    
    // Always update text immediately with appropriate class
    originalTextElement.className = `text-content ${langClass} ${isFinal ? 'final' : 'interim'}`;
    
    // Check if we should animate the text (only animate new text portions)
    const shouldAnimate = text !== originalTextElement.textContent && !text.startsWith(originalTextElement.textContent);
    
    if (shouldAnimate) {
      // Create a processing indicator if it doesn't exist
      let processingIndicator = document.querySelector('.processing-indicator');
      if (!processingIndicator) {
        processingIndicator = document.createElement('div');
        processingIndicator.className = 'processing-indicator';
        processingIndicator.innerHTML = 'Processing<div class="processing-dots"><span class="processing-dot"></span><span class="processing-dot"></span><span class="processing-dot"></span></div>';
        originalTextElement.parentNode.appendChild(processingIndicator);
      }
      
      // Show the indicator briefly
      processingIndicator.classList.add('visible');
      setTimeout(() => processingIndicator.classList.remove('visible'), 1500);
      
      // Split existing content and new text to determine what's new
      const existingContent = originalTextElement.textContent;
      const existingWords = existingContent.trim().split(/\s+/);
      const newWords = text.trim().split(/\s+/);
      
      // Only animate words that are new
      let startAnimateIndex = 0;
      
      // If we have existing content and are keeping full transcript
      if (config.speech.keepFullTranscript && existingContent) {
        startAnimateIndex = existingWords.length;
        
        // Handle special case where we append to existing content
        if (startAnimateIndex > 0 && newWords.length > startAnimateIndex) {
          // Create a container for all words
          const container = document.createElement('div');
          
          // Add existing words without animation
          for (let i = 0; i < startAnimateIndex; i++) {
            const wordSpan = document.createElement('span');
            wordSpan.textContent = existingWords[i] + ' ';
            container.appendChild(wordSpan);
          }
          
          // Add new words with animation
          for (let i = startAnimateIndex; i < newWords.length; i++) {
            const wordSpan = document.createElement('span');
            wordSpan.className = 'word';
            wordSpan.textContent = newWords[i] + ' ';
            wordSpan.style.animationDelay = `${(i - startAnimateIndex) * 0.05}s`;
            container.appendChild(wordSpan);
          }
          
          // Replace content
          originalTextElement.innerHTML = '';
          originalTextElement.appendChild(container);
          return;
        }
      }
      
      // If not appending or not using full transcript, animate the whole thing
      const container = document.createElement('div');
      
      newWords.forEach((word, index) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        wordSpan.textContent = word + ' ';
        wordSpan.style.animationDelay = `${index * 0.05}s`;
        container.appendChild(wordSpan);
      });
      
      // Replace content
      originalTextElement.innerHTML = '';
      originalTextElement.appendChild(container);
    } else {
      // For non-animated updates (like minor corrections)
      originalTextElement.textContent = text;
    }
    
    // Save recognized text
    state.recognizedText = text;
  }

  // Update translation text with better visual feedback
  function updateTranslation(text, isAppend = false) {
    // Remove any temporary translation indicators
    const indicators = translatedTextElement.querySelectorAll('.translation-indicator');
    indicators.forEach(el => el.remove());
    
    // Skip empty translations
    if (!text || text.trim() === '') {
      return;
    }
    
    if (isAppend && translatedTextElement.textContent && 
        translatedTextElement.textContent !== "Translating...") {
      // For incremental translations, append rather than replace
      const currentText = translatedTextElement.textContent;
      
      // More sophisticated check to prevent duplications:
      // 1. Exact match check
      if (currentText === text) {
        return;
      }
      
      // 2. Check if this text is already at the end of the current translation
      // This prevents common duplication scenarios
      const lastSentenceInCurrent = currentText.split(/[.!?]\s+/).pop() || '';
      const firstSentenceInNew = text.split(/[.!?]\s+/)[0] || '';
      
      // If the new text starts with the end of the current text, only add what's new
      if (lastSentenceInCurrent.trim() && 
          firstSentenceInNew.trim() && 
          firstSentenceInNew.includes(lastSentenceInCurrent)) {
        // Extract only the truly new part
        const overlapIndex = text.indexOf(lastSentenceInCurrent);
        if (overlapIndex === 0) {
          // The new text starts with the last sentence of current text
          // Only add what comes after that last sentence
          const newPortion = text.substring(lastSentenceInCurrent.length);
          if (newPortion.trim()) {
            // Only proceed if we have actual new content
            const needsSpace = !currentText.endsWith(' ') && !newPortion.startsWith(' ');
            const combinedText = currentText + (needsSpace ? ' ' : '') + newPortion;
            translatedTextElement.textContent = combinedText;
          }
          return;
        }
      }
      
      // If we reach here, we're adding new content with no obvious overlap
      // Add a space if needed
      const needsSpace = !currentText.endsWith(' ') && !text.startsWith(' ');
      const newText = currentText + (needsSpace ? ' ' : '') + text;
      
      // Create animation for the new content only
      const container = document.createElement('div');
      const existingSpan = document.createElement('span');
      existingSpan.textContent = currentText + (needsSpace ? ' ' : '');
      container.appendChild(existingSpan);
      
      // Create spans for each word in the new content for animation
      const newWords = text.split(/\s+/);
      newWords.forEach((word, index) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        wordSpan.textContent = word + ' ';
        wordSpan.style.animationDelay = `${index * 0.03}s`;
        container.appendChild(wordSpan);
      });
      
      translatedTextElement.innerHTML = '';
      translatedTextElement.appendChild(container);
    } else {
      // If the text is identical, don't re-animate
      if (translatedTextElement.textContent === text) {
        return;
      }
      
      translatedTextElement.className = "text-content lang-de final";
      
      // Split the translation into words for animation
      const words = text.split(/\s+/);
      const container = document.createElement('div');
      
      words.forEach((word, index) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        wordSpan.textContent = word + ' ';
        wordSpan.style.animationDelay = `${index * 0.03}s`; // Slightly faster than transcription
        container.appendChild(wordSpan);
      });
      
      translatedTextElement.innerHTML = '';
      translatedTextElement.appendChild(container);
    }
    
    state.pendingTranslation = false;
  }

  // Improved debounced function to send text for translation with minimal delay
  function sendForTranslation(text, isIncremental = false) {
    // Don't translate empty text
    if (!text || text.trim() === '') {
      return;
    }
    
    // Cancel any pending translation request
    if (state.translateTimer) {
      clearTimeout(state.translateTimer);
    }
    
    // If this is the same text we already translated, skip
    if (text === state.lastTranslationText && !isIncremental) {
      return;
    }
    
    if (!isIncremental) {
      state.lastTranslationText = text;
    }
    
    state.pendingTranslation = true;
    
    // If not already showing "Translating...", show a small indicator
    if (!isIncremental || translatedTextElement.textContent === "") {
      translatedTextElement.className = "text-content lang-de processing";
      if (translatedTextElement.textContent === "") {
        translatedTextElement.textContent = "Translating...";
      } else {
        // Add a small indicator at the end of existing translation
        const indicator = document.createElement('span');
        indicator.className = 'translation-indicator';
        indicator.textContent = ' ...';
        translatedTextElement.appendChild(indicator);
      }
    }
    
    // Send translation request with minimal debounce
    state.translateTimer = setTimeout(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            action: "translate_text",
            text: text,
            source_language: supportedLanguages[state.currentLanguageIndex].shortCode,
            target_language: "de", // Always German
            is_incremental: isIncremental
          })
        );
      } else {
        translatedTextElement.textContent = "Translation service unavailable";
        state.pendingTranslation = false;
      }
    }, config.translation.debounceDelay);
  }

  // ==================== UI FUNCTIONS ====================

  function updateUI(listening) {
    state.isListening = listening;

    if (listening) {
      micButton.classList.add("active");
      pulseRing.classList.add("active");
      statusText.textContent = "Listening...";
      statusText.className = "processing";
      updateSpeechIndicators(true);
    } else {
      micButton.classList.remove("active");
      pulseRing.classList.remove("active");
      statusText.textContent = "Click the mic button to start recording...";
      statusText.className = "";
      updateSpeechIndicators(false);
    }
  }

  function showTemporaryMessage(message, type = "info", autoHide = false) {
    statusText.className = type;
    statusText.textContent = message;

    // Only use timeout for non-error messages or messages marked for auto-hide
    if ((type !== "error" && !state.isListening) || autoHide) {
      setTimeout(() => {
        if (state.isListening) {
          statusText.textContent = "Listening...";
          statusText.className = "processing";
        } else {
          statusText.textContent = "Click the mic button to start recording...";
          statusText.className = "";
        }
      }, 3000);
    }
  }

  function stopListening() {
    // Clear any pending timers
    if (state.inactivityTimer) {
      clearTimeout(state.inactivityTimer);
      state.inactivityTimer = null;
    }
    
    if (state.continuousTimer) {
      clearTimeout(state.continuousTimer);
      state.continuousTimer = null;
    }
    
    state.isListening = false;
    state.activeSpeechDetected = false;
    state.errorRecoveryMode = false;
    
    // Stop speech recognition
    if (recognition) {
      try {
        recognition.abort();
      } catch (e) {
        console.error("Error stopping recognition:", e);
      }
    }
    
    updateUI(false);
    
    // If we have any pending interim text when stopping, append it to session transcript
    if (state.interimText && config.speech.keepFullTranscript) {
      if (state.sessionTranscript && !state.sessionTranscript.endsWith(' ') && !state.interimText.startsWith(' ')) {
        state.sessionTranscript += ' ';
      }
      state.sessionTranscript += state.interimText;
      state.interimText = '';
      
      // Update the final text display
      updateTranscriptText(state.sessionTranscript, true);
      state.recognizedText = state.sessionTranscript;
    }
    
    // Send final session transcript for translation if needed
    if (state.recognizedText && !state.finalTranscriptSent) {
      sendForTranslation(state.recognizedText);
      state.finalTranscriptSent = true;
    }
    
    // Update visual indicators
    updateSpeechIndicators(false);
  }

  function saveTranscript() {
    const originalText = originalTextElement.textContent || "";
    const translatedText = translatedTextElement.textContent || "";

    if (!originalText && !translatedText) {
      showTemporaryMessage("No transcript to save", "error");
      return;
    }

    const originalLang = supportedLanguages[state.currentLanguageIndex].name;
    const content = `${originalLang}: ${originalText}\n\nGerman: ${translatedText}`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showTemporaryMessage("Transcript saved", "info");
  }

  // Update visual indicators in the UI - add this function
  function updateSpeechIndicators(isActive) {
    const waveContainer = document.querySelector('.wave-container');
    if (waveContainer) {
      if (isActive) {
        waveContainer.classList.remove('hidden');
      } else {
        waveContainer.classList.add('hidden');
      }
    }
    
    const indicatorDot = document.querySelector('.indicator-dot');
    const indicatorText = document.querySelector('.indicator-text');
    
    if (indicatorDot && indicatorText) {
      if (isActive) {
        indicatorDot.classList.add('active');
        indicatorText.textContent = 'Listening...';
      } else {
        indicatorDot.classList.remove('active');
        indicatorText.textContent = 'Ready to detect speech';
      }
    }
  }
  
  // New function to provide more detailed visual feedback during transcription
  function updateSpeechActivity(isActive) {
    state.activeSpeechDetected = isActive;
    
    // Update visual indicators for active speech
    const originalTextContainer = document.querySelector('.original');
    if (originalTextContainer) {
      if (isActive) {
        originalTextContainer.classList.add('speech-active');
        if (document.querySelector('.recognition-indicator')) {
          document.querySelector('.indicator-dot').classList.add('pulsing');
        }
        
        // Add audio wave animation if it exists
        const waveContainer = document.querySelector('.wave-container');
        if (waveContainer) {
          waveContainer.classList.remove('hidden');
        }
      } else {
        originalTextContainer.classList.remove('speech-active');
        if (document.querySelector('.recognition-indicator')) {
          document.querySelector('.indicator-dot').classList.remove('pulsing');
        }
        
        // Hide audio wave animation when not speaking
        const waveContainer = document.querySelector('.wave-container');
        if (waveContainer) {
          waveContainer.classList.add('hidden');
        }
      }
    }
  }
});
