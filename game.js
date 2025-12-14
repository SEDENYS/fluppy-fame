/**
 * NEON FLAP: INDUSTRIAL EDITION
 * A high-performance HTML5 Canvas Game
 */

// --- AUDIO & DATA MANAGEMENT ---
const DB = {
    key: 'neon_flap_v2',
    get() {
        try {
            return JSON.parse(localStorage.getItem(this.key)) || { highscore: 0, state: null };
        } catch (e) {
            return { highscore: 0, state: null };
        }
    },
    save(data) {
        try { localStorage.setItem(this.key, JSON.stringify(data)); } catch (e) {}
    }
};

const AudioSys = {
    ctx: null,
    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    play(type) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        if (type === 'jump') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, t);
            osc.frequency.linearRampToValueAtTime(800, t + 0.1);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        } else if (type === 'score') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(1200, t);
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        } else if (type === 'crash') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, t);
            osc.frequency.exponentialRampToValueAtTime(10, t + 0.4);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
            osc.start(); osc.stop(t + 0.4);
        }
    }
};

// --- VISUAL FX ---
class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.life = 1.0;
        this.color = color;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= 0.03;
    }
    draw(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10; ctx.shadowColor = this.color;
        ctx.fillRect(this.x, this.y, 4, 4);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
    }
}

