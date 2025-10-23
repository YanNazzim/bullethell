import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
// --- NEW: Import the joystick plugin ---
import VirtualJoystickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';

// --- CONFIGURATION CONSTANTS ---
const PLAYER_SPEED = 200;
const PLAYER_HEALTH = 10;
const AUTO_FIRE_RATE_MS = 250; 

const BULLET_SPEED = 400;

const ENEMY_SPAWN_RATE_MS = 3000;
const ENEMY_CHASE_SPEED = 50;

const ENEMY_DAMAGE_BODY = 1;

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
        
        // Force the correct texture
        this.setTexture('bullet');

        this.body.enable = true;
        this.body.reset(x, y); // Reset position and clear velocity
        
        
        // Set rotation (assumes 'laser.png' points "right")
        this.setRotation(angle); 

        // Set scale to 0.03
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


class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        this.player = null;
        this.bullets = null; 
        this.enemies = null;
        this.score = 0;
        this.playerHealth = PLAYER_HEALTH;
        this.isGameOver = false;
        this.onUpdate = () => {}; 
        this.pauseText = null; 
        this.autoFireEvent = null; 
        
        this.background = null;
        this.thrusterEmitter = null;
        
        this.onTogglePause = () => {};
        
        // --- NEW: Joystick properties ---
        this.joystick = null;
        this.joyStickCursorKeys = null;
        
        // --- FIX: This 'joystickPlugin' will be mapped from the config ---
        this.joystickPlugin = null; 
    }
    
    init(data) {
        this.onUpdate = data.onUpdate;
        this.onTogglePause = data.onTogglePause;
    }

    // 1. PRELOAD: Load all game assets
    preload() {
        this.load.image('player', 'https://labs.phaser.io/assets/sprites/ship.png');
        this.load.image('blue_particle', 'https://labs.phaser.io/assets/particles/blue.png');
        this.load.image('exp_orb', 'https://labs.phaser.io/assets/sprites/star.png');
        this.load.image('space_bg', 'https://labs.phaser.io/assets/skies/space3.png');
        this.load.image('enemy', 'https://labs.phaser.io/assets/sprites/space-baddie.png');
        
        // This path works because 'assets/laser.png' is inside the 'public' folder.
        this.load.image('bullet', 'assets/laser.png');
    }

    // 2. CREATE: Setup the game world
    create() {
        this.score = 0;
        this.playerHealth = PLAYER_HEALTH;
        this.onUpdate({ type: 'score', value: this.score });
        this.onUpdate({ type: 'health', value: this.playerHealth });
        this.isGameOver = false;

        this.physics.world.setBounds(0, 0, 1600, 1200);

        this.background = this.add.tileSprite(800, 600, 1600, 1200, 'space_bg');
        this.background.setScrollFactor(0.5, 0.5);
        this.background.setDepth(-1);

        this.player = this.physics.add.image(800, 600, 'player')
            .setCollideWorldBounds(true)
            .setScale(0.5);

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
        
        // --- JOYSTICK CHANGE: Smaller and Bottom-Center ---
        if (this.sys.game.device.input.touch) {
            // Position joystick in bottom-center of the *camera*
            const joyStickX = this.cameras.main.width / 2;
            const joyStickY = this.cameras.main.height * 0.85; // 85% down

            // --- Use the mapped plugin 'this.joystickPlugin' from the scene ---
            this.joystick = this.joystickPlugin.add(this, {
                x: joyStickX,
                y: joyStickY,
                radius: 60, // Smaller base
                base: this.add.circle(0, 0, 60, 0x888888, 0.3), // Faded base
                thumb: this.add.circle(0, 0, 30, 0xcccccc, 0.5), // Smaller thumb
                dir: '8dir', // 8 directions
                forceMin: 16,
            }).setScrollFactor(0); // Stick to camera

            this.joyStickCursorKeys = this.joystick.createCursorKeys();
        }
        // --- End Joystick Creation ---


        // 1. Player Bullets Group
        this.bullets = this.physics.add.group({
            classType: Projectile, 
            maxSize: 30,
            runChildUpdate: true, 
            key: 'bullet', // This now uses your local 'laser.png'
            createCallback: (gameObject) => {
                gameObject.body.setAllowGravity(false);
            }
        });
        
        // 2. Enemies Group
        this.enemies = this.physics.add.group({
            defaultKey: 'enemy',
            runChildUpdate: true
        });

        // 3. Player Thruster Emitter
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
            delay: AUTO_FIRE_RATE_MS,
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

    // 3. UPDATE: The main game loop
    update(time) {
        if (this.isGameOver) return;

        // Movement is handled first
        this.handlePlayerMovement();

        if (!this.physics.world.isPaused) {
            this.enemies.getChildren().forEach(enemy => {
                this.trackPlayer(enemy);
            });
            
            // Make all active orbs track the player
            this.expOrbs.getChildren().forEach(orb => {
                if (orb.active) {
                    // This recalculates the path to the player every frame
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
    
    // --- This function is called by the React wrapper ---
    handlePause(shouldPause) {
        // Check if state is already correct
        if (this.isGameOver || this.physics.world.isPaused === shouldPause) {
            return; 
        }
        
        this.physics.world.isPaused = shouldPause;
        this.pauseText.setVisible(shouldPause);
        this.autoFireEvent.paused = shouldPause;

        console.log(`Game Paused: ${shouldPause}`);
    }

    // --- HEAVILY MODIFIED: handlePlayerMovement ---
    handlePlayerMovement() {
        // Start with no velocity
        this.player.setVelocity(0);
        let velX = 0;
        let velY = 0;

        // --- 1. Joystick Controls (Mobile) ---
        // Priority 1: Use joystick if it exists and is being used
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
        // Priority 2: Use mouse-drag, but *only* on non-touch devices
        else if (this.input.activePointer.isDown && !this.sys.game.device.input.touch) {
            const touchX = this.input.activePointer.worldX;
            const touchY = this.input.activePointer.worldY;

            // Calculate direction
            const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, touchX, touchY);
            velX = Math.cos(angle) * PLAYER_SPEED;
            velY = Math.sin(angle) * PLAYER_SPEED;
            
        } 
        // --- 3. Keyboard Controls (PC) ---
        // Priority 3: Fallback to keyboard
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
        // We exclude the mouse-drag since it's already a direct vector
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
        const activeEnemies = this.enemies.getChildren().filter(e => e.active);
        if (activeEnemies.length === 0) return null;

        let nearestEnemy = null;
        let minDistance = Infinity;

        activeEnemies.forEach(enemy => {
            const distance = Phaser.Math.Distance.Between(
                this.player.x, this.player.y,
                enemy.x, enemy.y
            );
            if (distance < minDistance) {
                minDistance = distance;
                nearestEnemy = enemy;
            }
        });

        return nearestEnemy;
    }

    trackPlayer(enemy) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        enemy.setRotation(angle + Math.PI / 2); 

        this.physics.moveToObject(enemy, this.player, ENEMY_CHASE_SPEED);
    }
    
    // Wave Management
    spawnWave() {
        if (this.isGameOver) return;
        
        const mapWidth = 1600;
        const mapHeight = 1200;
        const playerX = this.player.x;
        const playerY = this.player.y;
        const spawnDistance = 500;
        
        for (let i = 0; i < 5; i++) {
            let x, y;

            do {
                x = Phaser.Math.Between(0, mapWidth);
                y = Phaser.Math.Between(0, mapHeight);
            } while (Phaser.Math.Distance.Between(x, y, playerX, playerY) < spawnDistance);

            const enemy = this.enemies.get(x, y);
            if (enemy) {
                // Set enemy scale to 1.5
                enemy.setActive(true).setVisible(true).setScale(1.5).setRotation(0);
                enemy.body.enable = true;
            }
        }
    }
    
    updateHealth(damage) {
        if (this.isGameOver) return;

        this.playerHealth -= damage;
        this.playerHealth = Math.max(0, this.playerHealth);
        
        this.onUpdate({ type: 'health', value: this.playerHealth }); 

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

        this.add.text(this.cameras.main.midPoint.x, this.cameras.main.midPoint.y, 'GAME OVER', { fontSize: '64px', fill: '#FF0000' })
            .setScrollFactor(0)
            .setOrigin(0.5)
            .setDepth(100);
    }
    
    setInvulnerable(player, duration) {
        player.invulnerable = true;
        
        const flashTween = this.tweens.add({
            targets: player,
            alpha: 0.3,
            ease: 'Power1',
            duration: 100,
            yoyo: true,
            repeat: -1, 
        });
        
        this.time.delayedCall(duration, () => {
            flashTween.stop();
            player.alpha = 1;
            player.invulnerable = false;
        });
    }

    hitPlayerByEnemy(player, enemy) {
        if (player.active && (player.invulnerable === undefined || !player.invulnerable)) {
            this.updateHealth(ENEMY_DAMAGE_BODY);
        }
    }

    hitEnemy(bullet, enemy) {
        // No more red particle explosion
        
        if (bullet.disableProjectile) {
            bullet.disableProjectile(); 
        } else {
            bullet.disableBody(true, true);
        }
        enemy.disableBody(true, true);
        
        const orb = this.expOrbs.get(enemy.x, enemy.y, 'exp_orb');
        if (orb) {
            // Scaled down stars
            orb.setActive(true).setVisible(true).setScale(0.3).setTint(0xFFFF00).setAlpha(1);
            orb.body.setCircle(8); 
            orb.body.enable = true;
            orb.body.moves = true;
            
            // Orb movement is now handled in the main update() loop for tracking
            
            // Despawn the orb after 5 seconds
            this.time.delayedCall(5000, () => {
                if(orb.active) orb.disableBody(true, true);
            });
        }
    }
    
    collectOrb(player, orb) {
        orb.disableBody(true, true); 
        
        // Score is now 1 point
        this.score += 1;
        this.onUpdate({ type: 'score', value: this.score });
    }
}

// --- REACT COMPONENT (Wrapper) ---

const BulletHellGame = ({ onUpdate, isPaused, onTogglePause }) => {
    const gameRef = useRef(null); 

    // Effect for creating and destroying the game
    useEffect(() => {
        const config = {
            type: Phaser.AUTO,
            // --- PORTRAIT CHANGE: Set 600x800 base resolution ---
            width: 600,
            height: 800,
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                parent: 'game-container',
            },
            parent: 'game-container',
            pixelArt: true,
            physics: {
                default: 'arcade',
                arcade: {
                    gravity: { y: 0 },
                    debug: false 
                }
            },
            // --- FIX: Change 'global' to 'scene' and add mapping ---
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
            onTogglePause: onTogglePause || (() => {})
        });

        return () => {
            game.destroy(true);
            gameRef.current = null;
        };
    }, [onUpdate, onTogglePause]);

    // Effect for handling the isPaused prop
    useEffect(() => {
        if (gameRef.current && gameRef.current.scene) {
            const scene = gameRef.current.scene.getScene('MainScene');
            if (scene && scene.handlePause) {
                scene.handlePause(isPaused);
            }
        }
    }, [isPaused]); 

    return <></>; 
};

export default BulletHellGame;