import React, { useState, useCallback, useRef } from 'react';
import './App.css';
import BulletHellGame from './BulletHellGame'; 

function App() {
  const [showOrientationWarning, setShowOrientationWarning] = useState(
    window.innerHeight > window.innerWidth
  );
  const [isPaused, setIsPaused] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  
  const [showUpgradeScreen, setShowUpgradeScreen] = useState(false);
  
  // This ref will now hold an object like { game: ... }
  const gameInstanceRef = useRef(null); 

  // This function is stable and will not cause re-renders
  const togglePause = useCallback(() => {
    setIsPaused(p => !p); 
  }, []); 

  const [gameState, setGameState] = useState({
    score: 0,
    health: 10,
    maxHealth: 10,
    isGameOver: false,
    level: 1,
    damage: 0,
    attacksPerSecond: 0 
  });

  // This function is stable
  const handleGameUpdate = useCallback((data) => {
    if (data.type === 'fullStats') {
        console.log("[App.js] handleGameUpdate: Received 'fullStats'", data);
    }

    setGameState(prevState => {
      switch (data.type) {
        case 'score':
          return { ...prevState, score: data.value };
        case 'health':
          return { ...prevState, health: data.value, maxHealth: data.max };
        case 'gameOver':
          return { ...prevState, isGameOver: data.value };
        case 'fullStats':
          return {
            ...prevState,
            level: data.level,
            health: data.health,
            maxHealth: data.maxHealth,
            damage: data.damage,
            attacksPerSecond: data.attacksPerSecond
          };
        default:
          return prevState;
      }
    });
  }, []);

  // This function is stable
  const handleShowUpgrade = useCallback(() => {
    console.log("[App.js] handleShowUpgrade: Pausing game and showing upgrade screen.");
    setShowUpgradeScreen(true);
    setIsPaused(true); // Pause the game
  }, []);

  // --- THIS IS THE FIX ---
  // This function now uses the new .game property
  const handleUpgradeChoice = useCallback((type) => {
    console.log(`[App.js] handleUpgradeChoice: Chose '${type}'`);

    // --- REF BUG FIX: Access .game property ---
    if (gameInstanceRef.current && gameInstanceRef.current.game) { 
        console.log("[App.js] gameInstanceRef is VALID. Calling getScene...");
        
        // --- NEW WAY TO CALL ---
        const scene = gameInstanceRef.current.game.scene.getScene('MainScene'); 
        
      if (scene && scene.applyUpgrade) {
        console.log("[App.js] Scene found! Calling applyUpgrade...");
        scene.applyUpgrade(type);
      } else {
        console.error("[App.js] Error: Scene or applyUpgrade function not found!");
      }
    } else {
        console.error("[App.js] Error: gameInstanceRef.current or .game is null! Cannot call applyUpgrade.");
    }
    
    setShowUpgradeScreen(false);
    setIsPaused(false); // Unpause the game
  }, []); // This is also stable

  return (
    <div className="App">
      
      <div id="game-container">
        {!showOrientationWarning && isGameStarted && (
          <BulletHellGame 
            ref={gameInstanceRef} // This ref connects to the component
            onUpdate={handleGameUpdate} 
            isPaused={isPaused}
            onTogglePause={togglePause} // This prop is stable
            onShowUpgrade={handleShowUpgrade} // This prop is stable
          />
        )}
      </div>

      {/* Orientation Warning Overlay */}
      {showOrientationWarning && (
        <div className="orientation-overlay">
          <div className="orientation-message">
            <h2>Rotate Your Device</h2>
            <p>For the best experience, please rotate your device to landscape mode.</p>
            <button 
              className="restart-button" 
              onClick={() => setShowOrientationWarning(false)}
            >
              I Understand
            </button>
          </div>
        </div>
      )}

      {/* Start Menu Overlay */}
      {!showOrientationWarning && !isGameStarted && (
        <div className="start-menu-overlay">
          <h1>Bullet Hell Survival</h1>
          <p><strong>Touch</strong> or <strong>WASD/Arrows</strong> to move. Avoid the enemy ships!</p>
          <button 
            className="restart-button"
            onClick={() => setIsGameStarted(true)} 
          >
            Start Game
          </button>
        </div>
      )}

      {/* In-Game UI */}
      {!showOrientationWarning && isGameStarted && (
        <div className="game-ui-overlay">
          
          <div className="game-stats">
            <div>LEVEL: {gameState.level}</div>
            <div>SCORE: {gameState.score}</div>
            <div className={gameState.health <= (gameState.maxHealth * 0.2) ? 'game-stats-health-low' : ''}>
              HEALTH: {gameState.health} / {gameState.maxHealth}
            </div>
            <button 
              className="pause-button" 
              onClick={() => {
                if (!showUpgradeScreen) togglePause();
              }}
            >
              {isPaused ? (showUpgradeScreen ? 'UPGRADING' : 'Resume') : 'Pause'}
            </button>
          </div>

          <div className="player-stats">
            <div>Damage: {gameState.damage.toFixed(1)}</div>
            <div>
              Atk Speed: {gameState.attacksPerSecond.toFixed(2)}/s
            </div>
            <div>Max HP: {gameState.maxHealth}</div>
          </div>
          
          <div className="controls-text">
            <button 
              className="restart-button"
              onClick={() => window.location.reload()}
            >
              Restart Game
            </button>
          </div>

          {/* Game Over Overlay */}
          {gameState.isGameOver && (
            <div className="game-over-overlay">
              <h2>GAME OVER</h2>
            </div>
          )}

          {/* Upgrade Screen Overlay */}
          {showUpgradeScreen && (
            <div className="upgrade-overlay">
              <h2>LEVEL UP!</h2>
              <p>Choose an upgrade:</p>
              <div className="upgrade-choices">
                <button className="restart-button" onClick={() => handleUpgradeChoice('damage')}>More Damage (+0.5)</button>
                <button className="restart-button" onClick={() => handleUpgradeChoice('speed')}>Faster Attack (+0.2)</button>
                <button className="restart-button" onClick={() => handleUpgradeChoice('health')}>More Health (+1)</button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default App;