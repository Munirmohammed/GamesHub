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
  shield: number;
  maxShield: number;
}

interface MetaStats {
  hpLevel: number;
  dmgLevel: number;
}

// --- ENTITIES ---

class Player {
  x: number;
  y: number;
  radius: number = 15;
  rotation: number = 0;
  stats: GameStats;
  xp: number = 0;
  xpToNextLevel: number = 100;
  level: number = 1;
  lastFireTime: number = 0;
  feedbackText: string = "";
  feedbackTimer: number = 0;

  constructor(w: number, h: number) {
    this.x = w / 2;
    this.y = h / 2;
    this.resetStats();
  }

  resetStats() {
    this.stats = {
      hp: 100, maxHp: 100, moveSpeed: 200,
      fireRate: 0.5, bulletDamage: 10, bulletSpeed: 500,
      bulletSize: 4, pickupRange: 250,
      pierce: 0, multishot: 1, shield: 0, maxShield: 0
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
      this.rotation = Math.atan2(dy, dx);
    }

    if (this.feedbackTimer > 0) this.feedbackTimer -= dt;
  }

  showFeedback(text: string) {
    this.feedbackText = text;
    this.feedbackTimer = 1.5;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // Rocket/Ship Body
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f2ff';
    ctx.fillStyle = '#00f2ff';
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();

    // Engine Glow
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-8, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Shield Visual
    if (this.stats.shield > 0) {
      ctx.save();
      ctx.strokeStyle = '#00f2ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Feedback Text
    if (this.feedbackTimer > 0) {
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Outfit';
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, this.feedbackTimer);
      ctx.fillText(this.feedbackText, this.x, this.y - 30);
      ctx.restore();
    }
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
      this.speed = 80 + Math.min(level * 5, 80); // Reduced starting speed from 120
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
  // Rocket image for visual representation
  private img: HTMLImageElement = (() => {
    const i = new Image();
    i.src = '../assets/rocket.png'; // Ensure this image exists in assets folder
    return i;
  })();
  // Simple trail effect (smoke particles)
  private trail: { x: number; y: number; alpha: number }[] = [];
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

    // Add current position to trail
    this.trail.push({ x: this.x, y: this.y, alpha: 0.6 });
    // Keep trail length manageable
    if (this.trail.length > 10) {
      this.trail.shift();
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // Draw exhaust trail (smoke particles)
    this.trail.forEach((point, index) => {
      const size = this.radius * (index / this.trail.length);
      ctx.globalAlpha = point.alpha * (index / this.trail.length);
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;

    // Draw rocket sprite
    if (this.img.complete && this.img.naturalHeight !== 0) {
      // Calculate rotation angle based on velocity
      const angle = Math.atan2(this.vy, this.vx);
      ctx.translate(this.x, this.y);
      ctx.rotate(angle);
      ctx.drawImage(this.img, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
      ctx.resetTransform();
    } else {
      // Fallback: draw as triangle pointing in direction of movement
      const angle = Math.atan2(this.vy, this.vx);
      ctx.translate(this.x, this.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff6600';
      ctx.beginPath();
      // Rocket shape
      ctx.moveTo(this.radius, 0);
      ctx.lineTo(-this.radius, -this.radius / 2);
      ctx.lineTo(-this.radius / 3, 0);
      ctx.lineTo(-this.radius, this.radius / 2);
      ctx.closePath();
      ctx.fill();
    }

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

class ScrapItem extends XPGem {
  constructor(x: number, y: number) {
    super(x, y, 0);
    this.color = '#00f2ff';
    this.radius = 5;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    // Draw as a small triangle
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - this.radius);
    ctx.lineTo(this.x + this.radius, this.y + this.radius);
    ctx.lineTo(this.x - this.radius, this.y + this.radius);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// --- AUDIO MANAGER ---
class AudioManager {
  private ctx: AudioContext | null = null;

  init() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  play(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  gem() { this.play(880, 'sine', 0.1); }
  hit() { this.play(150, 'sawtooth', 0.2, 0.05); }
  upg() {
    this.play(440, 'square', 0.1);
    setTimeout(() => this.play(880, 'square', 0.2), 100);
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
  private scrapItems: ScrapItem[] = [];
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
  private isLevelingUp: boolean = false;
  private audio: AudioManager = new AudioManager();
  private starfield: { x: number, y: number, s: number }[] = [];

  private upgradePool: Upgrade[] = [
    { id: 'dmg', name: 'PLASMA OVERDRIVE', description: 'Increases bullet damage by +35%. Heavy impact.', level: 0, maxLevel: 5, apply: (s) => s.bulletDamage *= 1.35 },
    { id: 'rate', name: 'HYPER-CLOCKING', description: 'Massive +40% Fire Rate increase. Shred enemies.', level: 0, maxLevel: 5, apply: (s) => s.fireRate *= 0.6 },
    { id: 'speed', name: 'TURBO-THRUSTERS', description: '+20% Move Speed. Better dodging.', level: 0, maxLevel: 5, apply: (s) => s.moveSpeed *= 1.2 },
    { id: 'multi', name: 'SPLIT-CORE MATRIX', description: 'Add +1 bullet per shot.', level: 0, maxLevel: 3, apply: (s) => s.multishot += 1 },
    { id: 'range', name: 'VOID MAGNET', description: '+50% Magnet Range for loot.', level: 0, maxLevel: 5, apply: (s) => s.pickupRange *= 1.5 },
    { id: 'shield', name: 'AEGIS BARRIER', description: 'Add +1 Shield charge.', level: 0, maxLevel: 10, apply: (s) => { s.shield += 1; s.maxShield += 1; } },
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

    // Init Starfield
    for (let i = 0; i < 150; i++) {
      this.starfield.push({
        x: Math.random() * 2000 - 1000,
        y: Math.random() * 2000 - 1000,
        s: Math.random() * 1.5 + 0.5
      });
    }

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
    const scrapsEl = document.getElementById('meta-scraps');
    if (scrapsEl) scrapsEl.textContent = this.totalScraps.toString();
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
    document.getElementById('start-btn')!.onclick = () => {
      this.audio.init();
      this.start();
    };
    document.getElementById('pause-btn')!.onclick = () => this.togglePause();
    document.getElementById('resume-btn')!.onclick = () => this.togglePause();
    document.getElementById('restart-btn')!.onclick = () => location.reload();
  }

  private togglePause() {
    this.isPaused = !this.isPaused;
    document.getElementById('pause-screen')!.classList.toggle('hidden', !this.isPaused);
  }

  private start() {
    this.isRunning = true;
    this.isPaused = false;
    this.timer = 0;
    this.enemies = [];
    this.bullets = [];
    this.gems = [];
    this.scrapItems = [];
    this.kills = 0;
    this.scraps = 0;
    this.lastTime = performance.now();

    this.player = new Player(this.canvas.width, this.canvas.height);
    // Apply Meta Stats
    this.player.stats.maxHp += this.metaStats.hpLevel * 20;
    this.player.stats.hp = this.player.stats.maxHp;
    this.player.stats.bulletDamage += this.metaStats.dmgLevel * 5;

    document.getElementById('hud')!.classList.remove('hidden');
    document.getElementById('start-screen')!.classList.add('hidden');
    document.getElementById('active-upgrades')!.innerHTML = '';
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
    const spawnDelay = Math.max(0.3, 2.0 - (this.timer / 150)); // Much slower start
    if (this.spawnTimer > spawnDelay) {
      const type = Math.random() > 0.9 ? 'tank' : 'basic';
      this.spawnEnemy(type);
      this.spawnTimer = 0;
    }

    // Update Bullets (Reverse Loop)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.update(dt);
      if (b.life < 0) {
        this.bullets.splice(i, 1);
      }
    }

    // Update Enemies (Reverse Loop)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, this.player.x, this.player.y);

      // Collision Player
      const dist = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (dist < e.radius + this.player.radius) {
        if (this.player.stats.shield > 0) {
          this.player.stats.shield--;
          this.enemies.splice(i, 1);
          this.audio.hit();
          continue;
        } else {
          this.die();
          return;
        }
      }

      // Collision Bullets
      let enemyDead = false;
      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        const bDist = Math.hypot(e.x - b.x, e.y - b.y);
        if (bDist < e.radius + b.radius) {
          e.hp -= b.damage;
          if (b.pierceCount >= b.maxPierce) {
            this.bullets.splice(j, 1);
          } else {
            b.pierceCount++;
          }
          if (e.hp <= 0) {
            enemyDead = true;
            break;
          }
        }
      }

      if (enemyDead) {
        this.enemies.splice(i, 1);
        this.kills++;
        this.gems.push(new XPGem(e.x, e.y, 25));
        if (Math.random() < 0.2) this.scrapItems.push(new ScrapItem(e.x, e.y));
      }
    }

    // Update Gems (Reverse Loop)
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.update(dt, this.player.x, this.player.y, this.player.stats.pickupRange);
      if (Math.hypot(g.x - this.player.x, g.y - this.player.y) < 20) {
        this.player.xp += g.value;
        this.gems.splice(i, 1);
        this.audio.gem();
        if (this.player.xp >= this.player.xpToNextLevel && !this.isLevelingUp) {
          this.isLevelingUp = true;
          this.isPaused = true;
          this.updateHUD(); // Ensure bar fills
          this.audio.upg();
          setTimeout(() => this.levelUp(), 700); // Wait for CSS animation
        }
      }
    }

    // Update Scraps (Reverse Loop)
    for (let i = this.scrapItems.length - 1; i >= 0; i--) {
      const s = this.scrapItems[i];
      s.update(dt, this.player.x, this.player.y, this.player.stats.pickupRange);
      if (Math.hypot(s.x - this.player.x, s.y - this.player.y) < 20) {
        this.scraps++;
        this.scrapItems.splice(i, 1);
        this.audio.gem();
      }
    }

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
    this.isLevelingUp = true;
    this.isPaused = true;
    this.player.level++;
    this.player.xp -= this.player.xpToNextLevel; // Carry over excess XP
    this.player.xpToNextLevel *= 1.25;

    // RESET SURGE: Clear temporary boosts (except shield)
    const currentShield = this.player.stats.shield;
    const currentMaxShield = this.player.stats.maxShield;

    this.player.resetStats();
    // Re-apply Meta Stats
    this.player.stats.maxHp += this.metaStats.hpLevel * 20;
    this.player.stats.bulletDamage += this.metaStats.dmgLevel * 5;
    // Restore Shield
    this.player.stats.shield = currentShield;
    this.player.stats.maxShield = currentMaxShield;

    // Clear Status Bar (Surges)
    document.getElementById('active-upgrades')!.innerHTML = '';
    this.upgradePool.forEach(u => {
      if (u.id !== 'shield') u.level = 0;
    });
    this.updateHUD(); // Force HUD update to show shield count

    const options = this.getRandomUpgrades(3);
    const list = document.getElementById('upgrade-list')!;
    list.innerHTML = '';

    options.forEach(upg => {
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `<h3>${upg.name}</h3><p>${upg.description}</p>`;
      card.onclick = () => {
        upg.apply(this.player.stats);
        upg.level++;
        this.player.showFeedback(upg.name + " ACTIVATED");
        this.audio.upg();

        // Add to Status Bar
        const bar = document.getElementById('active-upgrades')!;
        let tag = document.getElementById(`tag-${upg.id}`);
        if (!tag) {
          tag = document.createElement('div');
          tag.id = `tag-${upg.id}`;
          tag.className = 'upg-tag';
          bar.appendChild(tag);
        }
        const emoji = upg.id === 'dmg' ? '🔥' : upg.id === 'rate' ? '⚡' : upg.id === 'speed' ? '👟' : upg.id === 'multi' ? '🌀' : upg.id === 'range' ? '🧲' : '🛡️';
        tag.textContent = `${emoji} LVL ${upg.level}`;

        // Safe Pulse: Clear nearby enemies
        const pulseRadius = 300;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          const dist = Math.hypot(e.x - this.player.x, e.y - this.player.y);
          if (dist < pulseRadius) {
            this.enemies.splice(i, 1);
          }
        }

        this.isLevelingUp = false;
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
    // Clear
    this.ctx.fillStyle = '#030305';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.canvas.width / 2 - this.player.x, this.canvas.height / 2 - this.player.y);

    // Draw Starfield
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    this.starfield.forEach(s => {
      // Parallax effect: wrap stars
      let sx = (s.x - this.player.x * 0.2) % 1000;
      let sy = (s.y - this.player.y * 0.2) % 1000;
      if (sx < 0) sx += 1000;
      if (sy < 0) sy += 1000;
      this.ctx.beginPath();
      this.ctx.arc(this.player.x - 500 + sx, this.player.y - 500 + sy, s.s, 0, Math.PI * 2);
      this.ctx.fill();
    });

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
    this.scrapItems.forEach(s => s.draw(this.ctx));
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
