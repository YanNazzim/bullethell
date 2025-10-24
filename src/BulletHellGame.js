import React, { useEffect, useRef, useImperativeHandle } from 'react';
import Phaser from 'phaser';
import VirtualJoystickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';

// --- CONFIGURATION CONSTANTS ---
const PLAYER_BASE_SPEED = 200; 
const PLAYER_HEALTH = 10;

const BULLET_SPEED = 600; // MODIFIED: Increased bullet speed from 450 to 600

const ENEMY_SPAWN_RATE_MS = 2500;
const ENEMY_CHASE_SPEED = 60;
const ENEMY_BASE_HEALTH = 3; 
const ENEMY_DAMAGE_BODY = 1;

const ELITE_ENEMY_HEALTH = 25;
const ELITE_ENEMY_SPEED = 30;
const ELITE_ENEMY_DAMAGE = 3;

// --- UPDATED BOOMERANG ENEMY CONSTANTS ---
const BOOMERANG_ENEMY_HEALTH = 12; // Chunky health
const BOOMERANG_ENEMY_DAMAGE = 2; 
const BOOMERANG_ENEMY_CHASE_SPEED = 120; // NEW: Fast chase speed

// --- NEW BOSS CONSTANTS ---
const BOSS_LEVEL_INTERVAL = 30; // Boss spawns every 30 player levels
const BOSS_BASE_HEALTH = 150; 
const BOSS_DAMAGE = 5;
const BOSS_SHOOT_RATE_MS = 1500; // Boss fires every 1.5 seconds
const BOSS_BULLET_SPEED = 400; // Slower bullet than player bullets
const BOSS_XP_REWARD = 100; // Large XP reward

const MAX_ENEMIES = 150;
const MAX_BOOMERANG_ENEMIES = 3; 
const MAP_WIDTH = 5000; 
const MAP_HEIGHT = 5000;

// --- UPDATED: STAT UPGRADE DATABASE ---
const STAT_UPGRADE_DB = {
    'max_health': {
        name: 'Increase Max Health',
        description: 'Increases maximum health by 1.',
        image: 'assets/icon_max_health.png',
        apply: (scene) => {
            scene.playerMaxHealth += 1;
        }
    },
        'restore_health': {
        name: 'Restore to full health Health',
        description: 'Fills Health Bar.',
        image: 'assets/icon_restore_health.png',
        apply: (scene) => {
            scene.playerHealth = scene.playerMaxHealth; // Full heal
        }
    },
    'moveSpeed': {
        name: 'Movement Speed',
        description: 'Increases player movement speed by 10.',
        image: 'assets/icon_move_speed.png',
        apply: (scene) => {
            scene.playerSpeed += 10;
        }
    },
    // --- NEW: Player Damage ---
    'playerDamage': {
        name: 'Base Damage',
        description: 'Increases all damage dealt by 1.',
        image: 'assets/base_dmg.png', // Re-using image, recommend 'icon_damage.png'
        apply: (scene) => {
            scene.playerBaseDamage += 1;
        }
    },
    // --- NEW: Crit Chance ---
    'critChance': {
        name: 'Crit Chance',
        description: 'Gain 5% chance to deal critical damage.',
        image: 'assets/icon_crit_chance.png', // Re-using, recommend 'icon_crit.png'
        maxLevel: 20, // 100% cap
        apply: (scene) => {
            scene.playerCritChance = Math.min(1.0, scene.playerCritChance + 0.05);
        }
    },
    // --- NEW: Crit Damage ---
    'critDamage': {
        name: 'Crit Damage',
        description: 'Increases critical damage multiplier by 50%.',
        image: 'assets/icon_crit_dmg.png', // Re-using, recommend 'icon_crit_dmg.png'
        apply: (scene) => {
            scene.playerCritDamage += 0.5;
        }
    },
    // --- NEW: Bullet Bounce ---
    'bulletBounce': {
        name: 'Bullet Bounce',
        description: 'Your bullets bounce to 1 additional enemy.',
        image: 'assets/icon_bullet_bounce.png', // Re-using, recommend 'icon_bounce.png'
        apply: (scene) => {
            scene.bulletBounces += 1;
        }
    }
};

// --- WEAPON DATABASE ---
const WEAPON_DB = {
    'autoBullet': {
        name: 'Auto-Bullet',
        description: 'Fires projectiles at the nearest enemy.',
        image: 'assets/laser.png',
        maxLevel: 10,
        upgrade: (scene, weaponState) => {
            if (weaponState.level % 2 === 0) {
                weaponState.atkSpeed += 0.2;
                scene.autoFireEvent.delay = 1000 / weaponState.atkSpeed;
            } else {
                weaponState.damage += 0.5;
            }
        },
        sync: (scene, weaponState) => {
            scene.playerWeaponDamage = weaponState.damage; // Link scene damage to this weapon
        }
    },
    'electricBolt': {
        name: 'Electric Bolt',
        description: 'Zaps nearby enemies. Upgrades reduce cooldown.',
        image: 'assets/icon_bolt.png',
        maxLevel: 8,
        acquire: (scene, weaponState) => {
            weaponState.delay = 1000; 
            scene.electricBoltEvent = scene.time.addEvent({
                delay: weaponState.delay,
                callback: scene.zapEnemies,
                callbackScope: scene,
                loop: true,
                paused: scene.physics.world.isPaused 
            });
        },
        upgrade: (scene, weaponState) => {
            const reduction = 50; 
            const minDelay = 200; 
            weaponState.delay = Math.max(minDelay, weaponState.delay - reduction);
            if (scene.electricBoltEvent) {
                scene.electricBoltEvent.delay = weaponState.delay;
            }
        }
    },
    'shield': {
        name: "Spinning Orb's",
        description: 'Orbs circle the player, damaging enemies. Upgrades add orbs/damage.',
        image: 'assets/icon_shield.png',
        maxLevel: 6,
        acquire: (scene, weaponState) => {
            weaponState.damage = 3;
            weaponState.count = 1; 
            weaponState.radius = 215; 
            weaponState.speed = 0.02; 
            weaponState.angle = 0; 
            
            // FIX 1: Change 'shield ' to 'shield' to match preload key
            scene.shieldOrbs = scene.physics.add.group({
                key: 'shield', 
                repeat: weaponState.count - 1,
                setXY: { x: scene.player.x, y: scene.player.y }
            });
            
            scene.shieldOrbs.getChildren().forEach(orb => {
                orb.setScale(0.1).setTint(0x00aaff); 
                orb.body.setCircle(250);
                orb.body.setAllowGravity(false);
            });
            
            scene.shieldCollider = scene.physics.add.overlap(scene.shieldOrbs, scene.enemies, scene.hitEnemyByShield, null, scene);
        },
        upgrade: (scene, weaponState) => {
            if (weaponState.level === 2 || weaponState.level === 4) {
                weaponState.count++;
                // FIX 2: Change 'exp_orb' to 'shield' to use the correct sprite
                const newOrb = scene.shieldOrbs.create(scene.player.x, scene.player.y, 'shield');
                newOrb.setScale(0.1).setTint(0x00aaff);
                newOrb.body.setCircle(50);
                newOrb.body.setAllowGravity(false);
            } else {
                weaponState.damage += 2;
            }
            weaponState.speed += 0.005;
        },
        update: (scene, weaponState) => {
            weaponState.angle += weaponState.speed;
            const circle = new Phaser.Geom.Circle(scene.player.x, scene.player.y, weaponState.radius); // Store circle
            Phaser.Actions.PlaceOnCircle(
                scene.shieldOrbs.getChildren(),
                circle,
                weaponState.angle
            );
            
            // --- FIX: Manually sync physics body position with sprite position ---
            scene.shieldOrbs.getChildren().forEach(orb => {
                // Manually reset the body position to match the sprite position set by PlaceOnCircle
                orb.body.reset(orb.x, orb.y);
                // Set velocity to zero to prevent the body from moving on its own
                orb.body.setVelocity(0); 
            });
            // --- END FIX ---
        }
    }
};


