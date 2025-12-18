import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_FILE = path.resolve(__dirname, '../data/unified_cars_data.json');

// Configuration
const CONFIG = {
    baseUrl: 'https://uae.yallamotor.com/used-cars/pr_120000_10000000/km_100_80000/sl_individual/tr_automatic/ft_petrol/rs_1/rs_3/rs_10',
    outputFile: OUTPUT_FILE,
    headless: false,  // Show browser for debugging
    timeout: 120000,  // Increased to 120 seconds for slow pages
    delayBetweenPages: 2000,
    delayBetweenListings: 1500
};

// Utility function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Load existing data from file
async function loadExistingData() {
    try {
        const fileContent = await fs.readFile(CONFIG.outputFile, 'utf-8');
        const data = JSON.parse(fileContent);
        console.log(`📂 Loaded ${data.length} existing listings from file`);
        return data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('📂 No existing data file found, starting fresh');
            return [];
        }
        console.error('⚠️  Error loading existing data:', error.message);
        return [];
    }
}

// Generate unique ID from link
function generateId(link) {
    const match = link.match(/\/(\d+)$/);
    return match ? `yallamotor_${match[1]}` : `yallamotor_${Buffer.from(link).toString('base64').substring(0, 20)}`;
}

// Merge new listings with existing data
function mergeListings(existingData, newData) {
    console.log('\n📊 Merging data...');
    console.log(`Existing listings: ${existingData.length}`);
    console.log(`New scraped listings: ${newData.length}`);

    const existingMap = new Map();
    existingData.forEach(listing => {
        existingMap.set(listing.link, listing);
    });

    let addedCount = 0;
    let updatedCount = 0;

    newData.forEach(newListing => {
        const existing = existingMap.get(newListing.link);

        if (existing) {
            // Update existing listing but preserve status and created_at
            existing.image = newListing.image;
            existing.phone_number = newListing.phone_number;
            existing.year = newListing.year;
            existing.mileage = newListing.mileage;
            existing.specs = newListing.specs;
            existing.price = newListing.price;
            existing.price_numeric = newListing.price_numeric;
            existing.owner_name = newListing.owner_name;
            existing.trim = newListing.trim;
            existing.location = newListing.location;
            existing.whatsapp_link = newListing.whatsapp_link;
            existing.updated_at = new Date().toISOString();
            updatedCount++;
        } else {
            // Add new listing with metadata
            const now = new Date().toISOString();
            existingMap.set(newListing.link, {
                id: generateId(newListing.link),
                source: 'YallaMotor',
                ...newListing,
                status: 'new',
                created_at: now,
                updated_at: now,
                date: now.split('T')[0]
            });
            addedCount++;
        }
    });

    const mergedData = Array.from(existingMap.values());

    console.log(`✅ Merge complete:`);
    console.log(`   - Added: ${addedCount} new listings`);
    console.log(`   - Updated: ${updatedCount} existing listings`);
    console.log(`   - Total: ${mergedData.length} listings`);

    return mergedData;
}

// Extract listing links from the main page
async function extractListingLinks(page) {
    console.log('Extracting listing links from current page...');

    try {
        // Wait for page to load with a shorter timeout first
        await page.waitForSelector('script[type="application/ld+json"], a[href*="/used-cars/"]', {
            timeout: 30000
        });
    } catch (error) {
        console.log('⚠️ Page took longer to load, trying alternative approach...');
        // Give it more time
        await delay(5000);
    }

    const links = await page.evaluate(() => {
        const BASE_URL = 'https://uae.yallamotor.com';
        const carLinks = [];

        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));

        const addFromItemList = (itemList) => {
            if (!itemList || itemList['@type'] !== 'ItemList' || !Array.isArray(itemList.itemListElement)) return;
            for (const item of itemList.itemListElement) {
                if (!item || typeof item !== 'object') continue;
                const url = item.url;
                if (!url || !url.match(/^\/used-cars\/[^\/]+\/[^\/]+\/\d{4}\/used-/)) continue;
                const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
                carLinks.push(fullUrl);
            }
        };

        for (const script of scripts) {
            let json;
            try {
                json = JSON.parse(script.textContent.trim());
            } catch (e) {
                continue;
            }

            if (Array.isArray(json)) {
                for (const obj of json) {
                    if (obj && typeof obj === 'object' && obj['@type'] === 'ItemList') {
                        addFromItemList(obj);
                    }
                }
            } else if (json && typeof json === 'object') {
                if (json['@type'] === 'ItemList') {
                    addFromItemList(json);
                }
            }
        }

        if (carLinks.length === 0) {
            const linkElements = document.querySelectorAll('a.black-link[data-turbolinks="false"]');
            for (const el of linkElements) {
                const href = el.getAttribute('href');
                if (href && href.match(/^\/used-cars\/[^\/]+\/[^\/]+\/\d{4}\/used-/)) {
                    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                    carLinks.push(fullUrl);
                }
            }
        }

        return carLinks;
    });

    const uniqueLinks = [...new Set(links)];
    console.log(`Found ${uniqueLinks.length} unique listing links`);
    return uniqueLinks;
}

