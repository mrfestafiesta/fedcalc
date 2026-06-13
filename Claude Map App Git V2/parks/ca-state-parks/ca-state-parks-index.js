/**
 * ca-state-parks-index.js — CA State Parks MVP index generator
 *
 * Reads all individual CA State Park JSON files and generates a consolidated
 * index.json with all campground locations for efficient map rendering.
 *
 * Usage:    node parks/ca-state-parks/ca-state-parks-index.js
 * Requires: Node 18+
 *
 * Reads from: parks/ca-state-parks/*.json (individual park files)
 * Writes to:  parks/ca-state-parks/index.json
 */

const fs = require('fs');
const path = require('path');

// === CONFIG ===
const PARKS_DIR = __dirname;
const INDEX_PATH = path.join(PARKS_DIR, 'ca-state-parks-index.json');

/* === FACILITY ID GENERATION === */

function generateFacilityId(facility, parkName, existingIds) {
    if (!facility.name || facility.name.trim() === '') {
        return null;
    }

    let baseId = `ca-${facility.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\-]/g, '')
        .replace(/\-+/g, '-')
        .replace(/^\-|\-$/g, '')}`;

    if (!baseId || baseId === 'ca-') {
        return null;
    }

    let id = baseId;
    let counter = 1;
    while (existingIds.has(id)) {
        id = `${baseId}-${counter++}`;
    }

    return id;
}

async function main() {
    console.log('\n=== CA State Parks Index Generator ===\n');

    try {
        // 1. Read all park JSON files
        console.log('Scanning CA State Parks directory...');
        const files = fs.readdirSync(PARKS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
        console.log(`  Found ${files.length} park files\n`);

        if (files.length === 0) {
            console.log('No park files found. Exiting.\n');
            return;
        }

        // 2. Extract campgrounds from each park file
        console.log('Extracting campgrounds from park files...');
        const allCampgrounds = [];
        const existingIds = new Set();
        let totalFacilities = 0;
        let skippedInvalid = 0;

        files.forEach((file, idx) => {
            try {
                const filePath = path.join(PARKS_DIR, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                const parkName = data.meta?.name || file.replace('.json', '');
                const parkId = `ca-state-parks/${file.replace('.json', '')}`;
                const website = data.meta?.website || '';
                const facilities = data.facilities || [];
                totalFacilities += facilities.length;

                facilities.forEach(facility => {
                    if (facility.lat && facility.lng && facility.lat !== 0 && facility.lng !== 0) {
                        const facilityId = generateFacilityId(facility, parkName, existingIds);
                        if (!facilityId) {
                            console.warn(`    ⚠️  Skipping facility with invalid/missing name in ${parkName}`);
                            skippedInvalid++;
                            return;
                        }
                        existingIds.add(facilityId);

                        allCampgrounds.push({
                            facilityId,
                            name: facility.name || parkName,
                            lat: facility.lat,
                            lng: facility.lng,
                            state: 'CA',
                            parkId: parkId,
                            website: website,
                        });
                    }
                });

                console.log(`  ${idx + 1}/${files.length}: ${parkName} (${facilities.length} facilities)`);
            } catch (err) {
                console.warn(`  ERROR reading ${file}: ${err.message}`);
            }
        });

        console.log(`\n  Total facilities scanned: ${totalFacilities}`);
        console.log(`  Campgrounds with valid coordinates: ${allCampgrounds.length}`);
        if (skippedInvalid > 0) console.log(`  Skipped (invalid IDs): ${skippedInvalid}`);
        console.log();

        if (allCampgrounds.length === 0) {
            console.log('No campgrounds found. Exiting.\n');
            return;
        }

        // 3. Write index.json
        console.log('Writing index.json...');
        const indexFile = {
            meta: {
                agency: 'ca-state-parks',
                totalCampgrounds: allCampgrounds.length,
                lastUpdated: new Date().toISOString().split('T')[0],
                dataSource: 'local park files',
            },
            campgrounds: allCampgrounds,
        };

        try {
            fs.writeFileSync(INDEX_PATH, JSON.stringify(indexFile, null, 2));
            console.log(`  ✓ index.json written (${allCampgrounds.length} campgrounds)\n`);
        } catch (err) {
            console.error(`  FATAL: Failed to write index.json: ${err.message}`);
            process.exit(1);
        }

        // 4. Summary
        console.log('=== Done ===');
        console.log(`  Total CA State Parks campgrounds: ${allCampgrounds.length}`);
        console.log(`  Output: parks/ca-state-parks/index.json\n`);

    } catch (err) {
        console.error('\nFATAL:', err.message);
        process.exit(1);
    }
}

main();
