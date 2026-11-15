// All lengths are centimetres. The cup stands on the table at y = 0 with its
// axis on Y; +Z points towards the default camera, +X to the viewer's right.

// Fitted to the painting's silhouette (2.7 px RMS over the wall edges and rim),
// taking a 9 cm rim as the scale. A heavy-based tumbler of this class measures
// 88-97 mm tall with a 90-97 mm rim and 60-65 mm foot.
export const cup = Object.freeze({
  rimRadius: 4.5,
  baseRadius: 3.546,
  height: 8.4526,
  slope: (4.5 - 3.546) / 8.4526,
  wall: 0.17,
  floor: 0.86,
  heel: 0.46,
  innerFillet: 0.72,
  lipRadius: 0.078
});

export const referenceCamera = Object.freeze({
  position: [-0.0725, 37.4711, 109.982],
  target: [-0.0725, 4.7638, 0],
  focalPx: 10473.5,
  framePx: 1280
});

// Soda-lime glass and water, with a little dispersion left out on purpose.
export const optics = Object.freeze({ glass: 1.52, gel: 1.333 });

// Domain of the baked distance field.
export const fieldBox = Object.freeze({
  min: [-4.75, 0.70, -4.75],
  max: [4.75, 10.95, 4.75],
  voxel: 0.04
});

export const srgbToLinear = value =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

export const hexToLinear = hex => [hex >> 16 & 255, hex >> 8 & 255, hex & 255]
  .map(channel => srgbToLinear(channel / 255));

export const glslColor = hex =>
  `vec3(${hexToLinear(hex).map(value => value.toFixed(5)).join(',')})`;

// Sampled directly from the painting.
export const palette = Object.freeze({
  backdrop: 0xE6F0F4,
  body: 0xD9E7F4,
  bodyLight: 0xE6F0F9,
  shadow: 0xBDD8F0,
  shadowDeep: 0xA9C6E6,
  cyan: 0xB5E4FF,
  cyanDeep: 0x6FC0F5,
  periwinkle: 0xA7C3E8,
  pad: 0x9CC0E6,
  toe: 0x95C3E6,
  navy: 0x0E2A4A,
  steel: 0x6591BB,
  white: 0xFEFDFE,
  eyeTop: 0x749EC7,
  eyeMid: 0x7DACDD,
  eyeLow: 0x9FBAD3,
  nose: 0x8EB3D3
});
