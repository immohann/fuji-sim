#version 300 es

out vec2 vUv;

/**
 * Fullscreen quad with no vertex buffer at all: four vertices in a triangle
 * strip, positions derived from gl_VertexID. One less thing to allocate and
 * one less thing to leak.
 */
void main() {
  vec2 v = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(v - 1.0, 0.0, 1.0);
  // Flip V: image data uploads top-down, GL samples bottom-up.
  vUv = vec2(v.x * 0.5, 1.0 - v.y * 0.5);
}
