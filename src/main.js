import { Actor } from 'apify';
import { chromium } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { checkProfile, saveProfile, getRecentMessageStyles, getAllProcessedUrls } from './supabase-client.js';

// Helper function for random delays (with more variance)
const randomDelay = (min, max) => {
    // Add slight randomness to make timing less predictable
    const variance = Math.random() * 0.5; // 0-50% extra variance
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    const finalDelay = delay * (1 + variance);
    return new Promise(resolve => setTimeout(resolve, finalDelay * 1000));
};

// Human-like mouse movement simulation
const simulateHumanMouse = async (page) => {
    const viewport = page.viewportSize();
    if (!viewport) return;

    // Random starting position
    const startX = Math.floor(Math.random() * viewport.width * 0.8) + 100;
    const startY = Math.floor(Math.random() * viewport.height * 0.8) + 100;

    // Move to random position with slight curve
    await page.mouse.move(startX, startY, { steps: Math.floor(Math.random() * 10) + 5 });

    // Sometimes hover over an element briefly
    if (Math.random() > 0.7) {
        await page.waitForTimeout(Math.floor(Math.random() * 500) + 200);
    }
};

// Human-like scroll (not always to bottom)
const humanScroll = async (page) => {
    const scrollType = Math.random();

    if (scrollType < 0.3) {
        // Small scroll
        await page.evaluate(() => {
            window.scrollBy({
                top: Math.floor(Math.random() * 300) + 200,
                behavior: 'smooth'
            });
        });
    } else if (scrollType < 0.6) {
        // Medium scroll
        await page.evaluate(() => {
            window.scrollBy({
                top: Math.floor(Math.random() * 600) + 400,
                behavior: 'smooth'
            });
        });
    } else {
        // Scroll to load more content
        await page.evaluate(() => {
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth'
            });
        });
    }

    await randomDelay(0.5, 1.5);
};

// Random viewport sizes (common resolutions)
const getRandomViewport = () => {
    const viewports = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1536, height: 864 },
        { width: 1440, height: 900 },
        { width: 1280, height: 720 },
        { width: 1600, height: 900 },
    ];
    return viewports[Math.floor(Math.random() * viewports.length)];
};

// Random user agents (recent Chrome versions)
const getRandomUserAgent = () => {
    const agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    ];
    return agents[Math.floor(Math.random() * agents.length)];
};

// Helper function to scroll to bottom and wait for new connections to load
const scrollToBottom = async (page) => {
    // Get current connection count BEFORE scrolling
    const countBefore = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/in/"]').length;
    });

    // Scroll to bottom
    await page.evaluate(() => {
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
    });
    await randomDelay(2, 3);

    // Also try to click "Show more results" button if it exists
    const buttonClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const showMoreButton = buttons.find(btn =>
            btn.innerText.toLowerCase().includes('show more') ||
            btn.innerText.toLowerCase().includes('load more') ||
            btn.innerText.toLowerCase().includes('see more')
        );
        if (showMoreButton && showMoreButton.offsetParent !== null) {
            showMoreButton.click();
            return true;
        }
        return false;
    });

    if (buttonClicked) {
        console.log('   Clicked "Show more" button');
    }

    // CRITICAL: Wait for NEW connections to actually load into the DOM
    // Try up to 5 times with increasing delays
    for (let attempt = 0; attempt < 5; attempt++) {
        await randomDelay(2, 3);

        const countAfter = await page.evaluate(() => {
            return document.querySelectorAll('a[href*="/in/"]').length;
        });

        if (countAfter > countBefore) {
            console.log(`   📥 Loaded ${countAfter - countBefore} more connections (${countBefore} → ${countAfter})`);
            return true; // New connections loaded
        }

        // Scroll again to trigger lazy loading
        await page.evaluate(() => {
            window.scrollBy({ top: 500, behavior: 'smooth' });
        });
    }

    console.log(`   ⚠️  No new connections loaded after scrolling`);
    return false; // No new connections loaded
};

