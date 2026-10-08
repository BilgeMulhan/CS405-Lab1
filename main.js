// CS405 · Lab 1 — your first triangle in WebGPU (starter)
// Work through the TODOs in order. After each one, check the matching
// checkpoint on the lab slides. The reference solution is in ../lab1-solution/.

const canvas = document.querySelector('canvas');

// ---------------------------------------------------------------------------
// TODO 1 — get a device and configure the canvas
// ---------------------------------------------------------------------------

if (!navigator.gpu) {
  throw new Error('WebGPU not available');
}

const adapter = await navigator.gpu.requestAdapter();

if (!adapter) {
  throw new Error('No appropriate GPUAdapter found');
}

const device = await adapter.requestDevice();

const ctx = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();

ctx.configure({
  device,
  format,
  alphaMode: 'opaque'
});

console.log('WebGPU ready:', format);


// ---------------------------------------------------------------------------
// TODO 2 + TODO 3 + TODO 4 + TODO 5
// Shader:
// - two triangles form a square
// - each vertex has a colour
// - time uniform rotates the square
// - aspect ratio keeps the square from stretching
// - mouse position moves the square
// ---------------------------------------------------------------------------

const SHADER = `
  struct U {
    time: f32,
    aspect: f32,
    mouse: vec2f
  };

  @group(0) @binding(0)
  var<uniform> u: U;

  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) colour: vec4f
  };

  @vertex
  fn vs(@builtin(vertex_index) i: u32) -> VSOut {

    // Two triangles = one square
    var p = array<vec2f, 6>(
      vec2f(-0.30,  0.30),
      vec2f(-0.30, -0.30),
      vec2f( 0.30,  0.30),

      vec2f( 0.30,  0.30),
      vec2f(-0.30, -0.30),
      vec2f( 0.30, -0.30)
    );

    // One colour for every vertex
    var c = array<vec3f, 6>(
      vec3f(1.0, 0.0, 0.0),
      vec3f(0.0, 1.0, 0.0),
      vec3f(0.0, 0.0, 1.0),

      vec3f(0.0, 0.0, 1.0),
      vec3f(0.0, 1.0, 0.0),
      vec3f(1.0, 1.0, 0.0)
    );

    // Rotate according to time
    let a = u.time;

    var q = vec2f(
      p[i].x * cos(a) - p[i].y * sin(a),
      p[i].x * sin(a) + p[i].y * cos(a)
    );

    // Correct aspect ratio
    q.x = q.x / u.aspect;

    var out: VSOut;

    // Move the square with the mouse
    out.pos = vec4f(q + u.mouse, 0.0, 1.0);

    out.colour = vec4f(c[i], 1.0);

    return out;
  }

  @fragment
  fn fs(in: VSOut) -> @location(0) vec4f {
    return in.colour;
  }
`;


// ---------------------------------------------------------------------------
// TODO 2 — create shader module and render pipeline
// ---------------------------------------------------------------------------

const module = device.createShaderModule({
  code: SHADER
});

const pipeline = device.createRenderPipeline({
  layout: 'auto',

  vertex: {
    module,
    entryPoint: 'vs'
  },

  fragment: {
    module,
    entryPoint: 'fs',
    targets: [
      {
        format
      }
    ]
  },

  primitive: {
    topology: 'triangle-list'
  }
});


// ---------------------------------------------------------------------------
// TODO 4 — uniform buffer
//
// Uniform contents:
//
// time   = 1 float = 4 bytes
// aspect = 1 float = 4 bytes
// mouse  = 2 floats = 8 bytes
//
// Total = 16 bytes
// ---------------------------------------------------------------------------

const ubuf = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

const bind = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),

  entries: [
    {
      binding: 0,
      resource: {
        buffer: ubuf
      }
    }
  ]
});


// ---------------------------------------------------------------------------
// TODO 5 — mouse position
// ---------------------------------------------------------------------------

let mouseX = 0;
let mouseY = 0;

canvas.addEventListener('mousemove', (e) => {

  const rect = canvas.getBoundingClientRect();

  // Browser coordinates -> WebGPU clip-space coordinates
  mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;

  mouseY =
    -(((e.clientY - rect.top) / rect.height) * 2 - 1);
});


// ---------------------------------------------------------------------------
// Animation start time
// ---------------------------------------------------------------------------

const t0 = performance.now();


// ---------------------------------------------------------------------------
// Resize canvas
// ---------------------------------------------------------------------------

function resize() {

  const dpr =
    Math.min(2, window.devicePixelRatio || 1);

  const r =
    canvas.getBoundingClientRect();

  canvas.width =
    Math.round(r.width * dpr);

  canvas.height =
    Math.round(r.height * dpr);
}

window.addEventListener('resize', resize);

resize();


// ---------------------------------------------------------------------------
// Main render loop
// ---------------------------------------------------------------------------

function frame() {

  // Time in seconds
  const t =
    (performance.now() - t0) * 0.001;

  // Canvas aspect ratio
  const aspect =
    canvas.width / canvas.height;

  // Send data from JavaScript to the GPU
  device.queue.writeBuffer(
    ubuf,
    0,
    new Float32Array([
      t,
      aspect,
      mouseX,
      mouseY
    ])
  );


  // Create command encoder
  const enc =
    device.createCommandEncoder();


  // Start render pass
  const pass =
    enc.beginRenderPass({

      colorAttachments: [
        {
          view:
            ctx.getCurrentTexture()
               .createView(),

          clearValue: {
            r: 0.19,
            g: 0.20,
            b: 0.60,
            a: 1
          },

          loadOp: 'clear',
          storeOp: 'store'
        }
      ]

    });


  // Tell WebGPU which pipeline to use
  pass.setPipeline(pipeline);


  // Bind uniform buffer
  pass.setBindGroup(0, bind);


  // 6 vertices = two triangles = one square
  pass.draw(6);


  // Finish render pass
  pass.end();


  // Submit commands to GPU
  device.queue.submit([
    enc.finish()
  ]);


  // Draw again on next frame
  requestAnimationFrame(frame);
}


// Start animation
frame();