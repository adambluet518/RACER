// === File: game.js ===
import * as THREE from 'three';

// Dynamically import GLTFLoader to avoid crashes if it fails
let GLTFLoader = null;
try {
    const addon = await import('three/addons/loaders/GLTFLoader.js');
    GLTFLoader = addon.GLTFLoader;
} catch (e) {
    console.warn('GLTFLoader not available, using fallback models');
}

export class Game {
    constructor() {
        // DOM elements
        this.startScreen = document.getElementById('start-screen');
        this.gameoverScreen = document.getElementById('gameover-screen');
        this.hud = document.getElementById('hud');
        this.speedEl = document.getElementById('speed');
        this.nitroBar = document.getElementById('nitro-bar');
        this.scoreEl = document.getElementById('score');
        this.finalScoreEl = document.getElementById('final-score');

        // Game state
        this.state = 'start';
        this.score = 0;
        this.playerX = 0;
        this.targetLane = 0;
        this.laneWidth = 2.0;
        this.playerSpeed = 80;
        this.maxSpeed = 200;
        this.nitroFuel = 100;
        this.nitroMax = 100;
        this.nitroActive = false;
        this.boostMultiplier = 2.0;
        this.fuelDrainRate = 60;
        this.fuelRecharge = 15;
        this.aiCars = [];
        this.boostPads = [];
        this.aiSpawnTimer = 0;
        this.aiSpawnInterval = 1.5;
        this.padSpawnTimer = 0;
        this.padSpawnInterval = 3.0;

        // Three.js objects
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        this.playerGroup = null;
        this.roadMesh = null;
        this.roadTexture = null;
        this.nitroFlame = null;
        this.ambientLight = null;
        this.dirLight = null;

        // Asset loading
        this.gltfLoader = GLTFLoader ? new GLTFLoader() : null;
        this.textureLoader = new THREE.TextureLoader();
        this.assetsLoaded = false;

        // Input
        this.keys = { left: false, right: false, boost: false };

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onResize = this._onResize.bind(this);
    }

    init() {
        try {
            this._setupScene();
            this._setupLighting();
            this._setupRoad();
            this._createPlayerCar();
            this._setupInput();
            this._setupResize();
            this.animate();
        } catch (error) {
            console.error('Game initialization error:', error);
        }
    }

