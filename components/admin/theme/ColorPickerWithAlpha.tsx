"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getHexAlpha01,
  hsvToRgb,
  hexToRgb,
  rgbToHex,
  rgbToHsv,
  setHexAlpha01,
  THEME_HEX_6_OR_8_RE,
} from './colorUtils';

export function ColorPickerWithAlpha({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string;
  onChange: (hex8: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const draggingSV = useRef(false);
  const draggingHue = useRef(false);
  const draggingAlpha = useRef(false);

  const rgb = hexToRgb(value);
  const hsv = rgbToHsv(...rgb);
  const alpha01 = getHexAlpha01(value);

  const [localH, setLocalH] = useState(hsv.h);
  const [localS, setLocalS] = useState(hsv.s);
  const [localV, setLocalV] = useState(hsv.v);
  const [localA, setLocalA] = useState(alpha01);
  const [hexInput, setHexInput] = useState(value);

  const prevValue = useRef(value);
  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value;
      const r2 = hexToRgb(value);
      const h2 = rgbToHsv(...r2);
      setLocalH(h2.h);
      setLocalS(h2.s);
      setLocalV(h2.v);
      setLocalA(getHexAlpha01(value));
      setHexInput(value);
    }
  }, [value]);

  const emit = useCallback(
    (h: number, s: number, v: number, a: number) => {
      const [r, g, b] = hsvToRgb(h, s, v);
      let hex = rgbToHex(r, g, b);
      hex = setHexAlpha01(hex, a);
      setHexInput(hex);
      onChange(hex);
    },
    [onChange],
  );

  useEffect(() => {
    const cv = svCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;
    const w = cv.width,
      h = cv.height;

    const [hr, hg, hb] = hsvToRgb(localH, 1, 1);
    ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
    ctx.fillRect(0, 0, w, h);

    const white = ctx.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, 'rgba(255,255,255,1)');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, w, h);

    const black = ctx.createLinearGradient(0, 0, 0, h);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, w, h);
  }, [localH, open]);

  const applySV = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const cv = svCanvasRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      setLocalS(s);
      setLocalV(v);
      emit(localH, s, v, localA);
    },
    [localH, localA, emit],
  );

  const applyHue = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const bar = (e.currentTarget ?? e.target) as HTMLElement;
      const rect = bar.getBoundingClientRect();
      const h = Math.max(0, Math.min(359.99, ((e.clientX - rect.left) / rect.width) * 360));
      setLocalH(h);
      emit(h, localS, localV, localA);
    },
    [localS, localV, localA, emit],
  );

  const applyAlpha = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const bar = (e.currentTarget ?? e.target) as HTMLElement;
      const rect = bar.getBoundingClientRect();
      const a = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setLocalA(a);
      emit(localH, localS, localV, a);
    },
    [localH, localS, localV, emit],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (draggingSV.current) {
        const cv = svCanvasRef.current;
        if (!cv) return;
        const rect = cv.getBoundingClientRect();
        const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
        setLocalS(s);
        setLocalV(v);
        emit(localH, s, v, localA);
      }
      if (draggingHue.current) {
        const bar = document.getElementById('cpwa-hue-bar');
        if (!bar) return;
        const rect = bar.getBoundingClientRect();
        const h = Math.max(0, Math.min(359.99, ((e.clientX - rect.left) / rect.width) * 360));
        setLocalH(h);
        emit(h, localS, localV, localA);
      }
      if (draggingAlpha.current) {
        const bar = document.getElementById('cpwa-alpha-bar');
        if (!bar) return;
        const rect = bar.getBoundingClientRect();
        const a = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setLocalA(a);
        emit(localH, localS, localV, a);
      }
    };
    const onUp = () => {
      draggingSV.current = false;
      draggingHue.current = false;
      draggingAlpha.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [localH, localS, localV, localA, emit]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const reposition = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const panelW = 272;
      const panelH = panelRef.current?.offsetHeight ?? 275;
      const gap = 4;
      let top = r.bottom + gap;
      let left = r.left;
      if (top + panelH > window.innerHeight) top = r.top - panelH - gap;
      if (left + panelW > window.innerWidth) left = window.innerWidth - panelW - 8;
      if (left < 4) left = 4;
      setPos({ top, left });
    };
    reposition();
    const raf = requestAnimationFrame(reposition);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const previewRgb = hsvToRgb(localH, localS, localV);
  const previewHex = rgbToHex(...previewRgb);

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
          className="w-[272px] rounded-xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="relative mb-3 h-[160px] w-full overflow-hidden rounded-lg" style={{ cursor: 'crosshair' }}>
            <canvas
              ref={svCanvasRef}
              width={256}
              height={160}
              className="h-full w-full rounded-lg"
              onPointerDown={(e) => {
                draggingSV.current = true;
                applySV(e as unknown as PointerEvent);
              }}
            />
            <div
              className="pointer-events-none absolute h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{
                left: `${localS * 100}%`,
                top: `${(1 - localV) * 100}%`,
                background: previewHex,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4)',
              }}
            />
          </div>

          <div
            id="cpwa-hue-bar"
            className="relative mb-2 h-3 w-full cursor-pointer rounded-full"
            style={{
              background:
                'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
            }}
            onPointerDown={(e) => {
              draggingHue.current = true;
              applyHue(e);
            }}
          >
            <div
              className="pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{
                left: `${(localH / 360) * 100}%`,
                background: `hsl(${localH}, 100%, 50%)`,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4)',
              }}
            />
          </div>

          <div
            className="relative mb-3 h-3 w-full cursor-pointer overflow-hidden rounded-full"
            id="cpwa-alpha-bar"
            style={{
              backgroundImage:
                `linear-gradient(to right, rgba(${previewRgb[0]},${previewRgb[1]},${previewRgb[2]},0), rgba(${previewRgb[0]},${previewRgb[1]},${previewRgb[2]},1)), ` +
                'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)',
              backgroundSize: '100% 100%, 8px 8px',
            }}
            onPointerDown={(e) => {
              draggingAlpha.current = true;
              applyAlpha(e);
            }}
          >
            <div
              className="pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{
                left: `${localA * 100}%`,
                background: `rgba(${previewRgb[0]},${previewRgb[1]},${previewRgb[2]},${localA})`,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4)',
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 shrink-0 rounded-md border border-gray-300 dark:border-gray-600"
              style={{
                backgroundImage:
                  `linear-gradient(${previewHex}${Math.round(localA * 255)
                    .toString(16)
                    .padStart(2, '0')}, ${previewHex}${Math.round(localA * 255)
                    .toString(16)
                    .padStart(2, '0')}), ` +
                  'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)',
                backgroundSize: '100% 100%, 8px 8px',
              }}
            />
            <input
              type="text"
              className="h-8 flex-1 rounded-md border border-gray-300 bg-transparent px-2 font-mono text-xs dark:border-gray-600"
              value={hexInput}
              onChange={(e) => {
                const v = e.target.value;
                setHexInput(v);
                if (THEME_HEX_6_OR_8_RE.test(v)) {
                  const r2 = hexToRgb(v);
                  const h2 = rgbToHsv(...r2);
                  setLocalH(h2.h);
                  setLocalS(h2.s);
                  setLocalV(h2.v);
                  setLocalA(getHexAlpha01(v));
                  onChange(v);
                }
              }}
              spellCheck={false}
            />
            <span className="shrink-0 text-xs text-gray-500">{Math.round(localA * 100)}%</span>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="flex items-center gap-2">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="group relative h-8 w-8 shrink-0 rounded-md border border-gray-300 transition-shadow hover:ring-2 hover:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
        style={{
          backgroundImage:
            `linear-gradient(${value}, ${value}), ` + 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)',
          backgroundSize: '100% 100%, 8px 8px',
        }}
        title={label ?? 'Pick color'}
      />
      {label && <span className="truncate text-xs text-gray-600 dark:text-gray-400">{label}</span>}
      {panel}
    </div>
  );
}
