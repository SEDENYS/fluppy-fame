const CONFIG = {
    gravity: 0.25,
    jumpStrength: -4.5,
    pipeSpeed: 3,
    pipeSpawnRate: 100,
    gapSize: 150
};

// --- PARTICLE SYSTEM ---
class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        // Explosion scatter effect
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.life = 1.0; // Opacity 100%
        this.color = Math.random() > 0.5 ? '#F4D03F' : '#E67E22'; // Feather colors
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.2; // Gravity affects feathers
        this.life -= 0.02; // Fade out
    }

    draw(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, 6, 6); // Simple squares for retro feel
        ctx.globalAlpha = 1.0;
    }
}

// --- MAIN ENGINE ---
class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.audio = new AudioController();
        this.reset();
        this.bindEvents();

        // UI Cache
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

        this.bindUI();
        this.checkNightMode(); // Check time on load
        this.updateResumeState();
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.width = rect.width;
        this.height = rect.height;
    }

    reset() {
        this.bird = { x: this.width * 0.15, y: this.height / 2, velocity: 0, rotation: 0 };
        this.pipes = [];
        this.particles = []; // Init particles array
        this.score = 0;
        this.frameCount = 0;
        this.isGameOver = false;
        this.isPlaying = false;
    }

    bindEvents() {
        const jump = (e) => {
            this.audio.init();
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
        document.getElementById('btn-start').onclick = () => this.start();
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
        // Night mode between 6 PM (18) and 6 AM (6)
        if (hour >= 18 || hour < 6) {
            document.body.classList.add('night-mode');
        } else {
            document.body.classList.remove('night-mode');
        }
    }

    start() {
        this.reset();
        this.checkNightMode(); // Re-check in case time changed
        this.isPlaying = true;
        this.setUIState('hud');
        this.loop();
    }

    resume() {
        const state = DataManager.loadState();
        if (state) {
            this.bird = state.bird;
            this.pipes = state.pipes;
            this.score = state.score;
            this.frameCount = state.frameCount;
            this.particles = []; // Clear old particles on resume
            this.isPlaying = true;
            this.isGameOver = false;
            this.setUIState('hud');
            this.checkNightMode();
            this.loop();
        }
    }

    pause() {
        this.isPlaying = false;
        DataManager.saveState({
            bird: this.bird, pipes: this.pipes, score: this.score, frameCount: this.frameCount
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

        // Spawn Particles at crash site
        this.spawnExplosion(this.bird.x, this.bird.y);

        DataManager.clearState();
        DataManager.saveScore(this.score);
        this.ui.finalScore.textContent = `Score: ${this.score}`;
        this.setUIState('gameover');
        this.updateResumeState();
        this.renderHOF();

        // Continue loop briefly to render particles
        this.loop();
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

    update() {
        if (!this.isGameOver) {
            this.frameCount++;

            // Physics
            this.bird.velocity += CONFIG.gravity;
            this.bird.y += this.bird.velocity;
            this.bird.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.bird.velocity * 0.1)));

            // Pipe Management
            if (this.frameCount % CONFIG.pipeSpawnRate === 0) {
                const minHeight = 50;
                const availableHeight = this.height - CONFIG.gapSize - (minHeight * 2);
                const topHeight = Math.floor(Math.random() * availableHeight) + minHeight;
                this.pipes.push({ x: this.width, topHeight, passed: false });
            }

            // Collision & Scoring
            for (let i = this.pipes.length - 1; i >= 0; i--) {
                let p = this.pipes[i];
                p.x -= CONFIG.pipeSpeed;

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

        // Update Particles (Run even during Game Over)
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
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
        this.pipes.forEach(p => {
            this.ctx.fillRect(p.x, 0, 50, p.topHeight);
            this.ctx.strokeRect(p.x, 0, 50, p.topHeight);

            let bottomY = p.topHeight + CONFIG.gapSize;
            this.ctx.fillRect(p.x, bottomY, 50, this.height - bottomY);
            this.ctx.strokeRect(p.x, bottomY, 50, this.height - bottomY);
        });

        // Draw Bird (Only if not game over, or handle explosion logic)
        if (!this.isGameOver) {
            this.ctx.save();
            this.ctx.translate(this.bird.x, this.bird.y);
            this.ctx.rotate(this.bird.rotation);

            // Procedural Bird Art
            this.ctx.fillStyle = '#F4D03F';
            this.ctx.beginPath(); this.ctx.arc(0, 0, 15, 0, Math.PI*2); this.ctx.fill();
            this.ctx.fillStyle = 'white';
            this.ctx.beginPath(); this.ctx.arc(6, -6, 6, 0, Math.PI*2); this.ctx.fill();
            this.ctx.fillStyle = 'black';
            this.ctx.beginPath(); this.ctx.arc(8, -6, 2, 0, Math.PI*2); this.ctx.fill();
            this.ctx.fillStyle = '#E67E22';
            this.ctx.beginPath(); this.ctx.ellipse(-5, 5, 8, 5, 0, 0, Math.PI*2); this.ctx.fill();

            this.ctx.restore();
        }

        // Draw Particles
        this.particles.forEach(p => p.draw(this.ctx));

        // Draw Ground
        // Use CSS variables for colors if possible, but canvas requires JS values
        // We'll stick to a generic ground color or check the class
        const isNight = document.body.classList.contains('night-mode');
        this.ctx.fillStyle = isNight ? '#7F8C8D' : '#DED895';
        this.ctx.fillRect(0, this.height - 20, this.width, 20);
        this.ctx.fillStyle = isNight ? '#16A085' : '#73C6B6';
        this.ctx.fillRect(0, this.height - 20, this.width, 5);
    }

    loop() {
        // If game is over and no particles left, stop loop to save battery
        if (this.isGameOver && this.particles.length === 0) return;

        if (this.isPlaying || this.isGameOver) {
            this.update();
            this.draw();
            requestAnimationFrame(() => this.loop());
        }
    }
}

// Bootstrap
window.onload = () => new Game(document.getElementById('gameCanvas'));