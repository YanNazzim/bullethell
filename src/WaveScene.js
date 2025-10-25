// src/WaveScene.js
import Phaser from 'phaser';
import { Projectile, Enemy } from './GameObjects';
import { 
    PLAYER_HEALTH, PLAYER_BASE_SPEED, MAP_WIDTH, MAP_HEIGHT, 
    WEAPON_DB, STAT_UPGRADE_DB, ENEMY_BASE_HEALTH, ENEMY_CHASE_SPEED, ENEMY_DAMAGE_BODY,
    ELITE_ENEMY_HEALTH, ELITE_ENEMY_SPEED, ELITE_ENEMY_DAMAGE,
    BOOMERANG_ENEMY_HEALTH, BOOMERANG_ENEMY_DAMAGE, BOOMERANG_ENEMY_CHASE_SPEED,
    MAX_BOOMERANG_ENEMIES, BOSS_LEVEL_INTERVAL, BOSS_BASE_HEALTH, BOSS_DAMAGE, BOSS_SHOOT_RATE_MS, BULLET_SPEED
} from './GameConstants';

// --- BASE SCENE: Contains all common initialization and methods ---
export class BaseScene extends Phaser.Scene {
    constructor(key) {
        super(key);
        // Player/Game Objects
        this.player = null;
        this.bullets = null;
        this.enemies = null;
        this.bossBullets = null;
        this.thrusterEmitter = null;
        this.joystick = null;

        // Callbacks to React UI
        this.onUpdate = () => {};
        this.onShowUpgrade = () => {};
        this.onGameOverSubmit = () => {};
        this.onTogglePause = () => {};

        // Game State and Stats
        this.score = 0;
        this.isGameOver = false;
        this.playerHealth = PLAYER_HEALTH;
        this.playerMaxHealth = PLAYER_HEALTH;
        this.playerWeaponDamage = 0;
        this.playerBaseDamage = 0;
        this.playerSpeed = PLAYER_BASE_SPEED;
        this.playerCritChance = 0;
        this.playerCritDamage = 2;
        this.bulletBounces = 0;
        this.playerWeaponInventory = new Map();
        this.sessionStartTime = 0;
        this.totalDamageDealt = 0;
        this.boomerangEnemiesCount = 0;
        this.isBossActive = false;
        this.boss = null;
        this.bossShootEvent = null;
        this.bossDirection = 0;
    }

    init(data) {
        this.onUpdate = data.onUpdate;
        this.onTogglePause = data.onTogglePause;
        this.onShowUpgrade = data.onShowUpgrade;
        this.onGameOverSubmit = data.onGameOverSubmit;
    }

    preload() {
        this.load.image('player', 'assets/player.png');
        this.load.image('blue_particle', 'https://labs.phaser.io/assets/particles/blue.png');
        this.load.image('space_bg', 'assets/space_bg.png');
        this.load.image('enemy', 'assets/smaller_enemy.png');
        this.load.image('shield', 'assets/icon_shield.png');
        this.load.image('bullet', 'assets/laser.png');
        this.load.image('elite_enemy', 'assets/elite_enemy.png');
        this.load.image('boomerang_enemy', 'assets/boomerang_enemy.png');
        this.load.image('boss', 'assets/purple_boss.png');
    }

