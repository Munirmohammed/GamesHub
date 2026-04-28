import './style.css';

interface Entity {
  x: number;
  y: number;
  radius: number;
  color: string;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

class Particle implements Entity {
  vx: number;
  vy: number;
  life: number = 1.0;
  decay: number;

  constructor(public x: number, public y: number, public radius: number, public color: string) {
    const speed = Math.random() * 100 + 50;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.decay = Math.random() * 2 + 1;
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= this.decay * dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * this.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Player implements Entity {
  x: number = 0;
  y: number = 0;
  radius: number = 8;
  color: string = '#00f2ff';
  orbitIndex: number = 1; // 0, 1, 2
  angle: number = 0;
  speed: number = 2.5;
  targetOrbitRadius: number = 0;
  currentOrbitRadius: number = 0;
  orbits: number[] = [60, 110, 160];

  constructor(private gameWidth: number, private gameHeight: number) {
    this.targetOrbitRadius = this.orbits[this.orbitIndex];
    this.currentOrbitRadius = this.targetOrbitRadius;
  }

  jump() {
    this.orbitIndex = (this.orbitIndex + 1) % this.orbits.length;
    this.targetOrbitRadius = this.orbits[this.orbitIndex];
  }

  update(dt: number) {
    // Smoothly transition between orbits
    this.currentOrbitRadius += (this.targetOrbitRadius - this.currentOrbitRadius) * 0.15;
    
    // Rotate
    this.angle += this.speed * dt;
    
    // Update position
    const centerX = this.gameWidth / 2;
    const centerY = this.gameHeight / 2;
    this.x = centerX + Math.cos(this.angle) * this.currentOrbitRadius;
    this.y = centerY + Math.sin(this.angle) * this.currentOrbitRadius;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner glow
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Obstacle implements Entity {
  x: number = 0;
  y: number = 0;
  radius: number = 10;
  color: string = '#ff0055';
  angle: number = 0;
  orbitRadius: number = 0;
  speed: number = 0;

  constructor(private centerX: number, private centerY: number, orbitRadius: number, speed: number, startAngle: number) {
    this.orbitRadius = orbitRadius;
    this.speed = speed;
    this.angle = startAngle;
  }

  update(dt: number) {
    this.angle += this.speed * dt;
    this.x = this.centerX + Math.cos(this.angle) * this.orbitRadius;
    this.y = this.centerY + Math.sin(this.angle) * this.orbitRadius;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    // Draw as a diamond/square for "enemy" look
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle * 2);
    ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
    ctx.restore();
  }
}

class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private player: Player;
  private obstacles: Obstacle[] = [];
  private particles: Particle[] = [];
  private score: number = 0;
  private bestScore: number = 0;
  private isRunning: boolean = false;
  private lastTime: number = 0;
  private spawnTimer: number = 0;
  
  // Screen Shake
  private shakeIntensity: number = 0;
  private shakeDecay: number = 5;

  constructor() {
    this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    this.player = new Player(this.canvas.width, this.canvas.height);
    
    window.addEventListener('resize', () => this.resize());
    this.initUI();
    this.bestScore = parseInt(localStorage.getItem('neon-drift-best') || '0');
    this.updateBestUI();
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private initUI() {
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');
    
    const handleAction = () => {
      if (!this.isRunning) {
        this.start();
      } else {
        this.player.jump();
      }
    };

    window.addEventListener('mousedown', handleAction);
    window.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleAction();
    });

    startBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.start();
    });

    restartBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.start();
    });
  }

  private triggerShake(intensity: number) {
    this.shakeIntensity = intensity;
  }

  private createExplosion(x: number, y: number, color: string, count: number = 10) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, Math.random() * 3 + 1, color));
    }
  }

  private start() {
    this.isRunning = true;
    this.score = 0;
    this.obstacles = [];
    this.particles = [];
    this.player = new Player(this.canvas.width, this.canvas.height);
    this.spawnTimer = 0;
    this.lastTime = performance.now();
    this.shakeIntensity = 0;
    
    document.getElementById('start-screen')?.classList.add('hidden');
    document.getElementById('game-over')?.classList.add('hidden');
    document.getElementById('game-ui')?.classList.remove('hidden');
    
    requestAnimationFrame((t) => this.loop(t));
  }

  private gameOver() {
    this.isRunning = false;
    this.triggerShake(20);
    this.createExplosion(this.player.x, this.player.y, '#00f2ff', 30);
    this.createExplosion(this.player.x, this.player.y, '#ffffff', 15);
    
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('neon-drift-best', this.bestScore.toString());
      this.updateBestUI();
    }
    
    document.getElementById('final-score-val')!.textContent = this.score.toString();
    document.getElementById('game-over')?.classList.remove('hidden');
  }

  private updateBestUI() {
    document.getElementById('best-val')!.textContent = this.bestScore.toString().padStart(4, '0');
  }

  private spawnObstacle() {
    const orbits = [60, 110, 160];
    const orbit = orbits[Math.floor(Math.random() * orbits.length)];
    const speed = (Math.random() * 2 + 1) * (Math.random() > 0.5 ? 1 : -1);
    const angle = Math.random() * Math.PI * 2;
    this.obstacles.push(new Obstacle(this.canvas.width / 2, this.canvas.height / 2, orbit, speed, angle));
  }

  private loop(time: number) {
    if (!this.isRunning) return;

    const dt = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.update(dt);
    this.draw();

    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number) {
    this.player.update(dt);
    
    // Jump effect
    if (Math.abs(this.player.currentOrbitRadius - this.player.targetOrbitRadius) > 1) {
      if (Math.random() > 0.5) {
        this.particles.push(new Particle(this.player.x, this.player.y, 2, 'rgba(0, 242, 255, 0.5)'));
      }
    }

    this.spawnTimer += dt;
    const spawnRate = Math.max(0.5, 1.5 - (this.score / 2000));
    if (this.spawnTimer > spawnRate) {
      this.spawnObstacle();
      this.spawnTimer = 0;
    }

    this.particles.forEach((p, i) => {
      p.update(dt);
      if (p.life <= 0) this.particles.splice(i, 1);
    });

    this.obstacles.forEach((obs, index) => {
      obs.update(dt);
      
      // Collision check
      const dx = obs.x - this.player.x;
      const dy = obs.y - this.player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < obs.radius + this.player.radius) {
        this.gameOver();
      }

      // Remove obstacles that have been around too long (cleanup)
      // (Simplified: keep list short)
      if (this.obstacles.length > 20) {
        this.obstacles.shift();
      }
    });

    this.score += Math.floor(dt * 100);
    document.getElementById('score-val')!.textContent = this.score.toString().padStart(4, '0');

    // Update Shake
    if (this.shakeIntensity > 0) {
      this.shakeIntensity -= this.shakeDecay * dt * 10;
    }
  }

  private draw() {
    this.ctx.save();
    
    // Apply Shake
    if (this.shakeIntensity > 0) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity;
      const sy = (Math.random() - 0.5) * this.shakeIntensity;
      this.ctx.translate(sx, sy);
    }

    this.ctx.fillStyle = 'rgba(5, 5, 8, 0.3)'; // Trail effect
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw Orbit Rings
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.setLineDash([5, 10]);
    [60, 110, 160].forEach(r => {
      this.ctx.beginPath();
      this.ctx.arc(this.canvas.width / 2, this.canvas.height / 2, r, 0, Math.PI * 2);
      this.ctx.stroke();
    });
    this.ctx.setLineDash([]);

    this.player.draw(this.ctx);
    this.obstacles.forEach(obs => obs.draw(this.ctx));
    this.particles.forEach(p => p.draw(this.ctx));
    
    // Draw Center Core
    this.ctx.save();
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = '#7000ff';
    this.ctx.fillStyle = '#7000ff';
    this.ctx.beginPath();
    this.ctx.arc(this.canvas.width / 2, this.canvas.height / 2, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    this.ctx.restore();
  }
}

new Game();
