import { WebsimSocket } from 'https://esm.sh/@websim/client';

class FingerGame {
    constructor() {
        this.room = new WebsimSocket();
        
        // UI Elements
        this.touchZone = document.getElementById('touchZone');
        this.instructionText = document.getElementById('instructionText');
        this.livesDisplay = document.getElementById('livesDisplay');
        this.hearts = document.getElementById('hearts');
        this.timerDisplay = document.getElementById('timer');
        this.gameOverModal = document.getElementById('gameOverModal');
        this.restartBtn = document.getElementById('restartBtn');
        this.playersContainer = document.getElementById('playersContainer');

        // Game State
        this.gameState = 'idle'; // 'idle', 'active', 'grace', 'over'
        this.isTouching = false;
        this.startTime = null;
        this.lives = 3;
        this.timerInterval = null;
        this.lifeLossTimeout = null;
        
        this.init();
    }

    async init() {
        if (!this.isMobile()) {
            document.getElementById('desktopWarning').classList.remove('hidden');
            return;
        }

        await this.room.initialize();
        
        this.setupEventListeners();
        this.setupSubscriptions();
        this.updatePlayerList(); // Initial render
        
        // Set initial presence
        this.room.updatePresence({
            lives: this.lives,
            startTime: null,
            elapsedTime: 0,
            status: 'waiting', // 'waiting', 'playing', 'eliminated'
        });
    }

    isMobile() {
        const toMatch = [
            /Android/i,
            /webOS/i,
            /iPhone/i,
            /iPad/i,
            /iPod/i,
            /BlackBerry/i,
            /Windows Phone/i
        ];
        
        return toMatch.some((toMatchItem) => {
            return navigator.userAgent.match(toMatchItem);
        }) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }

    setupEventListeners() {
        this.touchZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleTouchStart();
        }, { passive: false });
        
        this.touchZone.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleTouchEnd();
        }, { passive: false });
        
        this.restartBtn.addEventListener('click', () => {
            this.restartGame();
        });

        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    setupSubscriptions() {
        this.room.subscribePresence(() => {
            this.updatePlayerList();
        });
    }

    handleTouchStart() {
        if (this.gameState === 'over') return;

        if (this.gameState === 'idle') {
            this.startGame();
        }
        
        if (this.gameState === 'grace') {
            clearTimeout(this.lifeLossTimeout);
            this.gameState = 'active';
            this.instructionText.textContent = 'Keep your finger down!';
        }

        this.isTouching = true;
        this.touchZone.style.background = 'linear-gradient(45deg, #4ecdc4, #44a08d)';
        this.room.updatePresence({ isTouching: true });
    }

    handleTouchEnd() {
        if (this.gameState !== 'active') return;
        
        this.isTouching = false;
        this.gameState = 'grace';
        this.instructionText.textContent = '5 seconds to return!';
        this.touchZone.style.background = 'linear-gradient(45deg, #ff9a9e, #fecfef)';

        this.room.updatePresence({ isTouching: false });

        this.lifeLossTimeout = setTimeout(() => {
            if (this.gameState === 'grace') { // Check if player hasn't returned
                this.loseLife();
            }
        }, 5000);
    }

    loseLife() {
        if (this.gameState === 'over') return;

        this.lives--;
        this.updateHearts();
        
        this.room.updatePresence({ lives: this.lives });

        if (this.lives <= 0) {
            this.endGame();
        } else {
            // Still in grace period after losing a life, waiting for touch
            this.instructionText.textContent = 'You lost a life!';
            this.lifeLossTimeout = setTimeout(() => {
                if(this.gameState === 'grace') this.loseLife();
            }, 5000);
        }
    }

    startGame() {
        this.gameState = 'active';
        this.startTime = Date.now();
        this.lives = 3;
        
        this.instructionText.textContent = 'Keep your finger down!';
        this.livesDisplay.classList.remove('hidden');
        this.timerDisplay.classList.remove('hidden');
        this.updateHearts();

        this.room.updatePresence({
            lives: this.lives,
            startTime: this.startTime,
            status: 'playing',
        });
        
        this.timerInterval = setInterval(() => this.updateTimer(), 50);
    }

    endGame() {
        this.gameState = 'over';
        this.isTouching = false;
        clearInterval(this.timerInterval);
        clearTimeout(this.lifeLossTimeout);
        
        const finalTime = this.formatTime(Date.now() - this.startTime);
        document.getElementById('finalTime').textContent = `You lasted: ${finalTime}`;
        this.gameOverModal.classList.remove('hidden');
        
        this.room.updatePresence({
            status: 'eliminated',
            isTouching: false
        });
    }

    restartGame() {
        this.lives = 3;
        this.isTouching = false;
        this.gameState = 'idle';
        this.startTime = null;
        
        this.gameOverModal.classList.add('hidden');
        this.instructionText.textContent = 'Touch to start';
        this.touchZone.style.background = 'linear-gradient(45deg, #ff6b6b, #4ecdc4)';
        this.livesDisplay.classList.add('hidden');
        this.timerDisplay.classList.add('hidden');
        this.timerDisplay.textContent = '00:00:00.000';
        
        this.room.updatePresence({
            lives: this.lives,
            status: 'waiting',
            startTime: null,
            elapsedTime: 0,
            isTouching: false
        });
    }

    updateHearts() {
        this.hearts.textContent = '❤️'.repeat(this.lives) + '💔'.repeat(Math.max(0, 3 - this.lives));
    }

    updateTimer() {
        if (this.startTime && this.gameState === 'active') {
            const elapsed = Date.now() - this.startTime;
            this.timerDisplay.textContent = this.formatTime(elapsed);
            this.room.updatePresence({ elapsedTime: elapsed });
        }
    }

    updatePlayerList() {
        this.playersContainer.innerHTML = '';
        
        const players = Object.entries(this.room.presence)
            .map(([clientId, pres]) => ({
                clientId,
                username: this.room.peers[clientId]?.username || 'Player',
                avatarUrl: this.room.peers[clientId]?.avatarUrl,
                ...pres
            }));

        const sortedPlayers = players.sort((a, b) => (b.elapsedTime || 0) - (a.elapsedTime || 0));
        
        sortedPlayers.forEach(player => {
            const card = document.createElement('div');
            card.className = 'player-card';
            
            const time = player.startTime ? (player.elapsedTime || 0) : 0;
            
            card.innerHTML = `
                <img class="player-avatar" src="${player.avatarUrl}" alt="${player.username}">
                <div class="player-info">
                    <div class="player-name">${player.username}</div>
                    <div class="player-time">${player.status === 'playing' ? this.formatTime(time) : 'Waiting...'}</div>
                </div>
                <div class="player-lives">${'❤️'.repeat(player.lives || 0)}</div>
            `;
            
            if (this.room.peers[player.clientId] === undefined) {
                 card.classList.add('disconnected');
            } else if (player.status === 'eliminated') {
                card.classList.add('eliminated');
                card.querySelector('.player-time').textContent = `Lasted: ${this.formatTime(time)}`;
            }
            
            this.playersContainer.appendChild(card);
        });
    }

    formatTime(ms) {
        const totalSeconds = ms / 1000;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const milliseconds = Math.floor(ms % 1000);
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }
}

// Start the game
new FingerGame();