// --- PHASER SCENES ---

// --- UPDATED: Projectile Class (Can now be used by Boss) ---
class Projectile extends Phaser.Physics.Arcade.Image {
    constructor(scene, x, y, texture) {
        super(scene, x, y, texture);
        
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.body.setAllowGravity(false); 
        this.setData('vx', 0);
        this.setData('vy', 0);
        
        this.despawnTimer = null;
        this.bouncesLeft = 0; 
        this.enemiesHit = new Set(); 
        this.setData('isBossBullet', false); // NEW: Identify owner
        this.setData('damage', 0); // NEW: Store damage for boss bullet
    }

    fire(x, y, angle, isBossBullet = false, damage = 0) {
        if (this.despawnTimer) {
            this.despawnTimer.remove(false);
        }
        
        this.body.enable = true;
        this.body.reset(x, y); 
        this.setRotation(angle); 
        
        // --- Bullet properties based on owner ---
        const speed = isBossBullet ? BOSS_BULLET_SPEED : BULLET_SPEED;
        const scale = isBossBullet ? 0.1 : 0.04; // Boss bullets are larger
        const tint = isBossBullet ? 0xcc00cc : 0xffffff; // Purple tint for boss bullet
        
        this.setTexture(isBossBullet ? 'bullet' : 'bullet'); // Re-using 'bullet' sprite
        this.setActive(true).setVisible(true).setScale(scale).setTint(tint);
        this.body.setCircle(500);

        this.setData('isBossBullet', isBossBullet);
        this.setData('damage', isBossBullet ? damage : 0);
        this.bouncesLeft = isBossBullet ? 0 : this.scene.bulletBounces; // Player bounces only
        this.enemiesHit.clear();

        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        this.setData('vx', vx);
        this.setData('vy', vy);
        
        this.body.setVelocity(vx, vy);

        this.despawnTimer = this.scene.time.delayedCall(4000, this.disableProjectile, [], this); 
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

// --- UPDATED: Enemy Class (Fixed Health Bar Position) ---
class Enemy extends Phaser.Physics.Arcade.Image {
    constructor(scene, x, y, texture) {
        super(scene, x, y, texture);
        
        this.healthBar = scene.add.graphics();
        this.armorBar = scene.add.graphics(); // NEW: Armor Bar Graphics
        this.healthBar.setDepth(8); 
        this.armorBar.setDepth(8); 
    }

    spawn(x, y, key, scale, health, speed, damage, isElite, isBoss = false) { // NEW: isBoss flag
        this.scene.add.existing(this);
        this.scene.physics.add.existing(this);
        
        this.setTexture(key);
        this.body.reset(x, y);
        this.body.enable = true;
        
        this.setActive(true).setVisible(true).setScale(scale).setRotation(0);
        
        this.setData('health', health);
        this.setData('maxHealth', health);
        this.setData('speed', speed);
        this.setData('damage', damage);
        this.setData('isElite', isElite);
        this.setData('isBoss', isBoss); // NEW: Store boss state
        
        // --- NEW: Armor for Elite Enemies (0.5 max health) ---
        const maxArmor = isElite ? Math.floor(health * 0.5) : 0;
        this.setData('armor', maxArmor);
        this.setData('maxArmor', maxArmor);
        
        // --- NEW: Boomerang properties ---
        this.setData('isBoomerang', key === 'boomerang_enemy');
        this.setData('angle', 0);
        
        // --- UPDATED: Scaling and Tinting ---
        if (isBoss) {
            this.setTint(0xcc00cc); // Purple Boss tint
            this.body.setCircle(400); // Larger collision circle
            this.body.setOffset(400, 400);
            this.setImmovable(true); // Boss does not move or get pushed
            
        } else if (isElite) {
            this.setTint(0xff0000);
            this.body.setCircle(250); 
            this.body.setOffset(250, 250); 
            
        } else if (this.data.get('isBoomerang')) {
            this.setTint(0xffaa00); // Yellow/Orange tint for easy spotting
            this.body.setCircle(250);
            this.body.setOffset(250, 250); 
        } else {
            this.body.setCircle(250); 
            this.body.setOffset(250,250); 
            this.clearTint();
        }
        
        this.drawHealthBar();
        this.healthBar.setVisible(true);
        this.armorBar.setVisible(isElite || isBoss); // Boss can also have armor visibility
    }
    
    // --- UPDATED: takeDamage now handles armor reduction ---
    takeDamage(amount, isCrit = false) {
        if (!this.active) return false;
        
        let remainingDamage = amount;
        let newHealth = this.getData('health');
        let newArmor = this.getData('armor');
        
        // 1. Damage Armor first (if elite/boss and has armor)
        if ((this.getData('isElite') || this.getData('isBoss')) && newArmor > 0) {
            const damageToArmor = Math.min(remainingDamage, newArmor);
            newArmor -= damageToArmor;
            remainingDamage -= damageToArmor;
            this.setData('armor', newArmor);
        }

        // 2. Damage Health
        if (remainingDamage > 0) {
            newHealth = newHealth - remainingDamage;
            this.setData('health', newHealth);
        }
        
        if (newHealth <= 0) {
            this.kill();
            return true; // Is dead
        }
        
        // --- NEW: Crit flash color ---
        this.setTint(isCrit ? 0xffaa00 : 0xffffff); // Orange for crit, white for normal
        
        this.scene.time.delayedCall(50, () => {
            if (this.active) {
                if (this.getData('isBoss')) {
                    this.setTint(0xcc00cc);
                } else if (this.getData('isElite')) {
                    this.setTint(0xff0000); 
                } else if (this.data.get('isBoomerang')) {
                    this.setTint(0xffaa00);
                } else {
                    this.clearTint(); 
                }
            }
        });
        
        this.drawHealthBar(); // Redraw both bars
        
        return false; // Is not dead
    }

    // --- UPDATED: Draw Health and Armor Bars (Now uses local offsets) ---
    drawHealthBar() {
        this.healthBar.clear();
        this.armorBar.clear(); 
        if (!this.active) return;
        
        const pHealth = this.getData('health') / this.getData('maxHealth');
        const pArmor = this.getData('maxArmor') > 0 ? this.getData('armor') / this.getData('maxArmor') : 0;
        
        const w = (this.width * this.scaleX);
        const h = 8; // MODIFIED: Increased height from 5 to 8
        
        // --- FIX: Calculate offsets relative to enemy center (0, 0) of the graphics object ---
        const offsetX = -w / 2;
        // The top edge of the bar, relative to the enemy's center (this.y).
        const offsetYHealth = -(this.height * this.scaleY) / 2 - (h * 1); 
        const offsetYArmor = offsetYHealth - h - 2; // Above the health bar

        // --- Draw Health Bar (using offsets) ---
        this.healthBar.fillStyle(0x333333);
        this.healthBar.fillRect(offsetX, offsetYHealth, w, h);
        this.healthBar.fillStyle(pHealth < 0.3 ? 0xff0000 : 0x00ff00); 
        this.healthBar.fillRect(offsetX, offsetYHealth, w * pHealth, h);
        
        // --- Draw Armor Bar (Elite/Boss only, using offsets) ---
        if (this.getData('isElite') || this.getData('isBoss')) {
             this.armorBar.fillStyle(0x333333); // Background
             this.armorBar.fillRect(offsetX, offsetYArmor, w, h);
             
             // Blue for armor
             this.armorBar.fillStyle(0x61dafb); 
             this.armorBar.fillRect(offsetX, offsetYArmor, w * pArmor, h);
             this.armorBar.setVisible(true);
             
        } else {
            this.armorBar.setVisible(false);
        }
    }
    
    // --- NEW METHOD: Update to reposition the graphics objects every frame ---
    update() {
        if (!this.active) return;

        // Reposition the graphics objects to the enemy's current position (Center of the enemy)
        // This makes the drawing coordinates inside drawHealthBar() relative to this new position.
        this.healthBar.setPosition(this.x, this.y);
        this.armorBar.setPosition(this.x, this.y);
        
        // --- NEW: Boss rotation for visual effect ---
        if (this.data.get('isBoss')) {
             this.setRotation(this.rotation + 0.005);
        }
    }

    // --- UPDATED: Kill function to clear all bars and update Boomerang count / BOSS state ---
    kill() {
        this.healthBar.clear(); 
        this.armorBar.clear(); 
        this.healthBar.setVisible(false); 
        this.armorBar.setVisible(false); 
        
        if (this.data.get('isBoomerang')) {
            this.scene.boomerangEnemiesCount = Math.max(0, this.scene.boomerangEnemiesCount - 1);
        }
        
        if (this.data.get('isBoss')) {
            // Drop large XP reward on boss kill
            for (let i = 0; i < BOSS_XP_REWARD; i++) {
                const orb = this.scene.expOrbs.get(this.x + Phaser.Math.Between(-100, 100), this.y + Phaser.Math.Between(-100, 100), 'exp_orb');
                if (orb) {
                    orb.setActive(true).setVisible(true).setScale(0.3).setTint(0xFFFF00).setAlpha(1);
                    orb.body.setCircle(8); 
                    orb.body.enable = true;
                    orb.body.moves = true;
                }
            }
            
            this.scene.isBossActive = false; // Reset boss flag
            if (this.scene.bossShootEvent) {
                this.scene.bossShootEvent.remove(); // Stop boss attack
                this.scene.bossShootEvent = null;
            }
            this.scene.boss = null;
        }
        
        this.disableBody(true, true); 
    }
}


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
        
        this.joystick = null;
        this.joyStickCursorKeys = null;
        this.joystickPlugin = null; 
        
        this.onShowUpgrade = () => {}; 
        this.onGameOverSubmit = () => {}; 
        
        // --- UPDATED: Player Stats (Managed by Scene) ---
        this.playerHealth = PLAYER_HEALTH;
        this.playerMaxHealth = PLAYER_HEALTH;
        this.playerWeaponDamage = 0; 
        this.playerBaseDamage = 0; 
        this.playerSpeed = PLAYER_BASE_SPEED; 
        this.playerLevel = 1;
        this.playerCritChance = 0; 
        this.playerCritDamage = 1.5; 
        this.bulletBounces = 0; 
        
        this.playerWeaponInventory = new Map();
        
        this.electricBoltEvent = null; 
        this.shieldOrbs = null;
        this.shieldCollider = null;

        this.orbsForNextLevel = 5;
        this.nextUpgradeScore = 5;
        
        this.boomerangEnemiesCount = 0; 
        
        // --- NEW BOSS STATE ---
        this.isBossActive = false;
        this.boss = null;
        this.bossShootEvent = null; 
        this.bossDirection = 0; // Angle (in degrees) for the waypoint arrow
        // --- END NEW BOSS STATE ---
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
        this.load.image('exp_orb', 'https://labs.phaser.io/assets/sprites/star.png');
        this.load.image('space_bg', 'assets/space_bg.png');
        
        this.load.image('enemy', 'assets/smaller_enemy.png');
        this.load.image('shield', 'assets/icon_shield.png');
        this.load.image('bullet', 'assets/laser.png');
        this.load.image('elite_enemy', 'assets/elite_enemy.png'); 
        this.load.image('boomerang_enemy', 'assets/boomerang_enemy.png');
        this.load.image('boss', 'assets/purple_boss.png'); // NEW: Boss image
    }

