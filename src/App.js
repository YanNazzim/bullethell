import React, { useState, useCallback, useRef } from 'react';
import './App.css';
import BulletHellGame from './BulletHellGame'; 

function App() {
  // State for pausing the game
  const [isPaused, setIsPaused] = useState(false);
  // --- NEW: State for the pause menu visibility ---
  const [showPauseMenu, setShowPauseMenu] = useState(false);

  // --- Check for touch device to show/hide joystick help text (in future) ---
  // const [isTouchDevice] = useState(
  //   () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
  // );

  // --- NEW: Toggle for Pause Menu ---
  const togglePause = useCallback(() => {
    // When we toggle, we update both the game's pause state AND the menu's visibility
    setIsPaused(p => {
      const newPauseState = !p;
      setShowPauseMenu(newPauseState); // Show menu when paused, hide when unpaused
      return newPauseState;
    });
  }, []); // The empty array [] means it's created only once.

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

  // --- NEW: Handle restart from pause menu ---
  const handleRestart = () => {
    window.location.reload();
  };

  return (
    <div className="App">
      {/* This is the new UI layer. It sits on top of the game canvas.
        It's defined in your new App.css.
      */}
      <div className="game-ui-overlay">

        {/* --- STATS: Now correctly placed inside the overlay --- */}
        <div className="game-stats">
          <div>SCORE: {gameState.score}</div>
          <div className={gameState.health <= 2 ? 'game-stats-health-low' : ''}>
            HEALTH: {gameState.health} / 10
          </div>
          {/* --- PAUSE ICON BUTTON --- */}
          <button className="pause-button" onClick={togglePause}>
            <div className="pause-icon" />
          </button>
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
      

      {/* The Game Canvas Container. 
        It's now fullscreen as defined in your App.css 
      */}
      <div id="game-container">
        <BulletHellGame 
          onUpdate={handleGameUpdate} 
          isPaused={isPaused}
          onTogglePause={togglePause} // <-- Pass stable function
        />
      </div>

      {/* --- REMOVED: Old controls-text and restart button --- */}

    </div>
  );
}

export default App;