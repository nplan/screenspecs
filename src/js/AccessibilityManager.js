// AccessibilityManager.js - Centralized accessibility features management
// Handles ARIA labels, attributes, and live regions for screen readers

import { CONFIG } from './config.js';

export class AccessibilityManager {
    constructor() {
        this.liveRegion = null;
        this.announcementQueue = [];
        this.isAnnouncing = false;
        
        this.init();
    }

    init() {
        this.createLiveRegion();
        this.setupInitialAriaLabels();
        this.setupAriaLiveRegions();
    }

    /**
     * Create a hidden live region for announcements
     */
    createLiveRegion() {
        this.liveRegion = document.createElement('div');
        this.liveRegion.setAttribute('aria-live', 'polite');
        this.liveRegion.setAttribute('aria-atomic', 'true');
        this.liveRegion.className = 'sr-only';
        this.liveRegion.style.cssText = `
            position: absolute !important;
            width: 1px !important;
            height: 1px !important;
            padding: 0 !important;
            margin: -1px !important;
            overflow: hidden !important;
            clip: rect(0, 0, 0, 0) !important;
            white-space: nowrap !important;
            border: 0 !important;
        `;
        document.body.appendChild(this.liveRegion);
    }

    /**
     * Setup initial ARIA labels for static elements
     */
    setupInitialAriaLabels() {
        // Header controls
        this.setAriaLabel('#info-button', 'Show explanations of metrics and calculations');
        this.setAriaLabel('#copy-url-button', 'Copy shareable URL to clipboard');
        this.setAriaLabel('#reset-button', 'Reset all screens to default configuration');
        
        // Main heading
        const h1 = document.querySelector('h1');
        if (h1) {
            h1.setAttribute('role', 'banner');
        }

        // Canvas visualizer
        this.setAriaLabel('#screenCanvas', 'Visual representation of monitor configurations');
        
        // Add screen button
        this.setAriaLabel('#add-screen', 'Add new monitor configuration');

        // Footer
        const footer = document.querySelector('footer');
        if (footer) {
            footer.setAttribute('role', 'contentinfo');
        }
    }

    /**
     * Setup ARIA live regions for dynamic content
     */
    setupAriaLiveRegions() {
        // Validation error containers
        const errorContainers = document.querySelectorAll('.validation-errors');
        errorContainers.forEach(container => {
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'false');
        });

