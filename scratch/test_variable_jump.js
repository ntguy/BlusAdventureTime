import puppeteer from 'puppeteer';

async function run() {
    console.log('Launching browser for Variable Jump Height tests...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 936, height: 540 });

        console.log('Navigating to level...');
        await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('Confirming PLAY GAME selection...');
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Let the player settle
        await new Promise(resolve => setTimeout(resolve, 500));

        // 1. Measure TAP jump height
        console.log('Simulating jump TAP (hold for 50ms)...');
        const tapResult = await page.evaluate(async () => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const p1Body = gameScene.player1Entity.getComponent('PhysicsBody').body;
            
            const startY = p1Body.y;
            let peakY = startY;

            // Trigger jump press
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', keyCode: 87 }));
            
            // Release quickly
            await new Promise(r => setTimeout(r, 50));
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', keyCode: 87 }));

            // Record peak over the next 500ms
            for (let i = 0; i < 25; i++) {
                if (p1Body.y < peakY) {
                    peakY = p1Body.y; // smaller y is higher in screen coordinates
                }
                await new Promise(r => setTimeout(r, 20));
            }

            return {
                startY,
                peakY,
                height: startY - peakY
            };
        });
        console.log('TAP jump result:', JSON.stringify(tapResult));

        // Wait for player to settle back on ground
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 2. Measure HOLD jump height
        console.log('Simulating jump HOLD (hold for 400ms)...');
        const holdResult = await page.evaluate(async () => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const p1Body = gameScene.player1Entity.getComponent('PhysicsBody').body;
            
            const startY = p1Body.y;
            let peakY = startY;

            // Trigger jump press
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', keyCode: 87 }));
            
            // Hold for 400ms
            await new Promise(r => setTimeout(r, 400));
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', keyCode: 87 }));

            // Record peak over next 200ms
            for (let i = 0; i < 15; i++) {
                if (p1Body.y < peakY) {
                    peakY = p1Body.y;
                }
                await new Promise(r => setTimeout(r, 20));
            }

            return {
                startY,
                peakY,
                height: startY - peakY
            };
        });
        console.log('HOLD jump result:', JSON.stringify(holdResult));

        if (holdResult.height <= tapResult.height + 5) {
            console.error(`FAILURE: HOLD jump height (${holdResult.height}px) is not significantly higher than TAP jump height (${tapResult.height}px)`);
            process.exit(1);
        }

        console.log(`✔ Variable jump height verified! Short jump: ${Math.round(tapResult.height)}px, Long jump: ${Math.round(holdResult.height)}px`);
        console.log('SUCCESS: Variable jump height tests passed!');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
