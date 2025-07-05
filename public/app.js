// Глобальные переменные
let socket;
let currentUser = null;
let typingTimer;
let isTyping = false;

// Элементы DOM
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages-container');
const usersList = document.getElementById('users-list');
const onlineCount = document.getElementById('online-count');
const typingIndicator = document.getElementById('typing-indicator');
const logoutBtn = document.getElementById('logout-btn');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const sidebar = document.querySelector('.sidebar');

// Обработчики событий
loginForm.addEventListener('submit', handleLogin);
messageForm.addEventListener('submit', handleSendMessage);
messageInput.addEventListener('input', handleTyping);
logoutBtn.addEventListener('click', handleLogout);
toggleSidebarBtn.addEventListener('click', toggleSidebar);

// Функция входа в чат
function handleLogin(e) {
    e.preventDefault();
    const username = usernameInput.value.trim();
    
    if (username.length < 2) {
        alert('Имя должно содержать минимум 2 символа');
        return;
    }

    currentUser = username;
    connectToChat(username);
}

// Подключение к чату
function connectToChat(username) {
    // Подключаемся к серверу
    socket = io();

    // Отправляем событие входа
    socket.emit('user-join', username);

    // Переключаем экраны
    loginScreen.classList.remove('active');
    chatScreen.classList.add('active');

    // Фокус на поле ввода сообщения
    messageInput.focus();

    // Настраиваем обработчики событий Socket.io
    setupSocketListeners();
}

// Настройка обработчиков Socket.io
function setupSocketListeners() {
    // История сообщений
    socket.on('message-history', (messages) => {
        messages.forEach(message => {
            displayMessage(message);
        });
        scrollToBottom();
    });

    // Новое сообщение
    socket.on('new-message', (message) => {
        displayMessage(message);
        scrollToBottom();
    });

    // Пользователь присоединился
    socket.on('user-joined', (data) => {
        updateUsersList(data.onlineUsers);
    });

    // Пользователь вышел
    socket.on('user-left', (data) => {
        updateUsersList(data.onlineUsers);
    });

    // Индикатор печатания
    socket.on('user-typing', (data) => {
        updateTypingIndicator(data);
    });
}

// Отправка сообщения
function handleSendMessage(e) {
    e.preventDefault();
    const text = messageInput.value.trim();
    
    if (!text) return;

    socket.emit('send-message', { text });
    messageInput.value = '';
    messageInput.focus();
}

// Обработка печатания
function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', true);
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        isTyping = false;
        socket.emit('typing', false);
    }, 1000);
}

// Отображение сообщения
function displayMessage(message) {
    if (message.type === 'system') {
        displaySystemMessage(message);
    } else {
        displayUserMessage(message);
    }
}

// Отображение пользовательского сообщения
function displayUserMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    
    // Проверяем, является ли это сообщение от текущего пользователя
    if (message.username === currentUser) {
        messageEl.classList.add('own');
    }

    const avatar = getInitials(message.username);
    const time = formatTime(message.timestamp);

    messageEl.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-username">${escapeHtml(message.username)}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${escapeHtml(message.text)}</div>
        </div>
    `;

    messagesContainer.appendChild(messageEl);
}

// Отображение системного сообщения
function displaySystemMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'system-message';
    
    messageEl.innerHTML = `
        <span class="system-message-text">${escapeHtml(message.text)}</span>
    `;

    messagesContainer.appendChild(messageEl);
}

// Обновление списка пользователей
function updateUsersList(users) {
    usersList.innerHTML = '';
    onlineCount.textContent = users.length;

    users.forEach(user => {
        const userEl = document.createElement('div');
        userEl.className = 'user-item';
        
        const avatar = getInitials(user.username);
        const joinTime = formatTime(user.joinedAt);

        userEl.innerHTML = `
            <div class="user-avatar">${avatar}</div>
            <div class="user-info">
                <div class="user-name">${escapeHtml(user.username)}</div>
                <div class="user-status">Присоединился ${joinTime}</div>
            </div>
        `;

        usersList.appendChild(userEl);
    });
}

// Обновление индикатора печатания
let typingUsers = new Map();

function updateTypingIndicator(data) {
    if (data.isTyping) {
        typingUsers.set(data.username, true);
    } else {
        typingUsers.delete(data.username);
    }

    const typingUsersArray = Array.from(typingUsers.keys());
    
    if (typingUsersArray.length === 0) {
        typingIndicator.textContent = '';
    } else if (typingUsersArray.length === 1) {
        typingIndicator.textContent = `${typingUsersArray[0]} печатает...`;
    } else if (typingUsersArray.length === 2) {
        typingIndicator.textContent = `${typingUsersArray[0]} и ${typingUsersArray[1]} печатают...`;
    } else {
        typingIndicator.textContent = `${typingUsersArray[0]} и еще ${typingUsersArray.length - 1} печатают...`;
    }
}

// Выход из чата
function handleLogout() {
    if (confirm('Вы уверены, что хотите выйти из чата?')) {
        if (socket) {
            socket.disconnect();
        }
        
        // Очищаем UI
        messagesContainer.innerHTML = '';
        usersList.innerHTML = '';
        usernameInput.value = '';
        
        // Переключаем экраны
        chatScreen.classList.remove('active');
        loginScreen.classList.add('active');
        
        currentUser = null;
    }
}

// Переключение боковой панели (для мобильных)
function toggleSidebar() {
    sidebar.classList.toggle('active');
}

// Вспомогательные функции
function getInitials(name) {
    return name.substring(0, 2).toUpperCase();
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Закрытие боковой панели при клике вне её (для мобильных)
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && 
        sidebar.classList.contains('active') && 
        !sidebar.contains(e.target) && 
        !toggleSidebarBtn.contains(e.target)) {
        sidebar.classList.remove('active');
    }
});