import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';
import BulletHellGame from './BulletHellGame'; 

// Default player base speed used by initial game state
const PLAYER_BASE_SPEED = 150; // --- MATCHED PHASER CONSTANT ---

// --- NEW: Upgrade Card Component ---
// This makes the UI code cleaner
function UpgradeCard({ choice, onSelect }) {
  return (
    <button className="upgrade-card" onClick={() => onSelect(choice)}>
      <h3>{choice.name}</h3>
      <img 
        src={choice.image} 
        alt={choice.name} 
        onError={(e) => { 
          // Fallback if the image is missing
          e.target.style.display = 'none'; 
          e.target.nextSibling.style.display = 'block';
        }}
      />
      {/* Fallback text */}
      <div className="img-fallback" style={{display: 'none', padding: '32px 0'}}>[IMG]</div>
      
      <p>{choice.description}</p>
      
      {choice.level !== 'N/A' && (
        <span className="level-badge">
          {choice.type === 'weapon_new' ? 'New!' : `Lv. ${choice.level}`}
        </span>
      )}
    </button>
  );
}


function App() {
  const [isPaused, setIsPaused] = useState(false);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [showUpgradeMenu, setShowUpgradeMenu] = useState(false);
  
  const [upgradeChoices, setUpgradeChoices] = useState([]);
  
  const showUpgradeMenuRef = useRef(false);
  
  useEffect(() => {
    showUpgradeMenuRef.current = showUpgradeMenu;
  }, [showUpgradeMenu]);
  
  const gameInstanceRef = useRef(null);

  const togglePause = useCallback(() => {
    if (showUpgradeMenuRef.current) return; 
    setIsPaused(p => {
      const newPauseState = !p;
      setShowPauseMenu(newPauseState); 
      return newPauseState;
    });
  }, []);

  // --- UPDATED: Game State with new stats ---
  const [gameState, setGameState] = useState({
    score: 0,
    health: 10,
    maxHealth: 10,
    isGameOver: false,
    level: 1,
    moveSpeed: PLAYER_BASE_SPEED,
    weapons: [],
    // --- NEW STATS ---
    playerBaseDamage: 0,
    critChance: 0,
    critDamage: 1.5,
    bulletBounces: 0
  });

  const handleGameUpdate = useCallback((data) => {
    setGameState(prevState => {
      switch (data.type) {
        case 'score':
          return { ...prevState, score: data.value };
        case 'health':
          return { ...prevState, health: data.value, max: data.max };
        case 'gameOver':
          return { ...prevState, isGameOver: data.value };
        case 'fullStats':
          // This updates ALL stats at once from Phaser
          return {
            ...prevState,
            level: data.level,
            health: data.health,
            maxHealth: data.maxHealth,
            moveSpeed: data.moveSpeed,
            weapons: data.weapons,
            // --- NEW STATS ---
            playerBaseDamage: data.playerBaseDamage,
            critChance: data.critChance,
            critDamage: data.critDamage,
            bulletBounces: data.bulletBounces
          };
        default:
          return prevState;
      }
    });
  }, []);

  const handleShowUpgrade = useCallback((choices) => {
    console.log("[App.js] handleShowUpgrade: Received choices from Phaser:", choices);
    setUpgradeChoices(choices); 
    setIsPaused(true);
    setShowUpgradeMenu(true);
  }, []); 

  const handleUpgradeChoice = (choice) => {
    console.log(`[App.js] handleUpgradeChoice: Chose:`, choice);
    if (gameInstanceRef.current && gameInstanceRef.current.game) {
      const scene = gameInstanceRef.current.game.scene.getScene('MainScene');
      if (scene) {
        scene.applyUpgrade(choice); 
      }
    }
    setShowUpgradeMenu(false);
    setIsPaused(false);
    setUpgradeChoices([]); 
  };

  const handleRestart = () => {
    window.location.reload();
  };
  
  const getWeaponStat = (key) => {
    return gameState.weapons.find(w => w.key === key);
  }
  
  const autoBullet = getWeaponStat('autoBullet');
  const electricBolt = getWeaponStat('electricBolt');

  return (
    <div className="App">
      <div className="game-ui-overlay">

        <div className="game-stats">
          <div>SCORE: {gameState.score}</div>
          <div className={gameState.health <= (gameState.maxHealth * 0.2) ? 'game-stats-health-low' : ''}>
            HEALTH: {gameState.health} / {gameState.maxHealth}
          </div>
          <button className="pause-button" onClick={togglePause}>
            <div className="pause-icon" />
          </button>
        </div>

        {/* --- UPDATED: Player Stats Panel --- */}
        <div className="player-stats">
          <div>Level: {gameState.level}</div>
          <div>Move Spd: {gameState.moveSpeed}</div>
          
          {/* --- NEW: General Stats --- */}
          {gameState.playerBaseDamage > 0 && (
            <div style={{color: '#ff8888'}}>
              Dmg: +{gameState.playerBaseDamage}
            </div>
          )}
          {gameState.critChance > 0 && (
            <div style={{color: '#ffaa00'}}>
              Crit: {(gameState.critChance * 100).toFixed(0)}%
            </div>
          )}
          {/* Show crit damage only if crit chance exists */}
          {gameState.critChance > 0 && (
            <div style={{color: '#ffaa00'}}>
              CritDmg: {(gameState.critDamage * 100).toFixed(0)}%
            </div>
          )}
          {gameState.bulletBounces > 0 && (
            <div style={{color: '#aaaaff'}}>
              Bounce: +{gameState.bulletBounces}
            </div>
          )}
          
          <div className="weapon-stats-list">
            {/* Show stats for all acquired weapons */}
            {autoBullet && (
              <div style={{color: '#FFFFFF'}}>
                Bullet Dmg: {autoBullet.damage}
              </div>
            )}
            {autoBullet && (
              <div style={{color: '#FFFFFF'}}>
                Bullet Spd: {autoBullet.atkSpeed.toFixed(1)}/s
              </div>
            )}
            {electricBolt && (
              <div style={{color: '#61dafb'}}>
                Zap Spd: {electricBolt.atkSpeed.toFixed(2)}/s
              </div>
            )}
            {getWeaponStat('shield') && (
              <div style={{color: '#00aaff'}}>
                Shield: {getWeaponStat('shield').count} Orb(s)
              </div>
            )}
          </div>
        </div>

        {showPauseMenu && (
          <div className="pause-menu-overlay">
            <h2>PAUSED</h2>
            <button className="restart-button" onClick={togglePause}>
              Continue
            </button>
            <button 
              className="restart-button"
              onClick={handleRestart}
            >
              Restart Game
            </button>
          </div>
        )}

        {showUpgradeMenu && (
          <div className="upgrade-overlay">
            <h2>LEVEL UP!</h2>
            <p>Choose an Upgrade:</p>
            <div className="upgrade-choices">
              {upgradeChoices.map((choice, index) => (
                <UpgradeCard 
                  key={choice.key + index} // Use index in key to prevent rare duplicates
                  choice={choice} 
                  onSelect={handleUpgradeChoice}
                />
              ))}
            </div>
          </div>
        )}

        {gameState.isGameOver && (
          <div className="game-over-overlay">
            <h2>GAME OVER</h2>
            <button 
              className="restart-button"
              onClick={handleRestart}
            >
              Restart Game
            </button>
          </div>
        )}

      </div> {/* End of game-ui-overlay */}
      

      <div id="game-container">
        <BulletHellGame 
          ref={gameInstanceRef}
          onUpdate={handleGameUpdate} 
          isPaused={isPaused}
          onTogglePause={togglePause}
          onShowUpgrade={handleShowUpgrade} 
        />
      </div>
    </div>
  );
}

export default App;