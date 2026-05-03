import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import trophyUrl from '@/assets/trophy-v1.glb';

const TARGET_HEIGHT = 2.35;

function createPlaceholderTrophy(subdued = false) {
    const group = new THREE.Group();
    const color = subdued ? 0x7dd3fc : 0xfacc15;
    const metal = new THREE.MeshStandardMaterial({ color, metalness: 0.58, roughness: 0.28 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.14, roughness: 0.44 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.35, roughness: 0.36 });

    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, 0.9, 36), metal);
    cup.position.y = 0.72;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.055, 14, 54), metal);
    ring.position.y = 1.24;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.28, 24), silver);
    stem.position.y = 0.1;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.78), dark);
    base.position.y = -0.16;

    [cup, ring, stem, base].forEach((mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
    });
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

export default function TrophyScene({ subdued = false, className = '' }) {
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

        installObject(createPlaceholderTrophy(subdued));

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
        manager.onError = () => {
            setLoadingLabel('fallback model online');
            setProgress(100);
            window.setTimeout(() => {
                if (!disposed) setProgressVisible(false);
            }, 520);
        };

        const dracoLoader = new DRACOLoader(manager);
        dracoLoader.setDecoderPath('/draco/');

        const loader = new GLTFLoader(manager);
        loader.setDRACOLoader(dracoLoader);
        loader.load(
            trophyUrl,
            (gltf) => {
                if (disposed) return;
                const object = gltf.scene;
                normalizeModel(object);
                installObject(object);
            },
            (event) => {
                if (!event.total) return;
                setProgress(Math.max(3, Math.min(99, Math.round((event.loaded / event.total) * 100))));
            },
            () => {
                if (disposed) return;
                setLoadingLabel('fallback model online');
                setProgress(100);
            }
        );

        const clock = new THREE.Clock();
        const animate = () => {
            const t = clock.getElapsedTime();
            if (trophyObject) {
                trophyObject.position.y = Number(trophyObject.userData.baseY || 0) + Math.sin(t * 0.85) * 0.055;
                trophyObject.rotation.y = Math.sin(t * 0.28) * 0.12;
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
    }, [subdued]);

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
