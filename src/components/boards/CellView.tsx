'use client';

import { useEffect, useRef } from 'react';
import { useT } from '@/lib/i18n';

const T = {
  en: { label: 'Inspection bay layout, schematic', container: 'Container pad', gantry: 'Scanner gantry', drone: 'Drone pad', officer: 'Officer station' },
  ar: { label: 'مخطط ساحة الفحص', container: 'منصة الحاوية', gantry: 'بوابة الماسح', drone: 'منصة الطائرة المسيّرة', officer: 'محطة الضابط' },
};

const SWEEP_MS = 3600;
type ThreeColor = import('three').Color;
type ThreeMaterial = import('three').Material;

/**
 * Schematic of the inspection bay drawn with three.js in an orthographic view. It is a layout drawing, not a
 * simulation: the scanner head sweeps once each time `pulse` changes, and otherwise the scene is still.
 */
export function CellView({ pulse }: { pulse: number }) {
  const t = useT(T);
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import('three');
      if (disposed) return;
      const css = getComputedStyle(document.documentElement);
      const col = (v: string) => new THREE.Color(css.getPropertyValue(v).trim() || '#888');
      const ink = col('--ink'), line = col('--line'), accent = col('--stamp'), faint = col('--faint');
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const scene = new THREE.Scene();
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      el.appendChild(renderer.domElement);
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.display = 'block';

      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
      cam.position.set(14, 11, 15.6);
      cam.lookAt(0, 0.4, 1.6);

      const mat = (c: ThreeColor, o = 1) => new THREE.LineBasicMaterial({ color: c, transparent: o < 1, opacity: o });
      const box = (w: number, h: number, d: number, c: ThreeColor, x: number, y: number, z: number, o = 1) => {
        const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
        const m = new THREE.LineSegments(g, mat(c, o));
        m.position.set(x, y + h / 2, z);
        scene.add(m);
        return m;
      };

      // Ground grid
      const grid = new THREE.GridHelper(20, 20, line, line);
      (grid.material as ThreeMaterial).transparent = true;
      (grid.material as ThreeMaterial).opacity = 0.7;
      scene.add(grid);

      // Container pad and container
      box(8, 0.05, 3.4, faint, 0, 0, 0, 0.9);
      box(6.1, 2.6, 2.44, ink, 0, 0.05, 0);
      for (let i = -2; i <= 2; i++) {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i * 1.2, 0.05, 1.22), new THREE.Vector3(i * 1.2, 2.65, 1.22)]);
        scene.add(new THREE.Line(g, mat(faint, 0.6)));
      }

      // Gantry: two portal frames and a rail
      const frame = (x: number) => {
        box(0.2, 4, 0.2, ink, x, 0, -2.1);
        box(0.2, 4, 0.2, ink, x, 0, 2.1);
        box(0.2, 0.2, 4.4, ink, x, 3.9, 0);
      };
      frame(-3.8);
      frame(3.8);
      box(7.8, 0.15, 0.15, ink, 0, 3.95, 0);
      const head = box(0.7, 0.5, 0.7, accent, -3.4, 3.2, 0);
      const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -3.1, 0)]);
      const beam = new THREE.Line(beamGeo, mat(accent));
      beam.visible = false;
      head.add(beam);
      beam.position.y = -0.1;

      // Drone pad
      const ring = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 49 }, (_, i) => new THREE.Vector3(Math.cos((i / 48) * Math.PI * 2) * 1.5, 0.02, Math.sin((i / 48) * Math.PI * 2) * 1.5)));
      const ringLine = new THREE.Line(ring, mat(ink));
      ringLine.position.set(-6.5, 0, 5.2);
      scene.add(ringLine);
      box(0.9, 0.12, 0.9, ink, -6.5, 0, 5.2);

      // Officer station
      box(2.2, 1.1, 1.2, ink, 6.4, 0, 5.4);
      box(1.2, 0.05, 0.7, faint, 6.4, 1.1, 5.4);

      const size = () => {
        const w = el.clientWidth, h = Math.max(220, Math.min(380, el.clientWidth * 0.42));
        renderer.setSize(w, h);
        const k = 6.6, a = w / h;
        cam.left = -k * a; cam.right = k * a; cam.top = k; cam.bottom = -k;
        cam.updateProjectionMatrix();
        renderer.render(scene, cam);
      };
      const ro = new ResizeObserver(size);
      ro.observe(el);
      size();

      let raf = 0;
      let start = 0;
      const tick = (now: number) => {
        const p = (now - start) / SWEEP_MS;
        if (p >= 1) {
          head.position.x = -3.4;
          beam.visible = false;
          renderer.render(scene, cam);
          return;
        }
        const e = p < 0.5 ? p * 2 : 2 - p * 2;
        head.position.x = -3.4 + 6.8 * e;
        beam.visible = true;
        renderer.render(scene, cam);
        raf = requestAnimationFrame(tick);
      };
      trigger.current = () => {
        cancelAnimationFrame(raf);
        if (reduce) {
          beam.visible = true;
          head.position.x = 0;
          renderer.render(scene, cam);
          setTimeout(() => { beam.visible = false; head.position.x = -3.4; renderer.render(scene, cam); }, 1200);
          return;
        }
        start = performance.now();
        raf = requestAnimationFrame(tick);
      };

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        scene.traverse((o) => {
          const m = o as import('three').Mesh;
          m.geometry?.dispose?.();
          const mt = m.material as ThreeMaterial | ThreeMaterial[] | undefined;
          if (Array.isArray(mt)) mt.forEach((x) => x.dispose()); else mt?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      disposed = true;
      trigger.current = null;
      cleanup();
    };
  }, []);

  const seen = useRef(pulse);
  useEffect(() => {
    if (seen.current === pulse) return;
    seen.current = pulse;
    trigger.current?.();
  }, [pulse]);

  return (
    <figure className="panel overflow-hidden" aria-label={t('label')}>
      <div ref={host} className="w-full" style={{ minHeight: 220 }} />
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-2 text-[0.85rem] text-muted">
        <span>{t('label')}</span>
        <span>{t('container')}</span>
        <span>{t('gantry')}</span>
        <span>{t('drone')}</span>
        <span>{t('officer')}</span>
      </figcaption>
    </figure>
  );
}
