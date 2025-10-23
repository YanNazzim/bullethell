import React, { useState, useCallback } from 'react';
import './App.css';
import BulletHellGame from './BulletHellGame'; // Import the game component

function App() {
  // State for the orientation warning
  const [showOrientationWarning, setShowOrientationWarning] = useState(
    window.innerHeight > window.innerWidth
  );

  // State for pausing the game
  const [isPaused, setIsPaused] = useState(false);
  
  // --- NEW: Check for touch device ---
  const [isTouchDevice] = useState(
    () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
  );

  // --- FIX: Create a stable pause toggle function ---
  const togglePause = useCallback(() => {
    setIsPaused(p => !p);
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

  return (
    <div className="App">
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
              Start Game
            </button>
          </div>
        </div>
      )}

      <header className="App-header">
        <h1>Bullet Hell Survival</h1>
        {/* The Game Stats UI controlled by React State */}
        <div className="game-stats">
          <div>SCORE: {gameState.score}</div>
          <div className={gameState.health <= 2 ? 'game-stats-health-low' : ''}>
            HEALTH: {gameState.health} / 10
          </div>
          {/* Pause Button */}
          {!showOrientationWarning && (
            <button className="pause-button" onClick={togglePause}> {/* <-- Use stable function */}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>
      </header>
      
      {/* The Game Canvas Container */}
      <div id="game-container">
        {/* Game Over Overlay controlled by React */}
        {gameState.isGameOver && (
          <div className="game-over-overlay">
            <h2>GAME OVER</h2>
          </div>
        )}
        
        {/* Game only renders after warning is dismissed */}
        {!showOrientationWarning && (
          <BulletHellGame 
            onUpdate={handleGameUpdate} 
            isPaused={isPaused}
            onTogglePause={togglePause} // <-- Pass stable function
          />
        )}
      </div>

      {/* --- UPDATED: Controls Text --- */}
      <div className="controls-text">
        <p>
          <strong>
            {isTouchDevice ? 'Use Joystick' : 'Mouse/WASD/Arrows'}
          </strong>
          {' '}to move. Avoid the enemy ships!
        </p>
        <button 
          className="restart-button"
          onClick={() => window.location.reload()} // Simplest restart: reload the page
        >
          Restart Game
        </button>
      </div>
    </div>
  );
}

export default App;