        // Output sections
        const outputSections = document.querySelectorAll('.outputs-section');
        outputSections.forEach(section => {
            section.setAttribute('aria-live', 'polite');
            section.setAttribute('aria-atomic', 'false');
            section.setAttribute('aria-label', 'Monitor specifications and calculations');
        });
    }

    /**
     * Setup ARIA labels for a screen container
     */
    setupScreenAriaLabels(container, screenNumber) {
        const screenId = container.dataset.screenId;
        
        // Container label
        container.setAttribute('aria-label', `Monitor ${screenNumber} configuration`);
        container.setAttribute('role', 'region');

        // Screen number display
        const screenNumberEl = container.querySelector('.screen-number');
        if (screenNumberEl) {
            screenNumberEl.setAttribute('aria-label', `Monitor ${screenNumber}`);
        }

        // Remove button
        const removeBtn = container.querySelector('.remove-screen');
        if (removeBtn) {
            removeBtn.setAttribute('aria-label', `Remove monitor ${screenNumber}`);
        }

        // Form fields
        this.setAriaLabel(`#preset-${screenId}`, 'Monitor preset configuration');
        this.setAriaLabel(`#diagonal-${screenId}`, 'Monitor diagonal size in inches');
        this.setAriaLabel(`#scaling-${screenId}`, 'Display scaling percentage');
        this.setAriaLabel(`#width-${screenId}`, 'Screen width in pixels');
        this.setAriaLabel(`#height-${screenId}`, 'Screen height in pixels');
        this.setAriaLabel(`#distance-${screenId}`, 'Viewing distance');
        this.setAriaLabel(`#curvature-${screenId}`, 'Screen curvature radius in millimeters (leave empty for flat screen)');

        // Group related fields
        const diagonalScaling = container.querySelector('.diagonal-scaling');
        if (diagonalScaling) {
            diagonalScaling.setAttribute('role', 'group');
            diagonalScaling.setAttribute('aria-label', 'Size and scaling settings');
        }

        const resolutionGroup = container.querySelector('.resolution');
        if (resolutionGroup && resolutionGroup.closest('.field-wrapper').querySelector('label').textContent === 'Resolution') {
            resolutionGroup.setAttribute('role', 'group');
            resolutionGroup.setAttribute('aria-label', 'Screen resolution in pixels');
        }

        const distanceCurvature = container.querySelector('.resolution');
        if (distanceCurvature && !distanceCurvature.closest('.field-wrapper').querySelector('label')) {
            distanceCurvature.setAttribute('role', 'group');
            distanceCurvature.setAttribute('aria-label', 'Distance and curvature settings');
        }

        // Error container
        const errorContainer = container.querySelector('.validation-errors');
        if (errorContainer) {
            errorContainer.setAttribute('aria-label', `Validation errors for monitor ${screenNumber}`);
        }

        // Output sections
        const outputSection = container.querySelector('.outputs-section');
        if (outputSection) {
            outputSection.setAttribute('aria-label', `Calculated specifications for monitor ${screenNumber}`);
        }
    }

    /**
     * Update validation ARIA attributes
     */
    updateValidationAria(fieldId, isValid, errorMessage = '') {
        const field = document.getElementById(fieldId);
        if (!field) return;

        field.setAttribute('aria-invalid', !isValid);
        
        if (!isValid && errorMessage) {
            const errorId = `error-${fieldId}`;
            field.setAttribute('aria-describedby', errorId);
            
            // Create or update error message element
            let errorElement = document.getElementById(errorId);
            if (!errorElement) {
                errorElement = document.createElement('span');
                errorElement.id = errorId;
                errorElement.className = 'sr-only';
                errorElement.style.cssText = this.liveRegion.style.cssText;
                field.parentNode.appendChild(errorElement);
            }
            errorElement.textContent = errorMessage;
        } else {
            field.removeAttribute('aria-describedby');
            const errorElement = document.getElementById(`error-${fieldId}`);
            if (errorElement) {
                errorElement.remove();
            }
        }
    }

    /**
     * Update theme button ARIA label
     */
    updateThemeButtonAria(currentTheme) {
        const themeButton = document.querySelector('.theme-toggle');
        if (themeButton) {
            const themeNames = {
                'light': 'Light',
                'dark': 'Dark',
                'system': 'System'
            };
            const currentName = themeNames[currentTheme] || currentTheme;
            themeButton.setAttribute('aria-label', `Switch theme (currently: ${currentName})`);
        }
    }

    /**
     * Announce screen addition
     */
    announceScreenAdded(screenNumber) {
        this.announce(`Monitor ${screenNumber} added`);
    }

    /**
     * Announce screen removal
     */
    announceScreenRemoved(screenNumber) {
        this.announce(`Monitor ${screenNumber} removed`);
    }

    /**
     * Announce configuration reset
     */
    announceReset() {
        this.announce('All monitors reset to default configuration');
    }

    /**
     * Announce URL copied
     */
    announceUrlCopied() {
        this.announce('Shareable URL copied to clipboard');
    }

    /**
     * Announce theme change
     */
    announceThemeChange(themeName) {
        this.announce(`Theme changed to ${themeName}`);
    }

    /**
     * Announce unit change
     */
    announceUnitChange(message) {
        this.announce(message);
    }

    /**
     * Announce calculation updates
     */
    announceCalculationUpdate(screenNumber) {
        this.announce(`Monitor ${screenNumber} specifications updated`);
    }

    /**
     * Generic announcement method
     */
    announce(message) {
        if (!message || !this.liveRegion) return;

        this.announcementQueue.push(message);
        if (!this.isAnnouncing) {
            this.processAnnouncementQueue();
        }
    }

    /**
     * Process announcement queue to avoid overlapping announcements
     */
    processAnnouncementQueue() {
        if (this.announcementQueue.length === 0) {
            this.isAnnouncing = false;
            return;
        }

        this.isAnnouncing = true;
        const message = this.announcementQueue.shift();
        
        // Clear previous announcement
        this.liveRegion.textContent = '';
        
        // Add new announcement after a brief delay
        setTimeout(() => {
            this.liveRegion.textContent = message;
            
            // Process next announcement
            setTimeout(() => {
                this.processAnnouncementQueue();
            }, 1000);
        }, 100);
    }

    /**
     * Helper method to set ARIA label
     */
    setAriaLabel(selector, label) {
        const element = document.querySelector(selector);
        if (element) {
            element.setAttribute('aria-label', label);
        }
    }

    /**
     * Helper method to set ARIA described by
     */
    setAriaDescribedBy(selector, describedById) {
        const element = document.querySelector(selector);
        if (element) {
            element.setAttribute('aria-describedby', describedById);
        }
    }

    /**
     * Update output values accessibility
     */
    updateOutputAria(container, outputType, values) {
        const outputItems = container.querySelectorAll('.output-item');
        outputItems.forEach((item, index) => {
            const isScaled = index === 1;
            const prefix = isScaled ? 'Scaled' : 'Native';
            item.setAttribute('aria-label', `${prefix} monitor specifications`);
            
            // Add labels to output lines
            const outputLines = item.querySelectorAll('.output-line');
            outputLines.forEach(line => {
                const label = line.querySelector('.output-label');
                const value = line.querySelector('.output-value');
                if (label && value) {
                    line.setAttribute('aria-label', `${label.textContent}: ${value.textContent}`);
                }
            });
        });
    }

    /**
     * Setup focus management for better accessibility
     */
    setupFocusManagement() {
        // Add focus indicators
        const style = document.createElement('style');
        style.textContent = `
            .focus-visible,
            *:focus-visible {
                outline: 2px solid var(--accent-primary);
                outline-offset: 2px;
            }
            
            /* Hide outline for mouse users */
            *:focus:not(.focus-visible) {
                outline: none;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.liveRegion) {
            this.liveRegion.remove();
            this.liveRegion = null;
        }
        this.announcementQueue = [];
        this.isAnnouncing = false;
    }
}
