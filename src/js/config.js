// Configuration constants for Screen Spec Calculator
// Centralized location for all colors, sizes, limits, and magic numbers

const CONFIG = {
    // Color Palette
    COLORS: {
        // Screen visualization colors
        SCREEN_COLORS: ['#9b5de5', '#00f5d4', '#f15bb5', '#00bbf9', '#fee440'],
        
        // Transparency and label styling
        SCREEN_FILL_OPACITY: '15', // Used as hex suffix for screen fill colors
        LABEL_SHADOW: 'rgba(0, 0, 0, 0.7)',
        LABEL_TEXT_SECONDARY: 'rgba(255, 255, 255, 0.8)',
        
        // Theme Colors for JavaScript usage
        LIGHT: {
            BACKGROUND: '#f8f9fa',
            SURFACE: '#ffffff',
            TEXT_PRIMARY: '#333333',
            TEXT_SECONDARY: '#666666',
            TEXT_TERTIARY: '#999999',
            BORDER: '#e9ecef',
            SHADOW: 'rgba(0, 0, 0, 0.1)',
            INPUT_BACKGROUND: '#ffffff',
            OUTPUT_BACKGROUND: '#f8f9fa'
        },
        DARK: {
            BACKGROUND: '#1a1a1a',
            SURFACE: '#2d2d2d',
            TEXT_PRIMARY: '#e0e0e0',
            TEXT_SECONDARY: '#b0b0b0',
            TEXT_TERTIARY: '#808080',
            BORDER: '#404040',
            SHADOW: 'rgba(0, 0, 0, 0.3)',
            INPUT_BACKGROUND: '#3a3a3a',
            OUTPUT_BACKGROUND: '#242424'
        }
    },

    // Screen Validation Limits
    LIMITS: {
        DIAGONAL: {
            MIN: 1,
            MAX: 500 // inches
        },
        RESOLUTION: {
            MIN: 1,
            MAX: 20000 // pixels
        },
        DISTANCE: {
            MIN: 100,  // millimeters (10 cm)
            MAX: 10000, // millimeters (1000 cm)
            MIN_CM: 10,  // centimeters
            MAX_CM: 1000  // centimeters
        },
        CURVATURE: {
            MIN: 500,
            MAX: 10000 // millimeters
        },
        SCALING: {
            MIN: 100,
            MAX: 500, // percent
            DEFAULT: 100
        }
    },

    // Physical Constants
    PHYSICS: {
        INCHES_TO_MM: 25.4,
        MM_TO_CM: 0.1,
        CM_TO_MM: 10,
        DEGREES_TO_RADIANS: Math.PI / 180,
        RADIANS_TO_DEGREES: 180 / Math.PI
    },

    // Timing Constants
    TIMING: {
        DEBOUNCE_DELAY: 100, // milliseconds
        ANIMATION_DURATION: 200, // milliseconds
        TOOLTIP_DELAY: 500, // milliseconds
        AUTO_SAVE_DELAY: 500, // milliseconds for auto-save debouncing
        URL_UPDATE_DELAY: 300 // milliseconds for URL update debouncing
    },

    // Storage Configuration
    STORAGE: {
        KEY: 'screen-spec-calculator-state',
        VERSION: '1.0',
        AUTO_SAVE: true
    },

    // Amazon Affiliate Configuration
    AMAZON: {
        // Set to false to hide Amazon links in all screen boxes
        ENABLED: false,
        // Amazon Associates affiliate tag for monetization
        // Format: 'your-affiliate-tag-20'
        // This tag is appended to Amazon search URLs to track referrals
        AFFILIATE_TAG: 'screenspecs0a-20'
    },

    // UI Dimensions and Spacing
    UI: {
        // Canvas and Visualizer
        CANVAS_MARGIN: 15, // pixels around screen visualizations
        SCREEN_STROKE_WIDTH: 2,
        
        // Label dimensions and positioning
        LABEL_HEIGHT: 30, // pixels
        LABEL_PADDING: 5, // extra padding for label width
        LABEL_SPACING: 4, // pixels between overlapping labels
        LABEL_BORDER_RADIUS: 8,
        LABEL_TEXT_PADDING: 10, // padding inside label
        LABEL_NUMBER_SPACING: 5, // gap between number and inches
        
        // Font sizes
        FONT_SIZE_LABEL_NUMBER: 16, // pixels
        FONT_SIZE_LABEL_INCHES: 14, // pixels
        FONT_SIZE_NO_SCREENS: 14, // pixels
        
        // Font families
        FONT_FAMILY_MONO: 'Roboto Mono, monospace',
        
        // Screen number badge
        SCREEN_NUMBER_HEIGHT: 28, // pixels
        SCREEN_NUMBER_MIN_WIDTH: 32, // pixels
        SCREEN_NUMBER_PADDING: 12, // pixels horizontal
        SCREEN_NUMBER_RIGHT_OFFSET: 16, // pixels from right edge
        
        // Container dimensions
        CONTAINER_MAX_WIDTH: 400, // pixels
        CONTAINER_MIN_WIDTH: 280, // pixels
        VISUALIZER_MAX_WIDTH: 1000, // pixels
        VISUALIZER_MIN_WIDTH: 280, // pixels
        VISUALIZER_HEIGHT: 400, // pixels
        
        // Form spacing
        FIELD_MARGIN_BOTTOM: 0.75, // rem
        LABEL_MARGIN_BOTTOM: 0.3, // rem
        RESOLUTION_GAP: 0.4, // rem
        
        // Border radius
        BORDER_RADIUS_SMALL: 4, // pixels
        BORDER_RADIUS_MEDIUM: 6, // pixels
        BORDER_RADIUS_LARGE: 8, // pixels
        BORDER_RADIUS_XLARGE: 12, // pixels
        
        // Shadows
        BOX_SHADOW_LIGHT: '0 1px 3px rgba(0, 0, 0, 0.1)',
        BOX_SHADOW_MEDIUM: '0 2px 4px rgba(0, 0, 0, 0.1)',
        BOX_SHADOW_HEAVY: '0 4px 12px rgba(0, 0, 0, 0.1)',
        
        // Transitions
        TRANSITION_FAST: 'all 0.2s',
        TRANSITION_MEDIUM: 'all 0.3s ease-out'
    },

    // Monitor Presets
    PRESETS: [
        { value: "24-1920-1080", diagonal: 24, width: 1920, height: 1080, distance: 600, curvature: null, name: "FHD", label: '24" FHD (1920 x 1080)', selected: true },
        { value: "27-2560-1440", diagonal: 27, width: 2560, height: 1440, distance: 600, curvature: null, name: "QHD", label: '27" QHD (2560 x 1440)' },
        { value: "27-3840-2160", diagonal: 27, width: 3840, height: 2160, distance: 600, curvature: null, name: "UHD 4K", label: '27" UHD 4K (3840 x 2160)' },
        { value: "27-5120-2880", diagonal: 27, width: 5120, height: 2880, distance: 600, curvature: null, name: "5K", label: '27" 5K (5120 x 2880)' },
        { value: "32-2560-1440", diagonal: 32, width: 2560, height: 1440, distance: 650, curvature: null, name: "QHD", label: '32" QHD (2560 x 1440)' },
        { value: "32-3840-2160", diagonal: 32, width: 3840, height: 2160, distance: 650, curvature: null, name: "UHD 4K", label: '32" UHD 4K (3840 x 2160)' },
        { value: "32-6144-3456", diagonal: 32, width: 6144, height: 3456, distance: 600, curvature: null, name: "6K", label: '32" 6K (6144 x 3456)' },
        { value: "32-7680-4320", diagonal: 32, width: 7680, height: 4320, distance: 600, curvature: null, name: "8K", label: '32" 8K (7680 x 4320)' },
        { value: "34-3440-1440", diagonal: 34, width: 3440, height: 1440, distance: 600, curvature: 1500, name: "UWQHD", label: '34" UWQHD (3440 x 1440)' },
        { value: "38-3840-1600", diagonal: 38, width: 3840, height: 1600, distance: 600, curvature: 2300, name: "WQHD+", label: '38" WQHD+ (3840 x 1600)' },
        { value: "40-5120-2160", diagonal: 40, width: 5120, height: 2160, distance: 650, curvature: 2500, name: "5K2K", label: '40" 5K2K (5120 x 2160)' },
        { value: "43-3840-2160", diagonal: 43, width: 3840, height: 2160, distance: 600, curvature: null, name: "UHD 4K", label: '43" UHD 4K (3840 x 2160)' },
        { value: "45-5120-2160", diagonal: 45, width: 5120, height: 2160, distance: 750, curvature: 800, name: "5K2K", label: '45" 5K2K (5120 x 2160)' },
        { value: "49-5120-1440", diagonal: 49, width: 5120, height: 1440, distance: 600, curvature: 1800, name: "DQHD", label: '49" DQHD (5120 x 1440)' },
        { value: "57-7680-2160", diagonal: 57, width: 7680, height: 2160, distance: 650, curvature: 1000, name: "DUHD", label: '57" DUHD (7680 x 2160)' },
        { value: "65-3840-2160", diagonal: 65, width: 3840, height: 2160, distance: 1500, curvature: null, name: "UHD 4K", label: '65" 4K (3840 x 2160)' },
        { value: "65-7680-4320", diagonal: 65, width: 7680, height: 4320, distance: 1500, curvature: null, name: "8K", label: '65" 8K (7680 x 4320)' }
    ],

    // Default Values
    DEFAULTS: {
        VIEW_DISTANCE: 800, // millimeters
        PRESET_DIAGONAL: 24, // inches
        PRESET_RESOLUTION: [1920, 1080], // pixels
        PRESET_DISTANCE: 600, // millimeters (60 cm default)
        PRESET_CURVATURE: null, // flat screen
        PRESET_SCALING: 100, // percent
        
        // Test screen values
        TEST_SCREEN: {
            DIAGONAL: 24,
            RESOLUTION: [1920, 1080],
            DISTANCE: 800,
            CURVATURE: 800
        }
    },

    // Error Messages
    MESSAGES: {
        CALCULATION_ERROR: 'Calculation Error',
        CALCULATION_ERROR_SHORT: 'Error',
        NO_SCREENS_MESSAGE: 'Add screens to see comparison',
        
        // Validation error templates
        VALIDATION_ERRORS: {
            REQUIRED: 'This field is required',
            MIN_VALUE: (min, unit) => `Minimum value is ${min}${unit ? ' ' + unit : ''}`,
            MAX_VALUE: (max, unit) => `Maximum value is ${max}${unit ? ' ' + unit : ''}`,
            INVALID_NUMBER: 'Please enter a valid number',
            INVALID_INTEGER: 'Please enter a whole number',
            UNREALISTIC_SIZE: 'Screen size appears unrealistic for given dimensions'
        }
    },

    // Theme Configuration
    THEME: {
        THEMES: {
            LIGHT: 'light',
            DARK: 'dark',
            SYSTEM: 'system'
        },
        DEFAULT: 'system',
        STORAGE_KEY: 'screen-spec-theme',
        CSS_CLASS_PREFIX: 'theme-',
        DATA_ATTRIBUTE: 'data-theme'
    },

    // Element IDs and Selectors
    SELECTORS: {
        CANVAS_ID: 'screenCanvas',
        SCREENS_CONTAINER_ID: 'screens-container',
        ADD_SCREEN_BUTTON_ID: 'add-screen',
        
        // CSS Classes
        CLASSES: {
            SCREEN_NUMBER: 'screen-number',
            NUMBER_TEXT: 'number-text',
            INPUT_ERROR: 'input-error',
            VALIDATION_ERRORS: 'validation-errors',
            ERROR_LIST: 'error-list',
            OUTPUT_UNIT: 'output-unit',
            CONTAINER: 'container'
        }
    },

    // Field Configuration
    FIELDS: {
        NAMES: ['preset', 'diagonal', 'width', 'height', 'distance', 'curvature', 'scaling'],
        VALIDATION_FIELD_NAMES: {
            diagonal: 'Screen Diagonal',
            width: 'Width',
            height: 'Height', 
            distance: 'Viewing Distance',
            curvature: 'Curvature Radius',
            scaling: 'Scaling'
        }
    },

    // Accessibility Configuration
    ACCESSIBILITY: {
        ARIA_LABELS: {
            // Header controls
            SHARE_BUTTON: 'Copy shareable URL to clipboard',
            RESET_BUTTON: 'Reset all screens to default configuration',
            THEME_BUTTON: 'Switch theme',
            
            // Form fields
            PRESET: 'Monitor preset configuration',
            DIAGONAL: 'Monitor diagonal size in inches',
            SCALING: 'Display scaling percentage',
            WIDTH: 'Screen width in pixels',
            HEIGHT: 'Screen height in pixels',
            DISTANCE: 'Viewing distance in millimeters',
            CURVATURE: 'Screen curvature radius in millimeters (leave empty for flat screen)',
            
            // View controls
            CANVAS: 'Visual representation of monitor configurations',
            
            // Actions
            ADD_SCREEN: 'Add new monitor configuration',
            REMOVE_SCREEN: 'Remove monitor',
            
            // Sections
            MONITOR_CONFIG: 'Monitor configuration',
            MONITOR_SPECS: 'Monitor specifications and calculations',
            SIZE_SCALING: 'Size and scaling settings',
            RESOLUTION_GROUP: 'Screen resolution in pixels',
            DISTANCE_CURVATURE: 'Distance and curvature settings'
        },
        
        ANNOUNCEMENTS: {
            SCREEN_ADDED: 'Monitor {number} added',
            SCREEN_REMOVED: 'Monitor {number} removed',
            CONFIG_RESET: 'All monitors reset to default configuration',
            URL_COPIED: 'Shareable URL copied to clipboard',
            THEME_CHANGED: 'Theme changed to {theme}',
            SPECS_UPDATED: 'Monitor {number} specifications updated'
        },
        
        TIMING: {
            ANNOUNCEMENT_DELAY: 100,
            ANNOUNCEMENT_INTERVAL: 1000
        }
    }
};

