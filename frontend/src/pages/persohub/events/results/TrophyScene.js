import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import trophyUrl from '@/assets/trophy-v1.glb';

const TARGET_HEIGHT = 2.35;

function createPlaceholderModel(subdued = false) {
    const group = new THREE.Group();
    const primary = subdued ? 0x38bdf8 : 0x2dd4bf;
    const secondary = subdued ? 0x7dd3fc : 0xfacc15;
    const accent = subdued ? 0x818cf8 : 0xf472b6;

    const globeMaterial = new THREE.MeshBasicMaterial({
        color: primary,
        wireframe: true,
        transparent: true,
        opacity: subdued ? 0.46 : 0.58,
    });
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 3), globeMaterial);
    group.add(shell);

    const ringMaterial = new THREE.MeshBasicMaterial({
        color: secondary,
        transparent: true,
        opacity: subdued ? 0.42 : 0.66,
    });
    const rings = [
        [0, 0, 0],
        [Math.PI / 2, 0, 0],
        [Math.PI / 2, Math.PI / 2, 0],
    ].map((rotation) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.012, 8, 120), ringMaterial);
        ring.rotation.set(rotation[0], rotation[1], rotation[2]);
        return ring;
    });
    rings.forEach((ring) => group.add(ring));

    const nodeMaterial = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9 });
    const nodePositions = [
        [0, 1.08, 0],
        [0, -1.08, 0],
        [1.08, 0, 0],
        [-1.08, 0, 0],
        [0.62, 0.52, 0.62],
        [-0.62, -0.52, -0.62],
    ];
    nodePositions.forEach((position) => {
        const node = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), nodeMaterial);
        node.position.set(position[0], position[1], position[2]);
        group.add(node);
    });

    const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34, 1),
        new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.78 })
    );
    group.add(core);

    group.userData.isPlaceholder = true;
    return group;
}

function normalizeModel(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = TARGET_HEIGHT / maxDim;
    object.position.set(-center.x * scale, -box.min.y * scale - TARGET_HEIGHT / 2, -center.z * scale);
    object.scale.setScalar(scale);

    object.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
            child.material.envMapIntensity = 0.78;
            child.material.needsUpdate = true;
        }
    });
}

function disposeObject(object) {
    object.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => material.dispose());
        }
    });
}

