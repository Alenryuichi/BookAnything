"use client";

import React, { useEffect, useRef } from "react";
import {
  prepareWithSegments,
  layoutNextLine,
  type LayoutCursor,
} from "@chenglou/pretext";

interface DynamicTextLoaderProps {
  text?: string;
  className?: string;
}

export function DynamicTextLoader({
  text = "Scanning Repository...",
  className = "",
}: DynamicTextLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    let orbX = 50;
    let orbY = 50;
    let orbVx = 2;
    let orbVy = 1.5;
    const orbRadius = 24;
    const lineHeight = 24;

    const font = "16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    const preparedText = prepareWithSegments(text, font);

    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    });
    observer.observe(canvas);

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      orbX += orbVx;
      orbY += orbVy;

      if (orbX - orbRadius < 0 || orbX + orbRadius > width) {
        orbVx *= -1;
        orbX = Math.max(orbRadius, Math.min(width - orbRadius, orbX));
      }
      if (orbY - orbRadius < 0 || orbY + orbRadius > height) {
        orbVy *= -1;
        orbY = Math.max(orbRadius, Math.min(height - orbRadius, orbY));
      }

      ctx.clearRect(0, 0, width, height);

      ctx.beginPath();
      ctx.arc(orbX, orbY, orbRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(59, 130, 246, 0.2)";
      ctx.fill();
      ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
      ctx.stroke();

      ctx.font = font;
      ctx.textBaseline = "top";
      ctx.fillStyle = document.documentElement.classList.contains("dark") 
        ? "rgba(255, 255, 255, 0.9)" 
        : "rgba(15, 23, 42, 0.9)";

      let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
      let y = 10;
      
      while (true) {
        let currentMaxWidth = width - 20;
        let startX = 10;
        
        if (y + lineHeight > orbY - orbRadius && y < orbY + orbRadius) {
          if (orbX < width / 2) {
            startX = orbX + orbRadius + 10;
            currentMaxWidth = width - startX - 10;
          } else {
            currentMaxWidth = orbX - orbRadius - 20;
          }
        }
        
        currentMaxWidth = Math.max(1, currentMaxWidth);
        
        const line = layoutNextLine(preparedText, cursor, currentMaxWidth);
        if (!line) break;
        
        ctx.fillText(line.text, startX, y);
        cursor = line.end;
        y += lineHeight;
        if (y > height) break;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    setTimeout(() => {
      animationFrameId = requestAnimationFrame(render);
    }, 50);

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, [text]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-32 rounded-md ${className}`}
      style={{ display: "block" }}
    />
  );
}
