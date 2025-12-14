// --- CONFIGURATION ---
const CONFIG = {
    gravity: 0.25,
    jumpStrength: -4.5,
    pipeSpeed: 180,       // Pixels per second (Fixed speed)
    pipeSpawnInterval: 1500, // Milliseconds (1.5 seconds)
    gapSize: 150
};

// --- PARTICLE SYSTEM ---
class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.life = 1.0;
        this.color = Math.random() > 0.5 ? '#F4D03F' : '#E67E22';
    }

    update(dt) {
        // Normalize speed using Delta Time (dt)
        const timeScale = dt / 16.66;
        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;
        this.vy += 0.2 * timeScale;
        this.life -= 0.02 * timeScale;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, 6, 6);
        ctx.restore();
    }
}

// --- MAIN ENGINE ---
class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Error handling for dependencies
        if (typeof AudioController === 'undefined') console.error("Error: audio.js not loaded");
        if (typeof DataManager === 'undefined') console.error("Error: storage.js not loaded");

        this.audio = new AudioController();

        // Cache UI Elements
        this.ui = {
            menu: document.getElementById('menu-screen'),
            gameover: document.getElementById('gameover-screen'),
            score: document.getElementById('score-display'),
            finalScore: document.getElementById('final-score'),
            hofList: document.getElementById('hof-list'),
            btnResume: document.getElementById('btn-resume'),
            hud: document.getElementById('hud'),
            pauseBtn: document.getElementById('pause-btn')
        };

        // Resize immediately to ensure correct dimensions
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.reset();
        this.bindEvents();
        this.bindUI();

        this.checkNightMode();
        this.updateResumeState();

        // Time tracking
        this.lastTime = 0;
        this.timeSinceLastPipe = 0;
    }

    resize() {
        const parent = this.canvas.parentElement;
        if (parent) {
            this.canvas.width = parent.clientWidth;
            this.canvas.height = parent.clientHeight;
            this.width = this.canvas.width;
            this.height = this.canvas.height;
        }
    }

    reset() {
        this.resize(); // Ensure size is correct before placing bird
        this.bird = {
            x: this.width * 0.2, // Fixed horizontal position
            y: this.height / 2,
            velocity: 0,
            rotation: 0
        };
        this.pipes = [];
        this.particles = [];
        this.score = 0;
        this.isGameOver = false;
        this.isPlaying = false;
        this.timeSinceLastPipe = 0;
    }

    bindEvents() {
        const jump = (e) => {
            // Fix: Initialize audio context on first user interaction
            if (this.audio.ctx && this.audio.ctx.state === 'suspended') {
                this.audio.ctx.resume();
            } else {
                this.audio.init();
            }

            if (e.type === 'keydown' && e.code !== 'Space') return;
            if (e.type === 'keydown') e.preventDefault();

            if (this.isPlaying && !this.isGameOver) {
                this.bird.velocity = CONFIG.jumpStrength;
                this.audio.playJump();
            }
        };

        window.addEventListener('keydown', jump);
        this.canvas.addEventListener('mousedown', jump);
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            jump(e);
        }, { passive: false });
    }

    bindUI() {
        // DEBUG: Log click to console to ensure button works
        document.getElementById('btn-start').onclick = () => {
            console.log("Start button clicked");
            this.start();
        };

        document.getElementById('btn-restart').onclick = () => this.start();
        document.getElementById('btn-home').onclick = () => this.goHome();

        this.ui.btnResume.onclick = () => {
            this.audio.init();
            this.resume();
        };

        this.ui.pauseBtn.onclick = (e) => {
            e.stopPropagation();
            this.pause();
        };

        this.renderHOF();
    }

    checkNightMode() {
        const hour = new Date().getHours();
        if (hour >= 18 || hour < 6) {
            document.body.classList.add('night-mode');
        } else {
            document.body.classList.remove('night-mode');
        }
    }

    start() {
        this.reset();
        this.checkNightMode();
        this.isPlaying = true;
        this.setUIState('hud');
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    resume() {
        const state = DataManager.loadState();
        if (state) {
            this.bird = state.bird;
            this.pipes = state.pipes;
            this.score = state.score;
            this.particles = [];
            this.isPlaying = true;
            this.isGameOver = false;
            this.setUIState('hud');
            this.checkNightMode();
            this.lastTime = performance.now();
            requestAnimationFrame((t) => this.loop(t));
        }
    }

    pause() {
        this.isPlaying = false;
        DataManager.saveState({
            bird: this.bird, pipes: this.pipes, score: this.score
        });
        this.updateResumeState();
        this.setUIState('menu');
    }

    goHome() {
        this.setUIState('menu');
        this.updateResumeState();
        this.renderHOF();
    }

    spawnExplosion(x, y) {
        for (let i = 0; i < 20; i++) {
            this.particles.push(new Particle(x, y));
        }
    }

    gameOver() {
        this.isPlaying = false;
        this.isGameOver = true;
        this.audio.playCrash();
        this.spawnExplosion(this.bird.x, this.bird.y);

        DataManager.clearState();
        DataManager.saveScore(this.score);
        this.ui.finalScore.textContent = `Score: ${this.score}`;
        this.setUIState('gameover');
        this.updateResumeState();
        this.renderHOF();

        // Continue loop briefly to show particles
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    updateResumeState() {
        this.ui.btnResume.disabled = DataManager.loadState() === null;
    }

    setUIState(state) {
        this.ui.menu.classList.add('hidden');
        this.ui.gameover.classList.add('hidden');
        this.ui.hud.classList.add('hidden');
        this.ui.pauseBtn.classList.add('hidden');

        if (state === 'menu') this.ui.menu.classList.remove('hidden');
        if (state === 'gameover') this.ui.gameover.classList.remove('hidden');
        if (state === 'hud') {
            this.ui.hud.classList.remove('hidden');
            this.ui.pauseBtn.classList.remove('hidden');
        }
    }

    update(dt) {
        // Calculate Time Ratio (1.0 = 60fps, 0.5 = 120fps)
        // This ensures physics move the same distance regardless of Hz
        const timeScale = dt / 16.66;

        if (!this.isGameOver) {
            // Physics
            this.bird.velocity += CONFIG.gravity * timeScale;
            this.bird.y += this.bird.velocity * timeScale;
            this.bird.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.bird.velocity * 0.1)));

            // Pipe Spawning (Time Based, not Frame Based)
            this.timeSinceLastPipe += dt;
            if (this.timeSinceLastPipe > CONFIG.pipeSpawnInterval) {
                this.timeSinceLastPipe = 0;

                const minHeight = 50;
                const availableHeight = this.height - CONFIG.gapSize - (minHeight * 2);
                const topHeight = Math.floor(Math.random() * availableHeight) + minHeight;

                this.pipes.push({ x: this.width, topHeight, passed: false });
            }

            // Collision & Movement
            // Determine movement per frame based on time
            const moveAmount = (CONFIG.pipeSpeed * dt) / 1000;

            for (let i = this.pipes.length - 1; i >= 0; i--) {
                let p = this.pipes[i];
                p.x -= moveAmount;

                if (p.x + 50 < 0) {
                    this.pipes.splice(i, 1);
                    continue;
                }

                // Hit Floor/Ceiling
                if (this.bird.y + 10 > this.height || this.bird.y - 10 < 0) return this.gameOver();

                // Hit Pipes
                if (this.bird.x + 10 > p.x && this.bird.x - 10 < p.x + 50) {
                    if (this.bird.y - 10 < p.topHeight || this.bird.y + 10 > p.topHeight + CONFIG.gapSize) {
                        return this.gameOver();
                    }
                }

                // Score
                if (p.x + 50 < this.bird.x && !p.passed) {
                    this.score++;
                    p.passed = true;
                    this.ui.score.textContent = this.score;
                    this.audio.playScore();
                }
            }
        }

        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw Pipes
        this.ctx.fillStyle = '#2ECC71';
        this.ctx.strokeStyle = '#27AE60';
        this.ctx.lineWidth = 2;

        this.pipes.forEach(p => {
            // Top
            this.ctx.fillRect(p.x, 0, 50, p.topHeight);
            this.ctx.strokeRect(p.x, 0, 50, p.topHeight);
            // Cap
            this.ctx.fillRect(p.x - 2, p.topHeight - 20, 54, 20);
            this.ctx.strokeRect(p.x - 2, p.topHeight - 20, 54, 20);

            // Bottom
            let bottomY = p.topHeight + CONFIG.gapSize;
            let bottomH = this.height - bottomY;
            this.ctx.fillRect(p.x, bottomY, 50, bottomH);
            this.ctx.strokeRect(p.x, bottomY, 50, bottomH);
            // Cap
            this.ctx.fillRect(p.x - 2, bottomY, 54, 20);
            this.ctx.strokeRect(p.x - 2, bottomY, 54, 20);
        });

        // Draw Bird
        if (!this.isGameOver) {
            this.ctx.save();
            this.ctx.translate(this.bird.x, this.bird.y);
            this.ctx.rotate(this.bird.rotation);

            // Body
            this.ctx.fillStyle = '#F4D03F';
            this.ctx.beginPath(); this.ctx.arc(0, 0, 15, 0, Math.PI*2); this.ctx.fill();
            // Eye
            this.ctx.fillStyle = 'white';
            this.ctx.beginPath(); this.ctx.arc(6, -6, 6, 0, Math.PI*2); this.ctx.fill();
            this.ctx.fillStyle = 'black';
            this.ctx.beginPath(); this.ctx.arc(8, -6, 2, 0, Math.PI*2); this.ctx.fill();
            // Wing
            this.ctx.fillStyle = '#E67E22';
            this.ctx.beginPath(); this.ctx.ellipse(-5, 5, 8, 5, 0, 0, Math.PI*2); this.ctx.fill();
            // Beak
            this.ctx.fillStyle = '#E74C3C';
            this.ctx.beginPath(); this.ctx.moveTo(8, 2); this.ctx.lineTo(18, 6); this.ctx.lineTo(8, 10); this.ctx.fill();

            this.ctx.restore();
        }

        // Particles
        this.particles.forEach(p => p.draw(this.ctx));

        // Ground
        const isNight = document.body.classList.contains('night-mode');
        this.ctx.fillStyle = isNight ? '#7F8C8D' : '#DED895';
        this.ctx.fillRect(0, this.height - 20, this.width, 20);
        this.ctx.fillStyle = isNight ? '#16A085' : '#73C6B6';
        this.ctx.fillRect(0, this.height - 20, this.width, 5);
    }

    loop(timestamp) {
        // Calculate Delta Time (time elapsed since last frame in ms)
        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Cap dt to prevent huge jumps if tab was inactive (max 100ms)
        const safeDt = Math.min(dt, 100);

        if (this.isPlaying || (this.isGameOver && this.particles.length > 0)) {
            this.update(safeDt);
            this.draw();
            requestAnimationFrame((t) => this.loop(t));
        }
    }
}

// Bootstrap
window.onload = () => {
    const canvas = document.getElementById('gameCanvas');
    if(canvas) {
        new Game(canvas);
    } else {
        console.error("Canvas element not found!");
    }
};