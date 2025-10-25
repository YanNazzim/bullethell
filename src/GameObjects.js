// src/GameObjects.js
import Phaser from 'phaser';

// Import constants that the classes use
import { 
    BULLET_SPEED, 
    BOSS_BULLET_SPEED,
} from './GameConstants';


// --- Projectile Class ---
export class Projectile extends Phaser.Physics.Arcade.Image {
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
        this.setData('isBossBullet', false);
        this.setData('damage', 0);
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
        const scale = isBossBullet ? 0.2 : 0.04;
        const tint = isBossBullet ? 0xcc00cc : 0xffffff;

        this.setTexture(isBossBullet ? 'bullet' : 'bullet');
        this.setActive(true).setVisible(true).setScale(scale).setTint(tint);
        this.body.setCircle(500);

        this.setData('isBossBullet', isBossBullet);
        this.setData('damage', isBossBullet ? damage : 0);
        this.bouncesLeft = isBossBullet ? 0 : this.scene.bulletBounces;
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

// --- Enemy Class ---
export class Enemy extends Phaser.Physics.Arcade.Image {
    constructor(scene, x, y, texture) {
        super(scene, x, y, texture);

        this.healthBar = scene.add.graphics();
        this.armorBar = scene.add.graphics();
        this.healthBar.setDepth(8);
        this.armorBar.setDepth(8);
    }

    spawn(x, y, key, scale, health, speed, damage, isElite, isBoss = false) {
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
        this.setData('isBoss', isBoss);

        const maxArmor = isElite ? Math.floor(health * 0.5) : 0;
        this.setData('armor', maxArmor);
        this.setData('maxArmor', maxArmor);

        this.setData('isBoomerang', key === 'boomerang_enemy');
        this.setData('angle', 0);

        if (isBoss) {
            this.setTint(0xcc00cc);
            this.body.setCircle(400).setOffset(400, 400);
            this.setImmovable(true);
        } else if (isElite) {
            this.setTint(0xff0000);
            this.body.setCircle(250).setOffset(250, 250);
        } else if (this.data.get('isBoomerang')) {
            this.setTint(0xffaa00);
            this.body.setCircle(250).setOffset(250, 250);
        } else {
            this.body.setCircle(250).setOffset(250,250);
            this.clearTint();
        }

        this.drawHealthBar();
        this.healthBar.setVisible(true);
        this.armorBar.setVisible(isElite || isBoss);
    }

    takeDamage(amount, isCrit = false) {
        if (!this.active) return [false, 0];

        let damageTaken = 0;
        let remainingDamage = amount;
        let newHealth = this.getData('health');
        let newArmor = this.getData('armor');

        if ((this.getData('isElite') || this.getData('isBoss')) && newArmor > 0) {
            const damageToArmor = Math.min(remainingDamage, newArmor);
            newArmor -= damageToArmor;
            remainingDamage -= damageToArmor;
            this.setData('armor', newArmor);
            damageTaken += damageToArmor;
        }

        if (remainingDamage > 0) {
            const damageToHealth = Math.min(remainingDamage, newHealth);
            newHealth = newHealth - damageToHealth;
            this.setData('health', newHealth);
            damageTaken += damageToHealth;
        }

        if (newHealth <= 0) {
            this.kill();
            return [true, damageTaken];
        }

        this.setTint(isCrit ? 0xffaa00 : 0xffffff);

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

        this.drawHealthBar();

        return [false, damageTaken];
    }

    drawHealthBar() {
        this.healthBar.clear();
        this.armorBar.clear();
        if (!this.active) return;

        const pHealth = this.getData('health') / this.getData('maxHealth');
        const pArmor = this.getData('maxArmor') > 0 ? this.getData('armor') / this.getData('maxArmor') : 0;

        const w = (this.width * this.scaleX);
        const h = 8;

        const offsetX = -w / 2;
        const offsetYHealth = -(this.height * this.scaleY) / 2 - (h * 1);
        const offsetYArmor = offsetYHealth - h - 2;

        this.healthBar.fillStyle(0x333333).fillRect(offsetX, offsetYHealth, w, h);
        this.healthBar.fillStyle(pHealth < 0.3 ? 0xff0000 : 0x00ff00).fillRect(offsetX, offsetYHealth, w * pHealth, h);

        if (this.getData('isElite') || this.getData('isBoss')) {
             this.armorBar.fillStyle(0x333333).fillRect(offsetX, offsetYArmor, w, h);
             this.armorBar.fillStyle(0x61dafb).fillRect(offsetX, offsetYArmor, w * pArmor, h);
             this.armorBar.setVisible(true);
        } else {
            this.armorBar.setVisible(false);
        }
    }

    update() {
        if (!this.active) return;
        this.healthBar.setPosition(this.x, this.y);
        this.armorBar.setPosition(this.x, this.y);
        if (this.data.get('isBoss')) {
             this.setRotation(this.rotation + 0.005);
        }
    }

    kill() {
        this.healthBar.clear();
        this.armorBar.clear();
        this.healthBar.setVisible(false);
        this.armorBar.setVisible(false);

        if (this.data.get('isBoomerang')) {
            this.scene.boomerangEnemiesCount = Math.max(0, this.scene.boomerangEnemiesCount - 1);
        }

        if (this.data.get('isBoss')) {
            this.scene.isBossActive = false;
            if (this.scene.bossShootEvent) {
                this.scene.bossShootEvent.remove();
                this.scene.bossShootEvent = null;
            }
            this.scene.boss = null;
        }

        this.disableBody(true, true);
        this.scene.onEnemyKilled(this);
    }
}