// Extract profile information
const extractProfileInfo = async (page, profileUrl) => {
    try {
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for the main profile content to load properly
        try {
            await page.waitForSelector('h1.text-heading-xlarge, h1.inline', { timeout: 15000 });
        } catch {
            // If h1 doesn't load, wait longer and try again
            await page.waitForTimeout(5000);
        }

        // Extra wait to ensure profile fully loads (not just feed/overlay)
        await page.waitForTimeout(2000);

        // CRITICAL: Capture the ACTUAL URL after LinkedIn redirects
        // This handles ACo... internal IDs redirecting to real usernames
        const actualUrl = page.url();
        // Normalize: extract username and rebuild clean URL
        const urlMatch = actualUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
        const normalizedUrl = urlMatch
            ? `https://www.linkedin.com/in/${urlMatch[1]}/`
            : actualUrl;

        // Human-like profile viewing: mouse movement + reading pause
        await simulateHumanMouse(page);
        await randomDelay(2, 4);

        // Scroll down to "read" the profile like a human would (gentle scroll, no button clicking)
        await humanScroll(page);
        await simulateHumanMouse(page);
        await randomDelay(1, 2);

        const profileData = await page.evaluate(() => {
            const getText = (selector) => {
                try {
                    const element = document.querySelector(selector);
                    return element ? element.innerText.trim() : '';
                } catch {
                    return '';
                }
            };

            const getAllText = (selector) => {
                try {
                    const elements = document.querySelectorAll(selector);
                    return Array.from(elements).map(el => el.innerText.trim()).filter(text => text.length > 0);
                } catch {
                    return [];
                }
            };

            // NAME - from actual LinkedIn HTML
            const name = getText('h1.inline.t-24') ||
                        getText('h1') ||
                        '';

            // HEADLINE - from actual LinkedIn HTML
            const headline = getText('div.text-body-medium.break-words[data-generated-suggestion-target]') ||
                           getText('div.text-body-medium.break-words') ||
                           '';

            // LOCATION - from actual LinkedIn HTML
            const location = getText('span.text-body-small.inline.t-black--light.break-words') ||
                           '';

            // COMPANY - from current job section
            const companyElements = getAllText('div.UxpdjqVyIrVpQWgGQSZOMkxSNOLzswLaLQ');
            const company = companyElements.length > 0 ? companyElements[0] : '';

            // ABOUT - from actual LinkedIn HTML
            const about = getText('div.sDjwPkuVwLbixbTbsjXPCfWcLEuUkpMdXmPs') ||
                         getText('div.full-width.t-14.t-normal.t-black') ||
                         '';

            // EXPERIENCE - get first job title if available
            const experienceTitles = getAllText('.hoverable-link-text.t-bold');
            const experience = experienceTitles.length > 0 ? experienceTitles.slice(0, 2).join(', ') : '';

            // CONNECTION DEGREE - check if 1st degree connection
            // Try multiple selectors and clean up whitespace
            const degreeElement = document.querySelector('.dist-value') ||
                                 document.querySelector('.distance-badge span[aria-hidden="true"]') ||
                                 document.querySelector('span.dist-value');
            let connectionDegree = '';
            if (degreeElement) {
                connectionDegree = degreeElement.innerText.replace(/\s+/g, '').trim(); // Remove all whitespace
            }

            return {
                name,
                headline,
                company,
                about,
                location,
                experience,
                connectionDegree
            };
        });

        // Validate that we got at least a name
        if (!profileData.name || profileData.name.length < 2) {
            console.log(`   ⚠️  No name found, got: "${profileData.name}"`);
            return null;
        }

        // Return profile data with the ACTUAL normalized URL
        return {
            ...profileData,
            actualUrl: normalizedUrl
        };
    } catch (error) {
        console.log(`   Error extracting profile from ${profileUrl}:`, error.message);
        return null;
    }
};

