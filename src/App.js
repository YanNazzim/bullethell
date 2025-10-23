import React, { useState, useCallback, useRef } from 'react'; // --- NEW: Added useRef
import './App.css';
import BulletHellGame from './BulletHellGame'; 

function App() {
  // State for pausing the game
  const [isPaused, setIsPaused] = useState(false);
  // --- NEW: State for the pause menu visibility ---
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  // --- NEW: State for the upgrade menu ---
  const [showUpgradeMenu, setShowUpgradeMenu] = useState(false);
  
  // --- NEW: Ref to call functions on the Phaser instance ---
  const gameInstanceRef = useRef(null);

  const togglePause = useCallback(() => {
    // Cannot pause if the upgrade menu is open
    if (showUpgradeMenu) return; 

    setIsPaused(p => {
      const newPauseState = !p;
      setShowPauseMenu(newPauseState); 
      return newPauseState;
    });
  }, [showUpgradeMenu]); // Re-run if upgrade menu state changes

  const [gameState, setGameState] = useState({
    score: 0,
    health: 10,
    maxHealth: 10,
    isGameOver: false,
    level: 1,
    damage: 2, // Default damage
    attacksPerSecond: 2 // Default attacks per second
  });

  // This function is stable
  const handleGameUpdate = useCallback((data) => {
    setGameState(prevState => {
      switch (data.type) {
        case 'score':
          return { ...prevState, score: data.value };
        case 'health':
          // NEW: Now correctly receives 'max' from Phaser
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
            damage: data.damage,
            attacksPerSecond: parseFloat(data.attacksPerSecond.toFixed(1)) // Format to 1 decimal
          };
        default:
          return prevState;
      }
    });
  }, []);

  // --- NEW: This is called by Phaser when it's time to level up ---
  const handleShowUpgrade = useCallback(() => {
    console.log("[App.js] handleShowUpgrade: Received signal from Phaser.");
    setIsPaused(true); // Pause the game
    setShowUpgradeMenu(true); // Show the upgrade menu
  }, []);

  // --- NEW: This is called when the user clicks an upgrade button ---
  const handleUpgradeChoice = (upgradeType) => {
    console.log(`[App.js] handleUpgradeChoice: Chose '${upgradeType}'`);
    if (gameInstanceRef.current && gameInstanceRef.current.game) {
      // Find the running scene and call its 'applyUpgrade' function
      const scene = gameInstanceRef.current.game.scene.getScene('MainScene');
      if (scene) {
        scene.applyUpgrade(upgradeType);
      }
    }
    
    // Close menu and unpause game
    setShowUpgradeMenu(false);
    setIsPaused(false);
  };

  // --- NEW: Handle restart from pause menu ---
  const handleRestart = () => {
    window.location.reload();
  };

  return (
    <div className="App">
      <div className="game-ui-overlay">

        {/* --- STATS: Now correctly placed inside the overlay --- */}
        <div className="game-stats">
          <div>SCORE: {gameState.score}</div>
          {/* --- FIX: Uses gameState.maxHealth --- */}
          <div className={gameState.health <= (gameState.maxHealth * 0.2) ? 'game-stats-health-low' : ''}>
            HEALTH: {gameState.health} / {gameState.maxHealth}
          </div>
          {/* --- PAUSE ICON BUTTON --- */}
          <button className="pause-button" onClick={togglePause}>
            <div className="pause-icon" />
          </button>
        </div>

        {/* --- NEW: Player Stats Panel (Restored) --- */}
        <div className="player-stats">
          <div>Level: {gameState.level}</div>
          <div>Damage: {gameState.damage}</div>
          <div>Atk Spd: {gameState.attacksPerSecond}/s</div>
        </div>

        {/* --- NEW: Pause Menu Overlay --- */}
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

        {/* --- NEW: Upgrade Overlay (Restored) --- */}
        {showUpgradeMenu && (
          <div className="upgrade-overlay">
            <h2>LEVEL UP!</h2>
            <p>Choose an Upgrade:</p>
            <div className="upgrade-choices">
              <button 
                className="restart-button"
                onClick={() => handleUpgradeChoice('damage')}
              >
                Damage +0.5
              </button>
              <button 
                className="restart-button"
                onClick={() => handleUpgradeChoice('speed')}
              >
                Atk Speed +0.2
              </button>
              <button 
                className="restart-button"
                onClick={() => handleUpgradeChoice('health')}
              >
                Max Health +1
              </button>
            </div>
          </div>
        )}

        {/* --- Game Over Overlay controlled by React --- */}
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
          // --- NEW: Pass the ref and new callback ---
          ref={gameInstanceRef}
          onUpdate={handleGameUpdate} 
          isPaused={isPaused}
          onTogglePause={togglePause}
          onShowUpgrade={handleShowUpgrade} // <-- This was missing
        />
      </div>
    </div>
  );
}

export default App;