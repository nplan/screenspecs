// Import Three.js ES modules
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

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
        
        // Zoom state for wheel and pinch zoom
        this.zoomState = {
            minZoom: 0.2,  // Minimum zoom factor (10% of original distance)
            maxZoom: 5.0,  // Maximum zoom factor (500% of original distance)
            zoomFactor: 1.0, // Current zoom multiplier
            baseDistance: 1.0, // Base distance for zoom calculations
            pinching: false,
            lastPinchDistance: 0
        };

        // Front view look-around state (camera rotation from fixed position)
        this.lookAroundState = {
            dragging: false,
            mouseX: 0,
            mouseY: 0,
            currentYaw: 0,   // Current horizontal rotation (radians)
            currentPitch: 0, // Current vertical rotation (radians)
            maxYaw: 0,       // Max horizontal rotation (calculated from screen FOV)
            maxPitch: 0,     // Max vertical rotation (calculated from screen FOV)
            springBack: false // Whether to animate back to center
        };
        this.screenMeshes = []; // Array to hold multiple screen meshes
        this.userSphere = null; // Sphere representing user position (20cm diameter)
        this.viewAxisLine = null; // Line showing view axis to furthest screen
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
            0.1, // Near clipping plane at 100mm
            1000 // Far clipping plane at 1000 meters
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
        
        // Create view axis line to furthest screen
        this.createViewAxisLine();
        
        // Do an immediate render to test
        this.renderer.render(this.scene, this.camera);
        
        // Start animation loop
        this.isInitialized = true;
        this.animate();
        
        // Initialize toggle UI to match current view angle
        this.updateAngleToggleUI(this.viewAngle);
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
    
    createViewAxisLine() {
        // Remove existing view axis line if it exists
        if (this.viewAxisLine) {
            this.scene.remove(this.viewAxisLine);
            this.viewAxisLine.geometry.dispose();
            this.viewAxisLine.material.dispose();
            this.viewAxisLine = null;
        }
        
        // Calculate furthest screen distance
        const furthestDistance = this.calculateFurthestScreenDistance();
        const furthestDistanceMeters = -furthestDistance / 1000; // Convert mm to meters, negative Z
        
        // Create line from user (origin) to furthest screen center using Line2 for thick lines
        const lineGeometry = new LineGeometry();
        lineGeometry.setPositions([
            0, 0, 0,                           // User position
            0, 0, furthestDistanceMeters       // Furthest screen center
        ]);
        
        // Theme-aware color: white on dark theme, black on light theme
        const lineColor = this.getEffectiveTheme() === 'dark' ? 0xffffff : 0x000000;
        
        const lineMaterial = new LineMaterial({
            color: lineColor,
            linewidth: 5,        // Width in pixels
            transparent: true,
            opacity: 0.7,
            dashed: true,
            dashSize: 0.05,       // 100mm dashes
            gapSize: 0.025,       // 50mm gaps
            depthTest: false,    // Render on top of other objects for better visibility
            resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
        });
        
        this.viewAxisLine = new Line2(lineGeometry, lineMaterial);
        this.viewAxisLine.computeLineDistances(); // Required for dashed lines
        this.viewAxisLine.renderOrder = 999; // Render last to appear on top
        
        this.scene.add(this.viewAxisLine);
    }
    
    clearScreens() {
        // Remove all existing screen meshes from scene
        this.screenMeshes.forEach(meshGroup => {
            // Remove border group
            if (meshGroup.border) {
                this.scene.remove(meshGroup.border);
                // Dispose all children in the border group
                meshGroup.border.children.forEach(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            }
            
            // Remove center panel (can be single mesh or group)
            if (meshGroup.centerPanel) {
                this.scene.remove(meshGroup.centerPanel);
                if (meshGroup.centerPanel.children && meshGroup.centerPanel.children.length > 0) {
                    // It's a group (curved screen) - dispose all children
                    meshGroup.centerPanel.children.forEach(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) child.material.dispose();
                    });
                } else {
                    // It's a single mesh (flat screen) - dispose directly
                    if (meshGroup.centerPanel.geometry) meshGroup.centerPanel.geometry.dispose();
                    if (meshGroup.centerPanel.material) meshGroup.centerPanel.material.dispose();
                }
            }
            
            // Remove radius center marker (for curved screens)
            if (meshGroup.radiusCenterMarker) {
                this.scene.remove(meshGroup.radiusCenterMarker);
                if (meshGroup.radiusCenterMarker.geometry) meshGroup.radiusCenterMarker.geometry.dispose();
                if (meshGroup.radiusCenterMarker.material) meshGroup.radiusCenterMarker.material.dispose();
            }
            
            // Remove radius line (for curved screens)
            if (meshGroup.radiusLine) {
                this.scene.remove(meshGroup.radiusLine);
                if (meshGroup.radiusLine.geometry) meshGroup.radiusLine.geometry.dispose();
                if (meshGroup.radiusLine.material) meshGroup.radiusLine.material.dispose();
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
        
        // Get curvature value (null for flat screens, number for curved)
        const curvature = screenData.curvature || null;
        
        // Create the border frame with curvature support
        const border = this.createScreenBorder(widthMeters, heightMeters, screenColor, curvature);
        
        // Create translucent center panel with curvature support
        const centerPanel = this.createCenterPanel(widthMeters, heightMeters, screenColor, curvature);
        
        // Position each screen at its respective distance from the camera (which is at origin)
        // Convert distance from mm to meters and use negative Z (screens are in front of camera)
        // Each screen gets positioned at its own user-specified distance
        let distanceMeters = -(screenData.distance || CONFIG.DEFAULTS.PRESET_DISTANCE) / 1000;
        
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
    
    createScreenBorder(screenWidth, screenHeight, screenColor, curvature = null) {
        // Create thick border frame
        const borderThickness = screenHeight * 0.01; // 5% of width
        const borderDepth = borderThickness * 0.5; // Half thickness in depth
        
        const borderGroup = new THREE.Group();
        
        // Create border material - opaque, double-sided for curved borders
        const borderMaterial = new THREE.MeshBasicMaterial({ 
            color: screenColor.clone().multiplyScalar(0.9),
            transparent: false,
            side: THREE.DoubleSide
        });
        
        if (curvature === null) {
            // Flat screen borders - use box geometry for all borders
            
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
        } else {
            // Curved screen borders using CylinderGeometry for consistency with panel
            const radiusMeters = curvature / 1000; // Convert mm to meters
            const arcAngle = screenWidth / radiusMeters; // Arc angle in radians
            const segments = Math.max(32, Math.floor(arcAngle * 32)); // Smooth curve
            
            // Coordinate system:
            // Arc formula: x = R*sin(angle), z = R*(1-cos(angle)) for angle ∈ [-arcAngle/2, +arcAngle/2]
            // Center of arc at (0, y, R) with radius R
            //
            // CylinderGeometry at origin: surface at θ is (R*cos(θ), y, R*sin(θ))
            // Positioned at (0, 0, R): surface becomes (R*cos(θ), y, R + R*sin(θ))
            //
            // To match our formula at θ = -PI/2 + angle:
            //   x = R*cos(-PI/2 + angle) = R*sin(angle) ✓
            //   z = R + R*sin(-PI/2 + angle) = R - R*cos(angle) = R*(1 - cos(angle)) ✓
            //
            // Use same thetaStart as center panel for alignment
            const thetaStart = Math.PI - arcAngle / 2;
            
            // Inner and outer radii for box section borders
            const innerRadius = radiusMeters;
            const outerRadius = radiusMeters + borderDepth;
            
            // Helper function to create curved cap geometry (top/bottom enclosing surface)
            const createCurvedCap = (innerR, outerR, segs, tStart, tLength) => {
                const vertices = [];
                const indices = [];
                
                for (let i = 0; i <= segs; i++) {
                    const theta = tStart + (i / segs) * tLength;
                    
                    // Inner vertex (y = 0, will be positioned later)
                    vertices.push(innerR * Math.cos(theta), 0, innerR * Math.sin(theta));
                    // Outer vertex
                    vertices.push(outerR * Math.cos(theta), 0, outerR * Math.sin(theta));
                }
                
                // Create triangles connecting inner and outer vertices
                for (let i = 0; i < segs; i++) {
                    const baseIndex = i * 2;
                    // Two triangles per segment
                    indices.push(baseIndex, baseIndex + 1, baseIndex + 3);
                    indices.push(baseIndex, baseIndex + 3, baseIndex + 2);
                }
                
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                geometry.setIndex(indices);
                geometry.computeVertexNormals();
                
                return geometry;
            };
            
            // Top border - box section with inner/outer cylinder faces and top/bottom caps
            const topBorderGroup = new THREE.Group();
            
            // Inner curved surface
            const topInnerGeometry = new THREE.CylinderGeometry(
                innerRadius, innerRadius, borderThickness, segments, 1, true, thetaStart, arcAngle
            );
            const topInnerMesh = new THREE.Mesh(topInnerGeometry, borderMaterial);
            topBorderGroup.add(topInnerMesh);
            
            // Outer curved surface
            const topOuterGeometry = new THREE.CylinderGeometry(
                outerRadius, outerRadius, borderThickness, segments, 1, true, thetaStart, arcAngle
            );
            const topOuterMesh = new THREE.Mesh(topOuterGeometry, borderMaterial);
            topBorderGroup.add(topOuterMesh);
            
            // Top enclosing cap (at y = borderThickness/2)
            const topCapGeometry = createCurvedCap(innerRadius, outerRadius, segments, thetaStart, arcAngle);
            const topCapMesh = new THREE.Mesh(topCapGeometry, borderMaterial);
            topCapMesh.rotation.y = -Math.PI / 2;
            topCapMesh.position.y = borderThickness / 2;
            topBorderGroup.add(topCapMesh);
            
            // Bottom enclosing cap (at y = -borderThickness/2)
            const topBottomCapGeometry = createCurvedCap(innerRadius, outerRadius, segments, thetaStart, arcAngle);
            const topBottomCapMesh = new THREE.Mesh(topBottomCapGeometry, borderMaterial);
            topBottomCapMesh.rotation.y = -Math.PI / 2;
            topBottomCapMesh.position.y = -borderThickness / 2;
            topBorderGroup.add(topBottomCapMesh);
            
            topBorderGroup.position.set(0, (screenHeight + borderThickness) / 2, radiusMeters);
            borderGroup.add(topBorderGroup);
            
            // Bottom border - box section with inner/outer cylinder faces and top/bottom caps
            const bottomBorderGroup = new THREE.Group();
            
            // Inner curved surface
            const bottomInnerGeometry = new THREE.CylinderGeometry(
                innerRadius, innerRadius, borderThickness, segments, 1, true, thetaStart, arcAngle
            );
            const bottomInnerMesh = new THREE.Mesh(bottomInnerGeometry, borderMaterial);
            bottomBorderGroup.add(bottomInnerMesh);
            
            // Outer curved surface
            const bottomOuterGeometry = new THREE.CylinderGeometry(
                outerRadius, outerRadius, borderThickness, segments, 1, true, thetaStart, arcAngle
            );
            const bottomOuterMesh = new THREE.Mesh(bottomOuterGeometry, borderMaterial);
            bottomBorderGroup.add(bottomOuterMesh);
            
            // Top enclosing cap
            const bottomTopCapGeometry = createCurvedCap(innerRadius, outerRadius, segments, thetaStart, arcAngle);
            const bottomTopCapMesh = new THREE.Mesh(bottomTopCapGeometry, borderMaterial);
            bottomTopCapMesh.rotation.y = -Math.PI / 2;
            bottomTopCapMesh.position.y = borderThickness / 2;
            bottomBorderGroup.add(bottomTopCapMesh);
            
            // Bottom enclosing cap
            const bottomCapGeometry = createCurvedCap(innerRadius, outerRadius, segments, thetaStart, arcAngle);
            const bottomCapMesh = new THREE.Mesh(bottomCapGeometry, borderMaterial);
            bottomCapMesh.rotation.y = -Math.PI / 2;
            bottomCapMesh.position.y = -borderThickness / 2;
            bottomBorderGroup.add(bottomCapMesh);
            
            bottomBorderGroup.position.set(0, -(screenHeight + borderThickness) / 2, radiusMeters);
            borderGroup.add(bottomBorderGroup);
            
            // Left and right borders at arc endpoints
            // At θ = -PI/2 - arcAngle/2 (left): x = R*sin(-arcAngle/2) = -R*sin(arcAngle/2)
            //                                   z = R*(1 - cos(-arcAngle/2)) = R*(1 - cos(arcAngle/2))
            // At θ = -PI/2 + arcAngle/2 (right): x = R*sin(arcAngle/2)
            //                                    z = R*(1 - cos(arcAngle/2))
            
            const leftX = -radiusMeters * Math.sin(arcAngle / 2);
            const leftZ = radiusMeters * (1 - Math.cos(arcAngle / 2)) - borderDepth / 2;
            const rightX = radiusMeters * Math.sin(arcAngle / 2);
            const rightZ = leftZ;
            
            // Left border (straight vertical line)
            const leftGeometry = new THREE.BoxGeometry(borderThickness, screenHeight + borderThickness * 2, borderDepth);
            const leftBorder = new THREE.Mesh(leftGeometry, borderMaterial);
            leftBorder.position.set(leftX, 0, leftZ);
            leftBorder.rotation.y = arcAngle / 2; // Rotate to align with curve tangent
            borderGroup.add(leftBorder);
            
            // Right border (straight vertical line)
            const rightGeometry = new THREE.BoxGeometry(borderThickness, screenHeight + borderThickness * 2, borderDepth);
            const rightBorder = new THREE.Mesh(rightGeometry, borderMaterial);
            rightBorder.position.set(rightX, 0, rightZ);
            rightBorder.rotation.y = -arcAngle / 2; // Rotate to align with curve tangent
            borderGroup.add(rightBorder);
        }
        
        return borderGroup;
    }
    
    createCenterPanel(screenWidth, screenHeight, screenColor, curvature = null) {
        if (curvature === null) {
            // Flat screen - use plane geometry
            const panelGeometry = new THREE.PlaneGeometry(screenWidth, screenHeight);
            const panelMaterial = new THREE.MeshBasicMaterial({ 
                color: screenColor.clone().multiplyScalar(0.5),
                transparent: true,
                opacity: 0.1,
                side: THREE.DoubleSide
            });
            
            const centerPanel = new THREE.Mesh(panelGeometry, panelMaterial);
            return centerPanel;
        } else {
            // Curved screen - use CylinderGeometry for seamless curved surface
            // Must use same coordinate system as border
            const radiusMeters = curvature / 1000; // Convert mm to meters
            const arcAngle = screenWidth / radiusMeters; // Arc angle in radians
            const segments = Math.max(32, Math.floor(arcAngle * 32)); // Smooth curve
            
            const panelMaterial = new THREE.MeshBasicMaterial({ 
                color: screenColor.clone().multiplyScalar(0.5),
                transparent: true,
                opacity: 0.1,
                side: THREE.DoubleSide
            });
            
            // Coordinate system (same as border):
            // Arc formula: x = R*sin(angle), z = R*(1-cos(angle)) for angle ∈ [-arcAngle/2, +arcAngle/2]
            // Center of arc at (0, y, 0), edges curve toward positive Z
            // This is a circle centered at (0, y, R) with radius R
            //
            // CylinderGeometry at origin: surface at θ is (R*cos(θ), y, R*sin(θ))
            // Positioned at (0, 0, R): surface becomes (R*cos(θ), y, R + R*sin(θ))
            //
            // To match our formula at θ = -PI/2 + angle:
            //   x = R*cos(-PI/2 + angle) = R*sin(angle) ✓
            //   z = R + R*sin(-PI/2 + angle) = R - R*cos(angle) = R*(1 - cos(angle)) ✓
            //
            // So: thetaStart = -PI/2 - arcAngle/2, thetaLength = arcAngle
            const thetaStart = Math.PI - arcAngle / 2;
            const curvedGeometry = new THREE.CylinderGeometry(
                radiusMeters,      // radiusTop
                radiusMeters,      // radiusBottom
                screenHeight,      // height
                segments,          // radialSegments
                1,                 // heightSegments
                true,              // openEnded (no caps)
                thetaStart,        // thetaStart
                arcAngle           // thetaLength
            );
            
            const curvedPanel = new THREE.Mesh(curvedGeometry, panelMaterial);
            const panelGroup = new THREE.Group();
            panelGroup.add(curvedPanel);
            curvedPanel.position.set(0, 0, radiusMeters);
            
            return panelGroup;
        }
    }
    
    /**
     * Create visualization elements for the center of radius of a curved screen
     * @param {number} curvature - Curvature radius in mm
     * @param {number} screenZ - Z position of the screen in meters
     * @param {THREE.Color} screenColor - Color of the screen
     * @returns {Object} Object containing marker sphere and line
     */
    createRadiusCenterVisualization(curvature, screenZ, screenColor) {
        const radiusMeters = curvature / 1000; // Convert mm to meters
        
        // The center of radius is at (0, 0, screenZ + radiusMeters)
        // Since the curved screen surface is at screenZ and curves toward positive Z,
        // the center of the circle is radiusMeters behind the screen center point
        const centerZ = screenZ + radiusMeters;
        
        // Create a larger, highly visible sphere to mark the center of radius
        const markerRadius = 0.04; // 40mm radius sphere (80mm diameter) - much larger
        const markerGeometry = new THREE.SphereGeometry(markerRadius, 32, 24);
        const markerMaterial = new THREE.MeshLambertMaterial({
            color: screenColor.clone().multiplyScalar(1.2), // Brighter than screen color
            transparent: false,
            emissive: screenColor.clone().multiplyScalar(0.3), // Add glow effect
            emissiveIntensity: 0.5
        });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(0, 0, centerZ);
        
        // Create a solid, visible line from screen center to radius center
        const linePoints = [
            new THREE.Vector3(0, 0, screenZ),      // Screen center
            new THREE.Vector3(0, 0, centerZ)       // Radius center
        ];
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
        const lineMaterial = new THREE.LineDashedMaterial({
            color: screenColor.clone().multiplyScalar(0.8),
            transparent: true,
            opacity: 0.8,
            dashSize: 0.03,  // 30mm dashes
            gapSize: 0.015,  // 15mm gaps
            linewidth: 2     // Thicker line (note: may not work on all platforms)
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.computeLineDistances(); // Required for dashed lines
        
        return { marker, line };
    }
    
    createUserSphere() {
        // Remove existing sphere if it exists
        if (this.userSphere) {
            this.scene.remove(this.userSphere);
            this.userSphere.geometry.dispose();
            this.userSphere.material.dispose();
        }
        
        // Create sphere with 18cm diameter (0.18m) at user position (origin)
        const sphereGeometry = new THREE.SphereGeometry(0.09, 32, 16);
        
        // Create opaque blue material with shading
        const sphereMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xe3e3e3,
            transparent: false,
            opacity: 1 // Fully opaque
        });
        
        this.userSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        
        // Position sphere at origin (where user/camera is)
        this.userSphere.position.set(0, 0, 0.09);
        
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
            // Handle front view look-around
            if (this.viewAngle === 'front') {
                event.preventDefault();
                this.lookAroundState.dragging = true;
                this.lookAroundState.mouseX = event.clientX;
                this.lookAroundState.mouseY = event.clientY;
                this.lookAroundState.springBack = false;

                // Update FOV limits based on current screens
                const fovLimits = this.calculateLookAroundFOVLimits();
                this.lookAroundState.maxYaw = fovLimits.maxYaw;
                this.lookAroundState.maxPitch = fovLimits.maxPitch;

                canvas.style.cursor = 'grabbing';
                return;
            }

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
            // Handle front view look-around
            if (this.viewAngle === 'front' && this.lookAroundState.dragging) {
                event.preventDefault();
                const deltaX = event.clientX - this.lookAroundState.mouseX;
                const deltaY = event.clientY - this.lookAroundState.mouseY;

                // Convert mouse movement to rotation (inverted - drag scene, not camera)
                const rotateSpeed = 0.003;
                this.lookAroundState.currentYaw -= deltaX * rotateSpeed;
                this.lookAroundState.currentPitch -= deltaY * rotateSpeed;

                // Clamp to FOV limits
                this.lookAroundState.currentYaw = Math.max(-this.lookAroundState.maxYaw,
                    Math.min(this.lookAroundState.maxYaw, this.lookAroundState.currentYaw));
                this.lookAroundState.currentPitch = Math.max(-this.lookAroundState.maxPitch,
                    Math.min(this.lookAroundState.maxPitch, this.lookAroundState.currentPitch));

                // Update camera look direction
                this.updateCameraLookAround();

                this.lookAroundState.mouseX = event.clientX;
                this.lookAroundState.mouseY = event.clientY;
                return;
            }

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
            // Handle front view look-around release (trigger spring-back)
            if (this.viewAngle === 'front' && this.lookAroundState.dragging) {
                event.preventDefault();
                this.lookAroundState.dragging = false;
                this.lookAroundState.springBack = true; // Trigger spring-back animation
                canvas.style.cursor = 'grab';
                return;
            }

            if (this.orbitState.dragging) {
                event.preventDefault();
            }
            this.orbitState.dragging = false;
            canvas.style.cursor = this.orbitState.enabled ? 'grab' : 'default';
        };
        
        // Touch support for orbit controls
        const onTouchStart = (event) => {
            // Handle front view look-around
            if (this.viewAngle === 'front' && event.touches.length === 1) {
                event.preventDefault();
                this.lookAroundState.dragging = true;
                const touch = event.touches[0];
                this.lookAroundState.mouseX = touch.clientX;
                this.lookAroundState.mouseY = touch.clientY;
                this.lookAroundState.springBack = false;

                // Update FOV limits based on current screens
                const fovLimits = this.calculateLookAroundFOVLimits();
                this.lookAroundState.maxYaw = fovLimits.maxYaw;
                this.lookAroundState.maxPitch = fovLimits.maxPitch;
                return;
            }

            if (!this.orbitState.enabled || event.touches.length !== 1) return;

            event.preventDefault();
            this.orbitState.dragging = true;
            const touch = event.touches[0];
            this.orbitState.mouseX = touch.clientX;
            this.orbitState.mouseY = touch.clientY;

            // Stop camera animation when user starts manual orbiting
            this.isAnimating = false;

            // Update orbit state to use current camera position as starting point
            if (this.viewAngle === '3d') {
                const offset = new THREE.Vector3();
                offset.copy(this.camera.position).sub(this.orbitState.target);

                const radius = offset.length();
                if (radius > 0) {
                    const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));
                    const theta = Math.atan2(offset.x, offset.z);
                    this.orbitState.spherical.set(radius, phi, theta);
                }
            }
        };

        const onTouchMove = (event) => {
            // Handle front view look-around
            if (this.viewAngle === 'front' && this.lookAroundState.dragging && event.touches.length === 1) {
                event.preventDefault();
                const touch = event.touches[0];
                const deltaX = touch.clientX - this.lookAroundState.mouseX;
                const deltaY = touch.clientY - this.lookAroundState.mouseY;

                // Convert touch movement to rotation (inverted - drag scene, not camera)
                const rotateSpeed = 0.003;
                this.lookAroundState.currentYaw -= deltaX * rotateSpeed;
                this.lookAroundState.currentPitch -= deltaY * rotateSpeed;

                // Clamp to FOV limits
                this.lookAroundState.currentYaw = Math.max(-this.lookAroundState.maxYaw,
                    Math.min(this.lookAroundState.maxYaw, this.lookAroundState.currentYaw));
                this.lookAroundState.currentPitch = Math.max(-this.lookAroundState.maxPitch,
                    Math.min(this.lookAroundState.maxPitch, this.lookAroundState.currentPitch));

                // Update camera look direction
                this.updateCameraLookAround();

                this.lookAroundState.mouseX = touch.clientX;
                this.lookAroundState.mouseY = touch.clientY;
                return;
            }

            if (!this.orbitState.enabled || !this.orbitState.dragging || event.touches.length !== 1) return;

            event.preventDefault();
            const touch = event.touches[0];
            const deltaX = touch.clientX - this.orbitState.mouseX;
            const deltaY = touch.clientY - this.orbitState.mouseY;

            // Convert touch movement to spherical coordinates (same speed as mouse)
            const rotateSpeed = 0.01;
            this.orbitState.spherical.theta -= deltaX * rotateSpeed;
            this.orbitState.spherical.phi -= deltaY * rotateSpeed;

            // Constrain phi to prevent flipping
            this.orbitState.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.orbitState.spherical.phi));

            this.updateCameraFromSpherical();

            this.orbitState.mouseX = touch.clientX;
            this.orbitState.mouseY = touch.clientY;
        };

        const onTouchEnd = (event) => {
            // Handle front view look-around release (trigger spring-back)
            if (this.viewAngle === 'front' && this.lookAroundState.dragging) {
                event.preventDefault();
                this.lookAroundState.dragging = false;
                this.lookAroundState.springBack = true; // Trigger spring-back animation
                return;
            }

            if (this.orbitState.dragging) {
                event.preventDefault();
            }
            this.orbitState.dragging = false;
            this.zoomState.pinching = false;
        };
        
        // Scroll wheel zoom
        const onWheel = (event) => {
            // Only allow zoom in 3D mode
            if (this.viewAngle !== '3d' || !this.orbitState.enabled) {
                return;
            }
            
            event.preventDefault();
            
            const zoomSpeed = 0.1;
            const delta = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
            this.applyZoom(delta);
        };
        
        // Enhanced touch handling for pinch-to-zoom
        const onTouchStartEnhanced = (event) => {
            if (event.touches.length === 1) {
                // Single touch - orbit controls
                onTouchStart(event);
            } else if (event.touches.length === 2) {
                // Two touches - pinch zoom (only in 3D mode)
                if (this.viewAngle !== '3d' || !this.orbitState.enabled) {
                    return;
                }
                
                event.preventDefault();
                this.orbitState.dragging = false; // Stop any orbit dragging
                this.zoomState.pinching = true;
                
                const touch1 = event.touches[0];
                const touch2 = event.touches[1];
                const dx = touch2.clientX - touch1.clientX;
                const dy = touch2.clientY - touch1.clientY;
                this.zoomState.lastPinchDistance = Math.sqrt(dx * dx + dy * dy);
            }
        };
        
        const onTouchMoveEnhanced = (event) => {
            if (event.touches.length === 1 && !this.zoomState.pinching) {
                // Single touch - orbit controls
                onTouchMove(event);
            } else if (event.touches.length === 2 && this.zoomState.pinching) {
                // Two touches - pinch zoom (only in 3D mode)
                if (this.viewAngle !== '3d' || !this.orbitState.enabled) {
                    this.zoomState.pinching = false;
                    return;
                }
                
                event.preventDefault();
                
                const touch1 = event.touches[0];
                const touch2 = event.touches[1];
                const dx = touch2.clientX - touch1.clientX;
                const dy = touch2.clientY - touch1.clientY;
                const currentPinchDistance = Math.sqrt(dx * dx + dy * dy);
                
                if (this.zoomState.lastPinchDistance > 0) {
                    const pinchDelta = currentPinchDistance / this.zoomState.lastPinchDistance;
                    this.applyZoom(pinchDelta, 0.5); // Slower pinch zoom speed
                }
                
                this.zoomState.lastPinchDistance = currentPinchDistance;
            }
        };
        
        // Add event listeners
        canvas.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        
        // Add wheel zoom
        canvas.addEventListener('wheel', onWheel, { passive: false });
        
        canvas.addEventListener('touchstart', onTouchStartEnhanced, { passive: false });
        document.addEventListener('touchmove', onTouchMoveEnhanced, { passive: false });
        document.addEventListener('touchend', onTouchEnd, { passive: false });
        
        // Store references for cleanup
        this.orbitState.cleanup = () => {
            canvas.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('touchstart', onTouchStartEnhanced);
            document.removeEventListener('touchmove', onTouchMoveEnhanced);
            document.removeEventListener('touchend', onTouchEnd);
        };
        
        // Set initial cursor (grab for front and 3D views)
        const allowsInteraction = (this.viewAngle === 'front' || this.viewAngle === '3d');
        canvas.style.cursor = allowsInteraction ? 'grab' : 'default';
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

    // Update camera look direction for front view look-around
    updateCameraLookAround() {
        if (!this.camera || this.viewAngle !== 'front') return;

        // Camera stays at origin, only direction changes
        // Base direction is (0, 0, -1) - looking towards negative Z
        // Apply yaw (horizontal rotation around Y axis) and pitch (vertical rotation around X axis)

        const direction = new THREE.Vector3(0, 0, -1);

        // Create rotation quaternion from yaw and pitch
        const quaternion = new THREE.Quaternion();
        const euler = new THREE.Euler(
            -this.lookAroundState.currentPitch, // Pitch (rotation around X)
            -this.lookAroundState.currentYaw,   // Yaw (rotation around Y)
            0,
            'YXZ' // Apply yaw first, then pitch
        );
        quaternion.setFromEuler(euler);

        // Apply rotation to direction
        direction.applyQuaternion(quaternion);

        // Set camera to look in this direction from origin
        const lookAtPoint = new THREE.Vector3().copy(direction);
        this.camera.lookAt(lookAtPoint);
    }

    /**
     * Apply zoom by adjusting camera distance or spherical radius
     * @param {number} delta - Zoom delta (1.0 = no change, > 1.0 = zoom out, < 1.0 = zoom in)
     * @param {number} sensitivity - Zoom sensitivity multiplier (default 1.0)
     */
    applyZoom(delta, sensitivity = 1.0) {
        if (!this.camera || this.viewAngle !== '3d' || !this.orbitState.enabled) return;
        
        // Apply sensitivity to the delta
        const adjustedDelta = 1 + (delta - 1) * sensitivity;
        
        // Update zoom factor with constraints
        const newZoomFactor = this.zoomState.zoomFactor * adjustedDelta;
        this.zoomState.zoomFactor = Math.max(
            this.zoomState.minZoom,
            Math.min(this.zoomState.maxZoom, newZoomFactor)
        );
        
        // In 3D view, adjust the spherical radius
        const newRadius = this.zoomState.baseDistance / this.zoomState.zoomFactor;
        this.orbitState.spherical.radius = Math.max(0.01, newRadius); // Prevent zero radius
        this.updateCameraFromSpherical();
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

    // Calculate the maximum look-around FOV based on the largest screen
    // Returns { maxYaw, maxPitch } in radians
    calculateLookAroundFOVLimits() {
        if (!this.screens || this.screens.length === 0) {
            return { maxYaw: Math.PI / 6, maxPitch: Math.PI / 6 }; // Default 30 degrees
        }

        let maxHalfYaw = 0;
        let maxHalfPitch = 0;

        this.screens.forEach(screen => {
            // Calculate screen dimensions
            const ratio = screen.resolution[0] / screen.resolution[1];
            const heightInches = screen.diagonal / Math.sqrt(ratio ** 2 + 1);
            const widthInches = ratio * heightInches;

            // Convert to meters
            const widthMeters = (widthInches * CONFIG.PHYSICS.INCHES_TO_MM) / 1000;
            const heightMeters = (heightInches * CONFIG.PHYSICS.INCHES_TO_MM) / 1000;

            // Get distance in meters
            const distanceMeters = (screen.distance || CONFIG.DEFAULTS.PRESET_DISTANCE) / 1000;

            // Calculate half-angle FOV for this screen
            // tan(halfAngle) = halfDimension / distance
            const halfYaw = Math.atan2(widthMeters / 2, distanceMeters);
            const halfPitch = Math.atan2(heightMeters / 2, distanceMeters);

            maxHalfYaw = Math.max(maxHalfYaw, halfYaw);
            maxHalfPitch = Math.max(maxHalfPitch, halfPitch);
        });

        return {
            maxYaw: maxHalfYaw,
            maxPitch: maxHalfPitch
        };
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
    
    // Handle responsive camera updates with delay (only in 3D or top view)
    updateCameraPositionResponsive() {
        // Only respond to distance changes in 3D or top view
        if (this.viewAngle === 'front' || !this.isInitialized) return;
        
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
        
        // For top-down view, we need special handling because lookAt straight down
        // causes issues with the up vector
        if (this.viewAngle === 'top') {
            // Clear spherical helpers if they exist (switching from 3D view)
            if (this._currentSpherical) {
                this._currentSpherical = null;
            }
            if (this._currentOrbitTarget) {
                this._currentOrbitTarget = null;
            }
            
            // Interpolate camera position
            this.camera.position.lerp(this.targetCameraPosition, this.animationSpeed);
            
            // Initialize the look-at point helper if needed
            if (!this._currentLookAt) {
                // Initialize from current camera state - calculate what point the camera is looking at
                // Use a point at a reasonable distance in front of the camera
                const currentDirection = new THREE.Vector3();
                this.camera.getWorldDirection(currentDirection);
                this._currentLookAt = new THREE.Vector3();
                this._currentLookAt.copy(this.camera.position).add(currentDirection.multiplyScalar(1));
            }
            
            // Smoothly interpolate the look-at point
            this._currentLookAt.lerp(this.targetCameraLookAt, this.animationSpeed);
            
            // Smoothly interpolate the up vector for top view
            if (!this._currentUp) {
                this._currentUp = new THREE.Vector3().copy(this.camera.up);
            }
            const targetUp = new THREE.Vector3(0, 0, -1); // Target up vector for top-down view
            this._currentUp.lerp(targetUp, this.animationSpeed);
            this.camera.up.copy(this._currentUp);
            
            // Set camera to look at the interpolated point
            this.camera.lookAt(this._currentLookAt);
            
            // Check if we're close enough to the target to stop animating
            const positionDistance = this.camera.position.distanceTo(this.targetCameraPosition);
            const lookAtDistance = this._currentLookAt.distanceTo(this.targetCameraLookAt);
            const upDistance = this._currentUp.distanceTo(targetUp);
            
            if (positionDistance < 0.001 && lookAtDistance < 0.001 && upDistance < 0.001) {
                // Animation complete - snap to final position
                this.camera.position.copy(this.targetCameraPosition);
                this.camera.up.set(0, 0, -1);
                this.camera.lookAt(this.targetCameraLookAt);
                this.isAnimating = false;
                this._currentLookAt = null;
                this._currentUp = null;
            }
        } else if (this.viewAngle === '3d') {
            // For 3D view, use spherical coordinate interpolation for proper rotation around target
            // This ensures the camera orbits around the target point during transitions
            
            // Clear the lookAt helper if it exists (switching from top view)
            if (this._currentLookAt) {
                this._currentLookAt = null;
            }
            
            // Smoothly interpolate the up vector back to Y-up
            if (!this._currentUp) {
                this._currentUp = new THREE.Vector3().copy(this.camera.up);
            }
            const targetUp = new THREE.Vector3(0, 1, 0); // Standard up vector
            this._currentUp.lerp(targetUp, this.animationSpeed);
            this.camera.up.copy(this._currentUp);
            
            // Smoothly interpolate the orbit target (rotation center)
            // _currentOrbitTarget should be pre-initialized in setViewAngle with the PREVIOUS target
            if (!this._currentOrbitTarget) {
                // Fallback: if not pre-initialized, start from current target (no transition)
                this._currentOrbitTarget = new THREE.Vector3().copy(this.orbitState.target);
            }
            this._currentOrbitTarget.lerp(this.orbitState.target, this.animationSpeed);
            
            // _currentSpherical should be pre-initialized in setViewAngle with PREVIOUS camera state
            if (!this._currentSpherical) {
                // Fallback: calculate from current position relative to current target
                const offset = new THREE.Vector3();
                offset.copy(this.camera.position).sub(this._currentOrbitTarget);
                
                const radius = offset.length();
                if (radius > 0) {
                    const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));
                    const theta = Math.atan2(offset.x, offset.z);
                    this._currentSpherical = new THREE.Spherical(radius, phi, theta);
                } else {
                    this._currentSpherical = new THREE.Spherical(1, Math.PI / 4, Math.PI / 4);
                }
            }
            
            // Interpolate spherical coordinates
            this._currentSpherical.radius = THREE.MathUtils.lerp(
                this._currentSpherical.radius, 
                this.orbitState.spherical.radius, 
                this.animationSpeed
            );
            this._currentSpherical.phi = THREE.MathUtils.lerp(
                this._currentSpherical.phi, 
                this.orbitState.spherical.phi, 
                this.animationSpeed
            );
            // For theta, handle wrapping around PI/-PI
            let targetTheta = this.orbitState.spherical.theta;
            let currentTheta = this._currentSpherical.theta;
            // Find shortest path for theta interpolation
            let deltaTheta = targetTheta - currentTheta;
            if (deltaTheta > Math.PI) deltaTheta -= 2 * Math.PI;
            if (deltaTheta < -Math.PI) deltaTheta += 2 * Math.PI;
            this._currentSpherical.theta = currentTheta + deltaTheta * this.animationSpeed;
            
            // Calculate camera position from interpolated spherical coordinates and target
            const position = new THREE.Vector3();
            position.setFromSpherical(this._currentSpherical);
            position.add(this._currentOrbitTarget);
            
            this.camera.position.copy(position);
            this.camera.lookAt(this._currentOrbitTarget);
            
            // Check if we're close enough to stop animating
            const positionDistance = this.camera.position.distanceTo(this.targetCameraPosition);
            const targetDistance = this._currentOrbitTarget.distanceTo(this.orbitState.target);
            const upDistance = this._currentUp.distanceTo(targetUp);
            
            if (positionDistance < 0.001 && targetDistance < 0.001 && upDistance < 0.001) {
                // Animation complete - snap to final position
                this.camera.position.copy(this.targetCameraPosition);
                this.camera.up.set(0, 1, 0);
                this.camera.lookAt(this.orbitState.target);
                this.isAnimating = false;
                this._currentUp = null;
                this._currentSpherical = null;
                this._currentOrbitTarget = null;
                
                // Update orbit state spherical coordinates to match final camera position
                const offset = new THREE.Vector3();
                offset.copy(this.camera.position).sub(this.orbitState.target);
                
                const radius = offset.length();
                const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));
                const theta = Math.atan2(offset.x, offset.z);
                
                this.orbitState.spherical.set(radius, phi, theta);
            }
        } else {
            // For front view, smoothly interpolate position and look direction
            
            // Clear all helpers from other views
            if (this._currentSpherical) {
                this._currentSpherical = null;
            }
            if (this._currentOrbitTarget) {
                this._currentOrbitTarget = null;
            }
            if (this._currentLookAt) {
                this._currentLookAt = null;
            }
            
            // Interpolate camera position
            this.camera.position.lerp(this.targetCameraPosition, this.animationSpeed);
            
            if (!this._currentUp) {
                this._currentUp = new THREE.Vector3().copy(this.camera.up);
            }
            const targetUp = new THREE.Vector3(0, 1, 0); // Standard up vector
            this._currentUp.lerp(targetUp, this.animationSpeed);
            this.camera.up.copy(this._currentUp);
            
            // For lookAt, we need to interpolate the direction and then apply it
            const currentLookDirection = new THREE.Vector3();
            this.camera.getWorldDirection(currentLookDirection);
            
            const targetLookDirection = new THREE.Vector3();
            targetLookDirection.copy(this.targetCameraLookAt).sub(this.camera.position).normalize();
            
            // Lerp for smooth rotation
            currentLookDirection.lerp(targetLookDirection, this.animationSpeed);
            
            // Apply the interpolated look direction
            const lookAtPoint = new THREE.Vector3();
            lookAtPoint.copy(this.camera.position).add(currentLookDirection);
            this.camera.lookAt(lookAtPoint);
            
            // Check if we're close enough to stop animating
            const positionDistance = this.camera.position.distanceTo(this.targetCameraPosition);
            const directionDistance = currentLookDirection.distanceTo(targetLookDirection);
            const upDistance = this._currentUp.distanceTo(targetUp);
            
            if (positionDistance < 0.001 && directionDistance < 0.001 && upDistance < 0.001) {
                // Animation complete - snap to final position
                this.camera.position.copy(this.targetCameraPosition);
                this.camera.up.set(0, 1, 0);
                this.camera.lookAt(this.targetCameraLookAt);
                this.isAnimating = false;
                this._currentUp = null;
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
        // Sphere is visible in 3D and top views, hidden in front view
        const shouldBeVisible = (this.viewAngle !== 'front');
        
        // Only start animation if visibility state actually changed
        if (this.sphereVisible !== shouldBeVisible) {
            this.sphereVisible = shouldBeVisible;
            this.targetSphereOpacity = shouldBeVisible ? 1 : 0; // Fully opaque when visible, fully transparent when hidden
            this.sphereAnimating = true;
        }
        
        // Update manual orbit controls enabled state (only in 3D view)
        this.orbitState.enabled = (this.viewAngle === '3d');

        // Update cursor based on controls state (grab cursor for front and 3D views)
        if (this.renderer && this.renderer.domElement) {
            const allowsInteraction = (this.viewAngle === 'front' || this.viewAngle === '3d');
            this.renderer.domElement.style.cursor = allowsInteraction ? 'grab' : 'default';
        }
    }
    
    updateCameraPosition() {
        if (!this.camera) return;
        
        if (this.viewAngle === 'front') {
            // Front view - camera at origin (same position as user sphere)
            this.targetCameraPosition.set(0, 0, 0);
            this.targetCameraLookAt.set(0, 0, -1); // Look towards negative Z direction
            
            // Reset zoom for front view
            this.zoomState.zoomFactor = 1.0;
            this.zoomState.baseDistance = 1.0;
        } else if (this.viewAngle === 'top') {
            // Top-down view - camera above looking straight down
            const furthestDistance = this.calculateFurthestScreenDistance();
            const furthestDistanceMeters = furthestDistance / 1000; // Convert mm to meters
            
            // Position camera above the midpoint between user and furthest screen
            const midpointZ = -furthestDistanceMeters / 2; // Midpoint in negative Z
            const cameraHeight = Math.max(0.8, furthestDistanceMeters * 1.5); // Height above scene
            
            this.targetCameraPosition.set(0, cameraHeight, midpointZ);
            
            // Look straight down at the midpoint
            this.targetCameraLookAt.set(0, 0, midpointZ);
            
            // Update orbit target for consistency (though orbit is disabled in top view)
            this.orbitState.target.set(0, 0, midpointZ);
            
            // Set base distance for zoom (use camera height)
            this.zoomState.zoomFactor = 1.0;
            this.zoomState.baseDistance = cameraHeight;
        } else {
            // 3D isometric view - camera at an angle to see both sphere and screens
            // Calculate camera position based on furthest screen distance
            const furthestDistance = this.calculateFurthestScreenDistance();
            const furthestDistanceMeters = furthestDistance / 1000; // Convert mm to meters
            
            // Position camera at a distance that provides good viewing angle for all screens
            // Use the furthest screen distance as reference for camera positioning
            const cameraDistance = Math.max(0.1, furthestDistanceMeters * 0.2); // At least 0.3m, or 50% of furthest screen
            const cameraHeight = cameraDistance * 2; // Height proportional to distance
            const cameraSide = cameraDistance * 3;    // Side position proportional to distance
            
            this.targetCameraPosition.set(cameraSide, cameraHeight, cameraDistance);
            
            // Set rotation center to the midpoint from user to furthest screen
            const midpointZ = -furthestDistanceMeters / 2; // Midpoint between user (0,0,0) and furthest screen
            const rotationCenter = new THREE.Vector3(0, 0, midpointZ);
            
            // Look towards the midpoint (rotation center)
            this.targetCameraLookAt.copy(rotationCenter);
            
            // Update manual orbit controls target to midpoint
            this.orbitState.target.copy(rotationCenter);
            
            // Calculate spherical coordinates from target camera position
            const offset = new THREE.Vector3();
            offset.copy(this.targetCameraPosition).sub(this.orbitState.target);
            
            // Set spherical coordinates properly
            const radius = offset.length();
            const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));
            const theta = Math.atan2(offset.x, offset.z);
            
            this.orbitState.spherical.set(radius, phi, theta);
            
            // Set base distance for zoom (use spherical radius)
            this.zoomState.zoomFactor = 1.0;
            this.zoomState.baseDistance = radius;
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

        // Handle front view look-around spring-back animation
        this.animateLookAroundSpringBack();

        // No controls update needed - manual orbit controls handle events directly

        // No animation needed for static screen display
        // Just render the scene
        this.renderer.render(this.scene, this.camera);

        // Continue the animation loop
        requestAnimationFrame(() => this.animate());
    }

    // Animate the spring-back to center when releasing look-around in front view
    animateLookAroundSpringBack() {
        if (!this.lookAroundState.springBack || this.viewAngle !== 'front') return;

        // Spring-back animation speed (higher = faster)
        const springSpeed = 0.1;

        // Interpolate yaw and pitch back to 0
        this.lookAroundState.currentYaw *= (1 - springSpeed);
        this.lookAroundState.currentPitch *= (1 - springSpeed);

        // Check if close enough to center to stop animating
        const threshold = 0.001;
        if (Math.abs(this.lookAroundState.currentYaw) < threshold &&
            Math.abs(this.lookAroundState.currentPitch) < threshold) {
            this.lookAroundState.currentYaw = 0;
            this.lookAroundState.currentPitch = 0;
            this.lookAroundState.springBack = false;
        }

        // Update camera direction
        this.updateCameraLookAround();
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
        
        // Update LineMaterial resolution for proper line width rendering
        if (this.viewAxisLine && this.viewAxisLine.material) {
            this.viewAxisLine.material.resolution.set(this.canvas.width, this.canvas.height);
        }
        
        // Reset screen cache to trigger re-render if needed
        this.lastScreensHash = null;
    }

    /**
     * Get effective theme (system, light, dark)
     * @returns {string} The effective theme
     */
    getEffectiveTheme() {
        // Method 1: Check data-theme attribute on html (this is what ThemeManager sets)
        const htmlTheme = document.documentElement.getAttribute('data-theme');
        if (htmlTheme === 'dark' || htmlTheme === 'light') {
            return htmlTheme;
        }
        
        // Method 2: Check localStorage
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || savedTheme === 'light') {
            return savedTheme;
        }
        
        // Method 3: Check for theme class on html
        if (document.documentElement.classList.contains('theme-dark')) {
            return 'dark';
        }
        if (document.documentElement.classList.contains('theme-light')) {
            return 'light';
        }
        
        // Method 4: Check for dark class on html or body
        if (document.documentElement.classList.contains('dark') || 
            document.body?.classList.contains('dark')) {
            return 'dark';
        }
        
        // Method 5: Fall back to system preference
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    /**
     * Set up theme change listener
     */
    setupThemeListener() {
        // Listen for theme toggle events (custom event)
        document.addEventListener('themeChanged', () => {
            this.currentTheme = this.getEffectiveTheme();
            this.updateViewAxisLineColor();
            this.render();
        });

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            this.currentTheme = this.getEffectiveTheme();
            this.updateViewAxisLineColor();
            this.render();
        });
        
        // Listen for DOM attribute changes (for data-theme attribute changes)
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && 
                    (mutation.attributeName === 'data-theme' || mutation.attributeName === 'class')) {
                    const newTheme = this.getEffectiveTheme();
                    if (newTheme !== this.currentTheme) {
                        this.currentTheme = newTheme;
                        this.updateViewAxisLineColor();
                        this.render();
                    }
                    break;
                }
            }
        });
        
        // Observe both html and body for theme changes
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
        if (document.body) {
            observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class'] });
        }
        
        // Store observer for cleanup
        this.themeObserver = observer;
    }

    /**
     * Update the view axis line color based on current theme
     */
    updateViewAxisLineColor() {
        if (!this.viewAxisLine || !this.viewAxisLine.material) return;
        
        const isDark = this.getEffectiveTheme() === 'dark';
        const lineColor = isDark ? 0xffffff : 0x000000;
        
        // LineMaterial requires setting color via the color property
        this.viewAxisLine.material.color.set(lineColor);
        
        // Force material update - LineMaterial may cache uniforms
        this.viewAxisLine.material.needsUpdate = true;
        
        // Also update the material's uniforms directly if they exist
        if (this.viewAxisLine.material.uniforms && this.viewAxisLine.material.uniforms.diffuse) {
            this.viewAxisLine.material.uniforms.diffuse.value.set(lineColor);
        }
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
            this.updateViewAxisLine(); // Update view axis line when screens change
        }
        
        // If only distances changed (and we're in 3D view), update camera position responsively
        if (this.isInitialized && distanceChanged) {
            this.updateCameraPositionResponsive();
            this.updateViewAxisLine(); // Also update view axis when distance changes
        }
    }

    setViewDistance(distance) {
        if (this.viewDistance !== distance) {
            this.viewDistance = distance;
            // Note: viewDistance is kept for potential future use but not currently used in rendering
        }
    }

    /**
     * Update the angle toggle UI to reflect the current view state
     * @param {string} viewAngle - The view angle ('front', 'top', or '3d')
     */
    updateAngleToggleUI(viewAngle) {
        const angleToggle = document.querySelector('.angle-toggle');
        if (angleToggle) {
            // Remove all selection classes first
            angleToggle.classList.remove('top-selected', 'isometric-selected');
            
            // Add the appropriate class based on selection
            if (viewAngle === 'top') {
                angleToggle.classList.add('top-selected');
            } else if (viewAngle === '3d') {
                angleToggle.classList.add('isometric-selected');
            }
            // 'front' is the default state, no class needed
        }
    }

    setViewAngle(angle) {
        if (this.viewAngle !== angle) {
            const previousAngle = this.viewAngle;
            this.viewAngle = angle;

            // Reset look-around state when switching to front view
            if (angle === 'front') {
                this.lookAroundState.currentYaw = 0;
                this.lookAroundState.currentPitch = 0;
                this.lookAroundState.dragging = false;
                this.lookAroundState.springBack = false;
            }

            // Update toggle UI to match view state
            this.updateAngleToggleUI(angle);

            if (this.isInitialized) {
                // Capture current camera state BEFORE updateCameraPosition changes targets
                const previousCameraPosition = this.camera.position.clone();
                const previousUp = this.camera.up.clone();
                
                // Calculate where camera was looking (for transition)
                const previousLookDirection = new THREE.Vector3();
                this.camera.getWorldDirection(previousLookDirection);
                
                // Store the previous orbit target for smooth transition
                const previousOrbitTarget = this.orbitState.target.clone();
                
                this.updateCameraPosition();
                
                // Pre-initialize animation helpers with PREVIOUS state for smooth transitions
                if (angle === '3d') {
                    // Initialize _currentOrbitTarget with the PREVIOUS target (or calculate from previous look direction)
                    if (previousAngle === 'top') {
                        // From top view, use the previous lookAt point (midpoint)
                        this._currentOrbitTarget = this.targetCameraLookAt.clone();
                        // Actually for top view, the target was at the midpoint on the Z axis
                        // Let's use where the camera was looking at based on previous state
                        this._currentOrbitTarget = previousOrbitTarget.clone();
                    } else {
                        this._currentOrbitTarget = previousOrbitTarget.clone();
                    }
                    
                    // Initialize _currentUp with previous up vector
                    this._currentUp = previousUp.clone();
                    
                    // Calculate initial spherical coordinates from PREVIOUS camera position relative to PREVIOUS target
                    const offset = new THREE.Vector3();
                    offset.copy(previousCameraPosition).sub(this._currentOrbitTarget);
                    
                    const radius = offset.length();
                    if (radius > 0) {
                        const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));
                        const theta = Math.atan2(offset.x, offset.z);
                        this._currentSpherical = new THREE.Spherical(radius, phi, theta);
                    } else {
                        this._currentSpherical = new THREE.Spherical(1, Math.PI / 2, 0);
                    }
                }
            }
        }
    }

    /**
     * Update the view axis line endpoint based on current furthest screen distance
     */
    updateViewAxisLine() {
        if (!this.viewAxisLine || !this.isInitialized) return;
        
        // Calculate new furthest screen distance
        const furthestDistance = this.calculateFurthestScreenDistance();
        const furthestDistanceMeters = -furthestDistance / 1000; // Convert mm to meters, negative Z
        
        // Update line geometry with new endpoint
        const lineGeometry = new LineGeometry();
        lineGeometry.setPositions([
            0, 0, 0,                           // User position
            0, 0, furthestDistanceMeters       // Furthest screen center
        ]);
        
        // Dispose old geometry and assign new one
        this.viewAxisLine.geometry.dispose();
        this.viewAxisLine.geometry = lineGeometry;
        this.viewAxisLine.computeLineDistances(); // Required for dashed lines
    }

    render() {
        if (!this.isInitialized) return;
        
        // Update view axis line color based on theme
        if (this.viewAxisLine && this.viewAxisLine.material) {
            const lineColor = this.getEffectiveTheme() === 'dark' ? 0xffffff : 0x000000;
            this.viewAxisLine.material.color.set(lineColor);
        }
        
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
                if (meshGroup.centerPanel.children && meshGroup.centerPanel.children.length > 0) {
                    // It's a group (curved screen) - update all children
                    meshGroup.centerPanel.children.forEach(panelPiece => {
                        panelPiece.material.color.copy(panelColor);
                    });
                } else {
                    // It's a single mesh (flat screen) - update directly
                    meshGroup.centerPanel.material.color.copy(panelColor);
                }
            }
            
            // Update radius center marker color (for curved screens)
            if (meshGroup.radiusCenterMarker) {
                meshGroup.radiusCenterMarker.material.color.copy(screenColor.clone().multiplyScalar(0.7));
            }
            
            // Update radius line color (for curved screens)
            if (meshGroup.radiusLine) {
                meshGroup.radiusLine.material.color.copy(screenColor.clone().multiplyScalar(0.6));
            }
        });
    }

    destroy() {
        // Clean up event listeners
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
        
        // Clean up all screens
        this.clearScreens();
        
        // Clean up user sphere
        if (this.userSphere) {
            this.scene.remove(this.userSphere);
            this.userSphere.geometry.dispose();
            this.userSphere.material.dispose();
            this.userSphere = null;
        }
        
        // Clean up renderer
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        this.isInitialized = false;
    }
}

// Export for ES6 modules
export { ScreenVisualizer3D };