// Import Firebase SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, getDocs, deleteDoc, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBt6i1W4QgyChii1it3DnNIjFYmVqauT4s",
    authDomain: "website-a04d0.firebaseapp.com",
    databaseURL: "https://website-a04d0.firebaseio.com",
    projectId: "website-a04d0",
    storageBucket: "website-a04d0.appspot.com",
    messagingSenderId: "500427658001",
    appId: "1:500427658001:web:e845938052713f3ba172b0",
    measurementId: "G-469GBRLNG4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM elements
const messageForm = document.getElementById('messageForm');
const statusDiv = document.getElementById('status');
const messagesList = document.getElementById('messagesList');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const interviewFeed = document.getElementById('interviewFeed');
const deleteAllInterviewBtn = document.getElementById('deleteAllInterviewBtn');
const statusCard = document.getElementById('statusCard');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');
const micBtn = document.getElementById('micBtn');
const sttStatusDiv = document.getElementById('sttStatus');

// ===== ELEVENLABS SPEECH-TO-TEXT =====

let sttSocket = null;
let mediaStream = null;
let audioContext = null;
let processorNode = null;
let isRecording = false;

function setSttStatus(msg, className = '') {
    sttStatusDiv.textContent = msg;
    sttStatusDiv.className = 'stt-status' + (className ? ' ' + className : '');
}

function getElevenLabsKey() {
    const key = localStorage.getItem('elevenLabsApiKey');
    console.log('Retrieved ElevenLabs API key from localStorage:', key);
    if (!key) {
        const prompted = prompt('Enter your ElevenLabs API key (stored in localStorage):');
        if (prompted) {
            localStorage.setItem('elevenLabsApiKey', prompted.trim());
            return prompted.trim();
        }
        return null;
    }
    return key;
}

