// Import Three.js ES modules
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// Import configuration constants
import { CONFIG } from './config.js';

// 3D Screen Visualizer - Handles the 3D visual comparison of screens using Three.js
class ScreenVisualizer3D {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.canvas = document.getElementById(canvasId);
        this.canvasContainer = this.canvas ? this.canvas.parentElement : null;
        
        this.screens = [];
        this.viewDistance = CONFIG.DEFAULTS.VIEW_DISTANCE;
        this.viewAngle = 'front'; // 'front' or '3d' for isometric
        this.colors = CONFIG.COLORS.SCREEN_COLORS;
        
        // Theme awareness
        this.currentTheme = this.getEffectiveTheme();
        
        // Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.screenMeshes = []; // Array to hold multiple screen meshes
        this.isInitialized = false;
        
        // Optimization: Cache previous state for change detection
        this.lastScreensHash = null;
        this.lastCanvasSize = { width: 0, height: 0 };
        this.lastTheme = this.currentTheme;
        
        // Initialize after a short delay to ensure CSS layout is complete
        setTimeout(() => {
            this.init3D();
            this.setupEventListeners();
        }, 100);
    }

    init3D() {
        // Check if canvas exists
        if (!this.canvas) {
            console.error('Canvas not found!');
            return;
        }
        
        // Create a new canvas for Three.js since the existing one might have a 2D context
        const canvasContainer = this.canvas.parentElement;
        const oldCanvas = this.canvas;
        
        // Create new canvas element
        const newCanvas = document.createElement('canvas');
        newCanvas.id = this.canvasId;
        newCanvas.className = 'visualizer-canvas';
        newCanvas.setAttribute('aria-label', 'Visual representation of monitor configurations');
        
        // Replace the old canvas
        canvasContainer.replaceChild(newCanvas, oldCanvas);
        this.canvas = newCanvas;
        
        
        // Force the canvas to have proper dimensions
        const container = canvasContainer;
        const containerRect = container.getBoundingClientRect();
        
        // Set explicit width and height
        this.canvas.style.width = '100%';
        this.canvas.style.height = '300px';
        this.canvas.style.display = 'block';
        
        // Use explicit pixel values for canvas internal dimensions
        this.canvas.width = Math.max(containerRect.width || 800, 400);
        this.canvas.height = 300;

        // Create the Three.js scene
        this.scene = new THREE.Scene();
        
        // Set up camera with human-eye parameters
        // Human eye comfortable FOV is around 50-60 degrees
        this.camera = new THREE.PerspectiveCamera(
            55, // FOV - comfortable human viewing angle
            this.canvas.width / this.canvas.height, 
            0.1, 
            1000
        );
        
        // Position camera at a typical viewing distance for a 24" monitor
        // Default distance from config is 800mm = 0.8 meters
        this.updateCameraPosition();
        
        // Create renderer using the existing canvas
        try {
            this.renderer = new THREE.WebGLRenderer({ 
                canvas: this.canvas,
                antialias: true 
            });
        } catch (error) {
            console.error('Failed to create WebGL renderer:', error);
            return;
        }
        
        // Check if WebGL context was created
        const gl = this.renderer.getContext();
        if (!gl) {
            console.error('Failed to get WebGL context');
            return;
        }
        
        // Make sure we set the size correctly 
        this.renderer.setSize(this.canvas.width, this.canvas.height, false);
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        
        // Set transparent background (no background color)
        this.renderer.setClearColor(0x000000, 0); // Black with 0 alpha = transparent
        
        // Clear the canvas background CSS since WebGL will handle it
        this.canvas.style.backgroundColor = 'transparent';
        
        // Create screens display for all provided screens
        this.createScreens();
        
        // Do an immediate render to test
        this.renderer.render(this.scene, this.camera);
        
        // Start animation loop
        this.isInitialized = true;
        this.animate();
    }

    createScreens() {
        // Clear any existing screens
        this.clearScreens();
        
        if (!this.screens || this.screens.length === 0) {
            // If no screens, create a default one to show something
            this.createDefaultScreen();
            return;
        }
        
        // Create all screens from the current screens array
        this.screens.forEach((screen, index) => {
            this.createSingleScreen(screen, index);
        });
    }
    
    clearScreens() {
        // Remove all existing screen meshes from scene
        this.screenMeshes.forEach(meshGroup => {
            // Remove border group
            if (meshGroup.border) {
                this.scene.remove(meshGroup.border);
                // Dispose all children in the border group
                meshGroup.border.children.forEach(child => {
                    child.geometry.dispose();
                    child.material.dispose();
                });
            }
            
            // Remove center panel
            if (meshGroup.centerPanel) {
                this.scene.remove(meshGroup.centerPanel);
                meshGroup.centerPanel.geometry.dispose();
                meshGroup.centerPanel.material.dispose();
            }
        });
        this.screenMeshes = [];
    }
    
    createDefaultScreen() {
        // Use a fixed screen preset - 24" FHD monitor when no screens are present
        const preset = CONFIG.PRESETS.find(p => p.selected) || CONFIG.PRESETS[0];
        
        const defaultScreen = {
            diagonal: preset.diagonal,
            resolution: [preset.width, preset.height],
            distance: CONFIG.DEFAULTS.VIEW_DISTANCE,
            screenNumber: 1
        };
        
        this.createSingleScreen(defaultScreen, 0);
    }
    
    createSingleScreen(screenData, index) {
        // Calculate screen dimensions in meters (Three.js uses meters by default)
        const ratio = screenData.resolution[0] / screenData.resolution[1];
        const heightInches = screenData.diagonal / Math.sqrt(ratio ** 2 + 1);
        const widthInches = ratio * heightInches;
        
        // Convert to meters for Three.js (25.4mm per inch, 1000mm per meter)
        const widthMeters = (widthInches * CONFIG.PHYSICS.INCHES_TO_MM) / 1000;
        const heightMeters = (heightInches * CONFIG.PHYSICS.INCHES_TO_MM) / 1000;
        
        // Get screen color based on screenNumber (same as labels)
        const screenNumber = screenData.screenNumber || (index + 1);
        const colorIndex = (screenNumber - 1) % CONFIG.COLORS.SCREEN_COLORS.length;
        const screenColor = new THREE.Color(CONFIG.COLORS.SCREEN_COLORS[colorIndex]);
        
        // Create the border frame instead of a solid screen
        const border = this.createScreenBorder(widthMeters, heightMeters, screenColor);
        
        // Create translucent center panel
        const centerPanel = this.createCenterPanel(widthMeters, heightMeters, screenColor);
        
        // Position all screens at the same location (origin) for size comparison
        border.position.set(0, 0, index * 0.001); // Slight Z offset to prevent z-fighting
        centerPanel.position.set(0, 0, index * 0.001);
        
        // Add to scene
        this.scene.add(border);
        this.scene.add(centerPanel);
        
        // Store screen components together
        this.screenMeshes.push({
            border: border,
            centerPanel: centerPanel,
            screenData: screenData,
            colorIndex: colorIndex
        });
    }
    
    createScreenBorder(screenWidth, screenHeight, screenColor) {
        // Create thick border frame
        const borderThickness = 0.01; // 20mm thick border
        const borderDepth = 0.003;     // 3mm depth
        
        const borderGroup = new THREE.Group();
        
        // Create border material - opaque
        const borderMaterial = new THREE.MeshBasicMaterial({ 
            color: screenColor.clone().multiplyScalar(0.9),
            transparent: false
        });
        
        // Create four border pieces (top, bottom, left, right)
        // Top border
        const topGeometry = new THREE.BoxGeometry(screenWidth, borderThickness, borderDepth);
        const topBorder = new THREE.Mesh(topGeometry, borderMaterial);
        topBorder.position.set(0, (screenHeight + borderThickness) / 2, 0);
        borderGroup.add(topBorder);
        
        // Bottom border  
        const bottomGeometry = new THREE.BoxGeometry(screenWidth, borderThickness, borderDepth);
        const bottomBorder = new THREE.Mesh(bottomGeometry, borderMaterial);
        bottomBorder.position.set(0, -(screenHeight + borderThickness) / 2, 0);
        borderGroup.add(bottomBorder);
        
        // Left border
        const leftGeometry = new THREE.BoxGeometry(borderThickness, screenHeight + borderThickness * 2, borderDepth);
        const leftBorder = new THREE.Mesh(leftGeometry, borderMaterial);
        leftBorder.position.set(-(screenWidth + borderThickness) / 2, 0, 0);
        borderGroup.add(leftBorder);
        
        // Right border
        const rightGeometry = new THREE.BoxGeometry(borderThickness, screenHeight + borderThickness * 2, borderDepth);
        const rightBorder = new THREE.Mesh(rightGeometry, borderMaterial);
        rightBorder.position.set((screenWidth + borderThickness) / 2, 0, 0);
        borderGroup.add(rightBorder);
        
        return borderGroup;
    }
    
    createCenterPanel(screenWidth, screenHeight, screenColor) {
        // Create translucent center panel
        const panelGeometry = new THREE.PlaneGeometry(screenWidth, screenHeight);
        const panelMaterial = new THREE.MeshBasicMaterial({ 
            color: screenColor.clone().multiplyScalar(0.5),
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });
        
        const centerPanel = new THREE.Mesh(panelGeometry, panelMaterial);
        
        return centerPanel;
    }
    
    updateCameraPosition() {
        if (!this.camera) return;
        
        if (this.viewAngle === 'front') {
            // Front view - camera directly in front
            this.camera.position.set(0, 0, 0.8);
            this.camera.lookAt(0, 0, 0);
        } else {
            // 3D isometric view - camera at an angle
            this.camera.position.set(0.5, 0.3, 0.8);
            this.camera.lookAt(0, 0, 0);
        }
    }
    
    animate() {
        if (!this.isInitialized) {
            return;
        }
        
        // No animation needed for static screen display
        // Just render the scene
        this.renderer.render(this.scene, this.camera);
        
        // Continue the animation loop
        requestAnimationFrame(() => this.animate());
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.handleResize();
        });
        
        // Listen for theme changes
        this.setupThemeListener();
    }

    handleResize() {
        if (!this.isInitialized || !this.canvas) return;
        
        const rect = this.canvas.getBoundingClientRect();
        
        // Update camera aspect ratio
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        
        // Update renderer size
        this.renderer.setSize(rect.width, rect.height);
        
        // Reset cache when canvas size changes
        this.lastCanvasSize = { width: rect.width, height: rect.height };
        this.lastScreensHash = null;
    }

    /**
     * Get effective theme (system, light, dark)
     * @returns {string} The effective theme
     */
    getEffectiveTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'system' || !savedTheme) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return savedTheme;
    }

    /**
     * Get theme-specific colors
     * @returns {Object} Color configuration for current theme
     */
    getThemeColors() {
        const theme = this.getEffectiveTheme();
        return theme === 'dark' ? CONFIG.COLORS.DARK : CONFIG.COLORS.LIGHT;
    }

    /**
     * Set up theme change listener
     */
    setupThemeListener() {
        // Listen for theme toggle events
        document.addEventListener('themeChanged', () => {
            this.currentTheme = this.getEffectiveTheme();
            this.render(); // Update screen colors
        });

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'system' || !savedTheme) {
                this.currentTheme = this.getEffectiveTheme();
                this.render(); // Update screen colors
            }
        });
    }

    /**
     * Check if theme has changed
     * @returns {boolean} True if theme has changed
     */
    hasThemeChanged() {
        const currentTheme = this.getEffectiveTheme();
        if (this.lastTheme !== currentTheme) {
            this.lastTheme = currentTheme;
            return true;
        }
        return false;
    }

    /**
     * Generate a hash of the screen data for change detection
     * @param {Array} screens - Array of screen objects
     * @returns {string} Hash string representing current screen state
     */
    generateScreensHash(screens) {
        if (!screens || screens.length === 0) {
            return 'empty';
        }
        
        return screens.map(screen => {
            return `${screen.diagonal}-${screen.resolution[0]}x${screen.resolution[1]}-${screen.distance}-${screen.curvature}-${screen.scaling}-${screen.screenNumber}`;
        }).sort().join('|');
    }

    /**
     * Check if screen data has changed since last render
     * @param {Array} screens - Array of screen objects  
     * @returns {boolean} True if data has changed
     */
    hasScreenDataChanged(screens) {
        const currentHash = this.generateScreensHash(screens);
        const rect = this.canvasContainer.getBoundingClientRect();
        const sizeChanged = this.lastCanvasSize.width !== rect.width || 
                          this.lastCanvasSize.height !== rect.height;
        const themeChanged = this.hasThemeChanged();
        
        if (this.lastScreensHash !== currentHash || sizeChanged || themeChanged) {
            this.lastScreensHash = currentHash;
            this.lastCanvasSize = { width: rect.width, height: rect.height };
            return true;
        }
        
        return false;
    }

    updateScreens(screens) {
        this.screens = screens || [];
        
        // Only render if screen data has actually changed and visualizer is initialized
        if (this.isInitialized && this.hasScreenDataChanged(this.screens)) {
            this.createScreens(); // Recreate all screens with new data
        }
    }

    setViewDistance(distance) {
        if (this.viewDistance !== distance) {
            this.viewDistance = distance;
            // Note: viewDistance is kept for potential future use but not currently used in rendering
        }
    }

    setViewAngle(angle) {
        if (this.viewAngle !== angle) {
            this.viewAngle = angle;
            if (this.isInitialized) {
                this.updateCameraPosition();
            }
        }
    }

    render() {
        if (!this.isInitialized) return;
        
        // Update colors for all screens based on current theme
        this.screenMeshes.forEach(meshGroup => {
            const screenColor = new THREE.Color(CONFIG.COLORS.SCREEN_COLORS[meshGroup.colorIndex]);
            
            // Update border color - opaque and vibrant
            if (meshGroup.border) {
                const borderColor = screenColor.clone().multiplyScalar(0.9);
                meshGroup.border.children.forEach(borderPiece => {
                    borderPiece.material.color.copy(borderColor);
                });
            }
            
            // Update center panel color - translucent
            if (meshGroup.centerPanel) {
                const panelColor = screenColor.clone().multiplyScalar(0.5);
                meshGroup.centerPanel.material.color.copy(panelColor);
            }
        });
    }

    // Method for cleanup when destroying the visualizer
    dispose() {
        if (!this.isInitialized) return;
        
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        // Clean up all screens
        this.clearScreens();
        
        this.isInitialized = false;
    }
}

// Export for ES6 modules
export { ScreenVisualizer3D };
