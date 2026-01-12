// Import dependencies
import { CONFIG } from './config.js';
import { Screen } from './Screen.js';
import { ScreenVisualizer3D } from './ScreenVisualizer3D.js';
import { ValidationManager } from './ValidationManager.js';
import { StorageManager } from './StorageManager.js';
import { URLManager } from './URLManager.js';
import { UnitManager } from './UnitManager.js';
import { AmazonLinkManager } from './AmazonLinkManager.js';

// Screen Manager - Centralized state and operations
class ScreenManager {
    constructor() {
        console.log('ScreenManager constructor called');
        console.log('CONFIG.SELECTORS.CANVAS_ID:', CONFIG.SELECTORS.CANVAS_ID);
        
        this.screens = [];
        console.log('Creating ScreenVisualizer3D...');
        this.visualizer = new ScreenVisualizer3D(CONFIG.SELECTORS.CANVAS_ID);
        console.log('ScreenVisualizer3D created');
        
        this.validator = new ValidationManager();
        this.storage = new StorageManager();
        this.urlManager = new URLManager();
        this.unitManager = new UnitManager();
        this.amazonLinkManager = new AmazonLinkManager();
        this.accessibilityManager = null; // Will be set by main.js
        this.screensContainer = document.getElementById(CONFIG.SELECTORS.SCREENS_CONTAINER_ID);
        this.addButton = document.getElementById(CONFIG.SELECTORS.ADD_SCREEN_BUTTON_ID);
        this.nextId = 1;
        this.colors = CONFIG.COLORS.SCREEN_COLORS;
        this.usedNumbers = new Set(); // Track which screen numbers are in use
        this.autoSaveTimeout = null; // For debounced auto-save
        this.urlUpdateTimeout = null; // For debounced URL updates
        
        // Set unit manager reference on validator immediately
        this.validator.setUnitManager(this.unitManager);
        
        this.init();
    }
    
    /**
     * Set accessibility manager reference for integration
     */
    setAccessibilityManager(accessibilityManager) {
        this.accessibilityManager = accessibilityManager;
        // Also set it for the validation manager and unit manager
        this.validator.setAccessibilityManager(accessibilityManager);
        this.unitManager.setAccessibilityManager(accessibilityManager);
        // Set unit manager reference on validator for dynamic units
        this.validator.setUnitManager(this.unitManager);
    }
    