async function startRecording() {
    const apiKey = getElevenLabsKey();
    if (!apiKey) {
        setSttStatus('No API key provided.', 'stt-error');
        return;
    }

    try {
        // 1. Get a single-use token from ElevenLabs
        setSttStatus('Authenticating…');
        const tokenRes = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey
            }
        });

        if (!tokenRes.ok) {
            const errBody = await tokenRes.text();
            throw new Error(`Token request failed (${tokenRes.status}): ${errBody}`);
        }

        const tokenData = await tokenRes.json();
        const token = tokenData.token;

        // 2. Get microphone access
        setSttStatus('Requesting microphone…');
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 }
        });

        // 3. Open WebSocket
        const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=${encodeURIComponent(token)}&language_code=en&commit_strategy=vad&vad_silence_threshold_secs=1.5`;
        sttSocket = new WebSocket(wsUrl);

        sttSocket.onopen = () => {
            isRecording = true;
            micBtn.classList.add('recording');
            setSttStatus('🔴 Listening… speak now', 'stt-active');
            startAudioStreaming();
        };

        sttSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const messageInput = document.getElementById('message');

            if (data.message_type === 'partial_transcript' && data.text) {
                // Show partial text as a hint
                messageInput.setAttribute('data-partial', data.text);
                setSttStatus('🔴 ' + data.text, 'stt-active');
            } else if (data.message_type === 'committed_transcript' && data.text) {
                // Append committed text to textarea
                const current = messageInput.value;
                messageInput.value = (current ? current + ' ' : '') + data.text;
                messageInput.removeAttribute('data-partial');
                setSttStatus('🔴 Listening…', 'stt-active');
            }
        };

        sttSocket.onerror = (err) => {
            console.error('STT WebSocket error:', err);
            setSttStatus('Connection error. Try again.', 'stt-error');
            stopRecording();
        };

        sttSocket.onclose = () => {
            if (isRecording) {
                setSttStatus('Session ended.');
                stopRecording();
            }
        };

    } catch (err) {
        console.error('STT start error:', err);
        setSttStatus(err.message || 'Failed to start recording.', 'stt-error');
        stopRecording();
    }
}

function startAudioStreaming() {
    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(mediaStream);

    // ScriptProcessorNode to capture raw PCM (4096 buffer)
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    processorNode.onaudioprocess = (e) => {
        if (!isRecording || !sttSocket || sttSocket.readyState !== WebSocket.OPEN) return;

        const float32 = e.inputBuffer.getChannelData(0);
        // Convert Float32 → Int16 PCM
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Base64 encode
        const bytes = new Uint8Array(int16.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);

        sttSocket.send(JSON.stringify({
            message_type: 'input_audio_chunk',
            audio_base_64: base64
        }));
    };

    source.connect(processorNode);
    processorNode.connect(audioContext.destination);
}

function stopRecording() {
    isRecording = false;
    micBtn.classList.remove('recording');

    if (processorNode) {
        processorNode.disconnect();
        processorNode = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    if (sttSocket && sttSocket.readyState === WebSocket.OPEN) {
        sttSocket.close();
    }
    sttSocket = null;

    if (!sttStatusDiv.classList.contains('stt-error')) {
        setSttStatus('Stopped.');
        setTimeout(() => setSttStatus(''), 2000);
    }
}

// Toggle mic on click
micBtn.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});

// Show status message
function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.className = isError ? 'status error' : 'status success';
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

// Format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Just now';
    
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Display messages
function displayMessage(doc) {
    const data = doc.data();
    const messageItem = document.createElement('div');
    messageItem.className = 'message-item';
    messageItem.id = doc.id;
    
    messageItem.innerHTML = `
        <div class="message-content">${escapeHtml(data.msg)}</div>
        ${data.code ? `<div class="message-code">${escapeHtml(data.code)}</div>` : ''}
        <div class="message-meta">
            <span><strong>Language:</strong> ${escapeHtml(data.language)}</span>
            <span><strong>Time:</strong> ${formatTimestamp(data.timestamp)}</span>
        </div>
    `;
    
    return messageItem;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load recent messages
function loadMessages() {
    const q = query(collection(db, 'msgs'), orderBy('timestamp', 'desc'), limit(10));
    
    onSnapshot(q, (snapshot) => {
        messagesList.innerHTML = '';
        
        if (snapshot.empty) {
            messagesList.innerHTML = '<div class="no-messages">No code submissions yet. Be the first to share!</div>';
            return;
        }
        
        snapshot.forEach((doc) => {
            const messageElement = displayMessage(doc);
            messagesList.appendChild(messageElement);
        });
    }, (error) => {
        console.error('Error loading messages:', error);
        messagesList.innerHTML = '<div class="no-messages">Error loading messages. Please refresh the page.</div>';
    });
}

// Handle form submission
messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const messageInput = document.getElementById('message');
    const languageInput = document.getElementById('language');
    const codeInput = document.getElementById('code');
    
    const messageText = messageInput.value.trim();
    const language = languageInput.value;
    const code = codeInput.value.trim();
    
    try {
        // Add document to Firestore
        await addDoc(collection(db, 'msgs'), {
            msg: messageText,
            language: language,
            code: code || '',
            timestamp: serverTimestamp()
        });
        
        // Clear form
        messageForm.reset();
        
        // Show success message
        showStatus('Message sent successfully!');
        
    } catch (error) {
        console.error('Error sending message:', error);
        showStatus('Error sending message. Please try again.', true);
    }
});

// Delete all messages
deleteAllBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete ALL messages? This action cannot be undone!')) {
        return;
    }
    
    try {
        deleteAllBtn.disabled = true;
        deleteAllBtn.textContent = 'Deleting...';
        
        const q = query(collection(db, 'msgs'));
        const snapshot = await getDocs(q);
        
        const deletePromises = [];
        snapshot.forEach((document) => {
            deletePromises.push(deleteDoc(doc(db, 'msgs', document.id)));
        });
        
        await Promise.all(deletePromises);
        
        showStatus(`Successfully deleted ${deletePromises.length} message${deletePromises.length !== 1 ? 's' : ''}!`);
        
    } catch (error) {
        console.error('Error deleting messages:', error);
        showStatus('Error deleting messages. Please try again.', true);
    } finally {
        deleteAllBtn.disabled = false;
        deleteAllBtn.textContent = 'Delete All Messages';
    }
});

// ===== INTERVIEW QUESTIONS (Right Panel) =====

function formatInterviewTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        + '  ·  ' + date.toLocaleDateString();
}

function loadInterviewQuestions() {
    const q = query(
        collection(db, 'interviewQuestions'),
        orderBy('timestamp', 'desc')
    );

    onSnapshot(q, (snapshot) => {
        interviewFeed.innerHTML = '';

        if (snapshot.empty) {
            interviewFeed.innerHTML = '<div class="no-interview">Waiting for interview questions…</div>';
            return;
        }

        let isFirst = true;
        snapshot.forEach((doc) => {
            const data = doc.data();
            const bubble = document.createElement('div');
            bubble.className = 'interview-bubble' + (isFirst ? ' new' : '');
            bubble.innerHTML = `
                <div class="interview-question">${escapeHtml(data.question)}</div>
                <div class="interview-time">${formatInterviewTime(data.timestamp)}</div>
            `;
            interviewFeed.appendChild(bubble);
            isFirst = false;
        });
    }, (error) => {
        console.error('Error loading interview questions:', error);
        interviewFeed.innerHTML = '<div class="no-interview">Error loading interview feed. Please refresh.</div>';
    });
}

// Delete all interview questions
deleteAllInterviewBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete ALL interview questions? This action cannot be undone!')) {
        return;
    }
    
    try {
        deleteAllInterviewBtn.disabled = true;
        deleteAllInterviewBtn.textContent = 'Deleting...';
        
        const q = query(collection(db, 'interviewQuestions'));
        const snapshot = await getDocs(q);
        
        const deletePromises = [];
        snapshot.forEach((document) => {
            deletePromises.push(deleteDoc(doc(db, 'interviewQuestions', document.id)));
        });
        
        await Promise.all(deletePromises);
        
        showStatus(`Successfully deleted ${deletePromises.length} interview question${deletePromises.length !== 1 ? 's' : ''}!`);
        
    } catch (error) {
        console.error('Error deleting interview questions:', error);
        showStatus('Error deleting questions. Please try again.', true);
    } finally {
        deleteAllInterviewBtn.disabled = false;
        deleteAllInterviewBtn.textContent = 'Delete All Questions';
    }
});

// ===== INTERVIEW STATUS (Right Panel Card) =====

const STATUS_CONFIG = {
    'okay': {
        icon: '✅',
        text: 'Going Smooth',
        className: 'status-okay'
    },
    'not okay': {
        icon: '⚠️',
        text: 'Needs Attention',
        className: 'status-notokay'
    },
    'sos': {
        icon: '🚨',
        text: 'SOS — Help Needed!',
        className: 'status-sos'
    }
};

function listenInterviewStatus() {
    const docRef = doc(db, 'interviewStatus', 'info');

    onSnapshot(docRef, (snap) => {
        if (!snap.exists()) {
            statusCard.className = 'status-card status-loading';
            statusIcon.textContent = '❓';
            statusText.textContent = 'No status available';
            return;
        }

        const data = snap.data();
        const value = (data.status || '').toLowerCase().trim();
        const config = STATUS_CONFIG[value] || {
            icon: '❓',
            text: value || 'Unknown',
            className: 'status-loading'
        };

        statusCard.className = 'status-card ' + config.className;
        statusIcon.textContent = config.icon;
        statusText.textContent = config.text;
    }, (error) => {
        console.error('Error listening to interview status:', error);
        statusCard.className = 'status-card status-loading';
        statusIcon.textContent = '❌';
        statusText.textContent = 'Error loading status';
    });
}

// Load messages & interview feed on page load
loadMessages();
loadInterviewQuestions();
listenInterviewStatus();