export default function TrophyScene({ subdued = false, className = '', modelUrl = '' }) {
    const hostRef = useRef(null);
    const canvasRef = useRef(null);
    const [progress, setProgress] = useState(3);
    const [loadingLabel, setLoadingLabel] = useState('loading trophy mesh');
    const [progressVisible, setProgressVisible] = useState(true);

    useEffect(() => {
        const host = hostRef.current;
        const canvas = canvasRef.current;
        if (!host || !canvas) return undefined;

        let frameId = 0;
        let trophyObject = null;
        let disposed = false;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
        camera.position.set(0, 0.7, 5.4);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = subdued ? 0.72 : 0.9;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        scene.add(new THREE.AmbientLight(0xffffff, 0.75));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
        keyLight.position.set(3, 4, 5);
        keyLight.castShadow = true;
        scene.add(keyLight);

        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(2.4, 56),
            new THREE.ShadowMaterial({ opacity: 0.24 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.3;
        floor.receiveShadow = true;
        scene.add(floor);

        const controls = new OrbitControls(camera, canvas);
        controls.enablePan = false;
        controls.enableZoom = false;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.75;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.75;
        controls.minPolarAngle = Math.PI / 3;
        controls.maxPolarAngle = Math.PI / 1.72;

        const installObject = (object) => {
            if (trophyObject) {
                scene.remove(trophyObject);
                disposeObject(trophyObject);
            }
            trophyObject = object;
            trophyObject.scale.multiplyScalar(subdued ? 0.9 : 1);
            trophyObject.userData.baseY = trophyObject.position.y;
            scene.add(trophyObject);
        };

        installObject(createPlaceholderModel(subdued));

        const resize = () => {
            if (!host || disposed) return;
            const rect = host.getBoundingClientRect();
            const width = Math.max(1, Math.floor(rect.width));
            const height = Math.max(1, Math.floor(rect.height));
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };

        const observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();

        const manager = new THREE.LoadingManager();
        manager.onProgress = (_url, loaded, total) => {
            const pct = total > 0 ? Math.round((loaded / total) * 100) : 45;
            setProgress(Math.max(3, Math.min(99, pct)));
        };
        manager.onLoad = () => {
            setProgress(100);
            window.setTimeout(() => {
                if (!disposed) setProgressVisible(false);
            }, 520);
        };

        const dracoLoader = new DRACOLoader(manager);
        dracoLoader.setDecoderPath('/draco/');

        const loader = new GLTFLoader(manager);
        loader.setDRACOLoader(dracoLoader);
        loader.setCrossOrigin('anonymous');

        const uploadedUrl = String(modelUrl || '').trim();
        const sources = uploadedUrl && uploadedUrl !== trophyUrl
            ? [
                { url: uploadedUrl, label: 'loading uploaded model' },
                { url: trophyUrl, label: 'loading default model' },
            ]
            : [{ url: trophyUrl, label: 'loading default model' }];

        const loadSource = (index = 0) => {
            const source = sources[index];
            if (!source || disposed) {
                setLoadingLabel('wireframe fallback online');
                setProgress(100);
                window.setTimeout(() => {
                    if (!disposed) setProgressVisible(false);
                }, 520);
                return;
            }

            setProgressVisible(true);
            setProgress(index === 0 ? 3 : 45);
            setLoadingLabel(source.label);

            loader.load(
                source.url,
                (gltf) => {
                    if (disposed) return;
                    const object = gltf.scene;
                    normalizeModel(object);
                    installObject(object);
                    setProgress(100);
                    window.setTimeout(() => {
                        if (!disposed) setProgressVisible(false);
                    }, 520);
                },
                (event) => {
                    if (!event.total) return;
                    const pct = Math.max(3, Math.min(99, Math.round((event.loaded / event.total) * 100)));
                    setProgress(pct);
                },
                (error) => {
                    // Keep this visible in dev tools. Common causes are S3 CORS or unsupported external .gltf assets.
                    console.warn('Results model failed to load', { url: source.url, error });
                    loadSource(index + 1);
                }
            );
        };

        loadSource(0);

        const clock = new THREE.Clock();
        const animate = () => {
            const t = clock.getElapsedTime();
            if (trophyObject) {
                trophyObject.position.y = Number(trophyObject.userData.baseY || 0) + Math.sin(t * 0.85) * 0.055;
                if (trophyObject.userData.isPlaceholder) {
                    trophyObject.rotation.x = Math.sin(t * 0.35) * 0.18;
                    trophyObject.rotation.y = t * 0.28;
                    trophyObject.rotation.z = Math.cos(t * 0.24) * 0.1;
                } else {
                    trophyObject.rotation.y = Math.sin(t * 0.28) * 0.12;
                }
            }
            controls.update();
            renderer.render(scene, camera);
            frameId = window.requestAnimationFrame(animate);
        };
        animate();

        return () => {
            disposed = true;
            window.cancelAnimationFrame(frameId);
            observer.disconnect();
            controls.dispose();
            dracoLoader.dispose();
            if (trophyObject) disposeObject(trophyObject);
            floor.geometry.dispose();
            floor.material.dispose();
            renderer.dispose();
        };
    }, [modelUrl, subdued]);

    return (
        <div ref={hostRef} className={`results-trophy-scene ${className}`}>
            <canvas ref={canvasRef} aria-label="Animated trophy model" />
            {progressVisible ? (
                <div className="results-trophy-progress" aria-live="polite">
                    <div className="results-progress-topline">
                        <span>{loadingLabel}</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="results-progress-track">
                        <div className="results-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
