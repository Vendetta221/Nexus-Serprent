// Защита от конфликтов с расширениями браузера
(function() {
    'use strict';
    
    // Изолируем window.ethereum если он существует
    if (typeof window.ethereum !== 'undefined') {
        try {
            // Создаем резервную копию для случая, если понадобится
            window._originalEthereum = window.ethereum;
            console.log('Ethereum provider detected and backed up');
        } catch (error) {
            console.log('Error backing up ethereum provider:', error);
        }
    }
    
    // Подавляем ошибки MetaMask
    const originalConsoleError = console.error;
    console.error = function(...args) {
        const message = args.join(' ');
        
        // Фильтруем ошибки MetaMask и других кошельков
        if (message.includes('MetaMask') || 
            message.includes('ethereum') || 
            message.includes('inpage.js') ||
            message.includes('Cannot set property ethereum')) {
            return; // Не показываем эти ошибки
        }
        
        // Показываем остальные ошибки
        originalConsoleError.apply(console, args);
    };
    
    // Подавляем ошибки Content Security Policy от расширений
    window.addEventListener('error', function(event) {
        if (event.message && (
            event.message.includes('Content Security Policy') ||
            event.message.includes('eval') ||
            event.message.includes('MetaMask') ||
            event.message.includes('inpage.js')
        )) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    }, true);
    
    // Подавляем unhandled promise rejections от расширений
    window.addEventListener('unhandledrejection', function(event) {
        if (event.reason && event.reason.message && (
            event.reason.message.includes('MetaMask') ||
            event.reason.message.includes('ethereum') ||
            event.reason.message.includes('inpage.js')
        )) {
            event.preventDefault();
            return false;
        }
    });
    
    console.log('Extension conflict protection loaded');
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

    // Создаем аудио контекст для звуков
    let audioContext;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.log('Web Audio API not supported');
    }

    // Функция для создания звука "дзынь"
    function playEatSound() {
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
            
            const scoresRef = firebaseFunctions.ref(database, 'scores');
            await Promise.race([
                firebaseFunctions.push(scoresRef, scoreData),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Save timeout')), 10000))
            ]);
            
            if (uploadMessageElement) {
                uploadMessageElement.textContent = '✅ Score saved online!';
                uploadMessageElement.style.color = '#4CAF50';
            }
            
            return true;
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
                        const scores = Object.values(data).sort((a, b) => b.score - a.score);
                        resolve(scores);
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
            
            const scoresRef = firebaseFunctions.ref(database, 'scores');
            const sortedQuery = firebaseFunctions.query(scoresRef, firebaseFunctions.orderByChild('score'));
            
            firebaseFunctions.onValue(sortedQuery, (snapshot) => {
                try {
                    const data = snapshot.val();
                    if (data) {
                        leaderboard = Object.values(data).sort((a, b) => b.score - a.score);
                        
                        // Обновляем рекорд
                        if (leaderboard.length > 0) {
                            highScore = Math.max(highScore, leaderboard[0].score);
                            highScoreElement.textContent = highScore;
                        }
                        
                        // Обновляем отображение если лидерборд открыт
                        if (leaderboardScreenElement && leaderboardScreenElement.style.display === 'block') {
                            displayMainLeaderboard();
                        }
                        
                        console.log(`Loaded ${leaderboard.length} scores from Firebase`);
                    }
                } catch (error) {
                    console.error('Error processing realtime update:', error);
                }
            }, (error) => {
                console.error('Firebase realtime error:', error);
                firebaseReady = false;
                
                if (connectionStatusElement) {
                    connectionStatusElement.innerHTML = '🔴 Connection lost, using local scores';
                    connectionStatusElement.style.color = '#f44336';
                }
            });
            
            if (connectionStatusElement) {
                connectionStatusElement.innerHTML = '🟢 Connected to online leaderboard';
                connectionStatusElement.style.color = '#4CAF50';
            }
            
        } catch (error) {
            console.error('Error setting up realtime updates:', error);
        }
    }

    // Локальное сохранение
    function loadLeaderboard() {
        try {
            const savedLeaderboard = localStorage.getItem('nexusserpent_leaderboard');
            if (savedLeaderboard) {
                const localData = JSON.parse(savedLeaderboard);
                if (localData && localData.length > 0) {
                    leaderboard = localData;
                    console.log(`Loaded ${leaderboard.length} local results`);
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
                        name: "Alex",
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
            // Fallback к localStorage если Firebase недоступен
            console.log('Falling back to localStorage');
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
            
            leaderboard.push(gameResult);
            leaderboard.sort((a, b) => b.score - a.score);
            saveLeaderboard();
            
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
        
        // Считаем уникальных игроков
        const uniquePlayers = [...new Set(leaderboard.map(entry => entry.name))];
        if (totalGamesElement) totalGamesElement.textContent = leaderboard.length;
        if (uniquePlayersElement) uniquePlayersElement.textContent = uniquePlayers.length;
        
        if (leaderboard.length === 0) {
            mainLeaderboardListElement.innerHTML = `
                <div style="text-align: center; color: #888888; padding: 20px;">
                    ${firebaseReady ? 'No scores yet' : 'Loading scores...'}<br><br>
                    ${firebaseReady ? 'Be the first to play!' : 'Please wait...'}
                </div>
            `;
            return;
        }
        
        // Показываем все результаты
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
                    ${entry.timestamp || 'Unknown time'}
                </div>
            `;
            
            mainLeaderboardListElement.appendChild(entryDiv);
        });
    }

    function displayLeaderboard() {
        if (!leaderboardListElement) return;
        
        leaderboardListElement.innerHTML = '';
        
        // Показываем топ-15 для компактности в окне Game Over
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
            
            // Подсвечиваем текущего игрока и его последний результат
            if (entry.name === playerNickname && entry.score === score) {
                entryDiv.style.background = 'rgba(255, 255, 255, 0.15)';
                entryDiv.style.borderRadius = '8px';
                entryDiv.style.border = '1px solid rgba(255, 255, 255, 0.4)';
            }
            
            let medal = '';
            if (index === 0) medal = '🥇';
            else if (index === 1) medal = '🥈';
            else if (index === 2) medal = '🥉';
            
            entryDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <span class="leaderboard-rank">${medal} #${index + 1}</span>
                    <span class="leaderboard-name" style="flex: 1; margin: 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${entry.name}</span>
                    <span class="leaderboard-score">${entry.score} pts</span>
                </div>
                <div style="font-size: 10px; color: #888888; margin-top: 2px;">
                    ${entry.timestamp || 'Unknown time'}
                </div>
            `;
            
            leaderboardListElement.appendChild(entryDiv);
        });
        
        // Показываем информацию о том, сколько всего результатов
        if (leaderboard.length > 15) {
            const moreDiv = document.createElement('div');
            moreDiv.style.textAlign = 'center';
            moreDiv.style.color = '#888888';
            moreDiv.style.fontSize = '12px';
            moreDiv.style.marginTop = '10px';
            moreDiv.innerHTML = `... and ${leaderboard.length - 15} more results`;
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
        
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('Audio context resumed');
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

    // Event listeners
    const startBtn = document.getElementById('startBtn');
    const restartBtn = document.getElementById('restartBtn');
    const viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn');
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    const refreshLeaderboardBtn = document.getElementById('refreshLeaderboardBtn');

    if (startBtn) {
        startBtn.addEventListener('click', startGame);
    }

    if (restartBtn) {
        restartBtn.addEventListener('click', restartGame);
    }

    if (viewLeaderboardBtn) {
        viewLeaderboardBtn.addEventListener('click', showLeaderboard);
    }

    if (backToMenuBtn) {
        backToMenuBtn.addEventListener('click', backToMenu);
    }

    if (refreshLeaderboardBtn) {
        refreshLeaderboardBtn.addEventListener('click', async function() {
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

    // Инициализация Firebase и игры
    async function initializeGame() {
        // Сначала загружаем локальные данные
        loadLeaderboard();
        
        try {
            // Ждем загрузки Firebase с таймаутом
            await Promise.race([
                waitForFirebase(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timeout')), 15000))
            ]);
            
            // Получаем Firebase объекты
            database = window.firebaseDB;
            firebaseFunctions = window.firebaseFunctions;
            firebaseReady = true;
            
            // Загружаем начальные данные из Firebase
            const initialData = await loadLeaderboardFromFirebase();
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
            
            console.log('Game initialized with Firebase');
            
            if (connectionStatusElement) {
                connectionStatusElement.innerHTML = '🟢 Connected to online leaderboard';
                connectionStatusElement.style.color = '#4CAF50';
            }
        } catch (error) {
            console.error('Firebase initialization failed:', error);
            firebaseReady = false;
            
            if (connectionStatusElement) {
                connectionStatusElement.innerHTML = '🔴 Offline mode (local scores only)';
                connectionStatusElement.style.color = '#f44336';
            }
        }
        
        // Инициализируем игру независимо от Firebase
        drawGame();
        if (nicknameInputElement) {
            nicknameInputElement.focus();
        }
        
        setInterval(gameLoop, 150);
    }

    // Слушаем ошибки Firebase
    window.addEventListener('firebaseError', (event) => {
        console.error('Firebase error event:', event.detail);
        firebaseReady = false;
        
        if (connectionStatusElement) {
            connectionStatusElement.innerHTML = '🔴 Firebase connection failed';
            connectionStatusElement.style.color = '#f44336';
        }
    });

    // Запускаем инициализацию
    initializeGame();
});