    create() {
        this.resetGameStats();
        this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
        // --- FIX APPLIED HERE: Separated displayWidth/displayHeight assignments ---
        this.background = this.add.image(MAP_WIDTH / 2, MAP_HEIGHT / 2, 'space_bg');
        this.background.displayWidth = MAP_WIDTH; 
        this.background.displayHeight = MAP_HEIGHT;
        this.background.setScrollFactor(0.5, 0.5).setDepth(-1);
        // --- END FIX ---

        this.player = this.physics.add.image(MAP_WIDTH / 2, MAP_HEIGHT / 2, 'player')
            .setCollideWorldBounds(true).setScale(.2);
        this.player.body.setCircle(250).setOffset(250, 250);
        this.player.flashTween = null; this.player.invulnTimer = null;

        this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
        this.cameras.main.startFollow(this.player, true, 0.05, 0.05).setZoom(0.55);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = {
            up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W), down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A), right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
        };
        this.input.keyboard.on('keydown-P', this.onTogglePause, this);
        this.input.keyboard.on('keydown-ESC', this.onTogglePause, this);
        if (this.sys.game.device.input.touch) {
            this.input.on('pointerdown', this.handleTouchDown, this);
            this.input.on('pointerup', this.handleTouchUp, this);
        }

        this.bullets = this.physics.add.group({ classType: Projectile, maxSize: 30, runChildUpdate: true, key: 'bullet' });
        this.bossBullets = this.physics.add.group({ classType: Projectile, maxSize: 10, runChildUpdate: true, key: 'bullet' });
        this.enemies = this.physics.add.group({ classType: Enemy, runChildUpdate: true });

        this.thrusterEmitter = this.add.particles(0, 0, 'blue_particle', {
            speed: 50, angle: { min: -25, max: 25 }, scale: { start: 0.4, end: 0 }, alpha: { start: 0.8, end: 0 },
            lifespan: 200, blendMode: 'ADD', active: false
        });

        this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, null, this);
        this.physics.add.overlap(this.bossBullets, this.player, this.hitPlayerByBossBullet, null, this);
        this.physics.add.overlap(this.player, this.enemies, this.hitPlayerByEnemy, null, this);
        this.physics.add.collider(this.enemies, this.enemies);

        this.setupInitialWeapon();
        this.sendFullStats();
        this.onUpdate({ type: 'score', value: this.score });
    }

    resetGameStats() {
        this.score = 0; this.playerHealth = PLAYER_HEALTH; this.playerMaxHealth = PLAYER_HEALTH; this.playerSpeed = PLAYER_BASE_SPEED;
        this.playerBaseDamage = 0; this.playerCritChance = 0; this.playerCritDamage = 1.5; this.bulletBounces = 0;
        this.boomerangEnemiesCount = 0; this.isBossActive = false; this.boss = null; this.bossShootEvent = null;
        this.sessionStartTime = Date.now(); this.totalDamageDealt = 0; this.isGameOver = false;
        this.playerWeaponInventory.clear();
    }
    
    setupInitialWeapon() {
        const defaultWeaponState = { level: 1, damage: 2, atkSpeed: 2 };
        this.playerWeaponInventory.set('autoBullet', defaultWeaponState);
        WEAPON_DB.autoBullet.sync(this, defaultWeaponState);

        if (this.autoFireEvent) this.autoFireEvent.remove();
        this.autoFireEvent = this.time.addEvent({
            delay: 1000 / defaultWeaponState.atkSpeed, callback: this.fireBullet, callbackScope: this, loop: true
        });
    }
    
    // --- Common Utility Methods (omitted for brevity, copied from original BulletHellGame.js) ---
    handleTouchDown(pointer) {
        if (this.isGameOver || this.physics.world.isPaused) return;
        if (!this.joystick) {
             this.joystick = this.joystickPlugin.add(this, {
                x: -1000, y: -1000, radius: 5000,
                base: this.add.circle(0, 0, 60, 0x888888, 0.3), thumb: this.add.circle(0, 0, 30, 0xcccccc, 0.5),
                dir: '8dir', forceMin: 16,
            }).setScrollFactor(0).setVisible(false);
            this.joystick.base.setDepth(100); this.joystick.thumb.setDepth(100);
            this.joyStickCursorKeys = this.joystick.createCursorKeys();
        }
        this.joystick.base.x = pointer.x; this.joystick.base.y = pointer.y;
        this.joystick.thumb.x = pointer.x; this.joystick.thumb.y = pointer.y;
        this.joystick.setVisible(true);
    }
    handleTouchUp(pointer) {
        if (this.joystick) { this.joystick.setVisible(false); this.player.setVelocity(0); }
    }
    sendFullStats() {
        const weaponsForReact = [];
        for (const [key, state] of this.playerWeaponInventory.entries()) {
            const dbEntry = WEAPON_DB[key];
            weaponsForReact.push({
                key: key, name: dbEntry.name, level: state.level,
                ...(key === 'autoBullet' && { damage: state.damage, atkSpeed: state.atkSpeed }),
                ...(key === 'electricBolt' && { atkSpeed: 1000 / state.delay }),
                ...(key === 'shield' && { damage: state.damage, count: state.count })
            });
        }
        let bossDirection = null;
        if (this.isBossActive && this.boss) {
            const bossScreenX = this.boss.x - this.cameras.main.worldView.x;
            const bossScreenY = this.boss.y - this.cameras.main.worldView.y;
            const isBossOffScreen = bossScreenX < -50 || bossScreenX > this.cameras.main.width + 50 ||
                                    bossScreenY < -50 || bossScreenY > this.cameras.main.height + 50;
            if (isBossOffScreen) {
                const angleRad = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
                bossDirection = Phaser.Math.RadToDeg(angleRad);
            }
        }
        this.bossDirection = bossDirection;
        const elapsedTime = Date.now() - this.sessionStartTime;

        this.onUpdate({
            type: 'fullStats',
            waveNumber: this.waveNumber || this.level,
            health: this.playerHealth, maxHealth: this.playerMaxHealth,
            moveSpeed: this.playerSpeed, weapons: weaponsForReact,
            playerBaseDamage: this.playerBaseDamage, critChance: this.playerCritChance,
            critDamage: this.playerCritDamage, bulletBounces: this.bulletBounces,
            score: this.score, elapsedTime: elapsedTime,
            isBossActive: this.isBossActive, bossDirection: this.bossDirection
        });
    }
    update(time) {
        if (this.isGameOver) return;
        this.handlePlayerMovement();
        if (!this.physics.world.isPaused) {
            this.enemies.getChildren().forEach(enemy => {
                if (enemy.active) {
                    if (enemy.data.get('isBoss')) enemy.body.setVelocity(0);
                    else this.trackPlayer(enemy);
                }
            });
            for (const [key, state] of this.playerWeaponInventory.entries()) {
                if (WEAPON_DB[key].update) WEAPON_DB[key].update(this, state);
            }
            if (this.player.body.velocity.length() > 0) {
                const moveAngleRad = Phaser.Math.Angle.Between(0, 0, this.player.body.velocity.x, this.player.body.velocity.y);
                const thrustAngleRad = moveAngleRad + Math.PI;
                const thrustAngleDeg = Phaser.Math.RadToDeg(thrustAngleRad);
                const emitterX = this.player.x + Math.cos(thrustAngleRad) * 15;
                const emitterY = this.player.y + Math.sin(thrustAngleRad) * 15;
                this.thrusterEmitter.setPosition(emitterX, emitterY).setAngle(thrustAngleDeg);
                if (!this.thrusterEmitter.emitting) this.thrusterEmitter.start();
            } else { if (this.thrusterEmitter.emitting) this.thrusterEmitter.stop(); }
            this.sendFullStats();
            this.modeUpdate(); // Child scene hook
        } else { if (this.thrusterEmitter.emitting) this.thrusterEmitter.stop(); }
    }
    modeUpdate() {} // Placeholder for child scene logic
    handlePause(shouldPause) {
        if (this.isGameOver || this.physics.world.isPaused === shouldPause) return;
        this.physics.world.isPaused = shouldPause;
        if (this.autoFireEvent) this.autoFireEvent.paused = shouldPause;
        if (this.electricBoltEvent) this.electricBoltEvent.paused = shouldPause;
        if (this.bossShootEvent) this.bossShootEvent.paused = shouldPause;
        this.enemies.getChildren().forEach(enemy => { if (enemy.healthBar) enemy.healthBar.setVisible(!shouldPause); });
    }
    applyUpgrade(choice) {
        try {
            switch (choice.type) {
                case 'stat': STAT_UPGRADE_DB[choice.key].apply(this); break;
                case 'weapon_new': this.acquireWeapon(choice.key); break;
                case 'weapon_upgrade': this.upgradeWeapon(choice.key); break;
                default: console.warn(`[Phaser] Unknown upgrade type: ${choice.type}`); break;
            }
        } catch (error) { console.error(`[Phaser] Error applying upgrade: ${error}`, choice); }
        this.removeInvulnerability(this.player);
        this.sendFullStats();
        this.modeResumeAfterUpgrade(); // Child scene hook
    }
    modeResumeAfterUpgrade() {} // Placeholder for child scene logic
    acquireWeapon(weaponKey) {
        if (!WEAPON_DB[weaponKey] || this.playerWeaponInventory.has(weaponKey)) return;
        const initialState = { level: 1 };
        this.playerWeaponInventory.set(weaponKey, initialState);
        if (WEAPON_DB[weaponKey].acquire) WEAPON_DB[weaponKey].acquire(this, initialState);
    }
    upgradeWeapon(weaponKey) {
        if (!this.playerWeaponInventory.has(weaponKey)) return;
        const weaponState = this.playerWeaponInventory.get(weaponKey);
        const dbEntry = WEAPON_DB[weaponKey];
        if (weaponState.level >= dbEntry.maxLevel) return;
        weaponState.level++;
        if (dbEntry.upgrade) dbEntry.upgrade(this, weaponState);
        if (dbEntry.sync) dbEntry.sync(this, weaponState);
    }
    handlePlayerMovement() {
        this.player.setVelocity(0); let velX = 0; let velY = 0;
        const speed = this.playerSpeed;
        if (this.joystick && this.joystick.visible && this.joystick.force > 0) {
            const angleRad = Phaser.Math.DegToRad(this.joystick.angle);
            velX = Math.cos(angleRad) * speed; velY = Math.sin(angleRad) * speed;
        } else if (this.input.activePointer.isDown && !this.sys.game.device.input.touch) {
            const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.input.activePointer.worldX, this.input.activePointer.worldY);
            velX = Math.cos(angle) * speed; velY = Math.sin(angle) * speed;
        } else {
            if (this.cursors.left.isDown || this.wasd.left.isDown) velX = -speed;
            else if (this.cursors.right.isDown || this.wasd.right.isDown) velX = speed;
            if (this.cursors.up.isDown || this.wasd.up.isDown) velY = -speed;
            else if (this.cursors.down.isDown || this.wasd.down.isDown) velY = speed;
        }
        this.player.setVelocity(velX, velY);
        const isKeyboardMove = velX !== 0 && velY !== 0 && !(this.input.activePointer.isDown && !this.sys.game.device.input.touch) && !this.joystick?.visible;
        if (isKeyboardMove || (this.joystick && this.joystick.force > 0)) { this.player.body.velocity.normalize().scale(speed); }
        if (velX !== 0 || velY !== 0) { this.player.setRotation(Phaser.Math.Angle.Between(0, 0, velX, velY) + Math.PI / 2); }
    }
    fireBullet() {
        if (this.physics.world.isPaused || this.isGameOver) return;
        const targetEnemy = this.findNearestEnemy(this.player.x, this.player.y, []);
        if (!targetEnemy) return;
        const bullet = this.bullets.get(0, 0);
        if (bullet) {
            const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetEnemy.x, targetEnemy.y);
            bullet.fire(this.player.x, this.player.y, angle);
        }
    }
    bossFire() {
        if (!this.boss || this.physics.world.isPaused || this.isGameOver) return;
        const bullet = this.bossBullets.get(0, 0);
        if (bullet) {
            const angle = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, this.player.x, this.player.y);
            bullet.fire(this.boss.x, this.boss.y, angle, true, this.boss.getData('damage'));
        }
    }
    findNearestEnemy(x, y, excludeList = []) {
        const cam = this.cameras.main;
        const activeEnemies = this.enemies.getChildren().filter(e => e.active);
        if (activeEnemies.length === 0) return null;
        let nearestEnemy = null; let minDistance = Infinity;
        activeEnemies.forEach(enemy => {
            if (cam.worldView.contains(enemy.x, enemy.y) && !excludeList.includes(enemy) && !enemy.data.get('isBoss')) {
                const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
                if (distance < minDistance) { minDistance = distance; nearestEnemy = enemy; }
            }
        });
        return nearestEnemy;
    }
    trackPlayer(enemy) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        enemy.setRotation(angle + Math.PI / 2);
        const speed = enemy.getData('speed');
        this.physics.moveToObject(enemy, this.player, speed);
    }
    spawnRegularEnemy(x, y) {
        const enemy = this.enemies.get();
        if (enemy) {
            const currentLevel = this.waveNumber || this.level || 1;
            const levelBonus = currentLevel - 1; 
            let health = ENEMY_BASE_HEALTH * (1 + levelBonus * 0.15);
            health = Math.max(ENEMY_BASE_HEALTH, Math.floor(health));
            let speed = ENEMY_CHASE_SPEED + levelBonus * 3;
            speed = Math.min(this.playerSpeed, speed);
            enemy.spawn(x, y, 'enemy', 0.15, health, speed, ENEMY_DAMAGE_BODY, false);
        }
    }
    spawnBoomerangEnemy(x, y) {
        if (this.boomerangEnemiesCount >= MAX_BOOMERANG_ENEMIES) return;
        const enemy = this.enemies.get();
        if (enemy) {
            this.boomerangEnemiesCount++;
            const currentLevel = this.waveNumber || this.level || 1;
            const levelBonus = currentLevel - 1;
            let health = BOOMERANG_ENEMY_HEALTH * (1 + levelBonus * 0.15);
            health = Math.max(BOOMERANG_ENEMY_HEALTH, Math.floor(health));
            let speed = BOOMERANG_ENEMY_CHASE_SPEED + levelBonus * 4;
            speed = Math.min(250, speed);
            enemy.spawn(x, y, 'boomerang_enemy', 0.3, health, speed, BOOMERANG_ENEMY_DAMAGE, false);
        }
    }
    spawnElite(x, y) {
        const elite = this.enemies.get();
        if (elite) {
            const currentLevel = this.waveNumber || this.level || 1;
            const levelBonus = currentLevel - 1;
            let health = ELITE_ENEMY_HEALTH * (1 + levelBonus * 0.25);
            health = Math.max(ELITE_ENEMY_HEALTH, Math.floor(health));
            let speed = ELITE_ENEMY_SPEED + levelBonus * 3;
            speed = Math.min(100, speed);
            elite.spawn(x, y, 'elite_enemy', .33, health, speed, ELITE_ENEMY_DAMAGE, true);
        }
    }
    spawnBoss(x, y) {
        const boss = this.enemies.get();
        if (boss) {
            this.isBossActive = true; this.boss = boss;
            const waveNumber = this.waveNumber || this.level || 1;
            const levelMultiplier = Math.floor(waveNumber / BOSS_LEVEL_INTERVAL);
            const levelBonus = waveNumber - 1;
            let health = BOSS_BASE_HEALTH * levelMultiplier * (1 + levelBonus * 0.2);
            health = Math.max(BOSS_BASE_HEALTH * levelMultiplier, Math.floor(health));
            let maxArmor = Math.floor(health * (0.5 + levelMultiplier * 0.1));
            const damage = BOSS_DAMAGE + levelBonus * 0.5;
            boss.spawn(x, y, 'boss', 0.6, health, 0, damage, true, true);
            boss.setData('armor', maxArmor).setData('maxArmor', maxArmor).drawHealthBar();
            
            if (this.bossShootEvent) this.bossShootEvent.remove();
            this.bossShootEvent = this.time.addEvent({
                delay: BOSS_SHOOT_RATE_MS, callback: this.bossFire, callbackScope: this, loop: true
            });
            this.waveTotalEnemies = 1; this.enemiesLeftInWave = 1;
        }
    }
    updateHealth(damage) {
        if (this.isGameOver) return;
        this.playerHealth -= damage;
        this.playerHealth = Math.max(0, this.playerHealth);
        this.onUpdate({ type: 'health', value: this.playerHealth, max: this.playerMaxHealth });
        if (this.playerHealth <= 0) this.handleGameOver();
        else { this.cameras.main.flash(100, 255, 0, 0); this.setInvulnerable(this.player, 1000); }
    }
    hitPlayerByBossBullet(player, bullet) {
        if (!player.active || !bullet.active || player.invulnerable) return;
        if (bullet.getData('isBossBullet')) {
            this.updateHealth(bullet.getData('damage'));
            bullet.disableProjectile();
        }
    }
    handleGameOver() {
        this.isGameOver = true;
        this.player.setActive(false).setVisible(false);
        this.physics.pause();
        this.onUpdate({ type: 'gameOver', value: true });
        if (this.shieldOrbs) this.shieldOrbs.destroy();
        if (this.shieldCollider) this.shieldCollider.destroy();
        if (this.bossShootEvent) { this.bossShootEvent.remove(); this.bossShootEvent = null; }

        const sessionDuration = Date.now() - this.sessionStartTime;
        this.onGameOverSubmit({
             score: this.score,
             waveReached: this.waveNumber || this.level,
             damageDealt: this.totalDamageDealt,
             sessionDuration: sessionDuration
        });
    }
    setInvulnerable(player, duration = 1000) {
        player.invulnerable = true;
        if (player.flashTween) player.flashTween.stop();
        player.flashTween = this.tweens.add({
            targets: player, alpha: 0.3, ease: 'Power1', duration: 100, yoyo: true, repeat: -1,
        });
        if (player.invulnTimer) player.invulnTimer.remove();
        if (duration > 0) {
            player.invulnTimer = this.time.delayedCall(duration, () => { this.removeInvulnerability(player); });
        }
    }
    removeInvulnerability(player) {
        if (player.flashTween) { player.flashTween.stop(); player.flashTween = null; }
        if (player.invulnTimer) { player.invulnTimer.remove(); player.invulnTimer = null; }
        player.alpha = 1; player.invulnerable = false;
    }
    hitPlayerByEnemy(player, enemy) {
        if (player.active && (player.invulnerable === undefined || !player.invulnerable)) {
            const damage = enemy.getData('damage');
            this.updateHealth(damage);
        }
    }
    hitEnemy(bullet, enemy) {
        if (bullet.getData('isBossBullet') || !enemy.active || !bullet.active || bullet.enemiesHit.has(enemy)) return;
        bullet.enemiesHit.add(enemy);

        const baseDmg = this.playerWeaponDamage + this.playerBaseDamage;
        const isCrit = Math.random() < this.playerCritChance;
        const finalDmg = isCrit ? baseDmg * this.playerCritDamage : baseDmg;

        const [, damageDealt] = enemy.takeDamage(finalDmg, isCrit);
        this.totalDamageDealt += damageDealt;

        if (bullet.bouncesLeft > 0) {
            bullet.bouncesLeft--;
            const nextTarget = this.findNearestEnemy(bullet.x, bullet.y, Array.from(bullet.enemiesHit).concat(this.boss ? [this.boss] : []));
            if (nextTarget) {
                const angle = Phaser.Math.Angle.Between(bullet.x, bullet.y, nextTarget.x, nextTarget.y);
                bullet.setRotation(angle).setData('vx', Math.cos(angle) * BULLET_SPEED).setData('vy', Math.sin(angle) * BULLET_SPEED).body.setVelocity(Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED);
            } else { bullet.disableProjectile(); }
        } else { bullet.disableProjectile(); }
    }
    hitEnemyByShield(shieldOrb, enemy) {
        if (!enemy.active) return;
        const shieldState = this.playerWeaponInventory.get('shield');
        if (!shieldState) return;
        if (!enemy.shieldHitCooldown) {
            const baseDmg = shieldState.damage + this.playerBaseDamage;
            const isCrit = Math.random() < this.playerCritChance;
            const finalDmg = isCrit ? baseDmg * this.playerCritDamage : baseDmg;
            const [, damageDealt] = enemy.takeDamage(finalDmg, isCrit);
            this.totalDamageDealt += damageDealt;
            enemy.shieldHitCooldown = true;
            this.time.delayedCall(250, () => { if (enemy) enemy.shieldHitCooldown = false; });
        }
    }
    drawZapLine(p1, p2, color, duration = 100) {
        const lineGraphics = this.add.graphics().setDepth(50).lineStyle(2, color, 1).beginPath().moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).strokePath();
        this.tweens.add({ targets: lineGraphics, alpha: 0, duration: duration, onComplete: () => lineGraphics.destroy() });
    }
    zapEnemies() {
        if (this.physics.world.isPaused || this.isGameOver || !this.playerWeaponInventory.has('electricBolt')) return;
        const activeEnemies = this.enemies.getChildren().filter(e => e.active);
        if (activeEnemies.length === 0) return;
        let target = this.findNearestEnemy(this.player.x, this.player.y, []);
        if (!target) return;
        const zapColor = 0x61dafb;
        const electricChains = 3;
        let zappedEnemies = new Set();
        let currentTarget = target;
        let prevTarget = this.player;
        const baseDmg = (this.playerWeaponDamage + this.playerBaseDamage) * 0.75;
        const isCrit = Math.random() < this.playerCritChance;
        const finalDmg = isCrit ? baseDmg * this.playerCritDamage : baseDmg;
        for (let i = 0; i < electricChains; i++) {
            if (!currentTarget || zappedEnemies.has(currentTarget)) break;
            if (prevTarget) this.drawZapLine(prevTarget, currentTarget, zapColor);
            prevTarget = currentTarget;
            zappedEnemies.add(currentTarget);
            const [, damageDealt] = currentTarget.takeDamage(finalDmg, isCrit);
            this.totalDamageDealt += damageDealt;
            const zappedEnemy = currentTarget;
            zappedEnemy.setTint(isCrit ? 0xffaa00 : zapColor);
            this.time.delayedCall(50, () => {
                if (zappedEnemy.active) {
                    if (zappedEnemy.getData('isBoss')) zappedEnemy.setTint(0xcc00cc);
                    else if (zappedEnemy.getData('isElite')) zappedEnemy.setTint(0xff0000);
                    else if (zappedEnemy.getData('isBoomerang')) zappedEnemy.setTint(0xffaa00);
                    else zappedEnemy.clearTint();
                }
            });
            let nextTarget = null;
            let minDistance = Infinity;
            for (const enemy of activeEnemies) {
                if (enemy.active && !zappedEnemies.has(enemy) && !enemy.getData('isBoss')) {
                    const distance = Phaser.Math.Distance.Between(currentTarget.x, currentTarget.y, enemy.x, enemy.y);
                    if (distance < minDistance) { minDistance = distance; nextTarget = enemy; }
                }
            }
            currentTarget = nextTarget;
        }
    }
    generateUpgradeChoices() {
        let choices = [];
        const availableNewWeapons = [];
        for (const key in WEAPON_DB) {
            if (key !== 'autoBullet' && !this.playerWeaponInventory.has(key)) { availableNewWeapons.push(key); }
        }
        const availableWeaponUpgrades = [];
        for (const [key, state] of this.playerWeaponInventory.entries()) {
            if (state.level < WEAPON_DB[key].maxLevel) { availableWeaponUpgrades.push(key); }
        }
        let availableStatUpgrades = [];
        for (const key in STAT_UPGRADE_DB) {
            if (key === 'critDamage' && this.playerCritChance === 0) continue;
            if (STAT_UPGRADE_DB[key].maxLevel) {
                 if (key === 'critChance' && this.playerCritChance >= (STAT_UPGRADE_DB[key].maxLevel * 0.05)) continue;
            }
            availableStatUpgrades.push(key);
        }
        if (availableNewWeapons.length > 0) {
            const chosenKey = Phaser.Math.RND.pick(availableNewWeapons);
            const db = WEAPON_DB[chosenKey];
            choices.push({ type: 'weapon_new', key: chosenKey, name: db.name, description: db.description, image: db.image, level: 1 });
        }
        if (availableStatUpgrades.length > 0) {
            const chosenStatKey = Phaser.Math.RND.pick(availableStatUpgrades);
            const dbStat = STAT_UPGRADE_DB[chosenStatKey];
            choices.push({ type: 'stat', key: chosenStatKey, name: dbStat.name, description: dbStat.description, image: dbStat.image, level: 'N/A' });
        }
        if (availableWeaponUpgrades.length > 0) {
            const chosenKey = Phaser.Math.RND.pick(availableWeaponUpgrades);
            const db = WEAPON_DB[chosenKey];
            const state = this.playerWeaponInventory.get(chosenKey);
            choices.push({ type: 'weapon_upgrade', key: chosenKey, name: `Upgrade ${db.name}`, description: `Increases ${db.name} to Level ${state.level + 1}.`, image: db.image, level: state.level + 1 });
        }
        while(choices.length < 3 && availableStatUpgrades.length > 0) {
             const chosenStatKey = Phaser.Math.RND.pick(availableStatUpgrades);
             if (choices.find(c => c.key === chosenStatKey)) {
                 availableStatUpgrades = availableStatUpgrades.filter(s => s !== chosenStatKey);
                 if(availableStatUpgrades.length === 0) break;
                 continue;
             }
             const dbStat = STAT_UPGRADE_DB[chosenStatKey];
             choices.push({ type: 'stat', key: chosenStatKey, name: dbStat.name, description: dbStat.description, image: dbStat.image, level: 'N/A' });
        }
        return Phaser.Math.RND.shuffle(choices);
    }
}


