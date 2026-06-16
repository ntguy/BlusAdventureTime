const fs = require('fs');
const path = require('path');

const levelsDir = '/Users/nicalai.guy/GD/Blu\'s Adventure Time/public/assets/levels';

function updateGateTiles() {
    const files = fs.readdirSync(levelsDir);
    let totalUpdated = 0;

    files.forEach(file => {
        if (!file.endsWith('.json')) return;

        const filePath = path.join(levelsDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        let data;
        
        try {
            data = JSON.parse(fileContent);
        } catch (e) {
            console.error(`Error parsing ${file}:`, e);
            return;
        }

        if (!data.entities || !Array.isArray(data.entities)) {
            return;
        }

        let fileUpdated = false;

        data.entities.forEach((entity, index) => {
            if (entity.type === 'gate') {
                if (!entity.properties) {
                    entity.properties = {};
                }
                const props = entity.properties;
                if (props.tileGid === undefined || props.tileGid === 150) {
                    console.log(`[${file}] Gate Entity #${index}: Updating tileGid from "${props.tileGid}" to 355`);
                    props.tileGid = 355;
                    fileUpdated = true;
                    totalUpdated++;
                }
            }
        });

        if (fileUpdated) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            console.log(`Saved updated file: ${file}`);
        }
    });

    console.log(`\nFinished updating gate tile GIDs. Total gates updated: ${totalUpdated}`);
}

updateGateTiles();
