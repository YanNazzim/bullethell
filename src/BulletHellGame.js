import React, { useEffect, useRef, useImperativeHandle } from 'react';
import Phaser from 'phaser';
import VirtualJoystickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';

// --- CONFIGURATION CONSTANTS ---
const PLAYER_BASE_SPEED = 150; 
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
        name: 'Spinning Shield',
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
                orb.body.setCircle(50);
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
            Phaser.Actions.PlaceOnCircle(
                scene.shieldOrbs.getChildren(),
                new Phaser.Geom.Circle(scene.player.x, scene.player.y, weaponState.radius),
                weaponState.angle
            );
        }
    }
};


// --- PHASER SCENES ---

// --- UPDATED: Projectile Class ---
class Projectile extends Phaser.Physics.Arcade.Image {
    constructor(scene, x, y, texture) {
        super(scene, x, y, texture);
        
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.body.setAllowGravity(false); 
        this.setData('vx', 0);
        this.setData('vy', 0);
        
        this.despawnTimer = null;
        this.bouncesLeft = 0; // --- NEW: Bounce tracker
        this.enemiesHit = new Set(); // --- NEW: Prevents hitting same enemy twice
    }

    fire(x, y, angle) {
        if (this.despawnTimer) {
            this.despawnTimer.remove(false);
        }
        
        this.setTexture('bullet');
        this.body.enable = true;
        this.body.reset(x, y); 
        
        this.setRotation(angle); 
        this.setActive(true).setVisible(true).setScale(.04);
        this.body.setCircle(500);

        // --- NEW: Set bounces from scene ---
        this.bouncesLeft = this.scene.bulletBounces;
        this.enemiesHit.clear();

        const vx = Math.cos(angle) * BULLET_SPEED;
        const vy = Math.sin(angle) * BULLET_SPEED;

        this.setData('vx', vx);
        this.setData('vy', vy);
        
        this.body.setVelocity(vx, vy);

        this.despawnTimer = this.scene.time.delayedCall(4000, this.disableProjectile, [], this); // MODIFIED: Increased duration for longer travel
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

// --- UPDATED: Enemy Class (Added armor logic and drawing) ---
class Enemy extends Phaser.Physics.Arcade.Image {
    constructor(scene, x, y, texture) {
        super(scene, x, y, texture);
        
        this.healthBar = scene.add.graphics();
        this.armorBar = scene.add.graphics(); // NEW: Armor Bar Graphics
        this.healthBar.setDepth(8); 
        this.armorBar.setDepth(8); 
    }

    spawn(x, y, key, scale, health, speed, damage, isElite) {
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
        
        // --- NEW: Armor for Elite Enemies (0.5 max health) ---
        const maxArmor = isElite ? Math.floor(health * 0.5) : 0;
        this.setData('armor', maxArmor);
        this.setData('maxArmor', maxArmor);
        
        // --- NEW: Boomerang properties ---
        this.setData('isBoomerang', key === 'boomerang_enemy');
        this.setData('angle', 0);
        
        // --- UPDATED: Scaling and Tinting ---
        if (isElite) {
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
        this.armorBar.setVisible(isElite);
    }
    
    // --- UPDATED: takeDamage now handles armor reduction ---
    takeDamage(amount, isCrit = false) {
        if (!this.active) return false;
        
        let remainingDamage = amount;
        let newHealth = this.getData('health');
        let newArmor = this.getData('armor');
        
        // 1. Damage Armor first (if elite and has armor)
        if (this.getData('isElite') && newArmor > 0) {
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
                if (this.getData('isElite')) {
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

    // --- UPDATED: Draw Health and Armor Bars (Chunkier and Closer) ---
    drawHealthBar() {
        this.healthBar.clear();
        this.armorBar.clear(); 
        if (!this.active) return;
        
        const pHealth = this.getData('health') / this.getData('maxHealth');
        const pArmor = this.getData('maxArmor') > 0 ? this.getData('armor') / this.getData('maxArmor') : 0;
        
        const w = (this.width * this.scaleX);
        const h = 8; // MODIFIED: Increased height from 5 to 8
        const x = this.x - w / 2;
        // MODIFIED: Changed offset to (h * 1) to bring it closer to the enemy
        const yHealth = this.y - (this.height * this.scaleY) / 2 - (h * 1); 
        const yArmor = yHealth - h - 2; // Above the health bar

        // --- Draw Health Bar ---
        this.healthBar.fillStyle(0x333333);
        this.healthBar.fillRect(x, yHealth, w, h);
        this.healthBar.fillStyle(pHealth < 0.3 ? 0xff0000 : 0x00ff00); 
        this.healthBar.fillRect(x, yHealth, w * pHealth, h);
        
        // --- Draw Armor Bar (Elite only) ---
        if (this.getData('isElite')) {
             this.armorBar.fillStyle(0x333333); // Background
             this.armorBar.fillRect(x, yArmor, w, h);
             
             // Blue for armor
             this.armorBar.fillStyle(0x61dafb); 
             this.armorBar.fillRect(x, yArmor, w * pArmor, h);
             this.armorBar.setVisible(true);
             
             // The method this.setStrokeStyle() is not supported on Phaser.Physics.Arcade.Image.
             
        } else {
            this.armorBar.setVisible(false);
        }
    }

    // --- UPDATED: Kill function to clear all bars and update Boomerang count ---
    kill() {
        this.healthBar.clear(); 
        this.armorBar.clear(); 
        
        if (this.data.get('isBoomerang')) {
            this.scene.boomerangEnemiesCount = Math.max(0, this.scene.boomerangEnemiesCount - 1);
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
        // --- NEW PROP: Handle game over submission ---
        this.onGameOverSubmit = () => {}; 
        
        // --- UPDATED: Player Stats (Managed by Scene) ---
        this.playerHealth = PLAYER_HEALTH;
        this.playerMaxHealth = PLAYER_HEALTH;
        this.playerWeaponDamage = 0; // Set by autoBullet.sync
        this.playerBaseDamage = 0; // --- NEW: Upgraded stat
        this.playerSpeed = PLAYER_BASE_SPEED; 
        this.playerLevel = 1;
        this.playerCritChance = 0; // --- NEW: Upgraded stat (0.0 to 1.0)
        this.playerCritDamage = 1.5; // --- NEW: Upgraded stat (1.5 = 150%)
        this.bulletBounces = 0; // --- NEW: Upgraded stat
        
        this.playerWeaponInventory = new Map();
        
        this.electricBoltEvent = null; 
        this.shieldOrbs = null;
        this.shieldCollider = null;

        this.orbsForNextLevel = 5;
        this.nextUpgradeScore = 5;
        
        this.boomerangEnemiesCount = 0; // --- NEW: Boomerang Enemy Tracker
    }
    
    init(data) {
        this.onUpdate = data.onUpdate;
        this.onTogglePause = data.onTogglePause;
        this.onShowUpgrade = data.onShowUpgrade;
        this.onGameOverSubmit = data.onGameOverSubmit; // --- NEW: Get new prop
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
        this.load.image('boomerang_enemy', 'assets/boomerang_enemy.png'); // --- NEW: Boomerang enemy placeholder
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
        this.boomerangEnemiesCount = 0; // --- Reset tracker

        this.orbsForNextLevel = 5;
        this.nextUpgradeScore = 5;
        
        this.playerWeaponInventory.clear();
        const defaultWeaponState = { level: 1, damage: 2, atkSpeed: 2 }; 
        this.playerWeaponInventory.set('autoBullet', defaultWeaponState);
        WEAPON_DB.autoBullet.sync(this, defaultWeaponState);
        
        this.isGameOver = false;

        // --- UPDATED: Ensure all sides check collision for boomerang bouncing (Removed for new tracking logic) ---
        this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
        this.physics.world.checkCollision.down = false; // Disable world collision for tracking enemies
        this.physics.world.checkCollision.up = false;
        this.physics.world.checkCollision.left = false;
        this.physics.world.checkCollision.right = false;

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
        
        // --- MODIFIED: Dynamic Joystick Setup (No fixed joystick created here) ---
        if (this.sys.game.device.input.touch) {
            this.input.on('pointerdown', this.handleTouchDown, this);
            this.input.on('pointerup', this.handleTouchUp, this);
        }
        // --- END MODIFIED: Dynamic Joystick Setup ---


        this.bullets = this.physics.add.group({
            classType: Projectile, 
            maxSize: 30,
            runChildUpdate: true, 
            key: 'bullet'
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
            }).setScrollFactor(0).setVisible(false); // FIXED: Removed .setDepth(100) from chain
            
            // FIXED: Apply setDepth directly to the GameObjects (base and thumb)
            this.joystick.base.setDepth(100); 
            this.joystick.thumb.setDepth(100); 

            this.joyStickCursorKeys = this.joystick.createCursorKeys();
        } 
        
        // Now, set the base and thumb position to the EXACT pointer down location.
        // This is the key to dictating the center by the tap position.
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
            // Optionally stop player movement immediately on release
            this.player.setVelocity(0); 
        }
    }
    
    // --- UPDATED: sendFullStats ---
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
        
        // --- NEW: Send all stats ---
        this.onUpdate({
            type: 'fullStats',
            level: this.playerLevel,
            health: this.playerHealth,
            maxHealth: this.playerMaxHealth,
            moveSpeed: this.playerSpeed,
            weapons: weaponsForReact,
            // --- NEW STATS ---
            playerBaseDamage: this.playerBaseDamage,
            critChance: this.playerCritChance,
            critDamage: this.playerCritDamage,
            bulletBounces: this.bulletBounces
        });
    }

    update(time) {
        if (this.isGameOver) return;

        this.handlePlayerMovement();

        if (!this.physics.world.isPaused) {
            // --- UPDATED: Enemy movement handler ---
            this.enemies.getChildren().forEach(enemy => {
                if (enemy.active) {
                    if (enemy.data.get('isBoomerang')) {
                        // Boomerang now tracks, but we keep rotation for visual effect
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
        } else {
             if (this.thrusterEmitter.emitting) this.thrusterEmitter.stop();
        }
    }
    
    // --- REMOVED: handleBoomerangMovement method is no longer needed/correct ---
    
    handlePause(shouldPause) {
        if (this.isGameOver || this.physics.world.isPaused === shouldPause) {
            return; 
        }
        
        this.physics.world.isPaused = shouldPause;
        
        if (this.autoFireEvent) this.autoFireEvent.paused = shouldPause;
        if (this.electricBoltEvent) this.electricBoltEvent.paused = shouldPause;

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
            if (cam.worldView.contains(enemy.x, enemy.y) && !excludeList.includes(enemy)) {
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
            
            // Regular enemy scale is 0.3
            enemy.spawn(x, y, 'enemy', 0.15, health, speed, ENEMY_DAMAGE_BODY, false);
        }
    }
    
    // --- UPDATED: Boomerang Enemy Spawn Function (Now chases player) ---
    spawnBoomerangEnemy(x, y) {
        if (this.boomerangEnemiesCount >= MAX_BOOMERANG_ENEMIES) return;

        const enemy = this.enemies.get();
        if (enemy) {
            this.boomerangEnemiesCount++;
            
            const levelBonus = this.playerLevel - 1;
            let health = BOOMERANG_ENEMY_HEALTH * (1 + levelBonus * 0.15); 
            health = Math.max(BOOMERANG_ENEMY_HEALTH, Math.floor(health));

            // Set speed to the new fast chase speed
            const speed = BOOMERANG_ENEMY_CHASE_SPEED;

            // Regular enemy scale is 0.3
            enemy.spawn(x, y, 'boomerang_enemy', 0.3, health, speed, BOOMERANG_ENEMY_DAMAGE, false);
            
            // Removed bouncing/orbit settings to allow for tracking
        }
    }
    
    // --- UPDATED: Elite Spawn (10% larger than 0.3 scale) ---
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

    // --- UPDATED: Spawn Wave to include Boomerang Enemy ---
    spawnWave() {
        if (this.isGameOver) return;
        if (this.enemies.countActive(true) >= MAX_ENEMIES) return;

        const mapWidth = MAP_WIDTH;
        const mapHeight = MAP_HEIGHT;
        const playerX = this.player.x;
        const playerY = this.player.y;
        const spawnDistance = 500;
        
        const baseWaveSize = 4;
        const waveSize = baseWaveSize + Math.floor(this.playerLevel / 5);
        let eliteChance = 0.05 + (this.playerLevel * 0.002);
        eliteChance = Math.min(0.25, eliteChance);
        
        let boomerangChance = 0.1; // 10% chance to spawn a boomerang enemy if under limit

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
    
    // --- MODIFIED: handleGameOver to call onGameOverSubmit ---
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
        
        // --- NEW: Submit the final score to React ---
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
        if (!enemy.active || !bullet.active || bullet.enemiesHit.has(enemy)) {
             // Don't hit inactive enemies or the same enemy twice on one bounce chain
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
            const orb = this.expOrbs.get(enemy.x, enemy.y, 'exp_orb');
            if (orb) {
                orb.setActive(true).setVisible(true).setScale(0.3).setTint(0xFFFF00).setAlpha(1);
                orb.body.setCircle(8); 
                orb.body.enable = true;
                orb.body.moves = true;
                // REMOVED: Orb despawn timer (Ensures orbs persist until collected)
                /* this.time.delayedCall(5000, () => {
                    if(orb.active) orb.disableBody(true, true);
                });
                */
            }
        }
        
        // 4. Handle Bouncing
        if (bullet.bouncesLeft > 0) {
            bullet.bouncesLeft--;
            
            // Find a new target, excluding the one just hit
            const nextTarget = this.findNearestEnemy(bullet.x, bullet.y, Array.from(bullet.enemiesHit));
            
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
            
            enemy.takeDamage(finalDmg, isCrit);
            
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
                    if (zappedEnemy.getData('isElite')) zappedEnemy.setTint(0xff0000); 
                    else if (zappedEnemy.getData('isBoomerang')) zappedEnemy.setTint(0xffaa00);
                    else zappedEnemy.clearTint(); 
                }
            });

            // --- FIX 1: Added 'isDead' check to spawn orb ---
            if (isDead) {
                const orb = this.expOrbs.get(zappedEnemy.x, zappedEnemy.y, 'exp_orb');
                if (orb) {
                    orb.setActive(true).setVisible(true).setScale(0.3).setTint(0xFFFF00).setAlpha(1);
                    orb.body.setCircle(8); 
                    orb.body.enable = true;
                    orb.body.moves = true;
                    // REMOVED: Orb despawn timer (Ensures orbs persist until collected)
                    /* this.time.delayedCall(5000, () => {
                        if(orb.active) orb.disableBody(true, true);
                    });
                    */
                }
            }
            // --- END FIX 1 ---

            // Find next target
            let nextTarget = null;
            let minDistance = Infinity;
            
            // --- FIX 2: Replaced 'forEach' with 'for...of' loop ---
            for (const enemy of activeEnemies) {
                if (enemy.active && !zappedEnemies.has(enemy)) { 
                    const distance = Phaser.Math.Distance.Between(currentTarget.x, currentTarget.y, enemy.x, enemy.y);
                    if (distance < minDistance) {
                        minDistance = distance;
                        nextTarget = enemy;
                    }
                }
            }
            // --- END FIX 2 ---
            
            currentTarget = nextTarget;
        }
    }
}

// --- REACT COMPONENT (Wrapper) ---

// --- MODIFIED PROPS: Added onGameOverSubmit ---
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
    }, [onUpdate, onShowUpgrade, onGameOverSubmit]); // --- MODIFIED: Include new prop ---

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