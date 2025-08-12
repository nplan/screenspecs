// Main entry point for Screen Spec Calculator
// Initializes the application with ES6 modules

console.log('main.js starting...');

import { ScreenManager } from './ScreenManager.js';
import { ThemeManager } from './ThemeManager.js';
import { AccessibilityManager } from './AccessibilityManager.js';

console.log('Imports loaded');

// Initialize the accessibility system first
console.log('Creating AccessibilityManager...');
const accessibilityManager = new AccessibilityManager();

// Initialize the theme system
console.log('Creating ThemeManager...');
const themeManager = new ThemeManager();

// Initialize the main application
console.log('Creating ScreenManager...');
const screenManager = new ScreenManager();
console.log('ScreenManager created');

// Connect accessibility manager to other managers
screenManager.setAccessibilityManager(accessibilityManager);
themeManager.setAccessibilityManager(accessibilityManager);

// Make globally accessible for any external access if needed
// (though with modules, this should be minimized)
window.screenManager = screenManager;
window.themeManager = themeManager;
window.accessibilityManager = accessibilityManager;
