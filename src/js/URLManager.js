// Import configuration constants
import { CONFIG } from './config.js';

// URL Manager - Handles URL state management for sharing configurations
class URLManager {
    constructor() {
        this.isUpdatingFromURL = false; // Flag to prevent circular updates
        this.stateChangeCallbacks = [];
        this.isInitialized = false;
        
        // URL state configuration
        this.config = {
            PARAM_NAMES: {
                VERSION: 'v',
                SCREENS: 's',
                SHARE_ID: 'id' // For future use with server-side sharing
            },
            COMPRESSION: {
                FIELD_MAPPING: {
                    'diagonal': 'd',
                    'width': 'w', 
                    'height': 'h',
                    'distance': 'dt',
                    'curvature': 'c',
                    'scaling': 'sc',
                    'preset': 'p'
                }
            },
            MAX_URL_LENGTH: 2000 // Browser URL length limit consideration
        };
        
        this.init();
    }

    /**
     * Initialize URL state management
     */
    init() {
        // Listen for browser navigation (back/forward buttons)
        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.screenSpec) {
                this.handleURLStateChange(event.state.screenSpec);
            } else {
                // If no state, try to parse URL
                this.handleURLStateChange(null);
            }
        });
        
        this.isInitialized = true;
        console.log('URL Manager initialized');
    }

    /**
     * Register callback for state changes from URL
     * @param {Function} callback - Function to call when URL state changes
     */
    onStateChange(callback) {
        if (typeof callback === 'function') {
            this.stateChangeCallbacks.push(callback);
        }
    }

    /**
     * Update URL with current application state
     * @param {Object} state - Application state object
     * @param {boolean} replaceState - Whether to replace current history entry
     */
    updateURL(state, replaceState = false) {
        if (this.isUpdatingFromURL) return; // Prevent circular updates
        
        try {
            // Always keep clean URL in address bar - only store state in history
            const cleanURL = window.location.origin + window.location.pathname;
            
            const stateData = {
                screenSpec: state,
                timestamp: Date.now()
            };
            
            if (replaceState) {
                window.history.replaceState(stateData, '', cleanURL);
            } else {
                window.history.pushState(stateData, '', cleanURL);
            }
            
            return true;
        } catch (error) {
            console.error('Failed to update URL:', error);
            return false;
        }
    }

    /**
     * Get current application state from URL
     * @returns {Object|null} Decoded state or null if invalid
     */
    getStateFromURL() {
        try {
            // First check URL parameters (for shared links)
            const urlParams = new URLSearchParams(window.location.search);
            const urlState = this.decodeState(urlParams);
            
            if (urlState && this.validateState(urlState)) {
                // If we found valid URL state, clean the URL immediately
                this.clearURL();
                return urlState;
            }
            
            return null;
        } catch (error) {
            console.error('Failed to decode URL state:', error);
            return null;
        }
    }

    /**
     * Encode application state into URL parameters
     * @param {Object} state - Application state
     * @returns {URLSearchParams} Encoded URL parameters
     */
    encodeState(state) {
        const params = new URLSearchParams();
        
        // Add version
        params.set(this.config.PARAM_NAMES.VERSION, this.config.VERSION.toString());
        
        // Encode screens
        if (state.screens && state.screens.length > 0) {
            const screensData = state.screens.map(screen => this.encodeScreen(screen));
            params.set(this.config.PARAM_NAMES.SCREENS, screensData.join('|'));
        }
        
        return params;
    }

    /**
     * Decode URL parameters into application state
     * @param {URLSearchParams} params - URL parameters
     * @returns {Object|null} Decoded state or null if invalid
     */
    decodeState(params) {
        try {
            // Check version
            const version = parseInt(params.get(this.config.PARAM_NAMES.VERSION) || '1');
            if (version > this.config.VERSION) {
                console.warn('URL state version not supported');
                return null;
            }
            
            const state = {
                screens: [],
                uiState: {}
            };
            
            // Decode screens
            const screensParam = params.get(this.config.PARAM_NAMES.SCREENS);
            if (screensParam) {
                const screenStrings = screensParam.split('|');
                state.screens = screenStrings
                    .map(screenStr => this.decodeScreen(screenStr))
                    .filter(screen => screen !== null);
            }
            
            // Validate decoded state
            if (this.validateState(state)) {
                return state;
            }
            
            return null;
        } catch (error) {
            console.error('Failed to decode state:', error);
            return null;
        }
    }

    /**
     * Encode a single screen object
     * @param {Object} screen - Screen object
     * @returns {string} Encoded screen string
     */
    encodeScreen(screen) {
        const parts = [];
        const mapping = this.config.COMPRESSION.FIELD_MAPPING;
        
        // Core fields in specific order for consistency
        const fields = ['diagonal', 'width', 'height', 'distance', 'curvature', 'scaling'];
        
        fields.forEach(field => {
            const key = mapping[field];
            let value = screen[field];
            
            // Handle special cases
            if (field === 'curvature' && value === null) {
                value = 0; // Use 0 for flat screens
            }
            if (field === 'scaling' && value === 100) {
                value = ''; // Omit default scaling
            }
            
            if (value !== null && value !== undefined && value !== '') {
                parts.push(`${key}=${value}`);
            }
        });
        
        // Add preset if it exists and isn't custom
        if (screen.preset && screen.preset !== '') {
            parts.push(`${mapping.preset}=${encodeURIComponent(screen.preset)}`);
        }
        
        return parts.join(',');
    }

    /**
     * Decode a single screen string
     * @param {string} screenStr - Encoded screen string
     * @returns {Object|null} Decoded screen object or null if invalid
     */
    decodeScreen(screenStr) {
        try {
            const screen = {
                diagonal: null,
                width: null,
                height: null,
                distance: CONFIG.DEFAULTS.PRESET_DISTANCE,
                curvature: null,
                scaling: 100,
                preset: ''
            };
            
            const reverseMapping = Object.fromEntries(
                Object.entries(this.config.COMPRESSION.FIELD_MAPPING).map(([k, v]) => [v, k])
            );
            
            const parts = screenStr.split(',');
            
            parts.forEach(part => {
                const [key, value] = part.split('=');
                const field = reverseMapping[key];
                
                if (field && value !== undefined) {
                    if (field === 'preset') {
                        screen[field] = decodeURIComponent(value);
                    } else if (field === 'curvature') {
                        screen[field] = value === '0' ? null : parseFloat(value);
                    } else if (['width', 'height'].includes(field)) {
                        screen[field] = parseInt(value);
                    } else {
                        screen[field] = parseFloat(value);
                    }
                }
            });
            
            // Validate required fields
            if (screen.diagonal && screen.width && screen.height) {
                return screen;
            }
            
            return null;
        } catch (error) {
            console.error('Failed to decode screen:', error);
            return null;
        }
    }

    /**
     * Build complete URL with parameters
     * @param {URLSearchParams} params - URL parameters
     * @returns {string} Complete URL
     */
    buildURL(params) {
        const base = window.location.origin + window.location.pathname;
        const queryString = params.toString();
        return queryString ? `${base}?${queryString}` : base;
    }

    /**
     * Handle URL state changes (from browser navigation)
     * @param {Object} stateData - State data from history API
     */
    handleURLStateChange(stateData) {
        if (this.isUpdatingFromURL) return;
        
        this.isUpdatingFromURL = true;
        
        try {
            let state = stateData;
            
            // If no state provided, check if there are URL parameters (shared link)
            if (!state) {
                state = this.getStateFromURL();
            }
            
            if (state && this.validateState(state)) {
                // Notify callbacks about the state change
                this.stateChangeCallbacks.forEach(callback => {
                    try {
                        callback(state);
                    } catch (error) {
                        console.error('State change callback error:', error);
                    }
                });
            } else {
                // No valid state found, notify callbacks with null to trigger fallback to localStorage
                this.stateChangeCallbacks.forEach(callback => {
                    try {
                        callback(null);
                    } catch (error) {
                        console.error('State change callback error:', error);
                    }
                });
            }
        } finally {
            this.isUpdatingFromURL = false;
        }
    }

    /**
     * Validate decoded state structure
     * @param {Object} state - State to validate
     * @returns {boolean} True if state is valid
     */
    validateState(state) {
        if (!state || typeof state !== 'object') return false;
        
        // Check screens array
        if (!Array.isArray(state.screens)) return false;
        
        // Validate each screen
        for (const screen of state.screens) {
            if (!this.validateScreen(screen)) return false;
        }
        
        // Check UI state
        if (state.uiState && typeof state.uiState !== 'object') return false;
        
        return true;
    }

    /**
     * Validate individual screen data
     * @param {Object} screen - Screen object to validate
     * @returns {boolean} True if screen is valid
     */
    validateScreen(screen) {
        if (!screen || typeof screen !== 'object') return false;
        
        // Check required fields
        const requiredFields = ['diagonal', 'width', 'height', 'distance', 'scaling'];
        for (const field of requiredFields) {
            if (!(field in screen) || screen[field] === null || screen[field] === undefined) {
                return false;
            }
        }
        
        // Validate field types and ranges
        if (typeof screen.diagonal !== 'number' || screen.diagonal <= 0) return false;
        if (typeof screen.width !== 'number' || screen.width <= 0) return false;
        if (typeof screen.height !== 'number' || screen.height <= 0) return false;
        if (typeof screen.distance !== 'number' || screen.distance <= 0) return false;
        if (typeof screen.scaling !== 'number' || screen.scaling <= 0) return false;
        
        // Validate curvature (can be null or positive number)
        if (screen.curvature !== null && (typeof screen.curvature !== 'number' || screen.curvature <= 0)) {
            return false;
        }
        
        return true;
    }

    /**
     * Clear URL parameters (reset to clean URL)
     */
    clearURL() {
        const baseURL = window.location.origin + window.location.pathname;
        window.history.replaceState({ cleared: true, timestamp: Date.now() }, '', baseURL);
    }

    /**
     * Get shareable URL for current state
     * @param {Object} state - Application state
     * @returns {string|null} Shareable URL or null if generation failed
     */
    getShareableURL(state) {
        try {
            const urlParams = this.encodeState(state);
            return this.buildURL(urlParams);
        } catch (error) {
            console.error('Failed to generate shareable URL:', error);
            return null;
        }
    }

    /**
     * Check if current URL contains state parameters
     * @returns {boolean} True if URL has state parameters
     */
    hasURLState() {
        const params = new URLSearchParams(window.location.search);
        return params.has(this.config.PARAM_NAMES.SCREENS);
    }

    /**
     * Check if this is a fresh page load with URL parameters (shared link)
     * @returns {boolean} True if URL has parameters and no history state
     */
    isSharedLinkVisit() {
        return this.hasURLState() && !window.history.state;
    }

    /**
     * Process a shared link visit - extract state and clean URL
     * @returns {Object|null} Extracted state or null if invalid
     */
    processSharedLink() {
        if (!this.isSharedLinkVisit()) {
            return null;
        }
        
        const urlState = this.getStateFromURL();
        if (urlState && this.validateState(urlState)) {
            console.log('Processing shared link with state');
            return urlState;
        }
        
        return null;
    }

    /**
     * Get URL state information for debugging
     * @returns {Object} URL state info
     */
    getURLInfo() {
        const url = window.location.href;
        const params = new URLSearchParams(window.location.search);
        const hasState = this.hasURLState();
        const state = hasState ? this.getStateFromURL() : null;
        const isSharedLink = this.isSharedLinkVisit();
        const historyState = window.history.state;
        
        return {
            url,
            length: url.length,
            hasState,
            isSharedLink,
            paramCount: Array.from(params.keys()).length,
            state,
            historyState,
            maxLength: this.config.MAX_URL_LENGTH,
            withinLimit: url.length <= this.config.MAX_URL_LENGTH,
            addressBarClean: !hasState
        };
    }
}

// Export for ES6 modules
export { URLManager };
