import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js'
import './App.css';
import BulletHellGame from './BulletHellGame'; 

const supabaseUrl = 'https://jzfbvddkrzfibfdgyhdy.supabase.co'

// --- DEBUG CHECK: No need to log key to console anymore as it's working ---
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY 
const supabase = createClient(supabaseUrl, supabaseKey)
// --- END SUPABASE SETUP ---

// Default player base speed used by initial game state
const PLAYER_BASE_SPEED = 150; 

// --- MainMenu Component (No change) ---
function MainMenu({ highScores, onStartGame, onViewLeaderboard }) {
  return (
    <div className="main-menu-overlay">
      <h1>SPACE BULLET HELL</h1>
      <div className="menu-leaderboard-container">
        <h3>Top 5 High Scores</h3>
        <table className="score-table small-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {highScores.slice(0, 5).map((score, index) => (
              <tr key={index}>
                <td>{index + 1}</td>
                <td>{score.name}</td>
                <td>{score.score}</td>
              </tr>
            ))}
            {/* Fill remaining rows if less than 5 scores */}
            {Array.from({ length: 5 - highScores.length }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td>{highScores.length + 1 + index}</td>
                <td>---</td>
                <td>---</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="menu-buttons">
        <button 
          className="restart-button"
          onClick={onStartGame}
        >
          Play Game
        </button>
        <button 
          className="restart-button options-button"
          onClick={() => alert("Options are not implemented yet! (Soon!)")}
        >
          Options
        </button>
      </div>
    </div>
  );
}


