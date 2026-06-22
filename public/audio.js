// ==========================================================================
// GAME AUDIO EFFECTS (SYNTHESIZED WITH WEB AUDIO API)
// ==========================================================================

const AudioEffects = (() => {
    let audioCtx = null;

    // Initialize context on first user gesture
    function init() {
        if (audioCtx) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }

    // Play a standard synthetic beep/chime
    function playTone(freq, type, duration, gainStart, gainEnd = 0.001) {
        init();
        if (!audioCtx) return;

        // Resume context if suspended (browser security)
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        try {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            gainNode.gain.setValueAtTime(gainStart, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(gainEnd, audioCtx.currentTime + duration);

            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {
            console.error("Audio playback failed", e);
        }
    }

    return {
        // Triumphant chime for a correct guess
        playCorrect() {
            init();
            if (!audioCtx) return;
            
            const now = audioCtx.currentTime;
            
            // Bright synth chime
            const playChimeTone = (freq, delay, dur) => {
                const osc = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + delay);
                
                gainNode.gain.setValueAtTime(0.001, now + delay);
                gainNode.gain.exponentialRampToValueAtTime(0.15, now + delay + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
                
                osc.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                
                osc.start(now + delay);
                osc.stop(now + delay + dur);
            };

            // Play C major triad arpeggio (C5 -> E5 -> G5 -> C6)
            playChimeTone(523.25, 0, 0.3);      // C5
            playChimeTone(659.25, 0.08, 0.3);   // E5
            playChimeTone(783.99, 0.16, 0.3);   // G5
            playChimeTone(1046.50, 0.24, 0.5);  // C6
        },

        // Buzzer sound for giving up
        playFailure() {
            init();
            if (!audioCtx) return;

            const now = audioCtx.currentTime;
            const duration = 0.4;
            
            try {
                const osc1 = audioCtx.createOscillator();
                const osc2 = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();

                osc1.type = 'sawtooth';
                osc2.type = 'sawtooth';
                
                // Slightly detuned frequencies for a richer buzzer sound
                osc1.frequency.setValueAtTime(130, now);
                osc1.frequency.linearRampToValueAtTime(100, now + duration);
                
                osc2.frequency.setValueAtTime(132, now);
                osc2.frequency.linearRampToValueAtTime(102, now + duration);

                gainNode.gain.setValueAtTime(0.15, now);
                gainNode.gain.linearRampToValueAtTime(0.001, now + duration);

                osc1.connect(gainNode);
                osc2.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                osc1.start(now);
                osc2.start(now);
                
                osc1.stop(now + duration);
                osc2.stop(now + duration);
            } catch (e) {
                console.error(e);
            }
        },

        // Soft click for UI button press
        playClick() {
            playTone(800, 'sine', 0.05, 0.1);
        },

        // Short beep for countdown
        playBeep() {
            playTone(600, 'sine', 0.12, 0.15);
        },

        // Triumphant sound when game launches
        playStart() {
            init();
            if (!audioCtx) return;
            const now = audioCtx.currentTime;
            
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(330, now); // E4
            osc.frequency.exponentialRampToValueAtTime(660, now + 0.3); // E5
            
            gainNode.gain.setValueAtTime(0.01, now);
            gainNode.gain.linearRampToValueAtTime(0.2, now + 0.15);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.start(now);
            osc.stop(now + 0.35);
        },

        // Woody sound effect for game quit
        playQuit() {
            playTone(180, 'triangle', 0.25, 0.15);
        }
    };
})();
window.AudioEffects = AudioEffects;
