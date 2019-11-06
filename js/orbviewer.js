if ( WEBGL.isWebGLAvailable() === false ) {
    document.body.appendChild( WEBGL.getWebGLErrorMessage() );
}

let container;
let camera, scene, renderer;
const scale = 1;
let controls;
let stats;
let sprite;
let raycaster;
let mouse;
let sphere;
let pointsSet = [];
let dragFlag = 0;
let controlState = 0;
let tween;
let orbitLine = null;
let server = true;

// size of the solar system
// TODO: pull this from somewhere and make the server generate it.
const minX = -1.0993153024260256e+10 / scale;
const maxX = 1.1259105381765476e+10 / scale;
const minY = -8.336972753734525e+09 / scale;
const maxY = 1.1216725295000006e+10 / scale;
const minZ = -5.482463379824468e+09 / scale;
const maxZ = 4.381383003697839e+09 / scale;

init();

function init() {

    
    document.addEventListener( 'mousemove', onDocumentMouseMove, false );
    container = document.getElementById( 'container' );
    container.addEventListener('click', onCanvasClick, false);
    container.addEventListener("mousedown", function(){
        dragFlag = 0;
    }, false);

    renderer = new THREE.WebGLRenderer( { antialias: true, logarithmicDepthBuffer: true } );

    renderer.vr.enabled = true;
    // HACK because vr does not play well with orbit controls
    if (!renderer.vr._origGetCamera) renderer.vr._origGetCamera = renderer.vr.getCamera;

    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    container.appendChild( renderer.domElement );

    stats = new Stats();
    container.appendChild( stats.dom );

    let vrButton = WEBVR.createButton(renderer);
    if (vrButton) {
        document.body.appendChild(vrButton);
    }

    camera = new THREE.PerspectiveCamera( 90, window.innerWidth / window.innerHeight, 3, 100000 );
    camera.position.z = 60;

    window.addEventListener('vrdisplaypresentchange', () => {
        camera.position.z = 60;
    });

    controls = new THREE.OrbitControls( camera );

    scene = new THREE.Scene();
    scene.background = new THREE.Color( 0x000005 );
    scene.fog = new THREE.Fog( 0x000005, 90000, 100000 );
    camera.lookAt(scene.position);

    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 10;

    mouse = new THREE.Vector2();

    THREE.Cache.enabled = true;

    sprite = new THREE.TextureLoader().load( 'img/particle2.png' );

    for (let i = 0; i < 1; i++) {
        loadDataBatch(i);
    }


    // Create ray cast target sphere:
    /*sphere = new THREE.Mesh(
        new THREE.SphereBufferGeometry( 0.1, 12, 12 ),
        new THREE.MeshBasicMaterial( { color: 0xff0000 } )
    );
    scene.add( sphere );*/

    animate();
}

function loadDataBatch(batch) {
    loadData(
        "data/data-" + batch + ".csv",
        new THREE.PointsMaterial( {
            size: 6,
            vertexColors: THREE.VertexColors,
            map: sprite,
            blending: THREE.AdditiveBlending,
            depthTest: true,
            transparent: false,
            alphaTest: 0.5,
            fog: false,
            lights: false,
            sizeAttenuation: false
        } ),
        THREE.Points,
        true
    );
}

function loadData(name, mat, T, raytarget) {
    let loader = new THREE.FileLoader();
    
    //load a text file and output the result to the console
    loader.load(
        // resource URL
        name,
        // onLoad callback
        function ( data ) {
            const bits = createGeom(data);
            const positions = bits[0];
            const colors = bits[1];
            const ids = bits[2];
            const temps = bits[3];
            const sizes = bits[4];

            const geometry = new THREE.BufferGeometry();
            geometry.addAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
            geometry.addAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
            geometry.computeBoundingSphere();

            const points = new T( geometry, mat);
            if (ids.length > 0) {
                points.userData = {IDS: ids, Temps: temps, Sizes: sizes};
            }
            if(raytarget){
                pointsSet.push(points);
            }
            scene.add( points );
            console.log( "loaded " + name)
        },

        // onProgress callback
        function ( xhr ) {
            //c onsole.log( name + ": " + (xhr.loaded / xhr.total * 100) + '% loaded ' );
        },

        // onError callback
        function ( err ) {
            console.error( 'An error happened loading ' + name + ' ' + err);
        }
    );
}