// --- Upgrade Card Component (No change) ---
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
  // --- NEW STATE: Tracks current screen ('menu', 'playing', 'leaderboard') ---
  const [gameStatus, setGameStatus] = useState('menu'); 
  
  const [isPaused, setIsPaused] = useState(false);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [showUpgradeMenu, setShowUpgradeMenu] = useState(false);
  
  // --- NEW STATES FOR SCOREBOARD ---
  const [highScores, setHighScores] = useState([]);
  const [playerName, setPlayerName] = useState('');
  const [finalScore, setFinalScore] = useState(0); 
  // --- END NEW STATES ---
  
  const [upgradeChoices, setUpgradeChoices] = useState([]);
  
  const showUpgradeMenuRef = useRef(false);
  
  const gameInstanceRef = useRef(null);
  
  // --- NEW BOSS UI STATE ---
  const [isBossActive, setIsBossActive] = useState(false);
  const [bossDirection, setBossDirection] = useState(null); // Angle in degrees, or null if on screen
  // --- NEW: Controls the visibility of the "BOSS ROUND!" text and pulse effect
  const [showBossIndicator, setShowBossIndicator] = useState(false); 
  // --- END NEW BOSS UI STATE ---
  
  useEffect(() => {
    showUpgradeMenuRef.current = showUpgradeMenu;
  }, [showUpgradeMenu]);
  
  // --- NEW useEffect for Boss Indicator Timer ---
  useEffect(() => {
    if (isBossActive) {
      // Show the full indicator when the boss first spawns
      setShowBossIndicator(true);
      
      // Set a timer to hide the full indicator after 5 seconds (leaving only the arrow if needed)
      const timer = setTimeout(() => {
        setShowBossIndicator(false);
      }, 5000); 
      
      // If isBossActive becomes false (boss killed), clean up the timer immediately
      return () => clearTimeout(timer); 
    } else {
      setShowBossIndicator(false); // Ensure it's hidden if boss is defeated/inactive
    }
  }, [isBossActive]);
  // --- END NEW useEffect ---


  const togglePause = useCallback(() => {
    // Only allow pause if currently playing
    if (gameStatus !== 'playing') return;
    if (showUpgradeMenuRef.current) return; 
    setIsPaused(p => {
      const newPauseState = !p;
      setShowPauseMenu(newPauseState); 
      return newPauseState;
    });
  }, [gameStatus]);

  const [gameState, setGameState] = useState({
    score: 0,
    health: 10,
    maxHealth: 10,
    isGameOver: false,
    level: 1,
    moveSpeed: PLAYER_BASE_SPEED,
    weapons: [],
    playerBaseDamage: 0,
    critChance: 0,
    critDamage: 1.5,
    bulletBounces: 0
    // isBossActive and bossDirection managed separately for clearer UI rendering logic
  });

  const handleGameUpdate = useCallback((data) => {
    setGameState(prevState => {
      switch (data.type) {
        case 'score':
          return { ...prevState, score: data.value };
        case 'health':
          return { ...prevState, health: data.value, maxHealth: data.max || prevState.maxHealth };
        case 'gameOver':
          return { ...prevState, isGameOver: data.value };
        case 'fullStats':
          // --- UPDATED: Handle new boss stats ---
          setIsBossActive(data.isBossActive);
          setBossDirection(data.bossDirection);
          // --- END UPDATED ---
          return {
            ...prevState,
            level: data.level,
            health: data.health,
            maxHealth: data.maxHealth,
            moveSpeed: data.moveSpeed,
            weapons: data.weapons,
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
  
  const handleGameOverSubmit = useCallback((score) => {
      setFinalScore(score);
      // When game is over and submission is possible, implicitly show the form by updating state
      // setGameStatus is handled implicitly by gameState.isGameOver being true
  }, []);
  
  // --- MODIFIED: Supabase API Logic (fetchLeaderboard) ---
  // Now fetching 10 scores to show on Leaderboard screen, and 5 for the menu
  const fetchLeaderboard = useCallback(async () => {
      try {
          // Fetch up to 10 scores
          let { data, error } = await supabase
              .from('high_scores')
              .select('name, score')
              .order('score', { ascending: false })
              .limit(10);
              
          if (error) throw error;
          
          setHighScores(data);
      } catch (error) {
          console.error("Leaderboard Fetch Error:", error.message);
          setHighScores([
             { name: 'SUPABASE_ERROR', score: 1000 },
             { name: 'CHECK_CONSOLE', score: 500 }
          ]);
      }
  }, []);
  
  // --- NEW: Fetch leaderboard on component mount for the menu ---
  useEffect(() => {
      fetchLeaderboard();
  }, [fetchLeaderboard]);
  
  // --- MODIFIED: Submit Score ---
  const submitScore = useCallback(async (e) => {
      e.preventDefault();
      
      const dataToInsert = {
          name: playerName || 'Player', 
          score: finalScore,
      };
      
      try {
          const { error } = await supabase
              .from('high_scores')
              .insert([dataToInsert]);

          if (error) throw error;
          
          alert(`Score of ${finalScore} submitted!`);
          
      } catch (error) {
          console.error("Submission Error:", error.message);
          alert(`Submission failed: ${error.message}. Score: ${finalScore}`);
      }
      
      setPlayerName(''); 
      // After submission, change status to show the full leaderboard and refresh scores
      setGameStatus('leaderboard'); 
      fetchLeaderboard();
  }, [playerName, finalScore, fetchLeaderboard]);
  // --- END MODIFIED API Logic ---
  

  const handleShowUpgrade = useCallback((choices) => {
    console.log("[App.js] handleShowUpgrade: Received choices from Phaser:", choices);
    setUpgradeChoices(choices); 
    setIsPaused(true);
    setShowPauseMenu(false); // Ensure pause menu is hidden
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
    // Reset all game state and go back to menu to allow a fresh start
    setGameState({
      score: 0, health: 10, maxHealth: 10, isGameOver: false, level: 1, moveSpeed: PLAYER_BASE_SPEED, 
      weapons: [], playerBaseDamage: 0, critChance: 0, critDamage: 1.5, bulletBounces: 0
    });
    setIsPaused(false);
    setShowPauseMenu(false);
    setFinalScore(0);
    
    // --- NEW: Reset boss state on restart ---
    setIsBossActive(false); 
    setBossDirection(null);
    setShowBossIndicator(false);
    
    setGameStatus('menu'); 
    fetchLeaderboard(); // Refresh menu leaderboard
    
    // Force a full window reload to reset the Phaser canvas and game state completely
    window.location.reload(); 
  };
  
  const handleStartGame = () => {
    setGameStatus('playing');
    // Phaser game instance should start automatically because BulletHellGame component is rendered
  }
  
  const handleViewLeaderboard = () => {
      // Game Over -> Score Submission -> View Leaderboard Button
      setGameStatus('leaderboard');
  }
  
  const getWeaponStat = (key) => {
    return gameState.weapons.find(w => w.key === key);
  }
  
  const autoBullet = getWeaponStat('autoBullet');
  const electricBolt = getWeaponStat('electricBolt');

  const isHealthLow = gameState.health <= (gameState.maxHealth * 0.2);

  const showScoreSubmission = gameState.isGameOver && finalScore > 0 && gameStatus !== 'leaderboard';
  const showLeaderboardScreen = gameStatus === 'leaderboard';
  
  // Decide which screen to render
  const renderScreen = () => {
      if (gameStatus === 'menu') {
          return (
            <MainMenu
              highScores={highScores}
              onStartGame={handleStartGame}
            />
          );
      }
      
      // Logic for rendering the BOSS UI
      const shouldShowBossUI = isBossActive && (showBossIndicator || bossDirection !== null);
      const bossIndicatorClass = showBossIndicator ? "" : "arrow-only";
      
      return (
        <>
            {/* Game UI and Overlays are only shown if not in the menu */}
            <div className="game-ui-overlay">
        
              <div className="game-stats">
                <div>SCORE: {gameState.score}</div>
                
                <div className={`player-health-bar-container ${isHealthLow ? 'health-low' : ''}`}>
                  <span className="health-number">HP {gameState.health}</span>
                  <div className="health-bar-wrapper">
                    <div 
                      className="health-bar-fill" 
                      style={{
                        width: `${(gameState.health / gameState.maxHealth) * 100}%`,
                      }}
                    ></div>
                  </div>
                  <span className="health-max">/ {gameState.maxHealth}</span>
                </div>
                
                <button className="pause-button" onClick={togglePause}>
                  <div className="pause-icon" />
                </button>
              </div>
        
              <div className="player-stats">
                <div>Level: {gameState.level}</div>
                <div>Move Spd: {gameState.moveSpeed}</div>
                
                {gameState.playerBaseDamage > 0 && (
                  <div style={{color: '#ff8888'}}>
                    Dmg: +{gameState.playerBaseDamage}
                  </div>
                )}
                {/* Critical Chance Stat Display */}
                {gameState.critChance > 0 && (
                  <div style={{color: '#ffaa00'}}>
                    Crit: {(gameState.critChance * 100).toFixed(0)}%
                  </div>
                )}
                {/* Critical Damage Stat Display */}
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
        
              {/* --- NEW: BOSS UI INDICATOR --- */}
              {shouldShowBossUI && (
                  <div className={`boss-round-indicator ${bossIndicatorClass}`}>
                      {/* Show BOSS ROUND! text ONLY during the 5 second splash */}
                      {showBossIndicator && <span>BOSS ROUND!</span>}
                      
                      {/* Show arrow if boss is active AND off-screen (bossDirection is set) */}
                      {isBossActive && bossDirection !== null && (
                          <div 
                              className="boss-direction-arrow-container"
                              style={{ transform: `rotate(${bossDirection}deg)` }}
                          >
                            <div className="boss-direction-arrow"></div> 
                          </div>
                      )}
                  </div>
              )}
              {/* --- END NEW --- */}
        
              {showPauseMenu && (
                <div className="pause-menu-overlay">
                  <h2>PAUSED</h2>
                  <button className="restart-button" onClick={togglePause}>
                    Continue
                  </button>
                  <button 
                    className="restart-button-pause"
                    onClick={handleRestart}
                  >
                    Main Menu
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
                        key={choice.key + index} 
                        choice={choice} 
                        onSelect={handleUpgradeChoice}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* --- Score Submission Form --- */}
              {showScoreSubmission && (
                <div className="game-over-overlay">
                  <h2>GAME OVER</h2>
                  <p className="final-score-text">FINAL SCORE: {finalScore}</p>
                  
                  <form className="score-submission-form" onSubmit={submitScore}>
                      <input 
                          type="text" 
                          placeholder="Enter your name" 
                          value={playerName} 
                          onChange={(e) => setPlayerName(e.target.value.substring(0, 15))} 
                          maxLength={15}
                          required
                      />
                      <button type="submit" className="restart-button">
                          Submit Score
                      </button>
                  </form>
                  
                  <button 
                    className="restart-button leaderboard-button"
                    onClick={handleViewLeaderboard}
                    style={{marginTop: '20px'}}
                  >
                    View Leaderboard
                  </button>
                  
                  <button 
                    className="restart-button"
                    onClick={handleRestart}
                    style={{marginTop: '10px'}}
                  >
                    Main Menu
                  </button>
                </div>
              )}
              
              {/* --- Leaderboard Overlay --- */}
              {showLeaderboardScreen && (
                 <div className="leaderboard-overlay">
                   <h2>HIGH SCORES </h2>
                   
                   <table className="score-table">
                     <thead>
                       <tr>
                         <th>#</th>
                         <th>Player</th>
                         <th>Score</th>
                       </tr>
                     </thead>
                     <tbody>
                       {highScores.map((score, index) => (
                         <tr key={index}>
                           <td>{index + 1}</td>
                           <td>{score.name}</td>
                           <td>{score.score}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                   
                   <button 
                     className="restart-button"
                     onClick={handleRestart}
                     style={{marginTop: '30px'}}
                   >
                     Return to Menu
                   </button>
                 </div>
              )}
        
            </div> 
            
            {/* The BulletHellGame component must be conditionally rendered HERE */}
            {gameStatus === 'playing' && (
                <BulletHellGame 
                    ref={gameInstanceRef}
                    onUpdate={handleGameUpdate} 
                    isPaused={isPaused}
                    onTogglePause={togglePause}
                    onShowUpgrade={handleShowUpgrade} 
                    onGameOverSubmit={handleGameOverSubmit}
                />
            )}
        </>
      );
  }

  return (
    <div className="App">
      {/* CRITICAL FIX: The ID for Phaser to attach to must ALWAYS be in the DOM */}
      <div id="game-container" style={{
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          zIndex: 1, 
          background: '#000',
          // Optionally hide it completely when not playing to be safe, though CSS handles this.
          visibility: gameStatus === 'playing' ? 'visible' : 'hidden' 
        }}>
        {/* Phaser canvas will be inserted here */}
      </div>

      {renderScreen()}
      
    </div>
  );
}

export default App;