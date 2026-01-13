import { Actor } from 'apify';
import { chromium } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { checkProfile, saveProfile } from './supabase-client.js';

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

        const style = styles[Math.floor(Math.random() * styles.length)];

        const prompt = `You are a professional reaching out on LinkedIn about a Voice AI infrastructure you built. Write a natural, human-sounding DM.

RECIPIENT PROFILE:
Name: ${profileData.name}
Headline: ${profileData.headline}
Company: ${profileData.company}
Experience: ${profileData.experience}

WHAT YOU BUILT:
Voice AI infrastructure that gives teams full control and ownership. Sub-1s latency, no black boxes, deploy however you want. Built for teams that want to own their voice AI stack, not rent it.
Demo: ${demoUrl}

MESSAGING APPROACH: ${style.name}
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
5. Ultra-short: 2-3 sentences max
6. No hype words (game-changing, revolutionary, cutting-edge)

BAD EXAMPLE (feature-dump + vendor tone):
"Hi Sarah, built a voice AI platform with sub-1s latency and full control. We help teams scale without vendor lock-in. Worth a quick chat?"
→ Problem: Sounds like a vendor selling features, no context about them

GOOD EXAMPLE (situation-framing + natural tone):
"Hey Sarah, saw your background in fintech before moving to operations at Acme.

Most teams building voice AI eventually want to own their stack instead of renting it. Built something for that.

Demo here: [link]"
→ Why it works: References her transition, frames around ownership, not features. Proper spacing.

ANOTHER GOOD EXAMPLE:
"Hey Mike, if you're exploring voice agents, most platforms end up being black boxes you can't customize.

Built infrastructure that gives you full control. Demo here: [link] if you're curious."
→ Why it works: Describes their likely frustration, positions as solution. Clean formatting.

REQUIREMENTS:
✅ Use first name only
✅ Reference their Experience data if possible (transitions, background, previous roles)
✅ Frame around a situation/moment, NOT a feature list
✅ Include demo link: ${demoUrl}
✅ 2-3 sentences maximum with line breaks between them
✅ Natural, conversational tone
✅ Soft, low-pressure CTA
✅ Focus on actual value: control, ownership, customization, transparency

FORMATTING RULES (CRITICAL):
✅ PROPER SPACING: Put \n\n (double line break) between each sentence
✅ PUNCTUATION: ONLY use commas (,), periods (.), and question marks (?)
✅ End sentences with periods, NOT hyphens or dashes

FORMATTING EXAMPLE:
"Hey John, saw your background in fintech before moving to operations.

Most teams building voice AI eventually want to own their stack instead of renting it. Built something for that.

Demo here: [link] if you're curious."

❌ STRICTLY FORBIDDEN:
❌ NO hyphens (-) for pauses or connections - use commas or periods instead
❌ NO em dashes (—) or en dashes (–) - NEVER use any dashes
❌ NO price mentions ($0.08/min, 70% cheaper, etc.)
❌ NO competitor comparisons (Vapi, Bland, Retell, or any other services)
❌ NO generic "Noticed you're scaling X at Y" hooks
❌ NO feature lists or vendor speak
❌ NO pushy language
❌ NO emojis or hype words

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

// Send LinkedIn message
const sendMessage = async (page, profileUrl, message) => {
    try {
        // CRITICAL: Navigate to profile with full page reload to clear any cached modals
        console.log(`   → Navigating to ${profileUrl}`);
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('button', { timeout: 15000 });
        await randomDelay(2, 4);

        // Close any existing message modals first (CRITICAL FIX)
        await page.evaluate(() => {
            // Close message overlay if exists
            const closeButtons = document.querySelectorAll('[data-test-modal-close-btn], .msg-overlay-bubble-header__control--close, button[aria-label*="Close"]');
            closeButtons.forEach(btn => {
                if (btn && btn.offsetParent !== null) {
                    btn.click();
                }
            });
        });
        await randomDelay(1, 2);

        await humanScroll(page);

        // Extract profile name for verification
        const profileName = await page.evaluate(() => {
            const nameElement = document.querySelector('h1.inline.t-24, h1');
            return nameElement ? nameElement.innerText.trim() : '';
        });
        console.log(`   → Profile name: ${profileName}`);

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

        // Clear any existing text in the input field
        await page.evaluate(() => {
            const input = document.querySelector('.msg-form__contenteditable, [role="textbox"]');
            if (input) {
                input.innerHTML = '';
                input.innerText = '';
            }
        });
        await randomDelay(0.5, 1);

        // Type message with human-like delays
        await page.type('.msg-form__contenteditable, [role="textbox"]', message, { delay: 50 + Math.random() * 50 });
        await randomDelay(1, 2);

        // Click send button
        await page.click('button[type="submit"].msg-form__send-button');
        await randomDelay(1, 2);

        // CRITICAL: Close the message modal after sending to prevent persistence
        console.log(`   → Closing message modal...`);

        // Click X button
        await page.evaluate(() => {
            const closeButton = document.querySelector('.msg-overlay-bubble-header__control[aria-label*="Close"], .msg-overlay-bubble-header__control.artdeco-button--circle');
            if (closeButton) {
                closeButton.click();
            }
        });

        // Press ESC key (double guarantee)
        await page.keyboard.press('Escape');

        console.log(`   → Modal closed (X button + ESC key)`);
        await randomDelay(2, 3);

        console.log(`✅ Message sent to ${profileName} (${profileUrl})`);
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
        supabaseFunctionUrl,
        messagesPerRun = 4,
        maxMessagesPerDay = 30,
        demoUrl = 'https://voicecallai.netlify.app/',
        minDelay = 5,
        maxDelay = 15
    } = input;

    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(geminiApiKey);

    console.log(`📊 Using Supabase for state persistence: ${supabaseFunctionUrl}`);
    console.log(`📊 Target: ${messagesPerRun} messages this run, max ${maxMessagesPerDay} per day`);

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
        let evaluatedThisRun = 0;
        let decisionMakersFoundThisRun = 0;

        // Process each connection
        for (const profileUrl of connectionUrls) {
            // Stop if we've sent enough this run
            if (messagesSentThisRun >= messagesPerRun) {
                console.log(`✅ Sent ${messagesSentThisRun} messages this run. Stopping.`);
                break;
            }

            // Check if already processed in Supabase
            console.log(`\n🔍 Checking: ${profileUrl}`);
            const { exists, profile } = await checkProfile(supabaseFunctionUrl, profileUrl);

            if (exists) {
                console.log(`⏭️  Skipping (already processed on ${profile.evaluated_at})`);
                console.log(`   Category: ${profile.category}, Message Sent: ${profile.message_sent}`);
                continue;
            }

            console.log(`🔍 Processing: ${profileUrl}`);

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

            evaluatedThisRun++;

            // If NOT decision maker, save to Supabase immediately and skip
            if (!evaluation.isDecisionMaker) {
                console.log('💾 Saving non-decision-maker to Supabase...');
                await saveProfile(supabaseFunctionUrl, {
                    profile_url: profileUrl,
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
                await randomDelay(minDelay, maxDelay);
                continue; // Skip to next profile
            }

            // Decision maker found!
            decisionMakersFoundThisRun++;
            console.log(`🎯 Decision maker found! (${decisionMakersFoundThisRun} this run)`);

            // Generate personalized message
            console.log('✍️  Generating personalized message...');
            const { message, style } = await generateMessage(genAI, profileData, demoUrl);
            console.log(`   Message: ${message}`);

            await randomDelay(minDelay, maxDelay);

            // Send message
            console.log('📤 Sending message...');
            const sent = await sendMessage(page, profileUrl, message);

            if (sent) {
                messagesSentThisRun++;
                console.log(`✅ SUCCESS! Sent ${messagesSentThisRun}/${messagesPerRun} this run`);

                // Save to Supabase with message data
                console.log('💾 Saving decision-maker with message to Supabase...');
                await saveProfile(supabaseFunctionUrl, {
                    profile_url: profileUrl,
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
            } else {
                console.log('❌ Message failed to send, not saving to Supabase');
            }

            await randomDelay(minDelay, maxDelay);
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
