import React, { useEffect, useRef, useImperativeHandle } from 'react';
import Phaser from 'phaser';
// --- NEW: Re-added the joystick plugin import ---
import VirtualJoystickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';


// --- CONFIGURATION CONSTANTS ---
const PLAYER_SPEED = 200;
const PLAYER_HEALTH = 10;
const AUTO_FIRE_RATE_MS = 500; // 500ms = 2 attacks per second

const BULLET_SPEED = 400;

const ENEMY_SPAWN_RATE_MS = 3000;
const ENEMY_CHASE_SPEED = 50;
const ENEMY_BASE_HEALTH = 3; 
const ENEMY_DAMAGE_BODY = 1;

// --- NEW: Elite Enemy Stats ---
const ELITE_ENEMY_HEALTH = 25;
const ELITE_ENEMY_SPEED = 30;
const ELITE_ENEMY_DAMAGE = 3;


// --- PHASER SCENES ---

// FIX: Custom Projectile Class with self-correcting velocity
class Projectile extends Phaser.Physics.Arcade.Image {
    constructor(scene, x, y, texture) {
        super(scene, x, y, texture);
        
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.body.setAllowGravity(false); 
        this.setData('vx', 0);
        this.setData('vy', 0);
        
        this.despawnTimer = null;
    }

    // Called when the bullet is retrieved from the pool
    fire(x, y, angle) {
        if (this.despawnTimer) {
            this.despawnTimer.remove(false);
        }
        
        this.setTexture('bullet');
        this.body.enable = true;
        this.body.reset(x, y); 
        
        this.setRotation(angle); 
        this.setActive(true).setVisible(true).setScale(0.03); 
        
        const vx = Math.cos(angle) * BULLET_SPEED;
        const vy = Math.sin(angle) * BULLET_SPEED;

        this.setData('vx', vx);
        this.setData('vy', vy);
        
        this.body.setVelocity(vx, vy);

        this.despawnTimer = this.scene.time.delayedCall(1500, this.disableProjectile, [], this);
    }

    disableProjectile() {
        if (this.despawnTimer) {
            this.despawnTimer.remove(false);
        }
        this.despawnTimer = null;
        
        this.disableBody(true, true); 
    }
    
    update() {
        if (!this.active) return;
        this.body.setVelocity(this.data.get('vx'), this.data.get('vy'));
    }
}

// --- NEW: Custom Enemy Class with Health Bar ---
class Enemy extends Phaser.Physics.Arcade.Image {
    constructor(scene, x, y, texture) {
        super(scene, x, y, texture);
        
        this.healthBar = scene.add.graphics();
        this.healthBar.setDepth(10); 
    }

    // This is called when we get an enemy from the group
    spawn(x, y, key, scale, health, speed, damage, isElite) {
        this.scene.add.existing(this);
        this.scene.physics.add.existing(this);
        
        this.setTexture(key);
        this.body.reset(x, y);
        this.body.enable = true;
        
        this.setActive(true).setVisible(true).setScale(scale).setRotation(0);
        
        this.setData('health', health);
        this.setData('maxHealth', health); // Use the scaled health
        this.setData('speed', speed); // Use the scaled speed
        this.setData('damage', damage);
        this.setData('isElite', isElite);
        
        if (isElite) {
            this.setTint(0xff0000);
        }
        
        this.drawHealthBar();
    }
    
    // This is called by the physics overlap
    takeDamage(amount) {
        if (!this.active) return false;
        
        const newHealth = this.getData('health') - amount;
        this.setData('health', newHealth);
        
        if (newHealth <= 0) {
            this.kill();
            return true; // Is dead
        }
        
        // Flash white (or red-white for elites)
        this.setTint(0xffffff);
        this.scene.time.delayedCall(50, () => {
            if (this.active) {
                if (this.getData('isElite')) {
                    this.setTint(0xff0000); // Back to red
                } else {
                    this.clearTint(); // Back to normal
                }
            }
        });
        
        return false; // Is not dead
    }

