// ==========================================================================
// GUESS THE CHARACTER - FRONTEND LOGIC
// ==========================================================================

const App = (() => {
    // App state
    let roomId = null;
    let pin = null;
    let playerId = null;
    let playerName = "";
    let isHost = false;
    let gameState = "lobby"; // lobby, setup, playing, finished
    let players = {};
    let theme = "";
    let assignmentMode = "random"; // random, curated
    let flippingMode = "tilt"; // tilt, list
    let selectedCharacter = null; // { name, image }
    
    // Polling and sensor state
    let pollInterval = null;
    let isConnected = true;
    let deviceOrientationActive = false;
    let manualOverrideActive = false;
    let currentGameplayView = "back"; // default to "back" (options view)
    let countdownInterval = null;

    // DOM Elements Cache
    const el = {
        screens: {
            welcome: document.getElementById("screen-welcome"),
            lobby: document.getElementById("screen-lobby"),
            setup: document.getElementById("screen-setup"),
            gameplay: document.getElementById("screen-gameplay"),
            results: document.getElementById("screen-results")
        },
        // Welcome screen
        playerNameInput: document.getElementById("player-name-input"),
        btnCreateRoom: document.getElementById("btn-create-room"),
        btnShowJoin: document.getElementById("btn-show-join"),
        welcomeMainActions: document.getElementById("welcome-main-actions"),
        welcomeJoinFields: document.getElementById("welcome-join-fields"),
        btnCancelJoin: document.getElementById("btn-cancel-join"),
        btnConnect: document.getElementById("btn-connect"),
        joinRoomId: document.getElementById("join-room-id"),
        joinPin: document.getElementById("join-pin"),
        
        // Lobby screen
        lobbyRoomCode: document.getElementById("lobby-room-code"),
        lobbyPin: document.getElementById("lobby-pin"),
        btnShowQr: document.getElementById("btn-show-qr"),
        qrModal: document.getElementById("qr-modal"),
        btnCloseQrModal: document.getElementById("btn-close-qr-modal"),
        modalQrImage: document.getElementById("modal-qr-image"),
        modalQrFallback: document.getElementById("modal-qr-fallback"),
        modalQrUrl: document.getElementById("modal-qr-url"),
        modalRoomCode: document.getElementById("modal-room-code"),
        modalPin: document.getElementById("modal-pin"),
        hostSettings: document.getElementById("host-settings"),
        btnModeRandom: document.getElementById("btn-mode-random"),
        btnModeCurated: document.getElementById("btn-mode-curated"),
        modeDesc: document.getElementById("mode-desc"),
        themeInput: document.getElementById("theme-input"),
        btnStartGame: document.getElementById("btn-start-game"),
        btnJoinInstead: document.getElementById("btn-join-instead"),
        btnEndRoom: document.getElementById("btn-end-room"),
        playerWaiting: document.getElementById("player-waiting"),
        playerCount: document.getElementById("player-count"),
        lobbyPlayerList: document.getElementById("lobby-player-list"),
        
        // Setup screen
        setupThemeDisplay: document.getElementById("setup-theme-display"),
        setupInstructionDesc: document.getElementById("setup-instruction-desc"),
        curatedTargetContainer: document.getElementById("curated-target-container"),
        selectTargetPlayer: document.getElementById("select-target-player"),
        characterSearchInput: document.getElementById("character-search-input"),
        btnSearchCharacter: document.getElementById("btn-search-character"),
        searchResultsContainer: document.getElementById("search-results-container"),
        btnToggleCustomImage: document.getElementById("btn-toggle-custom-image"),
        customImageInputs: document.getElementById("custom-image-inputs"),
        customCharName: document.getElementById("custom-char-name"),
        customCharUrl: document.getElementById("custom-char-url"),
        btnSubmitCustom: document.getElementById("btn-submit-custom"),
        selectedCharacterPreview: document.getElementById("selected-character-preview"),
        previewImage: document.getElementById("preview-image"),
        previewName: document.getElementById("preview-name"),
        btnSubmitCharacter: document.getElementById("btn-submit-character"),
        setupWaitingOverlay: document.getElementById("setup-waiting-overlay"),
        submittedCount: document.getElementById("submitted-count"),
        submittedPlayersUl: document.getElementById("submitted-players-ul"),
        
        // Gameplay screen
        viewTiltedAway: document.getElementById("view-tilted-away"),
        viewTiltedBack: document.getElementById("view-tilted-back"),
        gameplayTheme: document.getElementById("gameplay-theme"),
        gameplayCharacterImage: document.getElementById("gameplay-character-image"),
        gameplayCharacterName: document.getElementById("gameplay-character-name"),
        gameplayPlayerName: document.getElementById("gameplay-player-name"),
        btnGuessedCorrectly: document.getElementById("btn-guessed-correctly"),
        btnGiveUp: document.getElementById("btn-give-up"),
        btnQuit: document.getElementById("btn-quit"),
        btnManualTiltToggle: document.getElementById("btn-manual-tilt-toggle"),
        phoneIconAnimation: document.getElementById("phone-icon-animation"),
        successOverlay: document.getElementById("success-overlay"),
        successCharacterImage: document.getElementById("success-character-image"),
        successCharacterName: document.getElementById("success-character-name"),
        
        // Results screen
        resultsThemeDisplay: document.getElementById("results-theme-display"),
        resultsList: document.getElementById("results-list"),
        hostResultsControls: document.getElementById("host-results-controls"),
        btnNewGame: document.getElementById("btn-new-game"),
        btnEndRoomResults: document.getElementById("btn-end-room-results"),
        playerResultsWaiting: document.getElementById("player-results-waiting")
    };

    // ==========================================================================
    // API COMMUNICATION HELPER
    // ==========================================================================
    async function apiCall(endpoint, data = {}) {
        const origin = window.location.origin;
        // Fallback for local testing if running via file protocol (unlikely in real play but good for dev)
        const baseUrl = origin.startsWith("file") ? "http://localhost:8000" : origin;
        
        try {
            const response = await fetch(`${baseUrl}/api/${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomId, playerId, ...data })
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP error ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`API Call failed (${endpoint}):`, error);
            throw error;
        }
    }

    // ==========================================================================
    // NAVIGATION
    // ==========================================================================
    function showScreen(screenId) {
        Object.keys(el.screens).forEach(id => {
            if (id === screenId) {
                el.screens[id].classList.add("active");
            } else {
                el.screens[id].classList.remove("active");
            }
        });
    }

    // ==========================================================================
    // INITIALIZATION & URL HANDLING
    // ==========================================================================
    function init() {
        setupEventListeners();
        
        // Restore stored player name if available
        const storedPlayerName = sessionStorage.getItem("playerName");
        if (storedPlayerName) {
            el.playerNameInput.value = storedPlayerName;
        }
        
        // If coming back from endRoomAndJoin, show the join inputs immediately
        if (sessionStorage.getItem("showJoin") === "true") {
            sessionStorage.removeItem("showJoin");
            el.welcomeMainActions.style.display = "none";
            el.welcomeJoinFields.style.display = "block";
        }

        // Parse room query parameters to auto-populate Join form (from QR code scan)
        const urlParams = new URLSearchParams(window.location.search);
        const joinRoom = urlParams.get("room");
        const joinPinVal = urlParams.get("pin");
        
        if (joinRoom && joinPinVal) {
            el.joinRoomId.value = joinRoom;
            el.joinPin.value = joinPinVal;
            el.welcomeMainActions.style.display = "none";
            el.welcomeJoinFields.style.display = "block";
        }
        
        // Restore local storage if player refreshed during play
        const storedRoomId = sessionStorage.getItem("roomId");
        const storedPlayerId = sessionStorage.getItem("playerId");
        
        if (storedRoomId && storedPlayerId && storedPlayerName) {
            roomId = storedRoomId;
            playerId = storedPlayerId;
            playerName = storedPlayerName;
            
            setConnectedState(true);

            // Resume polling
            startPolling();
        }

        // Handle page visibility change (wake up polling)
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                if (roomId && playerId) {
                    poll();
                    startPolling();
                }
            }
        });
    }

    // ==========================================================================
    // EVENT LISTENERS
    // ==========================================================================
    function setupEventListeners() {
        // Welcome Screen
        el.btnCreateRoom.addEventListener("click", () => {
            AudioEffects.playClick();
            createRoom();
        });
        
        el.btnShowJoin.addEventListener("click", () => {
            AudioEffects.playClick();
            el.welcomeMainActions.style.display = "none";
            el.welcomeJoinFields.style.display = "block";
        });
        
        el.btnCancelJoin.addEventListener("click", () => {
            AudioEffects.playClick();
            el.welcomeMainActions.style.display = "block";
            el.welcomeJoinFields.style.display = "none";
        });
        
        el.btnConnect.addEventListener("click", () => {
            AudioEffects.playClick();
            joinRoom();
        });

        // Lobby Screen
        el.btnModeRandom.addEventListener("click", () => {
            AudioEffects.playClick();
            updateSettings("random");
        });
        
        el.btnModeCurated.addEventListener("click", () => {
            AudioEffects.playClick();
            updateSettings("curated");
        });
        
        el.btnShowQr.addEventListener("click", () => {
            AudioEffects.playClick();
            el.qrModal.style.display = "flex";
        });
        
        el.btnCloseQrModal.addEventListener("click", () => {
            AudioEffects.playClick();
            el.qrModal.style.display = "none";
        });
        
        el.btnStartGame.addEventListener("click", () => {
            AudioEffects.playClick();
            startGame();
        });

        el.btnJoinInstead.addEventListener("click", () => {
            AudioEffects.playClick();
            endRoomAndJoin();
        });

        el.btnEndRoom.addEventListener("click", () => {
            AudioEffects.playClick();
            endRoom();
        });

        // Setup Screen
        el.btnSearchCharacter.addEventListener("click", () => {
            AudioEffects.playClick();
            searchCharacters();
        });
        
        el.characterSearchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                AudioEffects.playClick();
                searchCharacters();
            }
        });
        
        el.btnToggleCustomImage.addEventListener("click", () => {
            AudioEffects.playClick();
            el.customImageInputs.classList.toggle("active");
        });
        
        el.btnSubmitCustom.addEventListener("click", () => {
            AudioEffects.playClick();
            submitCustomCharacter();
        });
        
        el.btnSubmitCharacter.addEventListener("click", () => {
            AudioEffects.playClick();
            submitCharacterSelection();
        });

        // Gameplay Screen
        el.btnGuessedCorrectly.addEventListener("click", () => {
            AudioEffects.playCorrect();
            updatePlayStatus("guessed");
        });
        
        el.btnGiveUp.addEventListener("click", () => {
            AudioEffects.playFailure();
            updatePlayStatus("gave_up");
        });
        
        el.btnQuit.addEventListener("click", () => {
            AudioEffects.playQuit();
            updatePlayStatus("quit");
        });
        
        el.btnManualTiltToggle.addEventListener("click", () => {
            AudioEffects.playClick();
            manualOverrideActive = !manualOverrideActive;
            
            // If they toggled, switch view manually
            const nextView = currentGameplayView === "away" ? "back" : "away";
            setGameplayView(nextView);
        });

        el.phoneIconAnimation.addEventListener("click", () => {
            AudioEffects.playClick();
            manualOverrideActive = !manualOverrideActive;
            
            // If they toggled, switch view manually
            const nextView = currentGameplayView === "away" ? "back" : "away";
            setGameplayView(nextView);
        });

        el.viewTiltedAway.addEventListener("click", () => {
            if (currentGameplayView === "away") {
                AudioEffects.playClick();
                manualOverrideActive = true;
                setGameplayView("back");
            }
        });

        // Results Screen
        el.btnNewGame.addEventListener("click", () => {
            AudioEffects.playClick();
            resetGame();
        });

        el.btnEndRoomResults.addEventListener("click", () => {
            AudioEffects.playClick();
            endRoom();
        });

        // Bind guest leave buttons (lobby, setup, gameplay)
        const bindLeaveButton = (id) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener("click", () => {
                    AudioEffects.playClick();
                    leaveRoom();
                });
            }
        };
        bindLeaveButton("btn-leave-lobby");
        bindLeaveButton("btn-leave-setup");
        
        // Setup screen host controls
        const btnResetSetup = document.getElementById("btn-reset-setup");
        if (btnResetSetup) {
            btnResetSetup.addEventListener("click", () => {
                AudioEffects.playClick();
                resetGame();
            });
        }
        const btnEndSetup = document.getElementById("btn-end-setup");
        if (btnEndSetup) {
            btnEndSetup.addEventListener("click", () => {
                AudioEffects.playClick();
                endRoom();
            });
        }

        // Bind reset / end / leave buttons by query selector for dynamic classes (e.g. inside overlays)
        document.querySelectorAll(".btn-reset-to-lobby").forEach(btn => {
            btn.addEventListener("click", () => {
                AudioEffects.playClick();
                resetGame();
            });
        });
        document.querySelectorAll(".btn-end-room-action").forEach(btn => {
            btn.addEventListener("click", () => {
                AudioEffects.playClick();
                endRoom();
            });
        });
        document.querySelectorAll(".btn-leave-room-action").forEach(btn => {
            btn.addEventListener("click", () => {
                AudioEffects.playClick();
                leaveRoom();
            });
        });

        // Bind reconnect button click
        const btnReconnect = document.getElementById("btn-reconnect");
        if (btnReconnect) {
            btnReconnect.addEventListener("click", async () => {
                AudioEffects.playClick();
                btnReconnect.innerHTML = `<span class="reconnect-icon spinner-small">🔄</span> Connecting...`;
                try {
                    const data = await apiCall("poll");
                    renderRoomState(data);
                    setConnectedState(true);
                    startPolling();
                } catch (err) {
                    setConnectedState(false);
                    alert("Failed to reconnect: " + err.message);
                }
            });
        }
        // Bind Screen Display settings mode buttons
        const btnFlipTilt = document.getElementById("btn-flip-tilt");
        const btnFlipList = document.getElementById("btn-flip-list");
        if (btnFlipTilt && btnFlipList) {
            btnFlipTilt.addEventListener("click", () => {
                AudioEffects.playClick();
                updateSettings(assignmentMode, "tilt");
            });
            btnFlipList.addEventListener("click", () => {
                AudioEffects.playClick();
                updateSettings(assignmentMode, "list");
            });
        }

        // Bind swipe gesture events on the gameplay reveal modal
        const swipeModal = document.getElementById("gameplay-reveal-modal");
        if (swipeModal) {
            swipeModal.addEventListener("touchstart", (e) => {
                touchStartX = e.changedTouches[0].screenX;
                touchStartY = e.changedTouches[0].screenY;
            });

            swipeModal.addEventListener("touchend", (e) => {
                touchEndX = e.changedTouches[0].screenX;
                touchEndY = e.changedTouches[0].screenY;
                handleSwipeGesture();
            });

            swipeModal.addEventListener("click", () => {
                AudioEffects.playClick();
                closeRevealModal();
            });
        }

        const modalImage = document.getElementById("reveal-modal-image");
        if (modalImage) {
            modalImage.addEventListener("click", (e) => {
                e.stopPropagation();
                AudioEffects.playClick();
                closeRevealModal();
            });
        }
    }

    // ==========================================================================
    // GAME CORE ACTIONS
    // ==========================================================================
    
    // Create Room
    async function createRoom() {
        const nameVal = el.playerNameInput.value.trim();
        if (!nameVal) {
            alert("Please enter your name first!");
            return;
        }
        
        try {
            const data = await apiCall("create", { playerName: nameVal });
            roomId = data.roomId;
            pin = data.pin;
            playerId = data.playerId;
            playerName = data.playerName;
            isHost = true;
            
            sessionStorage.setItem("roomId", roomId);
            sessionStorage.setItem("playerId", playerId);
            sessionStorage.setItem("playerName", playerName);
            
            // Set host settings layout visibility
            el.hostSettings.style.display = "block";
            el.playerWaiting.style.display = "none";
            
            startPolling();
        } catch (err) {
            alert("Error creating room: " + err.message);
        }
    }

    // Join Room
    async function joinRoom() {
        const nameVal = el.playerNameInput.value.trim();
        const codeVal = el.joinRoomId.value.trim();
        const pinVal = el.joinPin.value.trim();
        
        if (!nameVal) {
            alert("Please enter your name first!");
            return;
        }
        if (!codeVal || !pinVal) {
            alert("Please enter the Room Code and PIN!");
            return;
        }
        
        try {
            const data = await apiCall("join", { 
                roomId: codeVal, 
                pin: pinVal, 
                playerName: nameVal 
            });
            roomId = data.roomId;
            playerId = data.playerId;
            playerName = data.playerName;
            isHost = false;
            
            sessionStorage.setItem("roomId", roomId);
            sessionStorage.setItem("playerId", playerId);
            sessionStorage.setItem("playerName", playerName);
            
            // Set player waiting state layout
            el.hostSettings.style.display = "none";
            el.playerWaiting.style.display = "block";
            
            startPolling();
        } catch (err) {
            alert("Error joining room: " + err.message);
        }
    }

    // Update settings (Host only)
    async function updateSettings(mode, flipMode) {
        if (!isHost) return;
        try {
            const data = await apiCall("update_settings", { 
                assignmentMode: mode || assignmentMode,
                flippingMode: flipMode || flippingMode
            });
            renderRoomState(data);
        } catch (err) {
            alert(err.message);
        }
    }

    // Start Game (Host only)
    async function startGame() {
        if (!isHost) return;
        const themeVal = el.themeInput.value.trim() || "Any Character";
        try {
            await apiCall("start_game", { 
                theme: themeVal
            });
            AudioEffects.playStart();
        } catch (err) {
            alert(err.message);
        }
    }

    // Reset Game (Host only)
    async function resetGame() {
        if (!isHost) return;
        try {
            await apiCall("reset_game");
        } catch (err) {
            alert(err.message);
        }
    }

    // End Room (Host only)
    async function endRoom() {
        if (!isHost) return;
        if (!confirm("Are you sure you want to end this room? All players will be disconnected.")) {
            return;
        }
        
        try {
            await apiCall("end_room");
            // Clear local session storage
            sessionStorage.clear();
            stopPolling();
            // Reload back to landing page
            location.reload();
        } catch (err) {
            alert("Failed to end room: " + err.message);
        }
    }

    // End Room & Join instead (Host only)
    async function endRoomAndJoin() {
        if (!isHost) return;
        if (!confirm("Are you sure you want to end this room and join another instead?")) {
            return;
        }
        
        try {
            await apiCall("end_room");
            // Clear local room/player data but preserve player name and set join flag
            sessionStorage.removeItem("roomId");
            sessionStorage.removeItem("playerId");
            sessionStorage.setItem("showJoin", "true");
            stopPolling();
            // Reload back to landing page
            location.reload();
        } catch (err) {
            alert("Failed to end room: " + err.message);
        }
    }

    // Leave Room (Guest only)
    async function leaveRoom() {
        if (isHost) return;
        if (!confirm("Are you sure you want to leave this room?")) {
            return;
        }
        
        try {
            await apiCall("leave_room");
            // Clear local session storage
            sessionStorage.clear();
            stopPolling();
            // Reload back to landing page
            location.reload();
        } catch (err) {
            alert("Failed to leave room: " + err.message);
        }
    }

    // Submit Character selection
    async function submitCharacterSelection() {
        if (!selectedCharacter) {
            alert("Please select a character first!");
            return;
        }
        
        const payload = {
            characterName: selectedCharacter.name,
            characterImage: selectedCharacter.image
        };
        
        if (assignmentMode === "curated") {
            const targetId = el.selectTargetPlayer.value;
            if (!targetId) {
                alert("Please select a player to assign this character to!");
                return;
            }
            payload.targetPlayerId = targetId;
        }
        
        try {
            // Show waiting screen instantly
            el.setupWaitingOverlay.style.display = "flex";
            await apiCall("submit_character", payload);
        } catch (err) {
            el.setupWaitingOverlay.style.display = "none";
            alert("Submission failed: " + err.message);
        }
    }

    // Submit manually entered image/name
    function submitCustomCharacter() {
        const name = el.customCharName.value.trim();
        let url = el.customCharUrl.value.trim();
        
        if (!name) {
            alert("Please enter a character name!");
            return;
        }
        
        // Provide standard avatar if image url is omitted
        if (!url) {
            url = `https://robohash.org/${encodeURIComponent(name)}?set=set4`; // cute cat avatar fallback
        }
        
        selectedCharacter = { name, image: url };
        
        // Update preview
        el.previewImage.src = url;
        el.previewName.textContent = name;
        el.selectedCharacterPreview.style.display = "block";
        
        // Collapse custom area
        el.customImageInputs.classList.remove("active");
    }

    // Update play status (correct, give_up, quit)
    async function updatePlayStatus(status) {
        try {
            await apiCall("update_status", { status });
            if (status === "quit") {
                // Clear session storage so they can play fresh if they want
                sessionStorage.clear();
                stopPolling();
                location.reload();
            } else if (status === "guessed") {
                const myState = players[playerId];
                if (myState) {
                    el.successCharacterImage.src = myState.assignedCharacterImage || "https://robohash.org/unknown?set=set4";
                    el.successCharacterName.textContent = myState.assignedCharacterName || "???";
                    el.successOverlay.style.display = "flex";
                    
                    setTimeout(() => {
                        el.successOverlay.style.display = "none";
                    }, 4000);
                }
            }
        } catch (err) {
            alert(err.message);
        }
    }

    // ==========================================================================
    // POLLING LOBBY STATE
    // ==========================================================================
    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        
        // Poll immediately once
        poll();
        // Poll every 1 second
        pollInterval = setInterval(poll, 1000);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    // Update connected state/visibility of Reconnect button
    function setConnectedState(connected) {
        isConnected = connected;
        const btn = document.getElementById("btn-reconnect");
        if (!btn) return;
        
        if (roomId && playerId) {
            btn.style.display = "flex";
        } else {
            btn.style.display = "none";
            return;
        }

        if (connected) {
            btn.classList.remove("disconnected");
            btn.innerHTML = `<span class="reconnect-icon">🔄</span> Refresh`;
        } else {
            btn.classList.add("disconnected");
            btn.innerHTML = `<span class="reconnect-icon">⚠️</span> Reconnect`;
        }
    }

    async function poll() {
        try {
            const data = await apiCall("poll");
            renderRoomState(data);
            setConnectedState(true);
        } catch (err) {
            // If they got kicked or room closed, clear storage and redirect
            if (err.message.includes("Player not in room") || err.message.includes("Room not found")) {
                stopPolling();
                sessionStorage.clear();
                alert("You are no longer in the room.");
                location.reload();
            } else {
                setConnectedState(false);
            }
        }
    }

    // ==========================================================================
    // STATE RENDERING PIPELINE
    // ==========================================================================
    function renderRoomState(room) {
        setConnectedState(true);
        gameState = room.state;
        theme = room.theme;
        assignmentMode = room.assignmentMode;
        flippingMode = room.flippingMode || "tilt";
        players = room.players;
        
        // Verify host status matches server
        isHost = (room.hostId === playerId);
        el.hostSettings.style.display = isHost ? "block" : "none";
        el.playerWaiting.style.display = isHost ? "none" : "block";
        el.hostResultsControls.style.display = isHost ? "block" : "none";
        el.playerResultsWaiting.style.display = isHost ? "none" : "block";

        // Update host/guest setup controls visibility
        const hostSetup = document.getElementById("host-setup-controls");
        const guestSetup = document.getElementById("guest-setup-controls");
        if (hostSetup) hostSetup.style.display = isHost ? "flex" : "none";
        if (guestSetup) guestSetup.style.display = isHost ? "none" : "block";

        // Update host gameplay active controls visibility
        const hostGameplay = document.getElementById("host-gameplay-active-controls");
        if (hostGameplay) hostGameplay.style.display = isHost ? "flex" : "none";

        // Handle generic class host/guest toggling across other container scopes
        document.querySelectorAll(".host-only").forEach(el => {
            el.style.display = isHost ? "flex" : "none";
        });
        document.querySelectorAll(".guest-only").forEach(el => {
            el.style.display = isHost ? "none" : "block";
        });

        const playerList = Object.values(players);
        
        // Auto close QR Modal if game transitions out of lobby
        if (gameState !== "lobby") {
            el.qrModal.style.display = "none";
        }

        // 1. LOBBY STATE
        if (gameState === "lobby") {
            showScreen("lobby");
            
            // Room info
            el.lobbyRoomCode.textContent = room.roomId;
            el.lobbyPin.textContent = room.pin;
            
            // Reset image display properties in case of error in previous runs
            el.modalQrImage.style.display = "block";
            el.modalQrFallback.style.display = "none";

            // Construct direct join URL using server LAN IP if we are testing on localhost
            let host = window.location.host;
            if ((host.startsWith("localhost") || host.startsWith("127.0.0.1")) && room.serverIp) {
                host = `${room.serverIp}:${window.location.port || 8000}`;
            }
            const joinUrl = `${window.location.protocol}//${host}/?room=${room.roomId}&pin=${room.pin}`;
            
            // Update QR Modal details
            el.modalQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(joinUrl)}`;
            el.modalQrUrl.textContent = joinUrl;
            el.modalRoomCode.textContent = room.roomId;
            el.modalPin.textContent = room.pin;

            // Render active settings for host & players
            if (assignmentMode === "random") {
                el.btnModeRandom.classList.add("active");
                el.btnModeCurated.classList.remove("active");
                el.modeDesc.textContent = "🎲 Players submit any character, and they are assigned randomly among everyone (no one gets their own).";
            } else {
                el.btnModeRandom.classList.remove("active");
                el.btnModeCurated.classList.add("active");
                el.modeDesc.textContent = "🎯 Curated Mode: You choose who you are picking a character for. Direct curated assignments.";
            }

            // Render active flipping mode settings
            const btnFlipTilt = document.getElementById("btn-flip-tilt");
            const btnFlipList = document.getElementById("btn-flip-list");
            const flipDesc = document.getElementById("flip-desc");
            if (btnFlipTilt && btnFlipList && flipDesc) {
                if (flippingMode === "tilt") {
                    btnFlipTilt.classList.add("active");
                    btnFlipList.classList.remove("active");
                    flipDesc.textContent = "📱 Tilt Screen: Tilt screen away to show your character, or tilt back to guess. (Requires gyroscope/HTTPS).";
                } else {
                    btnFlipTilt.classList.remove("active");
                    btnFlipList.classList.add("active");
                    flipDesc.textContent = "📋 No Flipping: A player list will be shown during play. Tap any name to view their character.";
                }
            }

            // Render Player List
            el.playerCount.textContent = playerList.length;
            el.lobbyPlayerList.innerHTML = "";
            
            playerList.forEach(p => {
                const li = document.createElement("li");
                li.className = "player-item";
                
                const isMe = p.id === playerId;
                const isLobbyHost = p.id === room.hostId;
                
                let playerHtml = `
                    <div class="player-item-info">
                        <span class="player-avatar">${isMe ? "😎" : "👤"}</span>
                        <span>${p.name}${isMe ? " (You)" : ""}</span>
                        ${isLobbyHost ? `<span class="host-badge">Host</span>` : ""}
                    </div>
                `;
                
                // Host can kick other players
                if (isHost && !isLobbyHost) {
                    playerHtml += `<button class="btn-kick" data-kick-id="${p.id}">Kick</button>`;
                }
                
                li.innerHTML = playerHtml;
                el.lobbyPlayerList.appendChild(li);
            });

            // Kick action hook
            if (isHost) {
                document.querySelectorAll(".btn-kick").forEach(btn => {
                    btn.onclick = async (e) => {
                        const kickId = e.target.getAttribute("data-kick-id");
                        AudioEffects.playQuit();
                        if (confirm(`Kick ${players[kickId].name} from the room?`)) {
                            try {
                                await apiCall("remove_player", { kickPlayerId: kickId });
                            } catch (err) {
                                alert(err.message);
                            }
                        }
                    };
                });
            }

            // Host start button disable logic
            el.btnStartGame.disabled = playerList.length < 2;
            if (playerList.length < 2) {
                el.btnStartGame.textContent = "Start Game (Need 2+ Players)";
            } else {
                el.btnStartGame.textContent = "Start Game";
            }
            
            // Clean up old screen values
            selectedCharacter = null;
            el.selectedCharacterPreview.style.display = "none";
            el.searchResultsContainer.innerHTML = `<div class="search-placeholder">Type a character name above and click search</div>`;
            el.characterSearchInput.value = "";
            el.setupWaitingOverlay.style.display = "none";
            manualOverrideActive = false;
            deviceOrientationActive = false;
        }

        // 2. SETUP STATE (Selecting character)
        else if (gameState === "setup") {
            showScreen("setup");
            el.setupThemeDisplay.textContent = theme;
            
            const myState = players[playerId];
            
            // Toggle target choice if curated
            if (assignmentMode === "curated") {
                el.curatedTargetContainer.style.display = "block";
                el.setupInstructionDesc.textContent = "Choose an opponent and pick a character they will try to guess.";
                
                // Re-render target select options
                const previousSelect = el.selectTargetPlayer.value;
                el.selectTargetPlayer.innerHTML = "";
                
                // Add a default option
                const defaultOpt = document.createElement("option");
                defaultOpt.value = "";
                defaultOpt.textContent = "-- Select Opponent --";
                el.selectTargetPlayer.appendChild(defaultOpt);
                
                playerList.forEach(p => {
                    const isSelf = p.id === playerId;
                    // Only show players who don't have a character assigned to them yet,
                    // OR if they already have one assigned but it was assigned BY ME.
                    const isAssigned = p.assignedCharacterName !== null;
                    const assignedByMe = playerList.find(x => x.targetPlayerId === p.id && x.id === playerId);
                    
                    if (!isSelf && (!isAssigned || assignedByMe)) {
                        const opt = document.createElement("option");
                        opt.value = p.id;
                        opt.textContent = p.name;
                        el.selectTargetPlayer.appendChild(opt);
                    }
                });
                
                if (previousSelect) el.selectTargetPlayer.value = previousSelect;
            } else {
                el.curatedTargetContainer.style.display = "none";
                el.setupInstructionDesc.textContent = "Search and submit a character. It will be assigned to a random player.";
            }

            // If player submitted character
            if (myState.status === "ready") {
                el.setupWaitingOverlay.style.display = "flex";
                
                // Show submission list status
                const submitted = playerList.filter(p => p.status === "ready");
                el.submittedCount.textContent = `${submitted.length}/${playerList.length}`;
                
                el.submittedPlayersUl.innerHTML = "";
                playerList.forEach(p => {
                    const li = document.createElement("li");
                    const ready = p.status === "ready";
                    li.innerHTML = `
                        <span>${p.name}</span>
                        <span class="${ready ? "status-check" : "status-waiting"}">${ready ? "✓ Ready" : "waiting..."}</span>
                    `;
                    el.submittedPlayersUl.appendChild(li);
                });
            } else {
                el.setupWaitingOverlay.style.display = "none";
            }
        }

        // 3. PLAYING STATE
        else if (gameState === "playing") {
            showScreen("gameplay");
            el.gameplayTheme.textContent = theme;
            
            const myState = players[playerId];
            
            // Character assignment render
            el.gameplayCharacterName.textContent = myState.assignedCharacterName || "???";
            el.gameplayCharacterImage.src = myState.assignedCharacterImage || "https://robohash.org/unknown?set=set4";
            el.gameplayPlayerName.textContent = playerName;

            const isListMode = (flippingMode === "list");
            const hasFinished = (myState.status === "guessed" || myState.status === "gave_up" || myState.status === "quit");

            // Hide/show manual toggle, phone icon tip, and list container based on flipping mode
            const phoneTip = document.querySelector(".phone-tip");
            if (phoneTip) {
                phoneTip.style.display = (isListMode || hasFinished) ? "none" : "block";
            }
            
            const listContainerSection = document.getElementById("gameplay-list-view");
            if (listContainerSection) {
                listContainerSection.style.display = (isListMode && !hasFinished) ? "block" : "none";
            }

            // Start accelerometer orientation listener once
            if (!isListMode) {
                if (!deviceOrientationActive) {
                    requestOrientationSensor();
                }
            } else {
                stopOrientationSensor();
            }

            // Render other players list if in list mode
            if (isListMode && !hasFinished) {
                const listContainer = document.getElementById("gameplay-player-list-container");
                if (listContainer) {
                    listContainer.innerHTML = "";
                    const list = getOtherPlayersList();
                    
                    if (list.length === 0) {
                        listContainer.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">No other players in room.</p>`;
                    } else {
                        list.forEach(p => {
                            const btn = document.createElement("button");
                            btn.className = "btn outline w-100";
                            btn.style.textAlign = "left";
                            btn.style.display = "flex";
                            btn.style.justifyContent = "space-between";
                            btn.style.alignItems = "center";
                            btn.style.marginTop = "8px";
                            btn.innerHTML = `
                                <span>👤 ${p.name}</span>
                                <span style="font-size: 0.8rem; color: var(--accent);">📋 View Character</span>
                            `;
                            btn.addEventListener("click", () => {
                                AudioEffects.playClick();
                                openRevealModal(p.id);
                            });
                            listContainer.appendChild(btn);
                        });
                    }
                }
            }

            // Check if player has already finished guessing
            if (hasFinished) {
                // If they finished, lock them in the Tilted Back view so they can see confirmation / wait for others
                setGameplayView("back");
                // Disable float override button so they don't flip back to showing
                el.btnManualTiltToggle.style.display = "none";
                
                // Show finished layout, hide active controls
                document.getElementById("gameplay-active-controls").style.display = "none";
                document.getElementById("gameplay-finished-controls").style.display = "block";
                
                document.getElementById("gameplay-reveal-name").textContent = myState.assignedCharacterName || "???";
                document.getElementById("gameplay-reveal-image").src = myState.assignedCharacterImage || "https://robohash.org/unknown?set=set4";
                document.getElementById("gameplay-finished-message").textContent = 
                    myState.status === 'guessed' ? '🎉 You guessed correctly!' : '🏳️ You gave up.';
            } else {
                // Reset active controls, hide finished overlay
                document.getElementById("gameplay-active-controls").style.display = "block";
                document.getElementById("gameplay-finished-controls").style.display = "none";
                el.btnManualTiltToggle.style.display = isListMode ? "none" : "block";
            }
        }

        // 4. FINISHED / RESULTS STATE
        else if (gameState === "finished") {
            showScreen("results");
            stopOrientationSensor();
            
            el.resultsThemeDisplay.textContent = `Theme: ${theme}`;
            el.resultsList.innerHTML = "";

            // Rank players:
            // 1. Correct guesses in order of guessOrder
            // 2. Gave up / did not guess
            // 3. Quit
            const guessedList = room.guessOrder.map((id, index) => ({
                rank: index + 1,
                name: players[id].name,
                character: players[id].assignedCharacterName,
                status: "guessed"
            }));

            const finishedIds = new Set(room.guessOrder);
            const others = playerList.filter(p => !finishedIds.has(p.id));
            
            const results = [...guessedList];
            
            others.forEach(p => {
                results.push({
                    rank: null,
                    name: p.name,
                    character: p.assignedCharacterName,
                    status: p.status // gave_up or quit
                });
            });

            results.forEach(res => {
                const li = document.createElement("li");
                li.className = "results-list-item";
                
                let statusBadgeHtml = "";
                if (res.status === "guessed") {
                    statusBadgeHtml = `<span class="results-status-badge guessed">Guessed (${res.rank}${getOrdinal(res.rank)})</span>`;
                } else if (res.status === "gave_up") {
                    statusBadgeHtml = `<span class="results-status-badge gave-up">Gave Up</span>`;
                } else {
                    statusBadgeHtml = `<span class="results-status-badge quit">Quit</span>`;
                }

                li.innerHTML = `
                    <div class="results-player-name">
                        ${res.rank ? `<span class="results-rank">${res.rank}</span>` : ""}
                        <div>
                            <div>${res.name}</div>
                            <div class="results-character-reveal">Was: <strong>${res.character || "???"}</strong></div>
                        </div>
                    </div>
                    ${statusBadgeHtml}
                `;
                el.resultsList.appendChild(li);
            });
        }
    }

    // Helpers
    function getOrdinal(n) {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
    }

    // ==========================================================================
    // IMAGE SEARCH CLIENT (GOOGLE CUSTOM SEARCH OR WIKIPEDIA FALLBACK)
    // ==========================================================================
    async function searchCharacters() {
        const query = el.characterSearchInput.value.trim();
        if (!query) return;
        
        el.searchResultsContainer.innerHTML = `
            <div class="search-placeholder">
                <div class="spinner"></div>
                Searching images...
            </div>
        `;
        
        // Query Wikipedia, Commons, Openverse, and server DDG proxy in parallel
        try {
            // Query Wikipedia, Commons, Openverse, and server DDG proxy in parallel
            const searchUrl1 = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=12&format=json&origin=*`;
            const searchUrl2 = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + " character")}&srlimit=12&format=json&origin=*`;
            const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=30&prop=imageinfo&iiprop=url&iiurlwidth=300&format=json&origin=*`;
            const openverseUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=16`;
            
            const proxyPromise = fetch("/api/search_images", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: query })
            }).then(r => r.ok ? r.json() : []).catch(() => []);
            
            const [res1, res2, commonsRes, openverseRes, proxyRes] = await Promise.all([
                fetch(searchUrl1).then(r => r.json()).catch(() => ({})),
                fetch(searchUrl2).then(r => r.json()).catch(() => ({})),
                fetch(commonsUrl).then(r => r.json()).catch(() => ({})),
                fetch(openverseUrl).then(r => r.json()).catch(() => ({})),
                proxyPromise
            ]);
            
            const titles = [];
            const seenTitles = new Set();
            
            const addTitles = (searchRes) => {
                if (searchRes.query && searchRes.query.search) {
                    searchRes.query.search.forEach(result => {
                        const t = result.title;
                        if (!seenTitles.has(t)) {
                            seenTitles.add(t);
                            titles.push(t);
                        }
                    });
                }
            };
            
            addTitles(res1);
            addTitles(res2);
            
            // Limit combined Wikipedia article titles to top 16 unique titles
            const topTitles = titles.slice(0, 16);
            
            // Fetch REST summaries for matching articles in parallel
            let summaries = [];
            if (topTitles.length > 0) {
                const summaryPromises = topTitles.map(title => {
                    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
                    return fetch(summaryUrl)
                        .then(r => r.ok ? r.json() : null)
                        .catch(() => null);
                });
                summaries = await Promise.all(summaryPromises);
            }
            
            const items = [];
            const seenUrls = new Set();
            
            // 1. Process Wikipedia summary results
            summaries.forEach(summary => {
                if (summary && summary.thumbnail && summary.thumbnail.source) {
                    const url = summary.thumbnail.source;
                    if (!seenUrls.has(url)) {
                        seenUrls.add(url);
                        items.push({
                            title: summary.title,
                            description: summary.description || "",
                            image: url,
                            thumbnail: url
                        });
                    }
                }
            });

            // 1.5. Process DuckDuckGo proxy results
            if (proxyRes && Array.isArray(proxyRes)) {
                proxyRes.forEach(item => {
                    const url = item.image;
                    const thumb = item.thumbnail || url;
                    if (url && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        items.push({
                            title: item.title,
                            description: "Web Image",
                            image: url,
                            thumbnail: thumb
                        });
                    }
                });
            }

            // 2. Process Openverse (CC / Flickr) search results
            if (openverseRes && openverseRes.results) {
                openverseRes.results.forEach(item => {
                    const url = item.url;
                    const thumb = item.thumbnail || url;
                    if (url && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        items.push({
                            title: item.title || "Creative Commons Image",
                            description: `CC image (${item.source || "Openverse"})`,
                            image: url,
                            thumbnail: thumb
                        });
                    }
                });
            }

            // 3. Process Commons search results (filtering by file extension)
            if (commonsRes.query && commonsRes.query.pages) {
                const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
                Object.values(commonsRes.query.pages).forEach(page => {
                    if (page.imageinfo && page.imageinfo[0] && page.imageinfo[0].thumburl) {
                        const url = page.imageinfo[0].thumburl;
                        if (!seenUrls.has(url)) {
                            let title = page.title.replace(/^File:/i, '');
                            const dotIndex = title.lastIndexOf('.');
                            const ext = dotIndex !== -1 ? title.substring(dotIndex).toLowerCase() : '';
                            
                            if (allowedExtensions.includes(ext)) {
                                seenUrls.add(url);
                                title = dotIndex !== -1 ? title.substring(0, dotIndex) : title;
                                title = decodeURIComponent(title.replace(/_/g, ' '));
                                items.push({
                                    title: title,
                                    description: "Commons file",
                                    image: url,
                                    thumbnail: url
                                });
                            }
                        }
                    }
                });
            }
            
            // Advanced relevance scoring and sorting to prioritize exact matches, subject matches, and token-weighted context matches
            items.sort((a, b) => {
                const getScore = (title) => {
                    const titleLower = title.toLowerCase();
                    const qLower = query.toLowerCase();
                    
                    const qTokens = qLower.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
                    const tTokens = titleLower.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
                    
                    const qNorm = qLower.replace(/[^a-z0-9]/g, '');
                    const tNorm = titleLower.replace(/[^a-z0-9]/g, '');
                    
                    const subject = titleLower.split("(")[0].trim();
                    const subNorm = subject.replace(/[^a-z0-9]/g, '');
                    
                    let score = 0;
                    
                    // Exact subject match
                    if (subNorm === qNorm) {
                        score += 150;
                    } else if (subNorm.startsWith(qNorm) || qNorm.startsWith(subNorm)) {
                        score += 120;
                    } else if (subNorm.includes(qNorm) || qNorm.endsWith(subNorm)) {
                        score += 90;
                    } else if (tNorm.includes(qNorm)) {
                        score += 60;
                    }
                    
                    // Token-weighting for multi-word franchise queries
                    if (qTokens.length > 1) {
                        let tokenScore = 0;
                        qTokens.forEach((token, index) => {
                            if (tTokens.includes(token)) {
                                if (index === qTokens.length - 1) {
                                    tokenScore += 40;
                                } else if (index === 0) {
                                    tokenScore += 20;
                                } else {
                                    tokenScore += 10;
                                }
                            }
                        });
                        
                        // Only add token overlap boost if it matches the first or last query token (actual character name indicator)
                        const hasLastToken = tTokens.includes(qTokens[qTokens.length - 1]);
                        const hasFirstToken = tTokens.includes(qTokens[0]);
                        if (hasLastToken || hasFirstToken) {
                            score += tokenScore;
                        }
                    }
                    
                    // Boost actual character pages
                    if (titleLower.includes("(character)") || titleLower.includes("character")) {
                        score += 15;
                    }
                    
                    // Deprioritize disambiguation pages or list pages
                    if (titleLower.includes("disambiguation") || titleLower.includes("list of")) {
                        score -= 50;
                    }
                    
                    return score;
                };
                return getScore(b.title) - getScore(a.title);
            });

            displaySearchResults(items, "No character images found. Try another search or paste an image URL manually below!");
        } catch (err) {
            console.error(err);
            el.searchResultsContainer.innerHTML = `<div class="search-placeholder">Search failed. Check your internet connection or use manual entry below.</div>`;
        }
    }

    // Render Search Results Cards
    function displaySearchResults(items, emptyMessage) {
        el.searchResultsContainer.innerHTML = "";
        
        if (!items || items.length === 0) {
            el.searchResultsContainer.innerHTML = `<div class="search-placeholder">${emptyMessage}</div>`;
            return;
        }
        
        items.forEach(item => {
            const card = document.createElement("div");
            card.className = "search-item-card";
            
            // Use small thumbnail for previews to save bandwidth and load faster
            const displayImg = item.thumbnail || item.image;
            
            // Limit rendered title length to prevent layout wrapping
            const displayTitle = item.title.length > 25 ? item.title.substring(0, 22) + "..." : item.title;
            
            card.innerHTML = `
                <img class="search-item-img" src="${displayImg}" alt="${item.title}">
                <div class="search-item-name">${displayTitle}</div>
                ${item.description ? `<div style="font-size: 0.68rem; color: var(--text-secondary); text-align: center; padding: 0 6px 6px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.description}</div>` : ""}
            `;
            
            card.onclick = () => {
                AudioEffects.playClick();
                
                // Handle highlight toggle
                document.querySelectorAll(".search-item-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                
                selectedCharacter = {
                    name: item.title,
                    image: item.image // Use high-res image for submission
                };
                
                // Show in submit preview
                el.previewImage.src = item.image;
                el.previewName.textContent = item.title;
                el.selectedCharacterPreview.style.display = "block";
                
                // Scroll preview card into view
                el.selectedCharacterPreview.scrollIntoView({ behavior: 'smooth' });
            };
            
            el.searchResultsContainer.appendChild(card);
        });
    }

    // ==========================================================================
    // ORIENTATION / SENSOR MANAGEMENT
    // ==========================================================================
    function requestOrientationSensor() {
        deviceOrientationActive = true;
        
        let sensorReceived = false;
        function testSensor(e) {
            if (e.beta !== null || e.gamma !== null) {
                sensorReceived = true;
                window.removeEventListener('deviceorientation', testSensor);
            }
        }
        window.addEventListener('deviceorientation', testSensor);
        
        setTimeout(() => {
            const warningTip = document.getElementById("sensor-warning-tip");
            if (warningTip) {
                if (!sensorReceived) {
                    warningTip.style.display = "block";
                } else {
                    warningTip.style.display = "none";
                }
            }
        }, 1500);
        
        // iOS requires explicit permission click
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') {
                        window.addEventListener('deviceorientation', handleOrientationTilt);
                    } else {
                        console.warn("Device orientation permission denied.");
                    }
                })
                .catch(err => {
                    console.error("Orientation permissions request error:", err);
                });
        } else {
            // Android / Standard Browsers
            window.addEventListener('deviceorientation', handleOrientationTilt);
        }
    }

    function stopOrientationSensor() {
        deviceOrientationActive = false;
        window.removeEventListener('deviceorientation', handleOrientationTilt);
    }

    function handleOrientationTilt(event) {
        // If the user tapped manual toggle, disable automatic changes
        if (manualOverrideActive) return;

        const beta = event.beta;   // -180 to 180 (front/back pitch)
        const gamma = event.gamma; // -90 to 90 (left/right roll)

        // Threshold detection:
        // When pointing the screen to others (horizontal/vertical away from user's face):
        // Portrait: phone is held vertical (beta ~ 90). If tilted forward, beta increases past 95.
        // Landscape: phone is held sideways (gamma ~ 90 or -90).
        
        let isTiltedAway = false;
        
        // Portrait vertical/tilt away check
        if (Math.abs(beta) > 75 && Math.abs(beta) < 115) {
            isTiltedAway = true;
        }
        
        // Landscape vertical/tilt away check
        if (Math.abs(gamma) > 75 && Math.abs(gamma) < 115) {
            isTiltedAway = true;
        }

        setGameplayView(isTiltedAway ? "away" : "back");
    }

    function setGameplayView(view) {
        if (currentGameplayView === view) return; // Prevent double trigger
        currentGameplayView = view;
        
        const countdownOverlay = document.getElementById("gameplay-away-countdown");
        const charDetails = document.getElementById("gameplay-character-details");
        const countdownText = document.getElementById("away-countdown-text");
        
        if (view === "away") {
            el.viewTiltedAway.classList.add("active");
            el.viewTiltedBack.classList.remove("active");
            
            // Clear any active countdown
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
            
            // Show countdown screen, hide character card details
            countdownOverlay.style.display = "flex";
            charDetails.style.display = "none";
            
            let count = 3;
            countdownText.textContent = count;
            AudioEffects.playBeep(); // Beep for 3
            
            countdownInterval = setInterval(() => {
                count--;
                if (count > 0) {
                    countdownText.textContent = count;
                    AudioEffects.playBeep(); // Beep for 2, 1
                } else {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                    
                    // Reveal character
                    countdownOverlay.style.display = "none";
                    charDetails.style.display = "block";
                    AudioEffects.playStart(); // Triumphant chord for reveal!
                }
            }, 1000);
        } else {
            // Cancel active countdown
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
            
            // Reset overlay visibility defaults
            countdownOverlay.style.display = "none";
            charDetails.style.display = "block";

            el.viewTiltedAway.classList.remove("active");
            el.viewTiltedBack.classList.add("active");
        }
    }

    // Helper to get list of other players
    function getOtherPlayersList() {
        return Object.values(players)
            .filter(p => p.id !== playerId)
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    let currentRevealPlayerId = null;

    // Helper to open player reveal modal
    function openRevealModal(targetPlayerId) {
        const targetPlayer = players[targetPlayerId];
        if (!targetPlayer) return;
        
        currentRevealPlayerId = targetPlayerId;
        
        const modal = document.getElementById("gameplay-reveal-modal");
        const modalImg = document.getElementById("reveal-modal-image");
        const modalName = document.getElementById("reveal-modal-name");
        const modalDesc = document.getElementById("reveal-modal-player-desc");
        
        if (modalDesc) modalDesc.textContent = `${targetPlayer.name} is guessing:`;
        if (modalImg) modalImg.src = targetPlayer.assignedCharacterImage || "https://robohash.org/unknown?set=set4";
        if (modalName) modalName.textContent = targetPlayer.assignedCharacterName || "???";
        
        if (modal) modal.style.display = "flex";
    }

    // Helper to close player reveal modal
    function closeRevealModal() {
        const modal = document.getElementById("gameplay-reveal-modal");
        if (modal) modal.style.display = "none";
        currentRevealPlayerId = null;
    }

    // Swipe gesture detection variables
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    function handleSwipeGesture() {
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const minSwipeDistance = 30; // Min pixels to trigger swipe
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Horizontal swipe
            if (Math.abs(deltaX) > minSwipeDistance) {
                if (deltaX < 0) {
                    navigateRevealPlayer(1);
                } else {
                    navigateRevealPlayer(-1);
                }
            }
        } else {
            // Vertical swipe
            if (Math.abs(deltaY) > minSwipeDistance) {
                if (deltaY < 0) {
                    navigateRevealPlayer(1);
                } else {
                    navigateRevealPlayer(-1);
                }
            }
        }
    }

    // Helper to navigate between revealed players via swipe
    function navigateRevealPlayer(direction) {
        const list = getOtherPlayersList();
        if (list.length === 0) return;
        
        let index = list.findIndex(p => p.id === currentRevealPlayerId);
        if (index === -1) {
            index = 0;
        } else {
            index = (index + direction + list.length) % list.length;
        }
        
        openRevealModal(list[index].id);
    }

    // Expose entrypoint
    return {
        init
    };
    
})();

// Launch application on page load
window.addEventListener("DOMContentLoaded", App.init);