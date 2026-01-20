// Import Firebase SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, getDocs, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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

// Load messages on page load
loadMessages();
