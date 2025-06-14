// УСИЛЕННАЯ ЗАЩИТА ОТ РАСШИРЕНИЙ БРАУЗЕРА
(function() {
    'use strict';
    
    console.log('🛡️ Initializing extension protection...');
    
    // Заморозка объекта window.ethereum для предотвращения конфликтов
    if (typeof window.ethereum !== 'undefined') {
        try {
            // Создаем резервную копию
            window._originalEthereum = window.ethereum;
            
            // Заморозка свойства для предотвращения переопределений
            Object.defineProperty(window, 'ethereum', {
                value: window.ethereum,
                writable: false,
                configurable: false
            });
            
            console.log('✅ Ethereum provider protected from redefinition');
        } catch (error) {
            console.log('⚠️ Could not protect ethereum property:', error.message);
        }
    }
    
    // Перехват и подавление ошибок от расширений
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    // Список ключевых слов для фильтрации ошибок расширений
    const extensionErrorKeywords = [
        'MetaMask',
        'ethereum',
        'inpage.js',
        'evmAsk.js',
        'Cannot set property ethereum',
        'Cannot redefine property',
        'Could not establish connection',
        'Receiving end does not exist',
        'runtime.lastError',
        'Extension context invalidated',
        'chrome-extension://',
        'moz-extension://',
        'injected.js',
        'content-script.js'
    ];
    
    function shouldSuppressMessage(message) {
        const messageStr = String(message).toLowerCase();
        return extensionErrorKeywords.some(keyword => 
            messageStr.includes(keyword.toLowerCase())
        );
    }
    
    // Переопределяем console.error
    console.error = function(...args) {
        const message = args.join(' ');
        if (shouldSuppressMessage(message)) {
            return; // Подавляем ошибки расширений
        }
        originalConsoleError.apply(console, args);
    };
    
    // Переопределяем console.warn
    console.warn = function(...args) {
        const message = args.join(' ');
        if (shouldSuppressMessage(message)) {
            return; // Подавляем предупреждения расширений
        }
        originalConsoleWarn.apply(console, args);
    };
    
    // Подавляем глобальные ошибки от расширений
    window.addEventListener('error', function(event) {
        if (event.message && shouldSuppressMessage(event.message)) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
        
        // Проверяем источник ошибки
        if (event.filename && (
            event.filename.includes('chrome-extension://') ||
            event.filename.includes('moz-extension://') ||
            event.filename.includes('evmAsk.js') ||
            event.filename.includes('inpage.js')
        )) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    }, true);
    
    // Подавляем unhandled promise rejections от расширений
    window.addEventListener('unhandledrejection', function(event) {
        if (event.reason && event.reason.message && 
            shouldSuppressMessage(event.reason.message)) {
            event.preventDefault();
            return false;
        }
        
        // Проверяем стек ошибки
        if (event.reason && event.reason.stack && 
            shouldSuppressMessage(event.reason.stack)) {
            event.preventDefault();
            return false;
        }
    });
    
    // Защита от переопределения критических свойств
    const protectedProperties = ['ethereum', 'web3'];
    
    protectedProperties.forEach(prop => {
        if (typeof window[prop] !== 'undefined') {
            try {
                // Создаем геттер/сеттер для контроля доступа
                const originalValue = window[prop];
                let currentValue = originalValue;
                
                Object.defineProperty(window, prop, {
                    get: function() {
                        return currentValue;
                    },
                    set: function(newValue) {
                        // Логируем попытки изменения, но не мешаем
                        console.log(`🔒 Attempt to modify ${prop} detected and logged`);
                        currentValue = newValue;
                    },
                    configurable: false
                });
            } catch (error) {
                // Если не удалось защитить, продолжаем без ошибок
                console.log(`⚠️ Could not protect ${prop}:`, error.message);
            }
        }
    });
    
    // Дополнительная защита от runtime.lastError
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        const originalAddListener = chrome.runtime.onMessage.addListener;
        try {
            chrome.runtime.onMessage.addListener = function(callback) {
                const wrappedCallback = function(...args) {
                    try {
                        return callback.apply(this, args);
                    } catch (error) {
                        if (shouldSuppressMessage(error.message)) {
                            return; // Подавляем ошибки
                        }
                        throw error;
                    }
                };
                return originalAddListener.call(this, wrappedCallback);
            };
        } catch (error) {
            // Игнорируем ошибки защиты chrome API
        }
    }
    
    // Создаем безопасное окружение для нашего приложения
    window.APP_PROTECTED = true;
    window.EXTENSION_ERRORS_SUPPRESSED = true;
    
    console.log('✅ Extension protection initialized successfully');
    
})();

