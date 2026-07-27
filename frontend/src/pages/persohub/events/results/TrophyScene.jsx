import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import trophyUrl from '@/assets/trophy-v1.glb';

const TARGET_HEIGHT = 4.0;
const DRACO_DECODER_PATH = '/draco/';

THREE.Cache.enabled = true;

function createPlaceholderModel(subdued = false) {
    const group = new THREE.Group();
    const primary = 0x38bdf8;
    const accent = 0x818cf8;

    const globeMaterial = new THREE.MeshBasicMaterial({
        color: primary,
        wireframe: true,
        transparent: true,
        opacity: subdued ? 0.46 : 0.58,
    });
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 3), globeMaterial);
    group.add(shell);

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

export default function TrophyScene({ subdued = false, className = '', modelUrl = '', placeholderOnly = false }) {
    const hostRef = useRef(null);
    const canvasRef = useRef(null);
    const [progress, setProgress] = useState(3);
    const [loadingLabel, setLoadingLabel] = useState('starting hero model');
    const [progressVisible, setProgressVisible] = useState(true);

    useEffect(() => {
        const host = hostRef.current;
        const canvas = canvasRef.current;
        if (!host || !canvas) return undefined;

        let frameId = 0;
        let trophyObject = null;
        let disposed = false;
        let dracoLoader = null;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
        camera.position.set(0, 0.7, 7.2);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = subdued ? 0.72 : 0.9;

        scene.add(new THREE.AmbientLight(0xffffff, 0.75));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
        keyLight.position.set(3, 4, 5);
        scene.add(keyLight);

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

        if (placeholderOnly) {
            setLoadingLabel('holding model online');
            setProgress(100);
            window.setTimeout(() => {
                if (!disposed) setProgressVisible(false);
            }, 360);
        }

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

        dracoLoader = new DRACOLoader(manager);
        dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
        dracoLoader.setWorkerLimit(2);
        dracoLoader.preload();

        const loader = new GLTFLoader(manager);
        loader.setDRACOLoader(dracoLoader);
        loader.setCrossOrigin('anonymous');

        const uploadedUrl = String(modelUrl || '').trim();
        const sources = uploadedUrl && uploadedUrl !== trophyUrl
            ? [
                { url: uploadedUrl, label: 'loading uploaded model' },
                { url: trophyUrl, label: 'loading default trophy' },
            ]
            : [{ url: trophyUrl, label: 'loading default trophy' }];

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
                    // Keep this visible in dev tools. Common causes are S3 CORS or overly heavy .gltf assets.
                    console.warn('Results model failed to load', { url: source.url, error });
                    loadSource(index + 1);
                }
            );
        };

        if (!placeholderOnly) loadSource(0);

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
            if (dracoLoader) dracoLoader.dispose();
            if (trophyObject) disposeObject(trophyObject);
            renderer.dispose();
        };
    }, [modelUrl, placeholderOnly, subdued]);

    return (
        <div ref={hostRef} className={`results-trophy-scene ${className}`}>
            <canvas ref={canvasRef} aria-label="Animated results hero model" />
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
