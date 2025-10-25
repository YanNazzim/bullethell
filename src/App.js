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

// --- Helper function to format milliseconds into MM:SS ---
function formatTime(milliseconds) {
    if (milliseconds === null || milliseconds === undefined) return '00:00';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}


// --- MODIFIED: MainMenu Component ---
function MainMenu({ highScores, onStartGame, onViewLeaderboard }) {
  return (
    <div className="main-menu-overlay">
      <h1>SPACE BULLET HELL</h1>
      <div className="menu-leaderboard-container">
        <h3>TOP SCORES</h3>
        {/* --- MODIFIED: Added Wave, Damage, Time columns --- */}
        <table className="score-table small-table">
          <thead>
            <tr>
              <th>#</th>
              <th>PLAYER</th>
              <th>WAVE</th>
              <th>SCORE</th>
              <th>DMG</th>
              <th>TIME</th>
            </tr>
          </thead>
          <tbody>
            {highScores.slice(0, 5).map((score, index) => (
              <tr key={index}>
                <td>{index + 1}</td>
                <td>{score.name}</td>
                <td>{score.wave_reached ?? '-'}</td> {/* Show wave */}
                <td>{score.score?.toLocaleString() ?? '-'}</td> {/* Show score */}
                <td>{score.total_damage_dealt?.toLocaleString() ?? '-'}</td> {/* Show damage */}
                <td>{formatTime(score.time_played)}</td> {/* Show time */}
              </tr>
            ))}
            {/* Fill remaining rows if less than 5 scores */}
            {Array.from({ length: 5 - highScores.length }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td>{highScores.length + 1 + index}</td>
                <td>---</td>
                <td>--</td> {/* Placeholder */}
                <td>---</td> {/* Placeholder */}
                <td>---</td> {/* Placeholder */}
                <td>--:--</td> {/* Placeholder */}
              </tr>
            ))}
          </tbody>
        </table>
        {/* --- END MODIFIED --- */}
      </div>

      <div className="menu-buttons">
        <button
          className="menu-button-primary"
          onClick={onStartGame}
        >
          START GAME
        </button>
        <button
          className="menu-button-secondary"
          onClick={() => alert("Options are not implemented yet! (Soon!)")}
        >
          OPTIONS
        </button>
      </div>
    </div>
  );
}
// --- END MODIFIED ---


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

  // --- MODIFIED: Scoreboard states ---
  const [highScores, setHighScores] = useState([]);
  const [playerName, setPlayerName] = useState('');
  const [finalScore, setFinalScore] = useState(0);
  const [finalWaveReached, setFinalWaveReached] = useState(0); // NEW
  const [finalDamageDealt, setFinalDamageDealt] = useState(0); // NEW
  const [finalSessionDuration, setFinalSessionDuration] = useState(0); // NEW
  // --- END MODIFIED ---

  const [upgradeChoices, setUpgradeChoices] = useState([]);

  // --- NEW: State for "WAVE X" announcement ---
  const [waveAnnouncement, setWaveAnnouncement] = useState('');
  const waveTimerRef = useRef(null); // To manage timers
  // --- END NEW ---

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

  // --- MODIFIED: GameState for Wave-based progression ---
  const [gameState, setGameState] = useState({
    score: 0,
    health: 10,
    maxHealth: 10,
    isGameOver: false,
    waveNumber: 0, // REPLACED level
    moveSpeed: PLAYER_BASE_SPEED,
    weapons: [],
    playerBaseDamage: 0,
    critChance: 0,
    critDamage: 1.5,
    bulletBounces: 0,
    elapsedTime: 0, // NEW for display
    // --- REMOVED: Enemy count state ---
  });
  // --- END MODIFIED ---

  // --- MODIFIED: handleGameUpdate for Wave-based stats ---
  const handleGameUpdate = useCallback((data) => {

    // --- NEW: Handle Wave Announcement ---
    if (data.type === 'newWave') {
        // Clear any existing timer
        if (waveTimerRef.current) {
            clearTimeout(waveTimerRef.current);
        }

        // Don't show "WAVE 30" if the boss indicator will show instead
        // We use 30 from the hardcoded constant in Phaser
        if (data.value % 30 === 0 && data.value > 0) {
           setWaveAnnouncement(''); // Ensure it's clear
           return; // Don't set state, let boss indicator take over
        }

        setWaveAnnouncement(`WAVE ${data.value}`);

        // Set a timer to clear it
        waveTimerRef.current = setTimeout(() => {
            setWaveAnnouncement('');
            waveTimerRef.current = null;
        }, 2500); // Show for 2.5 seconds
        return; // This update doesn't need to merge into gameState
    }
    // --- END NEW ---

    setGameState(prevState => {
      switch (data.type) {
        case 'score':
          return { ...prevState, score: data.value };
        case 'health':
          return { ...prevState, health: data.value, maxHealth: data.max || prevState.maxHealth };
        case 'gameOver':
          return { ...prevState, isGameOver: data.value };
        case 'fullStats':
          // --- UPDATED: Handle new boss and wave stats ---
          setIsBossActive(data.isBossActive);
          setBossDirection(data.bossDirection);

          return {
            ...prevState,
            waveNumber: data.waveNumber, // CHANGED
            health: data.health,
            maxHealth: data.maxHealth,
            moveSpeed: data.moveSpeed,
            weapons: data.weapons,
            playerBaseDamage: data.playerBaseDamage,
            critChance: data.critChance,
            critDamage: data.critDamage,
            bulletBounces: data.bulletBounces,
            score: data.score,
            elapsedTime: data.elapsedTime, // NEW
            // --- REMOVED: Enemy count state ---
          };
        default:
          return prevState;
      }
    });
  }, []);
  // --- END MODIFIED ---

  // --- MODIFIED: handleGameOverSubmit to receive object ---
  const handleGameOverSubmit = useCallback((finalStats) => {
      setFinalScore(finalStats.score);
      setFinalWaveReached(finalStats.waveReached);
      setFinalDamageDealt(finalStats.damageDealt);
      setFinalSessionDuration(finalStats.sessionDuration);
      // setGameStatus is handled implicitly by gameState.isGameOver being true
  }, []);
  // --- END MODIFIED ---

  // --- MODIFIED: fetchLeaderboard to get new columns and sort ---
  const fetchLeaderboard = useCallback(async () => {
      try {
          // Fetch top 10 scores with new columns, sorted by wave then score
          let { data, error } = await supabase
              .from('high_scores')
              .select('name, wave_reached, score, total_damage_dealt, time_played') // Select new columns
              .order('wave_reached', { ascending: true }) // Sort by wave first (highest)
              .order('score', { ascending: false })        // Then by score (highest)
              .limit(10);

          if (error) throw error;

          setHighScores(data);
      } catch (error) {
          console.error("Leaderboard Fetch Error:", error.message);
          // Add dummy data for new columns if fetch fails
          setHighScores([
             { name: 'SUPABASE_ERROR', wave_reached: 99, score: 1000, total_damage_dealt: 9999, time_played: 600000 },
             { name: 'CHECK_CONSOLE', wave_reached: 1, score: 500, total_damage_dealt: 100, time_played: 30000 }
          ]);
      }
  }, []);
  // --- END MODIFIED ---

  // --- NEW: Fetch leaderboard on component mount for the menu ---
  useEffect(() => {
      fetchLeaderboard();
  }, [fetchLeaderboard]);

  // --- MODIFIED: Submit Score with new stats ---
  const submitScore = useCallback(async (e) => {
      e.preventDefault();

      const dataToInsert = {
          name: playerName || 'Player',
          score: finalScore,
          wave_reached: finalWaveReached, // NEW
          total_damage_dealt: finalDamageDealt, // NEW
          time_played: finalSessionDuration, // NEW (store as milliseconds)
      };

      try {
          const { error } = await supabase
              .from('high_scores')
              .insert([dataToInsert]);

          if (error) throw error;

          alert(`Score submitted! Wave: ${finalWaveReached}, Score: ${finalScore}`);

      } catch (error) {
          console.error("Submission Error:", error.message);
          alert(`Submission failed: ${error.message}.`);
      }

      setPlayerName('');
      // After submission, change status to show the full leaderboard and refresh scores
      setGameStatus('leaderboard');
      fetchLeaderboard();
  }, [playerName, finalScore, finalWaveReached, finalDamageDealt, finalSessionDuration, fetchLeaderboard]);
  // --- END MODIFIED ---


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

  // --- MODIFIED: handleRestart for Wave-based state ---
  const handleRestart = () => {
    // Reset all game state and go back to menu to allow a fresh start
    setGameState({
      score: 0, health: 10, maxHealth: 10, isGameOver: false, waveNumber: 0, moveSpeed: PLAYER_BASE_SPEED,
      weapons: [], playerBaseDamage: 0, critChance: 0, critDamage: 1.5, bulletBounces: 0, elapsedTime: 0
    });
    setIsPaused(false);
    setShowPauseMenu(false);
    // Reset final stats
    setFinalScore(0);
    setFinalWaveReached(0);
    setFinalDamageDealt(0);
    setFinalSessionDuration(0);

    // --- NEW: Reset boss state on restart ---
    setIsBossActive(false);
    setBossDirection(null);
    setShowBossIndicator(false);

    setGameStatus('menu');
    fetchLeaderboard(); // Refresh menu leaderboard

    // Force a full window reload to reset the Phaser canvas and game state completely
    window.location.reload();
  };
  // --- END MODIFIED ---

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

  const showScoreSubmission = gameState.isGameOver && finalWaveReached > 0 && gameStatus !== 'leaderboard'; // Check wave reached > 0
  const showLeaderboardScreen = gameStatus === 'leaderboard';

  // --- REMOVED: All Bar calculations ---
  // Health percentage is now calculated inline


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

              {/* --- NEW: Top Health Bar (for all screens) --- */}
              <div className={`top-health-bar-container ${isHealthLow ? 'health-low' : ''}`}>
                <div
                    className="bar-fill health-fill"
                    style={{ width: `${(gameState.health / gameState.maxHealth) * 100}%` }}
                ></div>
                <span className="bar-label">HP: {gameState.health}/{gameState.maxHealth}</span>
              </div>

              {/* --- MODIFIED: Bottom HUD Container (for all screens) --- */}
              <div className="bottom-hud-container">

                {/* --- NEW: Wrapper for top row of bottom HUD --- */}
                <div className="bottom-hud-controls">
                  <button className="pause-button" onClick={togglePause}>
                      PAUSE
                  </button>

                  <div className="player-level-box">
                      WAVE {gameState.waveNumber}
                  </div>
                  {/* --- NEW: Timer Display --- */}
                  <div className="timer-display">
                      {formatTime(gameState.elapsedTime)}
                  </div>
                  {/* --- END NEW --- */}
                </div>


                {/* Stats Table (Snug below bars) */}
                <div className="player-stats-snug">
                  <div className="stat-group-header">COMBAT DATA</div>
                  <div className="stat-row"><span>SCORE</span><span>{gameState.score}</span></div>
                  <div className="stat-row"><span>MOVE SPD</span><span>{gameState.moveSpeed}</span></div>
                  <div className="stat-row highlight-red"><span>BASE DMG</span><span>+{gameState.playerBaseDamage}</span></div>
                  <div className="stat-row highlight-purple"><span>CRIT CHANCE</span><span>{(gameState.critChance * 100).toFixed(0)}%</span></div>
                  <div className="stat-row highlight-purple"><span>CRIT DMG</span><span>{(gameState.critDamage * 100).toFixed(0)}%</span></div>
                  <div className="stat-row highlight-blue"><span>BULLET BOUNCE</span><span>+{gameState.bulletBounces}</span></div>

                  <div className="stat-group-header weapon-header">WEAPON SYSTEMS</div>
                  <div className="stat-row"><span>BULLET DMG</span><span className="highlight-blue">{autoBullet?.damage}</span></div>
                  <div className="stat-row"><span>FIRE RATE</span><span className="highlight-blue">{autoBullet?.atkSpeed.toFixed(1)}/s</span></div>
                  {electricBolt && (
                      <div className="stat-row"><span>ZAP RATE</span><span className="highlight-purple">{electricBolt.atkSpeed.toFixed(2)}/s</span></div>
                  )}
                  {getWeaponStat('shield') && (
                      <div className="stat-row"><span>SHIELD ORBS</span><span className="highlight-red">{getWeaponStat('shield').count}</span></div>
                  )}
                </div>

              </div>
              {/* --- END MODIFIED BOTTOM HUD --- */}

              {/* --- BOSS UI INDICATOR (Top Center) --- */}
              {shouldShowBossUI && (
                  <div className={`boss-round-indicator ${bossIndicatorClass}`}>
                      {/* Show BOSS ROUND! text ONLY during the 5 second splash */}
                      {showBossIndicator && <span>!! BOSS ROUND !!</span>}

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
              {/* --- END BOSS UI --- */}

              {/* --- NEW: Wave Announcement Overlay --- */}
              {waveAnnouncement && (
                <div className="wave-announcement-overlay">
                    <h1>{waveAnnouncement}</h1>
                </div>
              )}
              {/* --- END NEW --- */}

              {/* PAUSE MENU */}
              {showPauseMenu && (
                <div className="pause-menu-overlay">
                  <h2>[ SYSTEM PAUSED ]</h2>
                  <button className="menu-button-primary" onClick={togglePause}>
                    CONTINUE
                  </button>
                  <button
                    className="menu-button-secondary"
                    onClick={handleRestart}
                  >
                    MAIN MENU
                  </button>
                </div>
              )}

              {/* UPGRADE MENU */}
              {showUpgradeMenu && (
                <div className="upgrade-overlay">
                  {/* --- MODIFIED: Title for Wave complete --- */}
                  <h2>[ WAVE {gameState.waveNumber} COMPLETE ]</h2>
                  <p>CHOOSE A SYSTEM UPGRADE:</p>
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

              {/* GAME OVER / SCORE SUBMISSION */}
              {showScoreSubmission && (
                <div className="game-over-overlay">
                  <h2>[ GAME OVER - PROTOCOL FAILURE ]</h2>
                  {/* --- MODIFIED: Show final wave --- */}
                  <p className="final-score-text">FINAL WAVE: {finalWaveReached} - SCORE: {finalScore}</p>

                  <form className="score-submission-form" onSubmit={submitScore}>
                      <input
                          type="text"
                          placeholder="ENTER CALLSIGN"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value.substring(0, 15))}
                          maxLength={15}
                          required
                      />
                      <button type="submit" className="menu-button-primary">
                          TRANSMIT SCORE
                      </button>
                  </form>

                  <button
                    className="menu-button-secondary"
                    onClick={handleViewLeaderboard}
                    style={{marginTop: '20px'}}
                  >
                    VIEW LEADERBOARD
                  </button>

                  <button
                    className="menu-button-secondary"
                    onClick={handleRestart}
                    style={{marginTop: '10px'}}
                  >
                    MAIN MENU
                  </button>
                </div>
              )}

              {/* LEADERBOARD SCREEN */}
              {showLeaderboardScreen && (
                 <div className="leaderboard-overlay">
                   <h2>[ TOP PILOTS ]</h2>

                   {/* --- MODIFIED: Leaderboard Table --- */}
                   <table className="score-table">
                     <thead>
                       <tr>
                         <th>#</th>
                         <th>CALLSIGN</th>
                         <th>WAVE</th>
                         <th>SCORE</th>
                         <th>DAMAGE</th>
                         <th>TIME</th>
                       </tr>
                     </thead>
                     <tbody>
                       {highScores.map((score, index) => (
                         <tr key={index}>
                           <td>{index + 1}</td>
                           <td>{score.name}</td>
                           <td>{score.wave_reached}</td>
                           <td>{score.score}</td>
                           {/* Format damage with commas */}
                           <td>{score.total_damage_dealt?.toLocaleString()}</td>
                           {/* Format time */}
                           <td>{formatTime(score.time_played)}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                   {/* --- END MODIFIED --- */}

                   <button
                     className="menu-button-secondary"
                     onClick={handleRestart}
                     style={{marginTop: '30px'}}
                   >
                     RETURN TO MENU
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