    init() {
        // Setup URL state change listener first
        this.urlManager.onStateChange((urlState) => {
            if (urlState) {
                // Valid state from URL (shared link or navigation)
                this.restoreFromState(urlState);
                // Save to localStorage for persistence
                this.saveState();
            } else {
                // No URL state, try localStorage on navigation
                const savedState = this.loadState();
                if (savedState && savedState.screens && savedState.screens.length > 0) {
                    this.restoreFromState(savedState);
                }
            }
        });
        
        // Check for shared link first (URL parameters)
        const urlState = this.urlManager.processSharedLink();
        let savedState = null;
        
        if (urlState && urlState.screens && urlState.screens.length > 0) {
            // Shared link takes precedence - restore from URL and save to localStorage
            this.restoreFromState(urlState);
            this.saveState();
        } else {
            // Try to load from localStorage
            savedState = this.loadState();
            
            if (savedState && savedState.screens && savedState.screens.length > 0) {
                // Restore from saved state
                this.restoreFromState(savedState);
                // Update browser history with clean state (without URL params)
                this.updateURL(true);
            } else {
                // Initialize with default screens if no saved state
                this.addScreen({
                    preset: '24-1920-1080',
                    diagonal: CONFIG.DEFAULTS.PRESET_DIAGONAL,
                    width: CONFIG.DEFAULTS.PRESET_RESOLUTION[0],
                    height: CONFIG.DEFAULTS.PRESET_RESOLUTION[1],
                    distance: CONFIG.DEFAULTS.PRESET_DISTANCE,
                    curvature: CONFIG.DEFAULTS.PRESET_CURVATURE,
                    scaling: CONFIG.DEFAULTS.PRESET_SCALING
                });
                // Add second default screen: 34" ultrawide
                this.addScreen({
                    preset: '34-3440-1440',
                    diagonal: 34,
                    width: 3440,
                    height: 1440,
                    distance: 600,
                    curvature: 1500,
                    scaling: CONFIG.DEFAULTS.PRESET_SCALING
                });
            }
        }
        
        // Setup view angle controls
        document.querySelectorAll('input[name="viewAngle"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.visualizer.setViewAngle(e.target.value);
                this.autoSave(); // Save UI state changes
                this.updateURL(); // Update URL with new view angle
            });
        });
        
        // Restore UI state if available (URL state takes precedence)
        const stateToRestore = urlState || savedState;
        if (stateToRestore && stateToRestore.uiState) {
            this.restoreUIState(stateToRestore.uiState);
        }
        
        // Initialize unit manager
        this.unitManager.init();
        
        // Setup add button
        const addButton = document.getElementById('add-screen');
        if (addButton) {
            addButton.addEventListener('click', () => {
                if (this.screens.length < 4) {
                    // Always add the same default preset (24" 1920x1080)
                    this.addScreen({
                        preset: '24-1920-1080',
                        diagonal: CONFIG.DEFAULTS.PRESET_DIAGONAL,
                        width: CONFIG.DEFAULTS.PRESET_RESOLUTION[0],
                        height: CONFIG.DEFAULTS.PRESET_RESOLUTION[1],
                        distance: CONFIG.DEFAULTS.PRESET_DISTANCE,
                        curvature: CONFIG.DEFAULTS.PRESET_CURVATURE,
                        scaling: CONFIG.DEFAULTS.PRESET_SCALING
                    });
                }
            });
        }
        
        // Setup reset button
        document.getElementById('reset-button').addEventListener('click', () => {
            this.resetToDefault();
        });
        
        // Setup share button
        document.getElementById('copy-url-button').addEventListener('click', () => {
            this.shareConfiguration();
        });
        
        // Setup info button
        document.getElementById('info-button').addEventListener('click', () => {
            this.showInfoModal();
        });
        
        // Setup screen removal click for remove button
        this.screensContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-screen') && !e.target.classList.contains('hidden')) {
                const screenId = e.target.closest('.container').dataset.screenId;
                this.removeScreen(screenId);
            }
        });

        // Populate preset options in the template
        this.populateTemplatePresets();
    }

    /**
     * Populate preset options in the template container from CONFIG.PRESETS
     */
    populateTemplatePresets() {
        const template = this.screensContainer.querySelector('[data-screen-id="template"]');
        if (template) {
            this.populatePresetOptions(template);
        }
    }
    
    /**
     * Get the next available preset that's not already in use
     * @returns {Object} Next available preset configuration
     */
    getNextBiggerPreset() {
        // Sort presets by diagonal size
        const sortedPresets = [...CONFIG.PRESETS].sort((a, b) => a.diagonal - b.diagonal);
        
        if (this.screens.length === 0) {
            // If no screens exist, return the first preset (24")
            return sortedPresets[0];
        }
        
        // Get all diagonal sizes currently in use
        const usedDiagonals = new Set(this.screens.map(screen => screen.diagonal).filter(d => d != null));
        
        // Find the largest diagonal among existing screens
        const maxExistingDiagonal = Math.max(...this.screens.map(screen => screen.diagonal || 0));
        
        // First, try to find the next bigger preset that's not already used
        let nextPreset = sortedPresets.find(preset => 
            preset.diagonal > maxExistingDiagonal && !usedDiagonals.has(preset.diagonal)
        );
        
        // If no bigger unused preset exists, try to find any unused preset (smaller or bigger)
        if (!nextPreset) {
            nextPreset = sortedPresets.find(preset => !usedDiagonals.has(preset.diagonal));
        }
        
        // If all presets are used, return the largest one (fallback)
        return nextPreset || sortedPresets[sortedPresets.length - 1];
    }
    
    addScreen(data = {}) {
        const screenId = this.nextId++;
        
        // Find the lowest available screen number
        let screenNumber = 1;
        while (this.usedNumbers.has(screenNumber)) {
            screenNumber++;
        }
        this.usedNumbers.add(screenNumber);
        
        // If a preset is specified, get preset data for defaults
        let presetData = {};
        if (data.preset) {
            const preset = CONFIG.PRESET_UTILS ? CONFIG.PRESET_UTILS.getPresetByValue(data.preset) : null;
            if (preset) {
                presetData = {
                    diagonal: preset.diagonal,
                    width: preset.width,
                    height: preset.height,
                    distance: preset.distance || CONFIG.DEFAULTS.PRESET_DISTANCE,
                    curvature: preset.curvature || CONFIG.DEFAULTS.PRESET_CURVATURE
                };
            }
        }
        
        const screenData = {
            id: screenId,
            screenNumber: screenNumber,
            preset: data.preset || '',
            diagonal: data.diagonal || presetData.diagonal || null,
            width: data.width || presetData.width || null,
            height: data.height || presetData.height || null,
            distance: data.distance || presetData.distance || CONFIG.DEFAULTS.PRESET_DISTANCE,
            curvature: data.curvature !== undefined ? data.curvature : (presetData.curvature !== undefined ? presetData.curvature : CONFIG.DEFAULTS.PRESET_CURVATURE),
            scaling: data.scaling || CONFIG.DEFAULTS.PRESET_SCALING
        };
        
        this.screens.push(screenData);
        this.renderScreen(screenData);
        this.updateAddButtonVisibility();
        this.updateCloseButtonAvailability();
        this.updateVisualizer();
        this.autoSave(); // Save state after adding screen
        this.updateURL(); // Update URL after adding screen
        
        // Announce screen addition to accessibility manager
        if (this.accessibilityManager) {
            this.accessibilityManager.announceScreenAdded(screenNumber);
        }
    }
    
    removeScreen(screenId) {
        if (this.screens.length <= 1) return;
        
        const screenData = this.screens.find(screen => screen.id == screenId);
        if (screenData) {
            const screenNumber = screenData.screenNumber;
            this.usedNumbers.delete(screenNumber);
            
            // Announce screen removal to accessibility manager
            if (this.accessibilityManager) {
                this.accessibilityManager.announceScreenRemoved(screenNumber);
            }
        }
        
        // Clear any validation errors before removing
        this.validator.clearAllErrors(screenId);
        
        this.screens = this.screens.filter(screen => screen.id != screenId);
        document.querySelector(`[data-screen-id="${screenId}"]`).remove();
        this.updateAddButtonVisibility();
        this.updateCloseButtonAvailability();
        this.updateVisualizer();
        this.autoSave(); // Save state after removing screen
        this.updateURL(); // Update URL after removing screen
    }
    
    updateScreen(screenId, field, value) {
        const screen = this.screens.find(s => s.id == screenId);
        if (!screen) return;

        // Update the screen data
        screen[field] = value;
        
        // Update error display for the entire screen
        this.validator.debouncedUpdateErrorDisplay(screenId);
        
        // Update calculations and visualizer
        this.calculateAndRenderScreen(screenId);
        this.updateVisualizer();
        this.autoSave(); // Save state after updating screen
        this.updateURL(); // Update URL after updating screen
    }
    
    renderScreen(screenData) {
        const container = this.createScreenElement(screenData);
        this.screensContainer.appendChild(container);
        this.attachListeners(container, screenData.id);
        this.calculateAndRenderScreen(screenData.id);
        
        // Setup accessibility labels for the new screen
        if (this.accessibilityManager) {
            this.accessibilityManager.setupScreenAriaLabels(container, screenData.screenNumber);
        }
    }
    
    createScreenElement(screenData) {
        const template = this.screensContainer.querySelector('[data-screen-id="template"]');
        const container = template.cloneNode(true);
        
        container.dataset.screenId = screenData.id;
        container.style.display = 'block'; // Make the cloned container visible
        
        // Set screen number and color based on persistent screenNumber
        const screenNumber = screenData.screenNumber;
        const color = this.colors[(screenNumber - 1) % this.colors.length];
        
        const numberElement = container.querySelector(`.${CONFIG.SELECTORS.CLASSES.SCREEN_NUMBER}`);
        numberElement.innerHTML = `<span class="${CONFIG.SELECTORS.CLASSES.NUMBER_TEXT}">${screenNumber}</span>`;
        numberElement.style.backgroundColor = color;
        numberElement.style.borderColor = color;
        
        // Update IDs and values
        const elements = CONFIG.FIELDS.NAMES;
        
        elements.forEach(name => {
            const input = container.querySelector(`[id^="${name}-"]`);
            const label = container.querySelector(`label[for^="${name}-"]`);
            
            if (input) {
                input.id = `${name}-${screenData.id}`;
                
                // Set input values, converting units for distance only
                // Skip preset here - we'll set it after populating options
                if (name !== 'preset') {
                    let value = screenData[name];
                    if (name === 'distance' && value) {
                        value = this.unitManager.formatInputValue(value);
                    } else if (name === 'scaling') {
                        value = value || CONFIG.DEFAULTS.PRESET_SCALING;
                    } else if (value === null || value === undefined) {
                        value = '';
                    }
                    
                    input.value = value;
                    
                    if (name === 'curvature' && !screenData[name]) {
                        input.placeholder = 'Flat';
                    }
                }
            }
            if (label) {
                label.setAttribute('for', `${name}-${screenData.id}`);
            }
        });

        // Update validation error container IDs
        const errorContainer = container.querySelector(`#validation-errors-template`);
        const errorList = container.querySelector(`#error-list-template`);
        if (errorContainer) {
            errorContainer.id = `validation-errors-${screenData.id}`;
        }
        if (errorList) {
            errorList.id = `error-list-${screenData.id}`;
        }

        // Populate preset options from CONFIG.PRESETS
        this.populatePresetOptions(container);
        
        // Now set the preset value after options are populated
        const presetSelect = container.querySelector(`#preset-${screenData.id}`);
        if (presetSelect && screenData.preset !== undefined) {
            presetSelect.value = screenData.preset;
        }
        
        return container;
    }

    /**
     * Populate preset options in a screen container from CONFIG.PRESETS
     * @param {HTMLElement} container - The screen container element
     */
    populatePresetOptions(container) {
        const presetSelect = container.querySelector('select[id^="preset-"]');
        if (!presetSelect) return;

        // Check if this is the template
        const isTemplate = container.dataset.screenId === 'template';

        // Clear existing options
        presetSelect.innerHTML = '<option value="">Custom</option>';

        // Add preset options from CONFIG.PRESETS
        if (CONFIG.PRESETS) {
            CONFIG.PRESETS.forEach(preset => {
                const option = document.createElement('option');
                option.value = preset.value;
                option.textContent = preset.label;
                
                // Only set default selection for template
                if (isTemplate && preset.selected) {
                    option.selected = true;
                }
                
                presetSelect.appendChild(option);
            });
        }
    }
    
    attachListeners(container, screenId) {
        const inputs = {
            preset: container.querySelector(`#preset-${screenId}`),
            diagonal: container.querySelector(`#diagonal-${screenId}`),
            width: container.querySelector(`#width-${screenId}`),
            height: container.querySelector(`#height-${screenId}`),
            distance: container.querySelector(`#distance-${screenId}`),
            curvature: container.querySelector(`#curvature-${screenId}`),
            scaling: container.querySelector(`#scaling-${screenId}`)
        };

        // Flag to prevent preset updates during initialization
        let isInitializing = true;
        
        // Debounce helper for validation
        const debounce = (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        };

        inputs.preset.addEventListener('change', (e) => {
            const value = e.target.value;
            // Clear any validation errors for preset (it's not validated)
            inputs.preset.classList.remove('input-error');
            
            if (value) {
                // Find the preset configuration
                const preset = CONFIG.PRESET_UTILS ? CONFIG.PRESET_UTILS.getPresetByValue(value) : null;
                
                if (preset) {
                    // Update all preset values including distance and curvature
                    this.updateScreen(screenId, 'preset', value);
                    this.updateScreen(screenId, 'diagonal', preset.diagonal);
                    this.updateScreen(screenId, 'width', preset.width);
                    this.updateScreen(screenId, 'height', preset.height);
                    this.updateScreen(screenId, 'distance', preset.distance || CONFIG.DEFAULTS.PRESET_DISTANCE);
                    this.updateScreen(screenId, 'curvature', preset.curvature || CONFIG.DEFAULTS.PRESET_CURVATURE);
                    
                    // Update DOM values
                    inputs.diagonal.value = preset.diagonal;
                    inputs.width.value = preset.width;
                    inputs.height.value = preset.height;
                    inputs.distance.value = this.unitManager.convertFromMm(preset.distance || CONFIG.DEFAULTS.PRESET_DISTANCE);
                    inputs.curvature.value = preset.curvature || '';
                } else {
                    // Fallback to old parsing method if preset not found in CONFIG
                    const [diag, w, h] = value.split('-');
                    this.updateScreen(screenId, 'preset', value);
                    this.updateScreen(screenId, 'diagonal', parseFloat(diag));
                    this.updateScreen(screenId, 'width', parseInt(w));
                    this.updateScreen(screenId, 'height', parseInt(h));
                    
                    // Update DOM values
                    inputs.diagonal.value = diag;
                    inputs.width.value = w;
                    inputs.height.value = h;
                }
            } else {
                this.updateScreen(screenId, 'preset', '');
            }
        });

        const updatePreset = () => {
            // Don't update preset during initialization
            if (isInitializing) return;
            
            const diagVal = parseFloat(inputs.diagonal.value);
            const wVal = parseInt(inputs.width.value);
            const hVal = parseInt(inputs.height.value);

            this.updateScreen(screenId, 'diagonal', diagVal);
            this.updateScreen(screenId, 'width', wVal);
            this.updateScreen(screenId, 'height', hVal);

            if (!isNaN(diagVal) && !isNaN(wVal) && !isNaN(hVal)) {
                const matchingOption = Array.from(inputs.preset.options).find(option => {
                    if (!option.value) return false;
                    const [optDiag, optW, optH] = option.value.split('-').map((v, i) => i === 0 ? parseFloat(v) : parseInt(v));
                    return optDiag === diagVal && optW === wVal && optH === hVal;
                });
                
                const presetValue = matchingOption ? matchingOption.value : '';
                inputs.preset.value = presetValue;
                this.updateScreen(screenId, 'preset', presetValue);
            } else {
                inputs.preset.value = '';
                this.updateScreen(screenId, 'preset', '');
            }
        };

        // Debounced input handlers for better UX
        const debouncedUpdatePreset = debounce(updatePreset, 100);
        
        // Add immediate validation on blur for better feedback
        const addImmediateValidation = (input, fieldName) => {
            input.addEventListener('blur', () => {
                // Update error display for entire screen
                this.validator.updateErrorDisplay(screenId);
            });
        };
        
        inputs.diagonal.addEventListener('input', debouncedUpdatePreset);
        inputs.width.addEventListener('input', debouncedUpdatePreset);
        inputs.height.addEventListener('input', debouncedUpdatePreset);
        
        // Add immediate validation
        addImmediateValidation(inputs.diagonal, 'diagonal');
        addImmediateValidation(inputs.width, 'width');
        addImmediateValidation(inputs.height, 'height');
        
        inputs.distance.addEventListener('input', debounce(() => {
            const inputValue = parseFloat(inputs.distance.value);
            const valueInMm = this.unitManager.convertToMm(inputValue);
            this.updateScreen(screenId, 'distance', valueInMm);
        }, 100));
        
        addImmediateValidation(inputs.distance, 'distance');
        
        inputs.curvature.addEventListener('input', debounce(() => {
            const value = inputs.curvature.value;
            if (value === '0') {
                inputs.curvature.value = '';
            }
            const curvature = value === '' || value === '0' ? null : parseFloat(value);
            this.updateScreen(screenId, 'curvature', curvature);
        }, 100));
        
        addImmediateValidation(inputs.curvature, 'curvature');
        
        inputs.scaling.addEventListener('input', debounce(() => {
            this.updateScreen(screenId, 'scaling', parseFloat(inputs.scaling.value));
        }, 100));
        
        addImmediateValidation(inputs.scaling, 'scaling');
        
        // Clear initialization flag after a short delay to allow DOM to settle
        setTimeout(() => {
            isInitializing = false;
        }, 100);
    }
    
    calculateAndRenderScreen(screenId) {
        const screen = this.screens.find(s => s.id == screenId);
        const container = document.querySelector(`[data-screen-id="${screenId}"]`);
        
        if (!screen || !container) return;
        
        const outputContainers = container.querySelectorAll('.output-item');
        const nativeOutputs = outputContainers[0].querySelectorAll('.output-value');
        const scaledOutputs = outputContainers[1].querySelectorAll('.output-value');
        const nativeTitle = container.querySelector('.output-section-title');
        const scaledTitle = container.querySelectorAll('.output-section-title')[1];
        const scaledContainer = outputContainers[1];
        
        const showScaled = screen.scaling !== 100;
        nativeTitle.style.display = showScaled ? 'block' : 'none';
        scaledTitle.style.display = showScaled ? 'block' : 'none';
        scaledContainer.style.display = showScaled ? 'block' : 'none';
        
        if (showScaled) {
            outputContainers[0].classList.remove('no-margin');
        } else {
            outputContainers[0].classList.add('no-margin');
        }
        
        const { diagonal, width, height, distance, curvature, scaling } = screen;
        
        // Check if required fields have valid values
        const validation = this.validator.validateScreen(screen);
        if (!validation.isValid) {
            // If there are validation errors, still try to calculate if basic required fields are present
            if (!validation.validatedData.diagonal || !validation.validatedData.width || 
                !validation.validatedData.height || !validation.validatedData.distance || 
                !validation.validatedData.scaling) {
                this.renderEmptyOutputs(nativeOutputs, scaledOutputs, showScaled);
                
                // Still update Amazon link if we have diagonal and resolution
                if (diagonal && width && height) {
                    this.amazonLinkManager.updateAmazonLink(screenId, diagonal, [width, height]);
                }
                return;
            }
        }

        // Use validated data for calculations
        const validatedData = validation.validatedData;
        const calcDiagonal = validatedData.diagonal || diagonal;
        const calcWidth = validatedData.width || width;
        const calcHeight = validatedData.height || height;
        const calcDistance = validatedData.distance || distance;
        const calcCurvature = validatedData.curvature !== undefined ? validatedData.curvature : curvature;
        const calcScaling = validatedData.scaling || scaling;

        try {
            const screenCalc = new Screen(calcDiagonal, [calcWidth, calcHeight], calcDistance, calcCurvature, calcScaling / 100);
            this.renderCalculatedOutputs(screenCalc, nativeOutputs, scaledOutputs, showScaled);
            
            // Update Amazon link with current screen specs
            this.amazonLinkManager.updateAmazonLink(screenId, calcDiagonal, [calcWidth, calcHeight]);
        } catch (error) {
            console.error('Calculation error:', error);
            this.renderErrorOutputs(nativeOutputs, scaledOutputs, showScaled, error.message);
        }
    }
    
    renderEmptyOutputs(nativeOutputs, scaledOutputs, showScaled) {
        nativeOutputs[0].textContent = '-- x --';
        nativeOutputs[1].textContent = '-- x --';
        nativeOutputs[2].innerHTML = `--<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPI</span>`;
        nativeOutputs[3].innerHTML = `--<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPD</span>`;
        if (showScaled) {
            scaledOutputs[0].textContent = '-- x --';
            scaledOutputs[1].innerHTML = `--<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPI</span>`;
            scaledOutputs[2].innerHTML = `--<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPD</span>`;
        }
    }
    
    renderCalculatedOutputs(screenCalc, nativeOutputs, scaledOutputs, showScaled) {
        // Format dimensions using unit manager
        const widthFormatted = this.unitManager.formatValue(screenCalc.width);
        const heightFormatted = this.unitManager.formatValue(screenCalc.height);
        const unitLabel = this.unitManager.getUnitLabel();
        
        nativeOutputs[0].innerHTML = `${widthFormatted} x ${heightFormatted}<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">${unitLabel}</span>`;
        nativeOutputs[1].innerHTML = `${screenCalc.fov_horizontal.toFixed(1)} x ${screenCalc.fov_vertical.toFixed(1)}<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">deg</span>`;
        nativeOutputs[2].innerHTML = `${screenCalc.ppi}<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPI</span>`;
        
        // Add retina badge if visual density is >= 60 PPD
        const retinaBadge = screenCalc.ppd >= 60 ? '<span class="retina-badge"><span class="material-icons">visibility</span></span>' : '';
        nativeOutputs[3].innerHTML = `${retinaBadge}${screenCalc.ppd.toFixed(1)}<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPD</span>`;
        
        if (showScaled) {
            scaledOutputs[0].innerHTML = `${screenCalc.resolution_scaled[0]} x ${screenCalc.resolution_scaled[1]}<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">px</span>`;
            scaledOutputs[1].innerHTML = `${screenCalc.ppi_scaled}<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPI</span>`;
            
            // Add retina badge if scaled visual density is >= 60 PPD
            const scaledRetinaBadge = screenCalc.ppd_scaled >= 60 ? '<span class="retina-badge"><span class="material-icons">visibility</span></span>' : '';
            scaledOutputs[2].innerHTML = `${scaledRetinaBadge}${screenCalc.ppd_scaled.toFixed(1)}<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPD</span>`;
        }
    }
    
    renderErrorOutputs(nativeOutputs, scaledOutputs, showScaled, errorMessage = CONFIG.MESSAGES.CALCULATION_ERROR) {
        const errorText = errorMessage.length > 20 ? CONFIG.MESSAGES.CALCULATION_ERROR_SHORT : errorMessage;
        nativeOutputs[0].textContent = errorText;
        nativeOutputs[1].textContent = errorText;
        nativeOutputs[2].innerHTML = `${errorText}<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPI</span>`;
        nativeOutputs[3].innerHTML = `${errorText}<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPD</span>`;
        if (showScaled) {
            scaledOutputs[0].textContent = errorText;
            scaledOutputs[1].innerHTML = `${errorText}<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPI</span>`;
            scaledOutputs[2].innerHTML = `${errorText}<span class="${CONFIG.SELECTORS.CLASSES.OUTPUT_UNIT}">PPD</span>`;
        }
    }
    
    updateRemoveButtonsVisibility() {
        // No longer needed since screen numbers handle removal
    }
    
    updateCloseButtonAvailability() {
        const containers = this.screensContainer.querySelectorAll('.container:not([data-screen-id="template"])');
        const hasOnlyOneScreen = containers.length === 1;
        
        containers.forEach((container) => {
            const removeButton = container.querySelector('.remove-screen');
            
            // Hide or show remove button based on whether this is the last screen
            if (hasOnlyOneScreen) {
                removeButton.classList.add('hidden');
            } else {
                removeButton.classList.remove('hidden');
            }
        });
    }
    
    updateAddButtonVisibility() {
        if (this.addButton) {
            this.addButton.style.display = this.screens.length >= 4 ? 'none' : 'block';
        }
    }
    
    updateVisualizer() {
        const validScreens = this.screens
            .filter(screen => {
                const { diagonal, width, height, distance, scaling } = screen;
                return !isNaN(diagonal) && !isNaN(width) && !isNaN(height) && !isNaN(distance) && !isNaN(scaling);
            })
            .map(screen => {
                try {
                    const screenObj = new Screen(screen.diagonal, [screen.width, screen.height], screen.distance, screen.curvature, screen.scaling / 100);
                    // Preserve the screenNumber for visualization
                    screenObj.screenNumber = screen.screenNumber;
                    return screenObj;
                } catch (error) {
                    return null;
                }
            })
            .filter(screen => screen !== null);
        
        this.visualizer.updateScreens(validScreens);
    }
    
    resetToDefault() {
        // Temporarily disable auto-save during reset
        const originalAutoSave = CONFIG.STORAGE.AUTO_SAVE;
        CONFIG.STORAGE.AUTO_SAVE = false;
        
        // Remove all existing screen containers (except template)
        const containers = this.screensContainer.querySelectorAll('.container:not([data-screen-id="template"])');
        containers.forEach(container => container.remove());
        
        // Reset state
        this.screens = [];
        this.nextId = 1;
        this.usedNumbers.clear();
        
        // Clear any pending auto-save timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }
        
        // Clear any pending URL update timeout
        if (this.urlUpdateTimeout) {
            clearTimeout(this.urlUpdateTimeout);
            this.urlUpdateTimeout = null;
        }
        
        // Clear saved state and URL
        this.storage.clear();
        this.clearURL();
        
        // Add default screens (without triggering auto-save)
        this.addScreen({
            preset: '24-1920-1080',
            diagonal: 24,
            width: 1920,
            height: 1080,
            distance: 600,
            curvature: null,
            scaling: 100
        });
        // Add second default screen: 34" ultrawide
        this.addScreen({
            preset: '34-3440-1440',
            diagonal: 34,
            width: 3440,
            height: 1440,
            distance: 600,
            curvature: 1500,
            scaling: 100
        });

        // Re-enable auto-save and save the default state
        CONFIG.STORAGE.AUTO_SAVE = originalAutoSave;
        this.saveState();
        
        // Update history with clean state
        this.updateURL(true);
        
        // Announce reset to accessibility manager
        if (this.accessibilityManager) {
            this.accessibilityManager.announceReset();
        }
        
        console.log('Application reset to default state');
    }

    /**
     * Auto-save current state with debouncing to prevent excessive saves
     */
    autoSave() {
        if (!CONFIG.STORAGE.AUTO_SAVE) return;
        
        // Clear existing timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        
        // Set new timeout for debounced save
        this.autoSaveTimeout = setTimeout(() => {
            this.saveState();
            this.autoSaveTimeout = null;
        }, CONFIG.TIMING.AUTO_SAVE_DELAY);
    }

    /**
     * Save current application state to localStorage
     * @returns {boolean} True if save was successful
     */
    saveState() {
        const state = this.getCurrentState();
        return this.storage.save(state);
    }

    /**
     * Load application state from localStorage
     * @returns {Object|null} Loaded state or null if not found
     */
    loadState() {
        return this.storage.load();
    }

    /**
     * Clear saved state from localStorage
     * @returns {boolean} True if clear was successful
     */
    clearState() {
        return this.storage.clear();
    }

    /**
     * Get current application state
     * @returns {Object} Current state object
     */
    getCurrentState() {
        return {
            screens: this.screens.map(screen => ({
                id: screen.id,
                screenNumber: screen.screenNumber,
                preset: screen.preset,
                diagonal: screen.diagonal,
                width: screen.width,
                height: screen.height,
                distance: screen.distance,
                curvature: screen.curvature,
                scaling: screen.scaling
            })),
            uiState: {}
        };
    }

    /**
     * Update URL with current application state (debounced)
     * @param {boolean} replaceState - Whether to replace current history entry
     */
    updateURL(replaceState = false) {
        // Clear existing timeout
        if (this.urlUpdateTimeout) {
            clearTimeout(this.urlUpdateTimeout);
        }
        
        // Set new timeout for debounced URL update
        this.urlUpdateTimeout = setTimeout(() => {
            const state = this.getCurrentState();
            this.urlManager.updateURL(state, replaceState);
            this.urlUpdateTimeout = null;
        }, CONFIG.TIMING.URL_UPDATE_DELAY || 300); // Default to 300ms if not defined
    }

    /**
     * Get shareable URL for current configuration
     * @returns {string|null} Shareable URL or null if generation failed
     */
    getShareableURL() {
        const state = this.getCurrentState();
        return this.urlManager.getShareableURL(state);
    }

    /**
     * Clear URL parameters (reset to clean URL)
     */
    clearURL() {
        this.urlManager.clearURL();
    }

    /**
     * Get URL state information for debugging
     * @returns {Object} URL state info
     */
    getURLInfo() {
        return this.urlManager.getURLInfo();
    }

    /**
     * Share current configuration by copying URL to clipboard
     */
    async shareConfiguration() {
        try {
            const shareableURL = this.getShareableURL();
            if (!shareableURL) {
                console.error('Failed to generate shareable URL');
                this.showShareFeedback(false, 'Failed to generate URL');
                return;
            }
            
            // Try to copy to clipboard
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(shareableURL);
                this.showShareFeedback(true, 'URL copied to clipboard!');
                
                // Announce to accessibility manager
                if (this.accessibilityManager) {
                    this.accessibilityManager.announceUrlCopied();
                }
            } else {
                // Fallback for non-secure contexts or older browsers
                this.fallbackCopyToClipboard(shareableURL);
            }
        } catch (error) {
            console.error('Failed to copy URL to clipboard:', error);
            this.showShareFeedback(false, 'Failed to copy URL');
        }
    }

    /**
     * Fallback method to copy text to clipboard
     * @param {string} text - Text to copy
     */
    fallbackCopyToClipboard(text) {
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                this.showShareFeedback(true, 'URL copied to clipboard!');
                
                // Announce to accessibility manager
                if (this.accessibilityManager) {
                    this.accessibilityManager.announceUrlCopied();
                }
            } else {
                this.showShareFeedback(false, 'Please copy URL manually: ' + text);
            }
        } catch (error) {
            console.error('Fallback copy failed:', error);
            this.showShareFeedback(false, 'Please copy URL manually: ' + text);
        }
    }

    /**
     * Show visual feedback for share action
     * @param {boolean} success - Whether the operation was successful
     * @param {string} message - Message to show (for console/debugging)
     */
    showShareFeedback(success, message) {
        const shareButton = document.getElementById('copy-url-button');
        if (!shareButton) return;
        
        console.log(message);
        
        if (success) {
            // Show success state
            shareButton.classList.add('success');
            shareButton.textContent = 'check';
            
            // Reset after 2 seconds
            setTimeout(() => {
                shareButton.classList.remove('success');
                shareButton.textContent = 'link';
            }, 2000);
        } else {
            // Show error state briefly
            const originalText = shareButton.textContent;
            shareButton.textContent = 'error';
            
            setTimeout(() => {
                shareButton.textContent = originalText;
            }, 1000);
        }
    }

    /**
     * Show the info modal with explanations
     */
    showInfoModal() {
        const modal = document.getElementById('info-modal');
        if (modal) {
            modal.style.display = 'flex';
            
            // Focus the modal for accessibility
            const modalTitle = document.getElementById('info-modal-title');
            if (modalTitle) {
                modalTitle.focus();
            }
            
            // Setup close button
            const closeButton = document.getElementById('info-modal-close');
            if (closeButton) {
                closeButton.onclick = () => this.hideInfoModal();
            }
            
            // Setup overlay click to close
            modal.onclick = (e) => {
                if (e.target === modal) {
                    this.hideInfoModal();
                }
            };
            
            // Setup escape key to close
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    this.hideInfoModal();
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
            
            // Announce to accessibility manager
            if (this.accessibilityManager) {
                this.accessibilityManager.announce('Information modal opened');
            }
        }
    }

    /**
     * Hide the info modal
     */
    hideInfoModal() {
        const modal = document.getElementById('info-modal');
        if (modal) {
            modal.style.display = 'none';
            
            // Return focus to the info button
            const infoButton = document.getElementById('info-button');
            if (infoButton) {
                infoButton.focus();
            }
            
            // Announce to accessibility manager
            if (this.accessibilityManager) {
                this.accessibilityManager.announce('Information modal closed');
            }
        }
    }

    /**
     * Restore application state from loaded data
     * @param {Object} state - State object to restore
     */
    restoreFromState(state) {
        // Clear existing screens
        const containers = this.screensContainer.querySelectorAll('.container:not([data-screen-id="template"])');
        containers.forEach(container => container.remove());
        
        // Reset internal state
        this.screens = [];
        this.usedNumbers.clear();
        
        // Find the highest ID to continue numbering from
        let maxId = 0;
        state.screens.forEach(screen => {
            if (screen.id && screen.id > maxId) {
                maxId = screen.id;
            }
        });
        this.nextId = maxId + 1;
        
        // Restore each screen
        state.screens.forEach((screenData, index) => {
            // Generate ID if not present (URL state might not have IDs)
            const id = screenData.id || this.nextId++;
            
            // Generate screen number if not present
            let screenNumber = screenData.screenNumber;
            if (!screenNumber) {
                // Find the lowest available screen number
                screenNumber = 1;
                while (this.usedNumbers.has(screenNumber)) {
                    screenNumber++;
                }
            }
            
            // Add to used numbers
            this.usedNumbers.add(screenNumber);
            
            // Create screen with preserved or generated ID and screenNumber
            const screen = {
                id: id,
                screenNumber: screenNumber,
                preset: screenData.preset || '',
                diagonal: screenData.diagonal,
                width: screenData.width,
                height: screenData.height,
                distance: screenData.distance,
                curvature: screenData.curvature,
                scaling: screenData.scaling
            };
            
            this.screens.push(screen);
            this.renderScreen(screen);
        });
        
        // Update UI state
        this.updateAddButtonVisibility();
        this.updateCloseButtonAvailability();
        this.updateVisualizer();
        
        console.log(`Restored ${state.screens.length} screens from saved state`);
    }

    /**
     * Restore UI state (view mode, etc.)
     * @param {Object} uiState - UI state to restore
     */
    restoreUIState(uiState) {
        // No UI state to restore for now
    }

    /**
     * Get storage information for debugging/status
     * @returns {Object} Storage info
     */
    getStorageInfo() {
        return this.storage.getStorageInfo();
    }

    /**
     * Recalculate and re-render all screens (used when units change)
     */
    recalculateAllScreens() {
        this.screens.forEach(screen => {
            this.calculateAndRenderScreen(screen.id);
        });
        this.updateVisualizer();
    }
}

// Export for ES6 modules
export { ScreenManager };
