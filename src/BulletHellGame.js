import React, { useEffect, useRef, useImperativeHandle } from 'react';
import Phaser from 'phaser';
import VirtualJoystickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';

// --- IMPORT SCENES, OBJECTS, AND CONSTANTS ---
import { WaveScene } from './WaveScene'; 
import { ChaosScene } from './ChaosScene'; 
// REMOVED: import { PLAYER_BASE_SPEED } from './GameConstants';

// --- REACT COMPONENT (Wrapper) ---
// gameMode ('wave' or 'chaos') is now a prop
const BulletHellGame = React.forwardRef(({ onUpdate, isPaused, onTogglePause, onShowUpgrade, onGameOverSubmit, gameMode }, ref) => {
    const gameRef = useRef(null);

    useImperativeHandle(ref, () => ({
        get game() {
            return gameRef.current;
        }
    }), []);

    useEffect(() => {
        // Select the correct scene class and key based on gameMode
        const sceneToLoad = gameMode === 'chaos' ? ChaosScene : WaveScene;
        const sceneKey = gameMode === 'chaos' ? 'ChaosScene' : 'WaveScene';
        
        const config = {
            type: Phaser.AUTO,
            width: window.innerWidth,
            height: window.innerHeight,
            scale: {
                mode: Phaser.Scale.RESIZE,
                parent: 'game-container',
            },
            pixelArt: true,
            physics: {
                default: 'arcade',
                arcade: {
                    gravity: { y: 0 },
                    debug: false
                }
            },
            plugins: {
                scene: [{
                    key: 'rexVirtualJoystick',
                    plugin: VirtualJoystickPlugin,
                    start: true,
                    mapping: 'joystickPlugin'
                }]
            },
            scene: [sceneToLoad] // Load the selected scene
        };

        const game = new Phaser.Game(config);
        gameRef.current = game;

        game.scene.start(sceneKey, {
            onUpdate: onUpdate || (() => {}),
            onTogglePause: onTogglePause || (() => {}),
            onShowUpgrade: onShowUpgrade || (() => {}),
            onGameOverSubmit: onGameOverSubmit || (() => {})
        });

        return () => {
            game.destroy(true);
            gameRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onUpdate, onShowUpgrade, onGameOverSubmit, gameMode]); // gameMode added as dependency

    useEffect(() => {
        if (gameRef.current && gameRef.current.scene) {
            const sceneKey = gameMode === 'chaos' ? 'ChaosScene' : 'WaveScene';
            const scene = gameRef.current.scene.getScene(sceneKey);
            if (scene && scene.handlePause) {
                scene.handlePause(isPaused);
            }
        }
    }, [isPaused, gameMode]);

    return <></>;
});

export default BulletHellGame;