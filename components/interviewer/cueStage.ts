import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createArcadeInk } from './arcadeInk';

export type CuePose = 'listen' | 'speak' | 'invite' | 'focus' | 'fold' | 'explain' | 'lean' | 'consider' | 'yawn' | 'stretch' | 'offer' | 'attend' | 'pinpoint';

/** The caller owns the canvas. All assets are served by SpeakWise. */
export function mountCue(canvas: HTMLCanvasElement, onReady: () => void, onFailure: () => void) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(THREE.MathUtils.clamp(window.devicePixelRatio, 1.3, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const ink = createArcadeInk(renderer);
    const scene = new THREE.Scene();
    const studio = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(studio, .05, .1, 20, { size: 64 });
    scene.environment = environment.texture;
    scene.environmentIntensity = .38;
    studio.dispose();
    pmrem.dispose();
    const camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.48, -1.48, .1, 20);
    camera.position.set(.68, 2.06, 6.7);
    camera.lookAt(0, 1.49, .05);
    scene.add(new THREE.HemisphereLight(0xffefe1, 0x798687, 1.0));
    for (const [x,y,z,intensity,color] of [[-3,5,4,2.25,0xffe2bc],[3,3,3,.68,0xd0e7ff],[1,4,-3,2.3,0xffdf9e]]) {
        const light = new THREE.DirectionalLight(color, intensity);
        light.position.set(x,y,z);
        scene.add(light);
    }

    let disposed = false;
    let ready = false;
    let mixer: THREE.AnimationMixer | undefined;
    let active: THREE.AnimationAction | undefined;
    let target: CuePose = 'listen';
    const actions = new Map<CuePose, THREE.AnimationAction>();
    function play(pose: CuePose, replay = false) {
        target = pose;
        const next = actions.get(pose);
        if (!next || (next === active && !replay)) return;
        next.reset().setEffectiveWeight(1).play();
        if (active && next !== active) {
            const slow = ['fold','consider','lean'].includes(pose)
                || ['fold','consider','lean'].includes(active.getClip().name);
            active.crossFadeTo(next, slow ? .78 : .34, false);
        }
        active = next;
    }

    function release(model: THREE.Object3D) {
        const geometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        model.traverse(node => {
            if (node instanceof THREE.Mesh) {
                geometries.add(node.geometry);
                for (const material of [node.material].flat()) materials.add(material);
            }
        });
        geometries.forEach(item => item.dispose());
        materials.forEach(item => item.dispose());
    }

    const observer = new ResizeObserver(() => {
        const { clientWidth: width, clientHeight: height } = canvas;
        if (!width || !height) return;
        camera.right = Math.max(1.48 * width / height, 1.47);
        camera.left = -camera.right;
        camera.top = camera.right * height / width;
        camera.bottom = -camera.top;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        ink.resize(width,height);
    });
    observer.observe(canvas);
    const fail = () => { if (!disposed) onFailure(); };
    canvas.addEventListener('webglcontextlost', fail);
    new GLTFLoader().load('/interviewer/cue.glb?v=7', gltf => {
        if (disposed) { release(gltf.scene); return; }
        scene.add(gltf.scene);
        const timeline = gltf.animations[0];
        if (!timeline) { fail(); return; }
        mixer = new THREE.AnimationMixer(gltf.scene);
        // The exporter samples Blender frames 1, 3, 5... at frame / 24 seconds.
        // Exclude the preceding pose at the beginning of an even-numbered range.
        function action(pose: CuePose, first: number, last: number) {
            const clip = THREE.AnimationUtils.subclip(timeline, pose, first - .1, last + .1, 24);
            const item = mixer!.clipAction(clip);
            actions.set(pose, item);
            return item;
        }
        action('listen', 1, 97);
        action('speak', 98, 242);
        const invite = action('invite', 244, 292);
        action('focus', 294, 474);
        action('fold', 476, 594);
        action('explain', 596, 740);
        action('lean', 742, 886);
        action('consider', 888, 1020);
        const after = new Map<THREE.AnimationAction, CuePose>([
            [invite, 'listen'], [action('yawn', 1022, 1130), 'listen'],
            [action('stretch', 1132, 1276), 'listen'], [action('offer', 1278, 1336), 'listen'],
            [action('attend', 1338, 1432), 'focus'], [action('pinpoint', 1434, 1530), 'speak']
        ]);
        for (const gesture of after.keys()) {
            gesture.setLoop(THREE.LoopOnce, 1);
            gesture.clampWhenFinished = true;
        }
        mixer.addEventListener('finished', event => {
            const continuation = after.get(event.action);
            if (event.action === active && continuation) play(continuation);
        });
        play(target);
        let lastFrame = 0;
        renderer.setAnimationLoop((now: number) => {
            if (document.hidden || now - lastFrame < 1000 / 30) return;
            mixer!.update(Math.min((now - lastFrame) / 1000, .08));
            lastFrame = now;
            ink.render(scene, camera);
            if (!ready) { ready = true; onReady(); }
        });
    }, undefined, fail);
    return {
        play,
        dispose() {
            disposed = true;
            observer.disconnect();
            canvas.removeEventListener('webglcontextlost', fail);
            renderer.setAnimationLoop(null);
            mixer?.stopAllAction();
            release(scene);
            environment.dispose();
            ink.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
        }
    };
}
