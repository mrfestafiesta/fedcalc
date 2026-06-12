/**
 * generate.js — Federal Developed Campgrounds Master Generator (June 2026)
 *
 * Fetches ALL federal developed campgrounds from RIDB and creates a unified index
 * with all 5,264 campgrounds grouped by managing agency (ParentOrgID).
 *
 * Key Data Insights:
 * - RIDB contains 15,286 total facilities across all agencies
 * - 5,264 have type="Campground" and valid GPS coordinates (lat/lng != 0)
 * - Agencies (by ParentOrgID count): USFS (3407), ACOE (953), NPS (566), BLM (306), USBR (13), USFWS (6), etc.
 * - State codes: 4,189 campgrounds have state data (79.6%), 1,075 have state=null (future: geocode via reverse lookup)
 * - organizationID filter unreliable: queryinOrganizationID=126 returns mixed agencies, not just BLM
 * - Solution: Query all facilities, then filter by ParentOrgID field for accurate agency identification
 *
 * Usage:    node parks/federal/generate.js
 * Requires: Node 18+, RIDB_API_KEY in .env file
 *
 * Output: /parks/federal/index.json
 * Structure: {
 *   meta: { name, totalCampgrounds, campgroundsWithState, lastUpdated, dataSource, agencies, agencyStats },
 *   campgrounds: [ { facilityId, name, lat, lng, state (or null), parentOrgId, agency }, ... ]
 * }
 *
 * Rate Limiting: 50 requests/minute enforced by rateLimitedFetch()
 * Total Runtime: ~45 minutes (16 facilities pages + 17 addresses pages at 50 req/min)
 */

const fs = require('fs');
const path = require('path');

// Load .env from project root
const envPath = path.resolve(__dirname, '../../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n');
envLines.forEach(line => {
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=').trim();
    if (key && value) {
        process.env[key.trim()] = value;
    }
});

// === CONFIG ===
const RIDB_API_KEY = process.env.RIDB_API_KEY;
if (!RIDB_API_KEY) {
    console.error('FATAL: RIDB_API_KEY not found in .env file');
    process.exit(1);
}

const RIDB_BASE = 'https://ridb.recreation.gov/api/v1';
const INDEX_PATH = path.join(__dirname, 'index.json');

// Rate limiter: max 50 requests/minute
let requestCount = 0;
const REQUEST_WINDOW = 60000;
const MAX_REQUESTS = 50;

// Agency name mapping
const AGENCY_NAMES = {
    126: 'BLM',
    127: 'USFWS',
    128: 'NPS',
    129: 'USBR',
    130: 'ACOE',
    131: 'USFS',
    250: 'Presidio Trust',
    260: 'Navy',
};

async function rateLimitedFetch(url, retries = 3) {
    if (requestCount >= MAX_REQUESTS) {
        const now = Date.now();
        await new Promise(resolve => setTimeout(resolve, REQUEST_WINDOW - (now % REQUEST_WINDOW) + 100));
        requestCount = 0;
    }

    const urlWithKey = new URL(url);
    urlWithKey.searchParams.append('apikey', RIDB_API_KEY);

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            requestCount++;
            const response = await fetch(urlWithKey.toString());
            if (!response.ok) {
                if (response.status === 429 || response.status === 503) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.warn(`  Rate limited/unavailable. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (err) {
            if (attempt < retries) {
                const delay = 1000 * attempt;
                console.warn(`  Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw err;
        }
    }
}

// === MAIN ===