    drawHealthBar() {
        this.healthBar.clear();
        
        if (!this.active) return;
        
        const p = this.getData('health') / this.getData('maxHealth');
        
        const w = (this.width * this.scaleX);
        const h = 5; 
        const x = this.x - w / 2;
        const y = this.y - (this.height * this.scaleY) / 2 - (h * 2); 
        
        this.healthBar.fillStyle(0x333333);
        this.healthBar.fillRect(x, y, w, h);
        
        this.healthBar.fillStyle(p < 0.3 ? 0xff0000 : 0x00ff00); 
        this.healthBar.fillRect(x, y, w * p, h);
    }

    // This is called every frame
    preUpdate(time, delta) {
        // super.preUpdate(time, delta); // This was the bug
        
        if (this.active) {
            this.drawHealthBar();
        }
    }
    
    kill() {
        this.healthBar.clear(); 
        this.disableBody(true, true); 
    }
}
// --- END: Custom Enemy Class ---


class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        this.player = null;
        this.bullets = null; 
        this.enemies = null;
        this.score = 0;
        this.isGameOver = false;
        
        this.onUpdate = () => {}; 
        this.pauseText = null; 
        this.autoFireEvent = null; 
        
        this.background = null;
        this.thrusterEmitter = null;
        
        this.onTogglePause = () => {};
        
        // --- JOYSTICK: Added properties back ---
        this.joystick = null;
        this.joyStickCursorKeys = null;
        this.joystickPlugin = null; 
        
        this.onShowUpgrade = () => {}; 
        this.playerHealth = PLAYER_HEALTH;
        this.playerMaxHealth = PLAYER_HEALTH;
        this.playerDamage = 1;
        this.playerLevel = 1;
        
        this.playerAttacksPerSecond = 1000 / AUTO_FIRE_RATE_MS; 
        this.playerAttackSpeedDelay = AUTO_FIRE_RATE_MS;
        
        this.orbsForNextLevel = 5;
        this.nextUpgradeScore = 5;
    }
    
    init(data) {
        this.onUpdate = data.onUpdate;
        this.onTogglePause = data.onTogglePause;
        this.onShowUpgrade = data.onShowUpgrade;
    }

    // 1. PRELOAD: Load all game assets
    preload() {
        this.load.image('player', 'https://labs.phaser.io/assets/sprites/ship.png');
        this.load.image('blue_particle', 'https://labs.phaser.io/assets/particles/blue.png');
        this.load.image('exp_orb', 'https://labs.phaser.io/assets/sprites/star.png');
        this.load.image('space_bg', 'https://labs.phaser.io/assets/skies/space3.png');
        this.load.image('enemy', 'https://labs.phaser.io/assets/sprites/space-baddie.png');
        this.load.image('bullet', 'assets/laser.png');
        
        this.load.image('elite_enemy', 'https://labs.phaser.io/assets/sprites/ship.png'); 
    }

    // 2. CREATE: Setup the game world
    create() {
        this.score = 0;
        this.playerLevel = 1;
        this.playerHealth = PLAYER_HEALTH;
        this.playerMaxHealth = PLAYER_HEALTH;
        this.playerDamage = 1; 
        
        this.playerAttacksPerSecond = 1000 / AUTO_FIRE_RATE_MS;
        this.playerAttackSpeedDelay = AUTO_FIRE_RATE_MS;
        
        this.orbsForNextLevel = 5;
        this.nextUpgradeScore = 5;
        
        this.sendFullStats();
        
        this.onUpdate({ type: 'score', value: this.score });
        this.isGameOver = false;

        this.physics.world.setBounds(0, 0, 1600, 1200);

        this.background = this.add.tileSprite(800, 600, 1600, 1200, 'space_bg');
        this.background.setScrollFactor(0.5, 0.5);
        this.background.setDepth(-1);

        this.player = this.physics.add.image(800, 600, 'player')
            .setCollideWorldBounds(true)
            .setScale(0.5);

        this.player.flashTween = null;
        this.player.invulnTimer = null;


        this.cameras.main.setBounds(0, 0, 1600, 1200);
        this.cameras.main.startFollow(this.player, true, 0.05, 0.05);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = {
            up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
        };
        
        this.input.keyboard.on('keydown-P', this.onTogglePause, this);
        this.input.keyboard.on('keydown-ESC', this.onTogglePause, this);
        
        // --- JOYSTICK: Re-added creation logic ---
        if (this.sys.game.device.input.touch) {
            const joyStickX = this.cameras.main.width / 2;
            const joyStickY = this.cameras.main.height * 0.85; // 85% down

            this.joystick = this.joystickPlugin.add(this, {
                x: joyStickX,
                y: joyStickY,
                radius: 60, 
                base: this.add.circle(0, 0, 60, 0x888888, 0.3), 
                thumb: this.add.circle(0, 0, 30, 0xcccccc, 0.5), 
                dir: '8dir', 
                forceMin: 16,
            }).setScrollFactor(0); 

            this.joyStickCursorKeys = this.joystick.createCursorKeys();
        }
        // --- End Joystick Creation ---


        // 1. Player Bullets Group
        this.bullets = this.physics.add.group({
            classType: Projectile, 
            maxSize: 30,
            runChildUpdate: true, 
            key: 'bullet', 
            createCallback: (gameObject) => {
                gameObject.body.setAllowGravity(false);
            }
        });
        
        this.enemies = this.physics.add.group({
            classType: Enemy, 
            runChildUpdate: true 
        });

        this.thrusterEmitter = this.add.particles(0, 0, 'blue_particle', {
            speed: 50,
            angle: { min: -25, max: 25 }, 
            scale: { start: 0.4, end: 0 },
            alpha: { start: 0.8, end: 0 },
            lifespan: 200,
            blendMode: 'ADD',
            active: false
        });
        
        this.pauseText = this.add.text(
            this.cameras.main.width / 2, 
            this.cameras.main.height / 2, 
            'PAUSED', 
            { fontSize: '64px', fill: '#FFFFFF' }
        )
            .setScrollFactor(0)
            .setOrigin(0.5)
            .setDepth(200)
            .setVisible(false);

        this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, null, this);
        this.physics.add.overlap(this.player, this.enemies, this.hitPlayerByEnemy, null, this);
        
        this.expOrbs = this.physics.add.group();
        this.physics.add.overlap(this.player, this.expOrbs, this.collectOrb, null, this);

        this.autoFireEvent = this.time.addEvent({
            delay: this.playerAttackSpeedDelay,
            callback: this.fireBullet,
            callbackScope: this,
            loop: true
        });

        this.time.addEvent({
            delay: ENEMY_SPAWN_RATE_MS,
            callback: this.spawnWave,
            callbackScope: this,
            loop: true
        });

        console.log("Phaser Game Created and Initialized. Auto-fire enabled.");
    }
    
    sendFullStats() {
        this.onUpdate({
            type: 'fullStats',
            level: this.playerLevel,
            health: this.playerHealth,
            maxHealth: this.playerMaxHealth,
            damage: this.playerDamage,
            attacksPerSecond: this.playerAttacksPerSecond 
        });
    }

    // 3. UPDATE: The main game loop
    update(time) {
        if (this.isGameOver) return;

        this.handlePlayerMovement();

        if (!this.physics.world.isPaused) {
            this.enemies.getChildren().forEach(enemy => {
                if (enemy.active) {
                    this.trackPlayer(enemy);
                }
            });
            
            this.expOrbs.getChildren().forEach( orb => {
                if (orb.active) {
                    this.physics.moveToObject(orb, this.player, 350);
                }
            });
            
            if (this.player.body.velocity.length() > 0) {
                const moveAngleRad = Phaser.Math.Angle.Between(0, 0, this.player.body.velocity.x, this.player.body.velocity.y);
                const thrustAngleRad = moveAngleRad + Math.PI;
                const thrustAngleDeg = Phaser.Math.RadToDeg(thrustAngleRad);

                const emitterX = this.player.x + Math.cos(thrustAngleRad) * 15;
                const emitterY = this.player.y + Math.sin(thrustAngleRad) * 15;

                this.thrusterEmitter.setPosition(emitterX, emitterY);
                this.thrusterEmitter.setAngle(thrustAngleDeg);

                if (!this.thrusterEmitter.emitting) {
                    this.thrusterEmitter.start();
                }
            } else {
                if (this.thrusterEmitter.emitting) {
                    this.thrusterEmitter.stop();
                }
            }
            
        } else {
             if (this.thrusterEmitter.emitting) {
                this.thrusterEmitter.stop();
            }
        }
    }
    
    handlePause(shouldPause) {
        if (this.isGameOver || this.physics.world.isPaused === shouldPause) {
            return; 
        }
        
        this.physics.world.isPaused = shouldPause;
        this.autoFireEvent.paused = shouldPause;

        this.enemies.getChildren().forEach(enemy => {
            if (enemy.healthBar) {
                enemy.healthBar.setVisible(!shouldPause);
            }
        });

        console.log(`[Phaser] handlePause: Game Paused = ${shouldPause}`);
    }

    applyUpgrade(type) {
        console.log(`[Phaser] applyUpgrade: Received upgrade type '${type}'`);
        console.log("[Phaser] Stats BEFORE:", { dmg: this.playerDamage, spd: this.playerAttacksPerSecond, hp: this.playerMaxHealth });

        switch (type) {
            case 'damage':
                this.playerDamage += 0.5; 
                break;
            case 'speed':
                this.playerAttacksPerSecond += 0.2; 
                this.playerAttackSpeedDelay = 1000 / this.playerAttacksPerSecond;
                this.autoFireEvent.delay = this.playerAttackSpeedDelay;
                break;
            case 'health':
                this.playerMaxHealth += 1; 
                this.playerHealth = this.playerMaxHealth; // Full heal
                break;
            default:
                break;
        }

        console.log("[Phaser] Stats AFTER:", { dmg: this.playerDamage, spd: this.playerAttacksPerSecond, hp: this.playerMaxHealth });


        this.removeInvulnerability(this.player);
        
        console.log("[Phaser] Player invulnerability removed. Sending full stats to React...");
        this.sendFullStats(); // Send all updated stats
    }

    // --- FIX: Re-added full movement logic ---
    handlePlayerMovement() {
        this.player.setVelocity(0);
        let velX = 0;
        let velY = 0;

        // --- 1. Joystick Controls (Mobile) ---
        if (this.joystick && this.joystick.force > 0) {
            if (this.joyStickCursorKeys.left.isDown) {
                velX = -PLAYER_SPEED;
            } else if (this.joyStickCursorKeys.right.isDown) {
                velX = PLAYER_SPEED;
            }

            if (this.joyStickCursorKeys.up.isDown) {
                velY = -PLAYER_SPEED;
            } else if (this.joyStickCursorKeys.down.isDown) {
                velY = PLAYER_SPEED;
            }
        }
        // --- 2. Mouse Controls (PC) ---
        else if (this.input.activePointer.isDown && !this.sys.game.device.input.touch) {
            const touchX = this.input.activePointer.worldX;
            const touchY = this.input.activePointer.worldY;

            const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, touchX, touchY);
            velX = Math.cos(angle) * PLAYER_SPEED;
            velY = Math.sin(angle) * PLAYER_SPEED;
            
        } 
        // --- 3. Keyboard Controls (PC) ---
        else { 
            if (this.cursors.left.isDown || this.wasd.left.isDown) {
                velX = -PLAYER_SPEED;
            } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
                velX = PLAYER_SPEED;
            }

            if (this.cursors.up.isDown || this.wasd.up.isDown) {
                velY = -PLAYER_SPEED;
            } else if (this.cursors.down.isDown || this.wasd.down.isDown) {
                velY = PLAYER_SPEED;
            }
        }

        // --- Apply final velocity ---
        this.player.setVelocity(velX, velY);
        
        // Normalize diagonal speed (for joystick and keyboard)
        if (velX !== 0 && velY !== 0 && !(this.input.activePointer.isDown && !this.sys.game.device.input.touch)) {
            this.player.body.velocity.normalize().scale(PLAYER_SPEED);
        }
        
        // --- Rotation ---
        if (velX !== 0 || velY !== 0) {
            this.player.setRotation(Phaser.Math.Angle.Between(0, 0, velX, velY) + Math.PI / 2);
        }
    }


    fireBullet() {
        if (this.physics.world.isPaused || this.isGameOver) return;
        const targetEnemy = this.findNearestEnemy();
        if (!targetEnemy) {
            return;
        }
        const bullet = this.bullets.get(0, 0); 
        if (bullet) {
            const angle = Phaser.Math.Angle.Between(
                this.player.x, this.player.y,
                targetEnemy.x, targetEnemy.y
            );
            bullet.fire(this.player.x, this.player.y, angle);
        }
    }

    findNearestEnemy() {
        const cam = this.cameras.main; 
        const activeEnemies = this.enemies.getChildren().filter(e => e.active);
        if (activeEnemies.length === 0) return null;

        let nearestEnemy = null;
        let minDistance = Infinity;

        activeEnemies.forEach(enemy => {
            if (cam.worldView.contains(enemy.x, enemy.y)) {
                const distance = Phaser.Math.Distance.Between(
                    this.player.x, this.player.y,
                    enemy.x, enemy.y
                );
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestEnemy = enemy;
                }
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
            
            let health = ENEMY_BASE_HEALTH;
            let speed = ENEMY_CHASE_SPEED;
            
            if (this.playerLevel >= 25) {
                const levelBonus = this.playerLevel - 25;
                health += Math.floor(levelBonus / 2); 
                speed += levelBonus * 0.5; 
            }
            
            enemy.spawn(
                x, y,
                'enemy',
                1.5,
                health,
                speed,
                ENEMY_DAMAGE_BODY,
                false
            );
        }
    }
    
    spawnElite(x, y) {
        const elite = this.enemies.get();
        if (elite) {
            
            let health = ELITE_ENEMY_HEALTH;
            let speed = ELITE_ENEMY_SPEED;
            
            if (this.playerLevel >= 25) {
                const levelBonus = this.playerLevel - 25;
                health += levelBonus * 2; 
                speed += levelBonus * 0.25; 
            }
            
            elite.spawn(
                x, y,
                'elite_enemy',
                0.75, 
                health,
                speed,
                ELITE_ENEMY_DAMAGE,
                true
            );
        }
    }

    spawnWave() {
        if (this.isGameOver) return;
        
        const mapWidth = 1600;
        const mapHeight = 1200;
        const playerX = this.player.x;
        const playerY = this.player.y;
        const spawnDistance = 500;
        
        const waveSize = (this.playerLevel >= 25) ? 7 : 5;
        
        for (let i = 0; i < waveSize; i++) {
            let x, y;
            do {
                x = Phaser.Math.Between(0, mapWidth);
                y = Phaser.Math.Between(0, mapWidth);
            } while (Phaser.Math.Distance.Between(x, y, playerX, playerY) < spawnDistance);

            let eliteChance = 0.2; // 20%
            if (this.playerLevel > 25) {
                eliteChance = 0.4; // 40%
            }

            if (this.playerLevel > 5 && Math.random() < eliteChance) {
                this.spawnElite(x, y);
            } else {
                this.spawnRegularEnemy(x, y);
            }
        }
    }
    
    updateHealth(damage) {
        if (this.isGameOver) return;

        this.playerHealth -= damage;
        this.playerHealth = Math.max(0, this.playerHealth);
        
        // --- FIX: Send max health ---
        this.onUpdate({ type: 'health', value: this.playerHealth, max: this.playerMaxHealth }); 

        if (this.playerHealth <= 0) {
            this.handleGameOver();
        } else {
            this.cameras.main.flash(100, 255, 0, 0);
            this.setInvulnerable(this.player, 1000); 
        }
    }
    
    handleGameOver() {
        this.isGameOver = true;
        this.player.setActive(false).setVisible(false);
        this.physics.pause();
        this.onUpdate({ type: 'gameOver', value: true }); 
        
        if (this.pauseText) this.pauseText.setVisible(false);
        this.thrusterEmitter.stop(); 
        
        this.enemies.getChildren().forEach(enemy => {
            if (enemy.healthBar) {
                enemy.healthBar.clear();
            }
        });
    }
    
    setInvulnerable(player, duration = 1000) {
        player.invulnerable = true;
        
        if (player.flashTween) {
            player.flashTween.stop();
        }

        player.flashTween = this.tweens.add({
            targets: player,
            alpha: 0.3,
            ease: 'Power1',
            duration: 100,
            yoyo: true,
            repeat: -1, 
        });
        
        if (player.invulnTimer) {
            player.invulnTimer.remove();
        }

        if (duration > 0) { 
            player.invulnTimer = this.time.delayedCall(duration, () => {
                this.removeInvulnerability(player);
            });
        }
    }

    removeInvulnerability(player) {
        if (player.flashTween) {
            player.flashTween.stop();
            player.flashTween = null;
        }
        if (player.invulnTimer) {
            player.invulnTimer.remove();
            player.invulnTimer = null;
        }
        player.alpha = 1;
        player.invulnerable = false;
    }

    hitPlayerByEnemy(player, enemy) {
        if (player.active && (player.invulnerable === undefined || !player.invulnerable)) {
            const damage = enemy.getData('damage');
            this.updateHealth(damage);
        }
    }

    hitEnemy(bullet, enemy) {
        if (bullet.disableProjectile) {
            bullet.disableProjectile(); 
        } else {
            bullet.disableBody(true, true);
        }
        
        if (!enemy.active) return; 

        const isDead = enemy.takeDamage(this.playerDamage);

        if (isDead) {
            const orb = this.expOrbs.get(enemy.x, enemy.y, 'exp_orb');
            if (orb) {
                orb.setActive(true).setVisible(true).setScale(0.3).setTint(0xFFFF00).setAlpha(1);
                orb.body.setCircle(8); 
                orb.body.enable = true;
                orb.body.moves = true;
                
                this.time.delayedCall(5000, () => {
                    if(orb.active) orb.disableBody(true, true);
                });
            }
        }
    }
    
    enterUpgradeState() {
        this.playerLevel++;
        this.orbsForNextLevel++; // This is where the cost for the *next* level increases
        
        this.onShowUpgrade(); 
        this.setInvulnerable(this.player, -1); 
        
        console.log(`[Phaser] enterUpgradeState: Player is Level ${this.playerLevel}. Invulnerable. Opening UI.`);
        console.log(`[Phaser] Next level will require ${this.orbsForNextLevel} orbs.`);
    }

    collectOrb(player, orb) {
        orb.disableBody(true, true); 
        
        this.score += 1;
        this.onUpdate({ type: 'score', value: this.score });
        
        if (this.score >= this.nextUpgradeScore) {
            // --- FIX: This is the correct scaling logic ---
            // 1. Enter upgrade state, which increments orbsForNextLevel (e.g., to 6)
            this.enterUpgradeState(); 
            // 2. Set the *new* score target by adding the *new* amount
            // (e.g., next target = 5 + 6 = 11)
            this.nextUpgradeScore += this.orbsForNextLevel; 
        }
    }
}