class Star {
    constructor(w, h) {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.size = Math.random() * 2;
        this.speed = Math.random() * 0.5 + 0.1;
    }
    update(w) {
        this.x -= this.speed;
        if (this.x < 0) this.x = w;
    }
    draw(ctx) {
        ctx.fillStyle = 'white';
        ctx.globalAlpha = Math.random() * 0.5 + 0.3;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

// --- MAIN ENGINE ---
const Game = {
    canvas: document.getElementById('gameCanvas'),
    ctx: document.getElementById('gameCanvas').getContext('2d'),
    container: document.getElementById('game-container'),

    gravity: 0.25, jumpStrength: -6, speed: 200, pipeInterval: 1400, gap: 170, pipeWidth: 70,
    width: 0, height: 0, bird: null, pipes: [], stars: [], particles: [], trail: [],
    score: 0, active: false, gameOver: false, lastTime: 0, spawnTimer: 0,

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.bindInput();
        this.updateUI();
        for(let i=0; i<50; i++) this.stars.push(new Star(this.width, this.height));
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    },

    bindInput() {
        const jump = (e) => {
            if (e.target.closest('#pause-btn')) return;
            if (e.type === 'keydown' && e.code !== 'Space') return;
            if (e.type === 'keydown') e.preventDefault();

            AudioSys.init();
            if (this.active) {
                this.bird.v = this.jumpStrength;
                this.bird.flap = 10;
                for(let i=0; i<5; i++) this.particles.push(new Particle(this.bird.x, this.bird.y+10, '#00f3ff'));
                AudioSys.play('jump');
            }
        };

        window.addEventListener('keydown', jump);
        this.canvas.addEventListener('mousedown', jump);
        this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); jump(e); }, {passive:false});

        document.getElementById('btn-start').onclick = () => this.start();
        document.getElementById('btn-restart').onclick = () => this.start();
        document.getElementById('btn-home').onclick = () => this.home();
        document.getElementById('btn-resume').onclick = () => this.resume();

        const pauseBtn = document.getElementById('pause-btn');
        pauseBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); this.pause(); });
        pauseBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); this.pause(); }, {passive: false});
    },

    start() {
        this.resize();
        this.bird = { x: this.width * 0.2, y: this.height/2, v: 0, r: 0, flap: 0 };
        this.pipes = []; this.particles = []; this.trail = [];
        this.score = 0; this.spawnTimer = 0;
        this.active = true; this.gameOver = false;
        document.getElementById('score-display').innerText = '0';
        this.setScreen('hud');
        this.container.classList.remove('shake-effect');
    },

    resume() {
        const data = DB.get();
        if (data.state) {
            this.bird = data.state.bird; this.pipes = data.state.pipes; this.score = data.state.score;
            this.active = true; this.gameOver = false;
            this.setScreen('hud');
        }
    },

    pause() {
        if (!this.active) return;
        this.active = false;
        DB.save({ highscore: DB.get().highscore, state: { bird: this.bird, pipes: this.pipes, score: this.score } });
        this.updateUI(); this.setScreen('menu');
    },

    crash() {
        this.active = false; this.gameOver = true;
        AudioSys.play('crash');
        this.container.classList.remove('shake-effect');
        void this.container.offsetWidth; this.container.classList.add('shake-effect');
        for(let i=0; i<30; i++) this.particles.push(new Particle(this.bird.x, this.bird.y, '#ff00aa'));

        const data = DB.get();
        if (this.score > data.highscore) data.highscore = this.score;
        data.state = null; DB.save(data);

        document.getElementById('final-score').innerText = this.score;
        this.setScreen('gameover');
    },

    home() { this.updateUI(); this.setScreen('menu'); },

    update(dt) {
        const dtSec = dt / 1000;
        this.stars.forEach(s => s.update(this.width));

        if (!this.active) {
            this.particles.forEach(p => p.update());
            this.particles = this.particles.filter(p => p.life > 0);
            return;
        }

        this.bird.v += this.gravity * (dt / 16);
        this.bird.y += this.bird.v * (dt / 16);
        this.bird.r = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.bird.v * 0.05)));
        if (this.bird.flap > 0) this.bird.flap--;

        if (this.score > 0) {
            this.trail.push({ x: this.bird.x, y: this.bird.y });
            if (this.trail.length > 15) this.trail.shift();
        }

        this.spawnTimer += dt;
        if (this.spawnTimer > this.pipeInterval) {
            this.spawnTimer = 0;
            const minH = 60, avail = this.height - this.gap - (minH*2);
            this.pipes.push({ x: this.width, top: Math.floor(Math.random() * avail) + minH, passed: false });
        }

        const move = this.speed * dtSec;
        const pWidth = this.pipeWidth;

        this.pipes = this.pipes.filter(p => p.x + pWidth + 10 > 0);
        this.pipes.forEach(p => {
            p.x -= move;
            if (this.bird.y < 0 || this.bird.y > this.height) return this.crash();

            if (this.bird.x + 10 > p.x && this.bird.x - 10 < p.x + pWidth) {
                if (this.bird.y - 10 < p.top || this.bird.y + 10 > p.top + this.gap) return this.crash();
            }

            if (!p.passed && this.bird.x > p.x + pWidth) {
                this.score++; p.passed = true;
                document.getElementById('score-display').innerText = this.score;
                AudioSys.play('score');
            }
        });

        this.particles.forEach(p => p.update());
        this.particles = this.particles.filter(p => p.life > 0);
    },

    drawTechPipe(x, y, w, h, isTop) {
        this.ctx.fillStyle = '#0a0a12'; this.ctx.fillRect(x, y, w, h);
        this.ctx.strokeStyle = '#00ff44'; this.ctx.lineWidth = 2; this.ctx.strokeRect(x, y, w, h);

        const capH = 30, capW = w + 10, capX = x - 5, capY = isTop ? y + h - capH : y;
        this.ctx.shadowBlur = 15; this.ctx.shadowColor = '#00ff44';
        this.ctx.fillStyle = '#0a0a12'; this.ctx.fillRect(capX, capY, capW, capH);
        this.ctx.strokeRect(capX, capY, capW, capH);

        this.ctx.fillStyle = '#00ff44'; this.ctx.fillRect(capX + 5, capY + 10, capW - 10, 5);
        this.ctx.shadowBlur = 0;
    },

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.stars.forEach(s => s.draw(this.ctx));
        this.pipes.forEach(p => {
            this.drawTechPipe(p.x, 0, this.pipeWidth, p.top, true);
            this.drawTechPipe(p.x, p.top + this.gap, this.pipeWidth, this.height - (p.top + this.gap), false);
        });

        if (this.active && this.trail.length > 1) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
            this.ctx.lineWidth = 2;
            this.ctx.moveTo(this.trail[0].x, this.trail[0].y);
            for(let i=1; i<this.trail.length; i++) this.ctx.lineTo(this.trail[i].x, this.trail[i].y);
            this.ctx.stroke();
        }

        if (this.bird && !this.gameOver) {
            this.ctx.save();
            this.ctx.translate(this.bird.x, this.bird.y);
            this.ctx.rotate(this.bird.r);

            this.ctx.shadowBlur = 20; this.ctx.shadowColor = '#00f3ff'; this.ctx.fillStyle = '#00f3ff';
            this.ctx.beginPath();
            this.ctx.moveTo(15, 0); this.ctx.lineTo(-10, -10); this.ctx.lineTo(-5, 0); this.ctx.lineTo(-10, 10);
            this.ctx.closePath(); this.ctx.fill();

            this.ctx.fillStyle = '#ccfbff';
            this.ctx.beginPath();
            const wingY = (this.bird.flap > 0) ? -15 : -5;
            this.ctx.moveTo(5, 0); this.ctx.lineTo(-10, wingY); this.ctx.lineTo(-5, 0); this.ctx.fill();

            this.ctx.shadowBlur = 0; this.ctx.fillStyle = '#000';
            this.ctx.beginPath(); this.ctx.arc(8, -2, 2, 0, Math.PI*2); this.ctx.fill();
            this.ctx.restore();
        }
        this.particles.forEach(p => p.draw(this.ctx));
    },

    loop(now) {
        const dt = Math.min((now - this.lastTime), 50);
        this.lastTime = now;
        this.update(dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    },

    setScreen(n) {
        ['menu-screen','gameover-screen','hud','pause-btn'].forEach(id=>document.getElementById(id).classList.add('hidden'));
        if(n==='menu')document.getElementById('menu-screen').classList.remove('hidden');
        if(n==='gameover')document.getElementById('gameover-screen').classList.remove('hidden');
        if(n==='hud'){document.getElementById('hud').classList.remove('hidden');document.getElementById('pause-btn').classList.remove('hidden');}
    },
    updateUI() {
        const d=DB.get();
        document.getElementById('menu-highscore').innerText=d.highscore;
        document.getElementById('btn-resume').disabled=!d.state;
    }
};

window.onload = () => Game.init();