// --- WAVE SCENE (Child of BaseScene - Original Game Logic) ---
export class WaveScene extends BaseScene {
    constructor() {
        super('WaveScene');
        this.waveNumber = 0;
        this.enemiesLeftInWave = 0;
        this.waveTotalEnemies = 0;
    }

    create() {
        super.create();
        this.startNextWave();
    }
    
    startNextWave() {
        this.waveNumber++;
        this.onUpdate({ type: 'newWave', value: this.waveNumber });

        const isBossRound = this.waveNumber % BOSS_LEVEL_INTERVAL === 0 && this.waveNumber > 0;
        const playerX = this.player.x;
        const playerY = this.player.y;

        if (isBossRound) {
            let x, y;
            const bossSpawnDistance = 1500;
             do { x = Phaser.Math.Between(0, MAP_WIDTH); y = Phaser.Math.Between(0, MAP_HEIGHT);
            } while (Phaser.Math.Distance.Between(x, y, playerX, playerY) < bossSpawnDistance);

            this.spawnBoss(x, y);
            this.waveTotalEnemies = 1;
            this.enemiesLeftInWave = 1;
        } else if (this.isBossActive) {
            this.isBossActive = false;
            if(this.boss) this.boss = null;
            this.spawnWave();
        } else {
            this.spawnWave();
        }
        this.sendFullStats();
    }

