const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.static('public'));

// Хранение пользователей и истории сообщений
const users = new Map();
const messageHistory = [];
const MAX_HISTORY = 100;

// Socket.io обработчики
io.on('connection', (socket) => {
  console.log('Новый пользователь подключился');

  // Обработка входа пользователя
  socket.on('user-join', (username) => {
    users.set(socket.id, {
      id: socket.id,
      username: username,
      joinedAt: new Date()
    });

    // Отправляем историю сообщений новому пользователю
    socket.emit('message-history', messageHistory);

    // Уведомляем всех о новом пользователе
    io.emit('user-joined', {
      username: username,
      timestamp: new Date(),
      onlineUsers: Array.from(users.values())
    });

    // Отправляем системное сообщение
    const joinMessage = {
      id: Date.now(),
      type: 'system',
      text: `${username} присоединился к чату`,
      timestamp: new Date()
    };
    
    messageHistory.push(joinMessage);
    if (messageHistory.length > MAX_HISTORY) {
      messageHistory.shift();
    }
    
    io.emit('new-message', joinMessage);
  });

  // Обработка новых сообщений
  socket.on('send-message', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = {
      id: Date.now(),
      type: 'user',
      username: user.username,
      text: data.text,
      timestamp: new Date(),
      userId: socket.id
    };

    messageHistory.push(message);
    if (messageHistory.length > MAX_HISTORY) {
      messageHistory.shift();
    }

    io.emit('new-message', message);
  });

  // Обработка печатания
  socket.on('typing', (isTyping) => {
    const user = users.get(socket.id);
    if (!user) return;

    socket.broadcast.emit('user-typing', {
      username: user.username,
      isTyping: isTyping
    });
  });

  // Обработка отключения
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);

      // Уведомляем всех об уходе пользователя
      const leaveMessage = {
        id: Date.now(),
        type: 'system',
        text: `${user.username} покинул чат`,
        timestamp: new Date()
      };

      messageHistory.push(leaveMessage);
      if (messageHistory.length > MAX_HISTORY) {
        messageHistory.shift();
      }

      io.emit('new-message', leaveMessage);
      io.emit('user-left', {
        username: user.username,
        onlineUsers: Array.from(users.values())
      });
    }
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});