    create() {
        this.score = 0;
        this.playerLevel = 1;
        this.playerHealth = PLAYER_HEALTH;
        this.playerMaxHealth = PLAYER_HEALTH;
        this.playerSpeed = PLAYER_BASE_SPEED;
        
        // --- NEW: Reset all stats ---
        this.playerBaseDamage = 0;
        this.playerCritChance = 0;
        this.playerCritDamage = 1.5;
        this.bulletBounces = 0;
        this.boomerangEnemiesCount = 0; 
        this.isBossActive = false; // NEW: Reset Boss
        this.boss = null;
        this.bossShootEvent = null;

        this.orbsForNextLevel = 5;
        this.nextUpgradeScore = 5;
        
        this.playerWeaponInventory.clear();
        const defaultWeaponState = { level: 1, damage: 2, atkSpeed: 2 }; 
        this.playerWeaponInventory.set('autoBullet', defaultWeaponState);
        WEAPON_DB.autoBullet.sync(this, defaultWeaponState);
        
        this.isGameOver = false;

        this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

        this.background = this.add.image(MAP_WIDTH / 2, MAP_HEIGHT / 2, 'space_bg');
        this.background.displayWidth = MAP_WIDTH;
        this.background.displayHeight = MAP_HEIGHT;
        this.background.setScrollFactor(0.5, 0.5);
        this.background.setDepth(-1);

        this.player = this.physics.add.image(MAP_WIDTH / 2, MAP_HEIGHT / 2, 'player')
            .setCollideWorldBounds(true)
            .setScale(.2);
        
        this.player.body.setCircle(250); 
        this.player.body.setOffset(250, 250); 

        this.player.flashTween = null;
        this.player.invulnTimer = null;

        this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
        this.cameras.main.startFollow(this.player, true, 0.05, 0.05);
        this.cameras.main.setZoom(0.55);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = {
            up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
        };
        
        this.input.keyboard.on('keydown-P', this.onTogglePause, this);
        this.input.keyboard.on('keydown-ESC', this.onTogglePause, this);
        
        if (this.sys.game.device.input.touch) {
            this.input.on('pointerdown', this.handleTouchDown, this);
            this.input.on('pointerup', this.handleTouchUp, this);
        }

        this.bullets = this.physics.add.group({
            classType: Projectile, 
            maxSize: 30,
            runChildUpdate: true, 
            key: 'bullet'
        });
        
        // --- NEW: Boss Bullet Group (for separate collision with player) ---
        this.bossBullets = this.physics.add.group({
             classType: Projectile,
             maxSize: 10,
             runChildUpdate: true,
             key: 'bullet'
        });
        // --- END NEW ---
        
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

        // Player bullets hit enemies
        this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, null, this); 
        // Boss bullets hit player
        this.physics.add.overlap(this.bossBullets, this.player, this.hitPlayerByBossBullet, null, this); // NEW
        
