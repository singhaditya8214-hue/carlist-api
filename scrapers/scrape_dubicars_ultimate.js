import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_FILE = path.resolve(__dirname, '../data/unified_cars_data.json');

// Configuration
const CONFIG = {
    baseUrl: 'https://www.dubicars.com/search?o=&did=&gen=&trg=&moc=&c=new-and-used&ul=AE&cr=AED&mg=&yf=2018&yt=&set=bu&pf=120000&pt=800000&emif=&emit=&kf=&kt=80000&gi%5B%5D=1&gi%5B%5D=5&gi%5B%5D=6&f%5B%5D=25&eo%5B%5D=can-be-exported&eo%5B%5D=not-for-export&st%5B%5D=private&noi=30',
    outputFile: OUTPUT_FILE,
    headless: true,
    timeout: 60000,
    delayBetweenPages: 3000,
    delayBetweenListings: 1500,
    testMode: false,  // FULL MODE: Scrape all listings
    testLimit: 5,
    maxPages: 20  // Safety limit to prevent infinite loops
};
async function mergeAndSaveData(newData) {
    const outputPath = CONFIG.outputFile;
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    let existingData = [];
    try {
        const content = await fs.readFile(outputPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            existingData = parsed;
        }
    } catch (error) {
        existingData = [];
    }

    const existingLinks = new Set(
        existingData
            .filter(item => item && item.link)
            .map(item => item.link)
    );

    const now = new Date().toISOString();
    const newItems = [];

    for (const rawItem of newData) {
        if (!rawItem || !rawItem.link) continue;
        if (existingLinks.has(rawItem.link)) continue;

        const item = {
            source: rawItem.source || 'Dubicars',
            ...rawItem,
            date: now
        };

        newItems.push(item);
        existingLinks.add(item.link);
    }

    const combined = [...existingData, ...newItems];

    const seen = new Set();
    const deduped = [];
    for (const item of combined) {
        if (!item || !item.link) {
            deduped.push(item);
            continue;
        }
        const key = item.link;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
    }

    await fs.writeFile(outputPath, JSON.stringify(deduped, null, 2), 'utf-8');

    return {
        totalSaved: deduped.length,
        newlyAdded: newItems.length
    };
}

// Utility function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadExistingLinksFromFile() {
    try {
        const content = await fs.readFile(CONFIG.outputFile, 'utf-8');
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) return new Set();
        return new Set(
            parsed
                .filter(item => item && item.link)
                .map(item => item.link)
        );
    } catch (error) {
        return new Set();
    }
}

// Extract listing links from the main page
async function extractListingLinks(page) {
    console.log('Extracting listing links from current page...');

    await page.waitForSelector('a.image-container', { timeout: CONFIG.timeout });

    const links = await page.evaluate(() => {
        const linkElements = document.querySelectorAll('a.image-container');
        return Array.from(linkElements).map(el => {
            const href = el.getAttribute('href');
            // Handle both absolute and relative URLs
            if (href) {
                return href.startsWith('http') ? href : `https://www.dubicars.com${href}`;
            }
            return null;
        }).filter(link => link !== null);
    });

    console.log(`Found ${links.length} listing links`);
    return links;
}