// Основной код игры
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    // Получаем все элементы DOM
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreElement = document.getElementById('scoreValue');
    const highScoreElement = document.getElementById('highScore');
    const gameOverElement = document.getElementById('gameOver');
    const finalScoreElement = document.getElementById('finalScore');
    const startScreenElement = document.getElementById('startScreen');
    const leaderboardScreenElement = document.getElementById('leaderboardScreen');
    const nicknameInputElement = document.getElementById('nicknameInput');
    const leaderboardListElement = document.getElementById('leaderboardList');
    const mainLeaderboardListElement = document.getElementById('mainLeaderboardList');
    const playerCountElement = document.getElementById('playerCount');
    const connectionStatusElement = document.getElementById('connectionStatus');
    const totalGamesElement = document.getElementById('totalGames');
    const uniquePlayersElement = document.getElementById('uniquePlayers');
    const uploadMessageElement = document.getElementById('uploadMessage');

    // Firebase переменные
    let firebaseReady = false;
    let database = null;
    let firebaseFunctions = null;

    // Создаем аудио контекст для звуков (только после взаимодействия)
    let audioContext;
    let audioInitialized = false;
    
    // Функция для инициализации аудио после взаимодействия пользователя
    function initializeAudio() {
        if (audioInitialized) return;
        
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioInitialized = true;
            console.log('✅ Audio context initialized');
        } catch (e) {
            console.log('⚠️ Web Audio API not supported');
        }
    }

    // Функция для создания звука "дзынь"
    function playEatSound() {
        // Инициализируем аудио при первом воспроизведении
        if (!audioInitialized) {
            initializeAudio();
        }
        
        if (!audioContext) return;
        
        try {
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
            oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.15);
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            oscillator.type = 'sine';
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
            
        } catch (error) {
            console.log('Error playing sound:', error);
        }
    }
    
    // Игровые переменные
    let gameState = 'start';
    let gameRunning = false;
    let gamePaused = false;
    let score = 0;
    let highScore = 0;
    let playerNickname = '';
    let leaderboard = [];

    // Детектируем окружение
    const isProduction = window.location.hostname.includes('github.io');
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // Адаптивный размер канваса
    function resizeCanvas() {
        const maxWidth = Math.min(500, window.innerWidth * 0.9);
        const maxHeight = Math.min(500, window.innerHeight * 0.6);
        const size = Math.min(maxWidth, maxHeight);
        
        canvas.width = size;
        canvas.height = size;
        
        return size;
    }

    const canvasSize = resizeCanvas();
    const gridSize = Math.max(15, Math.floor(canvasSize / 20));
    const tileCount = Math.floor(canvasSize / gridSize);

    let snake = [{x: Math.floor(tileCount/2), y: Math.floor(tileCount/2)}];
    let food = {};
    let dx = 0;
    let dy = 0;

    // Пересчет размера при изменении окна
    window.addEventListener('resize', function() {
        resizeCanvas();
    });

    // Firebase функции
    function waitForFirebase() {
        return new Promise((resolve, reject) => {
            if (window.firebaseReady) {
                resolve();
                return;
            }
            
            const timeout = setTimeout(() => {
                reject(new Error('Firebase timeout'));
            }, 10000);
            
            window.addEventListener('firebaseReady', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    async function saveScoreToFirebase(nickname, score) {
        try {
            if (!firebaseReady || !database || !firebaseFunctions) {
                console.log('Firebase not ready, skipping save');
                return false;
            }
            
            console.log(`Attempting to save score for ${nickname}: ${score}`);
            
            // Сначала ищем существующий результат этого игрока
            const scoresRef = firebaseFunctions.ref(database, 'scores');
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Save timeout'));
                }, 15000);
                
                // Получаем все результаты
                firebaseFunctions.onValue(scoresRef, async (snapshot) => {
                    try {
                        clearTimeout(timeout);
                        const data = snapshot.val();
                        let existingPlayerRecord = null;
                        let existingPlayerKey = null;
                        
                        // Ищем существующий результат игрока
                        if (data) {
                            for (const [key, record] of Object.entries(data)) {
                                if (record.name === nickname) {
                                    existingPlayerRecord = record;
                                    existingPlayerKey = key;
                                    break;
                                }
                            }
                        }
                        
                        const scoreData = {
                            name: nickname,
                            score: score,
                            timestamp: new Date().toLocaleString('en-US', {
                                day: '2-digit',
                                month: '2-digit',
                                year: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                            })
                        };
                        
                        if (existingPlayerRecord) {
                            if (score > existingPlayerRecord.score) {
                                // Новый результат лучше - удаляем старую запись и создаем новую
                                try {
                                    // Удаляем старую запись
                                    const oldRecordRef = firebaseFunctions.ref(database, `scores/${existingPlayerKey}`);
                                    await Promise.race([
                                        firebaseFunctions.remove(oldRecordRef),
                                        new Promise((_, reject) => setTimeout(() => reject(new Error('Delete timeout')), 5000))
                                    ]);
                                    
                                    // Добавляем новую запись
                                    await Promise.race([
                                        firebaseFunctions.push(scoresRef, scoreData),
                                        new Promise((_, reject) => setTimeout(() => reject(new Error('Add timeout')), 5000))
                                    ]);
                                    
                                    if (uploadMessageElement) {
                                        uploadMessageElement.textContent = `✅ New best score saved! (was ${existingPlayerRecord.score})`;
                                        uploadMessageElement.style.color = '#4CAF50';
                                    }
                                    
                                    console.log(`Updated ${nickname}'s best score from ${existingPlayerRecord.score} to ${score}`);
                                    resolve(true);
                                } catch (updateError) {
                                    console.error('Error updating Firebase record:', updateError);
                                    reject(updateError);
                                }
                            } else {
                                // Новый результат хуже или равен - не сохраняем
                                if (uploadMessageElement) {
                                    uploadMessageElement.textContent = `ℹ️ Score ${score} not saved (best: ${existingPlayerRecord.score})`;
                                    uploadMessageElement.style.color = '#2196F3';
                                }
                                
                                console.log(`Score ${score} not saved for ${nickname} (existing best: ${existingPlayerRecord.score})`);
                                resolve(false);
                            }
                        } else {
                            // Игрока нет - добавляем первый результат
                            await Promise.race([
                                firebaseFunctions.push(scoresRef, scoreData),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Add timeout')), 5000))
                            ]);
                            
                            if (uploadMessageElement) {
                                uploadMessageElement.textContent = '✅ First score saved!';
                                uploadMessageElement.style.color = '#4CAF50';
                            }
                            
                            console.log(`Saved first score for ${nickname}: ${score}`);
                            resolve(true);
                        }
                        
                    } catch (error) {
                        clearTimeout(timeout);
                        reject(error);
                    }
                }, {
                    onlyOnce: true
                });
            });
            
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            
            if (uploadMessageElement) {
                if (error.message.includes('timeout')) {
                    uploadMessageElement.textContent = '⏱️ Save timeout, saved locally';
                } else {
                    uploadMessageElement.textContent = '❌ Failed to save online, saved locally';
                }
                uploadMessageElement.style.color = '#f44336';
            }
            
            return false;
        }
    }

    async function loadLeaderboardFromFirebase() {
        try {
            if (!firebaseReady || !database || !firebaseFunctions) {
                return [];
            }
            
            const scoresRef = firebaseFunctions.ref(database, 'scores');
            const sortedQuery = firebaseFunctions.query(scoresRef, firebaseFunctions.orderByChild('score'));
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Load timeout'));
                }, 10000);
                
                firebaseFunctions.onValue(sortedQuery, (snapshot) => {
                    clearTimeout(timeout);
                    const data = snapshot.val();
                    if (data) {
                        // Фильтруем дубликаты игроков - оставляем только лучшие результаты
                        const playerBestScores = new Map();
                        
                        Object.values(data).forEach(entry => {
                            const existingScore = playerBestScores.get(entry.name);
                            if (!existingScore || entry.score > existingScore.score) {
                                playerBestScores.set(entry.name, entry);
                            }
                        });
                        
                        const uniqueScores = Array.from(playerBestScores.values()).sort((a, b) => b.score - a.score);
                        console.log(`Filtered ${uniqueScores.length} unique players from ${Object.keys(data).length} Firebase records`);
                        resolve(uniqueScores);
                    } else {
                        resolve([]);
                    }
                }, {
                    onlyOnce: true
                });
            });
        } catch (error) {
            console.error('Error loading from Firebase:', error);
            return [];
        }
    }

    function setupRealtimeLeaderboard() {
        try {
            if (!firebaseReady || !database || !firebaseFunctions) {
                console.log('Firebase not ready for realtime updates');
                return;
            }
            
            console.log('Setting up realtime leaderboard...');
            
            const scoresRef = firebaseFunctions.ref(database, 'scores');
            const sortedQuery = firebaseFunctions.query(scoresRef, firebaseFunctions.orderByChild('score'));
            
            // Слушаем изменения в данных
            firebaseFunctions.onValue(sortedQuery, (snapshot) => {
                try {
                    const data = snapshot.val();
                    if (data) {
                        // Фильтруем дубликаты игроков - оставляем только лучшие результаты
                        const playerBestScores = new Map();
                        
                        Object.values(data).forEach(entry => {
                            const existingScore = playerBestScores.get(entry.name);
                            if (!existingScore || entry.score > existingScore.score) {
                                playerBestScores.set(entry.name, entry);
                            }
                        });
                        
                        leaderboard = Array.from(playerBestScores.values()).sort((a, b) => b.score - a.score);
                        
                        // Обновляем рекорд
                        if (leaderboard.length > 0) {
                            highScore = Math.max(highScore, leaderboard[0].score);
                            highScoreElement.textContent = highScore;
                        }
                        
                        // Обновляем отображение если лидерборд открыт
                        if (leaderboardScreenElement && leaderboardScreenElement.style.display === 'block') {
                            displayMainLeaderboard();
                        }
                        
                        console.log(`Loaded ${leaderboard.length} unique players from ${Object.keys(data).length} Firebase records (realtime)`);
                        
                        // Подтверждаем что соединение работает
                        updateConnectionStatus('connected', '🟢 Connected to online leaderboard', '#4CAF50');
                    } else {
                        console.log('No data in Firebase leaderboard yet');
                        updateConnectionStatus('connected', '🟢 Connected (no data yet)', '#4CAF50');
                    }
                } catch (error) {
                    console.error('Error processing realtime update:', error);
                }
            }, (error) => {
                console.error('Firebase realtime error:', error);
                
                // Не отключаем Firebase полностью - возможно это временная проблема
                updateConnectionStatus('disconnected', '🟠 Realtime updates unavailable', '#ff9800');
            });
            
            console.log('Realtime leaderboard setup completed');
            
        } catch (error) {
            console.error('Error setting up realtime updates:', error);
            updateConnectionStatus('error', '🔴 Failed to setup realtime updates', '#f44336');
        }
    }

    // Локальное сохранение
    function loadLeaderboard() {
        try {
            const savedLeaderboard = localStorage.getItem('nexusserpent_leaderboard');
            if (savedLeaderboard) {
                const localData = JSON.parse(savedLeaderboard);
                if (localData && localData.length > 0) {
                    // Фильтруем дубликаты игроков - оставляем только лучшие результаты
                    const playerBestScores = new Map();
                    
                    localData.forEach(entry => {
                        const existingScore = playerBestScores.get(entry.name);
                        if (!existingScore || entry.score > existingScore.score) {
                            playerBestScores.set(entry.name, entry);
                        }
                    });
                    
                    leaderboard = Array.from(playerBestScores.values()).sort((a, b) => b.score - a.score);
                    console.log(`Loaded and filtered ${leaderboard.length} unique players from ${localData.length} local records`);
                }
            }
            
            // Если нет данных, добавляем демо-результаты
            if (leaderboard.length === 0) {
                leaderboard = [
                    {
                        name: "Alex",
                        score: 150,
                        timestamp: "12.06.24, 14:30"
                    },
                    {
                        name: "Maya",
                        score: 120,
                        timestamp: "12.06.24, 15:45"
                    },
                    {
                        name: "Sam",
                        score: 90,
                        timestamp: "12.06.24, 16:20"
                    }
                ];
                saveLeaderboard();
            }
            
            // Обновляем отображение рекорда
            if (leaderboard.length > 0) {
                const sortedLeaderboard = [...leaderboard].sort((a, b) => b.score - a.score);
                highScore = sortedLeaderboard[0].score;
                highScoreElement.textContent = highScore;
            }
        } catch (error) {
            console.log('Error loading leaderboard:', error);
            leaderboard = [];
        }
    }

    function saveLeaderboard() {
        try {
            localStorage.setItem('nexusserpent_leaderboard', JSON.stringify(leaderboard));
            console.log('Leaderboard saved to localStorage');
        } catch (error) {
            console.log('Error saving leaderboard:', error);
        }
    }

    // Обновляем статус соединения
    function updateConnectionStatus(status, message, color) {
        if (connectionStatusElement) {
            connectionStatusElement.innerHTML = message;
            connectionStatusElement.style.color = color;
        }
        
        // Добавляем отладочную информацию
        const debugInfo = document.getElementById('debugInfo');
        const envInfo = document.getElementById('envInfo');
        const protectionInfo = document.getElementById('protectionInfo');
        
        if (debugInfo && envInfo && !isProduction) {
            debugInfo.style.display = 'block';
            envInfo.textContent = `${isProduction ? 'Production' : 'Development'} | ${window.location.hostname} | Firebase: ${status}`;
        }
        
        if (protectionInfo) {
            const protectionStatus = window.APP_PROTECTED ? 'Active ✅' : 'Inactive ❌';
            protectionInfo.textContent = protectionStatus;
            protectionInfo.style.color = window.APP_PROTECTED ? '#4CAF50' : '#f44336';
        }
        
        console.log(`Connection status: ${status} - ${message}`);
        
        // Дополнительный лог для защиты
        if (window.EXTENSION_PROTECTION_LOG) {
            console.log('Extension protection log:', window.EXTENSION_PROTECTION_LOG);
        }
    }

    // Графические функции
    function drawCube(x, y, size, color1, color2, color3) {
        const actualX = x * gridSize;
        const actualY = y * gridSize;
        
        const gradient1 = ctx.createLinearGradient(actualX, actualY, actualX + size, actualY + size);
        gradient1.addColorStop(0, color1);
        gradient1.addColorStop(1, color2);
        
        ctx.fillStyle = gradient1;
        ctx.fillRect(actualX, actualY, size, size);
        
        const offset = Math.max(3, Math.floor(gridSize * 0.25));
        
        ctx.fillStyle = color2;
        ctx.beginPath();
        ctx.moveTo(actualX + size, actualY);
        ctx.lineTo(actualX + size + offset, actualY - offset);
        ctx.lineTo(actualX + size + offset, actualY + size - offset);
        ctx.lineTo(actualX + size, actualY + size);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = color3;
        ctx.beginPath();
        ctx.moveTo(actualX, actualY);
        ctx.lineTo(actualX + offset, actualY - offset);
        ctx.lineTo(actualX + size + offset, actualY - offset);
        ctx.lineTo(actualX + size, actualY);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(actualX, actualY, size, size);
    }

    function generateFood() {
        food = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount)
        };
        
        for (let segment of snake) {
            if (segment.x === food.x && segment.y === food.y) {
                generateFood();
                break;
            }
        }
    }

    function drawGame() {
        const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        bgGradient.addColorStop(0, '#0f0f0f');
        bgGradient.addColorStop(0.5, '#1a1a1a');
        bgGradient.addColorStop(1, '#0f0f0f');
        
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= tileCount; i++) {
            ctx.beginPath();
            ctx.moveTo(i * gridSize, 0);
            ctx.lineTo(i * gridSize, canvas.height);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, i * gridSize);
            ctx.lineTo(canvas.width, i * gridSize);
            ctx.stroke();
        }
        
        if (gameState === 'playing') {
            snake.forEach((segment, index) => {
                if (index === 0) {
                    drawCube(segment.x, segment.y, gridSize - 2, '#ffffff', '#e0e0e0', '#f0f0f0');
                } else {
                    const intensity = Math.max(0.4, 1 - (index * 0.1));
                    const color1 = `rgba(255, 255, 255, ${intensity})`;
                    const color2 = `rgba(200, 200, 200, ${intensity})`;
                    const color3 = `rgba(230, 230, 230, ${intensity})`;
                    drawCube(segment.x, segment.y, gridSize - 2, color1, color2, color3);
                }
            });
            
            const pulseIntensity = 0.8 + 0.2 * Math.sin(Date.now() * 0.01);
            const foodColor1 = `rgba(255, 255, 255, ${pulseIntensity})`;
            const foodColor2 = `rgba(180, 180, 180, ${pulseIntensity})`;
            const foodColor3 = `rgba(220, 220, 220, ${pulseIntensity})`;
            
            drawCube(food.x, food.y, gridSize - 4, foodColor1, foodColor2, foodColor3);
            
            const actualFoodX = food.x * gridSize + gridSize / 2;
            const actualFoodY = food.y * gridSize + gridSize / 2;
            const glowRadius = Math.max(20, gridSize * 1.5);
            
            const glowGradient = ctx.createRadialGradient(actualFoodX, actualFoodY, 0, actualFoodX, actualFoodY, glowRadius);
            glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
            glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.fillStyle = glowGradient;
            ctx.fillRect(actualFoodX - glowRadius, actualFoodY - glowRadius, glowRadius * 2, glowRadius * 2);
        }
    }

    // Игровая логика
    function moveSnake() {
        if (gameState !== 'playing' || !gameRunning || gamePaused) return;
        if (dx === 0 && dy === 0) return;
        
        const head = {x: snake[0].x + dx, y: snake[0].y + dy};
        
        if (head.x < 0) {
            head.x = tileCount - 1;
        } else if (head.x >= tileCount) {
            head.x = 0;
        }
        
        if (head.y < 0) {
            head.y = tileCount - 1;
        } else if (head.y >= tileCount) {
            head.y = 0;
        }
        
        for (let i = 1; i < snake.length; i++) {
            if (head.x === snake[i].x && head.y === snake[i].y) {
                gameOver();
                return;
            }
        }
        
        snake.unshift(head);
        
        if (head.x === food.x && head.y === food.y) {
            score += 10;
            scoreElement.textContent = score;
            playEatSound();
            generateFood();
        } else {
            snake.pop();
        }
    }

    function gameOver() {
        gameState = 'gameOver';
        gameRunning = false;
        finalScoreElement.textContent = score;
        updateLeaderboard();
        gameOverElement.style.display = 'block';
    }

    async function updateLeaderboard() {
        // Сохраняем результат в Firebase
        const saveSuccess = await saveScoreToFirebase(playerNickname, score);
        
        if (!saveSuccess) {
            // Fallback к localStorage если Firebase недоступен или результат не был лучшим
            console.log('Updating local leaderboard...');
            
            const gameResult = {
                name: playerNickname,
                score: score,
                timestamp: new Date().toLocaleString('en-US', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            };
            
            // Ищем существующий результат игрока в локальном лидерборде
            const existingPlayerIndex = leaderboard.findIndex(entry => entry.name === playerNickname);
            
            if (existingPlayerIndex !== -1) {
                // Игрок уже есть - проверяем результат
                if (score > leaderboard[existingPlayerIndex].score) {
                    // Новый результат лучше - заменяем
                    leaderboard[existingPlayerIndex] = gameResult;
                    console.log(`Updated local best score for ${playerNickname}: ${leaderboard[existingPlayerIndex].score} → ${score}`);
                    
                    if (uploadMessageElement && !saveSuccess) {
                        uploadMessageElement.textContent = `✅ New local best! (was ${leaderboard[existingPlayerIndex].score})`;
                        uploadMessageElement.style.color = '#4CAF50';
                    }
                } else {
                    // Новый результат хуже - не сохраняем
                    console.log(`Local score ${score} not saved for ${playerNickname} (existing best: ${leaderboard[existingPlayerIndex].score})`);
                    
                    if (uploadMessageElement && !saveSuccess) {
                        uploadMessageElement.textContent = `ℹ️ Local score not saved (best: ${leaderboard[existingPlayerIndex].score})`;
                        uploadMessageElement.style.color = '#2196F3';
                    }
                }
            } else {
                // Игрока нет - добавляем первый результат
                leaderboard.push(gameResult);
                console.log(`Added first local score for ${playerNickname}: ${score}`);
                
                if (uploadMessageElement && !saveSuccess) {
                    uploadMessageElement.textContent = '✅ First local score saved!';
                    uploadMessageElement.style.color = '#4CAF50';
                }
            }
            
            // Сортируем лидерборд
            leaderboard.sort((a, b) => b.score - a.score);
            saveLeaderboard();
            
            // Обновляем рекорд
            if (leaderboard.length > 0) {
                highScore = Math.max(highScore, leaderboard[0].score);
                highScoreElement.textContent = highScore;
            }
        }
        
        displayLeaderboard();
    }

    // Отображение лидерборда
    function displayMainLeaderboard() {
        if (!mainLeaderboardListElement) return;
        
        mainLeaderboardListElement.innerHTML = '';
        
        // Считаем статистику
        const uniquePlayers = leaderboard.length; // Теперь каждая запись = уникальный игрок
        if (totalGamesElement) totalGamesElement.textContent = uniquePlayers; // Показываем количество персональных рекордов
        if (uniquePlayersElement) uniquePlayersElement.textContent = uniquePlayers;
        
        if (leaderboard.length === 0) {
            mainLeaderboardListElement.innerHTML = `
                <div style="text-align: center; color: #888888; padding: 20px;">
                    ${firebaseReady ? 'No records yet' : 'Loading records...'}<br><br>
                    ${firebaseReady ? 'Be the first to set a record!' : 'Please wait...'}
                </div>
            `;
            return;
        }
        
        // Показываем все персональные рекорды
        leaderboard.forEach((entry, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'leaderboard-entry';
            entryDiv.style.flexDirection = 'column';
            entryDiv.style.alignItems = 'flex-start';
            entryDiv.style.padding = '10px 0';
            
            let medal = '';
            if (index === 0) medal = '🥇';
            else if (index === 1) medal = '🥈';
            else if (index === 2) medal = '🥉';
            
            if (index < 3) {
                entryDiv.style.background = 'rgba(255, 215, 0, 0.1)';
                entryDiv.style.borderRadius = '8px';
                entryDiv.style.border = '1px solid rgba(255, 215, 0, 0.3)';
            }
            
            // Подсвечиваем текущего игрока
            if (entry.name === playerNickname) {
                entryDiv.style.background = 'rgba(255, 255, 255, 0.1)';
                entryDiv.style.borderRadius = '8px';
                entryDiv.style.border = '1px solid rgba(255, 255, 255, 0.4)';
            }
            
            entryDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <span class="leaderboard-rank">${medal} #${index + 1}</span>
                    <span class="leaderboard-name" style="flex: 1; margin: 0 10px;">${entry.name}</span>
                    <span class="leaderboard-score">${entry.score} pts</span>
                </div>
                <div style="font-size: 11px; color: #888888; margin-top: 3px;">
                    Personal Best • ${entry.timestamp || 'Unknown time'}
                </div>
            `;
            
            mainLeaderboardListElement.appendChild(entryDiv);
        });
    }

    function displayLeaderboard() {
        if (!leaderboardListElement) return;
        
        leaderboardListElement.innerHTML = '';
        
        // Показываем топ-15 персональных рекордов для компактности в окне Game Over
        const topFifteen = leaderboard.slice(0, 15);
        
        if (topFifteen.length === 0) {
            leaderboardListElement.innerHTML = '<div style="text-align: center; color: #888888;">Loading scores...</div>';
            return;
        }
        
        topFifteen.forEach((entry, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'leaderboard-entry';
            entryDiv.style.flexDirection = 'column';
            entryDiv.style.alignItems = 'flex-start';
            entryDiv.style.padding = '8px 0';
            
            // Подсвечиваем текущего игрока
            const isCurrentPlayer = entry.name === playerNickname;
            if (isCurrentPlayer) {
                entryDiv.style.background = 'rgba(255, 255, 255, 0.15)';
                entryDiv.style.borderRadius = '8px';
                entryDiv.style.border = '1px solid rgba(255, 255, 255, 0.4)';
            }
            
            let medal = '';
            if (index === 0) medal = '🥇';
            else if (index === 1) medal = '🥈';
            else if (index === 2) medal = '🥉';
            
            // Определяем статус результата для текущего игрока
            let statusText = 'Personal Best';
            if (isCurrentPlayer) {
                if (score > entry.score) {
                    statusText = `New PB! (was ${entry.score})`;
                } else if (score === entry.score) {
                    statusText = 'Personal Best (this game)';
                } else {
                    statusText = `Personal Best (${entry.score})`;
                }
            }
            
            entryDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <span class="leaderboard-rank">${medal} #${index + 1}</span>
                    <span class="leaderboard-name" style="flex: 1; margin: 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${entry.name}</span>
                    <span class="leaderboard-score">${entry.score} pts</span>
                </div>
                <div style="font-size: 10px; color: #888888; margin-top: 2px;">
                    ${statusText} • ${entry.timestamp || 'Unknown time'}
                </div>
            `;
            
            leaderboardListElement.appendChild(entryDiv);
        });
        
        // Показываем информацию о том, сколько всего персональных рекордов
        if (leaderboard.length > 15) {
            const moreDiv = document.createElement('div');
            moreDiv.style.textAlign = 'center';
            moreDiv.style.color = '#888888';
            moreDiv.style.fontSize = '12px';
            moreDiv.style.marginTop = '10px';
            moreDiv.innerHTML = `... and ${leaderboard.length - 15} more players`;
            leaderboardListElement.appendChild(moreDiv);
        }
    }

    // UI функции
    async function showLeaderboard() {
        console.log('Show leaderboard clicked');
        
        // Обновляем лидерборд перед показом
        if (firebaseReady) {
            const freshData = await loadLeaderboardFromFirebase();
            if (freshData.length > 0) {
                leaderboard = freshData;
            }
        }
        
        displayMainLeaderboard();
        startScreenElement.style.display = 'none';
        leaderboardScreenElement.style.display = 'block';
    }

    function backToMenu() {
        console.log('Back to menu clicked');
        leaderboardScreenElement.style.display = 'none';
        startScreenElement.style.display = 'block';
    }

    function startGame() {
        console.log('Start game clicked');
        
        // Инициализируем аудио при первом взаимодействии пользователя
        if (!audioInitialized) {
            initializeAudio();
        }
        
        // Возобновляем аудио контекст если он приостановлен
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('Audio context resumed');
            }).catch((error) => {
                console.log('Error resuming audio context:', error);
            });
        }
        
        const nickname = nicknameInputElement.value.trim();
        if (nickname === '') {
            alert('Please enter your nickname!');
            return;
        }
        
        playerNickname = nickname;
        gameState = 'playing';
        gameRunning = true;
        gamePaused = false;
        score = 0;
        scoreElement.textContent = score;
        
        snake = [{x: Math.floor(tileCount/2), y: Math.floor(tileCount/2)}];
        dx = 0;
        dy = 0;
        
        generateFood();
        startScreenElement.style.display = 'none';
    }

    function restartGame() {
        console.log('Restart game clicked');
        gameState = 'start';
        gameRunning = false;
        gamePaused = false;
        score = 0;
        scoreElement.textContent = score;
        
        snake = [{x: Math.floor(tileCount/2), y: Math.floor(tileCount/2)}];
        dx = 0;
        dy = 0;
        
        gameOverElement.style.display = 'none';
        startScreenElement.style.display = 'block';
        nicknameInputElement.value = playerNickname;
        nicknameInputElement.focus();
    }

    function gameLoop() {
        moveSnake();
        drawGame();
    }

    // Инициализация Firebase и игры
    async function initializeGame() {
        // Сначала загружаем локальные данные
        loadLeaderboard();
        
        updateConnectionStatus('connecting', '🔄 Connecting to online leaderboard...', '#888');
        
        try {
            console.log('Waiting for Firebase initialization...');
            
            // Увеличиваем таймаут для GitHub Pages
            const timeoutMs = isProduction ? 30000 : 15000;
            
            await Promise.race([
                waitForFirebase(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timeout')), timeoutMs))
            ]);
            
            console.log('Firebase ready event received');
            
            // Получаем Firebase объекты
            database = window.firebaseDB;
            firebaseFunctions = window.firebaseFunctions;
            
            if (!database || !firebaseFunctions) {
                throw new Error('Firebase objects not available');
            }
            
            firebaseReady = true;
            
            // Пробуем загрузить данные - это более надежный тест чем .info/connected
            console.log('Testing Firebase with actual data load...');
            
            try {
                const initialData = await loadLeaderboardFromFirebase();
                console.log(`Successfully loaded ${initialData.length} scores from Firebase`);
                
                if (initialData.length > 0) {
                    leaderboard = initialData;
                    
                    // Обновляем рекорд
                    if (leaderboard.length > 0) {
                        highScore = Math.max(highScore, leaderboard[0].score);
                        highScoreElement.textContent = highScore;
                    }
                }
                
                // Настраиваем real-time обновления
                setupRealtimeLeaderboard();
                
                updateConnectionStatus('connected', '🟢 Connected to online leaderboard', '#4CAF50');
                console.log('Firebase connection confirmed by data load');
                
            } catch (loadError) {
                console.warn('Could not load initial data, but Firebase may still work:', loadError);
                
                // Все равно пробуем настроить real-time обновления
                setupRealtimeLeaderboard();
                
                updateConnectionStatus('partial', '🟡 Partial connection (writes may work)', '#ff9800');
            }
            
        } catch (error) {
            console.error('Firebase initialization failed:', error);
            firebaseReady = false;
            
            let errorMessage = '🔴 Offline mode (local scores only)';
            
            if (error.message.includes('timeout')) {
                errorMessage = '⏱️ Connection timeout (using local scores)';
            } else if (error.message.includes('blocked')) {
                errorMessage = '🚫 Connection blocked (using local scores)';
            }
            
            updateConnectionStatus('failed', errorMessage, '#f44336');
        }
        
        // Инициализируем игру независимо от Firebase
        drawGame();
        if (nicknameInputElement) {
            nicknameInputElement.focus();
        }
        
        setInterval(gameLoop, 150);
    }

    // Event listeners
    const startBtn = document.getElementById('startBtn');
    const restartBtn = document.getElementById('restartBtn');
    const viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn');
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    const refreshLeaderboardBtn = document.getElementById('refreshLeaderboardBtn');

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            initializeAudio(); // Инициализируем аудио при клике
            startGame();
        });
    }

    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            initializeAudio(); // Инициализируем аудио при клике
            restartGame();
        });
    }

    if (viewLeaderboardBtn) {
        viewLeaderboardBtn.addEventListener('click', () => {
            initializeAudio(); // Инициализируем аудио при клике
            showLeaderboard();
        });
    }

    if (backToMenuBtn) {
        backToMenuBtn.addEventListener('click', () => {
            initializeAudio(); // Инициализируем аудио при клике
            backToMenu();
        });
    }

    if (refreshLeaderboardBtn) {
        refreshLeaderboardBtn.addEventListener('click', async function() {
            initializeAudio(); // Инициализируем аудио при клике
            
            this.innerHTML = '🔄 Loading...';
            this.disabled = true;
            
            if (firebaseReady) {
                const freshData = await loadLeaderboardFromFirebase();
                if (freshData.length > 0) {
                    leaderboard = freshData;
                    displayMainLeaderboard();
                }
            }
            
            this.innerHTML = '🔄 REFRESH';
            this.disabled = false;
        });
    }

    if (nicknameInputElement) {
        nicknameInputElement.addEventListener('keydown', (e) => {
            if (e.code === 'Enter') {
                initializeAudio(); // Инициализируем аудио при Enter
                startGame();
            }
        });
    }

    // Управление клавиатурой
    document.addEventListener('keydown', (e) => {
        if (gameState !== 'playing' || !gameRunning) return;
        
        if (e.code === 'Space') {
            e.preventDefault();
            gamePaused = !gamePaused;
            return;
        }
        
        if (gamePaused) return;
        
        switch(e.code) {
            case 'ArrowUp':
            case 'KeyW':
                if (dy !== 1) {
                    dx = 0;
                    dy = -1;
                }
                break;
            case 'ArrowDown':
            case 'KeyS':
                if (dy !== -1) {
                    dx = 0;
                    dy = 1;
                }
                break;
            case 'ArrowLeft':
            case 'KeyA':
                if (dx !== 1) {
                    dx = -1;
                    dy = 0;
                }
                break;
            case 'ArrowRight':
            case 'KeyD':
                if (dx !== -1) {
                    dx = 1;
                    dy = 0;
                }
                break;
        }
    });

    // Слушаем события Firebase
    window.addEventListener('firebaseReady', (event) => {
        console.log('Firebase ready event received in main script');
    });

    window.addEventListener('firebaseError', (event) => {
        console.error('Firebase error event:', event.detail);
        firebaseReady = false;
        updateConnectionStatus('error', '🔴 Firebase connection failed', '#f44336');
    });

    // Запускаем инициализацию
    initializeGame();
    
    // Глобальные функции для отладки
    window.debugGameStatus = function() {
        console.log('🎮 Game Debug Status:', {
            gameState,
            gameRunning,
            score,
            playerNickname,
            isProduction,
            isLocalhost,
            firebaseReady,
            leaderboardLength: leaderboard.length,
            uniquePlayersCount: leaderboard.length,
            protectionActive: window.APP_PROTECTED,
            extensionErrorsSuppressed: window.EXTENSION_ERRORS_SUPPRESSED,
            personalBestSystem: 'enabled'
        });
        
        // Показываем персональные рекорды текущего игрока
        if (playerNickname) {
            const currentPlayerRecord = leaderboard.find(entry => entry.name === playerNickname);
            console.log(`📊 ${playerNickname}'s record:`, currentPlayerRecord || 'No record yet');
        }
    };
    
    window.debugPersonalBestSystem = function() {
        console.log('🏆 Personal Best System Info:', {
            enabled: true,
            description: 'Each player can have only one record - their best score',
            totalRecords: leaderboard.length,
            uniquePlayers: leaderboard.length,
            recordsPreview: leaderboard.slice(0, 5).map(entry => ({
                name: entry.name,
                score: entry.score,
                timestamp: entry.timestamp
            }))
        });
        
        // Проверяем дубликаты (их не должно быть)
        const nameCount = {};
        leaderboard.forEach(entry => {
            nameCount[entry.name] = (nameCount[entry.name] || 0) + 1;
        });
        
        const duplicates = Object.entries(nameCount).filter(([name, count]) => count > 1);
        console.log('🔍 Duplicate check:', duplicates.length === 0 ? 'No duplicates found ✅' : 'Duplicates detected ❌', duplicates);
    };
    
    window.debugFirebaseConnection = function() {
        if (firebaseReady && database) {
            console.log('🔥 Testing Firebase connection...');
            
            // Тест записи
            const testRef = firebaseFunctions.ref(database, 'debug_test');
            firebaseFunctions.push(testRef, {
                test: 'personal_best_system',
                timestamp: Date.now(),
                url: window.location.href
            }).then(() => {
                console.log('✅ Firebase write test successful');
                updateConnectionStatus('connected', '🟢 Connection confirmed by test write', '#4CAF50');
            }).catch((error) => {
                console.log('❌ Firebase write test failed:', error);
                updateConnectionStatus('readonly', '🟡 Read-only connection detected', '#ff9800');
            });
            
            // Тест чтения
            const scoresRef = firebaseFunctions.ref(database, 'scores');
            firebaseFunctions.onValue(scoresRef, (snapshot) => {
                const data = snapshot.val();
                const totalRecords = data ? Object.keys(data).length : 0;
                const uniquePlayers = data ? [...new Set(Object.values(data).map(entry => entry.name))].length : 0;
                
                console.log('✅ Firebase read test result:', {
                    totalRecords,
                    uniquePlayers,
                    personalBestFiltering: totalRecords > uniquePlayers ? 'needed' : 'not needed'
                });
            }, {
                onlyOnce: true
            });
        } else {
            console.log('❌ Firebase not ready for testing');
            console.log('Debug info:', {
                firebaseReady,
                database: !!database,
                firebaseFunctions: !!firebaseFunctions,
                windowFirebaseDB: !!window.firebaseDB,
                windowFirebaseReady: !!window.firebaseReady
            });
        }
    };
    
    window.debugExtensionProtection = function() {
        console.log('🛡️ Extension Protection Status:', {
            appProtected: window.APP_PROTECTED,
            errorsSuppressed: window.EXTENSION_ERRORS_SUPPRESSED,
            ethereumExists: typeof window.ethereum !== 'undefined',
            protectionLog: window.EXTENSION_PROTECTION_LOG || [],
            userAgent: navigator.userAgent,
            extensionScripts: Array.from(document.querySelectorAll('script')).filter(s => 
                s.src && (s.src.includes('extension://') || s.src.includes('moz-extension://'))
            ).length
        });
    };
    
    // Автоматическая отладка через 5 секунд после загрузки
    setTimeout(() => {
        if (!isProduction) {
            console.log('📊 Automatic debug report:');
            window.debugGameStatus();
            window.debugPersonalBestSystem();
            window.debugExtensionProtection();
            window.debugFirebaseConnection();
        }
    }, 5000);
    
});