        // Enemy body collisions
        this.physics.add.overlap(this.player, this.enemies, this.hitPlayerByEnemy, null, this);
        this.physics.add.collider(this.enemies, this.enemies); 
        
        this.expOrbs = this.physics.add.group();
        this.physics.add.overlap(this.player, this.expOrbs, this.collectOrb, null, this);
        
        const autoFireState = this.playerWeaponInventory.get('autoBullet');
        this.autoFireEvent = this.time.addEvent({
            delay: 1000 / autoFireState.atkSpeed,
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

        this.sendFullStats();
        this.onUpdate({ type: 'score', value: this.score });

        console.log("Phaser Game Created. New Weapon System Initialized.");
    }
    
    // --- MODIFIED: Handles creation and precise placement of the floating joystick ---
    handleTouchDown(pointer) {
        // Only trigger if a touch is happening (not during pause/game over)
        if (this.isGameOver || this.physics.world.isPaused) return;

        // If joystick hasn't been created, create it once.
        if (!this.joystick) {
             // Create it far out with a HUGE radius to capture input anywhere on the screen
             this.joystick = this.joystickPlugin.add(this, {
                x: -1000, 
                y: -1000,
                radius: 5000, // Large radius to cover the entire window
                base: this.add.circle(0, 0, 60, 0x888888, 0.3), 
                thumb: this.add.circle(0, 0, 30, 0xcccccc, 0.5), 
                dir: '8dir', 
                forceMin: 16,
            }).setScrollFactor(0).setVisible(false); 
            
            this.joystick.base.setDepth(100); 
            this.joystick.thumb.setDepth(100); 

            this.joyStickCursorKeys = this.joystick.createCursorKeys();
        } 
        
        this.joystick.base.x = pointer.x;
        this.joystick.base.y = pointer.y;
        this.joystick.thumb.x = pointer.x;
        this.joystick.thumb.y = pointer.y;
        
        this.joystick.setVisible(true);
    }
    
    // --- NEW METHOD: Hides the joystick when the player lifts their finger ---
    handleTouchUp(pointer) {
        if (this.joystick) {
            this.joystick.setVisible(false);
            this.player.setVelocity(0); 
        }
    }
    
    // --- UPDATED: sendFullStats (includes Boss UI data) ---
    sendFullStats() {
        const weaponsForReact = [];
        for (const [key, state] of this.playerWeaponInventory.entries()) {
            const dbEntry = WEAPON_DB[key];
            weaponsForReact.push({
                key: key,
                name: dbEntry.name,
                level: state.level,
                ...(key === 'autoBullet' && { 
                    damage: state.damage,
                    atkSpeed: state.atkSpeed 
                }),
                ...(key === 'electricBolt' && { 
                    atkSpeed: 1000 / state.delay 
                }),
                ...(key === 'shield' && {
                    damage: state.damage,
                    count: state.count
                })
            });
        }
        
        // --- Calculate Boss Direction (if active) ---
        let bossDirection = null; // null means arrow should not be shown
        if (this.isBossActive && this.boss) {
            // NOTE: playerScreenX/Y removed to fix ESLint warnings as they were unused
            
            // Calculate boss position relative to the camera center
            const bossScreenX = this.boss.x - this.cameras.main.worldView.x;
            const bossScreenY = this.boss.y - this.cameras.main.worldView.y;
            
            // Check if boss is outside of camera view (+ buffer)
            const isBossOffScreen = bossScreenX < -50 || bossScreenX > this.cameras.main.width + 50 || 
                                    bossScreenY < -50 || bossScreenY > this.cameras.main.height + 50;

            if (isBossOffScreen) {
                // Calculate the angle from the player to the boss
                const angleRad = Phaser.Math.Angle.Between(
                    this.player.x, this.player.y,
                    this.boss.x, this.boss.y
                );
                // Convert to degrees and normalize (0 to 360) for React CSS rotation
                bossDirection = Phaser.Math.RadToDeg(angleRad);
            }
        }
        this.bossDirection = bossDirection; // Store for next update/check
        
        // --- NEW: Send all stats + Boss data ---
        this.onUpdate({
            type: 'fullStats',
            level: this.playerLevel,
            health: this.playerHealth,
            maxHealth: this.playerMaxHealth,
            moveSpeed: this.playerSpeed,
            weapons: weaponsForReact,
            playerBaseDamage: this.playerBaseDamage,
            critChance: this.playerCritChance,
            critDamage: this.playerCritDamage,
            bulletBounces: this.bulletBounces,
            // --- BOSS STATS ---
            isBossActive: this.isBossActive, 
            bossDirection: this.bossDirection 
        });
    }

    update(time) {
        if (this.isGameOver) return;

        this.handlePlayerMovement();

        if (!this.physics.world.isPaused) {
            // --- UPDATED: Enemy movement handler ---
            this.enemies.getChildren().forEach(enemy => {
                if (enemy.active) {
                    if (enemy.data.get('isBoss')) {
                        // Boss is ranged and does not move towards the player
                        enemy.body.setVelocity(0);
                        // Boss rotation is handled in the Enemy.update() now
                    }
                    else if (enemy.data.get('isBoomerang')) {
                        this.trackPlayer(enemy);
                        enemy.setRotation(enemy.rotation + 0.05); 
                    } else {
                        this.trackPlayer(enemy);
                    }
                }
            });
            // --- End Enemy movement handler ---
            
            this.expOrbs.getChildren().forEach( orb => {
                if (orb.active) this.physics.moveToObject(orb, this.player, 350);
            });
            
            for (const [key, state] of this.playerWeaponInventory.entries()) {
                if (WEAPON_DB[key].update) {
                    WEAPON_DB[key].update(this, state);
                }
            }

            if (this.player.body.velocity.length() > 0) {
                const moveAngleRad = Phaser.Math.Angle.Between(0, 0, this.player.body.velocity.x, this.player.body.velocity.y);
                const thrustAngleRad = moveAngleRad + Math.PI;
                const thrustAngleDeg = Phaser.Math.RadToDeg(thrustAngleRad);
                const emitterX = this.player.x + Math.cos(thrustAngleRad) * 15;
                const emitterY = this.player.y + Math.sin(thrustAngleRad) * 15;

                this.thrusterEmitter.setPosition(emitterX, emitterY);
                this.thrusterEmitter.setAngle(thrustAngleDeg);
                if (!this.thrusterEmitter.emitting) this.thrusterEmitter.start();
            } else {
                if (this.thrusterEmitter.emitting) this.thrusterEmitter.stop();
            }
            
            // Re-send stats on every frame to ensure boss direction marker is correct
            this.sendFullStats();
        } else {
             if (this.thrusterEmitter.emitting) this.thrusterEmitter.stop();
        }
    }
    
    handlePause(shouldPause) {
        if (this.isGameOver || this.physics.world.isPaused === shouldPause) {
            return; 
        }
        
        this.physics.world.isPaused = shouldPause;
        
        if (this.autoFireEvent) this.autoFireEvent.paused = shouldPause;
        if (this.electricBoltEvent) this.electricBoltEvent.paused = shouldPause;
        if (this.bossShootEvent) this.bossShootEvent.paused = shouldPause; // NEW: Pause Boss shooting

        this.enemies.getChildren().forEach(enemy => {
            if (enemy.healthBar) enemy.healthBar.setVisible(!shouldPause);
        });

        console.log(`[Phaser] handlePause: Game Paused = ${shouldPause}`);
    }

    applyUpgrade(choice) {
        console.log(`[Phaser] applyUpgrade: Received choice:`, choice);

        try {
            switch (choice.type) {
                case 'stat':
                    STAT_UPGRADE_DB[choice.key].apply(this);
                    break;
                
                case 'weapon_new':
                    this.acquireWeapon(choice.key);
                    break;
                
                case 'weapon_upgrade':
                    this.upgradeWeapon(choice.key);
                    break;
                
                default:
                    console.warn(`[Phaser] Unknown upgrade type: ${choice.type}`);
                    break;
            }
        } catch (error) {
            console.error(`[Phaser] Error applying upgrade: ${error}`, choice);
        }

        this.removeInvulnerability(this.player);
        console.log("[Phaser] Player invulnerability removed. Sending full stats to React...");
        this.sendFullStats(); // Send all updated stats
    }
    
    acquireWeapon(weaponKey) {
        if (!WEAPON_DB[weaponKey] || this.playerWeaponInventory.has(weaponKey)) {
            console.warn(`[Phaser] Cannot acquire weapon: ${weaponKey}`);
            return;
        }
        
        console.log(`[Phaser] Acquiring new weapon: ${weaponKey}`);
        
        const initialState = { level: 1 };
        this.playerWeaponInventory.set(weaponKey, initialState);

        if (WEAPON_DB[weaponKey].acquire) {
            WEAPON_DB[weaponKey].acquire(this, initialState);
        }
    }

    upgradeWeapon(weaponKey) {
        if (!this.playerWeaponInventory.has(weaponKey)) {
            console.warn(`[Phaser] Cannot upgrade weapon player does not have: ${weaponKey}`);
            return;
        }
        
        const weaponState = this.playerWeaponInventory.get(weaponKey);
        const dbEntry = WEAPON_DB[weaponKey];

        if (weaponState.level >= dbEntry.maxLevel) {
            console.log(`[Phaser] Weapon ${weaponKey} is already at max level.`);
            return; 
        }

        weaponState.level++;
        console.log(`[Phaser] Upgrading weapon ${weaponKey} to Level ${weaponState.level}`);

        if (dbEntry.upgrade) {
            dbEntry.upgrade(this, weaponState);
        }
        
        if (dbEntry.sync) {
            dbEntry.sync(this, weaponState);
        }
    }

    handlePlayerMovement() {
        this.player.setVelocity(0);
        let velX = 0;
        let velY = 0;
        
        const speed = this.playerSpeed; 

        // --- MODIFIED: Constant Speed Joystick Logic to prevent crash ---
        if (this.joystick && this.joystick.visible && this.joystick.force > 0) {
            const angleRad = Phaser.Math.DegToRad(this.joystick.angle);
            
            // Set velocity based on angle and full speed
            velX = Math.cos(angleRad) * speed;
            velY = Math.sin(angleRad) * speed;
        }
        // --- END MODIFIED ---
        else if (this.input.activePointer.isDown && !this.sys.game.device.input.touch) {
            const touchX = this.input.activePointer.worldX;
            const touchY = this.input.activePointer.worldY;
            const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, touchX, touchY);
            velX = Math.cos(angle) * speed;
            velY = Math.sin(angle) * speed;
        } 
        else { 
            if (this.cursors.left.isDown || this.wasd.left.isDown) velX = -speed;
            else if (this.cursors.right.isDown || this.wasd.right.isDown) velX = speed;
            if (this.cursors.up.isDown || this.wasd.up.isDown) velY = -speed;
            else if (this.cursors.down.isDown || this.wasd.down.isDown) velY = speed;
        }

        this.player.setVelocity(velX, velY);
        
        // --- MODIFIED: Keep keyboard/gamepad normalization, but only if not using joystick ---
        const isKeyboardMove = velX !== 0 && velY !== 0 && !(this.input.activePointer.isDown && !this.sys.game.device.input.touch) && !this.joystick?.visible;
        
        if (isKeyboardMove) {
            // Safe to normalize here as keyboard input guarantees non-zero velocity in diagonal case
            this.player.body.velocity.normalize().scale(speed);
        } else if (this.joystick && this.joystick.force > 0) {
             // For joystick, velocity is already set to magnitude 'speed', but normalize one more time 
             // to handle potential floating point errors and ensure maximum constant speed.
             this.player.body.velocity.normalize().scale(speed);
        }
        
        if (velX !== 0 || velY !== 0) {
            this.player.setRotation(Phaser.Math.Angle.Between(0, 0, velX, velY) + Math.PI / 2);
        }
    }


