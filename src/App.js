import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';
import BulletHellGame from './BulletHellGame'; 

// Default player base speed used by initial game state
const PLAYER_BASE_SPEED = 200;

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
  
  // --- NEW: State to hold the choices from Phaser ---
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
    moveSpeed: PLAYER_BASE_SPEED, // Added
    weapons: [] // Added
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
            weapons: data.weapons // Get the new weapon list
          };
        default:
          return prevState;
      }
    });
  }, []);

  // --- UPDATED: Receives choices from Phaser ---
  const handleShowUpgrade = useCallback((choices) => {
    console.log("[App.js] handleShowUpgrade: Received choices from Phaser:", choices);
    setUpgradeChoices(choices); // <-- Set the choices
    setIsPaused(true);
    setShowUpgradeMenu(true);
  }, []); 

  // --- UPDATED: Passes the entire choice object back to Phaser ---
  const handleUpgradeChoice = (choice) => {
    console.log(`[App.js] handleUpgradeChoice: Chose:`, choice);
    if (gameInstanceRef.current && gameInstanceRef.current.game) {
      const scene = gameInstanceRef.current.game.scene.getScene('MainScene');
      if (scene) {
        scene.applyUpgrade(choice); // <-- Pass the object
      }
    }
    setShowUpgradeMenu(false);
    setIsPaused(false);
    setUpgradeChoices([]); // Clear choices
  };

  const handleRestart = () => {
    window.location.reload();
  };
  
  // --- NEW: Helper to find a specific weapon's stats ---
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
            {/* Add other weapons here as you get them */}
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

        {/* --- UPDATED: Upgrade Overlay --- */}
        {showUpgradeMenu && (
          <div className="upgrade-overlay">
            <h2>LEVEL UP!</h2>
            <p>Choose an Upgrade:</p>
            <div className="upgrade-choices">
              {/* Map over the choices from Phaser */}
              {upgradeChoices.map((choice) => (
                <UpgradeCard 
                  key={choice.key} 
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
          onShowUpgrade={handleShowUpgrade} // <-- This is now critical
        />
      </div>
    </div>
  );
}

export default App;