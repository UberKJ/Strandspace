/**
 * Strandspace Chat Application
 * Manages conversation UI, messaging, and API interactions
 */

let currentConversationId = null;
let currentMessages = [];
let currentConversationMeta = null;
let conversationsCache = [];

// Status badge
const statusBadge = document.getElementById('chat-status-badge');
const setStatus = (text, type = 'neutral') => {
  statusBadge.textContent = text;
  statusBadge.className = `status-badge status-${type}`;
};

// Load conversations from API
async function loadConversations() {
  try {
    const response = await fetch('/api/chat/conversations?limit=50');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    conversationsCache = Array.isArray(data.conversations) ? data.conversations : [];
    renderConversationsList(conversationsCache);
    setStatus('Ready', 'success');
    return conversationsCache;
  } catch (error) {
    console.error('Failed to load conversations:', error);
    setStatus('Error loading conversations', 'error');
    document.getElementById('conversations-list').innerHTML = 
      `<p class="placeholder">Failed to load conversations</p>`;
    return [];
  }
}

function findConversationMeta(conversationId) {
  if (!conversationId) {
    return null;
  }

  return conversationsCache.find((entry) => entry.id === conversationId) || null;
}

// Render conversations list
function renderConversationsList(conversations) {
  const list = document.getElementById('conversations-list');
  
  if (!conversations || conversations.length === 0) {
    list.innerHTML = '<p class="placeholder">No conversations yet</p>';
    return;
  }

  list.innerHTML = conversations.map(conv => `
    <button class="conversation-item ${currentConversationId === conv.id ? 'is-active' : ''}" 
            data-conversation-id="${conv.id}">
      <div class="conv-title">${conv.title || 'Untitled'}</div>
      <div class="conv-meta">
        <span class="conv-count">${conv.messageCount} messages</span>
        <time class="conv-date">${formatDate(conv.lastMessageAt)}</time>
      </div>
    </button>
  `).join('');

  // Add event listeners to conversation items
  document.querySelectorAll('.conversation-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const convId = btn.dataset.conversationId;
      loadConversation(convId);
    });
  });
}

// Load specific conversation
async function loadConversation(conversationId) {
  try {
    setStatus('Loading...', 'neutral');
    const response = await fetch(`/api/chat/history/${conversationId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    currentConversationId = conversationId;
    currentMessages = data.messages || [];
    currentConversationMeta = {
      ...(findConversationMeta(conversationId) || {}),
      ...(data.conversation || {}),
      id: conversationId
    };
    
    // Update UI
    updateConversationUI();
    renderMessages();
    setStatus('Ready', 'success');
  } catch (error) {
    console.error('Failed to load conversation:', error);
    setStatus('Error loading conversation', 'error');
  }
}

// Update UI for selected conversation
function updateConversationUI() {
  const title = document.getElementById('chat-title');
  const subtitle = document.getElementById('chat-subtitle');
  const form = document.getElementById('chat-form');
  const deleteBtn = document.getElementById('delete-chat-btn');
  const container = document.getElementById('messages-container');
  const conversationTitle = String(currentConversationMeta?.title ?? "").trim();
  const subjectId = String(currentConversationMeta?.subjectId ?? currentMessages[0]?.subjectId ?? "").trim();

  title.textContent = conversationTitle || (currentConversationId ? `Conversation ${currentConversationId.substring(0, 12)}...` : 'Chat');
  subtitle.textContent = subjectId
    ? `${currentMessages.length} messages in ${subjectId}`
    : `${currentMessages.length} messages`;
  form.style.display = 'flex';
  deleteBtn.style.display = 'block';
  container.className = 'messages-container';

  // Update active state in sidebar
  document.querySelectorAll('.conversation-item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.conversationId === currentConversationId);
  });
}

// Render messages in conversation
function renderMessages() {
  const container = document.getElementById('messages-container');
  
  if (!currentMessages || currentMessages.length === 0) {
    container.innerHTML = '<p class="placeholder">No messages yet</p>';
    return;
  }

  container.innerHTML = currentMessages.map(msg => `
    <div class="message message-${msg.role}">
      <div class="message-role">${msg.role === 'user' ? 'You' : 'Assistant'}</div>
      <div class="message-content">${escapeHtml(msg.content)}</div>
      <time class="message-time">${formatTime(msg.createdAt)}</time>
    </div>
  `).join('');

  // Scroll to bottom
  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
  }, 0);
}

// Send message
async function sendMessage(content) {
  if (!content.trim()) return;
  const input = document.getElementById('message-input');
  const submitButton = document.querySelector('.send-btn');

  try {
    setStatus('Sending...', 'neutral');
    if (input) {
      input.disabled = true;
    }
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content,
        conversationId: currentConversationId
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    
    // Update conversation if this was the first message
    if (!currentConversationId) {
      currentConversationId = data.conversationId;
    }
    currentConversationMeta = findConversationMeta(currentConversationId) || currentConversationMeta;

    await loadConversations();
    currentConversationMeta = findConversationMeta(currentConversationId) || currentConversationMeta;
    await loadConversation(currentConversationId);
    setStatus('Ready', 'success');
  } catch (error) {
    console.error('Failed to send message:', error);
    setStatus(error instanceof Error ? error.message : 'Error sending message', 'error');
    if (input) {
      input.value = content;
      input.focus();
    }
  } finally {
    if (input) {
      input.disabled = false;
    }
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Send';
    }
  }
}

// Delete conversation
async function deleteConversation(conversationId) {
  if (!confirm('Delete this conversation?')) return;

  try {
    setStatus('Deleting...', 'neutral');
    const response = await fetch(`/api/chat/delete/${conversationId}`, {
      method: 'POST'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    currentConversationId = null;
    currentMessages = [];
    document.getElementById('messages-container').innerHTML = `
      <div class="welcome-state">
        <h2>Conversation Deleted</h2>
        <p>Start a new conversation or select one from the sidebar.</p>
      </div>
    `;
    document.getElementById('chat-form').style.display = 'none';
    document.getElementById('delete-chat-btn').style.display = 'none';
    
    await loadConversations();
    setStatus('Deleted', 'success');
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    setStatus('Error deleting conversation', 'error');
  }
}

// Utility: Format date
function formatDate(isoString) {
  const date = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

// Utility: Format time
function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
document.getElementById('new-chat-btn').addEventListener('click', () => {
  currentConversationId = null;
  currentMessages = [];
  currentConversationMeta = null;
  document.getElementById('messages-container').innerHTML = `
    <div class="welcome-state">
      <h2>New Conversation</h2>
      <p>Ask a question to get started.</p>
    </div>
  `;
  document.getElementById('chat-title').textContent = 'New Conversation';
  document.getElementById('chat-subtitle').textContent = 'Ask a question to get started';
  document.getElementById('chat-form').style.display = 'flex';
  document.getElementById('delete-chat-btn').style.display = 'none';
  document.getElementById('message-input').focus();
  document.querySelectorAll('.conversation-item').forEach(btn => {
    btn.classList.remove('is-active');
  });
  setStatus('Ready', 'success');
});

document.getElementById('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('message-input');
  const content = input.value;
  input.value = '';
  await sendMessage(content);
});

document.getElementById('delete-chat-btn').addEventListener('click', () => {
  if (currentConversationId) {
    deleteConversation(currentConversationId);
  }
});

// Theme toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
});

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }
  loadConversations();
});
