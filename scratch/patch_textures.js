import puppeteer from 'puppeteer';

async function run() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('STACK_TRACE:')) {
            console.log(text);
        }
    });

    await page.evaluateOnNewDocument(() => {
        window.addEventListener('DOMContentLoaded', () => {
            const checkPhaser = setInterval(() => {
                if (window.Phaser && window.Phaser.Textures && window.Phaser.Textures.TextureManager) {
                    clearInterval(checkPhaser);
                    
                    const origAddCanvas = window.Phaser.Textures.TextureManager.prototype.addCanvas;
                    window.Phaser.Textures.TextureManager.prototype.addCanvas = function(key, canvas) {
                        // Check if key is a UUID (contains hyphens)
                        if (key.includes('-')) {
                            console.log(`STACK_TRACE: key=${key}\n${new Error().stack}`);
                        }
                        return origAddCanvas.call(this, key, canvas);
                    };
                }
            }, 10);
        });
    });

    await page.goto('http://localhost:5177/', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    await browser.close();
}

run().catch(console.error);