    spawnWave() {
        if (this.isGameOver || this.isBossActive) return;
        
        const mapWidth = MAP_WIDTH;
        const mapHeight = MAP_HEIGHT;
        const playerX = this.player.x;
        const playerY = this.player.y;
        // const spawnDistance = 500; // Removed redundant variable for linting clean-up

        const baseWaveSize = 5;
        this.waveTotalEnemies = baseWaveSize + (this.waveNumber - 1) * 2;
        this.enemiesLeftInWave = this.waveTotalEnemies;

        let eliteChance = 0.05 + (this.waveNumber * 0.005);
        eliteChance = Math.min(0.35, eliteChance);

        let boomerangChance = 0.1 + (this.waveNumber * 0.002);
        boomerangChance = Math.min(0.25, boomerangChance);

        this.boomerangEnemiesCount = 0;

        for (let i = 0; i < this.waveTotalEnemies; i++) {
            let x, y;
            do { x = Phaser.Math.Between(0, mapWidth); y = Phaser.Math.Between(0, mapHeight);
            } while (Phaser.Math.Distance.Between(x, y, playerX, playerY) < 500); // Used literal value

            if (this.waveNumber > 1 && Math.random() < boomerangChance && this.boomerangEnemiesCount < MAX_BOOMERANG_ENEMIES) {
                this.spawnBoomerangEnemy(x, y);
            } else if (this.waveNumber > 5 && Math.random() < eliteChance) {
                this.spawnElite(x, y);
            } else {
                this.spawnRegularEnemy(x, y);
            }
        }
    }

    enterUpgradeState() {
        const choices = this.generateUpgradeChoices();
        this.onShowUpgrade(choices);
        this.setInvulnerable(this.player, -1);
    }
    
    // Hooks from BaseScene
    modeResumeAfterUpgrade() {
        this.startNextWave();
    }

    onEnemyKilled(enemy) {
        if (this.isGameOver) return;
        if (!enemy.getData('isBoss')) {
            this.score += 1;
            this.onUpdate({ type: 'score', value: this.score });
        }
        this.enemiesLeftInWave = Math.max(0, this.enemiesLeftInWave - 1);
        if (this.enemiesLeftInWave <= 0) {
            this.enterUpgradeState();
        }
    }
}