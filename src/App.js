import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js'
import './App.css';
import BulletHellGame from './BulletHellGame';

const supabaseUrl = 'https://jzfbvddkrzfibfdgyhdy.supabase.co'

const supabaseKey = process.env.REACT_APP_SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

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


// --- MainMenu Component ---
function MainMenu({ onStartGame, onViewLeaderboard }) {
  // Uses the updated CSS classes from App.css
  return (
    <div className="main-menu-overlay">
      <h1>SPACE BULLET HELL</h1>

      <div className="menu-buttons">
        <button
          className="menu-button-primary"
          onClick={() => onStartGame('wave')}
        >
          WAVE BASED
        </button>
        <button
          className="menu-button-primary"
          onClick={() => onStartGame('chaos')}
        >
          CHAOS MODE
        </button>
        <button
          className="menu-button-secondary"
          onClick={onViewLeaderboard}
        >
          LEADERBOARD
        </button>
        <button
          className="menu-button-secondary"
          onClick={() => alert("Options are not implemented yet! (Soon!)")}
        >
          OPTIONS
        </button>
        <button
          className="menu-button-secondary"
          onClick={() => alert("Feedback system is not implemented yet! (Soon!)")}
        >
          LEAVE FEEDBACK
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
  const [gameStatus, setGameStatus] = useState('menu');
  const [gameMode, setGameMode] = useState('wave'); 
  const [leaderboardMode, setLeaderboardMode] = useState('wave');

  const [isPaused, setIsPaused] = useState(false);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [showUpgradeMenu, setShowUpgradeMenu] = useState(false);

  const [highScores, setHighScores] = useState([]);
  const [playerName, setPlayerName] = useState('');
  const [finalScore, setFinalScore] = useState(0);
  const [finalWaveReached, setFinalWaveReached] = useState(0); 
  const [finalDamageDealt, setFinalDamageDealt] = useState(0); 
  const [finalSessionDuration, setFinalSessionDuration] = useState(0); 

  const [upgradeChoices, setUpgradeChoices] = useState([]);

  const [waveAnnouncement, setWaveAnnouncement] = useState('');
  const waveTimerRef = useRef(null); 

  const showUpgradeMenuRef = useRef(false);

  const gameInstanceRef = useRef(null);

  const [isBossActive, setIsBossActive] = useState(false);
  const [bossDirection, setBossDirection] = useState(null); 
  const [showBossIndicator, setShowBossIndicator] = useState(false);
  
  const [showStats, setShowStats] = useState(false); 

  useEffect(() => {
    showUpgradeMenuRef.current = showUpgradeMenu;
  }, [showUpgradeMenu]);

  useEffect(() => {
    if (isBossActive && gameMode === 'wave') { 
      setShowBossIndicator(true);
      const timer = setTimeout(() => {
        setShowBossIndicator(false);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setShowBossIndicator(false); 
    }
  }, [isBossActive, gameMode]);


  const togglePause = useCallback(() => {
    if (gameStatus !== 'playing' || showUpgradeMenuRef.current) return;
    setIsPaused(p => {
      const newPauseState = !p;
      setShowPauseMenu(newPauseState);
      return newPauseState;
    });
  }, [gameStatus]);

  const [gameState, setGameState] = useState({
    score: 0, health: 10, maxHealth: 10, isGameOver: false, waveNumber: 0, moveSpeed: PLAYER_BASE_SPEED,
    weapons: [], playerBaseDamage: 0, critChance: 0, critDamage: 1.5, bulletBounces: 0, elapsedTime: 0,
  });

  const handleGameUpdate = useCallback((data) => {
    if (data.type === 'newWave') {
        if (waveTimerRef.current) clearTimeout(waveTimerRef.current);

        if (gameMode === 'wave' && data.value % 30 === 0 && data.value > 0) {
           setWaveAnnouncement('');
           return; 
        }

        setWaveAnnouncement(`${gameMode === 'chaos' ? 'LEVEL' : 'WAVE'} ${data.value}`);

        waveTimerRef.current = setTimeout(() => {
            setWaveAnnouncement('');
            waveTimerRef.current = null;
        }, 2500); 
        return; 
    }

    setGameState(prevState => {
      switch (data.type) {
        case 'score': return { ...prevState, score: data.value };
        case 'health': return { ...prevState, health: data.value, maxHealth: data.max || prevState.maxHealth };
        case 'gameOver': return { ...prevState, isGameOver: data.value };
        case 'fullStats':
          // Only process/show boss state if in wave mode
          setIsBossActive(gameMode === 'wave' ? data.isBossActive : false);
          setBossDirection(gameMode === 'wave' ? data.bossDirection : null);

          return {
            ...prevState,
            waveNumber: data.waveNumber,
            health: data.health, maxHealth: data.maxHealth, moveSpeed: data.moveSpeed,
            weapons: data.weapons, playerBaseDamage: data.playerBaseDamage, critChance: data.critChance,
            critDamage: data.critDamage, bulletBounces: data.bulletBounces, score: data.score,
            elapsedTime: data.elapsedTime, 
          };
        default: return prevState;
      }
    });
  }, [gameMode]);

  const handleGameOverSubmit = useCallback((finalStats) => {
      setFinalScore(finalStats.score);
      setFinalWaveReached(finalStats.waveReached);
      setFinalDamageDealt(finalStats.damageDealt);
      setFinalSessionDuration(finalStats.sessionDuration);
  }, []);

  const fetchLeaderboard = useCallback(async (mode) => {
      try {
          let query = supabase
              .from('high_scores')
              .select('name, wave_reached, score, total_damage_dealt, time_played, game_mode')
              .eq('game_mode', mode) // FILTER BY MODE
              .order('wave_reached', { ascending: false }) 
              .order('score', { ascending: false })        
              .limit(10);

          let { data, error } = await query;

          if (error) throw error;
          setHighScores(data);
      } catch (error) {
          console.error("Leaderboard Fetch Error:", error.message);
          setHighScores([]); 
      }
  }, []);

  useEffect(() => {
      if (gameStatus === 'leaderboard') {
        fetchLeaderboard(leaderboardMode);
      }
  }, [fetchLeaderboard, leaderboardMode, gameStatus]);
  
  const submitScore = useCallback(async (e) => {
      e.preventDefault();

      const dataToInsert = {
          name: playerName || 'Player',
          score: finalScore,
          wave_reached: finalWaveReached, 
          total_damage_dealt: finalDamageDealt,
          time_played: finalSessionDuration,
          game_mode: gameMode 
      };

      try {
          const { error } = await supabase.from('high_scores').insert([dataToInsert]);
          if (error) throw error;
          alert(`Score submitted! Mode: ${gameMode}, Level/Wave: ${finalWaveReached}, Score: ${finalScore}`);
      } catch (error) {
          console.error("Submission Error:", error.message);
          alert(`Submission failed: ${error.message}.`);
      }

      setPlayerName('');
      setGameStatus('leaderboard');
      setLeaderboardMode(gameMode);
  }, [playerName, finalScore, finalWaveReached, finalDamageDealt, finalSessionDuration, gameMode]);
  
  const handleShowUpgrade = useCallback((choices) => {
    setUpgradeChoices(choices);
    setIsPaused(true);
    setShowPauseMenu(false);
    setShowUpgradeMenu(true);
  }, []);

  const handleUpgradeChoice = (choice) => {
    if (gameInstanceRef.current && gameInstanceRef.current.game) {
      const sceneKey = gameMode === 'chaos' ? 'ChaosScene' : 'WaveScene';
      const scene = gameInstanceRef.current.game.scene.getScene(sceneKey);
      if (scene) {
        scene.applyUpgrade(choice);
      }
    }
    setShowUpgradeMenu(false);
    setIsPaused(false);
    setUpgradeChoices([]);
  };

  const handleRestart = () => {
    setGameState({
      score: 0, health: 10, maxHealth: 10, isGameOver: false, waveNumber: 0, moveSpeed: PLAYER_BASE_SPEED,
      weapons: [], playerBaseDamage: 0, critChance: 0, critDamage: 1.5, bulletBounces: 0, elapsedTime: 0
    });
    setIsPaused(false); setShowPauseMenu(false); setFinalScore(0); setFinalWaveReached(0); 
    setFinalDamageDealt(0); setFinalSessionDuration(0);
    setIsBossActive(false); setBossDirection(null); setShowBossIndicator(false); setShowStats(false);
    setGameStatus('menu');
    setLeaderboardMode('wave'); 
    window.location.reload();
  };

  const handleStartGame = (mode) => {
    setGameMode(mode); 
    setGameStatus('playing');
  }

  const handleViewLeaderboard = () => {
      setGameStatus('leaderboard');
      setLeaderboardMode('wave');
  }

  const handleLeaderboardModeChange = (mode) => {
      if (leaderboardMode !== mode) {
          setLeaderboardMode(mode);
      }
  }

  const getWeaponStat = (key) => {
    return gameState.weapons.find(w => w.key === key);
  }

  const autoBullet = getWeaponStat('autoBullet');
  const electricBolt = getWeaponStat('electricBolt');

  const isHealthLow = gameState.health <= (gameState.maxHealth * 0.2);

  const showScoreSubmission = gameState.isGameOver && finalWaveReached > 0 && gameStatus !== 'leaderboard';
  const showLeaderboardScreen = gameStatus === 'leaderboard';

  const renderScreen = () => {
      if (gameStatus === 'menu') {
          return (
            <MainMenu onStartGame={handleStartGame} onViewLeaderboard={handleViewLeaderboard} />
          );
      }
      
      const shouldShowBossUI = gameMode === 'wave' && isBossActive && (showBossIndicator || bossDirection !== null);
      const bossIndicatorClass = showBossIndicator ? "" : "arrow-only";
      const levelText = gameMode === 'chaos' ? 'LEVEL' : 'WAVE';
      
      const leaderboardLevelText = leaderboardMode === 'chaos' ? 'LEVEL' : 'WAVE';
      const waveButtonClass = leaderboardMode === 'wave' ? 'menu-button-primary' : 'menu-button-secondary';
      const chaosButtonClass = leaderboardMode === 'chaos' ? 'menu-button-primary' : 'menu-button-secondary';


      return (
        <>
            <div className="game-ui-overlay">

              {/* Top Health Bar */}
              <div className={`top-health-bar-container ${isHealthLow ? 'health-low' : ''}`}>
                <div
                    className="bar-fill health-fill"
                    style={{ width: `${(gameState.health / gameState.maxHealth) * 100}%` }}
                ></div>
                <span className="bar-label">HP: {gameState.health}/{gameState.maxHealth}</span>
              </div>

              {/* Bottom HUD Container */}
              <div className="bottom-hud-container">

                {/* Top row of bottom HUD */}
                <div className="bottom-hud-controls">
                  <button className="pause-button" onClick={togglePause}>PAUSE</button>

                  <div className="player-level-box">{levelText} {gameState.waveNumber}</div>
                  
                  {/* Stats Toggle Button */}
                  <button className="stats-toggle-button" onClick={() => setShowStats(p => !p)}>
                      {showStats ? 'HIDE DATA' : 'SHOW DATA'}
                  </button>
                  {/* Timer Display */}
                  <div className="timer-display">{formatTime(gameState.elapsedTime)}</div>
                </div>

                {/* Stats Table (Snug below bars) */}
                <div className={`player-stats-snug ${showStats ? '' : 'collapsed'}`}>
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

              {/* BOSS UI INDICATOR (Top Center) */}
              {shouldShowBossUI && (
                  <div className={`boss-round-indicator ${bossIndicatorClass}`}>
                      {showBossIndicator && <span>!! BOSS ROUND !!</span>}
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

              {/* Wave/Level Announcement Overlay */}
              {waveAnnouncement && (
                <div className="wave-announcement-overlay"><h1>{waveAnnouncement}</h1></div>
              )}

              {/* PAUSE MENU */}
              {showPauseMenu && (
                <div className="pause-menu-overlay">
                  <h2>[ SYSTEM PAUSED ]</h2>
                  <button className="menu-button-primary" onClick={togglePause}>CONTINUE</button>
                  <button className="menu-button-secondary" onClick={handleRestart}>MAIN MENU</button>
                </div>
              )}

              {/* UPGRADE MENU */}
              {showUpgradeMenu && (
                <div className="upgrade-overlay">
                  <h2>[ {levelText} {gameState.waveNumber} COMPLETE ]</h2>
                  <p>CHOOSE A SYSTEM UPGRADE:</p>
                  <div className="upgrade-choices">
                    {upgradeChoices.map((choice, index) => (
                      <UpgradeCard key={choice.key + index} choice={choice} onSelect={handleUpgradeChoice} />
                    ))}
                  </div>
                </div>
              )}

              {/* GAME OVER / SCORE SUBMISSION */}
              {showScoreSubmission && (
                <div className="game-over-overlay">
                  <h2>[ GAME OVER - PROTOCOL FAILURE ]</h2>
                  <p className="final-score-text">FINAL {levelText}: {finalWaveReached} - SCORE: {finalScore}</p>
                  <form className="score-submission-form" onSubmit={submitScore}>
                      <input type="text" placeholder="ENTER CALLSIGN" value={playerName}
                          onChange={(e) => setPlayerName(e.target.value.substring(0, 15))} maxLength={15} required />
                      <button type="submit" className="menu-button-primary">TRANSMIT SCORE</button>
                  </form>
                  <button className="menu-button-secondary" onClick={handleViewLeaderboard} style={{marginTop: '20px'}}>VIEW LEADERBOARD</button>
                  <button className="menu-button-secondary" onClick={handleRestart} style={{marginTop: '10px'}}>MAIN MENU</button>
                </div>
              )}

              {/* LEADERBOARD SCREEN */}
              {showLeaderboardScreen && (
                 <div className="leaderboard-overlay">
                   <h2>[ TOP PILOTS ]</h2>

                   {/* --- Mode Toggle Buttons --- */}
                   <div className="menu-buttons" style={{marginBottom: '20px', flexDirection: 'row', gap: '15px'}}>
                      <button 
                        className={waveButtonClass}
                        onClick={() => handleLeaderboardModeChange('wave')}
                      >
                        WAVE SCORES
                      </button>
                      <button 
                        className={chaosButtonClass}
                        onClick={() => handleLeaderboardModeChange('chaos')}
                      >
                        CHAOS SCORES
                      </button>
                   </div>


                   <table className="score-table">
                     <thead>
                       <tr>
                         <th>#</th>
                         <th>CALLSIGN</th>
                         {/* DYNAMIC HEADER TEXT */}
                         <th>{leaderboardLevelText}</th> 
                         <th>SCORE</th><th>DAMAGE</th><th>TIME</th>
                       </tr>
                     </thead>
                     <tbody>
                       {highScores.map((score, index) => (
                         <tr key={index}>
                           <td>{index + 1}</td><td>{score.name}</td><td>{score.wave_reached}</td>
                           <td>{score.score}</td><td>{score.total_damage_dealt?.toLocaleString()}</td>
                           <td>{formatTime(score.time_played)}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                   <button className="menu-button-secondary" onClick={handleRestart} style={{marginTop: '30px'}}>RETURN TO MENU</button>
                 </div>
              )}

            </div>

            {/* The BulletHellGame component must be conditionally rendered HERE */}
            {gameStatus === 'playing' && (
                <BulletHellGame
                    ref={gameInstanceRef} onUpdate={handleGameUpdate} isPaused={isPaused}
                    onTogglePause={togglePause} onShowUpgrade={handleShowUpgrade}
                    onGameOverSubmit={handleGameOverSubmit}
                    gameMode={gameMode} // Pass the mode to Phaser
                />
            )}
        </>
      );
  }

  return (
    <div className="App">
      <div id="game-container" style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1,
          background: '#000', visibility: gameStatus === 'playing' ? 'visible' : 'hidden'
        }}>
      </div>
      {renderScreen()}
    </div>
  );
}

export default App;