function createGeom(data) {
    let positions = [];
    let colors = [];
    let ids = [];
    let temps = [];
    let sizes = [];
    const lines = data.split(/\r?\n/);
    const n = lines.length;
    for (let i = 0; i < n; i++) {
        if (lines[i] !== "") {
            let parts = lines[i].split(",");
            
            let x = parseFloat(parts[0]);
            let y = parseFloat(parts[1]);
            let z = parseFloat(parts[2]);
            let id = parts[3];
            let size = parseFloat(parts[4]);
            let temp = parseFloat(parts[5]);

            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                console.log("could not decode " + lines[i] + " line " + i);
                continue;
            }

            x = x / scale;
            y = y / scale;
            z = z / scale;
            positions.push( x, z, y ); // swap z and y around so we get more intuitive controls

            let c = mapToColour(x, y, z, temp);   
            colors.push(c[0], c[1], c[2]);

            ids.push(id);
            temps.push(temp);
            sizes.push(size);

        }
    }
    return [positions, colors, ids, temps, sizes];
}

function raycastCheck() {
    raycaster.setFromCamera( mouse, camera );
    let intersections = raycaster.intersectObjects(pointsSet);
    intersections.sort((a,b) => (a.distanceToRay > b.distanceToRay ? 1: -1))
    const intersection = ( intersections.length ) > 0 ? intersections[ 0 ] : null;
    
    if ( intersection !== null) {
        const objectID = intersection.object.userData.IDS[intersection.index];
        const temp = intersection.object.userData.Temps[intersection.index];
        const size = intersection.object.userData.Sizes[intersection.index];

        console.log("clicked on " + objectID );

        const linkTag = document.getElementById("clickLabel");
        linkTag.innerHTML = objectID + "<br>Effective Temp: " + temp + "k<br>Size: " + size + " sun radius'";
    }
}

function needsResize(canvas) {
    if (canvas.lastWidth !== canvas.clientWidth || canvas.lastHeight !== canvas.clientHeight) {
        canvas.width = canvas.lastWidth = canvas.clientWidth;
        canvas.height = canvas.lastHeight = canvas.clientHeight;
        return true;
    }
}

function onDocumentMouseMove( event ) {
    event.preventDefault();
    mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
    mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
    dragFlag = 1;                
}

function onCanvasClick() {
    if (dragFlag === 0) {
        raycastCheck();
    }  
    dragFlag = 0
}

function resize() {
    if (needsResize(container)) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
    }
}

function animate(time) {
    if (!renderer.domElement.parentElement) {
        return;
    }
    requestAnimationFrame(animate);
    resize();
    // if vr is enabled three will handle the controls for us.
    if (renderer.vr.isPresenting()) {
        renderer.vr.getCamera = renderer.vr._origGetCamera;
    } else {
        if (controlState === 0) {
            controls.update();
        } else {
            tween.update(time);
        }
        renderer.vr.getCamera = () => camera;
    }

    stats.update();
    render();
}

function render() {
    renderer.render( scene, camera );
}

function toggleTour() {
    if (controlState === 0) {
        controlState = 1;
        setupMove();
    } else {
        controlState = 0;
        tween.stop();
        controls.update();
    }

}

function setupMove() {
    let targetPos = pickPosition();
    let startPos = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z
    };

    console.log("moving from: " + startPos.x + "," + startPos.y + "," +startPos.z + " to: " + targetPos.x + "," + targetPos.y + "," +targetPos.z );

    tween = new TWEEN.Tween(startPos)
        .to(targetPos, 10000)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(function() {
            camera.position.set(startPos.x, startPos.y, startPos.z);
            camera.lookAt(scene.position);
            controls.update();
        })
        .onComplete(setupMove)
        .start();

}

function pickPosition() {
    // pick a number between +-90 normal distribution
    let lat = (randomNumber(45) + randomNumber(45)) - 90;

    // pick a number between +-180 liner distribution
    let lon = randomNumber(360) - 180;

    // convert these two angles to a point on a sphere somewhere near the edge of the solar system.
    const R = 100;
    return {
        x: R * Math.cos(lat) * Math.cos(lon),
        y: R * Math.cos(lat) * Math.sin(lon),
        z: R * Math.sin(lat)
    };
}

function randomNumber(max) {
    return Math.floor(Math.random() * max)
}


function mapToColour(x, y, z, temp) {

    const rs = 1;
    const gs = 0;
    const bs = 0;

    const re = 0;
    const ge = 0;
    const be = 1;

    const minTemp = 0;
    const maxTemp = 25200;

    let t = temp / (maxTemp - minTemp);

    let r = (1-t) * rs + t * re + 0.5;
    let g = (1-t) * gs + t * ge + 0.5;
    let b = (1-t) * bs + t * be + 0.5;

    return [r, g, b]
}
