// src/GameConstants.js
export const PLAYER_BASE_SPEED = 200;
export const PLAYER_HEALTH = 10;
export const BULLET_SPEED = 600;

export const ENEMY_CHASE_SPEED = 150;
export const ENEMY_BASE_HEALTH = 3;
export const ENEMY_DAMAGE_BODY = 1;

export const ELITE_ENEMY_HEALTH = 25;
export const ELITE_ENEMY_SPEED = 140;
export const ELITE_ENEMY_DAMAGE = 3;

export const BOOMERANG_ENEMY_HEALTH = 12;
export const BOOMERANG_ENEMY_DAMAGE = 2;
export const BOOMERANG_ENEMY_CHASE_SPEED = 160;

export const BOSS_LEVEL_INTERVAL = 30;
export const BOSS_BASE_HEALTH = 150;
export const BOSS_DAMAGE = 5;
export const BOSS_SHOOT_RATE_MS = 1500;
export const BOSS_BULLET_SPEED = 500;

export const MAP_WIDTH = 3000;
export const MAP_HEIGHT = 3000;

export const MAX_CHAOS_ENEMIES = 150; // Max enemies for chaos mode
export const CHAOS_SPAWN_RATE_MS = 1000; // Initial spawn rate for chaos mode
// REMOVED: export const CHAOS_KILLS_TO_LEVEL = 5; 

export const MAX_BOOMERANG_ENEMIES = 3;

// --- STAT UPGRADE DATABASE ---
export const STAT_UPGRADE_DB = {
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
            scene.playerHealth = scene.playerMaxHealth;
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
    'playerDamage': {
        name: 'Base Damage',
        description: 'Increases all damage dealt by 1.',
        image: 'assets/base_dmg.png',
        apply: (scene) => {
            scene.playerBaseDamage += 1;
        }
    },
    'critChance': {
        name: 'Crit Chance',
        description: 'Gain 5% chance to deal critical damage.',
        image: 'assets/icon_crit_chance.png',
        maxLevel: 20,
        apply: (scene) => {
            scene.playerCritChance = Math.min(1.0, scene.playerCritChance + 0.05);
        }
    },
    'critDamage': {
        name: 'Crit Damage',
        description: 'Increases critical damage multiplier by 50%.',
        image: 'assets/icon_crit_dmg.png',
        apply: (scene) => {
            scene.playerCritDamage += 0.5;
        }
    },
    'bulletBounce': {
        name: 'Bullet Bounce',
        description: 'Your bullets bounce to 1 additional enemy.',
        image: 'assets/icon_bullet_bounce.png',
        apply: (scene) => {
            scene.bulletBounces += 1;
        }
    }
};

// --- WEAPON DATABASE ---
export const WEAPON_DB = {
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
            scene.playerWeaponDamage = weaponState.damage;
        }
    },
    'electricBolt': {
        name: 'Electric Bolt',
        description: 'Zaps nearby enemies. Upgrades reduce cooldown.',
        image: 'assets/icon_bolt.png',
        maxLevel: 8,
        acquire: (scene, weaponState) => {
            weaponState.delay = 1000;
            weaponState.atkSpeed = 1000 / weaponState.delay;
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
            weaponState.atkSpeed = 1000 / weaponState.delay;
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
            const circle = new scene.Phaser.Geom.Circle(scene.player.x, scene.player.y, weaponState.radius);
            scene.Phaser.Actions.PlaceOnCircle(
                scene.shieldOrbs.getChildren(),
                circle,
                weaponState.angle
            );

            scene.shieldOrbs.getChildren().forEach(orb => {
                orb.body.reset(orb.x, orb.y);
                orb.body.setVelocity(0);
            });
        }
    }
};