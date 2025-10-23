import React, { useState, useCallback } from 'react';
import './App.css';
import BulletHellGame from './BulletHellGame'; // Import the game component

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

  // Game State to be displayed in the React UI
  const [gameState, setGameState] = useState({
    score: 0,
    health: 10,
    isGameOver: false,
  });

  // Handler to receive updates from the Phaser game
  const handleGameUpdate = useCallback((data) => {
    setGameState(prevState => {
      let newState = { ...prevState };
      switch (data.type) {
        case 'score':
          newState.score = data.value;
          break;
        case 'health':
          newState.health = data.value;
          break;
        case 'gameOver':
          newState.isGameOver = data.value;
          break;
        default:
          break;
      }
      return newState;
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