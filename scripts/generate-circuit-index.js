const fs = require('fs');
const path = require('path');

const CIRCUITS_DIR = path.join(__dirname, '../public/circuits');
const HISTORY_WALK_URL = 'https://stefanmartin1967.github.io/history-walk/';

function getTimestampId() {
    return `HW-${Date.now()}`;
}

function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, c => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;'
    }[c]));
}

function processDirectory(mapId) {
    const dirPath = path.join(CIRCUITS_DIR, mapId);
    const indexFilePath = path.join(CIRCUITS_DIR, `${mapId}.json`);

    console.log(`Processing map: ${mapId}`);

    let oldIndex = [];
    if (fs.existsSync(indexFilePath)) {
        try {
            oldIndex = JSON.parse(fs.readFileSync(indexFilePath, 'utf8'));
        } catch (e) {
            console.warn(`Could not parse existing index for ${mapId}:`, e.message);
        }
    }

    const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.gpx'));
    const newIndex = [];

    files.forEach(filename => {
        const filePath = path.join(dirPath, filename);
        let content = fs.readFileSync(filePath, 'utf8');
        let fileChanged = false;

        // 1. Extract Metadata
        let id = null;
        let name = filename.replace('.gpx', '').replace(/_/g, ' '); // Fallback name
        let description = '';

        // Extract ID
        const idMatch = content.match(/\[HW-ID:(HW-\d+)\]/);
        if (idMatch) {
            id = idMatch[1];
        }

        // Extract Name
        const nameMatch = content.match(/<name>(.*?)<\/name>/);
        if (nameMatch) {
            name = nameMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1'); // Handle CDATA
            // CLEANUP: Remove Wikiloc branding
            name = name.replace(/^Wikiloc\s*-\s*/i, '').replace(/Wikiloc/gi, '').trim();
        }

        // Extract Description
        const descMatch = content.match(/<desc>(.*?)<\/desc>/); // Simple regex, might miss multiline CDATA but robust enough for basic
        if (descMatch) {
            description = descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
        }

        // 2. ID Resolution & Preservation
        let existingEntry = null;

        // Try finding by ID first
        if (id) {
            existingEntry = oldIndex.find(c => c.id === id);
        }

        // Fallback: Find by filename (handle migration)
        if (!existingEntry) {
            // Check for exact match or path match (e.g. "djerba/file.gpx" matches "file.gpx")
            existingEntry = oldIndex.find(c => {
                const oldBase = path.basename(c.file);
                return oldBase === filename;
            });
        }

        if (!id) {
            if (existingEntry && existingEntry.id) {
                id = existingEntry.id;
                console.log(`  Matched existing ID for ${filename}: ${id}`);
            } else {
                id = getTimestampId();
                console.log(`  Generated new ID for ${filename}: ${id}`);
            }

            // INJECT ID into file
            const linkTag = `
    <link href="${HISTORY_WALK_URL}">
      <text>History Walk [HW-ID:${id}]</text>
    </link>`;

            if (content.includes('<metadata>')) {
                content = content.replace('</metadata>', `${linkTag}\n  </metadata>`);
            } else {
                // Insert metadata after <gpx ...>
                const metadataBlock = `
  <metadata>
    <name>${escapeXml(name)}</name>
    ${linkTag}
  </metadata>`;
                content = content.replace(/<gpx[^>]*>/, match => `${match}\n${metadataBlock}`);
            }
            fileChanged = true;
        }

        // 3. Build New Entry
        // Merge with existing data to preserve manual fields (poiIds, transport)
        const entry = {
            id: id,
            name: name,
            file: `${mapId}/${filename}`, // Relative path for the app
            description: description,
            distance: existingEntry ? existingEntry.distance : "0 km", // Keep old distance or default (could calc from track but expensive here)
            isOfficial: true,
            poiIds: existingEntry ? existingEntry.poiIds : [],
            transport: existingEntry && existingEntry.transport ? existingEntry.transport : undefined
        };

        // Clean up undefined
        if (!entry.transport) delete entry.transport;

        newIndex.push(entry);

        if (fileChanged) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`  Updated GPX file with ID: ${filename}`);
        }
    });

    // Write new index
    fs.writeFileSync(indexFilePath, JSON.stringify(newIndex, null, 2), 'utf8');
    console.log(`Saved index for ${mapId} with ${newIndex.length} circuits.`);
}

function main() {
    if (!fs.existsSync(CIRCUITS_DIR)) {
        console.error("Circuits directory not found.");
        process.exit(1);
    }

    const entries = fs.readdirSync(CIRCUITS_DIR, { withFileTypes: true });

    entries.forEach(entry => {
        if (entry.isDirectory()) {
            processDirectory(entry.name);
        }
    });
}

main();
