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
        this.orbitState = { // Manual orbit controls state
            enabled: false,
            dragging: false,
            mouseX: 0,
            mouseY: 0,
            spherical: new THREE.Spherical(1, Math.PI / 2, 0), // Initialize with proper radius, phi, theta
            target: new THREE.Vector3()
        };
        this.screenMeshes = []; // Array to hold multiple screen meshes
        this.userSphere = null; // Sphere representing user position (20cm diameter)
        this.isInitialized = false;
        
        // Optimization: Cache previous state for change detection
        this.lastScreensHash = null;
        this.lastCanvasSize = { width: 0, height: 0 };
        this.lastTheme = this.currentTheme;
        
        // Animation and responsiveness properties
        this.isAnimating = false;
        this.animationSpeed = 0.1; // Animation interpolation factor (0.1 = smooth, 0.5 = fast)
        this.targetCameraPosition = new THREE.Vector3();
        this.targetCameraLookAt = new THREE.Vector3(0, 0, -1);
        this.responseDelayMs = 150; // Delay before responding to distance changes
        this.responseTimeoutId = null;
        this.lastDistanceHash = null; // Track distance changes for responsiveness
        
        // Sphere animation properties
        this.sphereAnimating = false;
        this.sphereAnimationSpeed = 0.15; // Slightly faster than camera for crisp appearance
        this.targetSphereOpacity = 0; // Target opacity for sphere fade in/out
        this.sphereVisible = false; // Track intended visibility state
        
        // ResizeObserver for responsive canvas sizing
        this.resizeObserver = null;
        this.resizeTimeoutId = null;
        
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
        
        
        // Set canvas display size via CSS
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        
        // Set initial canvas internal dimensions to match display size
        this.updateCanvasSize();

        // Create the Three.js scene
        this.scene = new THREE.Scene();
        
        // Add lighting for proper shading on materials
        // Ambient light provides overall illumination
        const ambientLight = new THREE.AmbientLight(0xffffff, 2); // Increased ambient light for softer shadows
        this.scene.add(ambientLight);
        
        // Directional light provides directional shading
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // Reduced directional light for lighter shadows
        directionalLight.position.set(1, 1, 1); // Light from top-right-front
        this.scene.add(directionalLight);
        
        // Set up camera with human-eye parameters
        // Human eye comfortable FOV is around 50-60 degrees
        // Note: aspect ratio will be set properly in updateCanvasSize()
        this.camera = new THREE.PerspectiveCamera(
            55, // FOV - comfortable human viewing angle
            1, // Temporary aspect ratio, will be updated in updateCanvasSize()
            0.1, 
            1000
        );
        
        // Position camera at a typical viewing distance for a 24" monitor
        // Default distance from config is 800mm = 0.8 meters
        this.updateCameraPosition();
        
        // Initialize target positions to current position to avoid initial animation
        this.targetCameraPosition.copy(this.camera.position);
        this.targetCameraLookAt.set(0, 0, -1); // Default look direction
        
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
        
        // Set up OrbitControls AFTER renderer is created
        this.setupOrbitControls();
        
        // Update canvas size and renderer properly
        this.updateCanvasSize();
        
        // Set transparent background (no background color)
        this.renderer.setClearColor(0x000000, 0); // Black with 0 alpha = transparent
        
        // Clear the canvas background CSS since WebGL will handle it
        this.canvas.style.backgroundColor = 'transparent';
        
        // Create screens display for all provided screens
        this.createScreens();
        
        // Create user sphere (20cm diameter at origin)
        this.createUserSphere();
        
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
            distance: CONFIG.DEFAULTS.PRESET_DISTANCE, // Use default preset distance instead of view distance
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
        
        // Position each screen at its respective distance from the camera (which is at origin)
        // Convert distance from mm to meters and use negative Z (screens are in front of camera)
        // Each screen gets positioned at its own user-specified distance
        const distanceMeters = -(screenData.distance || CONFIG.DEFAULTS.PRESET_DISTANCE) / 1000;
        const zOffset = index * 0.001; // Small offset to prevent z-fighting when distances are same
        
        border.position.set(0, 0, distanceMeters + zOffset);
        centerPanel.position.set(0, 0, distanceMeters + zOffset);
        
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
        const borderThickness = 0.005; // 5mm thick border
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
    
    createUserSphere() {
        // Remove existing sphere if it exists
        if (this.userSphere) {
            this.scene.remove(this.userSphere);
            this.userSphere.geometry.dispose();
            this.userSphere.material.dispose();
        }
        
        // Create sphere with 20cm diameter (0.2m) at user position (origin)
        const sphereGeometry = new THREE.SphereGeometry(0.1, 32, 16); // radius = 0.1m (diameter = 0.2m = 20cm)
        
        // Create solid blue material with shading
        const sphereMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x87CEEB, // Sky blue color (lighter blue)
            transparent: true,
            opacity: 0 // Start invisible for animation
        });
        
        this.userSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        
        // Position sphere at origin (where user/camera is)
        this.userSphere.position.set(0, 0, 0);
        
        // Add to scene
        this.scene.add(this.userSphere);
        
        // Update visibility based on current view angle
        this.updateSphereVisibility();
    }
    
    setupOrbitControls() {
        if (!this.camera || !this.renderer) {
            console.error('setupOrbitControls: camera or renderer not available');
            return;
        }
        
        const canvas = this.renderer.domElement;
        
        // Manual orbit controls implementation
        const onMouseDown = (event) => {
            if (!this.orbitState.enabled) return;
            
            event.preventDefault();
            this.orbitState.dragging = true;
            this.orbitState.mouseX = event.clientX;
            this.orbitState.mouseY = event.clientY;
            
            // Stop camera animation when user starts manual orbiting
            this.isAnimating = false;
            
            // Update orbit state to use current camera position as starting point
            // This prevents strange zoom effects when interrupting animation
            if (this.viewAngle === '3d') {
                // Use current camera position and current target to recalculate spherical coordinates
                const offset = new THREE.Vector3();
                offset.copy(this.camera.position).sub(this.orbitState.target);
                
                const radius = offset.length();
                if (radius > 0) { // Avoid division by zero
                    const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));
                    const theta = Math.atan2(offset.x, offset.z);
                    this.orbitState.spherical.set(radius, phi, theta);
                }
            }
            
            canvas.style.cursor = 'grabbing';
        };
        
        const onMouseMove = (event) => {
            if (!this.orbitState.enabled || !this.orbitState.dragging) return;
            
            event.preventDefault();
            const deltaX = event.clientX - this.orbitState.mouseX;
            const deltaY = event.clientY - this.orbitState.mouseY;
            
            // Convert mouse movement to spherical coordinates
            const rotateSpeed = 0.01;
            this.orbitState.spherical.theta -= deltaX * rotateSpeed; // Horizontal movement (left/right)
            this.orbitState.spherical.phi -= deltaY * rotateSpeed;   // Vertical movement (up/down) - inverted to match mouse direction
            
            // Constrain phi to prevent flipping (keep between 0.1 and PI-0.1)
            this.orbitState.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.orbitState.spherical.phi));
            
            this.updateCameraFromSpherical();
            
            this.orbitState.mouseX = event.clientX;
            this.orbitState.mouseY = event.clientY;
        };
        
        const onMouseUp = (event) => {
            if (this.orbitState.dragging) {
                event.preventDefault();
            }
            this.orbitState.dragging = false;
            canvas.style.cursor = this.orbitState.enabled ? 'grab' : 'default';
        };
        
        // Add event listeners
        canvas.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        
        // Store references for cleanup
        this.orbitState.cleanup = () => {
            canvas.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        // Set initial cursor
        canvas.style.cursor = 'default';
    }
    
    updateCameraFromSpherical() {
        if (!this.camera) return;
        
        // Convert spherical coordinates to cartesian and position camera
        const position = new THREE.Vector3();
        position.setFromSpherical(this.orbitState.spherical);
        position.add(this.orbitState.target);
        
        this.camera.position.copy(position);
        this.camera.lookAt(this.orbitState.target);
    }
    
    calculateFurthestScreenDistance() {
        if (!this.screens || this.screens.length === 0) {
            return CONFIG.DEFAULTS.PRESET_DISTANCE;
        }
        
        // Find the maximum distance among all screens
        let maxDistance = 0;
        this.screens.forEach(screen => {
            const distance = screen.distance || CONFIG.DEFAULTS.PRESET_DISTANCE;
            maxDistance = Math.max(maxDistance, distance);
        });
        
        return maxDistance;
    }
    
    calculateNearestScreenDistance() {
        if (!this.screens || this.screens.length === 0) {
            return CONFIG.DEFAULTS.PRESET_DISTANCE;
        }
        
        // Find the minimum distance among all screens
        let minDistance = Infinity;
        this.screens.forEach(screen => {
            const distance = screen.distance || CONFIG.DEFAULTS.PRESET_DISTANCE;
            minDistance = Math.min(minDistance, distance);
        });
        
        return minDistance === Infinity ? CONFIG.DEFAULTS.PRESET_DISTANCE : minDistance;
    }
    
    // Calculate hash of screen distances for change detection
    calculateDistanceHash() {
        if (!this.screens || this.screens.length === 0) {
            return 'no-screens';
        }
        
        const distances = this.screens.map(screen => 
            screen.distance || CONFIG.DEFAULTS.PRESET_DISTANCE
        ).sort((a, b) => a - b); // Sort for consistent hash
        
        return distances.join('-');
    }
    
    // Check if screen distances have changed (for responsive camera updates)
    hasDistanceChanged() {
        const currentDistanceHash = this.calculateDistanceHash();
        if (this.lastDistanceHash !== currentDistanceHash) {
            this.lastDistanceHash = currentDistanceHash;
            return true;
        }
        return false;
    }
    
    // Handle responsive camera updates with delay (only in 3D view)
    updateCameraPositionResponsive() {
        // Only respond to distance changes in 3D view
        if (this.viewAngle !== '3d' || !this.isInitialized) return;
        
        // Clear any existing timeout
        if (this.responseTimeoutId) {
            clearTimeout(this.responseTimeoutId);
        }
        
        // Set up delayed response to distance changes
        this.responseTimeoutId = setTimeout(() => {
            this.updateCameraPosition();
        }, this.responseDelayMs);
    }
    
    // Smooth animation step for camera movement
    animateCamera() {
        if (!this.isAnimating || !this.camera) return;
        
        // Interpolate camera position
        this.camera.position.lerp(this.targetCameraPosition, this.animationSpeed);
        
        // For lookAt, we need to interpolate the direction and then apply it
        const currentLookDirection = new THREE.Vector3();
        this.camera.getWorldDirection(currentLookDirection);
        
        const targetLookDirection = new THREE.Vector3();
        targetLookDirection.copy(this.targetCameraLookAt).sub(this.camera.position).normalize();
        
        // Slerp (spherical linear interpolation) for smooth rotation
        currentLookDirection.lerp(targetLookDirection, this.animationSpeed);
        
        // Apply the interpolated look direction
        const lookAtPoint = new THREE.Vector3();
        lookAtPoint.copy(this.camera.position).add(currentLookDirection);
        this.camera.lookAt(lookAtPoint);
        
        // Check if we're close enough to the target to stop animating
        const positionDistance = this.camera.position.distanceTo(this.targetCameraPosition);
        const directionDistance = currentLookDirection.distanceTo(targetLookDirection);
        
        if (positionDistance < 0.001 && directionDistance < 0.001) {
            // Animation complete - snap to final position
            this.camera.position.copy(this.targetCameraPosition);
            this.camera.lookAt(this.targetCameraLookAt);
            this.isAnimating = false;
            
            // Update orbit state spherical coordinates to match final camera position in 3D view
            if (this.viewAngle === '3d') {
                const offset = new THREE.Vector3();
                offset.copy(this.camera.position).sub(this.orbitState.target);
                
                const radius = offset.length();
                const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));
                const theta = Math.atan2(offset.x, offset.z);
                
                this.orbitState.spherical.set(radius, phi, theta);
            }
        }
    }
    
    // Smooth animation step for sphere fade in/out
    animateSphere() {
        if (!this.sphereAnimating || !this.userSphere) return;
        
        // Get current opacity
        const currentOpacity = this.userSphere.material.opacity;
        
        // Interpolate towards target opacity
        const newOpacity = THREE.MathUtils.lerp(currentOpacity, this.targetSphereOpacity, this.sphereAnimationSpeed);
        this.userSphere.material.opacity = newOpacity;
        
        // Check if we're close enough to the target to stop animating
        const opacityDifference = Math.abs(newOpacity - this.targetSphereOpacity);
        
        if (opacityDifference < 0.01) {
            // Animation complete - snap to final opacity
            this.userSphere.material.opacity = this.targetSphereOpacity;
            this.sphereAnimating = false;
            
            // If target opacity is 0, we can disable visibility completely for performance
            this.userSphere.visible = (this.targetSphereOpacity > 0);
        } else {
            // Ensure sphere is visible during animation (for fade in effect)
            this.userSphere.visible = true;
        }
    }
    
    updateSphereVisibility() {
        if (!this.userSphere) return;
        
        // Determine if sphere should be visible based on view angle
        const shouldBeVisible = (this.viewAngle !== 'front');
        
        // Only start animation if visibility state actually changed
        if (this.sphereVisible !== shouldBeVisible) {
            this.sphereVisible = shouldBeVisible;
            this.targetSphereOpacity = shouldBeVisible ? 1.0 : 0;
            this.sphereAnimating = true;
        }
        
        // Update manual orbit controls enabled state
        this.orbitState.enabled = (this.viewAngle !== 'front');
        
        // Update cursor based on controls state
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.style.cursor = this.orbitState.enabled ? 'grab' : 'default';
        }
    }
    
    updateCameraPosition() {
        if (!this.camera) return;
        
        if (this.viewAngle === 'front') {
            // Front view - camera at origin (same position as user sphere)
            this.targetCameraPosition.set(0, 0, 0);
            this.targetCameraLookAt.set(0, 0, -1); // Look towards negative Z direction
        } else {
            // 3D isometric view - camera at an angle to see both sphere and screens
            // Calculate camera position based on furthest screen distance
            const furthestDistance = this.calculateFurthestScreenDistance();
            const furthestDistanceMeters = furthestDistance / 1000; // Convert mm to meters
            
            // Position camera at a distance that provides good viewing angle for all screens
            // Use the furthest screen distance as reference for camera positioning
            const cameraDistance = Math.max(0.5, furthestDistanceMeters * 0.8); // At least 0.5m, or 80% of furthest screen
            const cameraHeight = cameraDistance * 0.6; // Height proportional to distance
            const cameraSide = cameraDistance * 0.8;    // Side position proportional to distance
            
            this.targetCameraPosition.set(cameraSide, cameraHeight, cameraDistance);
            
            // Set rotation center to the nearest screen position
            const nearestDistance = this.calculateNearestScreenDistance();
            const nearestDistanceMeters = -nearestDistance / 1000; // Convert mm to meters, negative Z
            const rotationCenter = new THREE.Vector3(0, 0, nearestDistanceMeters);
            
            // Look towards the nearest screen (rotation center)
            this.targetCameraLookAt.copy(rotationCenter);
            
            // Update manual orbit controls target to nearest screen
            this.orbitState.target.copy(rotationCenter);
            
            // Calculate spherical coordinates from target camera position
            const offset = new THREE.Vector3();
            offset.copy(this.targetCameraPosition).sub(this.orbitState.target);
            
            // Set spherical coordinates properly
            const radius = offset.length();
            const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));
            const theta = Math.atan2(offset.x, offset.z);
            
            this.orbitState.spherical.set(radius, phi, theta);
        }
        
        // Start smooth animation to target position
        this.isAnimating = true;
        
        // Update sphere visibility and controls enabled state
        this.updateSphereVisibility();
    }
    
    animate() {
        if (!this.isInitialized) {
            return;
        }
        
        // Handle smooth camera position transitions
        this.animateCamera();
        
        // Handle smooth sphere fade in/out animations
        this.animateSphere();
        
        // No controls update needed - manual orbit controls handle events directly
        
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
        
        // Use ResizeObserver to watch for canvas container size changes
        if (this.canvasContainer && window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver((entries) => {
                // Use requestAnimationFrame to debounce resize events
                if (this.resizeTimeoutId) {
                    cancelAnimationFrame(this.resizeTimeoutId);
                }
                this.resizeTimeoutId = requestAnimationFrame(() => {
                    this.handleResize();
                });
            });
            this.resizeObserver.observe(this.canvasContainer);
        }
        
        // Listen for theme changes
        this.setupThemeListener();
    }

    updateCanvasSize() {
        if (!this.canvas) return;
        
        // Get the display size of the canvas from CSS
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        
        // Check if the canvas is not displayed (width/height would be 0)
        if (displayWidth === 0 || displayHeight === 0) {
            // Fallback to reasonable defaults
            this.canvas.width = 800;
            this.canvas.height = 400;
        } else {
            // Set canvas internal dimensions to match display size, accounting for device pixel ratio
            const pixelRatio = window.devicePixelRatio || 1;
            this.canvas.width = Math.floor(displayWidth * pixelRatio);
            this.canvas.height = Math.floor(displayHeight * pixelRatio);
        }
        
        // Update renderer and camera if they exist
        if (this.renderer && this.camera) {
            // Update renderer size (use false to prevent CSS size changes)
            this.renderer.setSize(this.canvas.width, this.canvas.height, false);
            this.renderer.setPixelRatio(window.devicePixelRatio || 1);
            
            // Update camera aspect ratio using actual canvas dimensions
            this.camera.aspect = this.canvas.width / this.canvas.height;
            this.camera.updateProjectionMatrix();
        }
        
        // Update cached canvas size for change detection
        this.lastCanvasSize = { width: this.canvas.width, height: this.canvas.height };
    }

    handleResize() {
        if (!this.isInitialized || !this.canvas) return;
        
        // Update canvas size and camera/renderer
        this.updateCanvasSize();
        
        // Reset screen cache to trigger re-render if needed
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
        const currentCanvasSize = { width: this.canvas.width, height: this.canvas.height };
        const sizeChanged = this.lastCanvasSize.width !== currentCanvasSize.width || 
                          this.lastCanvasSize.height !== currentCanvasSize.height;
        const themeChanged = this.hasThemeChanged();
        
        if (this.lastScreensHash !== currentHash || sizeChanged || themeChanged) {
            this.lastScreensHash = currentHash;
            this.lastCanvasSize = { width: currentCanvasSize.width, height: currentCanvasSize.height };
            return true;
        }
        
        return false;
    }

    updateScreens(screens) {
        this.screens = screens || [];
        
        // Check if distances have changed for responsive camera updates
        const distanceChanged = this.hasDistanceChanged();
        
        // Only render if screen data has actually changed and visualizer is initialized
        if (this.isInitialized && this.hasScreenDataChanged(this.screens)) {
            this.createScreens(); // Recreate all screens with new data
        }
        
        // If only distances changed (and we're in 3D view), update camera position responsively
        if (this.isInitialized && distanceChanged) {
            this.updateCameraPositionResponsive();
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
                
                // When switching to 3D view, ensure orbit state is properly initialized
                // to prevent snapping back to old position
                if (angle === '3d') {
                    // Use current camera position to initialize orbit state if animation is in progress
                    const offset = new THREE.Vector3();
                    offset.copy(this.camera.position).sub(this.orbitState.target);
                    
                    const radius = offset.length();
                    if (radius > 0) { // Avoid division by zero
                        const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));
                        const theta = Math.atan2(offset.x, offset.z);
                        this.orbitState.spherical.set(radius, phi, theta);
                    }
                }
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
        
        // Note: User sphere maintains consistent blue color regardless of theme
    }

    // Method for cleanup when destroying the visualizer
    dispose() {
        if (!this.isInitialized) return;
        
        // Clear any pending response timeout
        if (this.responseTimeoutId) {
            clearTimeout(this.responseTimeoutId);
            this.responseTimeoutId = null;
        }
        
        // Clear any pending resize timeout
        if (this.resizeTimeoutId) {
            cancelAnimationFrame(this.resizeTimeoutId);
            this.resizeTimeoutId = null;
        }
        
        // Clean up ResizeObserver
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        
        // Clean up manual orbit controls
        if (this.orbitState.cleanup) {
            this.orbitState.cleanup();
        }
        
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        // Clean up all screens
        this.clearScreens();
        
        // Clean up user sphere
        if (this.userSphere) {
            this.scene.remove(this.userSphere);
            this.userSphere.geometry.dispose();
            this.userSphere.material.dispose();
            this.userSphere = null;
        }
        
        this.isInitialized = false;
    }
}

// Export for ES6 modules
export { ScreenVisualizer3D };
