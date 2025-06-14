// Ждем полной загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded'); // Для отладки
    
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

    // Адаптивный размер канваса
    function resizeCanvas() {
        const maxWidth = Math.min(500, window.innerWidth * 0.9);
        const maxHeight = Math.min(500, window.innerHeight * 0.6);
        const size = Math.min(maxWidth, maxHeight);
        
        canvas.width = size;
        canvas.height = size;
        
        return size;
    }

    // Проверяем, что все элементы найдены
    console.log('Canvas:', canvas);
    console.log('Start screen:', startScreenElement);

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
            // Возобновляем контекст если он приостановлен
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            // Подключаем oscillator к gain и к выходу
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Настраиваем звук "дзынь" - высокая частота с быстрым затуханием
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
            oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.15);
            
            // Настраиваем громкость с быстрым затуханием
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            // Используем синусоидальную волну для чистого звука
            oscillator.type = 'sine';
            
            // Запускаем и останавливаем звук
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
            
        } catch (error) {
            console.log('Error playing sound:', error);
        }
    }
    
    let gameState = 'start';
    let gameRunning = false;
    let gamePaused = false;
    let score = 0;
    let highScore = 0;
    let playerNickname = '';
    let leaderboard = [];

    const canvasSize = resizeCanvas();
    const gridSize = Math.max(15, Math.floor(canvasSize / 20)); // Адаптивный размер сетки
    const tileCount = Math.floor(canvasSize / gridSize);

    let snake = [{x: Math.floor(tileCount/2), y: Math.floor(tileCount/2)}];
    let food = {};
    let dx = 0;
    let dy = 0;

    highScoreElement.textContent = highScore;

    // Пересчет размера при изменении окна
    window.addEventListener('resize', function() {
        resizeCanvas();
    });

    function drawCube(x, y, size, color1, color2, color3) {
        const actualX = x * gridSize;
        const actualY = y * gridSize;
        
        const gradient1 = ctx.createLinearGradient(actualX, actualY, actualX + size, actualY + size);
        gradient1.addColorStop(0, color1);
        gradient1.addColorStop(1, color2);
        
        ctx.fillStyle = gradient1;
        ctx.fillRect(actualX, actualY, size, size);
        
        // Делаем 3D эффект пропорциональным размеру
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
            playEatSound(); // Воспроизводим звук "дзынь"
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

    function updateLeaderboard() {
        // Ищем существующего игрока в лидерборде
        const existingPlayerIndex = leaderboard.findIndex(entry => entry.name === playerNickname);
        
        if (existingPlayerIndex !== -1) {
            // Игрок уже есть в лидерборде - обновляем только если новый результат лучше
            if (score > leaderboard[existingPlayerIndex].score) {
                leaderboard[existingPlayerIndex].score = score;
                console.log(`Updated ${playerNickname}'s best score to ${score}`);
            } else {
                console.log(`${playerNickname}'s score ${score} is not better than their best ${leaderboard[existingPlayerIndex].score}`);
            }
        } else {
            // Новый игрок - добавляем в лидерборд
            leaderboard.push({
                name: playerNickname,
                score: score
            });
            console.log(`Added new player ${playerNickname} with score ${score}`);
        }
        
        // Сортируем по убыванию очков
        leaderboard.sort((a, b) => b.score - a.score);
        
        if (leaderboard.length > 0) {
            highScore = leaderboard[0].score;
            highScoreElement.textContent = highScore;
        }
        
        displayLeaderboard();
    }

    function displayMainLeaderboard() {
        mainLeaderboardListElement.innerHTML = '';
        playerCountElement.textContent = `Unique Players: ${leaderboard.length}`;
        
        if (leaderboard.length === 0) {
            mainLeaderboardListElement.innerHTML = '<div style="text-align: center; color: #888888; padding: 20px;">No scores yet<br><br>Play your first game to start the leaderboard!</div>';
            return;
        }
        
        leaderboard.forEach((entry, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'leaderboard-entry';
            
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
                <span class="leaderboard-rank">${medal} #${index + 1}</span>
                <span class="leaderboard-name">${entry.name}</span>
                <span class="leaderboard-score">${entry.score} pts</span>
            `;
            
            mainLeaderboardListElement.appendChild(entryDiv);
        });
    }

    function displayLeaderboard() {
        leaderboardListElement.innerHTML = '';
        
        const topTen = leaderboard.slice(0, 10);
        
        topTen.forEach((entry, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'leaderboard-entry';
            
            // Подсвечиваем текущего игрока (не важно, является ли это его новым результатом)
            if (entry.name === playerNickname) {
                entryDiv.style.background = 'rgba(255, 255, 255, 0.1)';
                entryDiv.style.borderRadius = '8px';
                
                // Дополнительная подсветка если это был новый рекорд игрока
                if (score === entry.score) {
                    entryDiv.style.border = '1px solid rgba(255, 255, 255, 0.3)';
                }
            }
            
            let medal = '';
            if (index === 0) medal = '🥇';
            else if (index === 1) medal = '🥈';
            else if (index === 2) medal = '🥉';
            
            entryDiv.innerHTML = `
                <span class="leaderboard-rank">${medal} #${index + 1}</span>
                <span class="leaderboard-name">${entry.name}</span>
                <span class="leaderboard-score">${entry.score} pts</span>
            `;
            
            leaderboardListElement.appendChild(entryDiv);
        });
        
        if (leaderboard.length === 0) {
            leaderboardListElement.innerHTML = '<div style="text-align: center; color: #888888;">No scores yet</div>';
        }
    }

    function showLeaderboard() {
        console.log('Show leaderboard clicked'); // Для отладки
        displayMainLeaderboard();
        startScreenElement.style.display = 'none';
        leaderboardScreenElement.style.display = 'block';
    }

    function backToMenu() {
        console.log('Back to menu clicked'); // Для отладки
        leaderboardScreenElement.style.display = 'none';
        startScreenElement.style.display = 'block';
        nicknameInputElement.focus();
    }

    function startGame() {
        console.log('Start game clicked'); // Для отладки
        
        // Активируем аудио контекст при первом взаимодействии
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
        console.log('Restart game clicked'); // Для отладки
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

    if (startBtn) {
        startBtn.addEventListener('click', startGame);
        console.log('Start button listener added');
    }

    if (restartBtn) {
        restartBtn.addEventListener('click', restartGame);
        console.log('Restart button listener added');
    }

    if (viewLeaderboardBtn) {
        viewLeaderboardBtn.addEventListener('click', showLeaderboard);
        console.log('View leaderboard button listener added');
    }

    if (backToMenuBtn) {
        backToMenuBtn.addEventListener('click', backToMenu);
        console.log('Back to menu button listener added');
    }

    if (nicknameInputElement) {
        nicknameInputElement.addEventListener('keydown', (e) => {
            if (e.code === 'Enter') {
                startGame();
            }
        });
    }

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

    // Инициализация
    drawGame();
    if (nicknameInputElement) {
        nicknameInputElement.focus();
    }
    
    setInterval(gameLoop, 150);
    
    console.log('Game initialized');
});