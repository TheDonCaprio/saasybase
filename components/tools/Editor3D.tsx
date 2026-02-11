"use client";
import React, { useEffect, useRef } from 'react';

// Placeholder: later port Three.js logic from legacy app and expose imperative API.
export default function Editor3D() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'w-full h-full bg-neutral-950';
    ref.current.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#222';
      ctx.fillRect(0,0,canvas.width = ref.current.clientWidth, canvas.height = ref.current.clientHeight);
      ctx.fillStyle = '#fff';
      ctx.font = '16px monospace';
      ctx.fillText('3D Editor Placeholder', 20, 40);
    }
    const handle = () => {
      canvas.width = ref.current!.clientWidth;
      canvas.height = ref.current!.clientHeight;
    };
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return <div ref={ref} className="w-full h-full" />;
}