/**
 * Utility functions for managing presets
 */
CONFIG.PRESET_UTILS = {
    /**
     * Get a preset by its value
     * @param {string} value - The preset value (e.g., "24-1920-1080")
     * @returns {Object|null} The preset object or null if not found
     */
    getPresetByValue(value) {
        return CONFIG.PRESETS.find(preset => preset.value === value) || null;
    },

    /**
     * Get a preset by resolution
     * @param {number} width - Screen width in pixels
     * @param {number} height - Screen height in pixels
     * @returns {Object|null} The first matching preset or null if not found
     */
    getPresetByResolution(width, height) {
        return CONFIG.PRESETS.find(preset => preset.width === width && preset.height === height) || null;
    },

    /**
     * Add a new preset to the configuration
     * @param {Object} preset - The preset object
     * @param {string} preset.value - Unique preset identifier
     * @param {number} preset.diagonal - Screen diagonal in inches
     * @param {number} preset.width - Screen width in pixels
     * @param {number} preset.height - Screen height in pixels
     * @param {string} preset.name - Short name for the resolution
     * @param {string} preset.label - Display label for the preset
     * @param {boolean} [preset.selected] - Whether this preset is selected by default
     */
    addPreset(preset) {
        // Check if preset with same value already exists
        const existingIndex = CONFIG.PRESETS.findIndex(p => p.value === preset.value);
        if (existingIndex !== -1) {
            // Update existing preset
            CONFIG.PRESETS[existingIndex] = { ...CONFIG.PRESETS[existingIndex], ...preset };
        } else {
            // Add new preset
            CONFIG.PRESETS.push(preset);
        }
    },

    /**
     * Remove a preset by its value
     * @param {string} value - The preset value to remove
     * @returns {boolean} True if preset was removed, false if not found
     */
    removePreset(value) {
        const index = CONFIG.PRESETS.findIndex(preset => preset.value === value);
        if (index !== -1) {
            CONFIG.PRESETS.splice(index, 1);
            return true;
        }
        return false;
    },

    /**
     * Get all available resolution names from presets
     * @returns {Object} Object mapping resolution strings to names
     */
    getResolutionNameMap() {
        const resolutionMap = {};
        CONFIG.PRESETS.forEach(preset => {
            const resolutionKey = `${preset.width}x${preset.height}`;
            if (preset.name && !resolutionMap[resolutionKey]) {
                resolutionMap[resolutionKey] = preset.name;
            }
        });
        return resolutionMap;
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

// Export for ES6 modules
export { CONFIG };
