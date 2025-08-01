import { WebsimSocket } from 'https://esm.sh/@websim/client';

class FingerGame {
    constructor() {
        this.room = new WebsimSocket();
        this.isTouching = false;
        this.startTime = null;
        this.lives = 3;
        this.gameActive = false;
        this.heartbeatInterval = null;
        this.lastHeartbeat = Date.now();
        this.lifeLossTimeout = null;
        
        this.init();
    }

    async init() {
        await this.room.initialize();
        
        // Check if mobile
        if (!this.isMobile()) {
            document.getElementById('desktopWarning').classList.remove('hidden');
            return;
        }

        this.setupEventListeners();
        this.setupSubscriptions();
        this.startHeartbeat();
    }

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               (window.innerWidth <= 768 && 'ontouchstart' in window);
    }

    setupEventListeners() {
        const touchZone = document.getElementById('touchZone');
        
        // Touch events
        touchZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleTouchStart();
        });
        
        touchZone.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleTouchEnd();
        });
        
        // Restart button
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.restartGame();
        });

        // Prevent context menu
        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    setupSubscriptions() {
        // Listen for room state updates
        this.room.subscribeRoomState((state) => {
            this.updatePlayerList(state.players || {});
        });

        // Listen for presence updates
        this.room.subscribePresence(() => {
            this.updatePlayerList(this.room.roomState.players || {});
        });

        // Handle heartbeat requests
        this.room.subscribePresenceUpdateRequests((request, fromClientId) => {
            if (request.type === 'heartbeat') {
                this.room.updatePresence({
                    ...this.room.presence[this.room.clientId],
                    lastHeartbeat: Date.now(),
                    isAlive: true
                });
            }
        });
    }

    handleTouchStart() {
        if (!this.gameActive) {
            this.startGame();
        }
        
        this.isTouching = true;
        this.room.updatePresence({
            isTouching: true,
            lastHeartbeat: Date.now()
        });
        
        document.getElementById('instructionText').textContent = 'Finger down!';
        document.getElementById('touchZone').style.background = 'linear-gradient(45deg, #4ecdc4, #44a08d)';
    }

    handleTouchEnd() {
        if (!this.gameActive) return;
        
        this.isTouching = false;
        this.loseLife();
        
        // 5-second grace period
        this.lifeLossTimeout = setTimeout(() => {
            if (!this.isTouching && this.lives > 0) {
                this.loseLife();
            }
        }, 5000);
        
        this.room.updatePresence({
            isTouching: false,
            lives: this.lives
        });
    }

    loseLife() {
        this.lives--;
        this.updateHearts();
        
        if (this.lives <= 0) {
            this.endGame();
        }
        
        this.room.updatePresence({
            lives: this.lives
        });
    }

    startGame() {
        this.gameActive = true;
        this.startTime = Date.now();
        this.lives = 3;
        
        this.room.updateRoomState({
            players: {
                ...this.room.roomState.players,
                [this.room.clientId]: {
                    username: this.room.peers[this.room.clientId].username,
                    avatarUrl: this.room.peers[this.room.clientId].avatarUrl,
                    startTime: this.startTime,
                    lives: this.lives,
                    isAlive: true
                }
            }
        });
        
        this.room.updatePresence({
            isTouching: true,
            lives: this.lives,
            startTime: this.startTime
        });
    }

    endGame() {
        this.gameActive = false;
        clearInterval(this.heartbeatInterval);
        clearTimeout(this.lifeLossTimeout);
        
        const finalTime = this.formatTime(Date.now() - this.startTime);
        document.getElementById('finalTime').textContent = `You lasted: ${finalTime}`;
        document.getElementById('gameOverModal').classList.remove('hidden');
        
        this.room.updatePresence({
            isTouching: false,
            isAlive: false
        });
    }

    restartGame() {
        this.lives = 3;
        this.isTouching = false;
        this.gameActive = false;
        this.startTime = null;
        
        document.getElementById('gameOverModal').classList.add('hidden');
        document.getElementById('instructionText').textContent = 'Touch to start';
        document.getElementById('touchZone').style.background = 'linear-gradient(45deg, #ff6b6b, #4ecdc4)';
        
        this.updateHearts();
        this.room.updatePresence({
            lives: this.lives,
            isAlive: true,
            isTouching: false
        });
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.gameActive && this.isTouching) {
                // Send heartbeat to all peers
                Object.keys(this.room.peers).forEach(clientId => {
                    if (clientId !== this.room.clientId) {
                        this.room.requestPresenceUpdate(clientId, {
                            type: 'heartbeat'
                        });
                    }
                });
                
                // Update own heartbeat
                this.room.updatePresence({
                    lastHeartbeat: Date.now()
                });
            }
        }, 1000);
    }

    updateHearts() {
        const hearts = '❤️'.repeat(this.lives) + '💔'.repeat(3 - this.lives);
        document.getElementById('hearts').textContent = hearts;
    }

    updateTimer() {
        if (this.startTime && this.gameActive) {
            const elapsed = Date.now() - this.startTime;
            document.getElementById('timer').textContent = this.formatTime(elapsed);
        }
    }

    updatePlayerList(players) {
        const container = document.getElementById('playersContainer');
        container.innerHTML = '';
        
        // Sort players by time active
        const sortedPlayers = Object.entries(players)
            .sort(([, a], [, b]) => a.startTime - b.startTime);
        
        sortedPlayers.forEach(([clientId, player]) => {
            const card = document.createElement('div');
            card.className = 'player-card';
            
            const timeActive = player.startTime ? Date.now() - player.startTime : 0;
            
            card.innerHTML = `
                <img class="player-avatar" src="${player.avatarUrl}" alt="${player.username}">
                <div class="player-info">
                    <div class="player-name">${player.username}</div>
                    <div class="player-time">${this.formatTime(timeActive)}</div>
                </div>
                <div class="player-lives">${'❤️'.repeat(player.lives || 0)}</div>
            `;
            
            if (!player.isAlive) {
                card.classList.add('disconnected');
            }
            
            container.appendChild(card);
        });
    }

    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Start the game
new FingerGame();

// Update timer every second
setInterval(() => {
    if (window.gameInstance) {
        window.gameInstance.updateTimer();
    }
}, 1000);

