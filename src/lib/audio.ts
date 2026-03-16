// Simple Web Audio API sound generator

let audioCtx: AudioContext | null = null;

// Initialize audio context on first user interaction to comply with browser autoplay policies
export const initAudioContext = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
};

// Play a pleasant rising chime for when a booking starts
export const playStartSound = () => {
    const ctx = initAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    
    // Create nodes
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    // Configure oscillator 1 (lower note)
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, t); // A4
    osc1.frequency.exponentialRampToValueAtTime(880, t + 0.1); // Slide up to A5
    
    // Configure oscillator 2 (higher note, slightly delayed)
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, t + 0.1); // E5
    osc2.frequency.exponentialRampToValueAtTime(1318.51, t + 0.2); // Slide up to E6

    // Configure volume envelope
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(0.3, t + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

    // Connect and play
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(t);
    osc1.stop(t + 0.5);
    
    osc2.start(t + 0.1);
    osc2.stop(t + 0.6);
};

// Play an alerting repetitive beep for when a booking ends
export const playEndSound = () => {
    const ctx = initAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Play 3 discrete beeps
    for (let i = 0; i < 3; i++) {
        const startTime = t + (i * 0.4);
        
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        // Piercing square wave for alarm effect
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, startTime); // High pitch

        // Sharp attack and quick decay for each beep
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.25);
    }
};