// AI evaluation using Gemini
const evaluateWithAI = async (genAI, profileData) => {
    try {
        const model = genAI.getGenerativeModel({ model: 'models/gemini-3-flash-preview' });

        const prompt = `Analyze this LinkedIn profile and determine if this person is a decision-maker (business owner, founder, director, partner, C-level executive, or senior decision maker).

Profile:
Name: ${profileData.name}
Headline: ${profileData.headline}
Company: ${profileData.company}
Location: ${profileData.location}
Experience: ${profileData.experience}
About: ${profileData.about}

Respond ONLY with a JSON object in this exact format:
{
  "isDecisionMaker": true or false,
  "category": "Founder" or "C-Level" or "Director" or "Partner" or "Business Owner" or "Not Decision Maker",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in AI response');
        }

        const evaluation = JSON.parse(jsonMatch[0]);
        return evaluation;
    } catch (error) {
        console.log('Error in AI evaluation:', error.message);
        return {
            isDecisionMaker: false,
            category: 'Error',
            confidence: 0,
            reasoning: 'Failed to evaluate'
        };
    }
};

// Generate personalized message using Gemini
const generateMessage = async (genAI, profileData, demoUrl, recentStyles = []) => {
    try {
        const model = genAI.getGenerativeModel({ model: 'models/gemini-3-flash-preview' });

        // All available messaging styles
        const styles = [
            {
                name: 'Ownership/Control',
                approach: 'Frame around owning vs renting infrastructure. Most teams eventually want full control over their voice AI stack. Don\'t pitch features, describe the transition from dependency to ownership. Natural, advisory tone.'
            },
            {
                name: 'Transition/Moment',
                approach: 'Reference a career transition, industry shift, or role change from their Experience. Frame the platform as relevant to their new context. "Saw you moved from X to Y" or "noticed your background in Z".'
            },
            {
                name: 'Black Box Frustration',
                approach: 'Highlight the black-box problem with most voice AI platforms. Teams can\'t customize, can\'t see what\'s happening, can\'t deploy their way. Position as someone who built transparent infrastructure. Problem-aware tone.'
            },
            {
                name: 'Builder-to-Builder',
                approach: 'Technical credibility. Reference their technical background (if any) or builder mentality. "Built something for teams like yours" framing. Collaborative, peer-to-peer tone. Demo-first.'
            }
        ];

        // Smart style rotation: avoid recently used styles
        let availableStyles = styles;
        if (recentStyles.length > 0) {
            availableStyles = styles.filter(s => !recentStyles.includes(s.name));
            // If all styles were recently used, reset to full list
            if (availableStyles.length === 0) {
                availableStyles = styles;
            }
        }

        const style = availableStyles[Math.floor(Math.random() * availableStyles.length)];

        // Voice AI market facts to include in messages
        const voiceAIFacts = [
            "82% of customers now prefer a capable AI agent over waiting in a queue for a human",
            "80% of businesses have integrated or plan to integrate voice AI into customer service",
            "Voice AI is saving the US healthcare sector $150 billion this year alone",
            "AI personalized calls see 36% higher meeting conversion rates than traditional scripts",
            "Companies report employees saving 40 minutes per day by delegating routine queries to voice agents",
            "Banking and finance holds the largest voice AI market share at 32.9%",
            "90% of UK retailers are exploring or implementing AI agents for customer journeys",
            "157 million voice assistant users in the US alone, and growing"
        ];
        const randomFact = voiceAIFacts[Math.floor(Math.random() * voiceAIFacts.length)];

        const prompt = `You are a professional reaching out on LinkedIn about a Voice AI infrastructure you built. Write a natural, human-sounding DM.

RECIPIENT PROFILE:
Name: ${profileData.name}
Headline: ${profileData.headline}
Company: ${profileData.company}
Experience: ${profileData.experience}

WHAT YOU BUILT:
Voice AI infrastructure that gives teams full control and ownership. Sub-1s latency, no black boxes, deploy however you want. Built for teams that want to own their voice AI stack, not rent it.
Demo: ${demoUrl}

VOICE AI MARKET FACT TO INCLUDE:
"${randomFact}"
→ Weave this fact naturally into the message after the greeting. Don't just drop it in, connect it to their situation or industry.

${recentStyles.length > 0 ? `STYLE ROTATION CONTEXT:
Recent messaging styles used: ${recentStyles.join(', ')}
(You've been selected to use a different approach to maintain variety)

` : ''}MESSAGING APPROACH: ${style.name}
${style.approach}

CRITICAL FRAMING RULES:
1. DON'T frame as a vendor selling a tool
   ❌ "Built a voice AI platform that cuts costs..."
   ✅ "Most teams building voice agents eventually want control over their stack..."

2. Frame around SITUATIONS, not features:
   - Situations they're experiencing (vendor lock-in, customization limits, black-box systems)
   - Transitions they're navigating (new role, new company, growing team)
   - Risks they're managing (lack of control, can't customize, dependent on external APIs)
   - Opportunities they might not see yet (owning vs renting infrastructure)

3. VARY THE HOOK - Don't use "Noticed you're scaling [X] at [Company]"
   Instead use Experience data creatively:
   ✅ "Saw your background in [industry] before joining [Company]..."
   ✅ "Interesting to see someone with [technical skill] leading [department]..."
   ✅ "Congrats on the move to [Company]—noticed you're heading up [role]..."
   ✅ Reference career transitions, industry shifts, or role changes from Experience field

PROFESSIONAL SALES PRINCIPLES:
1. Lead with THEM (their situation), not YOU (your product)
2. ONE value point max - don't list features
3. Write like texting a colleague, not pitching a prospect
4. Soft CTA - "curious if this fits" not "let's chat"
5. Ultra-short: 3-4 sentences max (including the fact)
6. No hype words (game-changing, revolutionary, cutting-edge)

BAD EXAMPLE (fact feels forced):
"Hi Sarah, did you know 82% prefer AI agents? Anyway, I built a voice AI platform..."
→ Problem: Fact is disconnected, feels like spam

GOOD EXAMPLE (fact woven naturally):
"Hey Sarah, saw your background in fintech before moving to operations at Acme.

Interesting stat I came across: 82% of customers now prefer a capable AI agent over waiting for a human. Most teams exploring this space eventually want to own their stack instead of renting it.

Built something for that. Demo here: [link]"
→ Why it works: Fact flows naturally, connects to the pitch.

ANOTHER GOOD EXAMPLE:
"Hey Mike, congrats on the Director role.

With 80% of businesses now integrating voice AI into customer service, the ones doing it right are building their own infrastructure instead of renting black boxes.

Demo here if you're curious: [link]"
→ Why it works: Fact establishes context, then pivots to value prop.

REQUIREMENTS:
✅ Use first name only
✅ Include the Voice AI fact naturally after greeting
✅ Reference their Experience data if possible
✅ Frame around a situation/moment, NOT a feature list
✅ Include demo link: ${demoUrl}
✅ 3-4 sentences maximum with line breaks between them
✅ Natural, conversational tone
✅ Soft, low-pressure CTA

FORMATTING RULES (CRITICAL):
✅ PROPER SPACING: Put \n\n (double line break) between paragraphs
✅ PUNCTUATION: ONLY use commas (,), periods (.), and question marks (?)
✅ End sentences with periods, NOT hyphens or dashes

❌ STRICTLY FORBIDDEN:
❌ NO hyphens (-) for pauses or connections - use commas or periods instead
❌ NO em dashes (—) or en dashes (–) - NEVER use any dashes
❌ NO price mentions ($0.08/min, 70% cheaper, etc.)
❌ NO competitor comparisons (Vapi, Bland, Retell, or any other services)
❌ NO generic "Noticed you're scaling X at Y" hooks
❌ NO feature lists or vendor speak
❌ NO pushy language
❌ NO emojis or hype words
❌ NO "Did you know..." openings - weave facts naturally

Write ONLY the message text:`;

        const result = await model.generateContent(prompt);
        const message = result.response.text().trim();

        console.log(`   Style used: ${style.name}`);
        return { message, style: style.name };
    } catch (error) {
        console.log('Error generating message:', error.message);
        // Fallback message
        const firstName = profileData.name.split(' ')[0];
        return {
            message: `Hey ${firstName}, built a voice AI platform that cuts costs 70% vs traditional providers. Full control, <1s latency. Check it out: ${demoUrl} - open to a quick chat?`,
            style: 'Fallback'
        };
    }
};

// Send LinkedIn message - SIMPLE VERSION
const sendMessage = async (page, profileUrl, message) => {
    try {
        console.log(`   → Navigating to ${profileUrl}`);
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Click Message button
        const messageButtonClicked = await page.evaluate(() => {
            const spans = Array.from(document.querySelectorAll('span.artdeco-button__text'));
            const messageSpan = spans.find(span => span.innerText.trim() === 'Message');
            if (messageSpan) {
                const button = messageSpan.closest('button');
                if (button && !button.disabled) {
                    button.click();
                    return true;
                }
            }
            return false;
        });

        if (!messageButtonClicked) {
            throw new Error('Message button not found');
        }

        await randomDelay(2, 3);

        // Wait for message input and type
        await page.waitForSelector('div.msg-form__contenteditable', { timeout: 10000 });

        // Type message using innerHTML + input event (worked before)
        await page.evaluate((msg) => {
            const input = document.querySelector('div.msg-form__contenteditable');
            if (input) {
                input.focus();
                const lines = msg.split('\n');
                const paragraphs = lines.map(line => line.trim() === '' ? '<p><br></p>' : `<p>${line}</p>`).join('');
                input.innerHTML = paragraphs;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, message);

        console.log(`   → Message typed`);
        await randomDelay(2, 3);

        // Click send button
        await page.click('button.msg-form__send-button');
        await randomDelay(2, 3);

        // Close modal
        await page.keyboard.press('Escape');
        await randomDelay(1, 2);

        console.log(`✅ Message sent to ${profileUrl}`);
        return true;
    } catch (error) {
        console.log(`❌ Failed to send message: ${error.message}`);
        return false;
    }
};

// Main actor logic
Actor.main(async () => {
    const input = await Actor.getInput();

    const {
        linkedinSessionCookie,
        geminiApiKey,
        supabaseFunctionUrl,
        messagesPerRun = 4,
        maxMessagesPerDay = 30,
        demoUrl = 'https://voicecallai.netlify.app/',
        minDelay = 5,
        maxDelay = 15,
        useResidentialProxy = true,
        ownProfileUsername = ''
    } = input;

    // Build own profile URL to skip
    const ownProfileUrl = ownProfileUsername
        ? `https://www.linkedin.com/in/${ownProfileUsername}/`
        : null;
    if (ownProfileUrl) {
        console.log(`👤 Will skip own profile: ${ownProfileUrl}`);
    }

    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(geminiApiKey);

    console.log(`📊 Using Supabase for state persistence: ${supabaseFunctionUrl}`);
    console.log(`📊 Target: ${messagesPerRun} messages this run, max ${maxMessagesPerDay} per day`);

    // Configure proxy if enabled
    let proxyUrl = null;
    if (useResidentialProxy) {
        try {
            console.log('🌐 Configuring residential proxy...');
            const proxyConfiguration = await Actor.createProxyConfiguration({
                groups: ['RESIDENTIAL'],
                countryCode: 'US',
            });
            proxyUrl = await proxyConfiguration.newUrl();
            console.log(`🌐 Residential proxy ready`);
        } catch (proxyError) {
            console.log(`⚠️  Residential proxy failed: ${proxyError.message}`);
            console.log('🌐 Falling back to datacenter proxy...');
            try {
                const dcProxyConfig = await Actor.createProxyConfiguration();
                proxyUrl = await dcProxyConfig.newUrl();
                console.log(`🌐 Datacenter proxy ready`);
            } catch {
                console.log('⚠️  No proxy available, running without proxy');
            }
        }
    }

    // Launch browser with enhanced stealth
    console.log('🚀 Launching stealth browser...');
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-infobars',
            '--disable-background-timer-throttling',
            '--disable-popup-blocking',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--window-position=0,0',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list'
        ]
    });

    // Random viewport and user agent for each session
    const viewport = getRandomViewport();
    const userAgent = getRandomUserAgent();
    console.log(`🖥️  Using viewport: ${viewport.width}x${viewport.height}`);

    // Build context options
    const contextOptions = {
        userAgent: userAgent,
        viewport: viewport,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        geolocation: { longitude: -73.935242, latitude: 40.730610 }, // NYC area
        permissions: ['geolocation'],
        bypassCSP: true,
        ignoreHTTPSErrors: true,
    };

    // Add proxy if configured
    if (proxyUrl) {
        contextOptions.proxy = { server: proxyUrl };
    }

    const context = await browser.newContext(contextOptions);

    const page = await context.newPage();

    // Additional stealth: override navigator properties
    await page.addInitScript(() => {
        // Override webdriver detection
        Object.defineProperty(navigator, 'webdriver', { get: () => false });

        // Override plugins to look more human
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                { name: 'Native Client', filename: 'internal-nacl-plugin' }
            ]
        });

        // Override languages
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

        // Hide automation indicators
        window.chrome = { runtime: {} };
    });

    try {
        // Set page timeouts (longer for proxy connections)
        page.setDefaultTimeout(90000);
        page.setDefaultNavigationTimeout(90000);

        // Inject LinkedIn session cookie
        console.log('🔐 Injecting LinkedIn session cookie...');
        await context.addCookies([
            {
                name: 'li_at',
                value: linkedinSessionCookie,
                domain: '.linkedin.com',
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'None'
            }
        ]);
        console.log('✅ Session cookie injected');

        // Go to LinkedIn home first (cookie activation) with retry
        console.log('🏠 Opening LinkedIn home to activate cookie...');
        let navigationSuccess = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await page.goto('https://www.linkedin.com', {
                    waitUntil: 'domcontentloaded',
                    timeout: 90000
                });
                navigationSuccess = true;
                break;
            } catch (navError) {
                console.log(`⚠️  Navigation attempt ${attempt}/3 failed: ${navError.message}`);
                if (attempt < 3) {
                    console.log('   Retrying in 5 seconds...');
                    await page.waitForTimeout(5000);
                } else {
                    throw navError;
                }
            }
        }
        await page.waitForTimeout(4000);

        // Verify we're logged in
        if (page.url().includes('/login')) {
            throw new Error('❌ Not logged in. Cookie invalid or expired.');
        }

        console.log('✅ Cookie activated, logged in successfully');

        // Human-like warm-up: browse feed briefly before going to connections
        console.log('🧑 Simulating human browsing behavior...');
        await simulateHumanMouse(page);
        await randomDelay(2, 4);

        // Scroll the feed a bit like a human would
        for (let i = 0; i < Math.floor(Math.random() * 3) + 1; i++) {
            await humanScroll(page);
            await simulateHumanMouse(page);
            await randomDelay(1, 3);
        }

        console.log('👥 Navigating to connections page...');
        await page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Wait for connection links to appear
        await page.waitForSelector('a[href*="/in/"]', { timeout: 60000 });
        await randomDelay(2, 4);

        let messagesSentThisRun = 0;
        let evaluatedThisRun = 0;
        let decisionMakersFoundThisRun = 0;
        let processedUrlsThisRun = new Set(); // Track what we've already looked at THIS RUN

        // OPTIMIZATION: Fetch ALL processed URLs upfront for instant local lookup
        console.log('📥 Fetching all previously processed profiles...');
        const alreadyProcessedUrls = await getAllProcessedUrls(supabaseFunctionUrl);
        console.log(`   Found ${alreadyProcessedUrls.size} profiles already in database`);

        // Fetch recent message styles for smart rotation
        console.log('🔄 Fetching recent message styles for rotation...');
        let recentStyles = await getRecentMessageStyles(supabaseFunctionUrl);
        if (recentStyles.length > 0) {
            console.log(`   Last ${recentStyles.length} styles used: ${recentStyles.join(', ')}`);
        }

        // Keep processing until we send 4 messages
        let scrollAttempts = 0;
        const maxScrollAttempts = 20; // Safety limit

        while (messagesSentThisRun < messagesPerRun && scrollAttempts < maxScrollAttempts) {
            // Extract connection URLs
            const connectionUrls = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a[href*="/in/"]'));
                const urls = links
                    .map(link => {
                        const href = link.href;
                        // Extract just the base profile URL: /in/username/
                        const match = href.match(/linkedin\.com\/in\/([^\/\?]+)/);
                        if (match) {
                            return `https://www.linkedin.com/in/${match[1]}/`;
                        }
                        return null;
                    })
                    .filter(url => url !== null)
                    // Filter out any remaining bad URLs (overlays, details, etc.)
                    .filter(url => !url.includes('/overlay/') && !url.includes('/details/'))
                    // Remove duplicates
                    .filter((url, index, self) => self.indexOf(url) === index);
                return urls;
            });

            // Filter out own profile if specified
            const filteredUrls = ownProfileUrl
                ? connectionUrls.filter(url => url !== ownProfileUrl)
                : connectionUrls;

            if (filteredUrls.length < connectionUrls.length) {
                console.log(`👤 Skipped own profile from results`);
            }

            console.log(`📋 Found ${filteredUrls.length} connections on page`);

            if (filteredUrls.length === 0) {
                console.log(`⚠️  No connections found. Scrolling...`);
                await scrollToBottom(page);
                await randomDelay(1, 2);
                scrollAttempts++;
                continue;
            }

            // STEP 1: Check if FIRST connection (newest) is new
            const firstUrl = filteredUrls[0];
            const firstIsNew = !alreadyProcessedUrls.has(firstUrl) && !processedUrlsThisRun.has(firstUrl);

            let newUrls = [];

            if (firstIsNew) {
                // NEW connections at top! Collect all new ones from the start
                console.log(`🆕 First connection is NEW - checking from top...`);
                for (const url of filteredUrls) {
                    if (processedUrlsThisRun.has(url)) continue;

                    if (alreadyProcessedUrls.has(url)) {
                        // Hit a known profile - stop here
                        console.log(`⏭️  Hit known profile - collected ${newUrls.length} new from top`);
                        break;
                    }
                    newUrls.push(url);
                }
            } else {
                // STEP 2: First is known - find LAST known and continue after it
                console.log(`📍 First connection already known - locating last known profile...`);

                let lastKnownIndex = 0;
                for (let i = 0; i < filteredUrls.length; i++) {
                    const url = filteredUrls[i];
                    if (alreadyProcessedUrls.has(url) || processedUrlsThisRun.has(url)) {
                        lastKnownIndex = i;
                    }
                }

                console.log(`📍 Last known at position ${lastKnownIndex + 1}/${filteredUrls.length}`);

                // Get everything AFTER last known
                newUrls = filteredUrls
                    .slice(lastKnownIndex + 1)
                    .filter(url => !processedUrlsThisRun.has(url));

                if (newUrls.length > 0) {
                    console.log(`🆕 Found ${newUrls.length} NEW after position ${lastKnownIndex + 1}`);
                }
            }

            // If no new profiles found, scroll for more
            if (newUrls.length === 0) {
                console.log(`⏭️  No new connections found. Scrolling to load more...`);
                const loadedMore = await scrollToBottom(page);

                // If scrolling didn't load new connections after several attempts, try reloading
                if (!loadedMore && scrollAttempts > 0 && scrollAttempts % 5 === 0) {
                    console.log(`🔄 Reloading connections page to trigger fresh load...`);
                    await page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
                        waitUntil: 'domcontentloaded',
                        timeout: 60000
                    });
                    await page.waitForSelector('a[href*="/in/"]', { timeout: 30000 });
                    await randomDelay(3, 5);

                    // Scroll down multiple times to load more connections
                    console.log(`📜 Scrolling to load connections...`);
                    for (let i = 0; i < 3; i++) {
                        await scrollToBottom(page);
                    }
                }

                await randomDelay(1, 2);
                scrollAttempts++;
                continue;
            }

            // Process new connections (from top)
            let profilesProcessedInBatch = 0;
            for (const profileUrl of newUrls) {
                profilesProcessedInBatch++;

                // Stop if we've sent enough this run
                if (messagesSentThisRun >= messagesPerRun) {
                    console.log(`✅ Sent ${messagesSentThisRun} messages this run. Stopping.`);
                    break;
                }

                // Micro-break: every 3-5 profiles, take a longer pause (like a human getting distracted)
                if (profilesProcessedInBatch > 0 && profilesProcessedInBatch % (Math.floor(Math.random() * 3) + 3) === 0) {
                    console.log('☕ Taking a micro-break (human-like pause)...');
                    await randomDelay(8, 15);
                    await simulateHumanMouse(page);
                }

            // This is a genuinely new profile - process it
            console.log(`\n🆕 Processing NEW profile: ${profileUrl}`);

            // Extract profile info
            const profileData = await extractProfileInfo(page, profileUrl);
            if (!profileData || !profileData.name) {
                console.log('❌ Failed to extract profile data, skipping');
                continue;
            }

            // Use the ACTUAL URL (after LinkedIn redirects) for saving
            const actualProfileUrl = profileData.actualUrl || profileUrl;

            // Only check for duplicates if URL changed (ACo redirect case)
            if (actualProfileUrl !== profileUrl) {
                console.log(`   🔀 URL redirected: ${profileUrl.split('/in/')[1]} → ${actualProfileUrl.split('/in/')[1]}`);
                // Check if the redirected URL was already processed
                if (alreadyProcessedUrls.has(actualProfileUrl)) {
                    console.log(`⏭️  Skipping ${profileData.name} - already processed under different URL`);
                    continue;
                }
            }

            // CHECK: Only process 1st degree connections (can message them)
            if (profileData.connectionDegree !== '1st') {
                console.log(`⏭️  Skipping ${profileData.name} - not 1st degree (${profileData.connectionDegree || 'unknown'})`);
                console.log(`   ↩️  Returning to connections page...`);

                // Navigate back to connections page
                await page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000
                });

                // Wait for connections to load
                try {
                    await page.waitForSelector('a[href*="/in/"]', { timeout: 10000 });
                } catch {
                    await page.waitForTimeout(3000);
                }

                await randomDelay(1, 2);
                console.log(`   ✅ Back on connections page, continuing...`);
                continue;
            }

            console.log(`   Name: ${profileData.name}`);
            console.log(`   Connection: ${profileData.connectionDegree} degree`);
            console.log(`   Headline: ${profileData.headline}`);
            console.log(`   Company: ${profileData.company || 'N/A'}`);
            console.log(`   Location: ${profileData.location || 'N/A'}`);
            console.log(`   Experience: ${profileData.experience || 'N/A'}`);
            console.log(`   About: ${profileData.about ? profileData.about.substring(0, 100) + '...' : 'N/A'}`);

            await randomDelay(minDelay, maxDelay);

            // AI evaluation
            console.log('🤖 Evaluating with AI...');
            const evaluation = await evaluateWithAI(genAI, profileData);
            console.log(`   Decision Maker: ${evaluation.isDecisionMaker}`);
            console.log(`   Category: ${evaluation.category}`);
            console.log(`   Confidence: ${evaluation.confidence}`);

            evaluatedThisRun++;

            // If NOT decision maker, save to Supabase immediately and skip
            if (!evaluation.isDecisionMaker) {
                console.log('💾 Saving non-decision-maker to Supabase...');
                await saveProfile(supabaseFunctionUrl, {
                    profile_url: actualProfileUrl, // Use actual URL to prevent duplicates
                    name: profileData.name,
                    headline: profileData.headline,
                    company: profileData.company,
                    location: profileData.location,
                    experience: profileData.experience,
                    about: profileData.about,
                    is_decision_maker: false,
                    category: evaluation.category,
                    confidence: evaluation.confidence,
                    reasoning: evaluation.reasoning,
                    message_sent: false,
                    evaluated_at: new Date().toISOString()
                });
                console.log('✅ Saved to Supabase');
                alreadyProcessedUrls.add(actualProfileUrl); // Add actual URL to local cache
                processedUrlsThisRun.add(actualProfileUrl); // Also add to this run's cache
                await randomDelay(minDelay, maxDelay);
                continue; // Skip to next profile
            }

            // Decision maker found!
            decisionMakersFoundThisRun++;
            console.log(`🎯 Decision maker found! (${decisionMakersFoundThisRun} this run)`);

            // Generate personalized message
            console.log('✍️  Generating personalized message...');
            const { message, style } = await generateMessage(genAI, profileData, demoUrl, recentStyles);
            console.log(`   Style used: ${style}`);
            console.log(`   Message: ${message}`);

            await randomDelay(minDelay, maxDelay);

            // Send message (use actualProfileUrl for messaging)
            console.log('📤 Sending message...');
            const sent = await sendMessage(page, actualProfileUrl, message);

            if (sent) {
                messagesSentThisRun++;
                console.log(`✅ SUCCESS! Sent ${messagesSentThisRun}/${messagesPerRun} this run`);

                // Save to Supabase with message data
                console.log('💾 Saving decision-maker with message to Supabase...');
                await saveProfile(supabaseFunctionUrl, {
                    profile_url: actualProfileUrl, // Use actual URL to prevent duplicates
                    name: profileData.name,
                    headline: profileData.headline,
                    company: profileData.company,
                    location: profileData.location,
                    experience: profileData.experience,
                    about: profileData.about,
                    is_decision_maker: true,
                    category: evaluation.category,
                    confidence: evaluation.confidence,
                    reasoning: evaluation.reasoning,
                    message_sent: true,
                    message_text: message,
                    message_style: style,
                    evaluated_at: new Date().toISOString(),
                    message_sent_at: new Date().toISOString()
                });
                console.log('✅ Saved to Supabase');
                alreadyProcessedUrls.add(actualProfileUrl); // Add actual URL to local cache
                processedUrlsThisRun.add(actualProfileUrl); // Also add to this run's cache

                // Refresh recent styles for next iteration (smart rotation)
                recentStyles = await getRecentMessageStyles(supabaseFunctionUrl);
            } else {
                console.log('❌ Message failed to send, not saving to Supabase');
            }

            await randomDelay(minDelay, maxDelay);
            }

            // After processing all new ones, if we still need more messages, scroll to load more
            if (messagesSentThisRun < messagesPerRun) {
                console.log(`📜 Need more messages (${messagesSentThisRun}/${messagesPerRun}). Scrolling for more connections...`);
                await scrollToBottom(page);
                await randomDelay(1, 2);
                scrollAttempts++;
            }
        }

        if (scrollAttempts >= maxScrollAttempts) {
            console.log(`⚠️  Reached max scroll attempts (${maxScrollAttempts}). Stopping.`);
        }

        console.log('\n📊 Run Complete! Stats:');
        console.log(`   Profiles evaluated this run: ${evaluatedThisRun}`);
        console.log(`   Decision makers found this run: ${decisionMakersFoundThisRun}`);
        console.log(`   Messages sent this run: ${messagesSentThisRun}/${messagesPerRun}`);
        console.log(`\n💾 All data saved to Supabase`);
        console.log(`   View your data at: ${supabaseFunctionUrl.replace('/functions/v1/quick-function', '')}/project/default/editor`);

    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await browser.close();
        console.log('👋 Browser closed');
    }
});