// Extract car details from individual listing page using detailed JSON from __next_f.push()
async function extractCarDetails(page, listingUrl) {
    console.log(`\nExtracting details from: ${listingUrl}`);

    try {
        await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
        await delay(2000);

        const carData = await page.evaluate(() => {
            const data = {
                link: window.location.href,
                image: '',
                phone_number: '',
                whatsapp_link: '',
                year: '',
                mileage: '',
                specs: '',
                price: '',
                price_numeric: null,
                owner_name: '',
                trim: '',
                location: ''
            };

            // Extract detailed JSON from __next_f.push() in page source
            try {
                const scripts = Array.from(document.querySelectorAll('script'));
                let detailedData = null;
                let schemaData = null;

                // First, find the detailed data with en.user
                for (const script of scripts) {
                    const content = script.textContent || '';

                    // Look for __next_f.push() with en.user data
                    const pushMatches = content.matchAll(/self\.__next_f\.push\(\[1,"(.+?)"\]\)/g);

                    for (const match of pushMatches) {
                        try {
                            let jsonStr = match[1]
                                .replace(/\\"/g, '"')
                                .replace(/\\\\/g, '\\')
                                .replace(/\\n/g, '')
                                .replace(/\\r/g, '');

                            // Look for the pattern with "en":{...} structure
                            if (jsonStr.includes('"en":{') && jsonStr.includes('"user":{')) {
                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    if (parsed.en && parsed.en.user) {
                                        detailedData = parsed;
                                        break;
                                    }
                                } catch (e) {
                                    // Continue searching
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }

                    if (detailedData) break;
                }

                // Second, find schema.org JSON-LD for price, year, mileage, specs
                const ldJsonScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
                for (const script of ldJsonScripts) {
                    try {
                        const json = JSON.parse(script.textContent.trim());
                        const types = Array.isArray(json['@type']) ? json['@type'] : [json['@type']];
                        if (types.includes('Product') || types.includes('Car')) {
                            schemaData = json;
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                // Extract from detailed data (en.user)
                if (detailedData) {
                    // owner_name
                    if (detailedData.en && detailedData.en.user && detailedData.en.user.name) {
                        data.owner_name = detailedData.en.user.name;
                    }

                    // phone_number
                    if (detailedData.en && detailedData.en.user && detailedData.en.user.phone) {
                        data.phone_number = detailedData.en.user.phone;

                        // whatsapp_link
                        data.whatsapp_link = `https://wa.me/${detailedData.en.user.phone.replace('+', '')}`;
                    }

                    // image
                    if (detailedData.media && detailedData.media.pictures && detailedData.media.pictures.slideshow_picture) {
                        data.image = detailedData.media.pictures.slideshow_picture[0] || '';
                    }

                    // trim - from version.title
                    if (detailedData.en && detailedData.en.version && detailedData.en.version.title) {
                        data.trim = detailedData.en.version.title;
                    }

                    // location - from city.title
                    if (detailedData.en && detailedData.en.city && detailedData.en.city.title) {
                        data.location = detailedData.en.city.title;
                    }
                }

                // Extract from schema.org JSON-LD (price, year, mileage, specs)
                if (schemaData) {
                    // price
                    if (schemaData.offers && schemaData.offers.price) {
                        const priceValue = parseInt(schemaData.offers.price);
                        if (priceValue) {
                            data.price = `AED ${priceValue.toLocaleString()}`;
                            data.price_numeric = priceValue;
                        }
                    }

                    // mileage
                    if (schemaData.mileageFromOdometer && schemaData.mileageFromOdometer.value != null) {
                        const mileageValue = schemaData.mileageFromOdometer.value;
                        data.mileage = `${Number(mileageValue).toLocaleString()} KM`;
                    }

                    // year
                    const yearValue = schemaData.modelDate || schemaData.vehicleModelDate;
                    if (yearValue) {
                        data.year = String(yearValue);
                    }

                    // specs - infer from description or other fields
                    // Schema.org doesn't have regional_specs directly, but we can check the description
                    if (schemaData.description && schemaData.description.toLowerCase().includes('gcc')) {
                        data.specs = 'GCC Specs';
                    } else if (schemaData.description && schemaData.description.toLowerCase().includes('us spec')) {
                        data.specs = 'US Specs';
                    } else if (schemaData.description && schemaData.description.toLowerCase().includes('european')) {
                        data.specs = 'European Specs';
                    }
                }

                // Fallback: Extract specs from DOM if not found in schema
                if (!data.specs) {
                    const specsDiv = document.querySelector('div.text-base.font-semibold.text-gray-900[title]');
                    if (specsDiv && specsDiv.getAttribute('title')) {
                        data.specs = specsDiv.getAttribute('title');
                    }
                }

            } catch (error) {
                console.error('Error extracting data:', error);
            }

            return data;
        });

        console.log(`✓ Extracted: ${carData.year} - ${carData.price} - ${carData.location} - Phone: ${carData.phone_number ? 'Yes' : 'No'} - Owner: ${carData.owner_name || 'N/A'}`);
        return carData;

    } catch (error) {
        console.error(`Error extracting details from ${listingUrl}:`, error.message);
        return null;
    }
}

// Check if next page exists and navigate to it
async function goToNextPage(page, currentPage) {
    try {
        const nextPageNumber = currentPage + 1;
        const nextPageUrl = `${CONFIG.baseUrl}?page=${nextPageNumber}`;

        console.log(`Attempting to navigate to page ${nextPageNumber}...`);

        await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
        await delay(CONFIG.delayBetweenPages);

        // Check if there are listings on this page
        const hasListings = await page.evaluate(() => {
            // Check for JSON-LD script with ItemList
            const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            for (const script of scripts) {
                try {
                    const json = JSON.parse(script.textContent.trim());
                    if (json['@type'] === 'ItemList' && Array.isArray(json.itemListElement) && json.itemListElement.length > 0) {
                        return true;
                    }
                } catch (e) {
                    continue;
                }
            }
            // Fallback: check for listing links
            const links = document.querySelectorAll('a[href*="/used-cars/"]');
            return links.length > 0;
        });

        if (!hasListings) {
            console.log('No listings found on next page');
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error navigating to next page:', error.message);
        return false;
    }
}

// Main scraping function
async function scrapeAllListings() {
    console.log('=== YallaMotor Ultimate Scraper Started ===\n');
    console.log('🎯 Mode: Continuous pagination (scrape ALL pages)\n');

    const existingData = await loadExistingData();

    const browser = await puppeteer.launch({
        headless: CONFIG.headless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--window-size=1920,1080'
        ],
        defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();

    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Remove webdriver flag
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });

    let newlyScrapedData = [];
    let pageNumber = 1;

    try {
        console.log(`Navigating to: ${CONFIG.baseUrl}?page=1\n`);
        await page.goto(`${CONFIG.baseUrl}?page=1`, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
        await delay(3000);

        let hasNextPage = true;

        while (hasNextPage) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`Processing Page ${pageNumber}`);
            console.log('='.repeat(60));

            const listingLinks = await extractListingLinks(page);

            if (listingLinks.length === 0) {
                console.log('No listings found on this page');
                break;
            }

            for (let i = 0; i < listingLinks.length; i++) {
                console.log(`\n[${i + 1}/${listingLinks.length}] Processing listing...`);

                const carData = await extractCarDetails(page, listingLinks[i]);

                if (carData) {
                    newlyScrapedData.push(carData);
                    console.log(`✓ Total cars scraped this session: ${newlyScrapedData.length}`);
                }

                if (i < listingLinks.length - 1) {
                    await delay(CONFIG.delayBetweenListings);
                }
            }

            // Merge and save progress after each page
            const mergedData = mergeListings(existingData, newlyScrapedData);
            await fs.writeFile(CONFIG.outputFile, JSON.stringify(mergedData, null, 2), 'utf-8');
            console.log(`\n✓ Progress saved to ${CONFIG.outputFile}`);

            hasNextPage = await goToNextPage(page, pageNumber);
            if (hasNextPage) {
                pageNumber++;
                console.log(`\n➡️  Moving to page ${pageNumber}...`);
            } else {
                console.log(`\n🏁 Reached the last page (page ${pageNumber})`);
            }
        }

        // Final merge and save
        const finalMergedData = mergeListings(existingData, newlyScrapedData);
        await fs.writeFile(CONFIG.outputFile, JSON.stringify(finalMergedData, null, 2), 'utf-8');

        console.log(`\n${'='.repeat(60)}`);
        console.log('=== Scraping Completed ===');
        console.log(`Pages scraped: ${pageNumber}`);
        console.log(`New listings found: ${newlyScrapedData.length}`);
        console.log(`Total listings in database: ${finalMergedData.length}`);
        console.log(`Data saved to: ${CONFIG.outputFile}`);
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Fatal error:', error);

        if (newlyScrapedData.length > 0) {
            const mergedData = mergeListings(existingData, newlyScrapedData);
            await fs.writeFile(CONFIG.outputFile, JSON.stringify(mergedData, null, 2), 'utf-8');
            console.log(`Partial data saved: ${newlyScrapedData.length} new cars, ${mergedData.length} total`);
        }
    } finally {
        try {
            await page.close();
            await delay(1000);
            await browser.close();
        } catch (error) {
            console.error('Error closing browser:', error.message);
        }
    }
}

// Run the scraper
scrapeAllListings().catch(console.error);
