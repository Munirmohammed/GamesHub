import './style.css';

// --- TYPES & INTERFACES ---

interface Vector { x: number; y: number; }

interface Upgrade {
  id: string;
  name: string;
  description: string;
  level: number;
  maxLevel: number;
  apply: (stats: GameStats) => void;
}

interface GameStats {
  hp: number;
  maxHp: number;
  moveSpeed: number;
  fireRate: number;
  bulletDamage: number;
  bulletSpeed: number;
  bulletSize: number;
  pickupRange: number;
  pierce: number;
  multishot: number;
}

interface MetaStats {
  hpLevel: number;
  dmgLevel: number;
}

// --- ENTITIES ---

class Player {
  x: number;
  y: number;
  radius: number = 12;
  stats: GameStats;
  xp: number = 0;
  xpToNextLevel: number = 100;
  level: number = 1;
  lastFireTime: number = 0;

  constructor(w: number, h: number) {
    this.x = w / 2;
    this.y = h / 2;
    this.stats = {
      hp: 100, maxHp: 100, moveSpeed: 200,
      fireRate: 0.5, bulletDamage: 10, bulletSpeed: 400,
      bulletSize: 4, pickupRange: 100, pierce: 0, multishot: 1
    };
  }

  update(dt: number, keys: Record<string, boolean>) {
    let dx = 0;
    let dy = 0;
    if (keys['w'] || keys['ArrowUp']) dy -= 1;
    if (keys['s'] || keys['ArrowDown']) dy += 1;
    if (keys['a'] || keys['ArrowLeft']) dx -= 1;
    if (keys['d'] || keys['ArrowRight']) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const mag = Math.sqrt(dx * dx + dy * dy);
      this.x += (dx / mag) * this.stats.moveSpeed * dt;
      this.y += (dy / mag) * this.stats.moveSpeed * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f2ff';
    ctx.fillStyle = '#00f2ff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Enemy {
  radius: number = 10;
  hp: number = 20;
  speed: number = 120;
  color: string = '#ff0055';

  constructor(public x: number, public y: number, level: number, public type: string = 'basic') {
    if (type === 'tank') {
      this.radius = 18;
      this.hp = 50 + (level * 10);
      this.speed = 80;
      this.color = '#ff9900';
    } else {
      this.hp = 1; // One-hit kill
      this.speed = 120 + Math.min(level * 5, 100);
      this.color = '#ff0055';
    }
  }

  update(dt: number, playerX: number, playerY: number) {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.x += (dx / dist) * this.speed * dt;
    this.y += (dy / dist) * this.speed * dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Bullet {
  radius: number;
  life: number = 3;
  pierceCount: number = 0;

  constructor(
    public x: number, public y: number,
    public vx: number, public vy: number,
    public damage: number, public size: number,
    public maxPierce: number
  ) {
    this.radius = size;
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#bc00ff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class XPGem {
  radius: number = 4;
  color: string = '#bc00ff';
  lerpSpeed: number = 0;

  constructor(public x: number, public y: number, public value: number) { }

  update(dt: number, playerX: number, playerY: number, range: number) {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < range) {
      this.lerpSpeed += dt * 500;
      this.x += (dx / dist) * this.lerpSpeed * dt;
      this.y += (dy / dist) * this.lerpSpeed * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 5;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- GAME ENGINE ---

class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private player: Player;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private gems: XPGem[] = [];
  private keys: Record<string, boolean> = {};
  private pointerPos: Vector = { x: 0, y: 0 };

  private isPaused: boolean = false;
  private isRunning: boolean = false;
  private lastTime: number = 0;
  private timer: number = 0;
  private spawnTimer: number = 0;
  private kills: number = 0;
  private scraps: number = 0;
  private totalScraps: number = 0;
  private metaStats: MetaStats = { hpLevel: 0, dmgLevel: 0 };

  private upgradePool: Upgrade[] = [
    { id: 'dmg', name: 'OVERDRIVE', description: '+25% Damage', level: 0, maxLevel: 5, apply: (s) => s.bulletDamage *= 1.25 },
    { id: 'rate', name: 'HYPER-CLOCK', description: '+20% Fire Rate', level: 0, maxLevel: 5, apply: (s) => s.fireRate *= 0.8 },
    { id: 'speed', name: 'TURBO', description: '+15% Move Speed', level: 0, maxLevel: 5, apply: (s) => s.moveSpeed *= 1.15 },
    { id: 'multi', name: 'SPLIT-CORE', description: '+1 Bullet', level: 0, maxLevel: 3, apply: (s) => s.multishot += 1 },
    { id: 'range', name: 'MAGNET', description: '+50% Pickup Range', level: 0, maxLevel: 5, apply: (s) => s.pickupRange *= 1.5 },
  ];

  constructor() {
    this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.resize();
    this.player = new Player(this.canvas.width, this.canvas.height);

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.keys[e.key] = true);
    window.addEventListener('keyup', (e) => this.keys[e.key] = false);

    window.addEventListener('pointermove', (e) => {
      this.pointerPos.x = e.clientX;
      this.pointerPos.y = e.clientY;
    });
    window.addEventListener('pointerdown', (e) => {
      this.pointerPos.x = e.clientX;
      this.pointerPos.y = e.clientY;
    });

    this.initUI();
    this.loadMeta();
    (window as any).game = this; // For shop buttons
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private loadMeta() {
    this.totalScraps = parseInt(localStorage.getItem('cyber-scraps') || '0');
    this.metaStats = JSON.parse(localStorage.getItem('cyber-meta') || '{"hpLevel":0, "dmgLevel":0}');
    this.updateMetaUI();
  }

  private updateMetaUI() {
    document.getElementById('meta-scraps')!.textContent = this.totalScraps.toString();
  }

  public buyMeta(type: 'hp' | 'dmg') {
    const cost = type === 'hp' ? 10 : 15;
    if (this.totalScraps >= cost) {
      this.totalScraps -= cost;
      if (type === 'hp') this.metaStats.hpLevel++;
      else this.metaStats.dmgLevel++;

      localStorage.setItem('cyber-scraps', this.totalScraps.toString());
      localStorage.setItem('cyber-meta', JSON.stringify(this.metaStats));
      this.updateMetaUI();
    }
  }

  private initUI() {
    document.getElementById('start-btn')!.onclick = () => this.start();
    document.getElementById('restart-btn')!.onclick = () => location.reload();
  }

  private start() {
    this.isRunning = true;
    this.isPaused = false;
    this.timer = 0;
    this.kills = 0;
    this.scraps = 0;
    this.lastTime = performance.now();

    this.player = new Player(this.canvas.width, this.canvas.height);
    // Apply Meta Stats
    this.player.stats.maxHp += this.metaStats.hpLevel * 20;
    this.player.stats.hp = this.player.stats.maxHp;
    this.player.stats.bulletDamage += this.metaStats.dmgLevel * 5;

    document.getElementById('start-screen')!.classList.add('hidden');
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(time: number) {
    if (!this.isRunning) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    if (!this.isPaused) {
      this.update(dt);
    }
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number) {
    this.timer += dt;
    this.player.update(dt, this.keys);

    // Firing
    if (time() - this.player.lastFireTime > this.player.stats.fireRate * 1000) {
      this.fire();
      this.player.lastFireTime = time();
    }

    // Controlled Spawn System
    this.spawnTimer += dt;
    const spawnDelay = Math.max(0.2, 1.2 - (this.timer / 120)); // Slow start, scales up
    if (this.spawnTimer > spawnDelay) {
      const type = Math.random() > 0.9 ? 'tank' : 'basic';
      this.spawnEnemy(type);
      this.spawnTimer = 0;
    }

    // Update Entities
    this.bullets.forEach((b, i) => {
      b.update(dt);
      if (b.life < 0) this.bullets.splice(i, 1);
    });

    this.enemies.forEach((e, i) => {
      e.update(dt, this.player.x, this.player.y);

      // Collision Player
      const dist = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (dist < e.radius + this.player.radius) {
        this.die();
      }

      // Collision Bullets
      this.bullets.forEach((b, bi) => {
        const bDist = Math.hypot(e.x - b.x, e.y - b.y);
        if (bDist < e.radius + b.radius) {
          e.hp -= b.damage;
          if (b.pierceCount >= b.maxPierce) this.bullets.splice(bi, 1);
          else b.pierceCount++;
        }
      });

      if (e.hp <= 0) {
        this.enemies.splice(i, 1);
        this.kills++;
        this.gems.push(new XPGem(e.x, e.y, 10));
        if (Math.random() < 0.1) this.scraps++;
      }
    });

    this.gems.forEach((g, i) => {
      g.update(dt, this.player.x, this.player.y, this.player.stats.pickupRange);
      if (Math.hypot(g.x - this.player.x, g.y - this.player.y) < 20) {
        this.player.xp += g.value;
        this.gems.splice(i, 1);
        if (this.player.xp >= this.player.xpToNextLevel) {
          this.levelUp();
        }
      }
    });

    this.updateHUD();
  }

  private fire() {
    // Fire towards pointer
    const dx = this.pointerPos.x - this.canvas.width / 2;
    const dy = this.pointerPos.y - this.canvas.height / 2;
    const angle = Math.atan2(dy, dx);

    for (let i = 0; i < this.player.stats.multishot; i++) {
      const offset = (i - (this.player.stats.multishot - 1) / 2) * 0.2;
      const vx = Math.cos(angle + offset) * this.player.stats.bulletSpeed;
      const vy = Math.sin(angle + offset) * this.player.stats.bulletSpeed;
      this.bullets.push(new Bullet(
        this.player.x, this.player.y, vx, vy,
        this.player.stats.bulletDamage,
        this.player.stats.bulletSize,
        this.player.stats.pierce
      ));
    }
  }

  private spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(this.canvas.width, this.canvas.height);
    const x = this.player.x + Math.cos(angle) * dist;
    const y = this.player.y + Math.sin(angle) * dist;
    this.enemies.push(new Enemy(x, y, this.player.level));
  }

  private levelUp() {
    this.isPaused = true;
    this.player.level++;
    this.player.xp = 0;
    this.player.xpToNextLevel *= 1.2;

    const options = this.getRandomUpgrades(3);
    const list = document.getElementById('upgrade-list')!;
    list.innerHTML = '';

    options.forEach(upg => {
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `<h3>${upg.name}</h3><p>${upg.description}</p>`;
      card.onclick = () => {
        upg.apply(this.player.stats);
        this.isPaused = false;
        document.getElementById('upgrade-screen')!.classList.add('hidden');
      };
      list.appendChild(card);
    });

    document.getElementById('upgrade-screen')!.classList.remove('hidden');
    document.getElementById('lvl-val')!.textContent = this.player.level.toString();
  }

  private getRandomUpgrades(count: number): Upgrade[] {
    return [...this.upgradePool].sort(() => 0.5 - Math.random()).slice(0, count);
  }

  private updateHUD() {
    const min = Math.floor(this.timer / 60);
    const sec = Math.floor(this.timer % 60);
    document.getElementById('timer')!.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    document.getElementById('kill-counter')!.textContent = `KILLS: ${this.kills}`;

    const xpPercent = (this.player.xp / this.player.xpToNextLevel) * 100;
    document.getElementById('xp-bar-fill')!.style.width = `${xpPercent}%`;
  }

  private draw() {
    // Clear with camera offset
    this.ctx.fillStyle = '#030305';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.canvas.width / 2 - this.player.x, this.canvas.height / 2 - this.player.y);

    // Draw Grid
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    const gridSize = 100;
    const startX = Math.floor((this.player.x - this.canvas.width) / gridSize) * gridSize;
    const endX = Math.floor((this.player.x + this.canvas.width) / gridSize) * gridSize;
    const startY = Math.floor((this.player.y - this.canvas.height) / gridSize) * gridSize;
    const endY = Math.floor((this.player.y + this.canvas.height) / gridSize) * gridSize;

    for (let x = startX; x <= endX; x += gridSize) {
      this.ctx.beginPath(); this.ctx.moveTo(x, startY); this.ctx.lineTo(x, endY); this.ctx.stroke();
    }
    for (let y = startY; y <= endY; y += gridSize) {
      this.ctx.beginPath(); this.ctx.moveTo(startX, y); this.ctx.lineTo(endX, y); this.ctx.stroke();
    }

    this.gems.forEach(g => g.draw(this.ctx));
    this.bullets.forEach(b => b.draw(this.ctx));
    this.enemies.forEach(e => e.draw(this.ctx));
    this.player.draw(this.ctx);

    this.ctx.restore();
  }

  private die() {
    this.isRunning = false;
    this.totalScraps += this.scraps;
    localStorage.setItem('cyber-scraps', this.totalScraps.toString());

    document.getElementById('final-time')!.textContent = document.getElementById('timer')!.textContent;
    document.getElementById('final-kills')!.textContent = this.kills.toString();
    document.getElementById('final-scraps')!.textContent = this.scraps.toString();
    document.getElementById('game-over')!.classList.remove('hidden');
  }
}

function time() { return performance.now(); }

new Game();
