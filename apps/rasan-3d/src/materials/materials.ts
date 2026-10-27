// Shared material recipes. Soft matte clay with sheen for mascots, felt, glossy eyes, brass.

import * as THREE from 'three';
import { feltTexture, noiseTexture } from './textures';

export interface MaterialOptions {
  wireframe?: boolean;
}

/** Premium "vinyl-clay" skin: matte, a soft sheen at grazing angles, a touch of clearcoat. */
export function clayMaterial(color: string, sheen: string, opts: MaterialOptions & { vertexColors?: boolean } = {}) {
  const bump = noiseTexture(512, 11, 5, 0.8);
  bump.repeat.set(3, 3);
  return new THREE.MeshPhysicalMaterial({
    color,
    vertexColors: opts.vertexColors ?? false,
    roughness: 0.72,
    roughnessMap: noiseTexture(256, 3, 4, 0.5),
    bumpMap: bump,
    bumpScale: 0.25,
    sheen: 0.45,
    sheenColor: new THREE.Color(sheen),
    sheenRoughness: 0.5,
    specularIntensity: 0.35,
    wireframe: opts.wireframe,
  });
}

export function feltMaterial(color: string, sheen: string, opts: MaterialOptions = {}) {
  const t = feltTexture();
  t.repeat.set(6, 6);
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.9,
    bumpMap: t,
    bumpScale: 0.35,
    sheen: 1,
    sheenColor: new THREE.Color(sheen),
    sheenRoughness: 0.55,
    wireframe: opts.wireframe,
  });
}

export function glossyBlack(opts: MaterialOptions = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: '#08080a',
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    wireframe: opts.wireframe,
  });
}

export function matteDark(color: string, opts: MaterialOptions = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.5, wireframe: opts.wireframe });
}

export function brassMaterial(color: string, opts: MaterialOptions = {}) {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 0.9, roughness: 0.3, wireframe: opts.wireframe });
}

export function highlightMaterial() {
  return new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, opacity: 0.55 });
}