async function main() {
    console.log('\n=== Federal Developed Campgrounds Master Generator ===\n');

    try {
        // 1. Fetch all facilities (no organization filter - get all agencies)
        console.log('Fetching all federal facilities from RIDB...');
        const campgrounds = [];
        let offset = 0;
        const pageSize = 1000;
        let totalCount = null;

        while (totalCount === null || offset < totalCount) {
            const facilitiesUrl = `${RIDB_BASE}/facilities?limit=${pageSize}&offset=${offset}`;
            const facilitiesData = await rateLimitedFetch(facilitiesUrl);
            const pageData = facilitiesData.RECDATA || [];

            // Filter for any campground with GPS coordinates
            const pageCampgrounds = pageData.filter(f =>
                f.FacilityTypeDescription &&
                f.FacilityTypeDescription.toLowerCase().includes('campground') &&
                f.FacilityLatitude &&
                f.FacilityLatitude !== 0 &&
                f.FacilityLongitude &&
                f.FacilityLongitude !== 0
            ).map(f => ({
                facilityId: f.FacilityID,
                name: f.FacilityName,
                lat: f.FacilityLatitude,
                lng: f.FacilityLongitude,
                parentOrgId: f.ParentOrgID,
            }));

            campgrounds.push(...pageCampgrounds);

            if (totalCount === null) {
                totalCount = facilitiesData.METADATA?.RESULTS?.TOTAL_COUNT || campgrounds.length;
                console.log(`  Total facilities available: ${totalCount}`);
            }

            offset += pageSize;
            console.log(`  Fetched ${Math.min(offset, totalCount)}/${totalCount} facilities. Found ${campgrounds.length} campgrounds so far...`);
        }

        console.log(`\n  Total federal developed campgrounds: ${campgrounds.length}`);

        if (campgrounds.length === 0) {
            console.log('No campgrounds found. Exiting.\n');
            return;
        }

        // 2. Fetch all facility addresses to get state codes
        console.log('\nFetching facility addresses for state codes...');
        const stateMap = {};
        let addrOffset = 0;
        let addrTotalCount = null;

        while (addrTotalCount === null || addrOffset < addrTotalCount) {
            const addressUrl = `${RIDB_BASE}/facilityaddresses?limit=${pageSize}&offset=${addrOffset}`;
            const addressData = await rateLimitedFetch(addressUrl);
            const addrPageData = addressData.RECDATA || [];

            addrPageData.forEach(addr => {
                if (addr.FacilityID && addr.AddressStateCode) {
                    stateMap[addr.FacilityID] = addr.AddressStateCode;
                }
            });

            if (addrTotalCount === null) {
                addrTotalCount = addressData.METADATA?.RESULTS?.TOTAL_COUNT || addrPageData.length;
                console.log(`  Total facility addresses available: ${addrTotalCount}`);
            }

            addrOffset += pageSize;
            console.log(`  Fetched ${Math.min(addrOffset, addrTotalCount)}/${addrTotalCount} addresses. Mapped ${Object.keys(stateMap).length} states so far...`);
        }

        console.log(`\n  Successfully mapped ${Object.keys(stateMap).length} facilities to states`);

        // 3. Add state codes to campgrounds (or null if missing)
        console.log('\nAdding state codes to campgrounds...');
        let stateCount = 0;
        campgrounds.forEach(camp => {
            const state = stateMap[camp.facilityId];
            camp.state = state || null;  // Always include, null if missing
            if (state) {
                stateCount++;
            }
        });
        console.log(`  Added state to ${stateCount}/${campgrounds.length} campgrounds`);

        if (stateCount < campgrounds.length) {
            console.warn(`  WARNING: ${campgrounds.length - stateCount} campgrounds missing state code`);
        }

        // 4. Add agency names based on ParentOrgID
        console.log('\nMapping agencies...');
        const agencyStats = {};
        campgrounds.forEach(camp => {
            const agency = AGENCY_NAMES[camp.parentOrgId] || `Unknown (${camp.parentOrgId})`;
            camp.agency = agency;

            if (!agencyStats[agency]) {
                agencyStats[agency] = 0;
            }
            agencyStats[agency]++;
        });

        console.log('  Campgrounds by agency:');
        Object.entries(agencyStats).sort((a, b) => b[1] - a[1]).forEach(([agency, count]) => {
            console.log(`    ${agency}: ${count}`);
        });

        // 5. Write index.json
        console.log('\nWriting index.json...');
        const indexFile = {
            meta: {
                name: 'Federal Developed Campgrounds',
                totalCampgrounds: campgrounds.length,
                campgroundsWithState: stateCount,
                lastUpdated: new Date().toISOString().split('T')[0],
                dataSource: 'ridb.recreation.gov',
                agencies: AGENCY_NAMES,
                agencyStats: agencyStats,
            },
            campgrounds,
        };

        try {
            fs.writeFileSync(INDEX_PATH, JSON.stringify(indexFile, null, 2));
            console.log(`  ✓ index.json written (${campgrounds.length} campgrounds)\n`);
        } catch (err) {
            console.error(`  FATAL: Failed to write index.json: ${err.message}`);
            process.exit(1);
        }

        // 6. Summary
        console.log('=== Done ===');
        console.log(`  Total campgrounds: ${campgrounds.length}`);
        console.log(`  With state codes: ${stateCount}`);
        console.log(`  Agencies included: ${Object.keys(agencyStats).length}`);
        console.log(`  Output: parks/federal/index.json\n`);

    } catch (err) {
        console.error('\nFATAL:', err.message);
        process.exit(1);
    }
}

main();