// --- REACT COMPONENT (Wrapper) ---

const BulletHellGame = React.forwardRef(({ onUpdate, isPaused, onTogglePause, onShowUpgrade }, ref) => {
    const gameRef = useRef(null); 

    useImperativeHandle(ref, () => ({
        get game() {
            return gameRef.current;
        }
    }), []); 

    useEffect(() => {
        const config = {
            type: Phaser.AUTO,
            width: window.innerWidth,
            height: window.innerHeight,
            scale: {
                mode: Phaser.Scale.RESIZE,
                parent: 'game-container',
            },
            pixelArt: true,
            physics: {
                default: 'arcade',
                arcade: {
                    gravity: { y: 0 },
                    debug: false 
                }
            },
            // --- FIX: Re-added the plugin config ---
            plugins: {
                scene: [{
                    key: 'rexVirtualJoystick',
                    plugin: VirtualJoystickPlugin,
                    start: true,
                    mapping: 'joystickPlugin' // We'll access it via this.joystickPlugin
                }]
            },
            // --- End Plugin Config ---
            scene: [MainScene]
        };

        const game = new Phaser.Game(config);
        gameRef.current = game;
        
        game.scene.start('MainScene', { 
            onUpdate: onUpdate || (() => {}),
            onTogglePause: onTogglePause || (() => {}),
            onShowUpgrade: onShowUpgrade || (() => {})
        });

        return () => {
            game.destroy(true);
            gameRef.current = null;
        };
      // --- BUG FIX: Removed 'onTogglePause' from dependency array ---
      // This stops the game from re-creating itself when you pause/level up
    }, [onUpdate, onShowUpgrade]); 

    useEffect(() => {
        if (gameRef.current && gameRef.current.scene) {
            const scene = gameRef.current.scene.getScene('MainScene');
            if (scene && scene.handlePause) {
                scene.handlePause(isPaused); 
            }
        }
    }, [isPaused]); 

    return <></>; 
});

export default BulletHellGame;