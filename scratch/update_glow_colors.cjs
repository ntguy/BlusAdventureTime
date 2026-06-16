const fs = require('fs');
const path = require('path');

const levelsDir = '/Users/nicalai.guy/GD/Blu\'s Adventure Time/public/assets/levels';

const colorMap = {
    '1': '0xf86b50',
    '2': '0xcca047',
    '3': '0x4fa852', // More green
    '4': '0x4895ef', // More blue and brighter
    '5': '0x9353d3', // More purple
    '6': '0xcc8b8c'
};

function updateLevels() {
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
            if (!entity.properties) return;

            const props = entity.properties;
            const channelVal = props.channel || props.triggerChannel || props.listenChannel || props.targetChannel;

            if (channelVal !== undefined && channelVal !== null && channelVal !== '') {
                const channelKey = String(channelVal).trim();
                const targetColor = colorMap[channelKey];

                if (targetColor) {
                    if (props.glowColor !== targetColor) {
                        console.log(`[${file}] Entity #${index} (${entity.type || 'unknown'}): Channel ${channelKey} -> Updating glowColor from "${props.glowColor}" to "${targetColor}"`);
                        props.glowColor = targetColor;
                        fileUpdated = true;
                        totalUpdated++;
                    }
                } else {
                    console.warn(`[${file}] Entity #${index} has channel "${channelKey}" which is not mapped in the colorMap.`);
                }
            }
        });

        if (fileUpdated) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            console.log(`Saved updated file: ${file}`);
        }
    });

    console.log(`\nFinished updating glow colors. Total entities updated: ${totalUpdated}`);
}

updateLevels();
