import { Actor } from 'apify';
import { chromium } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Helper function for random delays
const randomDelay = (min, max) => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay * 1000));
};

// Helper function to scroll like a human
const humanScroll = async (page) => {
    await page.evaluate(() => {
        window.scrollBy({
            top: Math.random() * 300 + 200,
            behavior: 'smooth'
        });
    });
    await randomDelay(1, 3);
};

// Extract profile information
const extractProfileInfo = async (page, profileUrl) => {
    try {
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for the main profile content to load (try multiple selectors)
        try {
            await page.waitForSelector('h1.text-heading-xlarge, h1', { timeout: 10000 });
        } catch {
            // If h1 doesn't load, wait a bit and continue
            await page.waitForTimeout(3000);
        }

        await randomDelay(2, 4);
        await humanScroll(page);

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

            return {
                name,
                headline,
                company,
                about,
                location,
                experience
            };
        });

        // Validate that we got at least a name
        if (!profileData.name || profileData.name.length < 2) {
            console.log(`   ⚠️  No name found, got: "${profileData.name}"`);
            return null;
        }

        return profileData;
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
const generateMessage = async (genAI, profileData, demoUrl) => {
    try {
        const model = genAI.getGenerativeModel({ model: 'models/gemini-3-flash-preview' });

        // Pick a random messaging style (1-4)
        const styles = [
            {
                name: 'Problem-Aware',
                approach: 'Direct and problem-focused. Identify their industry/role, point out voice AI opportunity, emphasize control + cost benefits. Short and punchy.'
            },
            {
                name: 'Cost/ROI Focus',
                approach: 'Lead with 70% cost savings vs traditional platforms ($0.08/min vs $0.25/min). Show scale benefits. Emphasize ownership vs subscription. Quantitative value.'
            },
            {
                name: 'Builder/Technical',
                approach: 'Appeal to technical decision-makers. Emphasize full control, no black boxes, sub-1s latency. Mention easy deployment. Collaborative tone.'
            },
            {
                name: 'Curiosity/Demo',
                approach: 'Show real working demo upfront. Non-pushy, value-first. "Built something cool for [industry], check it out." Easy CTA.'
            }
        ];

        const style = styles[Math.floor(Math.random() * styles.length)];

        const prompt = `You are writing a LinkedIn DM to a decision-maker about a Voice AI platform.

RECIPIENT PROFILE:
Name: ${profileData.name}
Headline: ${profileData.headline}
Company: ${profileData.company}
Location: ${profileData.location}
Experience: ${profileData.experience}
About: ${profileData.about}

WHAT YOU'RE PROMOTING:
- Voice AI Platform: Build custom voice agents with full control
- 70% Cost Savings: $0.08/min vs $0.25/min (traditional platforms like Vapi, Bland, Retell)
- Sub-1s response time, production-ready
- Full control, no black boxes, easy deployment
- Demo link: ${demoUrl}

MESSAGING STYLE: ${style.name}
${style.approach}

REQUIREMENTS:
✅ Use their first name only
✅ Personalize based on their role/industry/company
✅ Include the demo link naturally (${demoUrl})
✅ Clear, straight to the point
✅ Keep under 300 characters (LinkedIn limit)
✅ Sound like a human, not a bot
✅ Clear CTA (quick chat, check demo, etc.)
❌ Don't be pushy or overly salesy
❌ Don't use emojis unless it fits naturally

Respond with ONLY the message text, nothing else.`;

        const result = await model.generateContent(prompt);
        const message = result.response.text().trim();

        console.log(`   Style used: ${style.name}`);
        return message;
    } catch (error) {
        console.log('Error generating message:', error.message);
        // Fallback message
        const firstName = profileData.name.split(' ')[0];
        return `Hey ${firstName}, built a voice AI platform that cuts costs 70% vs traditional providers. Full control, <1s latency. Check it out: ${demoUrl} - open to a quick chat?`;
    }
};

// Send LinkedIn message
const sendMessage = async (page, profileUrl, message) => {
    try {
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('button', { timeout: 15000 });
        await randomDelay(2, 4);
        await humanScroll(page);

        // Try to find and click the Message button
        const messageButtonClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const messageButton = buttons.find(btn =>
                btn.innerText.toLowerCase().includes('message') &&
                !btn.disabled
            );
            if (messageButton) {
                messageButton.click();
                return true;
            }
            return false;
        });

        if (!messageButtonClicked) {
            throw new Error('Message button not found or not clickable');
        }

        await randomDelay(2, 3);

        // Wait for message input to appear
        await page.waitForSelector('.msg-form__contenteditable, [role="textbox"]', { timeout: 10000 });
        await randomDelay(1, 2);

        // Type message with human-like delays
        await page.type('.msg-form__contenteditable, [role="textbox"]', message, { delay: 50 + Math.random() * 50 });
        await randomDelay(1, 2);

        // Click send button
        await page.click('button[type="submit"].msg-form__send-button');

        console.log(`✅ Message sent to ${profileUrl}`);
        return true;
    } catch (error) {
        console.log(`❌ Failed to send message to ${profileUrl}:`, error.message);
        return false;
    }
};

