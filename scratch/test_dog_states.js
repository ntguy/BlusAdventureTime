import puppeteer from 'puppeteer';

async function run() {
    console.log('Launching browser for Dog States tests...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 936, height: 540 });

        // Forward console logs from page to node process
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        console.log('Navigating to level...');
        await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Start directly by entering Play Game scene (index 0)
        console.log('Confirming PLAY GAME selection...');
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify active scene is GameScene
        let gameState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const active = game.scene.getScenes(true)[0];
            return {
                currentScene: active.sys.settings.key
            };
        });

        if (gameState.currentScene !== 'GameScene') {
            console.error(`FAILURE: GameScene did not launch. Active scene: ${gameState.currentScene}`);
            process.exit(1);
        }
        console.log('✔ GameScene launched successfully!');

        // 1. Check Initial Idle State
        let initialAnim = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const dogSprite = gameScene.player2Entity.getComponent('Render').gameObject;
            return {
                animKey: dogSprite.anims.currentAnim ? dogSprite.anims.currentAnim.key : null,
                idleTime: gameScene.player2Entity.getComponent('Player').idleTime
            };
        });
        console.log('Initial dog state:', JSON.stringify(initialAnim));
        if (initialAnim.animKey !== 'blu_idle') {
            console.error(`FAILURE: Initial animation should be blu_idle, got ${initialAnim.animKey}`);
            process.exit(1);
        }
        console.log('✔ Initial dog animation is blu_idle');

        // 2. Press Spacebar and test BARK trigger
        console.log('Pressing Spacebar to trigger Bark...');
        await page.keyboard.press('Space');
        await new Promise(resolve => setTimeout(resolve, 100)); // wait for anim to start

        let barkingState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const dog = gameScene.player2Entity.getComponent('Player');
            const dogSprite = gameScene.player2Entity.getComponent('Render').gameObject;
            return {
                isBarking: dog.isBarking,
                animKey: dogSprite.anims.currentAnim ? dogSprite.anims.currentAnim.key : null,
                idleTime: dog.idleTime
            };
        });
        console.log('Barking dog state:', JSON.stringify(barkingState));
        if (!barkingState.isBarking || barkingState.animKey !== 'blu_bark') {
            console.error(`FAILURE: Dog should be barking with blu_bark anim, got isBarking=${barkingState.isBarking}, animKey=${barkingState.animKey}`);
            process.exit(1);
        }
        console.log('✔ Dog successfully barking with blu_bark animation!');

        // Wait for bark animation to complete (duration is short)
        await new Promise(resolve => setTimeout(resolve, 500));

        let postBarkingState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const dog = gameScene.player2Entity.getComponent('Player');
            return {
                isBarking: dog.isBarking
            };
        });
        console.log('Post-barking dog state:', JSON.stringify(postBarkingState));
        if (postBarkingState.isBarking) {
            console.error(`FAILURE: Dog should have finished barking!`);
            process.exit(1);
        }
        console.log('✔ Bark state ended cleanly');

        // 3. Test Sitting Transition
        console.log('Artificially accelerating idle time to 5 seconds to trigger Sit state...');
        let sitState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const dog = gameScene.player2Entity.getComponent('Player');
            dog.idleTime = 5; // set idle time manually to trigger state change next frame (which is > 4s)
            return {
                idleTimeSet: dog.idleTime
            };
        });

        // Let the update loop run a frame
        await new Promise(resolve => setTimeout(resolve, 50));

        let finalSitAnim = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const dogSprite = gameScene.player2Entity.getComponent('Render').gameObject;
            return {
                animKey: dogSprite.anims.currentAnim ? dogSprite.anims.currentAnim.key : null
            };
        });
        console.log('Dog state after 5s idle:', JSON.stringify(finalSitAnim));
        if (finalSitAnim.animKey !== 'blu_sit') {
            console.error(`FAILURE: Dog did not transition to blu_sit, got anim: ${finalSitAnim.animKey}`);
            process.exit(1);
        }
        console.log('✔ Dog transitioned to blu_sit successfully!');

        // 4. Move Dog to ensure sit interrupts
        console.log('Moving Dog to test walk interrupt...');
        await page.keyboard.down('ArrowRight');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        let movingState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const dog = gameScene.player2Entity.getComponent('Player');
            const dogSprite = gameScene.player2Entity.getComponent('Render').gameObject;
            return {
                idleTime: dog.idleTime,
                animKey: dogSprite.anims.currentAnim ? dogSprite.anims.currentAnim.key : null
            };
        });
        await page.keyboard.up('ArrowRight');

        console.log('Moving dog state:', JSON.stringify(movingState));
        if (movingState.idleTime !== 0 || movingState.animKey !== 'blu_walk') {
            console.error(`FAILURE: Dog should be walking with blu_walk, got idleTime=${movingState.idleTime}, animKey=${movingState.animKey}`);
            process.exit(1);
        }
        console.log('✔ Walking successfully interrupted sit state!');

        console.log('SUCCESS: All dog states and bark tests passed!');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
