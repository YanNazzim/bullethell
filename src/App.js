import React, { useState, useCallback } from 'react';
import './App.css';
import BulletHellGame from './BulletHellGame'; // Import the game component

function App() {
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

  // This JSX is now cleaned up to remove inline styles
  // It relies entirely on App.css for styling
  return (
    <div className="App">
      <header className="App-header">
        <h1>Bullet Hell Survival</h1>
        {/* The Game Stats UI controlled by React State */}
        <div className="game-stats">
          <div>SCORE: {gameState.score}</div>
          <div className={gameState.health <= 2 ? 'game-stats-health-low' : ''}>
            HEALTH: {gameState.health} / 10
          </div>
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
        {/* Pass the game update handler to the Phaser component */}
        <BulletHellGame onUpdate={handleGameUpdate} />
      </div>

      {/* Example UI Element */}
      <div className="controls-text">
        <strong>WASD/Arrows</strong> to move. Avoid the red enemy bullets!
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