    _setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 40, 150);

        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.5,
            300
        );
        this.camera.position.set(0, 6, 12);
        this.camera.lookAt(0, 0.5, -10);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        document.getElementById('game-container').appendChild(this.renderer.domElement);
    }

    _setupLighting() {
        this.ambientLight = new THREE.AmbientLight(0x404066);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.dirLight.position.set(30, 40, 20);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 512;
        this.dirLight.shadow.mapSize.height = 512;
        this.dirLight.shadow.camera.near = 1;
        this.dirLight.shadow.camera.far = 100;
        this.dirLight.shadow.camera.left = -30;
        this.dirLight.shadow.camera.right = 30;
        this.dirLight.shadow.camera.top = 30;
        this.dirLight.shadow.camera.bottom = -10;
        this.scene.add(this.dirLight);
    }

    _setupRoad() {
        // Always use procedural road first for reliability
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const shade = 70 + Math.random() * 30;
            ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
            ctx.fillRect(x, y, 2, 2);
        }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.setLineDash([30, 40]);
        ctx.beginPath();
        ctx.moveTo(170, 0);
        ctx.lineTo(170, 512);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(342, 0);
        ctx.lineTo(342, 512);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(20, 512);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(492, 0);
        ctx.lineTo(492, 512);
        ctx.stroke();
        
        this.roadTexture = new THREE.CanvasTexture(canvas);
        this.roadTexture.wrapS = THREE.RepeatWrapping;
        this.roadTexture.wrapT = THREE.RepeatWrapping;
        this.roadTexture.repeat.set(1, 4);
        
        const roadGeo = new THREE.PlaneGeometry(20, 200);
        const roadMat = new THREE.MeshStandardMaterial({
            map: this.roadTexture,
            roughness: 0.8,
            metalness: 0.1
        });
        this.roadMesh = new THREE.Mesh(roadGeo, roadMat);
        this.roadMesh.rotation.x = -Math.PI / 2;
        this.roadMesh.position.y = -0.6;
        this.roadMesh.receiveShadow = true;
        this.scene.add(this.roadMesh);

        // Try to load custom road texture asynchronously
        if (this.textureLoader) {
            this.textureLoader.load(
                'road_asphalt.png',
                (texture) => {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(1, 4);
                    this.roadTexture = texture;
                    this.roadMesh.material.map = texture;
                    this.roadMesh.material.needsUpdate = true;
                },
                undefined,
                () => console.log('Custom road texture not found, using procedural')
            );
        }
    }

    _createPlayerCar() {
        this.playerGroup = new THREE.Group();

        // Create fallback car immediately
        const bodyGeo = new THREE.BoxGeometry(1.6, 0.6, 4);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff2222, roughness: 0.3, metalness: 0.7 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        body.receiveShadow = true;
        body.position.y = 0.3;
        body.name = 'fallback_body';
        this.playerGroup.add(body);

        const cabinGeo = new THREE.BoxGeometry(1.4, 0.4, 2);
        const cabinMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.2, metalness: 0.9 });
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(0, 0.65, -0.2);
        cabin.castShadow = true;
        cabin.name = 'fallback_cabin';
        this.playerGroup.add(cabin);

        const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
        const positions = [
            [-0.85, -0.15, 1.3],
            [0.85, -0.15, 1.3],
            [-0.85, -0.15, -1.3],
            [0.85, -0.15, -1.3]
        ];
        positions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos[0], pos[1], pos[2]);
            wheel.castShadow = true;
            wheel.receiveShadow = true;
            wheel.name = 'fallback_wheel';
            this.playerGroup.add(wheel);
        });

        // Nitro flame
        const flameGeo = new THREE.ConeGeometry(0.5, 1.2, 8);
        const flameMat = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending
        });
        this.nitroFlame = new THREE.Mesh(flameGeo, flameMat);
        this.nitroFlame.position.set(0, 0.2, -2.2);
        this.nitroFlame.rotation.x = Math.PI;
        this.nitroFlame.visible = false;
        this.playerGroup.add(this.nitroFlame);

        this.scene.add(this.playerGroup);
        this.playerGroup.position.set(0, 0, 0);

        // Try to load GLB model asynchronously and replace fallback
        if (this.gltfLoader) {
            this.gltfLoader.load(
                'player_car.glb',
                (gltf) => {
                    // Remove fallback meshes
                    const toRemove = [];
                    this.playerGroup.children.forEach(child => {
                        if (child.name && child.name.startsWith('fallback_')) {
                            toRemove.push(child);
                        }
                    });
                    toRemove.forEach(child => this.playerGroup.remove(child));
                    
                    // Add loaded model
                    gltf.scene.traverse((node) => {
                        if (node.isMesh) {
                            node.castShadow = true;
                            node.receiveShadow = true;
                        }
                    });
                    this.playerGroup.add(gltf.scene);
                    console.log('Player car model loaded successfully');
                },
                undefined,
                () => console.log('Player car model not found, using fallback')
            );
        }
    }

    _setupInput() {
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
    }

    _onKeyDown(e) {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = true;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.boost = true;
        if (e.code === 'Space') {
            e.preventDefault();
            if (this.state === 'start') this._startGame();
            else if (this.state === 'gameover') this._restartGame();
        }
    }

    _onKeyUp(e) {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = false;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.boost = false;
    }

    _setupResize() {
        window.addEventListener('resize', this._onResize);
    }

    _onResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    _startGame() {
        this.state = 'playing';
        this.startScreen.classList.add('hidden');
        this.gameoverScreen.classList.add('hidden');
        this.hud.classList.remove('hidden');
        this.score = 0;
        this.playerSpeed = 80;
        this.nitroFuel = this.nitroMax;
        this.nitroActive = false;
        this.playerX = 0;
        this.targetLane = 0;
        this.playerGroup.position.x = 0;
        this.playerGroup.position.z = 0;
        this.aiCars = [];
        this.boostPads = [];
        this.aiSpawnTimer = 0;
        this.padSpawnTimer = 0;
        this.clock.start();
    }

    _restartGame() {
        this._startGame();
    }

    _endGame() {
        this.state = 'gameover';
        this.hud.classList.add('hidden');
        this.gameoverScreen.classList.remove('hidden');
        this.finalScoreEl.textContent = `Score: ${Math.floor(this.score)}`;
    }

    _createAICar(colorIndex) {
        const group = new THREE.Group();
        const colors = [0x2255ff, 0x33cc33, 0xffaa00, 0xaa44ff];
        const color = colors[colorIndex || 0] || 0x2255ff;
        
        const bodyGeo = new THREE.BoxGeometry(1.6, 0.6, 4);
        const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.3;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const cabinGeo = new THREE.BoxGeometry(1.4, 0.4, 2);
        const cabinMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(0, 0.65, -0.2);
        cabin.castShadow = true;
        group.add(cabin);

        const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        [[-0.85, -0.15, 1.3], [0.85, -0.15, 1.3], [-0.85, -0.15, -1.3], [0.85, -0.15, -1.3]].forEach(p => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI/2;
            wheel.position.set(p[0], p[1], p[2]);
            wheel.castShadow = true;
            wheel.receiveShadow = true;
            group.add(wheel);
        });
        return group;
    }

    _createBoostPad() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffaa00';
        ctx.shadowColor = '#ff0';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        const cx = 32, cy = 32, spikes = 5, outerR = 28, innerR = 12;
        let rot = -Math.PI / 2;
        const step = Math.PI / spikes;
        ctx.moveTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
        for (let i = 0; i < spikes; i++) {
            rot += step;
            ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
            rot += step;
            ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
        }
        ctx.closePath();
        ctx.fill();
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2.5, 2.5, 1);
        return sprite;
    }

    _spawnAICar() {
        const laneIdx = Math.floor(Math.random() * 3) - 1;
        const x = laneIdx * this.laneWidth;
        const colorIndex = Math.floor(Math.random() * 4);
        const car = this._createAICar(colorIndex);
        car.position.set(x, 0, -60);
        this.scene.add(car);
        this.aiCars.push({
            mesh: car,
            speed: this.playerSpeed * (0.4 + Math.random() * 0.3),
            laneX: x
        });
    }

    _spawnBoostPad() {
        const laneIdx = Math.floor(Math.random() * 3) - 1;
        const x = laneIdx * this.laneWidth;
        const pad = this._createBoostPad();
        pad.position.set(x, 1.5, -50);
        this.scene.add(pad);
        this.boostPads.push({
            sprite: pad,
            position: pad.position
        });
    }

    _checkCollision(obj1Pos, obj1Size, obj2Pos, obj2Size) {
        return (
            Math.abs(obj1Pos.x - obj2Pos.x) < (obj1Size.x + obj2Size.x) / 2 &&
            Math.abs(obj1Pos.y - obj2Pos.y) < (obj1Size.y + obj2Size.y) / 2 &&
            Math.abs(obj1Pos.z - obj2Pos.z) < (obj1Size.z + obj2Size.z) / 2
        );
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        try {
            const delta = Math.min(this.clock.getDelta(), 0.1);

            if (this.state === 'playing') {
                this._update(delta);
            }

            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error('Animation error:', error);
        }
    }

    _update(delta) {
        this.playerSpeed = Math.min(this.maxSpeed, 80 + this.score * 0.05);

        if (this.keys.left && this.targetLane > -1) {
            this.targetLane--;
            this.keys.left = false;
        }
        if (this.keys.right && this.targetLane < 1) {
            this.targetLane++;
            this.keys.right = false;
        }
        const targetX = this.targetLane * this.laneWidth;
        this.playerX += (targetX - this.playerX) * Math.min(1, 8 * delta);
        this.playerGroup.position.x = this.playerX;

        this.nitroActive = this.keys.boost && this.nitroFuel > 0;
        const currentSpeed = this.nitroActive ? this.playerSpeed * this.boostMultiplier : this.playerSpeed;

        if (this.nitroActive) {
            this.nitroFuel = Math.max(0, this.nitroFuel - this.fuelDrainRate * delta);
        } else {
            this.nitroFuel = Math.min(this.nitroMax, this.nitroFuel + this.fuelRecharge * delta);
        }
        this.nitroFlame.visible = this.nitroActive;
        if (this.nitroActive && this.nitroFlame.scale) {
            this.nitroFlame.scale.setScalar(0.8 + Math.sin(Date.now() * 0.05) * 0.3);
        }

        if (this.roadTexture) {
            this.roadTexture.offset.y += currentSpeed * delta * 0.05;
        }

        for (let i = this.aiCars.length - 1; i >= 0; i--) {
            const ai = this.aiCars[i];
            const netSpeed = currentSpeed - ai.speed;
            ai.mesh.position.z += netSpeed * delta;

            if (ai.mesh.position.z > 15) {
                this.scene.remove(ai.mesh);
                this.aiCars.splice(i, 1);
                continue;
            }

            const playerPos = this.playerGroup.position.clone();
            const playerSize = new THREE.Vector3(1.6, 0.6, 4);
            const aiPos = ai.mesh.position.clone();
            const aiSize = new THREE.Vector3(1.6, 0.6, 4);
            if (this._checkCollision(playerPos, playerSize, aiPos, aiSize)) {
                this._endGame();
                return;
            }
        }

        for (let i = this.boostPads.length - 1; i >= 0; i--) {
            const pad = this.boostPads[i];
            pad.sprite.position.z += currentSpeed * delta;
            if (pad.sprite.position.z > 15) {
                this.scene.remove(pad.sprite);
                this.boostPads.splice(i, 1);
                continue;
            }
            const padPos = pad.sprite.position.clone();
            const playerPos = this.playerGroup.position.clone();
            const playerSize = new THREE.Vector3(1.6, 0.6, 4);
            const padSize = new THREE.Vector3(2.5, 2.5, 0.5);
            if (this._checkCollision(playerPos, playerSize, padPos, padSize)) {
                this.nitroFuel = Math.min(this.nitroMax, this.nitroFuel + 35);
                this.scene.remove(pad.sprite);
                this.boostPads.splice(i, 1);
                this.score += 20;
            }
        }

        this.aiSpawnTimer += delta;
        if (this.aiSpawnTimer >= this.aiSpawnInterval) {
            this.aiSpawnTimer -= this.aiSpawnInterval;
            this._spawnAICar();
        }
        this.padSpawnTimer += delta;
        if (this.padSpawnTimer >= this.padSpawnInterval) {
            this.padSpawnTimer -= this.padSpawnInterval;
            this._spawnBoostPad();
        }

        this.score += currentSpeed * delta * 0.2;
        if (this.speedEl) this.speedEl.textContent = `Speed: ${Math.floor(currentSpeed)} km/h`;
        const fuelPercent = (this.nitroFuel / this.nitroMax) * 100;
        if (this.nitroBar) this.nitroBar.style.width = `${fuelPercent}%`;
        if (this.scoreEl) this.scoreEl.textContent = `Score: ${Math.floor(this.score)}`;
    }
}