// Extract car details from individual listing page
async function extractCarDetails(page, listingUrl) {
    console.log(`\nExtracting details from: ${listingUrl}`);

    try {
        await page.goto(listingUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
        await delay(2000); // Wait for dynamic content to load

        // Click "Call" button to reveal phone number if it exists
        try {
            const callButton = await page.$('a.call-dealer');
            if (callButton) {
                await callButton.click();
                await delay(2000); // Wait for phone number to appear
            }
        } catch (error) {
            console.log('Call button not found or already visible');
        }

        const carData = await page.evaluate(() => {
            const data = {
                source: 'Dubicars',
                link: window.location.href,
                image: '',
                phone_number: '',
                year: '',
                mileage: '',
                specs: '',
                price: '',
                price_numeric: null,
                owner_name: '',
                trim: '',
                location: 'Dubai' // Default location
            };

            // 1. Car Image - Try source element first, then img
            let imgSrc = '';
            const sourceEl = document.querySelector('source[media="(max-width:600px)"]');
            if (sourceEl) {
                imgSrc = sourceEl.getAttribute('srcset') || '';
            } else {
                const imageEl = document.querySelector('img[alt*=""]');
                if (imageEl) {
                    imgSrc = imageEl.getAttribute('src') || '';
                }
            }
            // Handle protocol-relative URLs
            if (imgSrc.startsWith('//')) {
                imgSrc = 'https:' + imgSrc;
            }
            data.image = imgSrc;

            // 2. Phone Number
            const phoneEl = document.querySelector('button.base-btn.btn-main.btn-lg.icon-phone');
            if (phoneEl) {
                data.phone_number = phoneEl.textContent.trim();
            }

            // 3. Listing Year (Model year)
            const yearElements = document.querySelectorAll('span');
            for (let i = 0; i < yearElements.length; i++) {
                if (yearElements[i].textContent.trim() === 'Model year' && yearElements[i + 1]) {
                    data.year = yearElements[i + 1].textContent.trim();
                    break;
                }
            }

            // 4. Mileage (Kilometers)
            for (let i = 0; i < yearElements.length; i++) {
                if (yearElements[i].textContent.trim() === 'Kilometers' && yearElements[i + 1]) {
                    data.mileage = yearElements[i + 1].textContent.trim();
                    break;
                }
            }

            // 5. Specs - Look for the link with title attribute
            const specsLink = document.querySelector('a[title="GCC"], a[title="American Specs"], a[title="European Specs"], a.text-underline[href*="/used/"]');
            if (specsLink) {
                const specsSpan = specsLink.querySelector('span');
                if (specsSpan) {
                    data.specs = specsSpan.textContent.trim();
                }
            }

            // 6. Price
            let priceText = '';

            // Primary source: meta description content
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) {
                const content = metaDesc.getAttribute('content') || '';
                // Look for patterns like "AED 169000" or "AED 169,000"
                const metaMatch = content.match(/AED\s*([\d,]+)/i);
                if (metaMatch && metaMatch[1]) {
                    priceText = `AED ${metaMatch[1]}`;
                }
            }

            // Fallback: existing visible price element
            if (!priceText) {
                const priceEl = document.querySelector('div.price.currency-price-field') ||
                    document.querySelector('div.currency-price-field');
                if (priceEl) {
                    priceText = priceEl.textContent.trim();
                }
            }

            if (priceText) {
                // Extract numeric value
                const numericMatch = priceText.match(/[\d,]+/);
                if (numericMatch) {
                    const numericPrice = numericMatch[0].replace(/,/g, '');
                    data.price_numeric = parseInt(numericPrice) || null;
                    data.price = `AED ${numericMatch[0]}`;
                }
            }

            // 7. Owner/Seller Name
            const ownerEl = document.querySelector('.seller-intro p.fs-16.fw-600');
            if (ownerEl) {
                data.owner_name = ownerEl.textContent.trim();
            }

            // 8. Trim (Vehicle type) - Look for li element with Vehicle type
            const trimLi = Array.from(document.querySelectorAll('li.fd-col.fw-500.text-dark')).find(li =>
                li.textContent.includes('Vehicle type')
            );
            if (trimLi) {
                const trimLink = trimLi.querySelector('a.text-underline');
                if (trimLink) {
                    const trimSpan = trimLink.querySelector('span');
                    if (trimSpan) {
                        data.trim = trimSpan.textContent.trim();
                    }
                }
            }

            return data;
        });

        // Display extracted data in a formatted way
        console.log('📊 EXTRACTED DATA:');
        console.log('├─ 🚗 Year:', carData.year || 'N/A');
        console.log('├─ 💰 Price:', carData.price || 'N/A');
        console.log('├─ 📏 Mileage:', carData.mileage || 'N/A');
        console.log('├─ 🔧 Specs:', carData.specs || 'N/A');
        console.log('├─ 🏷️  Trim:', carData.trim || 'N/A');
        console.log('├─ 👤 Owner:', carData.owner_name || 'N/A');
        console.log('├─ 📞 Phone:', carData.phone_number || 'N/A');
        console.log('├─ 📍 Location:', carData.location || 'N/A');
        console.log('├─ 🖼️  Image:', carData.image ? '✓ Found' : '❌ Missing');
        console.log('└─ 🔗 Link:', carData.link);

        // Add required fields for dashboard compatibility
        carData.id = `listing_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        carData.status = 'new';
        carData.created_at = new Date().toISOString();
        carData.updated_at = new Date().toISOString();
        carData.replies = [];

        return carData;

    } catch (error) {
        console.error(`Error extracting details from ${listingUrl}:`, error.message);
        return null;
    }
}

// Check if next page button exists and navigate to next page
async function goToNextPage(page) {
    try {
        console.log('🔍 Looking for Dubicars next page button...');

        // Dubicars-specific selectors for pagination
        const nextButtonSelectors = [
            // Most common Dubicars pagination selectors
            'a[rel="next"]',
            'a.btn[rel="next"]',
            'a.base-btn[rel="next"]',
            '.pagination a[rel="next"]',
            // Alternative selectors
            '.pagination .next',
            '.pagination a:contains("Next")',
            '.pagination a:contains(">")',
            'a[aria-label="Next"]',
            // Generic fallbacks
            '.pagination a:last-child:not(.disabled)',
            '.pager .next a'
        ];

        let nextButton = null;
        let usedSelector = '';

        // Try each selector until we find a button
        for (const selector of nextButtonSelectors) {
            try {
                nextButton = await page.$(selector);
                if (nextButton) {
                    usedSelector = selector;
                    console.log(`✓ Found next button with selector: ${selector}`);
                    break;
                }
            } catch (e) {
                // Continue to next selector
            }
        }

        if (!nextButton) {
            console.log('❌ No next page button found with any selector');

            // Try to find pagination info to see if we're on last page
            const pageInfo = await page.evaluate(() => {
                const pagination = document.querySelector('.pagination, .pager');
                return pagination ? pagination.textContent : 'No pagination found';
            });
            console.log(`📄 Pagination info: ${pageInfo}`);
            return false;
        }

        // Check if button is disabled or if we're on the last page
        const buttonInfo = await page.evaluate(btn => {
            return {
                isDisabled: btn.classList.contains('disabled') ||
                    btn.getAttribute('aria-disabled') === 'true' ||
                    btn.hasAttribute('disabled'),
                href: btn.getAttribute('href'),
                text: btn.textContent?.trim(),
                classes: btn.className
            };
        }, nextButton);

        console.log(`🔍 Button info:`, buttonInfo);

        if (buttonInfo.isDisabled) {
            console.log('❌ Next page button is disabled - reached last page');
            return false;
        }

        if (!buttonInfo.href || buttonInfo.href === '#') {
            console.log('❌ Next page button has no valid href - might be last page');
            return false;
        }

        console.log(`🔄 Navigating to next page: ${buttonInfo.href}`);

        // Get current URL to compare
        const currentUrl = page.url();

        // Navigate using href instead of clicking for more reliability
        const fullUrl = buttonInfo.href.startsWith('http') ? buttonInfo.href : `https://www.dubicars.com${buttonInfo.href}`;

        await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
        await delay(CONFIG.delayBetweenPages);

        // Verify we actually moved to a new page
        const newUrl = page.url();
        if (newUrl === currentUrl) {
            console.log('❌ URL did not change - might be on last page');
            return false;
        }

        // Wait for new page to load
        try {
            await page.waitForSelector('a.image-container', { timeout: CONFIG.timeout });
            console.log('✓ Next page loaded successfully');
            return true;
        } catch (e) {
            console.log('⚠️  Page loaded but listings selector not found - might be last page');
            return false;
        }

    } catch (error) {
        console.error('❌ Error navigating to next page:', error.message);
        return false;
    }
}

