import * as THREE from 'three';

/** Composite ink after posing, so one outline follows the whole skinned silhouette. */
export function createArcadeInk(renderer: THREE.WebGLRenderer) {
    const target = new THREE.WebGLRenderTarget(1, 1, {
        type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType,
        depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType)
    });
    const pixel = new THREE.Vector2(1, 1);
    const material = new THREE.ShaderMaterial({
        uniforms: { picture: { value: target.texture }, depthMap: { value: target.depthTexture }, pixel: { value: pixel } },
        depthTest: false, depthWrite: false, blending: THREE.NoBlending,
        vertexShader: `
            varying vec2 at;
            void main() { at = uv; gl_Position = vec4(position.xy, 0., 1.); }
        `,
        fragmentShader: `
            uniform sampler2D picture, depthMap;
            uniform vec2 pixel;
            varying vec2 at;
            float luma(vec3 c) { return dot(c, vec3(.2126,.7152,.0722)); }
            void main() {
                vec4 centre = texture2D(picture, at);
                float depth = texture2D(depthMap, at).r;
                float outer = centre.a, overlap = 0., contrast = 0.;
                for (int i=0; i<8; i++) {
                    float a = float(i)*.78539816;
                    vec2 stepUV = pixel * vec2(cos(a),sin(a));
                    outer = max(outer, texture2D(picture, at + stepUV*2.35).a);
                    vec2 nearUV = at + stepUV*1.2;
                    vec4 nearColor = texture2D(picture, nearUV);
                    overlap = max(overlap, (texture2D(depthMap,nearUV).r-depth)*nearColor.a);
                    contrast = max(contrast, (luma(nearColor.rgb)-luma(centre.rgb))*nearColor.a);
                }
                gl_FragColor = vec4(centre.rgb/max(centre.a,.001),1.);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                vec3 color = gl_FragColor.rgb;
                float light = luma(color);
                float band = floor(light*6.) + smoothstep(.36,.68,fract(light*6.));
                color *= mix(1., (band/6.+.035)/(light+.035), .52);
                color = mix(vec3(luma(color)), color, 1.16);
                vec3 ink = vec3(.075,.083,.105);
                float interior = max(.86*smoothstep(.004,.015,overlap),
                                     .55*smoothstep(.10,.42,contrast));
                color = mix(color,ink,interior);
                // The canvas uses premultiplied alpha and sits on the real CSS stage.
                gl_FragColor = vec4(color*centre.a + ink*max(0.,outer-centre.a),outer);
            }
        `
    });
    const screen = new THREE.Scene();
    const quad = new THREE.PlaneGeometry(2,2);
    screen.add(new THREE.Mesh(quad, material));
    const ortho = new THREE.Camera();
    const size = new THREE.Vector2();
    return {
        resize(width: number, height: number) {
            renderer.getDrawingBufferSize(size);
            target.setSize(size.x,size.y);
            pixel.set(1/width,1/height);
        },
        render(scene: THREE.Scene, camera: THREE.Camera) {
            renderer.setRenderTarget(target);
            renderer.render(scene,camera);
            renderer.setRenderTarget(null);
            renderer.render(screen,ortho);
        },
        dispose() { target.dispose(); quad.dispose(); material.dispose(); }
    };
}