    fireBullet() {
        if (this.physics.world.isPaused || this.isGameOver) return;
        // --- UPDATED: findNearestEnemy call ---
        const targetEnemy = this.findNearestEnemy(this.player.x, this.player.y, []);
        if (!targetEnemy) return;
        
        const bullet = this.bullets.get(0, 0); 
        if (bullet) {
            const angle = Phaser.Math.Angle.Between(
                this.player.x, this.player.y,
                targetEnemy.x, targetEnemy.y
            );
            bullet.fire(this.player.x, this.player.y, angle);
        }
    }
    
    // --- NEW: Boss Ranged Attack ---
    bossFire() {
        if (!this.boss || this.physics.world.isPaused || this.isGameOver) return;
        
        const bullet = this.bossBullets.get(0, 0); 
        if (bullet) {
            const angle = Phaser.Math.Angle.Between(
                this.boss.x, this.boss.y,
                this.player.x, this.player.y
            );
            // Boss shoots its own damage and bullet type
            bullet.fire(this.boss.x, this.boss.y, angle, true, this.boss.getData('damage')); 
        }
    }
    // --- END NEW ---

    // --- UPDATED: findNearestEnemy ---
    // Now finds enemy nearest to (x, y) and can exclude enemies
    findNearestEnemy(x, y, excludeList = []) {
        const cam = this.cameras.main; 
        const activeEnemies = this.enemies.getChildren().filter(e => e.active);
        if (activeEnemies.length === 0) return null;

        let nearestEnemy = null;
        let minDistance = Infinity;

        activeEnemies.forEach(enemy => {
            // Check if enemy is in view and NOT in the exclude list
            if (cam.worldView.contains(enemy.x, enemy.y) && !excludeList.includes(enemy) && !enemy.data.get('isBoss')) {
                const distance = Phaser.Math.Distance.Between(
                    x, y,
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
            const levelBonus = this.playerLevel - 1;
            let health = ENEMY_BASE_HEALTH * (1 + levelBonus * 0.15); 
            health = Math.max(ENEMY_BASE_HEALTH, Math.floor(health));
            let speed = ENEMY_CHASE_SPEED + levelBonus * 1.5;
            speed = Math.min(this.playerSpeed, speed); 
            
            // Regular enemy scale is 0.15
            enemy.spawn(x, y, 'enemy', 0.15, health, speed, ENEMY_DAMAGE_BODY, false);
        }
    }
    
    spawnBoomerangEnemy(x, y) {
        if (this.boomerangEnemiesCount >= MAX_BOOMERANG_ENEMIES) return;

        const enemy = this.enemies.get();
        if (enemy) {
            this.boomerangEnemiesCount++;
            
            const levelBonus = this.playerLevel - 1;
            let health = BOOMERANG_ENEMY_HEALTH * (1 + levelBonus * 0.15); 
            health = Math.max(BOOMERANG_ENEMY_HEALTH, Math.floor(health));

            let speed = BOOMERANG_ENEMY_CHASE_SPEED + levelBonus * 2.5; // Faster scaling
            speed = Math.min(250, speed); // Cap at 250 (still fast)

            // Boomerang enemy scale is 0.3
            enemy.spawn(x, y, 'boomerang_enemy', 0.3, health, speed, BOOMERANG_ENEMY_DAMAGE, false);
        }
    }
    
    spawnElite(x, y) {
        const elite = this.enemies.get();
        if (elite) {
            const levelBonus = this.playerLevel - 1;
            let health = ELITE_ENEMY_HEALTH * (1 + levelBonus * 0.25); 
            health = Math.max(ELITE_ENEMY_HEALTH, Math.floor(health));
            let speed = ELITE_ENEMY_SPEED + levelBonus * 1;
            speed = Math.min(100, speed); 
            
            // Elite scaling: 0.3 * 1.10 = 0.33
            elite.spawn(x, y, 'elite_enemy', .33, health, speed, ELITE_ENEMY_DAMAGE, true); 
        }
    }
    
    // --- NEW: Boss Spawn Function ---
    spawnBoss(x, y) {
        const boss = this.enemies.get();
        if (boss) {
            this.isBossActive = true;
            this.boss = boss;
            
            const levelMultiplier = Math.floor(this.playerLevel / BOSS_LEVEL_INTERVAL);
            const levelBonus = this.playerLevel - 1;
            
            // Boss Health Scaling: Base * Level Mult (to ensure big jump at L30/60/90) * Linear Scaling
            let health = BOSS_BASE_HEALTH * levelMultiplier * (1 + levelBonus * 0.2); 
            health = Math.max(BOSS_BASE_HEALTH * levelMultiplier, Math.floor(health));
            
            // Boss starts with 50% armor, scaled by level
            let maxArmor = Math.floor(health * (0.5 + levelMultiplier * 0.1));
            
            // Boss Damage Scaling: Scales linearly
            const damage = BOSS_DAMAGE + levelBonus * 0.5;
            
            // Boss scale is 0.6 (large)
            // Speed is 0 as it's a ranged boss
            boss.spawn(x, y, 'boss', 0.6, health, 0, damage, true, true); 
            
            // Set the boss's current armor manually
            boss.setData('armor', maxArmor);
            boss.setData('maxArmor', maxArmor);
            boss.drawHealthBar(); // Redraw with armor
            
            // Start the boss's firing event
            this.bossShootEvent = this.time.addEvent({
                delay: BOSS_SHOOT_RATE_MS,
                callback: this.bossFire,
                callbackScope: this,
                loop: true
            });
            
            console.log(`Boss spawned! Health: ${health}, Damage: ${damage}`);
        }
    }
    // --- END NEW ---

    // --- UPDATED: Spawn Wave to include Boss Spawn Check ---
    spawnWave() {
        if (this.isGameOver) return;
        if (this.enemies.countActive(true) >= MAX_ENEMIES && !this.isBossActive) return;

        const mapWidth = MAP_WIDTH;
        const mapHeight = MAP_HEIGHT;
        const playerX = this.player.x;
        const playerY = this.player.y;
        const spawnDistance = 500;
        
        // --- NEW BOSS LOGIC: Check for Boss Round ---
        const isBossRound = this.playerLevel % BOSS_LEVEL_INTERVAL === 0 && this.playerLevel > 0;
        
        if (isBossRound && !this.isBossActive) {
            // Find a far spawn location for the boss
            let x, y;
            const bossSpawnDistance = 1500;
             do {
                x = Phaser.Math.Between(0, mapWidth);
                y = Phaser.Math.Between(0, mapHeight);
            } while (Phaser.Math.Distance.Between(x, y, playerX, playerY) < bossSpawnDistance);

            this.spawnBoss(x, y);
            // Stop other enemy spawning during boss fight
            return; 
        } else if (this.isBossActive) {
            // If boss is active, don't spawn regular enemies (or spawn much less/slower)
             if(Math.random() < 0.2) return; // Reduce regular enemy spawning during boss fight
        }
        // --- END NEW BOSS LOGIC ---

        const baseWaveSize = 4;
        const waveSize = baseWaveSize + Math.floor(this.playerLevel / 5);
        let eliteChance = 0.05 + (this.playerLevel * 0.002);
        eliteChance = Math.min(0.25, eliteChance);
        
        let boomerangChance = 0.1; 

        for (let i = 0; i < waveSize; i++) {
            let x, y;
            do {
                x = Phaser.Math.Between(0, mapWidth);
                y = Phaser.Math.Between(0, mapHeight);
            } while (Phaser.Math.Distance.Between(x, y, playerX, playerY) < spawnDistance);

            if (this.playerLevel > 1 && Math.random() < boomerangChance && this.boomerangEnemiesCount < MAX_BOOMERANG_ENEMIES) {
                this.spawnBoomerangEnemy(x, y);
            }
            else if (this.playerLevel > 5 && Math.random() < eliteChance) {
                this.spawnElite(x, y);
            } 
            else {
                this.spawnRegularEnemy(x, y);
            }
        }
    }
    
    updateHealth(damage) {
        if (this.isGameOver) return;
        this.playerHealth -= damage;
        this.playerHealth = Math.max(0, this.playerHealth);
        this.onUpdate({ type: 'health', value: this.playerHealth, max: this.playerMaxHealth }); 
        if (this.playerHealth <= 0) {
            this.handleGameOver();
        } else {
            this.cameras.main.flash(100, 255, 0, 0);
            this.setInvulnerable(this.player, 1000); 
        }
    }
    
    // --- NEW: Handle collision with Boss Bullet ---
    hitPlayerByBossBullet(player, bullet) {
        if (!player.active || !bullet.active || player.invulnerable) return;
        
        if (bullet.getData('isBossBullet')) {
            this.updateHealth(bullet.getData('damage'));
            bullet.disableProjectile();
        }
    }
    // --- END NEW ---
    
    handleGameOver() {
        this.isGameOver = true;
        this.player.setActive(false).setVisible(false);
        this.physics.pause();
        this.onUpdate({ type: 'gameOver', value: true }); 
        if (this.pauseText) this.pauseText.setVisible(false);
        this.thrusterEmitter.stop(); 
        this.enemies.getChildren().forEach(enemy => {
            if (enemy.healthBar) enemy.healthBar.clear();
        });
        
        if (this.shieldOrbs) this.shieldOrbs.destroy();
        if (this.shieldCollider) this.shieldCollider.destroy();
        
        if (this.bossShootEvent) { // NEW: Stop boss attack on game over
            this.bossShootEvent.remove(); 
            this.bossShootEvent = null;
        }
        
        this.onGameOverSubmit(this.score);
    }
    
    setInvulnerable(player, duration = 1000) {
        player.invulnerable = true;
        if (player.flashTween) player.flashTween.stop();
        player.flashTween = this.tweens.add({
            targets: player,
            alpha: 0.3,
            ease: 'Power1',
            duration: 100,
            yoyo: true,
            repeat: -1, 
        });
        if (player.invulnTimer) player.invulnTimer.remove();
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

    // --- HEAVILY UPDATED: hitEnemy (Handles Crit + Bounce + XP Persistence) ---
    hitEnemy(bullet, enemy) {
        // Boss bullets are handled by hitPlayerByBossBullet
        if (bullet.getData('isBossBullet')) return; 
        
        if (!enemy.active || !bullet.active || bullet.enemiesHit.has(enemy)) {
            return;
        } 
        
        bullet.enemiesHit.add(enemy); // Mark this enemy as hit

        // 1. Calculate Damage (Crit)
        const baseDmg = this.playerWeaponDamage + this.playerBaseDamage;
        const isCrit = Math.random() < this.playerCritChance;
        const finalDmg = isCrit ? baseDmg * this.playerCritDamage : baseDmg;
        
        // 2. Apply Damage
        const isDead = enemy.takeDamage(finalDmg, isCrit); 

        // 3. Handle Orb Drop
        if (isDead) {
            // Normal enemy drop
            if (!enemy.getData('isBoss')) {
                const orb = this.expOrbs.get(enemy.x, enemy.y, 'exp_orb');
                if (orb) {
                    orb.setActive(true).setVisible(true).setScale(0.3).setTint(0xFFFF00).setAlpha(1);
                    orb.body.setCircle(8); 
                    orb.body.enable = true;
                    orb.body.moves = true;
                }
            }
            // Boss drop is handled in Enemy.kill()
        }
        
        // 4. Handle Bouncing
        if (bullet.bouncesLeft > 0) {
            bullet.bouncesLeft--;
            
            // Find a new target, excluding the one just hit and any boss
            const nextTarget = this.findNearestEnemy(bullet.x, bullet.y, Array.from(bullet.enemiesHit).concat(this.boss ? [this.boss] : []));
            
            if (nextTarget) {
                // Fire at the new target
                const angle = Phaser.Math.Angle.Between(bullet.x, bullet.y, nextTarget.x, nextTarget.y);
                bullet.setRotation(angle);
                const vx = Math.cos(angle) * BULLET_SPEED;
                const vy = Math.sin(angle) * BULLET_SPEED;
                bullet.setData('vx', vx);
                bullet.setData('vy', vy);
                bullet.body.setVelocity(vx, vy);
            } else {
                // No more targets, disable bullet
                bullet.disableProjectile();
            }
        } else {
            // No bounces left, disable bullet
            bullet.disableProjectile();
        }
    }
    
    hitEnemyByShield(shieldOrb, enemy) {
        if (!enemy.active) return;
        
        const shieldState = this.playerWeaponInventory.get('shield');
        if (!shieldState) return;

        if (!enemy.shieldHitCooldown) {
            // --- NEW: Shield can now crit! ---
            const baseDmg = shieldState.damage + this.playerBaseDamage;
            const isCrit = Math.random() < this.playerCritChance;
            const finalDmg = isCrit ? baseDmg * this.playerCritDamage : baseDmg;
            
            // The shield orb is correctly checking if the enemy is already dead
            const isDead = enemy.takeDamage(finalDmg, isCrit);
            
            // If the enemy dies, we need to manually drop an orb since hitEnemy (which handles orbs) is not called.
            if (isDead) {
                 if (!enemy.getData('isBoss')) {
                    const orb = this.expOrbs.get(enemy.x, enemy.y, 'exp_orb');
                    if (orb) {
                        orb.setActive(true).setVisible(true).setScale(0.3).setTint(0xFFFF00).setAlpha(1);
                        orb.body.setCircle(8); 
                        orb.body.enable = true;
                        orb.body.moves = true;
                    }
                }
                // Boss orb drop is handled in Enemy.kill()
            }
            
            enemy.shieldHitCooldown = true;
            this.time.delayedCall(250, () => {
                if (enemy) enemy.shieldHitCooldown = false;
            });
        }
    }
    
    enterUpgradeState() {
        this.playerLevel++;
        this.orbsForNextLevel++;
        
        const choices = this.generateUpgradeChoices();
        
        this.onShowUpgrade(choices); 
        this.setInvulnerable(this.player, -1); 
        
        console.log(`[Phaser] enterUpgradeState: Player is Level ${this.playerLevel}. Sending choices:`, choices);
    }
    
    // --- UPDATED: Upgrade Choice Generation ---
    generateUpgradeChoices() {
        let choices = [];
        
        // 1. Get New Weapon Options
        const availableNewWeapons = [];
        for (const key in WEAPON_DB) {
            if (key !== 'autoBullet' && !this.playerWeaponInventory.has(key)) {
                availableNewWeapons.push(key);
            }
        }
        
        // 2. Get Weapon Upgrade Options
        const availableWeaponUpgrades = [];
        for (const [key, state] of this.playerWeaponInventory.entries()) {
            if (state.level < WEAPON_DB[key].maxLevel) {
                availableWeaponUpgrades.push(key);
            }
        }
        
        // 3. Get Stat Upgrade Options
        let availableStatUpgrades = [];
        for (const key in STAT_UPGRADE_DB) {
            // --- NEW: Logic to hide CritDamage if CritChance is 0 ---
            if (key === 'critDamage' && this.playerCritChance === 0) {
                continue; // Skip this upgrade
            }

            // Check max level for stats that have one
            if (STAT_UPGRADE_DB[key].maxLevel) {
                 // Need to track stat levels. Let's assume we need a tracker for this.
                 // For now, let's just use critChance's level
                 if (key === 'critChance' && this.playerCritChance >= (STAT_UPGRADE_DB[key].maxLevel * 0.05)) {
                     continue; // Skip if max level
                 }
            }

            availableStatUpgrades.push(key);
        }
        
        
        // --- Build Final List (Max 3) ---
        
        // Box 1: New Weapon (if available)
        if (availableNewWeapons.length > 0) {
            const chosenKey = Phaser.Math.RND.pick(availableNewWeapons);
            const db = WEAPON_DB[chosenKey];
            choices.push({
                type: 'weapon_new',
                key: chosenKey,
                name: db.name,
                description: db.description,
                image: db.image,
                level: 1
            });
        }
        
        // Box 2: Stat Upgrade (if available)
        if (availableStatUpgrades.length > 0) {
            const chosenStatKey = Phaser.Math.RND.pick(availableStatUpgrades);
            const dbStat = STAT_UPGRADE_DB[chosenStatKey];
            choices.push({
                type: 'stat',
                key: chosenStatKey,
                name: dbStat.name,
                description: dbStat.description,
                image: dbStat.image,
                level: 'N/A' // todo: could show level for stats
            });
        }


        // Box 3: Weapon Upgrade (if available)
        if (availableWeaponUpgrades.length > 0) {
            const chosenKey = Phaser.Math.RND.pick(availableWeaponUpgrades);
            const db = WEAPON_DB[chosenKey];
            const state = this.playerWeaponInventory.get(chosenKey);
            choices.push({
                type: 'weapon_upgrade',
                key: chosenKey,
                name: `Upgrade ${db.name}`,
                description: `Increases ${db.name} to Level ${state.level + 1}.`,
                image: db.image,
                level: state.level + 1
            });
        }

        // --- Handle cases with fewer than 3 options ---
        // If we still have 0 or 1 choices, pad with more stat upgrades
        while(choices.length < 3 && availableStatUpgrades.length > 0) {
             const chosenStatKey = Phaser.Math.RND.pick(availableStatUpgrades);
             // Avoid duplicates
             if (choices.find(c => c.key === chosenStatKey)) {
                 availableStatUpgrades = availableStatUpgrades.filter(s => s !== chosenStatKey);
                 if(availableStatUpgrades.length === 0) break;
                 continue;
             }
             
             const dbStat = STAT_UPGRADE_DB[chosenStatKey];
             choices.push({
                type: 'stat',
                key: chosenStatKey,
                name: dbStat.name,
                description: dbStat.description,
                image: dbStat.image,
                level: 'N/A'
             });
        }
        
        return Phaser.Math.RND.shuffle(choices);
    }

    collectOrb(player, orb) {
        orb.disableBody(true, true); 
        this.score += 1;
        this.onUpdate({ type: 'score', value: this.score });
        
        if (this.score >= this.nextUpgradeScore) {
            this.enterUpgradeState(); 
            this.nextUpgradeScore += this.orbsForNextLevel; 
        }
    }
    
    drawZapLine(p1, p2, color, duration = 100) {
        const lineGraphics = this.add.graphics();
        lineGraphics.setDepth(50);
        lineGraphics.lineStyle(2, color, 1);
        lineGraphics.beginPath();
        lineGraphics.moveTo(p1.x, p1.y);
        lineGraphics.lineTo(p2.x, p2.y);
        lineGraphics.strokePath();

        this.tweens.add({
            targets: lineGraphics,
            alpha: 0,
            duration: duration,
            onComplete: () => lineGraphics.destroy()
        });
    }

    // --- UPDATED: Zap Enemies (Handles armor + XP Persistence) ---
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
            
            const isDead = currentTarget.takeDamage(finalDmg, isCrit); 
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

            // --- FIX 1: Added 'isDead' check to spawn orb ---
            if (isDead) {
                 if (!zappedEnemy.getData('isBoss')) {
                    const orb = this.expOrbs.get(zappedEnemy.x, zappedEnemy.y, 'exp_orb');
                    if (orb) {
                        orb.setActive(true).setVisible(true).setScale(0.3).setTint(0xFFFF00).setAlpha(1);
                        orb.body.setCircle(8); 
                        orb.body.enable = true;
                        orb.body.moves = true;
                    }
                 }
                 // Boss orb drop is handled in Enemy.kill()
            }
            // --- END FIX 1 ---

            // Find next target
            let nextTarget = null;
            let minDistance = Infinity;
            
            for (const enemy of activeEnemies) {
                if (enemy.active && !zappedEnemies.has(enemy) && !enemy.getData('isBoss')) { // Don't chain to a boss
                    const distance = Phaser.Math.Distance.Between(currentTarget.x, currentTarget.y, enemy.x, enemy.y);
                    if (distance < minDistance) {
                        minDistance = distance;
                        nextTarget = enemy;
                    }
                }
            }
            
            currentTarget = nextTarget;
        }
    }
}

// --- REACT COMPONENT (Wrapper) ---

const BulletHellGame = React.forwardRef(({ onUpdate, isPaused, onTogglePause, onShowUpgrade, onGameOverSubmit }, ref) => {
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
            plugins: {
                scene: [{
                    key: 'rexVirtualJoystick',
                    plugin: VirtualJoystickPlugin,
                    start: true,
                    mapping: 'joystickPlugin'
                }]
            },
            scene: [MainScene]
        };

        const game = new Phaser.Game(config);
        gameRef.current = game;
        
        // --- MODIFIED: Passing new prop to MainScene ---
        game.scene.start('MainScene', { 
            onUpdate: onUpdate || (() => {}),
            onTogglePause: onTogglePause || (() => {}),
            onShowUpgrade: onShowUpgrade || (() => {}),
            onGameOverSubmit: onGameOverSubmit || (() => {})
        });

        return () => {
            game.destroy(true);
            gameRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps 
    }, [onUpdate, onShowUpgrade, onGameOverSubmit]); 

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