// Main scraping function
async function scrapeAllListings() {
    console.log('=== Dubicars Ultimate Scraper Started ===\n');

    const browser = await puppeteer.launch({
        headless: CONFIG.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
        defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();

    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let allCarData = [];
    let pageNumber = 1;

    try {
        console.log(`Navigating to: ${CONFIG.baseUrl}\n`);
        await page.goto(CONFIG.baseUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
        await delay(3000);
        const existingLinksAtStart = await loadExistingLinksFromFile();

        let hasNextPage = true;

        while (hasNextPage && pageNumber <= CONFIG.maxPages) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📄 Processing Page ${pageNumber} (Max: ${CONFIG.maxPages})`);
            console.log('='.repeat(60));

            // Extract all listing links from current page
            const listingLinks = await extractListingLinks(page);
            const filteredLinks = listingLinks.filter(link => !existingLinksAtStart.has(link));

            if (listingLinks.length === 0) {
                console.log('No listings found on this page');
                break;
            }

            if (filteredLinks.length === 0) {
                console.log('All listings on this page already exist in unified_cars_data.json, skipping page');
                hasNextPage = await goToNextPage(page);
                if (hasNextPage) {
                    pageNumber++;
                    console.log(`🚀 Moving to page ${pageNumber}...`);
                }
                continue;
            }

            // Process each listing
            const maxListings = CONFIG.testMode ? Math.min(CONFIG.testLimit, filteredLinks.length) : filteredLinks.length;

            console.log(`\n🎯 Processing ${maxListings} listings on this page...`);

            for (let i = 0; i < maxListings; i++) {
                console.log(`\n${'─'.repeat(50)}`);
                console.log(`🔄 [${i + 1}/${maxListings}] Processing listing ${i + 1}...`);
                console.log(`🔗 URL: ${filteredLinks[i]}`);

                try {
                    const carData = await extractCarDetails(page, filteredLinks[i]);

                    if (carData) {
                        allCarData.push(carData);
                        console.log(`\n✅ SUCCESS! Total cars scraped so far: ${allCarData.length}`);

                        // Show summary of this car
                        const summary = `${carData.year || 'Unknown'} | ${carData.price || 'No price'} | ${carData.owner_name || 'No owner'}`;
                        console.log(`📋 Quick Summary: ${summary}`);
                    } else {
                        console.log('❌ Failed to extract data from this listing');
                    }

                    // Delay between listings
                    if (i < maxListings - 1) {
                        console.log(`⏳ Waiting ${CONFIG.delayBetweenListings}ms before next listing...`);
                        await delay(CONFIG.delayBetweenListings);
                    }

                } catch (error) {
                    console.error(`❌ Error processing listing ${i + 1}:`, error.message);
                    // Continue to next listing
                }
            }

            // Exit early if in test mode
            if (CONFIG.testMode && allCarData.length >= CONFIG.testLimit) {
                console.log(`\n✓ Test mode: Reached limit of ${CONFIG.testLimit} listings`);

                const { totalSaved, newlyAdded } = await mergeAndSaveData(allCarData);
                console.log(`💾 ${newlyAdded} new listings added to ${CONFIG.outputFile} (total ${totalSaved} listings now)`);
                break;
            }

            // Navigate back to listing page after processing all listings on current page
            try {
                await page.goto(`${CONFIG.baseUrl}&page=${pageNumber}`, {
                    waitUntil: 'networkidle2',
                    timeout: CONFIG.timeout
                });
                await delay(1000);
            } catch (error) {
                console.error('Error navigating back to listing page:', error.message);
            }

            // Save progress after each page (merge into unified file)
            const { totalSaved, newlyAdded } = await mergeAndSaveData(allCarData);
            console.log(`\n💾 ${newlyAdded} new listings added to ${CONFIG.outputFile} (total ${totalSaved} listings now)`);

            // Show page completion summary
            console.log(`\n📊 PAGE ${pageNumber} SUMMARY:`);
            console.log(`├─ 🔗 Listings found: ${listingLinks.length}`);
            console.log(`├─ ✅ Successfully processed: ${maxListings}`);
            console.log(`├─ 📈 Total cars scraped: ${allCarData.length}`);
            console.log(`└─ 💾 Data saved to: ${CONFIG.outputFile}`);

            // Try to go to next page
            console.log(`\n${'═'.repeat(60)}`);
            hasNextPage = await goToNextPage(page);
            if (hasNextPage) {
                pageNumber++;
                console.log(`🚀 Moving to page ${pageNumber}...`);
            } else {
                console.log('🏁 No more pages to process');
            }
        }

        console.log(`\n${'🎉'.repeat(20)}`);
        console.log('🏆 === SCRAPING COMPLETED SUCCESSFULLY === 🏆');
        console.log(`${'🎉'.repeat(20)}\n`);

        console.log('📊 FINAL RESULTS:');
        console.log(`├─ 📄 Pages processed: ${pageNumber}`);
        console.log(`├─ 🚗 Total cars scraped: ${allCarData.length}`);
        console.log(`├─ 💾 Output file: ${CONFIG.outputFile}`);
        console.log(`├─ ⚙️  Test mode: ${CONFIG.testMode ? 'ON' : 'OFF'}`);
        if (CONFIG.testMode) {
            console.log(`├─ 🎯 Test limit: ${CONFIG.testLimit} cars`);
        }
        console.log(`└─ ⏱️  Completed at: ${new Date().toLocaleString()}`);

        if (allCarData.length > 0) {
            console.log('\n🔍 SAMPLE DATA (First car):');
            const firstCar = allCarData[0];
            console.log(`├─ Year: ${firstCar.year || 'N/A'}`);
            console.log(`├─ Price: ${firstCar.price || 'N/A'}`);
            console.log(`├─ Owner: ${firstCar.owner_name || 'N/A'}`);
            console.log(`└─ Link: ${firstCar.link || 'N/A'}`);
        }

        console.log(`\n${'═'.repeat(60)}`);

    } catch (error) {
        console.error('\n❌ Fatal error:', error);

        // Save whatever data we have
        if (allCarData.length > 0) {
            const { totalSaved, newlyAdded } = await mergeAndSaveData(allCarData);
            console.log(`Partial data merged. ${newlyAdded} new listings added. Total listings in file: ${totalSaved}`);
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
