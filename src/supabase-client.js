// Supabase client helper for LinkedIn scraper
// Handles all interactions with Supabase edge function

/**
 * Check if a LinkedIn profile has already been processed
 * @param {string} supabaseUrl - Your Supabase project URL
 * @param {string} supabaseFunctionUrl - Full URL to edge function (e.g., https://xxx.supabase.co/functions/v1/linkedin-profiles)
 * @param {string} profileUrl - LinkedIn profile URL
 * @returns {Promise<{exists: boolean, profile: object|null}>}
 */
export const checkProfile = async (supabaseFunctionUrl, profileUrl) => {
    try {
        const url = `${supabaseFunctionUrl}?url=${encodeURIComponent(profileUrl)}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Supabase error: ${error.error || response.statusText}`);
        }

        const data = await response.json();
        return data; // { exists: true/false, profile: {...} or null }
    } catch (error) {
        console.error('Error checking profile in Supabase:', error.message);
        // Return false on error to allow processing (fail-open)
        return { exists: false, profile: null };
    }
};

/**
 * Save or update a LinkedIn profile with evaluation results
 * @param {string} supabaseFunctionUrl - Full URL to edge function
 * @param {object} profileData - Profile data to save
 * @returns {Promise<{success: boolean, profile: object}>}
 */
export const saveProfile = async (supabaseFunctionUrl, profileData) => {
    try {
        const response = await fetch(supabaseFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(profileData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Supabase error: ${error.error || response.statusText}`);
        }

        const data = await response.json();
        return data; // { success: true, profile: {...} }
    } catch (error) {
        console.error('Error saving profile to Supabase:', error.message);
        throw error; // Re-throw to handle in main logic
    }
};

/**
 * Get today's message count from Supabase
 * @param {string} supabaseFunctionUrl - Full URL to edge function
 * @returns {Promise<number>} Count of messages sent today
 */
export const getTodayMessageCount = async (supabaseFunctionUrl) => {
    try {
        const url = `${supabaseFunctionUrl}/stats`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            console.error('Could not fetch today\'s message count, assuming 0');
            return 0;
        }

        const data = await response.json();
        return data.messages_today || 0;
    } catch (error) {
        console.error('Error getting today\'s message count:', error.message);
        return 0; // Default to 0 on error
    }
};