// Main actor logic
Actor.main(async () => {
    const input = await Actor.getInput();

    const {
        linkedinSessionCookie,
        geminiApiKey,
        messagesPerRun = 4,
        maxMessagesPerDay = 30,
        demoUrl = 'https://voicecallai.netlify.app/',
        minDelay = 5,
        maxDelay = 15
    } = input;

    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(geminiApiKey);

    // Load or initialize state
    let state = await Actor.getValue('STATE') || {
        connections: {},
        stats: {
            totalEvaluated: 0,
            totalDecisionMakers: 0,
            totalMessagesSent: 0,
            todayCount: 0,
            lastResetDate: new Date().toISOString().split('T')[0]
        }
    };

    // Reset daily counter if new day
    const today = new Date().toISOString().split('T')[0];
    if (state.stats.lastResetDate !== today) {
        state.stats.todayCount = 0;
        state.stats.lastResetDate = today;
        await Actor.setValue('STATE', state);
        console.log('📅 New day - reset daily counter');
    }

    // Check if we've hit daily limit
    if (state.stats.todayCount >= maxMessagesPerDay) {
        console.log(`🛑 Daily limit reached (${state.stats.todayCount}/${maxMessagesPerDay}). Stopping.`);
        await Actor.exit();
        return;
    }

    console.log(`📊 Current stats: ${state.stats.todayCount}/${maxMessagesPerDay} messages sent today`);

    // Launch browser
    console.log('🚀 Launching stealth browser...');
    const browser = await chromium.launch({
        headless: true, // Running in Apify container
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox'
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US'
    });

    const page = await context.newPage();

    try {
        // Set page timeouts (Apify containers are slower)
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);

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

        // Go to LinkedIn home first (cookie activation)
        console.log('🏠 Opening LinkedIn home to activate cookie...');
        await page.goto('https://www.linkedin.com', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000);

        // Verify we're logged in
        if (page.url().includes('/login')) {
            throw new Error('❌ Not logged in. Cookie invalid or expired.');
        }

        console.log('✅ Cookie activated, logged in successfully');
        await randomDelay(2, 3);

        // Go to connections page
        console.log('👥 Navigating to connections page...');
        await page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Wait for connection links to appear
        await page.waitForSelector('a[href*="/in/"]', { timeout: 60000 });
        await randomDelay(2, 4);

        // Scroll to load connections
        console.log('📜 Loading connections...');
        for (let i = 0; i < 5; i++) {
            await humanScroll(page);
            await randomDelay(1, 2);
        }

        // Extract connection URLs
        const connectionUrls = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/in/"]'));
            const urls = links
                .map(link => link.href)
                .filter(url => url.includes('/in/'))
                .filter((url, index, self) => self.indexOf(url) === index); // Remove duplicates
            return urls.slice(0, 50); // Process first 50 per run
        });

        console.log(`📋 Found ${connectionUrls.length} connections to process`);

        let messagesSentThisRun = 0;

        // Process each connection
        for (const profileUrl of connectionUrls) {
            // Stop if we've sent enough this run
            if (messagesSentThisRun >= messagesPerRun) {
                console.log(`✅ Sent ${messagesSentThisRun} messages this run. Stopping.`);
                break;
            }

            // Stop if we've hit daily limit
            if (state.stats.todayCount >= maxMessagesPerDay) {
                console.log(`🛑 Daily limit reached (${state.stats.todayCount}/${maxMessagesPerDay}). Stopping.`);
                break;
            }

            // Check if already processed
            if (state.connections[profileUrl]) {
                console.log(`⏭️  Skipping ${profileUrl} (already processed)`);
                continue;
            }

            console.log(`\n🔍 Processing: ${profileUrl}`);

            // Extract profile info
            const profileData = await extractProfileInfo(page, profileUrl);
            if (!profileData || !profileData.name) {
                console.log('❌ Failed to extract profile data, skipping');
                continue;
            }

            console.log(`   Name: ${profileData.name}`);
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

            // Save to state
            state.connections[profileUrl] = {
                name: profileData.name,
                headline: profileData.headline,
                company: profileData.company,
                evaluated: true,
                isDecisionMaker: evaluation.isDecisionMaker,
                category: evaluation.category,
                confidence: evaluation.confidence,
                messageSent: false,
                evaluatedDate: new Date().toISOString()
            };

            state.stats.totalEvaluated++;

            if (evaluation.isDecisionMaker) {
                state.stats.totalDecisionMakers++;

                // Generate personalized message
                console.log('✍️  Generating personalized message...');
                const message = await generateMessage(genAI, profileData, demoUrl);
                console.log(`   Message: ${message}`);

                await randomDelay(minDelay, maxDelay);

                // Send message
                console.log('📤 Sending message...');
                const sent = await sendMessage(page, profileUrl, message);

                if (sent) {
                    state.connections[profileUrl].messageSent = true;
                    state.connections[profileUrl].message = message;
                    state.connections[profileUrl].sentDate = new Date().toISOString();
                    state.stats.totalMessagesSent++;
                    state.stats.todayCount++;
                    messagesSentThisRun++;

                    console.log(`✅ SUCCESS! Sent ${messagesSentThisRun}/${messagesPerRun} this run, ${state.stats.todayCount}/${maxMessagesPerDay} today`);
                }

                // Save state after each message
                await Actor.setValue('STATE', state);
                await randomDelay(minDelay, maxDelay);
            }

            // Save state after each evaluation
            await Actor.setValue('STATE', state);
            await randomDelay(minDelay, maxDelay);
        }

        console.log('\n📊 Final Stats:');
        console.log(`   Total evaluated: ${state.stats.totalEvaluated}`);
        console.log(`   Total decision makers found: ${state.stats.totalDecisionMakers}`);
        console.log(`   Total messages sent (all time): ${state.stats.totalMessagesSent}`);
        console.log(`   Messages sent today: ${state.stats.todayCount}/${maxMessagesPerDay}`);
        console.log(`   Messages sent this run: ${messagesSentThisRun}/${messagesPerRun}`);

    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await browser.close();
        console.log('👋 Browser closed');
    }
});
