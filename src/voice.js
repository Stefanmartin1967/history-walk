// voice.js
import { showToast } from './ui.js';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

let state = {
    isActive: false,
    currentButton: null,
    currentTargetInput: null,
    finalTranscript: ''
};

const punctuationMap = [
    { key: 'point d\'exclamation', value: ' !' },
    { key: 'point d\'interrogation', value: ' ?' },
    { key: 'point virgule', value: ' ;' },
    { key: 'deux points', value: ' :' },
    { key: 'ouvrir la parenthèse', value: ' (' },
    { key: 'fermer la parenthèse', value: ') ' },
    { key: 'à la ligne', value: '\n' },
    { key: 'point', value: '.' },
    { key: 'virgule', value: ',' },
];

function applyPunctuation(text) {
    let correctedText = ` ${text.toLowerCase()} `;
    for (const p of punctuationMap) {
        const regex = new RegExp(` ${p.key} `, 'g');
        correctedText = correctedText.replace(regex, `${p.value} `);
    }
    return correctedText.trim().replace(/((^|\.\s*|\n\s*)[a-z])/g, (match) => match.toUpperCase());
}


function updateIcon(button, isRecording) {
    if (button) {
        button.classList.toggle('recording', isRecording);
        button.innerHTML = isRecording ? '<i data-lucide="mic-off"></i>' : '<i data-lucide="mic"></i>';
        lucide.createIcons();
    }
}

function initializeRecognition() {
    if (!SpeechRecognition) {
        console.warn("La reconnaissance vocale n'est pas supportée par ce navigateur.");
        return null;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'fr-FR';

    rec.onstart = () => {
        state.isActive = true;
        state.finalTranscript = state.currentTargetInput.value ? state.currentTargetInput.value + ' ' : '';
        updateIcon(state.currentButton, true);
    };

    rec.onend = () => {
        state.isActive = false;
        if (state.currentTargetInput && state.currentTargetInput.value) {
            state.currentTargetInput.value = applyPunctuation(state.currentTargetInput.value);
        }
        updateIcon(state.currentButton, false);
        state.currentButton = null;
        state.currentTargetInput = null;
    };

    rec.onresult = (event) => {
        if (!state.currentTargetInput) return;
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                state.finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        
        state.currentTargetInput.value = state.finalTranscript + interimTranscript;
    };

    rec.onerror = (event) => {
        console.error('Erreur de reconnaissance vocale:', event.error);
        if (event.error === 'no-speech' || event.error === 'audio-capture') {
            showToast("Le micro s'est arrêté (inactivité/erreur).", 'warning');
        } else if (event.error !== 'aborted') {
            showToast("Erreur de reconnaissance vocale.", 'error');
        }
    };

    return rec;
}

recognition = initializeRecognition();

export function startDictation(button, targetInput) {
    if (!recognition) {
        showToast("Dictée vocale non supportée.", "error");
        return;
    }
    if (state.isActive) {
        stopDictation();
        return;
    }
    state.currentButton = button;
    state.currentTargetInput = targetInput;
    try {
        recognition.start();
    } catch (e) {
        console.error("Erreur au démarrage de la reconnaissance : ", e);
        if (e.name === 'InvalidStateError') {
             // Ignore, this can happen if user clicks too fast
        } else {
            showToast("Impossible de démarrer le micro.", "error");
        }
    }
}

export function stopDictation() {
    if (recognition && state.isActive) {
        recognition.stop();
    }
}

export function isDictationActive() {
    return state.isActive;
}

// <<< MODIFICATION DE LA FONCTION CI-DESSOUS >>>
export function speakText(text, button) {
    if (!window.speechSynthesis) {
        showToast("La synthèse vocale n'est pas supportée par votre navigateur.", "warning");
        return;
    }

    const resetIcon = () => {
        if (button) {
            button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
        }
    };
    
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        // L'événement 'onend' n'est pas toujours appelé sur 'cancel', on réinitialise manuellement.
        resetIcon(); 
        return;
    }

    if (!text || text.trim() === '') {
        showToast("Le champ est vide.", "info");
        return;
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    
    utterance.onstart = () => {
        if (button) {
            button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>`;
        }
    };
    
    utterance.onend = () => {
        resetIcon();
    };

    utterance.onerror = () => {
        resetIcon();
    };
    
    window.speechSynthesis.speak(utterance);
}