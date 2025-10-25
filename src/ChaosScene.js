// src/ChaosScene.js
import { BaseScene } from './WaveScene'; 
import Phaser from 'phaser';
import { 
    MAP_WIDTH, MAP_HEIGHT, MAX_CHAOS_ENEMIES, CHAOS_SPAWN_RATE_MS, 
    MAX_BOOMERANG_ENEMIES, WEAPON_DB 
} from './GameConstants';

// --- CHAOS SCENE (Continuous Gameplay) ---
export class ChaosScene extends BaseScene {
    constructor() {
        super('ChaosScene');
        this.level = 0; // Tracks player level (based on kill count)
        this.killsInCurrentLevel = 0;
        this.enemySpawnEvent = null;
        this.currentEnemyCount = 0;
    }

    create() {
        super.create();
        this.level = 1; 
        this.onUpdate({ type: 'newWave', value: this.level }); // Use 'level' for UI
        this.startChaosSpawn();
    }
    
    // Overrides BaseScene's sendFullStats to use 'level' instead of 'waveNumber'
    sendFullStats() {
        // Boss indicators are disabled in Chaos mode
        this.bossDirection = null;
        this.isBossActive = false;

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
        
        const elapsedTime = Date.now() - this.sessionStartTime;

        this.onUpdate({
            type: 'fullStats',
            waveNumber: this.level, // Send level for the UI display
            health: this.playerHealth, maxHealth: this.playerMaxHealth,
            moveSpeed: this.playerSpeed, weapons: weaponsForReact,
            playerBaseDamage: this.playerBaseDamage, critChance: this.playerCritChance,
            critDamage: this.playerCritDamage, bulletBounces: this.bulletBounces,
            score: this.score, elapsedTime: elapsedTime,
            isBossActive: this.isBossActive, bossDirection: this.bossDirection
        });
    }

    startChaosSpawn() {
        if (this.enemySpawnEvent) this.enemySpawnEvent.remove();

        // Spawn rate scales with level, min 200ms
        const spawnRate = Math.max(200, CHAOS_SPAWN_RATE_MS - (this.level * 20));

        this.enemySpawnEvent = this.time.addEvent({
            delay: spawnRate,
            callback: this.spawnChaosEnemy,
            callbackScope: this,
            loop: true
        });
    }

    spawnChaosEnemy() {
        if (this.isGameOver || this.physics.world.isPaused || this.currentEnemyCount >= MAX_CHAOS_ENEMIES) {
            return;
        }

        const mapWidth = MAP_WIDTH;
        const mapHeight = MAP_HEIGHT;
        const playerX = this.player.x;
        const playerY = this.player.y;
        const spawnDistance = 500;
        
        let x, y;
        do {
            x = Phaser.Math.Between(0, mapWidth);
            y = Phaser.Math.Between(0, mapHeight);
        } while (Phaser.Math.Distance.Between(x, y, playerX, playerY) < spawnDistance);
        
        // Enemy type selection based on level
        const level = this.level;
        let eliteChance = 0.05 + (level * 0.005);
        eliteChance = Math.min(0.35, eliteChance);

        let boomerangChance = 0.1 + (level * 0.002);
        boomerangChance = Math.min(0.25, boomerangChance);
        
        if (level >= 2 && Math.random() < boomerangChance && this.boomerangEnemiesCount < MAX_BOOMERANG_ENEMIES) {
            this.spawnBoomerangEnemy(x, y);
        }
        else if (level >= 5 && Math.random() < eliteChance) {
            this.spawnElite(x, y);
        }
        else {
            this.spawnRegularEnemy(x, y);
        }
        
        this.currentEnemyCount = this.enemies.getChildren().filter(e => e.active).length;
    }
    
    enterUpgradeState() {
        // FIX: TimerEvent objects use the '.paused' property, not a .pause() method.
        if (this.enemySpawnEvent) this.enemySpawnEvent.paused = true;
        
        const choices = this.generateUpgradeChoices();
        this.onShowUpgrade(choices);
        this.setInvulnerable(this.player, -1);
    }
    
    // Hooks from BaseScene
    modeUpdate() {
        // Keep current enemy count updated
        this.currentEnemyCount = this.enemies.getChildren().filter(e => e.active).length;
    }
    
    modeResumeAfterUpgrade() {
        this.level++;
        this.onUpdate({ type: 'newWave', value: this.level }); // Use 'level' for UI
        this.killsInCurrentLevel = 0;
        // The startChaosSpawn function will remove the paused event and create a new one.
        this.startChaosSpawn(); 
    }
    
    // Overrides BaseScene's onEnemyKilled for level-up logic
    onEnemyKilled(enemy) {
        if (this.isGameOver) return;
        
        if (!enemy.getData('isBoss')) {
            // BALANCE FIX: Score scaled by current level
            this.score += this.level;
            this.onUpdate({ type: 'score', value: this.score });
            
            this.killsInCurrentLevel++;
            
            // LEVEL UP FIX: Dynamic kill requirement (Level N needs N + 4 kills)
            const killsRequired = this.level + 4;
            if (this.killsInCurrentLevel >= killsRequired) {
                this.enterUpgradeState();
            }
        }
        
        this.currentEnemyCount = this.enemies.getChildren().filter(e => e.active).length;
    }
}