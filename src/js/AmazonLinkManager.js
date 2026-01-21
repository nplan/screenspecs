// Import configuration constants
import { CONFIG } from './config.js';

/**
 * Amazon Link Manager - Handles dynamic Amazon affiliate link generation
 * Generates search URLs based on screen specifications with affiliate tracking
 */
class AmazonLinkManager {
    constructor() {
        // Initialize resolution names from presets configuration
        this.resolutionNames = {};
        this.initializeResolutionNames();

        // Hide Amazon links if disabled in config
        if (!this.isEnabled()) {
            this.hideAllAmazonLinks();
        }
    }

    /**
     * Check if Amazon links are enabled in configuration
     * @returns {boolean} True if Amazon links should be shown
     */
    isEnabled() {
        return CONFIG.AMAZON.ENABLED !== false;
    }

    /**
     * Hide all Amazon link containers
     */
    hideAllAmazonLinks() {
        document.querySelectorAll('.amazon-link-container').forEach(container => {
            container.style.display = 'none';
        });
    }

    /**
     * Initialize resolution names from CONFIG.PRESETS
     */
    initializeResolutionNames() {
        // Static resolution mappings
        const staticResolutions = {
            '1920x1080': 'FHD',
            '2560x1440': 'QHD',
            '3840x2160': 'UHD 4K',
            '5120x2880': '5K',
            '6144x3456': '6K',
            '7680x4320': '8K',
            '3440x1440': 'UWQHD',
            '3840x1600': 'WUHD',
            '5120x2160': 'WUHD',
            '5120x1440': 'DQHD',
            '7680x2160': 'DUHD'
        };

        // Start with static mappings
        this.resolutionNames = { ...staticResolutions };

        // Add resolution names from CONFIG.PRESETS using utility function
        if (CONFIG && CONFIG.PRESET_UTILS) {
            const presetResolutionMap = CONFIG.PRESET_UTILS.getResolutionNameMap();
            this.resolutionNames = { ...this.resolutionNames, ...presetResolutionMap };
        }

        console.log('Initialized resolution names from configuration:', this.resolutionNames);
    }

    /**
     * Generate Amazon search link with affiliate tag
     * @param {string} keyword - Search keyword for Amazon
     * @param {string} affiliateTag - Amazon affiliate tag
     * @returns {string} Amazon search URL with affiliate tag
     */
    generateAmazonLink(keyword, affiliateTag) {
        return `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}&tag=${affiliateTag}`;
    }

    /**
     * Get resolution name from resolution array
     * @param {Array} resolution - [width, height] array
     * @returns {string|null} Resolution name or null if not found
     */
    getResolutionName(resolution) {
        const resolutionKey = `${resolution[0]}x${resolution[1]}`;
        return this.resolutionNames[resolutionKey] || null;
    }

    /**
     * Create search keyword from screen specifications
     * @param {number} diagonal - Screen diagonal in inches
     * @param {Array} resolution - [width, height] array
     * @returns {string} Formatted search keyword
     */
    createSearchKeyword(diagonal, resolution) {
        const resolutionName = this.getResolutionName(resolution);
        
        if (resolutionName) {
            // Include resolution name if available (e.g., "24 inch monitor UHD 4K 3840 2160")
            return `${diagonal} inch ${resolutionName} ${resolution[0]} ${resolution[1]}`;
        } else {
            // Fall back to basic format (e.g., "24 inch monitor 1920 1080")
            return `${diagonal} inch ${resolution[0]} ${resolution[1]}`;
        }
    }

    /**
     * Update Amazon link for a specific screen container
     * @param {string} screenId - Screen ID to update
     * @param {number} diagonal - Screen diagonal in inches
     * @param {Array} resolution - [width, height] array
     * @returns {boolean} True if link was updated successfully
     */
    updateAmazonLink(screenId, diagonal, resolution) {
        // Skip if Amazon links are disabled
        if (!this.isEnabled()) {
            return false;
        }

        const container = document.querySelector(`[data-screen-id="${screenId}"]`);
        if (!container) {
            console.warn(`Container not found for screen ${screenId}`);
            return false;
        }

        const amazonLink = container.querySelector('.amazon-link');
        if (!amazonLink) {
            console.warn(`Amazon link not found in container for screen ${screenId}`);
            return false;
        }

        // Create search keyword from diagonal and resolution
        const keyword = this.createSearchKeyword(diagonal, resolution);
        const newUrl = this.generateAmazonLink(keyword, CONFIG.AMAZON.AFFILIATE_TAG);
        
        // Update the link
        amazonLink.href = newUrl;
        
        // Optional: Update aria-label for accessibility
        const resolutionName = this.getResolutionName(resolution);
        const displayName = resolutionName ? 
            `${diagonal}" ${resolutionName} (${resolution[0]}x${resolution[1]})` : 
            `${diagonal}" ${resolution[0]}x${resolution[1]}`;
        amazonLink.setAttribute('aria-label', 
            `Search for ${displayName} monitors on Amazon (opens in new tab)`);

        return true;
    }

    /**
     * Update all Amazon links in the document
     * Useful for bulk updates when affiliate tag changes
     */
    updateAllAmazonLinks() {
        const containers = document.querySelectorAll('[data-screen-id]:not([data-screen-id="template"])');
        let updatedCount = 0;

        containers.forEach(container => {
            const screenId = container.dataset.screenId;
            const diagonalInput = container.querySelector(`#diagonal-${screenId}`);
            const widthInput = container.querySelector(`#width-${screenId}`);
            const heightInput = container.querySelector(`#height-${screenId}`);

            if (diagonalInput && widthInput && heightInput) {
                const diagonal = parseFloat(diagonalInput.value);
                const width = parseInt(widthInput.value);
                const height = parseInt(heightInput.value);

                if (!isNaN(diagonal) && !isNaN(width) && !isNaN(height)) {
                    if (this.updateAmazonLink(screenId, diagonal, [width, height])) {
                        updatedCount++;
                    }
                }
            }
        });

        console.log(`Updated ${updatedCount} Amazon links`);
        return updatedCount;
    }

    /**
     * Get current affiliate tag from configuration
     * @returns {string} Current affiliate tag
     */
    getAffiliateTag() {
        return CONFIG.AMAZON.AFFILIATE_TAG;
    }

    /**
     * Test link generation (for debugging)
     * @param {number} diagonal - Screen diagonal in inches
     * @param {Array} resolution - [width, height] array
     * @returns {Object} Test result with keyword and URL
     */
    testLinkGeneration(diagonal, resolution) {
        const keyword = this.createSearchKeyword(diagonal, resolution);
        const url = this.generateAmazonLink(keyword, this.getAffiliateTag());
        const resolutionName = this.getResolutionName(resolution);

        return {
            diagonal,
            resolution,
            resolutionName,
            keyword,
            url,
            affiliateTag: this.getAffiliateTag()
        };
    }

    /**
     * Add new resolution name mapping
     * @param {Array} resolution - [width, height] array
     * @param {string} name - Display name for the resolution
     */
    addResolutionName(resolution, name) {
        const resolutionKey = `${resolution[0]}x${resolution[1]}`;
        this.resolutionNames[resolutionKey] = name;
    }

    /**
     * Get all resolution names mapping
     * @returns {Object} Current resolution names mapping
     */
    getResolutionNames() {
        return { ...this.resolutionNames };
    }
}

// Export for ES6 modules
export { AmazonLinkManager };
