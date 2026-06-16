import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    const imgPath = path.resolve(__dirname, '../public/assets/backgrounds/fallTrees/Plan-1.png');
    const base64Img = fs.readFileSync(imgPath).toString('base64');
    const dataUri = `data:image/png;base64,${base64Img}`;
    
    await page.evaluate((url) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                console.log(`Image dimensions: ${img.width}x${img.height}`);
                
                const y = img.height - 1;
                const rowData = [];
                for (let x = 0; x < img.width; x += 50) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    rowData.push({ x, r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] });
                }
                console.log('Sample pixels from bottom row: ' + JSON.stringify(rowData));
                resolve();
            };
            img.src = url;
        });
    }, dataUri);

    await browser.close();
}

run().catch(console.error);
